/**
 * dsh-fart-search — host half.
 *
 * Serves `/api/fart.search/{query,snippet}` against the addressed session's
 * project directory. Exact/prefix routes win over the connection plugin's
 * `/api` prefix. The endpoint never trusts the browser: it re-resolves the
 * session, re-checks containment, and applies the cross-site fence itself.
 */
import z from "@deepseek-ai/schemastery";
import { basename } from "node:path";
import {
	ABSOLUTE_MAX_MATCHES,
	DEFAULT_MAX_MATCHES,
	DEFAULT_SNIPPET_CONTEXT,
	DEFAULT_TIMEOUT_MS,
	isTrustedRequest,
	normalizeInput,
	normalizeQuery,
	parseBoundedInt,
	parseFlag,
	relativeFrom,
	resolveExisting,
} from "./policy.js";
import {
	buildContentArgv,
	buildFilesArgv,
	classifyRipgrepError,
	filterContained,
	parseFilesList,
	parseJsonMatches,
	readSnippet,
	relativizeMatches,
	runRipgrep,
} from "./search.js";

/** Stable Cordis plugin name. */
export const name = "fart-search";

/** Services required before applying (route registration needs the web server). */
export const inject = ["webServer"];

export const Config = z.object({
	/** Non-loopback authorities this deployment serves (same shape as client-connection's trustedHosts). */
	trustedHosts: z.array(String).default([]),
	/** Inline match cap. */
	maxMatches: z.natural().min(10).max(ABSOLUTE_MAX_MATCHES).default(DEFAULT_MAX_MATCHES),
	/** Cooperative search timeout in milliseconds. */
	timeoutMs: z.natural().min(1000).max(60_000).default(DEFAULT_TIMEOUT_MS),
});

const ROUTE_PREFIX = "/api/fart.search";

function headerSafe(message) {
	return String(message ?? "error").replace(/[\r\n]/g, " ").slice(0, 200);
}

function sendError(res, status, message) {
	const body = JSON.stringify({ error: message });
	res.writeHead(status, {
		"content-type": "application/json; charset=utf-8",
		"x-dsh-fart-error": headerSafe(message),
		"cache-control": "no-store",
		"content-length": Buffer.byteLength(body),
	});
	res.end(body);
}

function sendJson(res, status, payload) {
	const body = JSON.stringify(payload);
	res.writeHead(status, {
		"content-type": "application/json; charset=utf-8",
		"cache-control": "no-store",
		"content-length": Buffer.byteLength(body),
	});
	res.end(body);
}

function sessionCwdOf(ctx, sessionId) {
	const sessions = ctx.get("sessions");
	if (sessions === undefined) return undefined;
	const session = sessions.get(sessionId);
	return session?.header?.cwd;
}

function trustedHostsOf(ctx, config) {
	if (Array.isArray(config?.trustedHosts) && config.trustedHosts.length > 0) return config.trustedHosts;
	return ctx.get("webRuntime")?.trustedHosts ?? [];
}

function parseUrl(req) {
	return new URL(req.url ?? "/", "http://dsh.internal");
}

function requireSession(ctx, url, res) {
	const sessionId = url.searchParams.get("sessionId");
	if (typeof sessionId !== "string" || sessionId === "") {
		sendError(res, 400, "missing or invalid sessionId");
		return null;
	}
	const cwd = sessionCwdOf(ctx, sessionId);
	if (typeof cwd !== "string" || cwd === "") {
		sendError(res, 404, "session not found");
		return null;
	}
	return { sessionId, cwd };
}

async function handleQuery(ctx, req, res, url, config) {
	if (req.method !== "GET" && req.method !== "HEAD") {
		sendError(res, 405, "method not allowed");
		return;
	}
	const session = requireSession(ctx, url, res);
	if (session === null) return;
	const query = normalizeQuery(url.searchParams.get("q") ?? url.searchParams.get("query") ?? "");
	if (query === null || query === "") {
		sendError(res, 400, "missing or invalid query");
		return;
	}
	const requested = normalizeInput(url.searchParams.get("path") ?? "", { allowEmpty: true });
	if (requested === null) {
		sendError(res, 400, "missing or invalid path");
		return;
	}
	const resolved = await resolveExisting(session.cwd, requested, "dir");
	if ("error" in resolved) {
		sendError(res, resolved.status ?? 400, resolved.error);
		return;
	}
	const include = normalizeQuery(url.searchParams.get("include") ?? "", { allowEmpty: true });
	if (include === null) {
		sendError(res, 400, "invalid include glob");
		return;
	}
	const kind = (url.searchParams.get("kind") ?? "content").trim().toLowerCase();
	if (kind !== "content" && kind !== "files") {
		sendError(res, 400, "kind must be content or files");
		return;
	}
	const maxMatches = parseBoundedInt(
		url.searchParams.get("max"),
		config?.maxMatches ?? DEFAULT_MAX_MATCHES,
		1,
		ABSOLUTE_MAX_MATCHES,
	);
	const input = {
		query,
		regex: parseFlag(url.searchParams.get("regex")),
		caseSensitive: parseFlag(url.searchParams.get("case")),
		word: parseFlag(url.searchParams.get("word")),
		hidden: parseFlag(url.searchParams.get("hidden")),
		allFiles: parseFlag(url.searchParams.get("all")),
		include: include === "" ? undefined : include,
		searchPath: ".",
	};
	const argv = kind === "files" ? buildFilesArgv(input) : buildContentArgv(input);
	const result = await runRipgrep(argv, {
		cwd: resolved.path,
		timeoutMs: config?.timeoutMs ?? DEFAULT_TIMEOUT_MS,
	});
	const failure = classifyRipgrepError(result);
	if (failure) {
		sendError(res, failure.status, failure.error);
		return;
	}
	const parsed = kind === "files"
		? parseFilesList(result.stdout, maxMatches)
		: parseJsonMatches(result.stdout, maxMatches);
	const matches = relativizeMatches(resolved.root, filterContained(parsed.matches)).map((match) => {
		const prefix = relativeFrom(resolved.root, resolved.path);
		if (!prefix) return match;
		return { ...match, path: match.path ? `${prefix}/${match.path}` : prefix };
	});
	const payload = {
		kind,
		query,
		path: relativeFrom(resolved.root, resolved.path) ?? "",
		truncated: parsed.truncated,
		count: matches.length,
		matches,
	};
	if (req.method === "HEAD") {
		res.writeHead(200, { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" });
		res.end();
		return;
	}
	sendJson(res, 200, payload);
}

async function handleSnippet(ctx, req, res, url) {
	if (req.method !== "GET" && req.method !== "HEAD") {
		sendError(res, 405, "method not allowed");
		return;
	}
	const session = requireSession(ctx, url, res);
	if (session === null) return;
	const requested = normalizeInput(url.searchParams.get("path") ?? "");
	if (requested === null) {
		sendError(res, 400, "missing or invalid path");
		return;
	}
	const resolved = await resolveExisting(session.cwd, requested, "file");
	if ("error" in resolved) {
		sendError(res, resolved.status ?? 400, resolved.error);
		return;
	}
	const line = parseBoundedInt(url.searchParams.get("line"), 1, 1, 10_000_000);
	const context = parseBoundedInt(url.searchParams.get("context"), DEFAULT_SNIPPET_CONTEXT, 0, 20);
	const snippet = await readSnippet(resolved.path, line, context);
	if (snippet && "error" in snippet) {
		sendError(res, snippet.status ?? 400, snippet.error);
		return;
	}
	const payload = {
		path: relativeFrom(resolved.root, resolved.path) ?? requested,
		name: basename(resolved.path),
		line: snippet.line,
		start: snippet.start,
		lines: snippet.lines,
	};
	if (req.method === "HEAD") {
		res.writeHead(200, { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" });
		res.end();
		return;
	}
	sendJson(res, 200, payload);
}

async function handle(ctx, req, res, config) {
	if (!isTrustedRequest(req.headers, trustedHostsOf(ctx, config))) {
		sendError(res, 403, "forbidden");
		return;
	}
	let url;
	try {
		url = parseUrl(req);
	} catch {
		sendError(res, 400, "invalid url");
		return;
	}
	const sub = url.pathname.slice(ROUTE_PREFIX.length);
	try {
		if (sub === "/query") return await handleQuery(ctx, req, res, url, config);
		if (sub === "/snippet") return await handleSnippet(ctx, req, res, url);
		sendError(res, 404, "unknown search route");
	} catch {
		if (!res.headersSent) sendError(res, 500, "internal error");
		else {
			try {
				res.destroy();
			} catch {
				/* already destroyed */
			}
		}
	}
}

/**
 * Cordis plugin body: mount the FART search HTTP prefix.
 * @param ctx - host plugin context.
 * @param config - resolved plugin config (schema defaults applied).
 */
export function apply(ctx, config) {
	ctx.effect(
		() => ctx.webServer.register({
			kind: "prefix",
			path: ROUTE_PREFIX,
			handler: (req, res) => handle(ctx, req, res, config ?? {}),
		}),
		"fart-search: /api/fart.search",
	);
}
