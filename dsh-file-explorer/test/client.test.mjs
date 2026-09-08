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
	querySelector: () => null,
	createElement: () => ({ dataset: {}, textContent: "" }),
	head: { appendChild() {} },
	body: { appendChild() {}, removeChild() {} },
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

assert(exports.joinRel("", "a") === "a", "join at empty dir");
assert(exports.joinRel("/", "a") === "/a", "join at filesystem root");
assert(exports.joinRel("/ws", "a.txt") === "/ws/a.txt", "join nested");
assert(exports.joinRel("/ws/lib", "a.txt") === "/ws/lib/a.txt", "join under absolute dir");
assert(exports.parentRel("/ws/lib") === "/ws", "parent of nested dir");
assert(exports.parentRel("/ws") === "/", "parent of top dir is the filesystem root");
assert(exports.parentRel("/") === "/", "filesystem root has no parent");
assert(exports.parentRel("") === "", "empty dir parent is empty");
assert(exports.splitRel("/a/b/c").join(",") === "a,b,c", "split absolute path");
assert(exports.splitRel("/").join(",") === "", "split root yields no segments");
assert(exports.formatBytes(0) === "0 B", "0 bytes");
assert(exports.formatBytes(1023) === "1023 B", "bytes under 1K");
assert(exports.formatBytes(1024) === "1 KB", "1 KB");
assert(exports.formatBytes(1048576) === "1.0 MB", "1 MB");
assert(exports.zipArchiveName("src/lib") === "lib.zip", "zip name from nested path");
assert(exports.zipArchiveName("", "/var/lib/harness/dsh-patches") === "dsh-patches.zip", "zip name from cwd basename");
assert(exports.zipArchiveName("") === "workspace.zip", "zip name fallback");
assert(Array.isArray(exports.inject) && exports.inject.includes("slots"), "injects slots");
assert(typeof exports.apply === "function", "apply exported");
assert(typeof exports.FilesOverlay === "function", "overlay exported");
assert(typeof exports.FilesToggle === "function", "toggle exported");
assert(exports.getPanelState().visible === false, "panel starts hidden");
exports.setPanel({ visible: true });
assert(exports.getPanelState().visible === true, "setPanel updates visibility");

{
	const dt = { files: [{ name: "a.txt", webkitRelativePath: "" }], items: [] };
	const collected = await exports.collectDroppedFiles(dt);
	assert(collected.length === 1 && collected[0].relativePath === "a.txt", "plain file drop");
}

{
	const entries = [
		{ name: "b.txt", type: "file", size: 200, mtime: 2000 },
		{ name: ".hidden", type: "file", size: 10, mtime: 3000 },
		{ name: "a.txt", type: "file", size: 100, mtime: 1000 },
		{ name: "docs", type: "dir", size: 0, mtime: 500 },
	];
	const filtered = exports.filterEntries(entries, "", false);
	assert(filtered.length === 3 && !filtered.some((e) => e.name === ".hidden"), "hidden filtered by default");
	assert(exports.filterEntries(entries, "", true).length === 4, "show hidden");
	assert(exports.filterEntries(entries, "A.", false).length === 1, "filter is case-insensitive");
	const byName = exports.sortEntries(filtered, "name", 1).map((e) => e.name);
	assert(byName[0] === "docs" && byName[1] === "a.txt", "dirs first, then name: " + byName.join(","));
	const bySize = exports.sortEntries(filtered.filter((e) => e.type === "file"), "size", -1).map((e) => e.name);
	assert(bySize[0] === "b.txt", "size desc: " + bySize.join(","));
	const byMtime = exports.sortEntries(filtered.filter((e) => e.type === "file"), "mtime", 1).map((e) => e.name);
	assert(byMtime[0] === "a.txt", "mtime asc: " + byMtime.join(","));
}

{
	assert(exports.previewKind("photo.png", 100) === "image", "png previews as image");
	assert(exports.previewKind("readme.md", 100) === "text", "md previews as text");
	assert(exports.previewKind("big.log", 5 * 1024 * 1024) === "too-large", "large log too large");
	assert(exports.previewKind("blob.bin", 100) === "text", "small unknown previews as text");
	assert(exports.previewKind("blob.bin", 10 * 1024 * 1024) === "binary", "large unknown is binary");
	assert(typeof exports.RENDER_CAP === "number" && exports.RENDER_CAP >= 100, "render cap exported");
	assert(typeof exports.formatMtime(1700000000000) === "string" && exports.formatMtime(1700000000000).length > 0, "mtime formats");
}

if (failures > 0) {
	console.error(`\n${failures} failure(s)`);
	process.exit(1);
}
console.log("\nclient tests passed");
