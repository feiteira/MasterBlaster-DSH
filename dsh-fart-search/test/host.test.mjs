import { createServer } from "node:http";
import { mkdirSync, mkdtempSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { apply } from "../lib/index.js";

let route = null;
const fakeCtx = {
	webServer: {
		register(spec) {
			if (spec.path !== "/api/fart.search") throw new Error(`unexpected path ${spec.path}`);
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

const workdir = mkdtempSync(join(tmpdir(), "dsh-fart-host-"));
mkdirSync(join(workdir, "sub"));
writeFileSync(join(workdir, "hello.txt"), "alpha fart-search beta\nsecond line\n");
writeFileSync(join(workdir, "sub", "nested.js"), "export const nested = 'fart-search';\n");
writeFileSync(join(workdir, "other.md"), "# no hit here\n");
symlinkSync("/etc/passwd", join(workdir, "escape"));

apply(fakeCtx, { trustedHosts: [], maxMatches: 100, timeoutMs: 8000 });
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

async function call(method, path, { headers } = {}) {
	const response = await fetch(`${origin}${path}`, {
		method,
		headers: {
			Origin: origin,
			...headers,
		},
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
	const res = await call("GET", "/api/fart.search/query?sessionId=s1&q=fart", {
		headers: { Origin: "http://evil.example" },
	});
	assert(res.status === 403, "cross-origin query rejected");
}

{
	const res = await call("GET", "/api/fart.search/query?sessionId=missing&q=fart");
	assert(res.status === 404, "unknown session is 404");
}

{
	const res = await call("GET", "/api/fart.search/query?sessionId=s1&q=");
	assert(res.status === 400, "empty query rejected");
}

{
	const res = await call("GET", "/api/fart.search/query?sessionId=s1&q=fart-search");
	assert(res.status === 200, "content search 200");
	assert(res.json?.count >= 2, "finds both workspace hits");
	const paths = (res.json?.matches ?? []).map((m) => m.path);
	assert(paths.includes("hello.txt") && paths.includes("sub/nested.js"), "relative paths");
	assert(res.json.matches.every((m) => !String(m.path).includes("passwd")), "symlink not followed");
}

{
	const res = await call("GET", "/api/fart.search/query?sessionId=s1&q=nested.js&kind=files");
	assert(res.status === 200, "files search 200");
	assert((res.json?.matches ?? []).some((m) => m.path === "sub/nested.js"), "filename hit");
}

{
	const res = await call("GET", "/api/fart.search/query?sessionId=s1&q=fart-search&include=*.js");
	assert(res.status === 200, "include glob 200");
	const paths = (res.json?.matches ?? []).map((m) => m.path);
	assert(paths.includes("sub/nested.js") && !paths.includes("hello.txt"), "include glob filters");
}

{
	const res = await call("GET", "/api/fart.search/query?sessionId=s1&q=fart-search&path=..%2F..%2Fetc");
	assert(res.status === 400, "search path escape rejected");
}

{
	const res = await call("GET", "/api/fart.search/snippet?sessionId=s1&path=hello.txt&line=1");
	assert(res.status === 200, "snippet 200");
	assert(res.json?.path === "hello.txt", "snippet path");
	assert((res.json?.lines ?? []).some((row) => row.text.includes("fart-search")), "snippet contains hit");
}

{
	const res = await call("GET", "/api/fart.search/snippet?sessionId=s1&path=escape");
	assert(res.status === 400, "symlink snippet rejected");
}

{
	const res = await call("GET", "/api/fart.search/snippet?sessionId=s1&path=/etc/passwd");
	assert(res.status === 400, "absolute snippet escape rejected");
}

{
	const res = await call("GET", "/api/fart.search/nope?sessionId=s1");
	assert(res.status === 404, "unknown route 404");
}

server.close();
if (failures) {
	console.error(`${failures} failure(s)`);
	process.exit(1);
}
console.log("host tests passed");
