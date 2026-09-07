/** Host plugin: authenticated per-chat preferences plus a scoped executor tool. */
import { createExecutorState, executorDomainSpec, ExecutorError, parseSelectionRecord, assertTopLevelSession } from "./state.js";
import { createExecutorRuntime } from "./runtime.js";

export const name = "executor-model";
export const inject = [
	"webServer", "connection", "storageDomain", "sessionController",
	"agents", "tools", "systemPrompt", "llm", "subagents",
];
export const EXECUTOR_API_PATH = "/api/executor.model";
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

function sessionIdFrom(req) {
	let url;
	try { url = new URL(req.url ?? "/", "http://dsh.internal"); }
	catch { throw new ExecutorError("Invalid request URL."); }
	const values = url.searchParams.getAll("sessionId");
	if (values.length !== 1 || !/^[a-zA-Z0-9_-]{1,160}$/u.test(values[0])) throw new ExecutorError("Missing or invalid sessionId.");
	return values[0];
}

function readJson(req, signal) {
	if (req.headers["content-type"]?.split(";", 1)[0]?.trim().toLowerCase() !== "application/json") {
		req.resume();
		return Promise.reject(new ExecutorError("Content-Type must be application/json.", 415));
	}
	const declared = Number(req.headers["content-length"]);
	if (Number.isFinite(declared) && declared > MAX_BODY_BYTES) {
		req.resume();
		return Promise.reject(new ExecutorError("Executor selection payload is too large.", 413));
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
			if (size > MAX_BODY_BYTES) fail(new ExecutorError("Executor selection payload is too large.", 413));
			else chunks.push(chunk);
		};
		const onEnd = () => {
			cleanup();
			try { resolve(JSON.parse(Buffer.concat(chunks).toString("utf8"))); }
			catch { reject(new ExecutorError("Malformed JSON body.")); }
		};
		const onError = () => fail(new ExecutorError("Could not read request body."));
		const onAbort = () => fail(new ExecutorError("Request cancelled.", 499));
		const timer = setTimeout(() => fail(new ExecutorError("Request body timed out.", 408)), 15000);
		timer.unref?.();
		req.on("data", onData);
		req.once("end", onEnd);
		req.once("error", onError);
		signal.addEventListener("abort", onAbort, { once: true });
		if (signal.aborted) onAbort();
	});
}

function sessionFailure(error) {
	if (error instanceof ExecutorError) return error;
	if (error?.code === "session/not-found" || error?.code === "SESSION_QUERY_SESSION_NOT_FOUND" || error?.constructor?.name === "ApiSessionNotFound") {
		return new ExecutorError("Chat not found.", 404);
	}
	if (error?.code === "session/agent-busy") return new ExecutorError("Executor selection is only available for ordinary top-level chats.", 403);
	return error;
}

/** Exported separately to exercise the real HTTP handler without a live DSH server. */
export function createExecutorHandler(ctx, state, lifetimeSignal) {
	return async (req, res) => {
		// Exact Web routes bypass /api's prefix: explicitly reuse BOTH the
		// existing Host/Origin fence and authority-bound signed-cookie auth.
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
			const sessionId = sessionIdFrom(req);
			if (req.method === "GET") {
				// Cold-safe inspection: opening the selector does not start a turn
				// or resurrect a subagent under ordinary Session ownership.
				const inspection = await ctx.sessionController.inspect(sessionId, signal);
				signal.throwIfAborted();
				assertTopLevelSession({ header: inspection.meta });
				sendJson(res, 200, { selection: state.read(sessionId) });
				return;
			}
			const { selection } = parseSelectionRecord(await readJson(req, signal));
			signal.throwIfAborted();
			const result = await ctx.sessionController.resolveAgent(sessionId);
			signal.throwIfAborted();
			if (result.error !== undefined) throw result.error;
			const agent = result.agent;
			assertTopLevelSession(agent.session);
			const selected = await state.set(sessionId, selection, {
				signal,
				beforeCommit: () => {
					if (ctx.agents.get(sessionId) !== agent) throw new ExecutorError("Chat changed while validating the executor; retry selection.", 409);
					assertTopLevelSession(agent.session);
				},
			});
			sendJson(res, 200, selected);
		} catch (error) {
			const failure = sessionFailure(error);
			if (signal.aborted) sendJson(res, 499, { error: "Request cancelled." });
			else if (failure instanceof ExecutorError) sendJson(res, failure.status, { error: failure.message });
			else {
				ctx.logger?.warn("executor-model: preference request failed (internal failure)");
				sendJson(res, 500, { error: "Could not access executor settings. No change to the main model was requested." });
			}
		} finally {
			req.off("aborted", onAborted);
			res.off("close", onClose);
		}
	};
}

export async function apply(ctx) {
	const domain = await ctx.storageDomain.open(executorDomainSpec);
	let runtime;
	let state;
	let disposeRoute;
	const lifetime = new AbortController();
	const cleanup = async () => {
		lifetime.abort(new Error("Executor plugin unloaded."));
		disposeRoute?.();
		try { await runtime?.close(); }
		finally { try { await state?.close(); } finally { await domain.close(); } }
	};
	try {
		state = createExecutorState(domain.table("selections"), ctx.llm);
		runtime = createExecutorRuntime(ctx, state);
		disposeRoute = ctx.webServer.register({
			kind: "exact",
			path: EXECUTOR_API_PATH,
			handler: createExecutorHandler(ctx, state, lifetime.signal),
		});
		// Cordis disposes newest effects first. Abort and drain BEFORE it
		// automatically removes the pre-publication child-hardening listeners.
		ctx.effect(() => cleanup, "executor-model: quiescent cleanup");
	} catch (error) {
		await cleanup();
		throw error;
	}
}
