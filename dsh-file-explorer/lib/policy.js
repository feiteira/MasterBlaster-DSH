/**
 * dsh-file-explorer — path admission and the web trust fence (pure helpers).
 *
 * A target must canonicalize (realpath) inside the session's project
 * directory. Absolute paths are accepted only when they still satisfy
 * containment. The HTTP routes apply the same fence as the main /api
 * bridge: loopback or configured trusted authority, never a cross-site
 * request, and an Origin (when present) must match the Host.
 * @module
 */

import { basename, dirname, join, resolve, sep } from "node:path";
import { realpath, stat, lstat, mkdir, readdir } from "node:fs/promises";

/** Hard cap on the raw path input length (also bounds query-param parsing). */
export const MAX_PATH_INPUT_LENGTH = 4096;

/** Per-segment filename cap (POSIX NAME_MAX). */
export const MAX_SEGMENT_LENGTH = 255;

/** Default per-file upload cap. */
export const DEFAULT_MAX_UPLOAD_BYTES = 100 * 1024 * 1024;

/** Default listing cap. */
export const DEFAULT_MAX_LIST_ENTRIES = 5000;

/** Default uncompressed cap for a folder zip. */
export const DEFAULT_MAX_ZIP_BYTES = 512 * 1024 * 1024;

/** Default entry cap for a folder zip. */
export const DEFAULT_MAX_ZIP_ENTRIES = 10_000;

/**
 * Normalize one user-supplied path token: trim, reject NUL/oversize, and
 * strip one pair of surrounding quotes. Empty is allowed when `allowEmpty`
 * is set (directory listing of the project root).
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
 * Split a relative upload name into safe path segments (no `..`, no absolute,
 * no empty/`.` segments after filtering, each segment ≤ NAME_MAX).
 * @param rel - a file name or relative path using `/` or `\`.
 * @returns the joined relative path, or `null` when the name is unusable.
 */
export function sanitizeRelative(rel) {
	if (typeof rel !== "string") return null;
	const trimmed = rel.trim();
	if (trimmed === "" || trimmed.length > MAX_PATH_INPUT_LENGTH || trimmed.includes("\0")) return null;
	if (trimmed.startsWith("/") || /^[a-zA-Z]:[\\/]/.test(trimmed)) return null;
	const parts = trimmed.replace(/\\/g, "/").split("/").filter((part) => part !== "" && part !== ".");
	if (parts.length === 0) return null;
	for (const part of parts) {
		if (part === ".." || part === "." || part.includes("\0")) return null;
		if (part.length > MAX_SEGMENT_LENGTH) return null;
	}
	return parts.join("/");
}

/**
 * Resolve an existing path against a project root with strict containment.
 * Both the root and the target are canonicalized with `realpath`, so symlink
 * escapes are refused.
 * @param root - the session project directory (absolute, existing).
 * @param requested - normalized path (relative or absolute); `""` means root.
 * @param expect - `"file"` | `"dir"` | `"any"` (default `"any"`).
 * @returns `{ path, stat }` on success, or `{ error, status }` on refusal.
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
 * Resolve a not-yet-existing file path for upload: the parent directory must
 * already exist inside the project root; intermediate segments of `name` may
 * be created. The final file path is not required to exist.
 * @param root - session project directory.
 * @param dir - destination directory (relative or absolute, `""` = root).
 * @param name - sanitized relative file name (may contain `/` for nested drop).
 * @returns `{ path, parent, root }` or `{ error, status }`.
 */
export async function resolveNewFile(root, dir, name) {
	const relative = sanitizeRelative(name);
	if (relative === null) return { error: "invalid file name", status: 400 };
	const parentResolved = await resolveExisting(root, dir, "dir");
	if ("error" in parentResolved) return parentResolved;
	const dest = resolve(parentResolved.path, relative);
	if (dest !== parentResolved.root && !dest.startsWith(`${parentResolved.root}${sep}`)) {
		return { error: "path escapes the project directory", status: 400 };
	}
	if (dest === parentResolved.root) return { error: "invalid file name", status: 400 };
	const parentDir = dirname(dest);
	if (parentDir !== parentResolved.path) {
		if (parentDir !== parentResolved.root && !parentDir.startsWith(`${parentResolved.root}${sep}`)) {
			return { error: "path escapes the project directory", status: 400 };
		}
		try {
			await mkdir(parentDir, { recursive: true });
		} catch {
			return { error: "could not create parent directory", status: 400 };
		}
		// Re-check containment after mkdir (in case of a race / symlink).
		let parentReal;
		try {
			parentReal = await realpath(parentDir);
		} catch {
			return { error: "parent directory is not accessible", status: 400 };
		}
		if (parentReal !== parentResolved.root && !parentReal.startsWith(`${parentResolved.root}${sep}`)) {
			return { error: "path escapes the project directory", status: 400 };
		}
	}
	return { path: dest, parent: dirname(dest), root: parentResolved.root };
}

/**
 * Resolve a mkdir target: the new directory must not exist, and its parent
 * must stay inside the project root. Intermediate parents are created.
 * @param root - session project directory.
 * @param requested - directory path to create.
 * @returns `{ path, root }` or `{ error, status }`.
 */
export async function resolveMkdir(root, requested) {
	if (requested === "" || requested === ".") {
		return { error: "directory already exists", status: 409 };
	}
	let rootReal;
	try {
		rootReal = await realpath(root);
	} catch {
		return { error: "project directory is not accessible", status: 404 };
	}
	const absolute = resolve(rootReal, requested);
	if (absolute !== rootReal && !absolute.startsWith(`${rootReal}${sep}`)) {
		return { error: "path escapes the project directory", status: 400 };
	}
	try {
		await realpath(absolute);
		return { error: "path already exists", status: 409 };
	} catch (error) {
		if (error?.code !== "ENOENT") return { error: "path is not accessible", status: 400 };
	}
	return { path: absolute, root: rootReal };
}

/**
 * Resolve a delete target without following the leaf symlink: the parent is
 * realpath'd (so the leaf is inside the project directory) and the last
 * component is lstat'd. Deleting `link -> elsewhere` therefore removes the
 * link, not the target.
 * @param root - session project directory.
 * @param requested - path to delete (must not be the project root).
 * @returns `{ path, root, stat }` or `{ error, status }`.
 */
export async function resolveDeletable(root, requested) {
	if (requested === "" || requested === ".") {
		return { error: "refusing to delete the project directory", status: 400 };
	}
	let rootReal;
	try {
		rootReal = await realpath(root);
	} catch {
		return { error: "project directory is not accessible", status: 404 };
	}
	const absolute = resolve(rootReal, requested);
	if (absolute === rootReal) {
		return { error: "refusing to delete the project directory", status: 400 };
	}
	if (!absolute.startsWith(`${rootReal}${sep}`)) {
		return { error: "path escapes the project directory", status: 400 };
	}
	const parent = dirname(absolute);
	let parentReal;
	try {
		parentReal = await realpath(parent);
	} catch (error) {
		if (error?.code === "ENOENT") return { error: "no such file or directory", status: 404 };
		return { error: "path is not accessible", status: 400 };
	}
	if (parentReal !== rootReal && !parentReal.startsWith(`${rootReal}${sep}`)) {
		return { error: "path escapes the project directory", status: 400 };
	}
	const leaf = join(parentReal, basename(absolute));
	let info;
	try {
		info = await lstat(leaf);
	} catch (error) {
		if (error?.code === "ENOENT") return { error: "no such file or directory", status: 404 };
		return { error: "path is not accessible", status: 400 };
	}
	return { path: leaf, root: rootReal, stat: info };
}

/**
 * Resolve a rename/move target: `from` must exist (leaf symlink renamed, not
 * followed) and `to` must stay inside the project root with an existing
 * parent directory. Moving a directory into itself is refused.
 * @param root - session project directory.
 * @param from - existing source path (relative or absolute-inside-root).
 * @param to - destination path (relative or absolute-inside-root).
 * @returns `{ fromPath, toPath, root, stat }` or `{ error, status }`.
 */
export async function resolveRename(root, from, to) {
	const src = await resolveDeletable(root, from);
	if ("error" in src) return src;
	if (typeof to !== "string" || to.trim() === "" || to === "." || to.includes("\0") || to.length > MAX_PATH_INPUT_LENGTH) {
		return { error: "missing or invalid destination", status: 400 };
	}
	const destAbsolute = resolve(src.root, to.trim());
	if (destAbsolute === src.root) {
		return { error: "refusing to overwrite the project directory", status: 400 };
	}
	if (!destAbsolute.startsWith(`${src.root}${sep}`)) {
		return { error: "path escapes the project directory", status: 400 };
	}
	// Refuse moving a directory into itself (a/b -> a/b/c).
	if (destAbsolute === src.path || destAbsolute.startsWith(`${src.path}${sep}`)) {
		if (!src.stat.isSymbolicLink()) {
			try {
				const realSrc = await realpath(src.path);
				if (destAbsolute === realSrc || destAbsolute.startsWith(`${realSrc}${sep}`)) {
					return { error: "cannot move a directory into itself", status: 400 };
				}
			} catch {
				return { error: "cannot move a directory into itself", status: 400 };
			}
		} else if (destAbsolute === src.path || destAbsolute.startsWith(`${src.path}${sep}`)) {
			return { error: "cannot move a directory into itself", status: 400 };
		}
	}
	const destParent = dirname(destAbsolute);
	let destParentReal;
	try {
		destParentReal = await realpath(destParent);
	} catch (error) {
		if (error?.code === "ENOENT") return { error: "destination directory does not exist", status: 404 };
		return { error: "destination is not accessible", status: 400 };
	}
	if (destParentReal !== src.root && !destParentReal.startsWith(`${src.root}${sep}`)) {
		return { error: "path escapes the project directory", status: 400 };
	}
	return { fromPath: src.path, toPath: join(destParentReal, basename(destAbsolute)), root: src.root, stat: src.stat };
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
 * The web trust fence for explorer routes.
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

/** Content type for one downloaded filename (attachment semantics). */
const CONTENT_TYPES = new Map([
	[".txt", "text/plain; charset=utf-8"],
	[".md", "text/markdown; charset=utf-8"],
	[".markdown", "text/markdown; charset=utf-8"],
	[".log", "text/plain; charset=utf-8"],
	[".json", "application/json; charset=utf-8"],
	[".jsonl", "application/x-ndjson; charset=utf-8"],
	[".yaml", "text/yaml; charset=utf-8"],
	[".yml", "text/yaml; charset=utf-8"],
	[".csv", "text/csv; charset=utf-8"],
	[".tsv", "text/tab-separated-values; charset=utf-8"],
	[".xml", "application/xml; charset=utf-8"],
	[".html", "text/html; charset=utf-8"],
	[".htm", "text/html; charset=utf-8"],
	[".css", "text/css; charset=utf-8"],
	[".js", "text/javascript; charset=utf-8"],
	[".mjs", "text/javascript; charset=utf-8"],
	[".cjs", "text/javascript; charset=utf-8"],
	[".ts", "text/plain; charset=utf-8"],
	[".tsx", "text/plain; charset=utf-8"],
	[".jsx", "text/plain; charset=utf-8"],
	[".py", "text/x-python; charset=utf-8"],
	[".sh", "text/x-shellscript; charset=utf-8"],
	[".pdf", "application/pdf"],
	[".png", "image/png"],
	[".jpg", "image/jpeg"],
	[".jpeg", "image/jpeg"],
	[".gif", "image/gif"],
	[".webp", "image/webp"],
	[".svg", "image/svg+xml"],
	[".zip", "application/zip"],
	[".gz", "application/gzip"],
	[".tgz", "application/gzip"],
	[".tar", "application/x-tar"],
	[".docx", "application/vnd.openxmlformats-officedocument.wordprocessingml.document"],
	[".xlsx", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"],
	[".pptx", "application/vnd.openxmlformats-officedocument.presentationml.presentation"],
]);

/**
 * Content type for one filename (lowercased extension lookup).
 * @param filename - the download filename (basename).
 */
export function contentTypeFor(filename) {
	const dot = filename.lastIndexOf(".");
	if (dot === -1) return "application/octet-stream";
	return CONTENT_TYPES.get(filename.slice(dot).toLowerCase()) ?? "application/octet-stream";
}

/**
 * One header-safe download filename: strips CR/LF and quotes.
 * @param filename - the raw basename.
 */
export function safeFilename(filename) {
	return String(filename).replace(/[\r\n"]/g, "_") || "download";
}

/**
 * Classify a dirent for the listing (lstat, so symlinks stay symlinks).
 * @param info - fs.Stats from lstat.
 * @returns `"dir"` | `"file"` | `"symlink"` | `"other"`.
 */
export function entryType(info) {
	if (info.isSymbolicLink()) return "symlink";
	if (info.isDirectory()) return "dir";
	if (info.isFile()) return "file";
	return "other";
}

/**
 * Hide in-flight upload temp files from listings.
 * @param name - a directory entry name.
 */
export function isUploadTempName(name) {
	return /^\.dsh-upload-[0-9a-f]{8,}$/.test(name);
}

/**
 * Walk a contained directory for zip contents. Symlinks are skipped (not
 * followed), so a link to `/etc/passwd` cannot leak into the archive.
 * Entry names are relative to `dirPath`, optionally prefixed with `prefix`
 * (typically the folder basename, so the zip extracts as one top folder).
 * @param dirPath - canonical directory inside the project root.
 * @param options.prefix - top-level folder name inside the zip (`""` = contents at zip root).
 * @param options.maxEntries - entry cap.
 * @param options.maxBytes - uncompressed byte cap.
 * @returns `{ entries, bytes }` or throws `{ status, message }`.
 */
export async function collectZipEntries(dirPath, options = {}) {
	const maxEntries = options.maxEntries ?? DEFAULT_MAX_ZIP_ENTRIES;
	const maxBytes = options.maxBytes ?? DEFAULT_MAX_ZIP_BYTES;
	const prefix = typeof options.prefix === "string" ? options.prefix.replace(/\\/g, "/").replace(/^\/+|\/+$/g, "") : "";
	const entries = [];
	let bytes = 0;

	async function walk(dir, rel) {
		let names;
		try {
			names = await readdir(dir);
		} catch {
			return;
		}
		let sawChild = false;
		for (const name of names) {
			if (isUploadTempName(name)) continue;
			const full = join(dir, name);
			let info;
			try {
				info = await lstat(full);
			} catch {
				continue;
			}
			if (info.isSymbolicLink()) continue;
			const childRel = rel ? `${rel}/${name}` : name;
			if (info.isDirectory()) {
				sawChild = true;
				await walk(full, childRel);
			} else if (info.isFile()) {
				if (entries.length >= maxEntries) {
					throw Object.assign(new Error("zip has too many entries"), { status: 413 });
				}
				bytes += info.size;
				if (bytes > maxBytes) {
					throw Object.assign(new Error("zip too large"), { status: 413 });
				}
				sawChild = true;
				entries.push({ type: "file", path: full, name: childRel, size: info.size, mtime: info.mtime });
			}
		}
		if (!sawChild && rel) {
			entries.push({ type: "dir", name: `${rel}/`, mtime: new Date() });
		}
	}

	await walk(dirPath, prefix);
	if (entries.length === 0 && prefix) {
		entries.push({ type: "dir", name: `${prefix}/`, mtime: new Date() });
	}
	return { entries, bytes };
}

/**
 * Download filename for a zipped folder (`folder.zip`, or `workspace.zip` at root).
 * @param requested - relative path of the folder (`""` = project root).
 * @param rootPath - canonical project directory, used for the root archive name.
 */
export function zipArchiveName(requested, rootPath) {
	if (requested) {
		const parts = String(requested).replace(/\\/g, "/").split("/").filter(Boolean);
		const last = parts[parts.length - 1];
		if (last) return safeFilename(`${last}.zip`);
	}
	const base = basename(String(rootPath ?? "").replace(/[\\/]+$/, "")) || "workspace";
	return safeFilename(`${base}.zip`);
}
