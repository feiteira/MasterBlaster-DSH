import {
	authorityMatches,
	isLoopbackHostname,
	isTrustedRequest,
	normalizeInput,
	normalizeQuery,
	parseBoundedInt,
	parseFlag,
	relativeFrom,
	resolveExisting,
} from "../lib/policy.js";
import { mkdirSync, mkdtempSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { realpath } from "node:fs/promises";

let failures = 0;
function assert(cond, label) {
	if (cond) console.log("  ok  " + label);
	else {
		failures++;
		console.log("FAIL  " + label);
	}
}

{
	assert(normalizeInput("  a/b  ") === "a/b", "normalize trims");
	assert(normalizeInput("'quoted'") === "quoted", "normalize strips quotes");
	assert(normalizeInput("") === null, "empty rejected by default");
	assert(normalizeInput("", { allowEmpty: true }) === "", "empty allowed when asked");
	assert(normalizeInput(".\0x") === null, "NUL rejected");
	assert(normalizeQuery("hello") === "hello", "query kept");
	assert(normalizeQuery("x".repeat(600)) === null, "overlong query rejected");
	assert(normalizeQuery("a\0b") === null, "NUL query rejected");
}

{
	assert(parseFlag("1") && parseFlag("true") && parseFlag("YES"), "truthy flags");
	assert(!parseFlag("0") && !parseFlag("false") && !parseFlag(null), "falsey flags");
	assert(parseBoundedInt("12", 5, 1, 20) === 12, "int in range");
	assert(parseBoundedInt("99", 5, 1, 20) === 20, "int clamped high");
	assert(parseBoundedInt("nope", 7, 1, 20) === 7, "int fallback");
}

{
	assert(isLoopbackHostname("127.0.0.1"), "127.0.0.1");
	assert(isLoopbackHostname("localhost"), "localhost");
	assert(!isLoopbackHostname("dev.thehumanloop.eu"), "hostname not loopback");
	assert(isTrustedRequest({ host: "127.0.0.1:3080" }, []), "loopback without origin");
	assert(!isTrustedRequest({ host: "127.0.0.1:3080", origin: "http://evil.example" }, []), "cross-origin rejected");
	assert(!isTrustedRequest({ host: "127.0.0.1:3080", "sec-fetch-site": "cross-site" }, []), "cross-site fetch rejected");
	assert(isTrustedRequest({ host: "dev.thehumanloop.eu" }, ["dev.thehumanloop.eu"]), "trusted host accepted");
	assert(
		authorityMatches("dev.thehumanloop.eu", new URL("http://dev.thehumanloop.eu:443")),
		"port-less trusted host matches any port",
	);
}

{
	assert(relativeFrom("/ws", "/ws") === "", "root relative is empty");
	assert(relativeFrom("/ws", "/ws/a/b") === "a/b", "nested relative");
}

{
	const workdir = mkdtempSync(join(tmpdir(), "dsh-fart-pol-"));
	mkdirSync(join(workdir, "sub"));
	writeFileSync(join(workdir, "hello.txt"), "hello");
	symlinkSync("/etc/passwd", join(workdir, "escape"));
	const root = await realpath(workdir);
	const file = await resolveExisting(root, "hello.txt", "file");
	assert(!("error" in file) && file.path.endsWith("hello.txt"), "resolve file");
	const dir = await resolveExisting(root, "sub", "dir");
	assert(!("error" in dir), "resolve dir");
	const esc = await resolveExisting(root, "escape", "file");
	assert("error" in esc, "symlink escape rejected");
	const abs = await resolveExisting(root, "/etc/passwd", "file");
	assert("error" in abs, "absolute escape rejected");
	const parent = await resolveExisting(root, "..", "dir");
	assert("error" in parent, "parent escape rejected");
}

if (failures) {
	console.error(`${failures} failure(s)`);
	process.exit(1);
}
console.log("policy tests passed");
