/**
 * dsh-fart-search — browser half (hand-built in the client-modules bundle
 * format: window.__ModuleLoader__.load({ id, factory })). Only platform seed
 * words are required (react); everything else is self-contained.
 *
 * Right-docked FART panel in shell.overlay + a Search toggle in
 * sidebar.footer.action. Talks to /api/fart.search/* on the host.
 * Ctrl/Cmd+Shift+F opens and focuses the query box.
 */
window.__ModuleLoader__.load({
	id: "dsh-fart-search",
	factory: (require) => {
		var module = { exports: {} };
		var exports = module.exports;
		Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });
		let React = require("react");

		const css = [
			".fart-panel{position:fixed;top:0;right:0;bottom:0;z-index:1100;width:min(460px,94vw);display:flex;flex-direction:column;color-scheme:light dark;background:var(--dsw-alias-bg-layer-1,var(--dsw-alias-bg-base));color:var(--dsw-alias-label-primary);border-left:1px solid var(--dsw-alias-border-l2);box-shadow:-8px 0 24px color-mix(in srgb,var(--dsw-alias-label-primary) 16%,transparent);pointer-events:auto;font-family:var(--dsw-font-family,system-ui,-apple-system,sans-serif);font-size:13px;line-height:1.4}",
			".fart-panel.fart-wide{width:min(720px,96vw)}",
			".fart-head{display:flex;align-items:center;gap:8px;padding:8px 10px;background:var(--dsw-alias-interactive-bg-hover);border-bottom:1px solid var(--dsw-alias-border-l2);flex:0 0 auto;user-select:none}",
			".fart-title{font-weight:650;font-size:12px;letter-spacing:.08em;text-transform:uppercase;color:var(--dsw-alias-label-primary-bluish,var(--dsw-alias-label-primary))}",
			".fart-hint{flex:1;font-size:11px;color:var(--dsw-alias-label-tertiary);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}",
			".fart-btn{background:transparent;border:1px solid var(--dsw-alias-border-l2);color:inherit;border-radius:6px;font-size:11px;padding:3px 8px;cursor:pointer;font-family:inherit;line-height:1.3}",
			".fart-btn:hover:not(:disabled){background:var(--dsw-alias-interactive-bg-hover)}",
			".fart-btn:disabled{opacity:.45;cursor:not-allowed}",
			".fart-btn.fart-icon{min-width:26px;padding:3px 6px;text-align:center}",
			".fart-btn.fart-on{border-color:var(--dsw-alias-label-primary-bluish,var(--dsw-alias-border-l3));color:var(--dsw-alias-label-primary-bluish,inherit)}",
			".fart-search{display:flex;gap:6px;padding:8px 10px 4px;flex:0 0 auto}",
			".fart-search input{flex:1;min-width:0;background:var(--dsw-alias-bg-base);border:1px solid var(--dsw-alias-border-l2);border-radius:6px;color:var(--dsw-alias-label-primary);font:inherit;padding:6px 8px}",
			".fart-tools{display:flex;align-items:center;gap:4px;padding:4px 10px 8px;flex:0 0 auto;flex-wrap:wrap}",
			".fart-tools input.fart-glob{flex:1;min-width:80px;background:var(--dsw-alias-bg-base);border:1px solid var(--dsw-alias-border-l2);border-radius:6px;color:var(--dsw-alias-label-primary);font:inherit;padding:3px 6px;font-size:11px}",
			".fart-status{padding:4px 12px 8px;font-size:11px;color:var(--dsw-alias-label-secondary);flex:0 0 auto}",
			".fart-status.fart-error{color:var(--dsw-alias-state-error-primary)}",
			".fart-body{flex:1;overflow:auto;min-height:0}",
			".fart-empty{padding:24px 16px;color:var(--dsw-alias-label-secondary);text-align:center}",
			".fart-group{border-bottom:1px solid var(--dsw-alias-border-l2)}",
			".fart-file{display:flex;align-items:center;gap:8px;padding:6px 10px;cursor:pointer;background:transparent;border:none;width:100%;text-align:left;font:inherit;color:inherit}",
			".fart-file:hover{background:var(--dsw-alias-interactive-bg-hover)}",
			".fart-file-name{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-weight:600}",
			".fart-count{font-size:11px;color:var(--dsw-alias-label-tertiary);font-variant-numeric:tabular-nums}",
			".fart-hit{display:grid;grid-template-columns:48px 1fr;gap:8px;padding:3px 10px 3px 18px;cursor:pointer;border:none;width:100%;text-align:left;font:inherit;color:inherit;background:transparent}",
			".fart-hit:hover,.fart-hit.fart-selected{background:var(--dsw-alias-interactive-bg-active,var(--dsw-alias-bg-multi-select))}",
			".fart-ln{font-size:11px;color:var(--dsw-alias-label-tertiary);font-variant-numeric:tabular-nums;text-align:right}",
			".fart-text{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;font-size:12px}",
			".fart-text mark{background:color-mix(in srgb,var(--dsw-alias-label-primary-bluish,#8cf) 45%,transparent);color:inherit;padding:0 1px;border-radius:2px}",
			".fart-preview{flex:0 0 auto;max-height:40%;overflow:auto;border-top:1px solid var(--dsw-alias-border-l2);background:var(--dsw-alias-bg-base)}",
			".fart-preview-head{display:flex;align-items:center;gap:8px;padding:6px 10px;border-bottom:1px solid var(--dsw-alias-border-l2);font-size:12px}",
			".fart-preview-title{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-weight:600}",
			".fart-preview pre{margin:0;padding:8px 10px;font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;font-size:12px;white-space:pre-wrap;word-break:break-word}",
			".fart-preview .fart-here{background:color-mix(in srgb,var(--dsw-alias-label-primary-bluish,#8cf) 22%,transparent)}",
			".fart-toggle{display:inline-flex;align-items:center;gap:6px;background:transparent;border:1px solid transparent;color:inherit;border-radius:4px;padding:3px 8px;cursor:pointer;font-family:inherit;font-size:12px}",
			".fart-toggle:hover{background:var(--dsw-alias-interactive-bg-hover);border-color:var(--dsw-alias-border-l2)}",
			".fart-toggle.fart-active{color:var(--dsw-alias-label-primary-bluish,inherit);border-color:var(--dsw-alias-border-l3,var(--dsw-alias-border-l2))}",
			".fart-glyph{font-weight:700}",
		].join("\n");
		if (typeof document !== "undefined") {
			let styleTag = document.querySelector("style[data-plugin='dsh-fart-search']");
			if (styleTag === null) {
				styleTag = document.createElement("style");
				styleTag.dataset.plugin = "dsh-fart-search";
				document.head.appendChild(styleTag);
			}
			styleTag.textContent = css;
		}

		let panelState = { visible: false, wide: false, focusNonce: 0, version: 0 };
		const panelListeners = new Set();
		function setPanel(partial) {
			panelState = { ...panelState, ...partial, version: panelState.version + 1 };
			for (const listener of [...panelListeners]) listener();
		}
		function subscribePanel(listener) {
			panelListeners.add(listener);
			return () => panelListeners.delete(listener);
		}
		function getPanelState() {
			return panelState;
		}

		function escapeRegExp(value) {
			return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
		}

		function highlightParts(line, query, options = {}) {
			if (!query || typeof line !== "string") return [{ text: line ?? "", hit: false }];
			let source;
			try {
				source = options.regex ? query : escapeRegExp(query);
				const flags = options.caseSensitive ? "g" : "gi";
				const re = new RegExp(source, flags);
				const parts = [];
				let last = 0;
				let match;
				let guard = 0;
				while ((match = re.exec(line)) !== null) {
					if (match[0] === "") {
						re.lastIndex += 1;
						continue;
					}
					if (match.index > last) parts.push({ text: line.slice(last, match.index), hit: false });
					parts.push({ text: match[0], hit: true });
					last = match.index + match[0].length;
					if (++guard > 200) break;
				}
				if (last < line.length) parts.push({ text: line.slice(last), hit: false });
				return parts.length ? parts : [{ text: line, hit: false }];
			} catch {
				return [{ text: line, hit: false }];
			}
		}

		function groupMatches(matches) {
			const groups = [];
			const byPath = new Map();
			for (const match of matches ?? []) {
				if (!match || typeof match.path !== "string") continue;
				let group = byPath.get(match.path);
				if (!group) {
					group = { path: match.path, matches: [] };
					byPath.set(match.path, group);
					groups.push(group);
				}
				group.matches.push(match);
			}
			return groups;
		}

		function isSearchHotkey(event) {
			if (!event) return false;
			const key = String(event.key ?? "").toLowerCase();
			return (event.ctrlKey === true || event.metaKey === true) && event.shiftKey === true && key === "f" && event.altKey !== true;
		}

		function validateQuery(query, regex) {
			if (typeof query !== "string" || query === "") return "Type to search the workspace.";
			if (regex) {
				try {
					new RegExp(query);
				} catch {
					return "Invalid regular expression.";
				}
			}
			return null;
		}

		function apiUrl(route, params) {
			const url = new URL(`/api/fart.search/${route}`, globalThis.location?.origin || "http://dsh.internal");
			for (const [key, value] of Object.entries(params)) {
				if (value === undefined || value === null || value === false) continue;
				url.searchParams.set(key, String(value));
			}
			return url;
		}

		async function readError(response) {
			const header = response.headers?.get?.("x-dsh-fart-error");
			if (header) return header;
			try {
				const json = await response.json();
				if (json && typeof json.error === "string") return json.error;
			} catch {
				/* ignore */
			}
			return `HTTP ${response.status}`;
		}

		async function runQuery(sessionId, params, signal) {
			const response = await fetch(apiUrl("query", { sessionId, ...params }), { method: "GET", signal });
			if (!response.ok) throw new Error(await readError(response));
			return response.json();
		}

		async function runSnippet(sessionId, path, line, signal) {
			const response = await fetch(apiUrl("snippet", { sessionId, path, line }), { method: "GET", signal });
			if (!response.ok) throw new Error(await readError(response));
			return response.json();
		}

		function Highlighted({ line, query, regex, caseSensitive }) {
			const parts = highlightParts(line, query, { regex, caseSensitive });
			return React.createElement("span", { className: "fart-text", title: line },
				parts.map((part, i) => part.hit
					? React.createElement("mark", { key: i }, part.text)
					: React.createElement("span", { key: i }, part.text)));
		}

		function SearchPanelInner({ useSessions }) {
			const sessionId = typeof useSessions === "function"
				? useSessions((s) => s.current ?? null)
				: null;
			const panel = React.useSyncExternalStore(subscribePanel, getPanelState);
			const inputRef = React.useRef(null);
			const [query, setQuery] = React.useState("");
			const [kind, setKind] = React.useState("content");
			const [caseSensitive, setCaseSensitive] = React.useState(false);
			const [regex, setRegex] = React.useState(false);
			const [word, setWord] = React.useState(false);
			const [hidden, setHidden] = React.useState(false);
			const [allFiles, setAllFiles] = React.useState(false);
			const [include, setInclude] = React.useState("");
			const [result, setResult] = React.useState(null);
			const [error, setError] = React.useState("");
			const [busy, setBusy] = React.useState(false);
			const [openFiles, setOpenFiles] = React.useState({});
			const [selected, setSelected] = React.useState(null);
			const [snippet, setSnippet] = React.useState(null);

			React.useEffect(() => {
				if (panel.visible && inputRef.current) {
					inputRef.current.focus();
					inputRef.current.select?.();
				}
			}, [panel.visible, panel.focusNonce]);

			React.useEffect(() => {
				setResult(null);
				setError("");
				setSnippet(null);
				setSelected(null);
				setOpenFiles({});
			}, [sessionId]);

			React.useEffect(() => {
				const message = validateQuery(query, regex);
				if (message) {
					setError(query ? message : "");
					setResult(null);
					setBusy(false);
					return undefined;
				}
				if (!sessionId) {
					setError("Open a session to search its workspace.");
					setResult(null);
					return undefined;
				}
				const controller = new AbortController();
				setBusy(true);
				const timer = setTimeout(async () => {
					try {
						const data = await runQuery(sessionId, {
							q: query,
							kind,
							case: caseSensitive ? "1" : undefined,
							regex: regex ? "1" : undefined,
							word: word ? "1" : undefined,
							hidden: hidden ? "1" : undefined,
							all: allFiles ? "1" : undefined,
							include: include.trim() || undefined,
						}, controller.signal);
						if (controller.signal.aborted) return;
						setResult(data);
						setError("");
						const nextOpen = {};
						for (const group of groupMatches(data.matches)) nextOpen[group.path] = true;
						setOpenFiles(nextOpen);
					} catch (err) {
						if (controller.signal.aborted || err?.name === "AbortError") return;
						setResult(null);
						setError(err?.message || String(err));
					} finally {
						if (!controller.signal.aborted) setBusy(false);
					}
				}, 280);
				return () => {
					clearTimeout(timer);
					controller.abort();
				};
			}, [sessionId, query, kind, caseSensitive, regex, word, hidden, allFiles, include]);

			const groups = groupMatches(result?.matches);

			const onPick = React.useCallback(async (match) => {
				if (!sessionId) return;
				setSelected(`${match.path}:${match.line}`);
				try {
					const data = await runSnippet(sessionId, match.path, match.line);
					setSnippet(data);
					setPanel({ wide: true });
				} catch (err) {
					setSnippet({ error: err?.message || String(err), path: match.path, line: match.line, lines: [] });
				}
			}, [sessionId]);

			const toggleFile = React.useCallback((path) => {
				setOpenFiles((prev) => ({ ...prev, [path]: !prev[path] }));
			}, []);

			return React.createElement("div", {
				className: "fart-panel" + (panel.wide ? " fart-wide" : ""),
				role: "dialog",
				"aria-label": "FART search",
			},
				React.createElement("div", { className: "fart-head" },
					React.createElement("span", { className: "fart-title" }, "FART"),
					React.createElement("span", { className: "fart-hint" }, "Find And Retrieve Text · Ctrl+Shift+F"),
					React.createElement("button", {
						type: "button",
						className: "fart-btn fart-icon",
						title: panel.wide ? "Narrow panel" : "Widen panel",
						onClick: () => setPanel({ wide: !panel.wide }),
					}, panel.wide ? "⟩" : "⟨"),
					React.createElement("button", {
						type: "button",
						className: "fart-btn fart-icon",
						title: "Close",
						onClick: () => setPanel({ visible: false }),
					}, "×")
				),
				React.createElement("div", { className: "fart-search" },
					React.createElement("input", {
						ref: inputRef,
						value: query,
						"aria-label": "Search workspace",
						placeholder: kind === "files" ? "File name…" : "Search text or /regex/",
						onChange: (event) => setQuery(event.target.value),
						onKeyDown: (event) => {
							if (event.key === "Escape") setPanel({ visible: false });
						},
					})
				),
				React.createElement("div", { className: "fart-tools" },
					React.createElement("button", {
						type: "button",
						className: "fart-btn" + (kind === "content" ? " fart-on" : ""),
						onClick: () => setKind("content"),
						title: "Search file contents",
					}, "Text"),
					React.createElement("button", {
						type: "button",
						className: "fart-btn" + (kind === "files" ? " fart-on" : ""),
						onClick: () => setKind("files"),
						title: "Search file names",
					}, "Files"),
					React.createElement("button", {
						type: "button",
						className: "fart-btn fart-icon" + (caseSensitive ? " fart-on" : ""),
						title: "Match case",
						onClick: () => setCaseSensitive((v) => !v),
					}, "Aa"),
					React.createElement("button", {
						type: "button",
						className: "fart-btn fart-icon" + (regex ? " fart-on" : ""),
						title: "Regular expression",
						onClick: () => setRegex((v) => !v),
					}, ".*"),
					React.createElement("button", {
						type: "button",
						className: "fart-btn fart-icon" + (word ? " fart-on" : ""),
						title: "Whole word",
						onClick: () => setWord((v) => !v),
					}, "W"),
					React.createElement("button", {
						type: "button",
						className: "fart-btn fart-icon" + (hidden ? " fart-on" : ""),
						title: "Include hidden files",
						onClick: () => setHidden((v) => !v),
					}, "·"),
					React.createElement("button", {
						type: "button",
						className: "fart-btn" + (allFiles ? " fart-on" : ""),
						title: "Also search node_modules and ignored files",
						onClick: () => setAllFiles((v) => !v),
					}, "All"),
					React.createElement("input", {
						className: "fart-glob",
						value: include,
						"aria-label": "Include glob",
						placeholder: "include glob, e.g. *.js",
						onChange: (event) => setInclude(event.target.value),
					})
				),
				React.createElement("div", { className: "fart-status" + (error ? " fart-error" : "") },
					error || (!sessionId ? "Open a session to search its workspace."
						: busy ? "Searching…"
							: result ? `${result.count} ${kind === "files" ? "files" : "matches"}${result.truncated ? " (truncated)" : ""}`
								: "Results appear as you type.")
				),
				React.createElement("div", { className: "fart-body", role: "list" },
					!sessionId ? React.createElement("div", { className: "fart-empty" }, "Open a session to search its workspace.")
						: !query ? React.createElement("div", { className: "fart-empty" }, "Search the open workspace. Text mode uses ripgrep; Files mode matches names.")
							: error && !result ? React.createElement("div", { className: "fart-empty" }, error)
								: groups.length === 0 && !busy ? React.createElement("div", { className: "fart-empty" }, `No matches for “${query}”.`)
									: groups.map((group) => React.createElement("div", { key: group.path, className: "fart-group" },
										React.createElement("button", {
											type: "button",
											className: "fart-file",
											title: group.path,
											onClick: () => toggleFile(group.path),
										},
											React.createElement("span", null, openFiles[group.path] === false ? "▸" : "▾"),
											React.createElement("span", { className: "fart-file-name" }, group.path),
											React.createElement("span", { className: "fart-count" }, String(group.matches.length))
										),
										openFiles[group.path] === false ? null
											: kind === "files"
												? React.createElement("button", {
													type: "button",
													className: "fart-hit" + (selected === `${group.path}:1` ? " fart-selected" : ""),
													onClick: () => onPick({ path: group.path, line: 1 }),
												},
													React.createElement("span", { className: "fart-ln" }, ""),
													React.createElement("span", { className: "fart-text" }, "Open preview")
												)
												: group.matches.map((match) => React.createElement("button", {
													type: "button",
													key: `${match.path}:${match.line}:${match.column}`,
													className: "fart-hit" + (selected === `${match.path}:${match.line}` ? " fart-selected" : ""),
													onClick: () => onPick(match),
												},
													React.createElement("span", { className: "fart-ln" }, String(match.line)),
													React.createElement(Highlighted, { line: match.text, query, regex, caseSensitive })
												))
									))
				),
				snippet ? React.createElement("div", { className: "fart-preview", role: "region", "aria-label": "Snippet" },
					React.createElement("div", { className: "fart-preview-head" },
						React.createElement("span", { className: "fart-preview-title", title: snippet.path }, `${snippet.path ?? ""}${snippet.line ? `:${snippet.line}` : ""}`),
						React.createElement("button", {
							type: "button",
							className: "fart-btn fart-icon",
							title: "Close preview",
							onClick: () => setSnippet(null),
						}, "×")
					),
					snippet.error ? React.createElement("div", { className: "fart-empty" }, snippet.error)
						: React.createElement("pre", null,
							(snippet.lines ?? []).map((row) => React.createElement("div", {
								key: row.n,
								className: row.n === snippet.line ? "fart-here" : undefined,
							}, `${String(row.n).padStart(4, " ")}  ${row.text}`))
						)
				) : null
			);
		}

		function SearchOverlay(props) {
			const state = React.useSyncExternalStore(subscribePanel, getPanelState);
			if (!state.visible) return null;
			return React.createElement(SearchPanelInner, { useSessions: props.useSessions });
		}

		function SearchToggle(props) {
			const wide = props.wide === true;
			const state = React.useSyncExternalStore(subscribePanel, getPanelState);
			const onClick = React.useCallback(() => setPanel({ visible: !state.visible, focusNonce: Date.now() }), [state.visible]);
			return React.createElement("button", {
				className: "fart-toggle" + (state.visible ? " fart-active" : ""),
				onClick,
				title: "Toggle FART workspace search (Ctrl+Shift+F)",
			}, wide
				? React.createElement(React.Fragment, null, React.createElement("span", { className: "fart-glyph" }, "⌕"), " Search")
				: React.createElement("span", { className: "fart-glyph" }, "⌕"));
		}

		function onGlobalKeyDown(event) {
			if (!isSearchHotkey(event)) return;
			const target = event.target;
			const tag = target && target.tagName ? String(target.tagName).toLowerCase() : "";
			if (tag === "textarea") return;
			event.preventDefault();
			setPanel({ visible: true, focusNonce: Date.now() });
		}

		const inject = ["slots"];

		function apply(ctx) {
			ctx.slots.inject("shell.overlay", () => ctx.slots.register({
				name: "shell.overlay",
				id: "fart-search",
				order: 75,
				label: "FART",
			}, SearchOverlay));
			ctx.slots.inject("sidebar.footer.action", () => ctx.slots.register({
				name: "sidebar.footer.action",
				id: "fart-search-toggle",
				order: 25,
				label: "Search",
			}, SearchToggle));
			if (typeof document !== "undefined" && document.documentElement.dataset.fartHotkey !== "1") {
				document.documentElement.dataset.fartHotkey = "1";
				document.addEventListener("keydown", onGlobalKeyDown);
			}
		}

		exports.SearchOverlay = SearchOverlay;
		exports.SearchToggle = SearchToggle;
		exports.apply = apply;
		exports.inject = inject;
		exports.groupMatches = groupMatches;
		exports.highlightParts = highlightParts;
		exports.isSearchHotkey = isSearchHotkey;
		exports.validateQuery = validateQuery;
		exports.escapeRegExp = escapeRegExp;
		exports.getPanelState = getPanelState;
		exports.setPanel = setPanel;
		exports.apiUrl = apiUrl;
		return module.exports;
	},
});
