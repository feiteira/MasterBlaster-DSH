let registered = null;
globalThis.window = {
	__ModuleLoader__: {
		load: (handoff) => {
			registered = handoff;
		},
	},
	innerWidth: 1400,
	innerHeight: 900,
	requestAnimationFrame: (fn) => { fn(); return 1; },
	cancelAnimationFrame() {},
	addEventListener() {},
	removeEventListener() {},
	setInterval: () => 1,
	clearInterval() {},
};
globalThis.location = { protocol: "http:", host: "127.0.0.1:3080", origin: "http://127.0.0.1:3080" };
const store = new Map();
globalThis.localStorage = {
	getItem: (key) => (store.has(key) ? store.get(key) : null),
	setItem: (key, value) => { store.set(key, String(value)); },
	removeItem: (key) => { store.delete(key); },
};
const createdElements = [];
globalThis.document = {
	documentElement: { dataset: {} },
	querySelector: () => null,
	querySelectorAll: () => [],
	createElement: (...args) => {
		createdElements.push(args);
		return { dataset: {}, textContent: "", style: {} };
	},
	head: { appendChild() {} },
	body: { appendChild() {}, removeChild() {}, style: {} },
	addEventListener() {},
	removeEventListener() {},
};

const react = {
	createElement: (...args) => ({ type: args[0], props: args[1], children: args.slice(2) }),
	useState: (init) => [typeof init === "function" ? init() : init, () => {}],
	useCallback: (fn) => fn,
	useEffect() {},
	useMemo: (fn) => fn(),
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

function workspace(overrides = {}) {
	return {
		workspaceId: "ws-1",
		path: "/home/user/projects/alpha",
		title: "Alpha",
		sessionIds: [],
		createdAt: "2026-01-01T00:00:00.000Z",
		updatedAt: "2026-01-02T00:00:00.000Z",
		...overrides,
	};
}

function summary(overrides = {}) {
	return {
		id: "s-1",
		displayTitle: "Chat",
		blank: false,
		running: false,
		updatedAt: 1000,
		...overrides,
	};
}

function sessionsSnap(byId, current, extra = {}) {
	return {
		ids: Object.keys(byId),
		byId,
		current,
		phase: "ready",
		subagentsByParent: {},
		jobsBySession: {},
		currentAddress: undefined,
		...extra,
	};
}

function workspacesSnap(items, archived = []) {
	return { items, archivedSessionIds: archived, state: "idle", phase: "ready", error: null };
}

test("client declares the workspace tab shell injection", () => {
	assert.equal(registered.id, "dsh-workspace-tabs");
	assert.deepEqual(exports.inject, ["slots", "sessions", "workspaces"]);
	assert.equal(exports.TAB_BAR_PX, 42);
	assert.equal(exports.SIDEBAR_WORKSPACES_SLOT, "sidebar.workspaces");
	assert.equal(typeof exports.apply, "function");
	assert.equal(typeof exports.WorkspaceTabs, "function");
	assert.equal(typeof exports.createScopedBrowser, "function");
});

test("workspace titles prefer title, then folder name, then short id", () => {
	assert.equal(exports.workspaceTitle(workspace({ title: "Custom" })), "Custom");
	assert.equal(exports.workspaceTitle(workspace({ title: "  ", path: "/a/b/bravo/" })), "bravo");
	assert.equal(exports.workspaceTitle(workspace({ title: "", path: "C:\\work\\charlie" })), "charlie");
	assert.equal(exports.workspaceTitle(workspace({ title: "", path: "", workspaceId: "ws-abcdef123" })), "ws-abcdef123");
	assert.equal(exports.basenameOf("/x/y/"), "y");
});

test("selection follows the current session, then the persisted pick, then recency", () => {
	const items = [
		workspace({ workspaceId: "w1", title: "One", sessionIds: ["a"], createdAt: "2026-01-01T00:00:00.000Z" }),
		workspace({ workspaceId: "w2", title: "Two", sessionIds: ["b"], createdAt: "2026-02-01T00:00:00.000Z" }),
	];
	const snap = sessionsSnap({
		a: summary({ id: "a", updatedAt: 100 }),
		b: summary({ id: "b", updatedAt: 50 }),
	}, "b");
	assert.equal(exports.ownerWorkspaceId(items, "b"), "w2");
	// Current session wins over a conflicting persisted pick.
	assert.deepEqual(exports.effectiveSelection(items, snap, [], "w1"), { kind: "workspace", workspaceId: "w2" });
	// An unaccounted current session selects Ungrouped.
	const stray = sessionsSnap({ ...snap.byId, z: summary({ id: "z" }) }, "z");
	assert.deepEqual(exports.effectiveSelection(items, stray, [], "w1"), { kind: "ungrouped" });
	// Without a current session the persisted pick wins over recency.
	assert.deepEqual(
		exports.effectiveSelection(items, sessionsSnap(snap.byId, undefined), [], "w1"),
		{ kind: "workspace", workspaceId: "w1" },
	);
	assert.deepEqual(
		exports.effectiveSelection(items, sessionsSnap(snap.byId, undefined), [], exports.UNGROUPED_ID),
		{ kind: "ungrouped" },
	);
	// Unknown persisted ids fall back to the most recently active workspace.
	assert.deepEqual(
		exports.effectiveSelection(items, sessionsSnap(snap.byId, undefined), [], "missing"),
		{ kind: "workspace", workspaceId: "w1" },
	);
	assert.deepEqual(exports.effectiveSelection([], snap, [], "w1"), { kind: "ungrouped" });
	assert.equal(exports.selectionKey({ kind: "workspace", workspaceId: "w1" }), "w1");
	assert.equal(exports.selectionKey({ kind: "ungrouped" }), exports.UNGROUPED_ID);
	assert.equal(exports.isSelectionEqual({ kind: "workspace", workspaceId: "w1" }, { kind: "workspace", workspaceId: "w1" }), true);
	assert.equal(exports.isSelectionEqual({ kind: "workspace", workspaceId: "w1" }, { kind: "workspace", workspaceId: "w2" }), false);
});

test("allowed ids cover the account plus subagent descendants, never archived rows", () => {
	const items = [
		workspace({ workspaceId: "w1", sessionIds: ["a", "arch"] }),
		workspace({ workspaceId: "w2", sessionIds: ["b"] }),
	];
	const snap = sessionsSnap({
		a: summary({ id: "a" }),
		child: summary({ id: "child", parentId: "a" }),
		arch: summary({ id: "arch" }),
		b: summary({ id: "b" }),
		stray: summary({ id: "stray" }),
	}, undefined);
	const allowed = exports.allowedSessionIds({ kind: "workspace", workspaceId: "w1" }, items, snap, ["arch"]);
	assert.deepEqual([...allowed].sort(), ["a", "child"]);
	const ungrouped = exports.allowedSessionIds({ kind: "ungrouped" }, items, snap, []);
	assert.ok(ungrouped.has("stray"));
	assert.ok(ungrouped.has("child"));
	assert.ok(!ungrouped.has("arch"));
	assert.deepEqual(exports.ungroupedSessionIds(items, snap, ["arch"]).sort(), ["child", "stray"]);
});

test("filtered snapshots hide other accounts from ids and byId", () => {
	const items = [
		workspace({ workspaceId: "w1", sessionIds: ["a"] }),
		workspace({ workspaceId: "w2", sessionIds: ["b"] }),
	];
	const snap = sessionsSnap({
		a: summary({ id: "a" }),
		b: summary({ id: "b", running: true }),
	}, "b", {
		subagentsByParent: { a: { x: 1 }, b: { y: 2 } },
		jobsBySession: { a: ["j1"], b: ["j2"] },
		currentAddress: { parent: "b", child: "c" },
	});
	const allowed = exports.allowedSessionIds({ kind: "workspace", workspaceId: "w1" }, items, snap, []);
	const filtered = exports.filterSessionsSnapshot(snap, allowed);
	assert.deepEqual(filtered.ids, ["a"]);
	assert.deepEqual(Object.keys(filtered.byId), ["a"]);
	assert.equal(filtered.current, undefined);
	assert.equal(filtered.currentAddress, undefined);
	assert.deepEqual(filtered.subagentsByParent, { a: { x: 1 } });
	assert.deepEqual(filtered.jobsBySession, { a: ["j1"] });
	assert.equal(filtered.phase, "ready");

	const scopedWs = exports.filterWorkspacesSnapshot(workspacesSnap(items), { kind: "workspace", workspaceId: "w1" });
	assert.deepEqual(scopedWs.items.map((item) => item.workspaceId), ["w1"]);
	const ungroupedWs = exports.filterWorkspacesSnapshot(workspacesSnap(items), { kind: "ungrouped" });
	assert.deepEqual(ungroupedWs.items, []);
});

test("tab switching stays on current, opens recent, reuses blanks, or creates", () => {
	const items = [workspace({ workspaceId: "w1", sessionIds: ["old", "blank", "new"] })];
	const snap = sessionsSnap({
		old: summary({ id: "old", updatedAt: 10 }),
		blank: summary({ id: "blank", blank: true, updatedAt: 30 }),
		new: summary({ id: "new", updatedAt: 20 }),
	}, "old");
	const sel = { kind: "workspace", workspaceId: "w1" };
	assert.deepEqual(exports.pickSessionTarget(sel, items, snap, []), { action: "open", sessionId: "old" });

	const away = sessionsSnap(snap.byId, "elsewhere");
	assert.deepEqual(exports.pickSessionTarget(sel, items, away, []), { action: "open", sessionId: "new" });

	const onlyBlank = sessionsSnap({ blank: snap.byId.blank }, "elsewhere");
	assert.deepEqual(exports.pickSessionTarget(sel, items, onlyBlank, []), { action: "open", sessionId: "blank" });

	assert.deepEqual(
		exports.pickSessionTarget(sel, [workspace({ workspaceId: "w1", sessionIds: [] })], away, []),
		{ action: "create", workspaceId: "w1" },
	);
	assert.deepEqual(exports.pickSessionTarget(null, items, away, []), { action: "none" });
	assert.deepEqual(exports.pickSessionTarget({ kind: "ungrouped" }, items, away, []), { action: "none" });
	const straySnap = sessionsSnap({ stray: summary({ id: "stray", updatedAt: 5 }) }, undefined);
	assert.deepEqual(
		exports.pickSessionTarget({ kind: "ungrouped" }, items, straySnap, []),
		{ action: "open", sessionId: "stray" },
	);
});

test("tab model carries counts and running flags", () => {
	const items = [
		workspace({ workspaceId: "w1", title: "One", sessionIds: ["a", "b"] }),
		workspace({ workspaceId: "w2", title: "Two", path: "/p/two", sessionIds: ["c"] }),
	];
	const snap = sessionsSnap({
		a: summary({ id: "a" }),
		b: summary({ id: "b", running: true }),
		c: summary({ id: "c" }),
	}, "a");
	const tabs = exports.tabModel(items, snap, []);
	assert.deepEqual(tabs.map((tab) => tab.workspaceId), ["w1", "w2"]);
	assert.deepEqual(tabs.map((tab) => tab.count), [2, 1]);
	assert.deepEqual(tabs.map((tab) => tab.running), [true, false]);
	assert.equal(tabs[1].path, "/p/two");
});

test("selection store persists and notifies", () => {
	const selection = exports.createSelectionStore({
		getItem: () => null,
		setItem: () => {},
	});
	let calls = 0;
	const off = selection.subscribe(() => { calls += 1; });
	assert.equal(selection.getSnapshot(), null);
	selection.set("w1");
	assert.equal(selection.getSnapshot(), "w1");
	assert.equal(calls, 1);
	selection.set("w1");
	assert.equal(calls, 1);
	off();
});

test("native entry lookup skips wrapper registrations", () => {
	const own = () => null;
	const wrapper = () => null;
	wrapper.__wtWrapper = true;
	const native = { component: () => null, options: {} };
	assert.equal(exports.findNativeEntry([], own), null);
	assert.equal(exports.findNativeEntry([{ component: own }], own), null);
	assert.equal(exports.findNativeEntry([{ component: wrapper }, native], own), native);
});

test("shadow spec clones native registration without priority or registrant", () => {
	const component = () => null;
	const native = {
		component,
		options: { id: "browser", order: 3, label: "Workspaces", priority: -5 },
		inject: () => ({}),
		store: { handle: true },
		children: { "sidebar.workspaces.directoryFlow": { kind: "single" } },
		locale: "workspace-ns",
		select: () => true,
		registrant: "native-fiber",
		extra: "ignored",
	};
	const spec = exports.buildShadowSpec(native);
	assert.equal(spec.name, "sidebar.workspaces");
	assert.equal(spec.inject, native.inject);
	assert.equal(spec.store, native.store);
	assert.equal(spec.locale, native.locale);
	assert.equal(spec.select, native.select);
	assert.equal(spec.id, "browser");
	assert.equal(spec.priority, -6);
	assert.ok(!("children" in spec), "child slots are declared once and cannot be cloned");
	assert.ok(!("registrant" in spec));
	assert.ok(!("extra" in spec));
});

test("directory flow stays off inside the scoped browser", () => {
	assert.equal(exports.useNoDirectoryFlow((occupied) => occupied), false);
	assert.equal(exports.renderNoSlot("sidebar.workspaces.directoryFlow", {}), null);
});

test("shadow spec defaults below the native priority", () => {
	const spec = exports.buildShadowSpec({ component: () => null, options: {} });
	assert.equal(spec.priority, -1);
});

test("retained keys union the full registry so hidden accounts are preserved", () => {
	let received = null;
	const actions = {
		setGroupExpanded() {},
		retainAccountKeys: (keys) => { received = keys; },
	};
	const guarded = exports.guardActions(actions, () => ["w1", "w2"]);
	assert.equal(guarded.setGroupExpanded, actions.setGroupExpanded);
	guarded.retainAccountKeys(["w1"]);
	assert.deepEqual([...received].sort(), ["", "__flat_session_order__", "w1", "w2"]);
	const fullKeys = () => ["w1"];
	assert.equal(exports.guardActions(actions, fullKeys).retainAccountKeys, exports.guardActions(actions, fullKeys).retainAccountKeys);
	assert.equal(exports.guardActions(null, () => []), null);
});

test("filtered selector hooks read the scoped snapshot", () => {
	let snapshots = 0;
	const hook = exports.makeSelectorHook(
		() => () => {},
		() => {
			snapshots += 1;
			return { items: ["w1"] };
		},
	);
	assert.deepEqual(hook((state) => state.items), ["w1"]);
	assert.deepEqual(hook(), { items: ["w1"] });
	assert.equal(snapshots, 2);
});

test("apply registers tabs and shadows the native browser entry", () => {
	const specs = [];
	const injectCalls = [];
	let subscribed = null;
	const nativeComponent = () => null;
	const nativeEntry = {
		component: nativeComponent,
		options: {},
		inject: () => ({ open: true }),
		store: { shared: true },
		children: { "sidebar.workspaces.directoryFlow": { kind: "single" } },
		locale: "ns",
	};
	const fakeSlots = {
		inject: (name, setup) => {
			injectCalls.push(name);
			return setup();
		},
		register: (spec, component) => {
			specs.push({ spec, component });
			return () => {};
		},
		entries: (name) => (name === "sidebar.workspaces" ? [nativeEntry] : []),
		subscribe: (name, listener) => {
			subscribed = { name, listener };
			return () => {};
		},
	};
	const sessions = { list: { getSnapshot: () => sessionsSnap({}, undefined), subscribe: () => () => {} } };
	const workspaces = { list: { getSnapshot: () => workspacesSnap([]), subscribe: () => () => {} } };
	const ctx = {
		get: (name) => {
			if (name === "layout") throw new Error("no layout");
			return { sessions, workspaces }[name];
		},
		slots: fakeSlots,
	};
	exports.apply(ctx);
	assert.deepEqual(injectCalls, ["shell.overlay", "sidebar.workspaces"]);
	assert.equal(specs.length, 2);
	assert.equal(specs[0].spec.name, "shell.overlay");
	assert.equal(specs[0].spec.id, "workspace-tabs");
	assert.equal(specs[1].spec.name, "sidebar.workspaces");
	assert.equal(specs[1].spec.store, nativeEntry.store);
	assert.ok(!("children" in specs[1].spec));
	assert.equal(specs[1].component.__wtWrapper, true);
	assert.equal(subscribed.name, "sidebar.workspaces");

	// The wrapper renders the captured native component with scoped hooks.
	const wrapperFactory = specs[1].component;
	const originalSe = () => null;
	const originalWs = () => null;
	const originalFlow = () => true;
	const rendered = wrapperFactory({ useSessions: originalSe, useWorkspaces: originalWs, useDirectoryFlow: originalFlow, renderSlot: () => "slot", marker: 7 });
	assert.equal(rendered.type, nativeComponent);
	assert.equal(rendered.props.marker, 7);
	assert.notEqual(rendered.props.useSessions, originalSe);
	assert.notEqual(rendered.props.useWorkspaces, originalWs);
	assert.notEqual(rendered.props.useDirectoryFlow, originalFlow);
	assert.equal(rendered.props.useDirectoryFlow(), false);
	assert.equal(rendered.props.renderSlot(), null);
	assert.equal(rendered.type, nativeComponent);
	assert.equal(rendered.props.marker, 7);
	assert.notEqual(rendered.props.useSessions, originalSe);
	assert.notEqual(rendered.props.useWorkspaces, originalWs);
	assert.deepEqual(rendered.props.useSessions((state) => state.ids), []);
	assert.deepEqual(rendered.props.useWorkspaces((state) => state.items), []);
});

test("add-workspace helpers filter rows and pick the adopt target", () => {
	const rows = [
		{ name: "alpha", path: "/home/u/alpha", hidden: false },
		{ name: ".git", path: "/home/u/.git", hidden: true },
		{ name: ".config", path: "/home/u/.config", hidden: true },
	];
	assert.deepEqual(exports.addRowsFiltered(rows, false).map((row) => row.name), ["alpha"]);
	assert.deepEqual(exports.addRowsFiltered(rows, true).map((row) => row.name), ["alpha", ".git", ".config"]);
	assert.deepEqual(exports.addRowsFiltered(null, true), []);

	assert.equal(exports.adoptTarget(null, "/home/u"), "/home/u");
	assert.equal(exports.adoptTarget("/home/u/alpha", null), "/home/u/alpha");
	assert.equal(exports.adoptTarget(null, null), null);

	const items = [
		workspace({ workspaceId: "w1", path: "/p/one" }),
		workspace({ workspaceId: "w2", path: "/p/two" }),
	];
	assert.equal(exports.findWorkspaceByPath(items, "/p/two")?.workspaceId, "w2");
	assert.equal(exports.findWorkspaceByPath(items, "/p/three"), null);
	assert.equal(exports.findWorkspaceByPath(items, null), null);
	assert.equal(exports.findWorkspaceByPath([], "/p/one"), null);
});

test("the tab bar declares the add-workspace entry point", () => {
	assert.equal(typeof exports.AddWorkspaceDialog, "function");
});
