/**
 * dsh-terminal-web — host half.
 *
 * Serves one bidirectional WebSocket endpoint (/terminal.ws) that owns a
 * real PTY shell (node-pty) started in the requested workspace directory.
 * The browser client opens one socket per terminal session; the socket
 * lifecycle IS the session lifecycle (closing the socket kills the shell).
 *
 * The endpoint sits outside the /api prefix, so it implements its own copy
 * of the browser-trust fence used by client-connection (DNS-rebinding +
 * cross-site defense): only loopback / configured trusted-host authorities
 * with a same-origin browser marker may upgrade.
 */
import z from "@deepseek-ai/schemastery";
import { randomUUID } from "node:crypto";
import { createRequire } from "node:module";
import { statSync } from "node:fs";
import WebSocket, { WebSocketServer } from "ws";

const require = createRequire(import.meta.url);
const pty = require("node-pty");

/** Stable Cordis plugin name. */
export const name = "terminal-web";

/** Services required before applying (route registration needs the web server). */
export const inject = ["webServer"];

export const Config = z.object({
	/** Non-loopback authorities this deployment serves (same shape as client-connection's trustedHosts). */
	trustedHosts: z.array(String).default([]),
	/** Shell binary to launch; defaults to $SHELL, then /bin/bash (powershell.exe on Windows). */
	shell: z.string().default(""),
	/** Live PTY session cap per process. */
	maxSessions: z.natural().min(1).max(64).default(8),
	/** Per input-frame byte cap (flood guard; larger pastes should be split by the client). */
	maxInputBytes: z.natural().min(1024).max(1024 * 1024).default(64 * 1024)
});

// ── browser-trust fence (mirrors client-connection's api-request-trust) ──

function header(headers, name) {
	if (headers instanceof Headers) return headers.get(name) ?? void 0;
	const value = headers[name];
	return typeof value === "string" ? value : void 0;
}

function isLoopbackHostname(hostname) {
	if (hostname === "localhost" || hostname === "[::1]") return true;
	const parts = hostname.split(".");
	return parts.length === 4 && parts[0] === "127" && parts.every((part) => /^\d{1,3}$/.test(part) && Number(part) <= 255);
}

function parseAuthority(authority) {
	try {
		return new URL(`http://${authority}`);
	} catch {
		return void 0;
	}
}

function canonicalAuthority(entry, entryUrl) {
	const port = entryUrl.port !== "" ? entryUrl.port : new URL(`https://${entry}`).port;
	return port === "" ? entryUrl.hostname : `${entryUrl.hostname}:${port}`;
}

function isTrustedAuthority(hostUrl, trustedHosts) {
	return trustedHosts.some((entry) => {
		const entryUrl = parseAuthority(entry);
		if (entryUrl === void 0) return false;
		return canonicalAuthority(entry, entryUrl) === entryUrl.hostname ? entryUrl.hostname === hostUrl.hostname : entryUrl.host === hostUrl.host;
	});
}

function isTrustedApiRequest(request, trustedHosts) {
	const host = header(request.headers, "host");
	if (host === void 0) return false;
	const hostUrl = parseAuthority(host);
	if (hostUrl === void 0) return false;
	if (!isLoopbackHostname(hostUrl.hostname) && !isTrustedAuthority(hostUrl, trustedHosts)) return false;
	if (header(request.headers, "sec-fetch-site") === "cross-site") return false;
	const origin = header(request.headers, "origin");
	if (origin === void 0) return true;
	try {
		return new URL(origin).host === hostUrl.host;
	} catch {
		return false;
	}
}

function rejectWebSocketUpgrade(socket) {
	socket.end([
		"HTTP/1.1 403 Forbidden",
		"Connection: close",
		"Content-Type: text/plain; charset=utf-8",
		"Content-Length: 9",
		"",
		"forbidden"
	].join("\r\n"));
}

// ── session helpers ──

/** Per-frame input cap fallback when config is absent (tests, older configs). */
const FALLBACK_MAX_INPUT_BYTES = 64 * 1024;

function resolveShell(shellConfig) {
	if (typeof shellConfig === "string" && shellConfig.length > 0) return shellConfig;
	if (typeof process.env.SHELL === "string" && process.env.SHELL.length > 0) return process.env.SHELL;
	return process.platform === "win32" ? "powershell.exe" : "/bin/bash";
}

/** Validate a client-supplied cwd: absolute, short, NUL-free, existing directory. Falls back to the server cwd. */
function resolveCwd(raw) {
	if (typeof raw === "string" && raw.length > 0 && raw.length < 4096 && raw.startsWith("/") && !raw.includes("\0")) {
		try {
			if (statSync(raw).isDirectory()) return raw;
		} catch {
			// fall through to the default
		}
	}
	return process.cwd();
}

function parseQuery(rawUrl) {
	const params = new URL(rawUrl, "http://localhost").searchParams;
	const cols = Number.parseInt(params.get("cols") ?? "", 10);
	const rows = Number.parseInt(params.get("rows") ?? "", 10);
	return {
		cwd: params.get("cwd") ?? "",
		cols: Number.isFinite(cols) && cols >= 2 ? Math.min(cols, 500) : 80,
		rows: Number.isFinite(rows) && rows >= 2 ? Math.min(rows, 200) : 24
	};
}

function sendFrame(socket, frame) {
	if (socket.readyState !== WebSocket.OPEN) return;
	try {
		socket.send(JSON.stringify(frame));
	} catch {
		// socket dying mid-send; the close handler owns teardown
	}
}

/**
 * Cordis plugin body: mount the /terminal.ws upgrade route and own session
 * cleanup for the plugin's lifetime.
 * @param ctx - host plugin context.
 * @param config - resolved plugin config (schema defaults applied).
 */
export function apply(ctx, config) {
	const trustedHosts = config?.trustedHosts ?? [];
	const maxSessions = config?.maxSessions ?? 8;
	const maxInputBytes = config?.maxInputBytes ?? FALLBACK_MAX_INPUT_BYTES;
	const shell = resolveShell(config?.shell ?? "");
	const wss = new WebSocketServer({ noServer: true });
	/** Live sessions by id; per-plugin instance so HMR dispose cannot strand the shared map. */
	const sessions = new Map();

	const handleUpgrade = (req, socket, head) => {
		if (!isTrustedApiRequest(req, trustedHosts)) {
			rejectWebSocketUpgrade(socket);
			return;
		}
		let params;
		try {
			params = parseQuery(req.url ?? "");
		} catch {
			rejectWebSocketUpgrade(socket);
			return;
		}
		if (sessions.size >= maxSessions) {
			rejectWebSocketUpgrade(socket);
			return;
		}
		wss.handleUpgrade(req, socket, head, (ws) => {
			const id = randomUUID();
			const cwd = resolveCwd(params.cwd);
			let proc;
			try {
				proc = pty.spawn(shell, [], {
					name: "xterm-256color",
					cols: params.cols,
					rows: params.rows,
					cwd,
					env: {
						...process.env,
						TERM: "xterm-256color",
						COLORTERM: "truecolor"
					}
				});
			} catch (error) {
				ws.close(1011, `failed to spawn ${shell}`);
				return;
			}
			const session = { id, proc, ws, cwd, closed: false };
			sessions.set(id, session);

			proc.onData((data) => {
				if (!session.closed) sendFrame(ws, { type: "output", data });
			});
			proc.onExit(({ exitCode, signal }) => {
				if (session.closed) return;
				session.closed = true;
				sessions.delete(id);
				sendFrame(ws, { type: "exit", code: exitCode, signal: signal ?? void 0 });
				if (ws.readyState === WebSocket.OPEN) ws.close();
			});

			ws.on("message", (raw) => {
				if (session.closed) return;
				let frame;
				try {
					frame = JSON.parse(String(raw));
				} catch {
					return;
				}
				if (frame?.type === "input" && typeof frame.data === "string" && frame.data.length > 0) {
					// Flood guard: oversized frames are dropped (client splits large pastes).
					if (Buffer.byteLength(frame.data) > maxInputBytes) return;
					proc.write(frame.data);
				} else if (frame?.type === "resize") {
					const cols = Number(frame.cols);
					const rows = Number(frame.rows);
					if (Number.isFinite(cols) && Number.isFinite(rows) && cols >= 2 && rows >= 2) {
						try {
							proc.resize(Math.min(cols, 500), Math.min(rows, 200));
						} catch {
							// resizing a dying PTY is a no-op
						}
					}
				}
			});
			ws.on("close", () => {
				if (session.closed) return;
				session.closed = true;
				sessions.delete(id);
				try {
					proc.kill();
				} catch {
					// already gone
				}
			});
			ws.on("error", () => {
				// close handler owns teardown
			});
		});
	};

	ctx.effect(() => ctx.webServer.registerUpgrade({
		path: "/terminal.ws",
		handler: handleUpgrade
	}), "terminal-web: /terminal.ws WebSocket");

	ctx.effect(() => () => {
		for (const session of sessions.values()) {
			try {
				session.proc.kill();
			} catch {
				// already gone
			}
		}
		sessions.clear();
		wss.close();
	}, "terminal-web: dispose");
}
