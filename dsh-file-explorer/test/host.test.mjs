import { createServer } from "node:http";
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, symlinkSync, writeFileSync } from "node:fs";
import { realpath } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { apply } from "../lib/index.js";

let route = null;
const fakeCtx = {
	webServer: {
		register(spec) {
			if (spec.path !== "/api/file.explorer") throw new Error(`unexpected path ${spec.path}`);
			if (spec.kind !== "prefix") throw new Error("expected prefix route");
			route = spec;
			return () => {
				route = null;
			};
		},
	},
	effect(callback) {
		return callback();
	},
	get(name) {
		if (name === "sessions") {
			return {
				get(id) {
					if (id === "s1") return { header: { cwd: workdir } };
					return undefined;
				},
			};
		}
		if (name === "webRuntime") return { trustedHosts: ["dev.thehumanloop.eu"] };
		return undefined;
	},
};

const workdir = mkdtempSync(join(tmpdir(), "dsh-fe-host-"));
mkdirSync(join(workdir, "sub"));
writeFileSync(join(workdir, "hello.txt"), "hello-world");
writeFileSync(join(workdir, "sub", "nested.txt"), "nested");
symlinkSync("/etc/passwd", join(workdir, "escape"));
const workdirReal = await realpath(workdir);
// A directory OUTSIDE the session project, for file-manager-style browsing.
const sibling = mkdtempSync(join(tmpdir(), "dsh-fe-host-out-"));
const siblingReal = await realpath(sibling);
writeFileSync(join(sibling, "sib.txt"), "sibling-content");
mkdirSync(join(sibling, "subdir"));

apply(fakeCtx, { trustedHosts: [], maxUploadBytes: 1024, maxListEntries: 100 });
if (route === null) throw new Error("route was not registered");

const server = createServer((req, res) => route.handler(req, res));
await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
const port = server.address().port;
const origin = `http://127.0.0.1:${port}`;

let failures = 0;
function assert(cond, label) {
	if (cond) console.log("  ok  " + label);
	else {
		failures++;
		console.log("FAIL  " + label);
	}
}

async function call(method, path, { body, headers } = {}) {
	const response = await fetch(`${origin}${path}`, {
		method,
		headers: {
			Origin: origin,
			...(body !== undefined ? { "content-type": "application/octet-stream" } : {}),
			...headers,
		},
		body,
	});
	const text = await response.text();
	let json = null;
	try {
		json = JSON.parse(text);
	} catch {
		json = null;
	}
	return { status: response.status, text, json, headers: response.headers };
}

{
	const res = await call("GET", "/api/file.explorer/list?sessionId=s1&path=", {
		headers: { Origin: "http://evil.example" },
	});
	assert(res.status === 403, "cross-origin list rejected");
}

{
	const res = await call("GET", "/api/file.explorer/list?sessionId=missing&path=");
	assert(res.status === 404, "unknown session is 404");
}

{
	const res = await call("GET", "/api/file.explorer/list?sessionId=s1&path=");
	assert(res.status === 200, "list root 200");
	assert(Array.isArray(res.json?.entries), "list returns entries");
	const names = res.json.entries.map((e) => e.name);
	assert(names.includes("hello.txt") && names.includes("sub"), "root listing has file and dir");
	assert(res.json.entries.find((e) => e.name === "sub")?.type === "dir", "sub is a dir");
	assert(res.json.entries.find((e) => e.name === "hello.txt")?.type === "file", "hello.txt is a file");
}

{
	const res = await call("GET", "/api/file.explorer/list?sessionId=s1&path=..%2F..%2Fetc");
	assert(res.status === 400, "list escape rejected");
}

{
	const res = await call("GET", "/api/file.explorer/download?sessionId=s1&path=hello.txt");
	assert(res.status === 200, "download 200");
	assert(res.text === "hello-world", "download body");
	assert(/attachment/.test(res.headers.get("content-disposition") ?? ""), "content-disposition attachment");
}

{
	const res = await call("GET", "/api/file.explorer/download?sessionId=s1&path=escape");
	assert(res.status === 400, "symlink escape download rejected");
}

{
	const res = await call("GET", `/api/file.explorer/download?sessionId=s1&path=${encodeURIComponent(join(sibling, "sib.txt"))}`);
	assert(res.status === 200 && res.text === "sibling-content", "absolute download outside the project is allowed");
}

{
	const res = await call("GET", `/api/file.explorer/list?sessionId=s1&path=${encodeURIComponent(sibling)}`);
	assert(res.status === 200, "list absolute dir outside root");
	assert(res.json?.entries.some((e) => e.name === "sib.txt"), "outside listing has sibling content");
	assert(res.json?.abs === siblingReal, "list reports canonical abs directory");
}

{
	const res = await call("POST", `/api/file.explorer/upload?sessionId=s1&dir=${encodeURIComponent(sibling)}&name=put.txt`, {
		body: "put-outside",
	});
	assert(res.status === 201, "upload into absolute outside dir");
	assert(readFileSync(join(sibling, "put.txt"), "utf8") === "put-outside", "outside upload landed on disk");
}

{
	const res = await call("POST", `/api/file.explorer/mkdir?sessionId=s1&path=${encodeURIComponent(join(sibling, "made"))}`);
	assert(res.status === 201, "mkdir absolute outside dir");
	assert(existsSync(join(sibling, "made")), "outside dir created");
}

{
	writeFileSync(join(sibling, "del.txt"), "bye");
	const res = await call("POST", `/api/file.explorer/delete?sessionId=s1&path=${encodeURIComponent(join(sibling, "del.txt"))}`);
	assert(res.status === 200 && res.json?.deleted === true, "delete absolute outside file");
	assert(!existsSync(join(sibling, "del.txt")), "outside file removed");
}

{
	const res = await call("POST", `/api/file.explorer/delete?sessionId=s1&path=${encodeURIComponent(workdirReal)}`);
	assert(res.status === 400, "absolute delete of the session project dir refused");
	const ancestor = await call("POST", `/api/file.explorer/delete?sessionId=s1&path=${encodeURIComponent(dirname(workdirReal))}`);
	assert(ancestor.status === 400, "absolute delete of an ancestor dir refused");
	const fsroot = await call("POST", "/api/file.explorer/delete?sessionId=s1&path=%2F");
	assert(fsroot.status === 400, "absolute delete of filesystem root refused");
}

{
	writeFileSync(join(sibling, "r.txt"), "rename-out");
	const res = await call("POST", `/api/file.explorer/rename?sessionId=s1&from=${encodeURIComponent(join(sibling, "r.txt"))}&to=${encodeURIComponent(join(sibling, "r2.txt"))}`);
	assert(res.status === 200 && res.json?.renamed === true, "rename absolute outside project");
	assert(readFileSync(join(sibling, "r2.txt"), "utf8") === "rename-out", "outside rename landed");
	const anc = await call("POST", `/api/file.explorer/rename?sessionId=s1&from=${encodeURIComponent(dirname(workdirReal))}&to=${encodeURIComponent(join(sibling, "harness"))}`);
	assert(anc.status === 400, "moving an ancestor of the open project refused");
}

{
	const res = await call("GET", "/api/file.explorer/zip?sessionId=s1&path=hello.txt");
	assert(res.status === 400, "zip of a file is rejected");
}

{
	const response = await fetch(`${origin}/api/file.explorer/zip?sessionId=s1&path=sub`, {
		headers: { Origin: origin },
	});
	assert(response.status === 200, "zip folder 200");
	assert(/attachment; filename="sub.zip"/.test(response.headers.get("content-disposition") ?? ""), "zip filename");
	const buf = Buffer.from(await response.arrayBuffer());
	const py = spawnSync("python3", ["-c", `
import sys, zipfile, io
z = zipfile.ZipFile(io.BytesIO(sys.stdin.buffer.read()))
names = z.namelist()
print("NAMES", ",".join(names))
print("NESTED", z.read("sub/nested.txt").decode())
print("HAS_ESCAPE", any("passwd" in n or n.endswith("escape") for n in names))
`], { input: buf, encoding: "utf8" });
	assert(py.status === 0, "python zipfile opened archive");
	assert(/NAMES.*sub\/nested.txt/.test(py.stdout), "zip contains nested file under folder prefix");
	assert(/NESTED nested/.test(py.stdout), "zip nested content");
	assert(/HAS_ESCAPE False/.test(py.stdout), "zip does not follow or include escape symlink");
}

{
	const res = await call("POST", "/api/file.explorer/upload?sessionId=s1&dir=&name=uploaded.txt", {
		body: "from-test",
	});
	assert(res.status === 201, "upload 201");
	assert(readFileSync(join(workdir, "uploaded.txt"), "utf8") === "from-test", "uploaded bytes on disk");
}

{
	const res = await call("POST", "/api/file.explorer/upload?sessionId=s1&dir=&name=uploaded.txt", {
		body: "again",
	});
	assert(res.status === 409, "upload conflict without overwrite");
}

{
	const res = await call("POST", "/api/file.explorer/upload?sessionId=s1&dir=&name=uploaded.txt&overwrite=1", {
		body: "overwritten",
	});
	assert(res.status === 200, "overwrite 200");
	assert(readFileSync(join(workdir, "uploaded.txt"), "utf8") === "overwritten", "overwrite landed");
}

{
	const res = await call("POST", "/api/file.explorer/upload?sessionId=s1&dir=&name=nested%2Fdrop.txt", {
		body: "nested-drop",
	});
	assert(res.status === 201, "nested drop upload 201");
	assert(readFileSync(join(workdir, "nested", "drop.txt"), "utf8") === "nested-drop", "nested parents created");
}

{
	const res = await call("POST", "/api/file.explorer/upload?sessionId=s1&dir=&name=..%2Foutside.txt", {
		body: "nope",
	});
	assert(res.status === 400, "upload name escape rejected");
}

{
	const big = "x".repeat(2048);
	const res = await call("POST", "/api/file.explorer/upload?sessionId=s1&dir=&name=big.txt", { body: big });
	assert(res.status === 413, "oversize upload rejected");
}

{
	const res = await call("POST", "/api/file.explorer/mkdir?sessionId=s1&path=brand-new");
	assert(res.status === 201, "mkdir 201");
	const listed = await call("GET", "/api/file.explorer/list?sessionId=s1&path=brand-new");
	assert(listed.status === 200 && listed.json.entries.length === 0, "new dir is empty");
}

{
	const res = await call("POST", "/api/file.explorer/mkdir?sessionId=s1&path=brand-new");
	assert(res.status === 409, "mkdir exists is 409");
}

{
	const res = await call("POST", "/api/file.explorer/delete?sessionId=s1&path=uploaded.txt");
	assert(res.status === 200 && res.json?.deleted === true, "delete file");
}

{
	writeFileSync(join(workdir, "keep.txt"), "keep-me");
	symlinkSync(join(workdir, "keep.txt"), join(workdir, "link-keep.txt"));
	const res = await call("POST", "/api/file.explorer/delete?sessionId=s1&path=link-keep.txt");
	assert(res.status === 200, "delete symlink 200");
	assert(readFileSync(join(workdir, "keep.txt"), "utf8") === "keep-me", "symlink delete does not follow target");
}

{
	const res = await call("POST", "/api/file.explorer/delete?sessionId=s1&path=");
	assert(res.status === 400, "refuse deleting project root");
}

{
	writeFileSync(join(workdir, "to-rename.txt"), "rename-me");
	const res = await call("POST", "/api/file.explorer/rename?sessionId=s1&from=to-rename.txt&to=renamed.txt");
	assert(res.status === 200 && res.json?.renamed === true, "rename file");
	assert(readFileSync(join(workdir, "renamed.txt"), "utf8") === "rename-me", "renamed bytes on disk");
}

{
	const res = await call("POST", "/api/file.explorer/rename?sessionId=s1&from=renamed.txt&to=sub");
	assert(res.status === 409 || res.status === 400, "rename onto existing dir without overwrite refused");
}

{
	const res = await call("POST", "/api/file.explorer/rename?sessionId=s1&from=renamed.txt&to=sub&overwrite=1");
	assert(res.status === 400, "rename file onto dir fails even with overwrite");
}

{
	const res = await call("POST", "/api/file.explorer/rename?sessionId=s1&from=sub&to=sub%2Fnested-inner");
	assert(res.status === 400, "rename dir into itself refused");
}

{
	const res = await call("POST", "/api/file.explorer/rename?sessionId=s1&from=sub&to=..%2Foutside.txt");
	assert(res.status === 400, "rename escape refused");
}

{
	const res = await call("GET", "/api/file.explorer/nope?sessionId=s1");
	assert(res.status === 404, "unknown subroute 404");
}

server.close();
if (failures > 0) {
	console.error(`\n${failures} failure(s)`);
	process.exit(1);
}
console.log("\nhost tests passed");
