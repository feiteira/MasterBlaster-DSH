/**
 * dsh-session-icon — browser half (hand-built in the client-modules bundle
 * format: window.__ModuleLoader__.load({ id, factory })). Only platform seed
 * words are required (react).
 *
 * Reserves a left icon column on every session row so titles stay aligned,
 * then paints an optional glyph into that column. Click to pick or clear.
 */
window.__ModuleLoader__.load({
	id: "dsh-session-icon",
	factory: (require) => {
		var module = { exports: {} };
		var exports = module.exports;
		Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });
		let React = require("react");

		const ICONS = Object.freeze([
			{ id: "star", glyph: "⭐", label: "Star" },
			{ id: "smile", glyph: "😊", label: "Smiley" },
			{ id: "hourglass", glyph: "⏳", label: "Sandclock" },
			{ id: "clock", glyph: "🕒", label: "Clock" },
			{ id: "fire", glyph: "🔥", label: "Fire" },
			{ id: "bulb", glyph: "💡", label: "Idea" },
			{ id: "check", glyph: "✅", label: "Done" },
			{ id: "unchecked", glyph: "☐", label: "Unchecked" },
			{ id: "question", glyph: "❓", label: "Question" },
			{ id: "info", glyph: "ℹ️", label: "Info" },
			{ id: "exclaim", glyph: "❗", label: "Important" },
			{ id: "cross", glyph: "❌", label: "Blocked" },
			{ id: "eyes", glyph: "👀", label: "Review" },
			{ id: "speech", glyph: "💬", label: "Comment" },
			{ id: "target", glyph: "🎯", label: "Focus" },
			{ id: "test", glyph: "🧪", label: "Test" },
			{ id: "package", glyph: "📦", label: "Package" },
			{ id: "link", glyph: "🔗", label: "Link" },
			{ id: "wip", glyph: "🚧", label: "WIP" },
			{ id: "green", glyph: "🟢", label: "Green" },
			{ id: "yellow", glyph: "🟡", label: "Yellow" },
			{ id: "red", glyph: "🔴", label: "Red" },
			{ id: "pin", glyph: "📌", label: "Pin" },
			{ id: "rocket", glyph: "🚀", label: "Rocket" },
			{ id: "heart", glyph: "❤️", label: "Heart" },
			{ id: "bug", glyph: "🐛", label: "Bug" },
			{ id: "memo", glyph: "📝", label: "Notes" },
			{ id: "lock", glyph: "🔒", label: "Lock" },
			{ id: "sleep", glyph: "💤", label: "Later" },
			{ id: "warning", glyph: "⚠️", label: "Warning" },
			{ id: "sparkles", glyph: "✨", label: "Sparkles" },
			{ id: "folder", glyph: "📁", label: "Folder" },
			{ id: "hammer", glyph: "🔨", label: "Build" },
			{ id: "seedling", glyph: "🌱", label: "Growth" },
		]);
		const ICON_BY_ID = Object.freeze(Object.fromEntries(ICONS.map((icon) => [icon.id, icon])));
		const ICON_COLUMN_PX = 18;
		const ENDPOINT = "/api/session.icon";
		const SESSION_ID_RE = /^[a-zA-Z0-9_-]{1,160}$/u;

		const css = [
			`:root{--si-column:${ICON_COLUMN_PX}px}`,
			"[class*='_sessionRow']::before,[class*='_searchResultHeading']::before{content:'';flex:none;width:var(--si-column);height:var(--si-column);margin-right:2px}",
			"[class*='_searchResultMeta']{margin-left:calc(20px + var(--si-column) + 2px)!important}",
			".si-layer{position:absolute;inset:0;pointer-events:none;z-index:5}",
			".si-btn{pointer-events:auto;position:fixed;box-sizing:border-box;width:var(--si-column);height:var(--si-column);padding:0;margin:0;border:none;border-radius:4px;background:transparent;color:inherit;font:inherit;line-height:1;display:inline-flex;align-items:center;justify-content:center;cursor:pointer;opacity:0;z-index:6}",
			".si-btn.si-has,.si-btn.si-open{opacity:1}",
			".si-btn.si-row-hover:not(.si-has){opacity:.42}",
			".si-btn:hover,.si-btn:focus-visible{opacity:1;background:var(--dsw-alias-interactive-bg-hover,rgba(127,127,127,.18))}",
			".si-btn .si-plus{font-size:12px;font-weight:700;color:var(--dsw-alias-label-tertiary,currentColor);line-height:1}",
			".si-btn .si-glyph{font-size:13px;line-height:1}",
			".si-picker{pointer-events:auto;position:fixed;z-index:1300;width:232px;max-height:min(420px,calc(100vh - 16px));overflow:auto;padding:8px;border-radius:10px;background:var(--dsw-alias-bg-layer-1,var(--dsw-alias-bg-base,#111));color:var(--dsw-alias-label-primary,#eee);border:1px solid var(--dsw-alias-border-l2,rgba(127,127,127,.35));box-shadow:0 12px 32px color-mix(in srgb,var(--dsw-alias-label-primary,#000) 18%,transparent);font-family:var(--dsw-font-family,system-ui,-apple-system,sans-serif)}",
			".si-picker-title{font-size:11px;font-weight:650;letter-spacing:.04em;text-transform:uppercase;color:var(--dsw-alias-label-secondary);padding:2px 4px 8px}",
			".si-grid{display:grid;grid-template-columns:repeat(5,1fr);gap:4px}",
			".si-choice{width:100%;aspect-ratio:1;border:1px solid transparent;border-radius:8px;background:transparent;color:inherit;cursor:pointer;font-size:18px;line-height:1;display:flex;align-items:center;justify-content:center}",
			".si-choice:hover,.si-choice:focus-visible{background:var(--dsw-alias-interactive-bg-hover,rgba(127,127,127,.18))}",
			".si-choice.si-selected{border-color:var(--dsw-alias-label-primary-bluish,var(--dsw-alias-border-l3));background:var(--dsw-alias-interactive-bg-active,rgba(127,127,127,.22))}",
			".si-clear{display:block;width:100%;margin-top:8px;padding:6px 8px;border:1px solid var(--dsw-alias-border-l2,rgba(127,127,127,.35));border-radius:8px;background:transparent;color:inherit;cursor:pointer;font:inherit;font-size:12px}",
			".si-clear:hover,.si-clear:focus-visible{background:var(--dsw-alias-interactive-bg-hover,rgba(127,127,127,.18))}",
		].join("\n");

		if (typeof document !== "undefined") {
			let styleTag = document.querySelector("style[data-plugin='dsh-session-icon']");
			if (styleTag === null) {
				styleTag = document.createElement("style");
				styleTag.dataset.plugin = "dsh-session-icon";
				document.head.appendChild(styleTag);
			}
			styleTag.textContent = css;
		}

		function isSessionId(value) {
			return typeof value === "string" && SESSION_ID_RE.test(value);
		}

		function classNameOf(el) {
			if (!el) return "";
			const value = el.className;
			if (typeof value === "string") return value;
			if (value && typeof value.baseVal === "string") return value.baseVal;
			return String(value ?? "");
		}

		function isSessionRow(el) {
			if (!el || el.getAttribute?.("role") !== "treeitem") return false;
			const cls = classNameOf(el);
			return /(?:^|\s)\S*_sessionRow(?:\s|$)/.test(cls) || /(?:^|\s)\S*_searchResultRow(?:\s|$)/.test(cls);
		}

		function titleOfRow(el) {
			if (!el || typeof el.querySelector !== "function") return "";
			const node = el.querySelector("[class*='_title'], [class*='_searchResultTitle']");
			return (node && node.textContent ? String(node.textContent) : "").trim();
		}

		function sessionIdFromFiber(el) {
			if (!el) return null;
			const key = Object.keys(el).find((name) => name.startsWith("__reactFiber$") || name.startsWith("__reactInternalInstance$"));
			if (key === undefined) return null;
			let fiber = el[key];
			for (let i = 0; i < 48 && fiber; i += 1, fiber = fiber.return) {
				const props = fiber.memoizedProps || fiber.pendingProps;
				const id = props?.node?.id ?? props?.result?.id;
				if (isSessionId(id)) return id;
			}
			return null;
		}

		function sessionIdFromList(el, list) {
			const title = titleOfRow(el);
			if (!title || !list) return null;
			const matches = [];
			for (const id of list.ids ?? []) {
				const summary = list.byId?.[id];
				if (!summary || summary.blank) continue;
				if (summary.title === title) matches.push(id);
			}
			return matches.length === 1 ? matches[0] : null;
		}

		function sessionIdFromElement(el, list) {
			const marked = el?.dataset?.sessionId;
			if (isSessionId(marked)) return marked;
			const fromFiber = sessionIdFromFiber(el);
			if (fromFiber) {
				if (el.dataset) el.dataset.sessionId = fromFiber;
				return fromFiber;
			}
			const fromList = sessionIdFromList(el, list);
			if (fromList && el.dataset) el.dataset.sessionId = fromList;
			return fromList;
		}

		function clipParent(el) {
			let node = el?.parentElement;
			while (node && node !== document.body) {
				const style = globalThis.getComputedStyle?.(node);
				const overflow = `${style?.overflow ?? ""} ${style?.overflowY ?? ""}`;
				if (/(auto|scroll|hidden)/.test(overflow)) return node;
				node = node.parentElement;
			}
			return null;
		}

		function iconBoxForRow(el) {
			const rect = el.getBoundingClientRect();
			if (rect.width < 8 || rect.height < 8) return null;
			const clip = clipParent(el);
			if (clip) {
				const bounds = clip.getBoundingClientRect();
				if (rect.bottom < bounds.top + 2 || rect.top > bounds.bottom - 2) return null;
			}
			const styles = globalThis.getComputedStyle?.(el);
			const padLeft = Number.parseFloat(styles?.paddingLeft ?? "8") || 8;
			return {
				left: rect.left + padLeft,
				top: rect.top + (rect.height - ICON_COLUMN_PX) / 2,
				width: ICON_COLUMN_PX,
				height: ICON_COLUMN_PX,
			};
		}

		function collectRows(root, list) {
			const found = [];
			if (!root || typeof root.querySelectorAll !== "function") return found;
			for (const el of root.querySelectorAll('[role="treeitem"]')) {
				if (!isSessionRow(el)) continue;
				const id = sessionIdFromElement(el, list);
				if (!id) continue;
				const box = iconBoxForRow(el);
				if (!box) continue;
				found.push({ id, el, box });
			}
			return found;
		}

		function pickerStyle(anchor) {
			const width = 232;
			const height = 420;
			let left = anchor.left + ICON_COLUMN_PX + 6;
			let top = anchor.top;
			const vw = globalThis.innerWidth ?? 800;
			const vh = globalThis.innerHeight ?? 600;
			if (left + width > vw - 8) left = Math.max(8, anchor.left - width - 6);
			if (top + height > vh - 8) top = Math.max(8, vh - height - 8);
			if (top < 8) top = 8;
			return { position: "fixed", left, top, width, zIndex: 1300 };
		}

		const STORAGE_KEY = "dsh-session-icon.v1";

		function readLocal(storage) {
			const backend = storage ?? globalThis.localStorage;
			if (!backend?.getItem) return {};
			try {
				const raw = JSON.parse(backend.getItem(STORAGE_KEY) || "{}");
				return raw && typeof raw === "object" && !Array.isArray(raw) ? raw : {};
			} catch {
				return {};
			}
		}

		function writeLocal(record, storage) {
			const backend = storage ?? globalThis.localStorage;
			if (!backend?.setItem) return;
			try { backend.setItem(STORAGE_KEY, JSON.stringify(record)); } catch { /* quota / private mode */ }
		}

		function catalogMap(map) {
			const next = {};
			if (!map || typeof map !== "object") return next;
			for (const [sessionId, icon] of Object.entries(map)) {
				if (isSessionId(sessionId) && ICON_BY_ID[icon]) next[sessionId] = icon;
			}
			return next;
		}

		function mergeIcons(server, overlay) {
			const next = catalogMap(server);
			for (const [sessionId, icon] of Object.entries(overlay ?? {})) {
				if (!isSessionId(sessionId)) continue;
				if (icon === null) delete next[sessionId];
				else if (ICON_BY_ID[icon]) next[sessionId] = icon;
			}
			return next;
		}

		function createIconStore({ storage } = {}) {
			let server = {};
			let overlay = readLocal(storage);
			let icons = Object.freeze(mergeIcons(server, overlay));
			const listeners = new Set();
			const emit = () => {
				for (const listener of [...listeners]) listener();
			};
			const apply = () => {
				icons = Object.freeze(mergeIcons(server, overlay));
				writeLocal(overlay, storage);
				emit();
			};
			return {
				subscribe(listener) {
					listeners.add(listener);
					return () => listeners.delete(listener);
				},
				getSnapshot() {
					return icons;
				},
				setLocal(sessionId, icon) {
					overlay = { ...overlay, [sessionId]: icon };
					apply();
				},
				replaceAll(map) {
					server = catalogMap(map);
					apply();
				},
			};
		}

		const store = createIconStore();

		async function loadIcons(fetcher = (...args) => globalThis.fetch(...args)) {
			const response = await fetcher(ENDPOINT, { credentials: "same-origin", cache: "no-store" });
			if (!response.ok) throw new Error("Could not load session icons.");
			const json = await response.json();
			store.replaceAll(json?.icons);
			return store.getSnapshot();
		}

		async function saveIcon(sessionId, icon, fetcher = (...args) => globalThis.fetch(...args)) {
			if (!isSessionId(sessionId)) throw new Error("Missing or invalid sessionId.");
			if (icon !== null && ICON_BY_ID[icon] === undefined) throw new Error("Unknown session icon.");
			store.setLocal(sessionId, icon);
			try {
				const response = await fetcher(ENDPOINT, {
					method: "POST",
					credentials: "same-origin",
					cache: "no-store",
					headers: { "content-type": "application/json" },
					body: JSON.stringify({ sessionId, icon }),
				});
				if (!response.ok) return icon;
				const json = await response.json();
				return json?.icon ?? icon;
			} catch {
				return icon;
			}
		}

		function SessionIconLayer({ sessions }) {
			const icons = React.useSyncExternalStore(store.subscribe, store.getSnapshot, store.getSnapshot);
			const [rows, setRows] = React.useState([]);
			const [hoveredId, setHoveredId] = React.useState(null);
			const [picker, setPicker] = React.useState(null);
			const pickerRef = React.useRef(null);

			const scan = React.useCallback(() => {
				const list = sessions?.list?.getSnapshot?.();
				const found = collectRows(document, list);
				setRows(found);
				setPicker((current) => {
					if (!current) return current;
					const next = found.find((row) => row.id === current.id);
					if (!next) return null;
					const box = next.box;
					if (current.box.left === box.left && current.box.top === box.top) return current;
					return { id: current.id, box };
				});
			}, [sessions]);

			React.useEffect(() => {
				let frame = 0;
				const schedule = () => {
					if (frame) return;
					frame = globalThis.requestAnimationFrame(() => {
						frame = 0;
						scan();
					});
				};
				scan();
				loadIcons().then(scan).catch(() => {});
				const unsubscribe = sessions?.list?.subscribe?.(scan);
				const onPointer = (event) => {
					const row = event.target?.closest?.('[role="treeitem"]');
					if (row && isSessionRow(row)) {
						const list = sessions?.list?.getSnapshot?.();
						setHoveredId(sessionIdFromElement(row, list));
					} else if (!event.target?.closest?.(".si-btn, .si-picker")) {
						setHoveredId(null);
					}
				};
				document.addEventListener("pointerover", onPointer, true);
				document.addEventListener("scroll", schedule, true);
				globalThis.addEventListener?.("resize", schedule);
				const observer = typeof MutationObserver === "function"
					? new MutationObserver(schedule)
					: null;
				observer?.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ["class", "aria-selected"] });
				const interval = globalThis.setInterval(schedule, 800);
				return () => {
					document.removeEventListener("pointerover", onPointer, true);
					document.removeEventListener("scroll", schedule, true);
					globalThis.removeEventListener?.("resize", schedule);
					observer?.disconnect();
					unsubscribe?.();
					globalThis.clearInterval(interval);
					if (frame) globalThis.cancelAnimationFrame(frame);
				};
			}, [scan, sessions]);

			React.useEffect(() => {
				if (!picker) return undefined;
				const onKey = (event) => {
					if (event.key === "Escape") setPicker(null);
				};
				const onDown = (event) => {
					if (event.target?.closest?.(".si-picker, .si-btn")) return;
					setPicker(null);
				};
				document.addEventListener("keydown", onKey);
				document.addEventListener("pointerdown", onDown, true);
				return () => {
					document.removeEventListener("keydown", onKey);
					document.removeEventListener("pointerdown", onDown, true);
				};
			}, [picker]);

			const openPicker = (row, event) => {
				event.preventDefault();
				event.stopPropagation();
				setPicker((current) => current?.id === row.id ? null : { id: row.id, box: row.box });
			};

			const choose = (sessionId, icon) => {
				saveIcon(sessionId, icon).catch(() => {});
				setPicker(null);
			};

			return React.createElement("div", { className: "si-layer", "data-session-icon": "1" },
				rows.map((row) => {
					const icon = ICON_BY_ID[icons[row.id]];
					const open = picker?.id === row.id;
					return React.createElement("button", {
						key: row.id,
						type: "button",
						className: "si-btn" + (icon ? " si-has" : "") + (open ? " si-open" : "") + (hoveredId === row.id ? " si-row-hover" : ""),
						style: { left: row.box.left, top: row.box.top },
						title: icon ? `${icon.label} — change session icon` : "Add session icon",
						"aria-label": icon ? `Session icon: ${icon.label}` : "Add session icon",
						"aria-haspopup": "dialog",
						"aria-expanded": open,
						onClick: (event) => openPicker(row, event),
					}, icon
						? React.createElement("span", { className: "si-glyph" }, icon.glyph)
						: React.createElement("span", { className: "si-plus", "aria-hidden": "true" }, "+"));
				}),
				picker ? React.createElement("div", {
					className: "si-picker",
					role: "dialog",
					"aria-label": "Choose session icon",
					ref: pickerRef,
					style: pickerStyle(picker.box),
				},
					React.createElement("div", { className: "si-picker-title" }, "Session icon"),
					React.createElement("div", { className: "si-grid" },
						ICONS.map((icon) => React.createElement("button", {
							key: icon.id,
							type: "button",
							className: "si-choice" + (icons[picker.id] === icon.id ? " si-selected" : ""),
							title: icon.label,
							"aria-label": icon.label,
							onClick: () => choose(picker.id, icon.id),
						}, icon.glyph))
					),
					React.createElement("button", {
						type: "button",
						className: "si-clear",
						onClick: () => choose(picker.id, null),
					}, "No icon")
				) : null
			);
		}

		const inject = ["slots", "sessions"];

		function apply(ctx) {
			const sessions = ctx.get("sessions");
			ctx.slots.inject("shell.overlay", () => ctx.slots.register({
				name: "shell.overlay",
				id: "session-icon",
				order: 40,
				label: "Session icons",
			}, function SessionIconOverlay() {
				return React.createElement(SessionIconLayer, { sessions });
			}));
		}

		exports.ICONS = ICONS;
		exports.ICON_BY_ID = ICON_BY_ID;
		exports.ICON_COLUMN_PX = ICON_COLUMN_PX;
		exports.apply = apply;
		exports.inject = inject;
		exports.isSessionId = isSessionId;
		exports.isSessionRow = isSessionRow;
		exports.titleOfRow = titleOfRow;
		exports.sessionIdFromFiber = sessionIdFromFiber;
		exports.sessionIdFromList = sessionIdFromList;
		exports.sessionIdFromElement = sessionIdFromElement;
		exports.iconBoxForRow = iconBoxForRow;
		exports.collectRows = collectRows;
		exports.pickerStyle = pickerStyle;
		exports.createIconStore = createIconStore;
		exports.mergeIcons = mergeIcons;
		exports.loadIcons = loadIcons;
		exports.saveIcon = saveIcon;
		exports.store = store;
		exports.SessionIconLayer = SessionIconLayer;
		return module.exports;
	},
});
