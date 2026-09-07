/**
 * dsh-fart-search — path admission and the web trust fence (pure helpers).
 *
 * A target must canonicalize (realpath) inside the session's project
 * directory. Absolute paths are accepted only when they still satisfy
 * containment. The HTTP routes apply the same fence as the main /api
 * bridge: loopback or configured trusted authority, never a cross-site
 * request, and an Origin (when present) must match the Host.
 * @module
 */

import { resolve, sep } from "node:path";
import { realpath, stat } from "node:fs/promises";

/** Hard cap on the raw path input length (also bounds query-param parsing). */
export const MAX_PATH_INPUT_LENGTH = 4096;

/** Hard cap on a search query / glob. */
export const MAX_QUERY_LENGTH = 512;

/** Default inline match cap. */
export const DEFAULT_MAX_MATCHES = 250;

/** Absolute ceiling on matches parsed from one search. */
export const ABSOLUTE_MAX_MATCHES = 1000;

/** Default cooperative search timeout. */
export const DEFAULT_TIMEOUT_MS = 15_000;

/** Default cap on raw ripgrep stdout. */
export const DEFAULT_MAX_RAW_BYTES = 8 * 1024 * 1024;

/** Default per-file size cap passed to ripgrep. */
export const DEFAULT_MAX_FILE_BYTES = 1_048_576;

/** Default snippet context lines on each side of a hit. */
export const DEFAULT_SNIPPET_CONTEXT = 4;

/**
 * Normalize one user-supplied path token: trim, reject NUL/oversize, and
 * strip one pair of surrounding quotes. Empty is allowed when `allowEmpty`
 * is set (search the project root).
 * @param raw - command / query input.
 * @param options.allowEmpty - treat blank as `""` rather than `null`.
 * @returns the normalized path, or `null` when the input is unusable.
 */
export function normalizeInput(raw, options = {}) {
	const allowEmpty = options.allowEmpty === true;
	if (raw == null) return allowEmpty ? "" : null;
	if (typeof raw !== "string") return null;
	let path = raw.trim();
	if (path.length > MAX_PATH_INPUT_LENGTH) return null;
	if (path.includes("\0")) return null;
	if (path.length >= 2 && ((path[0] === '"' && path.at(-1) === '"') || (path[0] === "'" && path.at(-1) === "'"))) {
		path = path.slice(1, -1).trim();
	}
	if (path === "" || path === ".") return allowEmpty ? "" : null;
	return path;
}

/**
 * Normalize a search query or include glob.
 * @param raw - query-string value.
 * @param options.allowEmpty - treat blank as `""`.
 * @param options.maxLength - override {@link MAX_QUERY_LENGTH}.
 * @returns the normalized string, or `null` when unusable.
 */
export function normalizeQuery(raw, options = {}) {
	const allowEmpty = options.allowEmpty === true;
	const maxLength = options.maxLength ?? MAX_QUERY_LENGTH;
	if (raw == null) return allowEmpty ? "" : null;
	if (typeof raw !== "string") return null;
	if (raw.includes("\0")) return null;
	if (raw.length > maxLength) return null;
	return raw;
}

/**
 * Resolve an existing path against a project root with strict containment.
 * Both the root and the target are canonicalized with `realpath`, so symlink
 * escapes are refused.
 * @param root - the session project directory (absolute, existing).
 * @param requested - normalized path (relative or absolute); `""` means root.
 * @param expect - `"file"` | `"dir"` | `"any"` (default `"any"`).
 * @returns `{ path, stat, root }` on success, or `{ error, status }` on refusal.
 */
export async function resolveExisting(root, requested, expect = "any") {
	let rootReal;
	try {
		rootReal = await realpath(root);
	} catch {
		return { error: "project directory is not accessible", status: 404 };
	}
	const absolute = requested === "" || requested === "." ? rootReal : resolve(rootReal, requested);
	if (absolute !== rootReal && !absolute.startsWith(`${rootReal}${sep}`)) {
		return { error: "path escapes the project directory", status: 400 };
	}
	let targetReal;
	try {
		targetReal = await realpath(absolute);
	} catch (error) {
		if (error?.code === "ENOENT") return { error: "no such file or directory", status: 404 };
		return { error: "path is not accessible", status: 400 };
	}
	if (targetReal !== rootReal && !targetReal.startsWith(`${rootReal}${sep}`)) {
		return { error: "path escapes the project directory", status: 400 };
	}
	let info;
	try {
		info = await stat(targetReal);
	} catch {
		return { error: "path is not accessible", status: 400 };
	}
	if (expect === "file" && !info.isFile()) return { error: "not a regular file", status: 400 };
	if (expect === "dir" && !info.isDirectory()) return { error: "not a directory", status: 400 };
	return { path: targetReal, root: rootReal, stat: info };
}

/**
 * Relative POSIX-ish path of `target` inside `root` (both already realpath'd).
 * @param root - canonical project directory.
 * @param target - canonical path inside root.
 * @returns `""` for the root itself, otherwise a `/`-separated relative path.
 */
export function relativeFrom(root, target) {
	if (target === root) return "";
	const prefix = `${root}${sep}`;
	if (!target.startsWith(prefix)) return null;
	return target.slice(prefix.length).split(sep).join("/");
}

/**
 * Is a hostname a loopback literal (IPv4 127/8, IPv6 ::1, or `localhost`)?
 * @param hostname - parsed Host header hostname.
 */
export function isLoopbackHostname(hostname) {
	if (hostname === "localhost" || hostname === "[::1]" || hostname === "::1") return true;
	const parts = hostname.split(".");
	return parts.length === 4 && parts[0] === "127" && parts.every((part) => /^\d{1,3}$/.test(part) && Number(part) <= 255);
}

function parseAuthority(authority) {
	try {
		return new URL(`http://${authority}`);
	} catch {
		return undefined;
	}
}

/**
 * Whether one authority string matches a `trustedHosts` entry: an entry with
 * an explicit port matches that exact authority; a port-less entry matches the
 * hostname on any port.
 */
export function authorityMatches(entry, hostUrl) {
	const entryUrl = parseAuthority(entry);
	if (entryUrl === undefined) return false;
	const entryPort = entryUrl.port !== "" ? entryUrl.port : new URL(`https://${entry}`).port;
	const canonical = entryPort === "" ? entryUrl.hostname : `${entryUrl.hostname}:${entryPort}`;
	return canonical === entryUrl.hostname ? entryUrl.hostname === hostUrl.hostname : entryUrl.host === hostUrl.host;
}

/**
 * The web trust fence for FART search routes.
 * @param headers - node:http IncomingMessage headers.
 * @param trustedHosts - non-loopback authorities this deployment serves.
 */
export function isTrustedRequest(headers, trustedHosts) {
	const host = headers.host;
	if (typeof host !== "string" || host === "") return false;
	const hostUrl = parseAuthority(host);
	if (hostUrl === undefined) return false;
	if (!isLoopbackHostname(hostUrl.hostname) && !(trustedHosts ?? []).some((entry) => authorityMatches(entry, hostUrl))) {
		return false;
	}
	if (headers["sec-fetch-site"] === "cross-site") return false;
	const origin = headers.origin;
	if (origin === undefined) return true;
	try {
		return new URL(origin).host === hostUrl.host;
	} catch {
		return false;
	}
}

/**
 * Parse a boolean query flag (`1`/`true`/`yes`/`on`).
 * @param raw - query-string value.
 */
export function parseFlag(raw) {
	if (raw == null) return false;
	const value = String(raw).trim().toLowerCase();
	return value === "1" || value === "true" || value === "yes" || value === "on";
}

/**
 * Parse a bounded integer query flag.
 * @param raw - query-string value.
 * @param fallback - default when missing/invalid.
 * @param min - inclusive minimum.
 * @param max - inclusive maximum.
 */
export function parseBoundedInt(raw, fallback, min, max) {
	if (raw == null || raw === "") return fallback;
	const n = Number(raw);
	if (!Number.isInteger(n)) return fallback;
	if (n < min) return min;
	if (n > max) return max;
	return n;
}
