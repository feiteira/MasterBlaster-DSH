import test from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { apply, createSessionIconHandler, SESSION_ICON_API_PATH } from "../lib/index.js";
import { createIconState } from "../lib/state.js";

function memoryTable() {
	const records = new Map();
	return {
		get: (id) => records.get(id),
		entries: () => records.entries(),
		async put(id, value) { records.set(id, structuredClone(value)); },
		async delete(id) { return records.delete(id); },
	};
}

test("HTTP uses the connection trust fence and persists icons", async (t) => {
	const state = createIconState(memoryTable());
	const ctx = {
		connection: {
			requestRejection(request) {
				const origin = request.headers.origin;
				if (origin && origin.includes("attacker")) return 403;
				if (request.headers.cookie !== "test-auth=valid") return 401;
				return undefined;
			},
		},
	};
	const handler = createSessionIconHandler(ctx, state);
	const server = createServer(handler);
	await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
	t.after(() => new Promise((resolve) => { server.closeAllConnections(); server.close(resolve); }));
	const origin = `http://127.0.0.1:${server.address().port}`;
	const call = async (method, body, headers = {}) => {
		const response = await fetch(`${origin}${SESSION_ICON_API_PATH}`, {
			method,
			headers: { origin, cookie: "test-auth=valid", "content-type": "application/json", ...headers },
			...(body === undefined ? {} : { body: typeof body === "string" ? body : JSON.stringify(body) }),
		});
		return { status: response.status, body: await response.json() };
	};

	assert.equal((await call("GET", undefined, { cookie: "" })).status, 401);
	assert.equal((await call("GET", undefined, { origin: "http://attacker.invalid" })).status, 403);
	assert.deepEqual(await call("GET"), { status: 200, body: { icons: {} } });
	assert.equal((await call("POST", { sessionId: "chat-1", icon: "Nope" })).status, 400);
	assert.equal((await call("POST", { sessionId: "chat 1", icon: "star" })).status, 400);
	assert.equal((await call("POST", { sessionId: "chat-1", icon: "star" }, { "content-type": "text/plain" })).status, 415);
	assert.deepEqual(await call("POST", { sessionId: "chat-1", icon: "star" }), { status: 200, body: { sessionId: "chat-1", icon: "star" } });
	assert.deepEqual(await call("GET"), { status: 200, body: { icons: { "chat-1": "star" } } });
	assert.deepEqual(await call("POST", { sessionId: "chat-1", icon: null }), { status: 200, body: { sessionId: "chat-1", icon: null } });
	assert.deepEqual(await call("GET"), { status: 200, body: { icons: {} } });
});

test("plugin apply registers the exact route and closes the domain", async () => {
	const effects = [];
	let closed = false, route, removed = false;
	const table = memoryTable();
	const ctx = {
		storageDomain: { async open(spec) { assert.equal(spec.name, "session_icon"); return { table: () => table, async close() { closed = true; } }; } },
		effect: (callback) => { const dispose = callback(); effects.push(dispose); return dispose; },
		webServer: { register(value) { route = value; return () => { removed = true; }; } },
	};
	await apply(ctx);
	assert.equal(route.kind, "exact");
	assert.equal(route.path, SESSION_ICON_API_PATH);
	for (const dispose of effects.reverse()) await dispose();
	assert.equal(removed, true);
	assert.equal(closed, true);
});
