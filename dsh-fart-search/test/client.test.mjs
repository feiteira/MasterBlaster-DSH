let registered = null;
globalThis.window = {
	__ModuleLoader__: {
		load: (handoff) => {
			registered = handoff;
		},
	},
};
globalThis.location = { protocol: "http:", host: "127.0.0.1:3080", origin: "http://127.0.0.1:3080" };
globalThis.document = {
	documentElement: { dataset: {} },
	querySelector: () => null,
	createElement: () => ({ dataset: {}, textContent: "" }),
	head: { appendChild() {} },
	body: { appendChild() {}, removeChild() {} },
	addEventListener() {},
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

let failures = 0;
function assert(cond, label) {
	if (cond) console.log("  ok  " + label);
	else {
		failures++;
		console.log("FAIL  " + label);
	}
}

assert(Array.isArray(exports.inject) && exports.inject.includes("slots"), "injects slots");
assert(typeof exports.apply === "function", "apply exported");
assert(typeof exports.SearchOverlay === "function", "overlay exported");
assert(typeof exports.SearchToggle === "function", "toggle exported");
assert(exports.getPanelState().visible === false, "panel starts hidden");
exports.setPanel({ visible: true });
assert(exports.getPanelState().visible === true, "setPanel updates visibility");

{
	const groups = exports.groupMatches([
		{ path: "a.ts", line: 1, text: "one" },
		{ path: "b.ts", line: 2, text: "two" },
		{ path: "a.ts", line: 4, text: "three" },
	]);
	assert(groups.length === 2 && groups[0].path === "a.ts" && groups[0].matches.length === 2, "group by file, preserve order");
}

{
	const parts = exports.highlightParts("Hello FART search", "fart", { caseSensitive: false, regex: false });
	assert(parts.some((p) => p.hit && p.text.toLowerCase() === "fart"), "highlight literal case-insensitive");
	const none = exports.highlightParts("abc", "(", { regex: true });
	assert(none.length === 1 && none[0].hit === false, "invalid regex highlight is safe");
}

{
	assert(exports.isSearchHotkey({ ctrlKey: true, shiftKey: true, key: "f", altKey: false }), "ctrl+shift+f");
	assert(exports.isSearchHotkey({ metaKey: true, shiftKey: true, key: "F", ctrlKey: false, altKey: false }), "cmd+shift+F");
	assert(!exports.isSearchHotkey({ ctrlKey: true, shiftKey: false, key: "f" }), "ctrl+f is not FART");
	assert(!exports.isSearchHotkey({ ctrlKey: true, shiftKey: true, altKey: true, key: "f" }), "alt rejected");
}

{
	assert(exports.validateQuery("", false) === "Type to search the workspace.", "empty query");
	assert(exports.validateQuery("foo", false) === null, "plain query ok");
	assert(typeof exports.validateQuery("(", true) === "string", "bad regex message");
}

{
	const url = exports.apiUrl("query", { sessionId: "s1", q: "fart", regex: false, include: undefined });
	assert(url.pathname === "/api/fart.search/query", "api path");
	assert(url.searchParams.get("sessionId") === "s1", "session param");
	assert(url.searchParams.get("q") === "fart", "q param");
	assert(!url.searchParams.has("regex"), "false flags omitted");
}

if (failures) {
	console.error(`${failures} failure(s)`);
	process.exit(1);
}
console.log("client tests passed");
