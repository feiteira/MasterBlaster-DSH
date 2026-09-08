/**
 * dsh-file-explorer — host half.
 *
 * Serves `/api/file.explorer/{list,download,zip,upload,mkdir,delete,rename}`
 * against the addressed session's project directory. Exact/prefix routes win
 * over the connection plugin's `/api` prefix. The endpoint never trusts the
 * browser: it re-resolves the session, re-checks containment, and applies
 * the cross-site fence itself.
 */
import z from "@deepseek-ai/schemastery";
import { randomBytes } from "node:crypto";
import { createReadStream, createWriteStream } from "node:fs";
import { lstat, mkdir, readdir, rename, rm, unlink } from "node:fs/promises";
import { basename, join } from "node:path";
import { pipeline } from "node:stream/promises";
import { Transform } from "node:stream";
import {
	DEFAULT_MAX_LIST_ENTRIES,
	DEFAULT_MAX_UPLOAD_BYTES,
	DEFAULT_MAX_ZIP_BYTES,
	DEFAULT_MAX_ZIP_ENTRIES,
	collectZipEntries,
	contentTypeFor,
	entryType,
	isTrustedRequest,
	isUploadTempName,
	normalizeInput,
	pathLabel,
	relativeFrom,
	resolveDeletable,
	resolveExisting,
	resolveMkdir,
	resolveNewFile,
	resolveRename,
	safeFilename,
	zipArchiveName,
} from "./policy.js";
import { writeZip } from "./zip.js";

/** Stable Cordis plugin name. */
export const name = "file-explorer";

/** Services required before applying (route registration needs the web server). */
export const inject = ["webServer"];

export const Config = z.object({
	/** Non-loopback authorities this deployment serves (same shape as client-connection's trustedHosts). */
	trustedHosts: z.array(String).default([]),
	/** Per-file upload cap in bytes. */
	maxUploadBytes: z.natural().min(1024).max(1024 * 1024 * 1024).default(DEFAULT_MAX_UPLOAD_BYTES),
	/** Directory listing entry cap. */
	maxListEntries: z.natural().min(10).max(50000).default(DEFAULT_MAX_LIST_ENTRIES),
	/** Uncompressed byte cap for a folder zip. */
	maxZipBytes: z.natural().min(1024 * 1024).max(4 * 1024 * 1024 * 1024).default(DEFAULT_MAX_ZIP_BYTES),
	/** Entry cap for a folder zip. */
	maxZipEntries: z.natural().min(10).max(100000).default(DEFAULT_MAX_ZIP_ENTRIES),
});

const ROUTE_PREFIX = "/api/file.explorer";

function headerSafe(message) {
	return String(message ?? "error").replace(/[\r\n]/g, " ").slice(0, 200);
}

function sendError(res, status, message) {
	const body = JSON.stringify({ error: message });
	res.writeHead(status, {
		"content-type": "application/json; charset=utf-8",
		"x-dsh-explorer-error": headerSafe(message),
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

async function handleList(ctx, req, res, url, config) {
	if (req.method !== "GET" && req.method !== "HEAD") {
		sendError(res, 405, "method not allowed");
		return;
	}
	const session = requireSession(ctx, url, res);
	if (session === null) return;
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
	let names;
	try {
		names = await readdir(resolved.path);
	} catch {
		sendError(res, 400, "directory is not accessible");
		return;
	}
	const maxEntries = config?.maxListEntries ?? DEFAULT_MAX_LIST_ENTRIES;
	const entries = [];
	let truncated = false;
	for (const name of names) {
		if (isUploadTempName(name)) continue;
		if (entries.length >= maxEntries) {
			truncated = true;
			break;
		}
		const full = join(resolved.path, name);
		let info;
		try {
			info = await lstat(full);
		} catch {
			continue;
		}
		const type = entryType(info);
		entries.push({
			name,
			type,
			size: type === "file" ? info.size : 0,
			mtime: Math.floor(info.mtimeMs),
		});
	}
	entries.sort((a, b) => {
		const rank = (t) => (t === "dir" ? 0 : t === "symlink" ? 2 : 1);
		const d = rank(a.type) - rank(b.type);
		if (d !== 0) return d;
		return a.name.localeCompare(b.name);
	});
	const root = resolved.root ?? null;
	const rel = root === null ? null : relativeFrom(root, resolved.path);
	const parent = rel === null || rel === "" ? null : rel.includes("/") ? rel.slice(0, rel.lastIndexOf("/")) : "";
	const payload = {
		root,
		path: rel,
		parent,
		abs: resolved.path,
		truncated,
		entries,
	};
	if (req.method === "HEAD") {
		res.writeHead(200, { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" });
		res.end();
		return;
	}
	sendJson(res, 200, payload);
}

async function handleDownload(ctx, req, res, url) {
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
	const filename = safeFilename(basename(resolved.path));
	const headers = {
		"content-type": contentTypeFor(filename),
		"content-disposition": `attachment; filename="${filename}"`,
		"content-length": String(resolved.stat.size),
		"cache-control": "no-store",
	};
	if (req.method === "HEAD") {
		res.writeHead(200, headers);
		res.end();
		return;
	}
	res.writeHead(200, headers);
	const stream = createReadStream(resolved.path);
	stream.on("error", () => {
		try {
			res.destroy();
		} catch {
			/* already destroyed */
		}
	});
	stream.pipe(res);
}

async function handleZip(ctx, req, res, url, config) {
	if (req.method !== "GET" && req.method !== "HEAD") {
		sendError(res, 405, "method not allowed");
		return;
	}
	const session = requireSession(ctx, url, res);
	if (session === null) return;
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
	const archive = zipArchiveName(requested, resolved.root);
	const prefix = archive.endsWith(".zip") ? archive.slice(0, -4) : archive;
	let collected;
	try {
		collected = await collectZipEntries(resolved.path, {
			prefix,
			maxEntries: config?.maxZipEntries ?? DEFAULT_MAX_ZIP_ENTRIES,
			maxBytes: config?.maxZipBytes ?? DEFAULT_MAX_ZIP_BYTES,
		});
	} catch (error) {
		sendError(res, error?.status === 413 ? 413 : 400, error?.message ?? "could not build zip");
		return;
	}
	const headers = {
		"content-type": "application/zip",
		"content-disposition": `attachment; filename="${archive}"`,
		"cache-control": "no-store",
	};
	if (req.method === "HEAD") {
		res.writeHead(200, headers);
		res.end();
		return;
	}
	res.writeHead(200, headers);
	try {
		await writeZip(res, collected.entries);
		res.end();
	} catch (error) {
		if (error?.aborted) return;
		try {
			res.destroy();
		} catch {
			/* already destroyed */
		}
	}
}

/**
 * Stream `req` onto `tmpPath`, enforcing `maxBytes`. Cleans up the temp file
 * on failure. Returns the number of bytes written.
 */
async function receiveUpload(req, tmpPath, maxBytes) {
	let size = 0;
	const limiter = new Transform({
		transform(chunk, _enc, cb) {
			size += chunk.length;
			if (size > maxBytes) {
				cb(Object.assign(new Error("payload too large"), { status: 413 }));
				return;
			}
			cb(null, chunk);
		},
	});
	const out = createWriteStream(tmpPath, { flags: "wx" });
	try {
		await pipeline(req, limiter, out);
		return size;
	} catch (error) {
		try {
			out.destroy();
		} catch {
			/* already destroyed */
		}
		try {
			await unlink(tmpPath);
		} catch {
			/* missing is fine */
		}
		throw error;
	}
}

async function handleUpload(ctx, req, res, url, config) {
	if (req.method !== "POST") {
		sendError(res, 405, "method not allowed");
		return;
	}
	const session = requireSession(ctx, url, res);
	if (session === null) return;
	const dir = normalizeInput(url.searchParams.get("dir") ?? "", { allowEmpty: true });
	if (dir === null) {
		sendError(res, 400, "missing or invalid dir");
		return;
	}
	const name = url.searchParams.get("name") ?? "";
	const overwrite = url.searchParams.get("overwrite") === "1" || url.searchParams.get("overwrite") === "true";
	const maxBytes = config?.maxUploadBytes ?? DEFAULT_MAX_UPLOAD_BYTES;
	const declared = Number(req.headers["content-length"]);
	if (Number.isFinite(declared) && declared > maxBytes) {
		sendError(res, 413, "payload too large");
		req.resume();
		return;
	}
	const target = await resolveNewFile(session.cwd, dir, name);
	if ("error" in target) {
		sendError(res, target.status ?? 400, target.error);
		req.resume();
		return;
	}
	let exists = false;
	try {
		await lstat(target.path);
		exists = true;
	} catch (error) {
		if (error?.code !== "ENOENT") {
			sendError(res, 400, "destination is not accessible");
			req.resume();
			return;
		}
	}
	if (exists && !overwrite) {
		sendError(res, 409, "file already exists");
		req.resume();
		return;
	}
	const tmpPath = join(target.parent, `.dsh-upload-${randomBytes(8).toString("hex")}`);
	let size;
	try {
		size = await receiveUpload(req, tmpPath, maxBytes);
	} catch (error) {
		const status = error?.status === 413 ? 413 : 400;
		sendError(res, status, status === 413 ? "payload too large" : "upload failed");
		return;
	}
	try {
		await rename(tmpPath, target.path);
	} catch {
		try {
			await unlink(tmpPath);
		} catch {
			/* ignore */
		}
		sendError(res, 400, "could not write file");
		return;
	}
	const rel = pathLabel(target.root, target.path);
	sendJson(res, exists ? 200 : 201, { path: rel, size });
}

async function handleMkdir(ctx, req, res, url) {
	if (req.method !== "POST") {
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
	const target = await resolveMkdir(session.cwd, requested);
	if ("error" in target) {
		sendError(res, target.status ?? 400, target.error);
		return;
	}
	try {
		await mkdir(target.path, { recursive: true });
	} catch (error) {
		if (error?.code === "EEXIST") {
			sendError(res, 409, "path already exists");
			return;
		}
		sendError(res, 400, "could not create directory");
		return;
	}
	// Verify the target really exists at the canonical location; a symlink
	// raced between mkdir and realpath is rolled back.
	const verified = await resolveExisting(session.cwd, requested, "dir");
	if ("error" in verified) {
		try {
			await rm(target.path, { recursive: true, force: true });
		} catch {
			/* best-effort */
		}
		sendError(res, 400, verified.error);
		return;
	}
	sendJson(res, 201, { path: pathLabel(verified.root, verified.path) });
}

async function handleDelete(ctx, req, res, url) {
	if (req.method !== "POST") {
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
	const resolved = await resolveDeletable(session.cwd, requested);
	if ("error" in resolved) {
		sendError(res, resolved.status ?? 400, resolved.error);
		return;
	}
	try {
		if (resolved.stat.isDirectory() && !resolved.stat.isSymbolicLink()) {
			await rm(resolved.path, { recursive: true, force: false });
		} else {
			await unlink(resolved.path);
		}
	} catch {
		sendError(res, 400, "could not delete path");
		return;
	}
	sendJson(res, 200, { path: pathLabel(resolved.root, resolved.path), deleted: true });
}

async function handleRename(ctx, req, res, url) {
	if (req.method !== "POST") {
		sendError(res, 405, "method not allowed");
		return;
	}
	const session = requireSession(ctx, url, res);
	if (session === null) return;
	const from = normalizeInput(url.searchParams.get("from") ?? url.searchParams.get("path") ?? "");
	const to = normalizeInput(url.searchParams.get("to") ?? url.searchParams.get("name") ?? "");
	if (from === null || to === null) {
		sendError(res, 400, "missing or invalid from/to");
		return;
	}
	const resolved = await resolveRename(session.cwd, from, to);
	if ("error" in resolved) {
		sendError(res, resolved.status ?? 400, resolved.error);
		return;
	}
	const overwrite = url.searchParams.get("overwrite") === "1" || url.searchParams.get("overwrite") === "true";
	let destExists = false;
	try {
		await lstat(resolved.toPath);
		destExists = true;
	} catch (error) {
		if (error?.code !== "ENOENT") {
			sendError(res, 400, "destination is not accessible");
			return;
		}
	}
	if (destExists && !overwrite) {
		sendError(res, 409, "destination already exists");
		return;
	}
	try {
		if (destExists) {
			const destInfo = await lstat(resolved.toPath);
			const srcIsDir = resolved.stat.isDirectory() && !resolved.stat.isSymbolicLink();
			const destIsDir = destInfo.isDirectory() && !destInfo.isSymbolicLink();
			// Refuse to replace a file with a directory (or vice versa) even on overwrite.
			if (srcIsDir !== destIsDir) {
				sendError(res, 400, "cannot replace a file with a directory");
				return;
			}
			if (destIsDir) {
				await rm(resolved.toPath, { recursive: true, force: false });
			} else {
				await unlink(resolved.toPath);
			}
		}
		await rename(resolved.fromPath, resolved.toPath);
	} catch {
		sendError(res, 400, "could not rename path");
		return;
	}
	sendJson(res, 200, { from: pathLabel(resolved.root, resolved.fromPath), path: pathLabel(resolved.root, resolved.toPath), renamed: true });
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
		if (sub === "/list") return await handleList(ctx, req, res, url, config);
		if (sub === "/download") return await handleDownload(ctx, req, res, url);
		if (sub === "/zip") return await handleZip(ctx, req, res, url, config);
		if (sub === "/upload") return await handleUpload(ctx, req, res, url, config);
		if (sub === "/mkdir") return await handleMkdir(ctx, req, res, url);
		if (sub === "/delete") return await handleDelete(ctx, req, res, url);
		if (sub === "/rename") return await handleRename(ctx, req, res, url);
		sendError(res, 404, "unknown explorer route");
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
 * Cordis plugin body: mount the explorer HTTP prefix.
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
		"file-explorer: /api/file.explorer",
	);
}
