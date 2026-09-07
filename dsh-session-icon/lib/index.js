/** Host plugin: authenticated per-session sidebar icons. */
import z from "@deepseek-ai/schemastery";
import { createIconState, parseWriteBody, sessionIconDomainSpec, SessionIconError } from "./state.js";

export const name = "session-icon";
export const inject = ["webServer", "connection", "storageDomain"];
export const Config = z.object({
	/** Bumped when the visible client catalog grows so live profiles remount. */
	catalogRev: z.number().default(2),
});
export const SESSION_ICON_API_PATH = "/api/session.icon";
const MAX_BODY_BYTES = 4096;

function sendJson(res, status, value) {
	if (res.destroyed || res.writableEnded) return;
	const body = JSON.stringify(value);
	res.writeHead(status, {
		"content-type": "application/json; charset=utf-8",
		"cache-control": "no-store",
		"x-content-type-options": "nosniff",
		"content-length": Buffer.byteLength(body),
	});
	res.end(body);
}

function readJson(req, signal) {
	if (req.headers["content-type"]?.split(";", 1)[0]?.trim().toLowerCase() !== "application/json") {
		req.resume();
		return Promise.reject(new SessionIconError("Content-Type must be application/json.", 415));
	}
	const declared = Number(req.headers["content-length"]);
	if (Number.isFinite(declared) && declared > MAX_BODY_BYTES) {
		req.resume();
		return Promise.reject(new SessionIconError("Session icon payload is too large.", 413));
	}
	return new Promise((resolve, reject) => {
		let size = 0;
		const chunks = [];
		const cleanup = () => {
			req.off("data", onData);
			req.off("end", onEnd);
			req.off("error", onError);
			signal.removeEventListener("abort", onAbort);
			clearTimeout(timer);
		};
		const fail = (error) => { cleanup(); req.resume(); reject(error); };
		const onData = (chunk) => {
			size += chunk.length;
			if (size > MAX_BODY_BYTES) fail(new SessionIconError("Session icon payload is too large.", 413));
			else chunks.push(chunk);
		};
		const onEnd = () => {
			cleanup();
			try { resolve(JSON.parse(Buffer.concat(chunks).toString("utf8"))); }
			catch { reject(new SessionIconError("Malformed JSON body.")); }
		};
		const onError = () => fail(new SessionIconError("Could not read request body."));
		const onAbort = () => fail(new SessionIconError("Request cancelled.", 499));
		const timer = setTimeout(() => fail(new SessionIconError("Request body timed out.", 408)), 15000);
		timer.unref?.();
		req.on("data", onData);
		req.once("end", onEnd);
		req.once("error", onError);
		signal.addEventListener("abort", onAbort, { once: true });
		if (signal.aborted) onAbort();
	});
}

/** Exported separately to exercise the real HTTP handler without a live DSH server. */
export function createSessionIconHandler(ctx, state, lifetimeSignal) {
	return async (req, res) => {
		const rejection = ctx.connection.requestRejection(req);
		if (rejection !== undefined) {
			sendJson(res, rejection, { error: rejection === 401 ? "Authentication required." : "Forbidden." });
			req.resume();
			return;
		}
		if (req.method !== "GET" && req.method !== "POST") {
			res.setHeader("allow", "GET, POST");
			sendJson(res, 405, { error: "Method not allowed." });
			req.resume();
			return;
		}
		const cancellation = new AbortController();
		const signal = lifetimeSignal === undefined ? cancellation.signal : AbortSignal.any([cancellation.signal, lifetimeSignal]);
		const onAborted = () => cancellation.abort(new Error("Browser request cancelled."));
		const onClose = () => { if (!res.writableEnded) onAborted(); };
		req.once("aborted", onAborted);
		res.once("close", onClose);
		try {
			signal.throwIfAborted();
			if (req.method === "GET") {
				sendJson(res, 200, { icons: state.all() });
				return;
			}
			const written = parseWriteBody(await readJson(req, signal));
			signal.throwIfAborted();
			const icon = await state.set(written.sessionId, written.icon);
			sendJson(res, 200, { sessionId: written.sessionId, icon });
		} catch (error) {
			if (signal.aborted) sendJson(res, 499, { error: "Request cancelled." });
			else if (error instanceof SessionIconError) sendJson(res, error.status, { error: error.message });
			else {
				ctx.logger?.warn("session-icon: preference request failed (internal failure)");
				sendJson(res, 500, { error: "Could not access session icons." });
			}
		} finally {
			req.off("aborted", onAborted);
			res.off("close", onClose);
		}
	};
}

export async function apply(ctx) {
	const domain = await ctx.storageDomain.open(sessionIconDomainSpec);
	let disposeRoute;
	const lifetime = new AbortController();
	const cleanup = async () => {
		lifetime.abort(new Error("Session icon plugin unloaded."));
		disposeRoute?.();
		await domain.close();
	};
	try {
		const state = createIconState(domain.table("icons"));
		disposeRoute = ctx.webServer.register({
			kind: "exact",
			path: SESSION_ICON_API_PATH,
			handler: createSessionIconHandler(ctx, state, lifetime.signal),
		});
		ctx.effect(() => cleanup, "session-icon: cleanup");
	} catch (error) {
		await cleanup();
		throw error;
	}
}
