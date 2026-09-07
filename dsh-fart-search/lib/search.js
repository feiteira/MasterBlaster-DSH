/**
 * dsh-fart-search — ripgrep argv, JSON parse, and spawn helper.
 *
 * Every user-controlled value is a plain argv element (`--flag=value` or
 * behind `--`). `--no-config` is always prepended so a host ripgrep config
 * cannot inject `--pre`.
 * @module
 */

import { spawn } from "node:child_process";
import { createRequire } from "node:module";
import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import {
	DEFAULT_MAX_FILE_BYTES,
	DEFAULT_MAX_MATCHES,
	DEFAULT_MAX_RAW_BYTES,
	DEFAULT_TIMEOUT_MS,
	relativeFrom,
} from "./policy.js";

const DSH_PKG = "/opt/node/lib/node_modules/@deepseek-ai/dsh/package.json";

const DEFAULT_EXCLUDES = ["!.git", "!node_modules", "!.verification", "!.upgrade", "!dist", "!build"];
const GIT_ONLY_EXCLUDES = ["!.git"];

/**
 * Strip a leading `./` and normalize slashes so UI paths are workdir-relative.
 * @param path - one path as ripgrep printed it.
 */
export function normalizeSearchPath(path) {
	let value = String(path ?? "").replace(/\\/g, "/");
	while (value.startsWith("./")) value = value.slice(2);
	return value;
}

/**
 * Escape a substring so it is literal inside a ripgrep glob.
 * @param value - untrusted filename fragment.
 */
export function globEscape(value) {
	return String(value).replace(/[\\*?[\]{}!]/g, "\\$&");
}

/**
 * Default exclude globs. `allFiles` keeps only `.git`.
 * @param allFiles - include node_modules / build artifacts.
 */
export function excludeGlobs(allFiles) {
	return allFiles ? GIT_ONLY_EXCLUDES.slice() : DEFAULT_EXCLUDES.slice();
}

/**
 * Build the ripgrep argv for a content search (excluding the binary and `--no-config`).
 * @param input - validated search input.
 */
export function buildContentArgv(input) {
	const parts = [
		"--json",
		"--no-follow",
		`--max-filesize=${input.maxFileBytes ?? DEFAULT_MAX_FILE_BYTES}`,
		"--max-columns=400",
		"--max-columns-preview",
	];
	if (!input.caseSensitive) parts.push("-i");
	if (input.word) parts.push("-w");
	if (!input.regex) parts.push("-F");
	parts.push(`--regexp=${input.query}`);
	if (input.hidden) parts.push("--hidden");
	if (input.allFiles) parts.push("--no-ignore");
	for (const glob of excludeGlobs(input.allFiles)) parts.push(`--glob=${glob}`);
	if (input.include) parts.push(`--glob=${input.include}`);
	parts.push("--", input.searchPath ?? ".");
	return parts;
}

/**
 * Build the ripgrep argv for a filename search.
 * @param input - validated search input.
 */
export function buildFilesArgv(input) {
	const parts = ["--files", "--no-follow", "--color=never"];
	if (input.hidden) parts.push("--hidden");
	if (input.allFiles) parts.push("--no-ignore");
	for (const glob of excludeGlobs(input.allFiles)) parts.push(`--glob=${glob}`);
	if (input.include) parts.push(`--glob=${input.include}`);
	parts.push(`--glob=*${globEscape(input.query)}*`);
	parts.push("--", input.searchPath ?? ".");
	return parts;
}

/**
 * Parse one `rg --json` NDJSON stream into match objects.
 * @param stdout - complete stdout text.
 * @param maxMatches - stop after this many matches (still reports truncated).
 */
export function parseJsonMatches(stdout, maxMatches = DEFAULT_MAX_MATCHES) {
	const matches = [];
	let truncated = false;
	if (!stdout) return { matches, truncated };
	const lines = stdout.split("\n");
	for (const line of lines) {
		if (line.trim() === "") continue;
		let parsed;
		try {
			parsed = JSON.parse(line);
		} catch {
			continue;
		}
		if (parsed?.type !== "match" || typeof parsed.data !== "object" || parsed.data === null) continue;
		const data = parsed.data;
		const pathText = typeof data.path === "object" && data.path !== null ? data.path.text : undefined;
		if (typeof pathText !== "string" || pathText === "") continue;
		if (typeof data.line_number !== "number") continue;
		let text = "";
		if (typeof data.lines === "object" && data.lines !== null) {
			if (typeof data.lines.text === "string") text = data.lines.text.replace(/\r?\n$/, "");
			else if (typeof data.lines.bytes === "string") text = "(line is not valid UTF-8)";
		}
		const sub = Array.isArray(data.submatches) && data.submatches[0] && typeof data.submatches[0].start === "number"
			? data.submatches[0].start
			: 0;
		if (matches.length >= maxMatches) {
			truncated = true;
			break;
		}
		matches.push({
			path: normalizeSearchPath(pathText),
			line: data.line_number,
			column: sub + 1,
			text,
		});
	}
	return { matches, truncated };
}

/**
 * Parse `rg --files` newline-delimited paths.
 * @param stdout - complete stdout text.
 * @param maxMatches - stop after this many paths.
 */
export function parseFilesList(stdout, maxMatches = DEFAULT_MAX_MATCHES) {
	const matches = [];
	let truncated = false;
	if (!stdout) return { matches, truncated };
	for (const line of stdout.split("\n")) {
		const path = normalizeSearchPath(line.trim());
		if (path === "") continue;
		if (matches.length >= maxMatches) {
			truncated = true;
			break;
		}
		matches.push({ path, line: 1, column: 1, text: "" });
	}
	return { matches, truncated };
}

/**
 * Drop matches whose path would leave the project root (paranoia after rg).
 * @param matches - parsed matches with workdir-relative paths.
 */
export function filterContained(matches) {
	return matches.filter((match) => {
		if (typeof match.path !== "string" || match.path === "") return false;
		if (match.path.startsWith("/") || /^[a-zA-Z]:[\\/]/.test(match.path)) return false;
		const parts = match.path.split("/");
		return !parts.includes("..");
	});
}

let rgPathPromise;

/**
 * Packaged ripgrep path, or `rg` on PATH as a last resort.
 * @returns absolute path or the `rg` command name.
 */
export function resolveRgPath() {
	rgPathPromise ??= Promise.resolve().then(() => {
		if (process.env.DSH_RIPGREP && existsSync(process.env.DSH_RIPGREP)) return process.env.DSH_RIPGREP;
		const bases = [];
		if (existsSync(DSH_PKG)) bases.push(DSH_PKG);
		bases.push(import.meta.url);
		for (const base of bases) {
			try {
				const req = createRequire(base);
				const rgPath = req("@vscode/ripgrep").rgPath;
				if (typeof rgPath === "string" && existsSync(rgPath)) return rgPath;
			} catch {
				/* try next */
			}
		}
		return "rg";
	});
	return rgPathPromise;
}

/**
 * Spawn ripgrep with a plain argv vector.
 * @param argv - arguments after the binary (must already include `--no-config` or it is prepended).
 * @param options.cwd - search root.
 * @param options.timeoutMs - kill after this budget.
 * @param options.maxBytes - abort if stdout exceeds this.
 * @returns `{ stdout, stderr, code, timedOut, overflow }`
 */
export async function runRipgrep(argv, options = {}) {
	const rgPath = options.rgPath ?? await resolveRgPath();
	const cwd = options.cwd;
	const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
	const maxBytes = options.maxRawBytes ?? DEFAULT_MAX_RAW_BYTES;
	const args = argv[0] === "--no-config" ? argv : ["--no-config", ...argv];
	const env = { ...process.env };
	delete env.RIPGREP_CONFIG_PATH;
	return new Promise((resolve, reject) => {
		let child;
		try {
			child = spawn(rgPath, args, {
				cwd,
				env,
				stdio: ["ignore", "pipe", "pipe"],
			});
		} catch (error) {
			reject(error);
			return;
		}
		const stdoutChunks = [];
		const stderrChunks = [];
		let stdoutBytes = 0;
		let overflow = false;
		let timedOut = false;
		const timer = setTimeout(() => {
			timedOut = true;
			try {
				child.kill("SIGTERM");
			} catch {
				/* already gone */
			}
			setTimeout(() => {
				try {
					child.kill("SIGKILL");
				} catch {
					/* already gone */
				}
			}, 1000).unref?.();
		}, timeoutMs);
		child.stdout.on("data", (chunk) => {
			stdoutBytes += chunk.length;
			if (stdoutBytes > maxBytes) {
				overflow = true;
				try {
					child.kill("SIGTERM");
				} catch {
					/* already gone */
				}
				return;
			}
			stdoutChunks.push(chunk);
		});
		child.stderr.on("data", (chunk) => {
			if (stderrChunks.length < 32) stderrChunks.push(chunk);
		});
		child.on("error", (error) => {
			clearTimeout(timer);
			reject(error);
		});
		child.on("close", (code) => {
			clearTimeout(timer);
			resolve({
				stdout: Buffer.concat(stdoutChunks).toString("utf8"),
				stderr: Buffer.concat(stderrChunks).toString("utf8").slice(0, 8000),
				code: code ?? 1,
				timedOut,
				overflow,
			});
		});
	});
}

/**
 * Classify a ripgrep failure into an HTTP-ish error.
 * @param result - {@link runRipgrep} result.
 */
export function classifyRipgrepError(result) {
	if (result.timedOut) return { error: "search timed out", status: 504 };
	if (result.overflow) return { error: "search produced too much output", status: 413 };
	const stderr = result.stderr ?? "";
	if (/regex parse error|error parsing glob|invalid range/i.test(stderr)) {
		return { error: "invalid search pattern", status: 400 };
	}
	if (result.code !== 0 && result.code !== 1) {
		const detail = stderr.trim().split("\n")[0] || "ripgrep failed";
		return { error: detail.slice(0, 200), status: 400 };
	}
	return null;
}

/**
 * Read a bounded snippet around a 1-based line number.
 * @param filePath - canonical file path.
 * @param line - 1-based line.
 * @param context - lines on each side.
 * @param maxBytes - refuse files larger than this.
 */
export async function readSnippet(filePath, line, context, maxBytes = DEFAULT_MAX_FILE_BYTES) {
	const buf = await readFile(filePath);
	if (buf.length > maxBytes) {
		return { error: "file too large to preview", status: 413 };
	}
	const text = buf.toString("utf8");
	const lines = text.split("\n");
	if (lines.length > 0 && lines[lines.length - 1] === "") lines.pop();
	const target = Math.max(1, Math.min(line, Math.max(lines.length, 1)));
	const before = Math.max(0, context);
	const start = Math.max(1, target - before);
	const end = Math.min(lines.length, target + before);
	const out = [];
	for (let n = start; n <= end; n++) {
		let row = lines[n - 1] ?? "";
		if (row.length > 400) row = `${row.slice(0, 400)}…`;
		out.push({ n, text: row });
	}
	return { line: target, start, lines: out };
}

/**
 * Relativize match paths against the canonical project root. Absolute paths
 * that still sit inside the root are rewritten; anything else is dropped.
 * @param root - canonical project directory.
 * @param matches - parsed matches.
 */
export function relativizeMatches(root, matches) {
	const out = [];
	for (const match of matches) {
		if (!match.path.includes("/") && !match.path.includes("\\") && !match.path.startsWith("/")) {
			out.push(match);
			continue;
		}
		if (match.path.startsWith("/")) {
			const rel = relativeFrom(root, match.path);
			if (rel === null) continue;
			out.push({ ...match, path: rel });
			continue;
		}
		if (filterContained([match]).length === 0) continue;
		out.push(match);
	}
	return out;
}
