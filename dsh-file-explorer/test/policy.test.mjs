import {
	authorityMatches,
	isLoopbackHostname,
	isTrustedRequest,
	collectZipEntries,
	isAbsolutePath,
	isUploadTempName,
	normalizeInput,
	pathLabel,
	relativeFrom,
	resolveDeletable,
	resolveExisting,
	resolveMkdir,
	resolveNewFile,
	resolveRename,
	sanitizeRelative,
	safeFilename,
	zipArchiveName,
} from "../lib/policy.js";
import { mkdirSync, mkdtempSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
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
	assert(normalizeInput("x".repeat(5000)) === null, "oversize rejected");
}

{
	assert(sanitizeRelative("foo.txt") === "foo.txt", "plain name");
	assert(sanitizeRelative("sub/dir/file.txt") === "sub/dir/file.txt", "nested relative");
	assert(sanitizeRelative("a\\b") === "a/b", "backslash to slash");
	assert(sanitizeRelative("../etc/passwd") === null, "dotdot rejected");
	assert(sanitizeRelative("/abs") === null, "absolute rejected");
	assert(sanitizeRelative("a/../b") === null, "embedded dotdot rejected");
	assert(sanitizeRelative("a/" + "x".repeat(300)) === null, "overlong segment rejected");
	assert(sanitizeRelative("") === null, "empty name rejected");
}

{
	assert(isLoopbackHostname("127.0.0.1"), "127.0.0.1");
	assert(isLoopbackHostname("127.1.2.3"), "127/8");
	assert(isLoopbackHostname("localhost"), "localhost");
	assert(isLoopbackHostname("[::1]"), "[::1]");
	assert(!isLoopbackHostname("8.8.8.8"), "public IP not loopback");
	assert(!isLoopbackHostname("dev.thehumanloop.eu"), "hostname not loopback");
}

{
	assert(isTrustedRequest({ host: "127.0.0.1:3080" }, []), "loopback without origin");
	assert(isTrustedRequest({ host: "127.0.0.1:3080", origin: "http://127.0.0.1:3080" }, []), "same-origin loopback");
	assert(!isTrustedRequest({ host: "127.0.0.1:3080", origin: "http://evil.example" }, []), "cross-origin rejected");
	assert(!isTrustedRequest({ host: "127.0.0.1:3080", "sec-fetch-site": "cross-site" }, []), "cross-site fetch rejected");
	assert(!isTrustedRequest({ host: "dev.thehumanloop.eu" }, []), "untrusted host rejected");
	assert(isTrustedRequest({ host: "dev.thehumanloop.eu" }, ["dev.thehumanloop.eu"]), "trusted host accepted");
	assert(
		authorityMatches("dev.thehumanloop.eu", new URL("http://dev.thehumanloop.eu:443")),
		"port-less trusted host matches any port",
	);
}

{
	assert(safeFilename('a"b\nc') === "a_b_c", "header-safe filename");
	assert(isUploadTempName(".dsh-upload-deadbeefcafebabe"), "temp name detected");
	assert(!isUploadTempName(".hidden"), "regular hidden not temp");
	assert(isAbsolutePath("/etc/passwd"), "absolute posix detected");
	assert(isAbsolutePath("C:\\tmp\\x"), "absolute win detected");
	assert(!isAbsolutePath("../etc"), "dotdot is relative");
	assert(!isAbsolutePath("sub/dir"), "plain relative stays relative");
	assert(relativeFrom("/ws", "/ws") === "", "root relative is empty");
	assert(relativeFrom("/ws", "/ws/a/b") === "a/b", "nested relative");
	assert(pathLabel("/ws", "/ws/a") === "a", "path label inside root");
	assert(pathLabel("/ws", "/etc/passwd") === "/etc/passwd", "path label outside root stays absolute");
	assert(pathLabel(null, "/x/y") === "/x/y", "path label without root is absolute");
}

{
	const root = mkdtempSync(join(tmpdir(), "dsh-fe-pol-"));
	writeFileSync(join(root, "ok.txt"), "hi");
	mkdirSync(join(root, "sub"));
	writeFileSync(join(root, "sub", "nested.txt"), "n");
	symlinkSync("/etc/passwd", join(root, "escape"));
	const rootReal = await realpath(root);
	// A sibling directory OUTSIDE the project root, for file-manager browsing.
	const outside = mkdtempSync(join(tmpdir(), "dsh-fe-pol-out-"));
	const outsideReal = await realpath(outside);
	writeFileSync(join(outside, "out.txt"), "out");
	mkdirSync(join(outside, "outdir"));

	const file = await resolveExisting(root, "ok.txt", "file");
	assert(!("error" in file) && file.path.endsWith("ok.txt"), "resolve file inside root");

	const dir = await resolveExisting(root, "sub", "dir");
	assert(!("error" in dir), "resolve dir inside root");

	const esc = await resolveExisting(root, "../" + "etc/passwd", "file");
	assert("error" in esc && /escape/.test(esc.error), "dotdot escape refused");

	const abs = await resolveExisting(root, join(outside, "out.txt"), "file");
	assert(!("error" in abs) && abs.path === join(outsideReal, "out.txt"), "absolute path outside root is honored");

	const absDir = await resolveExisting(root, outside, "dir");
	assert(!("error" in absDir), "absolute dir outside root lists");

	const absMissing = await resolveExisting(root, join(outside, "nope.txt"), "file");
	assert("error" in absMissing && absMissing.status === 404, "absolute missing is 404");

	const link = await resolveExisting(root, "escape", "file");
	assert("error" in link, "relative symlink escape refused");

	const missing = await resolveExisting(root, "nope.txt", "file");
	assert("error" in missing && missing.status === 404, "missing is 404");

	const notFile = await resolveExisting(root, "sub", "file");
	assert("error" in notFile, "dir is not a file");

	// zip walk still sees the pristine tree (before later renames)
	const zipped = await collectZipEntries(root, { prefix: "proj" });
	const zipNames = zipped.entries.map((e) => e.name);
	assert(zipNames.includes("proj/ok.txt"), "zip walk includes file");
	assert(zipNames.includes("proj/sub/nested.txt"), "zip walk includes nested file");
	assert(!zipNames.some((n) => n.includes("escape") || n.includes("passwd")), "zip walk skips symlink");
	assert(zipArchiveName("src/out", root) === "out.zip", "zip archive name from path");

	const upload = await resolveNewFile(root, "", "fresh.txt");
	assert(!("error" in upload) && upload.path === join(rootReal, "fresh.txt"), "new file in root");

	const nested = await resolveNewFile(root, "", "brand/new.txt");
	assert(!("error" in nested), "nested upload creates parents");

	const badName = await resolveNewFile(root, "", "../x");
	assert("error" in badName, "upload name with dotdot refused");

	const outUpload = await resolveNewFile(root, outside, "dropped.txt");
	assert(!("error" in outUpload) && outUpload.path === join(outsideReal, "dropped.txt"), "upload into absolute outside dir");

	const outNested = await resolveNewFile(root, join(outside, "outdir"), "deep/x.txt");
	assert(!("error" in outNested) && outNested.path === join(outsideReal, "outdir", "deep", "x.txt"), "upload creates parents in outside dir");

	// mkdir (relative bound, absolute anywhere)
	const mkdirRel = await resolveMkdir(root, "made/here");
	assert(!("error" in mkdirRel) && mkdirRel.path === join(rootReal, "made", "here"), "mkdir relative inside root");
	const mkdirAbs = await resolveMkdir(root, join(outside, "made-abs"));
	assert(!("error" in mkdirAbs) && mkdirAbs.path === join(outsideReal, "made-abs"), "mkdir absolute outside root");
	const mkdirEscape = await resolveMkdir(root, "../outside-mk");
	assert("error" in mkdirEscape, "mkdir relative escape refused");
	const mkdirExists = await resolveMkdir(root, "sub");
	assert("error" in mkdirExists && mkdirExists.status === 409, "mkdir existing is 409");

	// rename (relative bound, absolute anywhere)
	const move = await resolveRename(root, "ok.txt", "renamed.txt");
	assert(!("error" in move) && move.toPath.endsWith("renamed.txt"), "rename resolves inside root");
	writeFileSync(join(root, "esc-src.txt"), "e");
	const moveEscape = await resolveRename(root, "esc-src.txt", "../outside.txt");
	assert("error" in moveEscape, "rename escape refused");
	writeFileSync(join(root, "moveout-src.txt"), "m");
	const moveOut = await resolveRename(root, "moveout-src.txt", join(outside, "moved.txt"));
	assert(!("error" in moveOut) && moveOut.toPath === join(outsideReal, "moved.txt"), "rename may move a file outside the root");
	const moveIntoSelf = await resolveRename(root, "sub", "sub/inner.txt");
	assert("error" in moveIntoSelf, "rename dir into itself refused");
	writeFileSync(join(root, "third.txt"), "t");
	const moveMissingParent = await resolveRename(root, "third.txt", "no-such-dir/file.txt");
	assert("error" in moveMissingParent, "rename missing parent refused");

	// destructive guards on absolute input (never actually delete)
	const delRootAbs = await resolveDeletable(root, rootReal);
	assert("error" in delRootAbs && /project directory/.test(delRootAbs.error), "absolute delete of the project root refused");
	const delAncestor = await resolveDeletable(root, dirname(rootReal));
	assert("error" in delAncestor && /contains the open project/.test(delAncestor.error), "absolute delete of an ancestor dir refused");
	const delFsRoot = await resolveDeletable(root, "/");
	assert("error" in delFsRoot && /filesystem root/.test(delFsRoot.error), "absolute delete of filesystem root refused");
	const delOutside = await resolveDeletable(root, join(outside, "out.txt"));
	assert(!("error" in delOutside), "absolute delete of an outside file resolves");
	const moveAncestor = await resolveRename(root, dirname(rootReal), join(outside, "harness"));
	assert("error" in moveAncestor && /contains the open project/.test(moveAncestor.error), "moving an ancestor dir refused");
}

if (failures > 0) {
	console.error(`\n${failures} failure(s)`);
	process.exit(1);
}
console.log("\npolicy tests passed");
