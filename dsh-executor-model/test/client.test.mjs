import assert from "node:assert/strict";
import test from "node:test";
import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import {
	EXPLANATION, ExecutorSelectionController, ExecutorModelSelect, CallerChip, ExecutorToolCard,
	apply, inject, modelKey, normalizeSelection, lowestAdvertisedEffort,
	catalogChoices, selectionForChoice, installRefreshListeners,
	catalogModelName, parseExecutorCaller, findCatalogChild, executorCallInfo,
} from "../src/client.js";

const A = { provider: "provider/one", model: "a/fast" };
const B = { provider: "provider:two", model: "b?fast#x", reasoningEffort: "low" };
const GROUPS = [
	{ id: A.provider, name: "Provider one", models: [{ id: A.model, name: "Fast one" }] },
	{ id: B.provider, name: "Provider two", models: [{ id: B.model, name: "Fast two", reasoning: { efforts: [{ id: "high", name: "High" }, { id: "low", name: "Low" }], defaultEffort: "high" } }] },
];
const response = selection => ({ ok: true, status: 200, json: async () => ({ selection }) });
const deferred = () => { let resolve, reject; const promise = new Promise((yes, no) => { resolve = yes; reject = no; }); return { promise, resolve, reject }; };
const turn = () => new Promise(resolve => setImmediate(resolve));
const store = value => ({ getSnapshot: () => value, subscribe: () => () => {} });
const directory = (state = {}) => ({ store: store({ groups: GROUPS, failures: [], current: null, routable: false, status: "ready", error: null, ...state }), load: async () => {} });
const render = (controller, catalog = directory(), available = true) => renderToStaticMarkup(React.createElement(ExecutorModelSelect, { controller, directory: catalog, available }));

function ready(selection = null, options = {}) {
	const controller = new ExecutorSelectionController("chat-one", options);
	controller.publish({ selection, loaded: true, status: "ready" });
	return controller;
}

test("model keys are opaque collision-free pairs; normalization drops untrusted extra fields", () => {
	assert.notEqual(modelKey({ provider: "a/b", model: "c" }), modelKey({ provider: "a", model: "b/c" }));
	assert.equal(modelKey(null), "");
	assert.deepEqual(normalizeSelection({ ...A, apiKey: "never render" }), A);
	assert.ok(Object.isFrozen(normalizeSelection(A)));
	for (const value of [undefined, {}, { provider: "", model: "x" }, { ...A, reasoningEffort: "" }, { ...A, reasoningEffort: 42 }]) assert.throws(() => normalizeSelection(value), /invalid executor selection/);
});

test("new routes use the lowest exact advertised effort and never inherit Main effort", () => {
	const choices = catalogChoices(GROUPS);
	assert.deepEqual(selectionForChoice(choices[1], { ...A, reasoningEffort: "high" }), B);
	assert.equal(lowestAdvertisedEffort({ reasoning: { efforts: [{ id: "low" }, { id: "NoNe" }], defaultEffort: "low" } }), "NoNe");
	assert.equal(lowestAdvertisedEffort({ reasoning: { efforts: [{ id: "minimal" }, { id: "low" }] } }), "minimal");
	assert.equal(lowestAdvertisedEffort({ reasoning: { efforts: [{ id: "custom-high" }, { id: "custom-default" }], defaultEffort: "custom-default" } }), "custom-default");
	assert.equal(lowestAdvertisedEffort({}), undefined);
	assert.equal(lowestAdvertisedEffort({ reasoning: { efforts: [], defaultEffort: "unadvertised" } }), undefined);
	assert.deepEqual(selectionForChoice(choices[0], B), A);
	assert.deepEqual(selectionForChoice(choices[1], { ...B, reasoningEffort: "high" }), { ...B, reasoningEffort: "high" });
});

test("default browser fetch is invoked with the global receiver", async () => {
	const original = globalThis.fetch;
	try {
		globalThis.fetch = function () {
			assert.equal(this, globalThis, "browser fetch must not receive the controller as this");
			return Promise.resolve(response(null));
		};
		const controller = new ExecutorSelectionController("chat-browser");
		await controller.load();
		assert.equal(controller.getSnapshot().loaded, true);
		controller.dispose();
	} finally { globalThis.fetch = original; }
});

test("GET loads persisted Off and deduplicates simultaneous reads", async () => {
	const wait = deferred();
	const calls = [];
	const controller = new ExecutorSelectionController("chat /?&", { fetch: (url, options) => { calls.push({ url, options }); return wait.promise; } });
	assert.deepEqual(controller.getSnapshot(), { selection: null, loaded: false, status: "idle", error: null });
	const first = controller.load();
	assert.equal(first, controller.load());
	assert.equal(calls.length, 1);
	assert.equal(calls[0].url, "/api/executor.model?sessionId=chat%20%2F%3F%26");
	assert.equal(calls[0].options.credentials, "same-origin");
	assert.equal(calls[0].options.cache, "no-store");
	wait.resolve(response(null));
	await first;
	assert.deepEqual(controller.getSnapshot(), { selection: null, loaded: true, status: "ready", error: null });
});

test("POST persists full route and null without touching model-selection/global APIs", async () => {
	const calls = [];
	const controller = ready(null, { fetch: async (url, options) => {
		calls.push({ url, options });
		return response(JSON.parse(options.body).selection);
	} });
	await controller.save(B);
	assert.deepEqual(controller.getSnapshot().selection, B);
	await controller.save(null);
	assert.equal(controller.getSnapshot().selection, null);
	assert.equal(calls.length, 2);
	assert.ok(calls.every(call => call.url === "/api/executor.model?sessionId=chat-one"));
	assert.deepEqual(JSON.parse(calls[0].options.body), { selection: B });
	assert.deepEqual(JSON.parse(calls[1].options.body), { selection: null });
	assert.equal(calls[0].options.headers["content-type"], "application/json");
});

test("a stale GET cannot overwrite a successful user selection", async () => {
	const read = deferred();
	const controller = ready(null, { fetch: async (_url, options) => options.method === "GET" ? read.promise : response(B) });
	const oldRead = controller.load();
	await controller.save(B);
	read.resolve(response(A));
	await oldRead;
	assert.deepEqual(controller.getSnapshot().selection, B);
	assert.equal(controller.getSnapshot().status, "ready");
});

test("rapid writes serialize on the host wire and latest intent wins", async () => {
	const waits = [deferred(), deferred()];
	const calls = [];
	const controller = ready(null, { fetch: (_url, options) => { const index = calls.length; calls.push(JSON.parse(options.body).selection); return waits[index].promise; } });
	const first = controller.save(A);
	const second = controller.save(B);
	await turn();
	assert.deepEqual(calls, [A]);
	assert.equal(controller.getSnapshot().status, "saving");
	waits[0].resolve(response(A));
	await first;
	await turn();
	assert.deepEqual(calls, [A, B]);
	assert.equal(controller.getSnapshot().status, "saving");
	waits[1].resolve(response(B));
	await second;
	assert.deepEqual(controller.getSnapshot().selection, B);
	assert.equal(controller.getSnapshot().status, "ready");
});

test("focus refresh during a save waits for the write before reading", async () => {
	const write = deferred();
	const methods = [];
	const controller = ready(A, { fetch: (_url, options) => { methods.push(options.method); return options.method === "POST" ? write.promise : Promise.resolve(response(B)); } });
	const saved = controller.save(B);
	const refreshed = controller.load();
	await turn();
	assert.deepEqual(methods, ["POST"]);
	write.resolve(response(B));
	await Promise.all([saved, refreshed]);
	assert.deepEqual(methods, ["POST", "GET"]);
	assert.deepEqual(controller.getSnapshot().selection, B);
});

test("connection reset prevents an old host response regressing the selection", async () => {
	const old = deferred();
	let calls = 0;
	const controller = ready(null, { fetch: () => ++calls === 1 ? old.promise : Promise.resolve(response(B)) });
	const first = controller.load();
	await controller.resetConnected();
	old.resolve(response(A));
	await first;
	assert.deepEqual(controller.getSnapshot().selection, B);
});

test("sessions have independent stores and teardown blocks late response writes", async () => {
	const wait = deferred();
	let signal;
	const first = new ExecutorSelectionController("chat-a", { fetch: (_url, options) => { signal = options.signal; return wait.promise; } });
	const second = new ExecutorSelectionController("chat-b", { fetch: async () => response(B) });
	const pending = first.load();
	first.dispose();
	const detached = first.getSnapshot();
	assert.equal(signal.aborted, true);
	await second.load();
	wait.resolve(response(A));
	await pending;
	assert.equal(first.getSnapshot(), detached);
	assert.deepEqual(second.getSnapshot().selection, B);
	assert.notEqual(ExecutorModelSelect({ controller: first }).key, ExecutorModelSelect({ controller: second }).key);
});

test("another tab's persisted choice is picked up by a fresh GET", async () => {
	let hostSelection = A;
	const controller = new ExecutorSelectionController("chat", { fetch: async () => response(hostSelection) });
	await controller.load();
	assert.deepEqual(controller.getSnapshot().selection, A);
	hostSelection = B;
	await controller.load();
	assert.deepEqual(controller.getSnapshot().selection, B);
});

test("network, response and parse failures do not expose arbitrary secret-bearing text", async () => {
	for (const fetcher of [
		async () => ({ ok: false, status: 500, json: async () => { throw new Error("SECRET_SENTINEL"); } }),
		async () => { throw new Error("SECRET_SENTINEL"); },
		async () => ({ ok: true, status: 200, json: async () => { throw new Error("SECRET_SENTINEL"); } }),
	]) {
		const controller = ready(A, { fetch: fetcher });
		await assert.rejects(controller.save(B));
		assert.deepEqual(controller.getSnapshot().selection, A);
		assert.equal(controller.getSnapshot().status, "error");
		assert.ok(!controller.getSnapshot().error.includes("SECRET_SENTINEL"));
		const html = render(controller);
		assert.ok(!html.includes("SECRET_SENTINEL"));
		assert.match(html, /role="alert"/);
		assert.match(html, />Retry<\/button>/);
	}
});

test("a failed save does not prevent a subsequent accepted choice", async () => {
	let fail = true;
	const controller = ready(A, { fetch: async (_url, options) => fail ? { ok: false, status: 400 } : response(JSON.parse(options.body).selection) });
	await assert.rejects(controller.save(B), /rejected/);
	fail = false;
	await controller.save(null);
	assert.equal(controller.getSnapshot().selection, null);
	assert.equal(controller.getSnapshot().error, null);
	assert.equal(controller.getSnapshot().status, "ready");
});

test("subagent settings remain disabled and never send host requests", async () => {
	const controller = new ExecutorSelectionController("child", { available: false, fetch: () => { throw new Error("must not fetch"); } });
	await controller.load();
	await assert.rejects(controller.save(A), /unavailable/);
	const html = render(controller, directory(), false);
	assert.match(html, /aria-label="Executor model"[^>]*disabled=""/);
	assert.match(html, /unavailable for subagent chats/);
});

test("native controls label Executor and adjacent Main; Off is the initial selection", () => {
	const html = render(ready(null));
	assert.match(html, /<label[^>]*>Executor<select/);
	assert.match(html, /aria-label="Executor model"/);
	assert.match(html, /<option value="" selected="">Off<\/option>/);
	assert.match(html, /<optgroup label="Provider one">/);
	assert.match(html, /Fast one/);
	assert.match(html, /Fast two/);
	assert.match(html, /class="em-main-label"[^>]*>Main<\/span>/);
	assert.ok(EXPLANATION.includes("delegates bounded tasks"));
	assert.ok(EXPLANATION.includes("reviews the results"));
	assert.ok(!html.includes("Executor reasoning effort"));
});

test("reasoning control lists only exact model efforts plus provider default", () => {
	const html = render(ready(B));
	assert.match(html, /aria-label="Executor reasoning effort"/);
	assert.match(html, /<option value="low" selected="">Low<\/option>/);
	assert.match(html, /<option value="high">High<\/option>/);
	assert.match(html, /Provider default/);
	assert.ok(!html.includes('value="none"'));
});

test("catalog absence does not erase a saved route or use Main routability", () => {
	const html = render(ready({ provider: "removed-provider", model: "saved-model" }));
	assert.match(html, /saved-model \(not in catalog\)/);
	assert.match(html, /may still be routable/);
	assert.ok(!html.includes('aria-label="Executor model" disabled'));
	const valid = render(ready(A), directory({ routable: false }));
	assert.ok(!valid.includes("not in catalog"));
});

test("unknown persisted effort remains visible without adding a fabricated supported option", () => {
	const html = render(ready({ ...B, reasoningEffort: "legacy-effort" }));
	assert.match(html, /legacy-effort \(not advertised\)/);
	assert.match(html, /saved effort is not advertised/);
});

test("loading and partial catalog failures have accessible status and sanitized retry", () => {
	const loading = new ExecutorSelectionController("new");
	const html = render(loading, directory({ status: "loading", groups: [] }));
	assert.match(html, /aria-busy="true"/);
	assert.match(html, /disabled=""/);
	assert.match(html, /Loading executor settings/);
	const partial = render(ready(null), directory({ failures: [{ id: "broken", name: "Broken", message: "SECRET_SENTINEL" }] }));
	assert.match(partial, /Some providers could not be loaded/);
	assert.match(partial, /Fast one/);
	assert.match(partial, />Retry<\/button>/);
	assert.ok(!partial.includes("SECRET_SENTINEL"));
});

test("focus and visible-page listeners refresh and cleanly detach", () => {
	const events = () => {
		const listeners = new Map();
		return { listeners, addEventListener: (name, fn) => listeners.set(name, fn), removeEventListener: (name, fn) => { assert.equal(listeners.get(name), fn); listeners.delete(name); } };
	};
	const win = events();
	const doc = { ...events(), visibilityState: "hidden" };
	let refreshed = 0;
	const stop = installRefreshListeners(() => ++refreshed, win, doc);
	win.listeners.get("focus")();
	doc.listeners.get("visibilitychange")();
	assert.equal(refreshed, 1);
	doc.visibilityState = "visible";
	doc.listeners.get("visibilitychange")();
	assert.equal(refreshed, 2);
	stop();
	assert.equal(win.listeners.size, 0);
	assert.equal(doc.listeners.size, 0);
});

test("caller labels prefer catalog names and parse executor agent titles", () => {
	assert.equal(catalogModelName(GROUPS, B), "Fast two");
	assert.equal(catalogModelName(GROUPS, { provider: "missing", model: "x" }), "x");
	assert.deepEqual(parseExecutorCaller("Executor · small · Edit one file"), { role: "Executor", model: "small" });
	assert.equal(parseExecutorCaller("plain task"), null);
	assert.equal(findCatalogChild({ parent: { entries: [{ kind: "child", id: "child-1", label: "Executor · small · task" }] } }, "child-1").label, "Executor · small · task");
	assert.deepEqual(executorCallInfo({ arguments: JSON.stringify({ description: "Edit one file" }), content: [{ type: "text", text: "Executor run-1 (cheap/small) reported:\nDone" }] }), {
		description: "Edit one file",
		provider: "cheap",
		model: "small",
		report: "Executor run-1 (cheap/small) reported:\nDone",
	});
});

test("header chip and executor tool card name the calling model", () => {
	const main = renderToStaticMarkup(React.createElement(CallerChip, {
		sessionId: "chat-one",
		useSessions: () => undefined,
		directory: directory({ current: B, groups: GROUPS }),
	}));
	assert.match(main, /Main · Fast two/);
	assert.match(main, /data-executor-caller="Main"/);
	const agent = renderToStaticMarkup(React.createElement(CallerChip, {
		sessionId: "child-1",
		address: { parentSessionId: "chat-one", childSessionId: "child-1" },
		useSessions: selector => selector({ subagentsByParent: { "chat-one": { entries: [{ kind: "child", id: "child-1", label: "Executor · small · Edit one file" }] } } }),
	}));
	assert.match(agent, /Executor · small/);
	const card = renderToStaticMarkup(React.createElement(ExecutorToolCard, { block: { arguments: JSON.stringify({ description: "Read heading" }), content: [{ type: "text", text: "Executor abc (openai-codex/gpt-5.4-mini) reported:\n# Hi" }] } }));
	assert.match(card, /Executor · gpt-5.4-mini/);
	assert.match(card, /Read heading/);
});

test("plugin adds caller chrome plus the adjacent list seat and scopes controllers per chat", () => {
	const disposers = [];
	const scopes = new Map();
	const registrations = [];
	const callbacks = new Map();
	const effect = fn => { const stop = fn(); if (typeof stop === "function") disposers.push(stop); };
	const ctx = {
		effect,
		on: (name, fn) => callbacks.set(name, fn),
		slots: {
			inject: (slot, fn) => { registrations.push({ slot }); return fn(); },
			register: (spec, component) => registrations.push({ spec, component }),
		},
		sessions: {
			subagentAddress: () => undefined,
			scope: id => { if (!scopes.has(id)) scopes.set(id, { effect }); return scopes.get(id); },
			binding: () => ({ session: {} }), // No projection read or Main selection mutation.
		},
		modelDirectories: { directoryFor: () => directory() },
	};
	apply(ctx);
	assert.deepEqual(inject, ["slots", "sessions", "modelDirectories", "remote", "remote.session"]);
	const seats = registrations.filter(item => item.spec !== undefined);
	assert.deepEqual(seats.map(item => item.spec.name), ["conversation.session.header.actions", "tool.call.toolview", "conversation.input.right"]);
	assert.equal(seats[0].component, CallerChip);
	assert.equal(seats[1].spec.key, "executor");
	assert.equal(seats[1].component, ExecutorToolCard);
	assert.equal(seats[2].component, ExecutorModelSelect);
	const first = seats[2].spec.inject("one");
	assert.equal(first.controller, seats[2].spec.inject("one").controller);
	assert.notEqual(first.controller, seats[2].spec.inject("two").controller);
	assert.ok(callbacks.has("connection/reset"));
	for (const stop of disposers.reverse()) stop();
	assert.equal(first.controller.disposed, true);
});
