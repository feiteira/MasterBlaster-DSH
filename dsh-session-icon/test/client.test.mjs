let registered = null;
globalThis.window = {
	__ModuleLoader__: {
		load: (handoff) => {
			registered = handoff;
		},
	},
	innerWidth: 1200,
	innerHeight: 800,
	requestAnimationFrame: (fn) => { fn(); return 1; },
	cancelAnimationFrame() {},
	addEventListener() {},
	removeEventListener() {},
	setInterval: () => 1,
	clearInterval() {},
};
globalThis.location = { protocol: "http:", host: "127.0.0.1:3080", origin: "http://127.0.0.1:3080" };
globalThis.document = {
	documentElement: { dataset: {} },
	querySelector: () => null,
	querySelectorAll: () => [],
	createElement: () => ({ dataset: {}, textContent: "" }),
	head: { appendChild() {} },
	body: { appendChild() {}, removeChild() {} },
	addEventListener() {},
	removeEventListener() {},
};

const react = {
	createElement() { return null; },
	useState: (v) => [v, () => {}],
	useCallback: (fn) => fn,
	useEffect() {},
	useRef: (v) => ({ current: v }),
	useSyncExternalStore: (_sub, get) => get(),
	Fragment: "fragment",
};

await import("../lib/client.js");
if (registered === null) throw new Error("client bundle did not register");
const exports = registered.factory((id) => {
	if (id === "react") return react;
	throw new Error(`unexpected require ${id}`);
});

import test from "node:test";
import assert from "node:assert/strict";
import { ICONS as HOST_ICONS } from "../lib/state.js";

function row({ className, title, fiberId, dataset = {} }) {
	const el = {
		className,
		dataset,
		getAttribute: (name) => name === "role" ? "treeitem" : null,
		querySelector(selector) {
			if (String(selector).includes("title")) return { textContent: title };
			return null;
		},
		getBoundingClientRect: () => ({ left: 40, top: 80, width: 200, height: 32, right: 240, bottom: 112 }),
		parentElement: null,
	};
	if (fiberId) {
		el.__reactFiber$test = {
			memoizedProps: {},
			return: { memoizedProps: { node: { id: fiberId } }, return: null },
		};
	}
	return el;
}

test("client catalog matches the host catalog", () => {
	assert.deepEqual(exports.ICONS.map((icon) => icon.id), HOST_ICONS.map((icon) => icon.id));
	assert.deepEqual(exports.ICONS.map((icon) => icon.glyph), HOST_ICONS.map((icon) => icon.glyph));
	assert.equal(exports.ICON_COLUMN_PX, 18);
	assert.deepEqual(exports.inject, ["slots", "sessions"]);
});

test("session rows are detected by hashed CSS module class names", () => {
	assert.equal(exports.isSessionRow(row({ className: "YDXeBa_sessionRow" })), true);
	assert.equal(exports.isSessionRow(row({ className: "YDXeBa_searchResultRow YDXeBa_selected" })), true);
	assert.equal(exports.isSessionRow(row({ className: "YDXeBa_projectRow" })), false);
	assert.equal(exports.isSessionRow({ className: "YDXeBa_sessionRow", getAttribute: () => "button" }), false);
});

test("session ids prefer data attributes, then fiber, then unique titles", () => {
	const marked = row({ className: "YDXeBa_sessionRow", dataset: { sessionId: "from-data" } });
	assert.equal(exports.sessionIdFromElement(marked), "from-data");

	const fibered = row({ className: "YDXeBa_sessionRow", fiberId: "from-fiber" });
	assert.equal(exports.sessionIdFromElement(fibered), "from-fiber");
	assert.equal(fibered.dataset.sessionId, "from-fiber");

	const list = { ids: ["a", "b"], byId: { a: { title: "Alpha", blank: false }, b: { title: "Beta", blank: false } } };
	const titled = row({ className: "YDXeBa_sessionRow", title: "Beta" });
	assert.equal(exports.sessionIdFromElement(titled, list), "b");

	const collision = { ids: ["a", "c"], byId: { a: { title: "Same", blank: false }, c: { title: "Same", blank: false } } };
	assert.equal(exports.sessionIdFromElement(row({ className: "YDXeBa_sessionRow", title: "Same" }), collision), null);
});

test("icon boxes sit in the reserved left column and picker stays on-screen", () => {
	const box = exports.iconBoxForRow(row({ className: "YDXeBa_sessionRow" }));
	assert.equal(box.left, 48);
	assert.equal(box.width, 18);
	const style = exports.pickerStyle({ left: 1100, top: 700, width: 18, height: 18 });
	assert.ok(style.left + 232 <= 1200);
	assert.ok(style.top + 50 <= 800);
});

test("store and saveIcon keep only catalog ids", async () => {
	const calls = [];
	const fetcher = async (url, options) => {
		calls.push({ url, options });
		return { ok: true, json: async () => ({ sessionId: "chat-1", icon: "smile" }) };
	};
	exports.store.replaceAll({ "chat-1": "star", "bad": "nope", "chat-2": "smile" });
	assert.deepEqual(exports.store.getSnapshot(), { "chat-1": "star", "chat-2": "smile" });
	await exports.saveIcon("chat-1", "smile", fetcher);
	assert.equal(calls[0].url, "/api/session.icon");
	assert.equal(calls[0].options.method, "POST");
	assert.equal(calls[0].options.credentials, "same-origin");
	assert.equal(JSON.parse(calls[0].options.body).icon, "smile");
	assert.equal(exports.store.getSnapshot()["chat-1"], "smile");
});

test("local overlay keeps new catalog icons and honors clears", () => {
	const memory = {
		data: "{}",
		getItem() { return this.data; },
		setItem(_key, value) { this.data = value; },
	};
	const local = exports.createIconStore({ storage: memory });
	local.replaceAll({ "chat-1": "star" });
	local.setLocal("chat-1", "unchecked");
	local.setLocal("chat-2", "question");
	assert.equal(local.getSnapshot()["chat-1"], "unchecked");
	assert.equal(local.getSnapshot()["chat-2"], "question");
	local.setLocal("chat-1", null);
	local.replaceAll({ "chat-1": "star", "chat-3": "smile" });
	assert.equal(local.getSnapshot()["chat-1"], undefined);
	assert.equal(local.getSnapshot()["chat-2"], "question");
	assert.equal(local.getSnapshot()["chat-3"], "smile");
});
