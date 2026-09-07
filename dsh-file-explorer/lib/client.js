/**
 * dsh-file-explorer — browser half (hand-built in the client-modules bundle
 * format: window.__ModuleLoader__.load({ id, factory })). Only platform seed
 * words are required (react); everything else is self-contained.
 *
 * Right-docked explorer in shell.overlay + a Files toggle in
 * sidebar.footer.action. Talks to /api/file.explorer/* on the host.
 */
window.__ModuleLoader__.load({
	id: "dsh-file-explorer",
	factory: (require) => {
		var module = { exports: {} };
		var exports = module.exports;
		Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });
		let React = require("react");

		const css = [
			".fe-panel{position:fixed;top:0;right:0;bottom:0;z-index:1100;width:min(420px,92vw);display:flex;flex-direction:column;color-scheme:light dark;background:var(--dsw-alias-bg-layer-1,var(--dsw-alias-bg-base));color:var(--dsw-alias-label-primary);border-left:1px solid var(--dsw-alias-border-l2);box-shadow:-8px 0 24px color-mix(in srgb,var(--dsw-alias-label-primary) 16%,transparent);pointer-events:auto;font-family:var(--dsw-font-family,system-ui,-apple-system,sans-serif);font-size:13px;line-height:1.4}",
			".fe-panel.fe-wide{width:min(640px,96vw)}",
			".fe-head{display:flex;align-items:center;gap:8px;padding:8px 10px;background:var(--dsw-alias-interactive-bg-hover);border-bottom:1px solid var(--dsw-alias-border-l2);flex:0 0 auto;user-select:none}",
			".fe-title{font-weight:650;font-size:12px;letter-spacing:.04em;text-transform:uppercase;color:var(--dsw-alias-label-primary-bluish,var(--dsw-alias-label-primary))}",
			".fe-cwd{flex:1;font-size:11px;color:var(--dsw-alias-label-secondary);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;direction:rtl;text-align:left}",
			".fe-btn{background:transparent;border:1px solid var(--dsw-alias-border-l2);color:inherit;border-radius:6px;font-size:11px;padding:3px 8px;cursor:pointer;font-family:inherit;line-height:1.3}",
			".fe-btn:hover:not(:disabled){background:var(--dsw-alias-interactive-bg-hover)}",
			".fe-btn:disabled{opacity:.45;cursor:not-allowed}",
			".fe-btn.fe-icon{min-width:24px;padding:3px 6px;text-align:center}",
			".fe-btn.fe-primary{border-color:var(--dsw-alias-border-l3,var(--dsw-alias-border-l2))}",
			".fe-crumb{display:flex;align-items:center;gap:2px;padding:6px 10px;border-bottom:1px solid var(--dsw-alias-border-l2);flex:0 0 auto;overflow-x:auto;white-space:nowrap}",
			".fe-crumb button{background:transparent;border:none;color:var(--dsw-alias-label-secondary);cursor:pointer;font:inherit;padding:2px 4px;border-radius:4px}",
			".fe-crumb button:hover{background:var(--dsw-alias-interactive-bg-hover);color:var(--dsw-alias-label-primary)}",
			".fe-crumb button.fe-here{color:var(--dsw-alias-label-primary);font-weight:600}",
			".fe-crumb-sep{color:var(--dsw-alias-label-tertiary);opacity:.8;padding:0 1px}",
			".fe-toolbar{display:flex;align-items:center;gap:6px;padding:6px 10px;flex:0 0 auto;flex-wrap:wrap}",
			".fe-status{flex:1;font-size:11px;color:var(--dsw-alias-label-secondary);min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}",
			".fe-status.fe-error{color:var(--dsw-alias-state-error-primary)}",
			".fe-body{flex:1;overflow:auto;position:relative}",
			".fe-empty{padding:24px 16px;color:var(--dsw-alias-label-secondary);text-align:center}",
			".fe-row{display:grid;grid-template-columns:22px 1fr auto auto;align-items:center;gap:8px;padding:5px 12px;cursor:pointer;border-bottom:1px solid transparent}",
			".fe-row:hover{background:var(--dsw-alias-interactive-bg-hover)}",
			".fe-row.fe-selected{background:var(--dsw-alias-interactive-bg-active,var(--dsw-alias-bg-multi-select))}",
			".fe-icon-cell{font-size:14px;text-align:center;line-height:1}",
			".fe-name{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:var(--dsw-alias-label-primary)}",
			".fe-meta{font-size:11px;color:var(--dsw-alias-label-tertiary);font-variant-numeric:tabular-nums;white-space:nowrap}",
			".fe-row-actions{display:flex;gap:4px;opacity:0}",
			".fe-row:hover .fe-row-actions,.fe-row.fe-selected .fe-row-actions,.fe-row:focus-within .fe-row-actions{opacity:1}",
			"@media (hover:none){.fe-row-actions{opacity:1}}",
			".fe-filter{display:flex;gap:6px;padding:6px 10px;flex:0 0 auto}",
			".fe-filter input{flex:1;min-width:0;background:var(--dsw-alias-bg-base);border:1px solid var(--dsw-alias-border-l2);border-radius:6px;color:var(--dsw-alias-label-primary);font:inherit;padding:4px 8px}",
			".fe-filter select{background:var(--dsw-alias-bg-base);border:1px solid var(--dsw-alias-border-l2);border-radius:6px;color:var(--dsw-alias-label-primary);font:inherit;padding:4px 6px;max-width:110px}",
			".fe-progress{height:3px;background:var(--dsw-alias-border-l2);border-radius:2px;overflow:hidden;margin:0 10px 6px;flex:0 0 auto}",
			".fe-progress i{display:block;height:100%;background:var(--dsw-alias-label-primary-bluish,var(--dsw-alias-label-primary));transition:width .15s}",
			".fe-confirm{margin:6px 10px;padding:10px;border:1px solid var(--dsw-alias-state-error-primary,var(--dsw-alias-border-l3));border-radius:8px;font-size:12px;flex:0 0 auto}",
			".fe-confirm-btns{display:flex;gap:6px;margin-top:8px}",
			".fe-preview{position:absolute;inset:0;background:var(--dsw-alias-bg-layer-1,var(--dsw-alias-bg-base));display:flex;flex-direction:column;z-index:5}",
			".fe-preview-head{display:flex;align-items:center;gap:8px;padding:8px 10px;border-bottom:1px solid var(--dsw-alias-border-l2)}",
			".fe-preview-title{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-weight:600}",
			".fe-preview-body{flex:1;overflow:auto;padding:10px}",
			".fe-preview-body pre{margin:0;white-space:pre-wrap;word-break:break-word;font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;font-size:12px}",
			".fe-preview-body img{max-width:100%;border-radius:6px}",
			".fe-showall{display:block;width:calc(100% - 20px);margin:8px 10px}",
			".fe-drop{pointer-events:none;position:absolute;inset:8px;border:2px dashed var(--dsw-alias-border-l3,var(--dsw-alias-border-l2));border-radius:10px;background:var(--dsw-alias-bg-mask-drop);display:flex;align-items:center;justify-content:center;font-size:14px;font-weight:600;color:var(--dsw-alias-label-primary)}",
			".fe-panel.fe-dragging .fe-drop{pointer-events:none}",
			".fe-hint{margin:8px 10px 12px;padding:10px;border:1px dashed var(--dsw-alias-border-l2);border-radius:8px;font-size:12px;color:var(--dsw-alias-label-secondary);text-align:center}",
			".fe-new{display:flex;gap:6px;padding:6px 10px;flex:0 0 auto}",
			".fe-new input{flex:1;min-width:0;background:var(--dsw-alias-bg-base);border:1px solid var(--dsw-alias-border-l2);border-radius:6px;color:var(--dsw-alias-label-primary);font:inherit;padding:4px 8px}",
			".fe-toggle{display:inline-flex;align-items:center;gap:6px;background:transparent;border:1px solid transparent;color:inherit;border-radius:4px;padding:3px 8px;cursor:pointer;font-family:inherit;font-size:12px}",
			".fe-toggle:hover{background:var(--dsw-alias-interactive-bg-hover);border-color:var(--dsw-alias-border-l2)}",
			".fe-toggle.fe-active{color:var(--dsw-alias-label-primary-bluish,inherit);border-color:var(--dsw-alias-border-l3,var(--dsw-alias-border-l2))}",
			".fe-glyph{font-weight:700}"
		].join("\n");
		if (typeof document !== "undefined") {
			let styleTag = document.querySelector("style[data-plugin='dsh-file-explorer']");
			if (styleTag === null) {
				styleTag = document.createElement("style");
				styleTag.dataset.plugin = "dsh-file-explorer";
				document.head.appendChild(styleTag);
			}
			styleTag.textContent = css;
		}

		let panelState = { visible: false, wide: false, version: 0 };
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

		function joinRel(dir, name) {
			if (!dir) return name;
			if (!name) return dir;
			return `${dir}/${name}`;
		}
		function parentRel(dir) {
			if (!dir) return "";
			const i = dir.lastIndexOf("/");
			return i === -1 ? "" : dir.slice(0, i);
		}
		function splitRel(dir) {
			if (!dir) return [];
			return dir.split("/").filter(Boolean);
		}
		function formatBytes(n) {
			const value = Number(n);
			if (!Number.isFinite(value) || value < 0) return "";
			if (value < 1024) return `${value} B`;
			const units = ["KB", "MB", "GB", "TB"];
			let size = value / 1024;
			let u = 0;
			while (size >= 1024 && u < units.length - 1) {
				size /= 1024;
				u++;
			}
			const digits = size >= 10 || u === 0 ? 0 : 1;
			return `${size.toFixed(digits)} ${units[u]}`;
		}
		function formatMtime(ms) {
			if (!Number.isFinite(ms) || ms <= 0) return "";
			const d = new Date(ms);
			if (Number.isNaN(d.getTime())) return "";
			const pad = (x) => String(x).padStart(2, "0");
			return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
		}
		function iconFor(type) {
			if (type === "dir") return "📁";
			if (type === "symlink") return "🔗";
			return "📄";
		}

		function apiUrl(route, params) {
			const url = new URL(`/api/file.explorer/${route}`, globalThis.location?.origin || "http://dsh.internal");
			for (const [key, value] of Object.entries(params)) {
				if (value === undefined || value === null) continue;
				url.searchParams.set(key, String(value));
			}
			return url;
		}

		async function readError(response) {
			const header = response.headers?.get?.("x-dsh-explorer-error");
			if (header) return header;
			try {
				const json = await response.json();
				if (json && typeof json.error === "string") return json.error;
			} catch {
				/* ignore */
			}
			return `HTTP ${response.status}`;
		}

		async function listDir(sessionId, path) {
			const response = await fetch(apiUrl("list", { sessionId, path }), { method: "GET" });
			if (!response.ok) throw new Error(await readError(response));
			return response.json();
		}

		function startDownload(sessionId, path, filename) {
			const url = apiUrl("download", { sessionId, path });
			const anchor = document.createElement("a");
			anchor.href = url.toString();
			anchor.download = filename || "download";
			document.body.appendChild(anchor);
			anchor.click();
			anchor.remove();
		}

		function zipArchiveName(path, cwd) {
			if (path) {
				const parts = String(path).split("/").filter(Boolean);
				const last = parts[parts.length - 1];
				if (last) return `${last}.zip`;
			}
			if (cwd) {
				const parts = String(cwd).split(/[\\/]/).filter(Boolean);
				const last = parts[parts.length - 1];
				if (last) return `${last}.zip`;
			}
			return "workspace.zip";
		}

		function startZip(sessionId, path, filename) {
			const url = apiUrl("zip", { sessionId, path: path ?? "" });
			const anchor = document.createElement("a");
			anchor.href = url.toString();
			anchor.download = filename || "folder.zip";
			document.body.appendChild(anchor);
			anchor.click();
			anchor.remove();
		}

		function uploadFile(sessionId, dir, file, relativePath, overwrite, onProgress) {
			return new Promise((resolve, reject) => {
				const xhr = new XMLHttpRequest();
				const url = apiUrl("upload", {
					sessionId,
					dir,
					name: relativePath,
					overwrite: overwrite ? "1" : undefined,
				});
				xhr.open("POST", url.toString());
				xhr.setRequestHeader("Content-Type", "application/octet-stream");
				if (typeof onProgress === "function" && xhr.upload) {
					xhr.upload.onprogress = (event) => {
						if (event.lengthComputable) onProgress(event.loaded / event.total);
						else onProgress(null);
					};
				}
				xhr.onload = () => {
					if (xhr.status === 200 || xhr.status === 201) {
						try {
							resolve(JSON.parse(xhr.responseText));
						} catch {
							resolve({ path: relativePath });
						}
					} else if (xhr.status === 409) {
						const err = new Error("file already exists");
						err.code = 409;
						reject(err);
					} else {
						reject(new Error(xhr.getResponseHeader("x-dsh-explorer-error") || `HTTP ${xhr.status}`));
					}
				};
				xhr.onerror = () => reject(new Error("upload failed"));
				xhr.send(file);
			});
		}

		async function mkdirPath(sessionId, path) {
			const response = await fetch(apiUrl("mkdir", { sessionId, path }), { method: "POST" });
			if (!response.ok) throw new Error(await readError(response));
			return response.json();
		}

		async function deletePath(sessionId, path) {
			const response = await fetch(apiUrl("delete", { sessionId, path }), { method: "POST" });
			if (!response.ok) throw new Error(await readError(response));
			return response.json();
		}

		async function renamePath(sessionId, from, to, overwrite) {
			const response = await fetch(apiUrl("rename", { sessionId, from, to, overwrite: overwrite ? "1" : undefined }), { method: "POST" });
			if (!response.ok) {
				const err = new Error(await readError(response));
				err.code = response.status;
				throw err;
			}
			return response.json();
		}

		/** Render cap for huge folders (filter first; "Show all" lifts the cap). */
		const RENDER_CAP = 500;

		/** Filter by substring (case-insensitive) and hide dotfiles unless asked. */
		function filterEntries(entries, query, showHidden) {
			const q = String(query ?? "").trim().toLowerCase();
			return (entries ?? []).filter((e) => {
				if (!showHidden && e.name.startsWith(".")) return false;
				if (q && !e.name.toLowerCase().includes(q)) return false;
				return true;
			});
		}

		/** Sort: dirs first, then key (name/size/mtime), then name for stability. */
		function sortEntries(entries, sortKey, sortDir) {
			const dir = sortDir === -1 ? -1 : 1;
			const rank = (t) => (t === "dir" ? 0 : t === "symlink" ? 2 : 1);
			return [...(entries ?? [])].sort((a, b) => {
				const d = rank(a.type) - rank(b.type);
				if (d !== 0) return d;
				if (sortKey === "size") {
					const s = (a.size ?? 0) - (b.size ?? 0);
					if (s !== 0) return dir * s;
				} else if (sortKey === "mtime") {
					const m = (a.mtime ?? 0) - (b.mtime ?? 0);
					if (m !== 0) return dir * m;
				} else {
					const c = a.name.localeCompare(b.name);
					if (c !== 0) return dir * c;
				}
				return a.name.localeCompare(b.name);
			});
		}

		const TEXT_EXTENSIONS = new Set(["txt", "md", "markdown", "log", "json", "jsonl", "yaml", "yml", "csv", "tsv", "xml", "html", "htm", "css", "js", "mjs", "cjs", "ts", "tsx", "jsx", "py", "sh", "toml", "ini", "cfg", "env", "gitignore", "dockerfile"]);
		const IMAGE_EXTENSIONS = new Set(["png", "jpg", "jpeg", "gif", "webp", "svg"]);

		function previewKind(name, size) {
			const ext = String(name ?? "").split(".").pop()?.toLowerCase() ?? "";
			if (IMAGE_EXTENSIONS.has(ext)) return "image";
			if (TEXT_EXTENSIONS.has(ext) || ext === name?.toLowerCase()) {
				if (typeof size === "number" && size > 1024 * 1024) return "too-large";
				return "text";
			}
			if (typeof size === "number" && size <= 256 * 1024) return "text";
			return "binary";
		}

		async function fetchTextPreview(sessionId, path) {
			const response = await fetch(apiUrl("download", { sessionId, path }), { method: "GET" });
			if (!response.ok) throw new Error(await readError(response));
			const text = await response.text();
			return text.length > 20000 ? text.slice(0, 20000) + "\n… (truncated)" : text;
		}

		function readEntries(reader) {
			return new Promise((resolve, reject) => {
				const acc = [];
				const pump = () => {
					reader.readEntries((batch) => {
						if (!batch.length) {
							resolve(acc);
							return;
						}
						acc.push(...batch);
						pump();
					}, reject);
				};
				pump();
			});
		}

		function fileOfEntry(entry) {
			return new Promise((resolve, reject) => entry.file(resolve, reject));
		}

		async function walkEntry(entry, prefix, out, cap) {
			if (out.length >= cap) return;
			if (entry.isFile) {
				const file = await fileOfEntry(entry);
				out.push({ file, relativePath: prefix ? `${prefix}/${entry.name}` : entry.name });
				return;
			}
			if (entry.isDirectory) {
				const next = prefix ? `${prefix}/${entry.name}` : entry.name;
				const children = await readEntries(entry.createReader());
				for (const child of children) {
					if (out.length >= cap) return;
					await walkEntry(child, next, out, cap);
				}
			}
		}

		async function collectDroppedFiles(dataTransfer, cap = 500) {
			const out = [];
			const items = dataTransfer?.items;
			if (items && items.length > 0 && typeof items[0].webkitGetAsEntry === "function") {
				const entries = [];
				for (let i = 0; i < items.length; i++) {
					const entry = items[i].webkitGetAsEntry();
					if (entry) entries.push(entry);
				}
				for (const entry of entries) {
					if (out.length >= cap) break;
					await walkEntry(entry, "", out, cap);
				}
				if (out.length > 0) return out;
			}
			const files = dataTransfer?.files;
			if (files) {
				for (let i = 0; i < files.length && out.length < cap; i++) {
					const file = files[i];
					const relative = file.webkitRelativePath && file.webkitRelativePath.length > 0 ? file.webkitRelativePath : file.name;
					out.push({ file, relativePath: relative });
				}
			}
			return out;
		}

		function Breadcrumb({ path, onGo }) {
			const parts = splitRel(path);
			const crumbs = [{ label: "workspace", value: "" }];
			let acc = "";
			for (const part of parts) {
				acc = joinRel(acc, part);
				crumbs.push({ label: part, value: acc });
			}
			return React.createElement("div", { className: "fe-crumb" },
				crumbs.flatMap((crumb, i) => {
					const nodes = [];
					if (i > 0) nodes.push(React.createElement("span", { key: `s${i}`, className: "fe-crumb-sep" }, "/"));
					nodes.push(React.createElement("button", {
						key: crumb.value || "root",
						type: "button",
						className: i === crumbs.length - 1 ? "fe-here" : undefined,
						onClick: () => onGo(crumb.value),
					}, crumb.label));
					return nodes;
				})
			);
		}

		function FileRow({ entry, selected, onOpen, onSelect, onDownload, onZip, onDelete, onRename, onPreview }) {
			const meta = entry.type === "file"
				? [formatBytes(entry.size), formatMtime(entry.mtime)].filter(Boolean).join(" · ")
				: entry.type === "dir" ? ["folder", formatMtime(entry.mtime)].filter(Boolean).join(" · ") : entry.type;
			return React.createElement("div", {
				className: "fe-row" + (selected ? " fe-selected" : ""),
				role: "option",
				"aria-selected": selected === true,
				tabIndex: 0,
				onClick: () => onSelect(entry),
				onDoubleClick: () => onOpen(entry),
				onKeyDown: (event) => {
					if (event.key === "Enter") onOpen(entry);
				},
				title: `${entry.name}${entry.mtime ? ` — ${formatMtime(entry.mtime)}` : ""}`,
			},
				React.createElement("span", { className: "fe-icon-cell", "aria-hidden": true }, iconFor(entry.type)),
				React.createElement("span", { className: "fe-name" }, entry.name),
				React.createElement("span", { className: "fe-meta" }, meta),
				React.createElement("span", { className: "fe-row-actions" },
					entry.type === "file" ? React.createElement("button", {
						type: "button",
						className: "fe-btn",
						title: "Preview",
						onClick: (event) => {
							event.stopPropagation();
							onPreview(entry);
						},
					}, "👁") : null,
					entry.type === "file" ? React.createElement("button", {
						type: "button",
						className: "fe-btn",
						title: "Download",
						onClick: (event) => {
							event.stopPropagation();
							onDownload(entry);
						},
					}, "⬇") : null,
					entry.type === "dir" ? React.createElement("button", {
						type: "button",
						className: "fe-btn",
						title: "Download folder as zip",
						onClick: (event) => {
							event.stopPropagation();
							onZip(entry);
						},
					}, "zip") : null,
					React.createElement("button", {
						type: "button",
						className: "fe-btn",
						title: "Rename",
						onClick: (event) => {
							event.stopPropagation();
							onRename(entry);
						},
					}, "✎"),
					React.createElement("button", {
						type: "button",
						className: "fe-btn",
						title: "Delete",
						onClick: (event) => {
							event.stopPropagation();
							onDelete(entry);
						},
					}, "✕")
				)
			);
		}

		function FilesPanelInner({ useSessions }) {
			const sessionId = typeof useSessions === "function"
				? useSessions((s) => s.current ?? null)
				: null;
			const cwd = typeof useSessions === "function"
				? useSessions((s) => (s.current ? s.byId[s.current]?.cwd ?? null : null))
				: null;
			const panel = React.useSyncExternalStore(subscribePanel, getPanelState);
			const [rel, setRel] = React.useState("");
			const [listing, setListing] = React.useState(null);
			const [status, setStatus] = React.useState("");
			const [error, setError] = React.useState("");
			const [busy, setBusy] = React.useState(false);
			const [dragging, setDragging] = React.useState(false);
			const [selected, setSelected] = React.useState(null);
			const [creating, setCreating] = React.useState(false);
			const [createKind, setCreateKind] = React.useState("folder");
			const [newName, setNewName] = React.useState("");
			const [query, setQuery] = React.useState("");
			const [sortKey, setSortKey] = React.useState("name");
			const [sortDir, setSortDir] = React.useState(1);
			const [showHidden, setShowHidden] = React.useState(false);
			const [showAll, setShowAll] = React.useState(false);
			const [progress, setProgress] = React.useState(null);
			const [confirm, setConfirm] = React.useState(null);
			const [renaming, setRenaming] = React.useState(null);
			const [renameValue, setRenameValue] = React.useState("");
			const [preview, setPreview] = React.useState(null);
			const fileInputRef = React.useRef(null);
			const folderInputRef = React.useRef(null);
			const dragDepth = React.useRef(0);

			React.useEffect(() => {
				setRel("");
				setSelected(null);
				setListing(null);
				setQuery("");
				setShowAll(false);
				setConfirm(null);
				setRenaming(null);
				setPreview(null);
			}, [sessionId]);

			React.useEffect(() => {
				setShowAll(false);
				setSelected(null);
			}, [rel, query, showHidden]);

			const refresh = React.useCallback(async () => {
				if (!sessionId) {
					setListing(null);
					setError("Open a session to browse its workspace");
					return;
				}
				setBusy(true);
				setError("");
				try {
					const data = await listDir(sessionId, rel);
					setListing(data);
					setStatus(`${data.entries.length} item${data.entries.length === 1 ? "" : "s"}`);
					if (data.truncated) setStatus("listing truncated");
				} catch (err) {
					setListing(null);
					setError(err instanceof Error ? err.message : String(err));
				} finally {
					setBusy(false);
				}
			}, [sessionId, rel]);

			React.useEffect(() => {
				if (!panel.visible) return;
				refresh();
			}, [panel.visible, refresh]);

			const openEntry = React.useCallback((entry) => {
				if (entry.type === "dir") {
					setRel(joinRel(rel, entry.name));
					setSelected(null);
					return;
				}
				if (entry.type === "file" && sessionId) {
					void openPreview(entry);
				}
			}, [rel, sessionId]);

			const openPreview = React.useCallback(async (entry) => {
				if (!sessionId) return;
				const path = joinRel(rel, entry.name);
				const kind = previewKind(entry.name, entry.size);
				if (kind === "image") {
					setPreview({ name: entry.name, path, kind, url: apiUrl("download", { sessionId, path }).toString() });
					return;
				}
				if (kind === "too-large" || kind === "binary") {
					startDownload(sessionId, path, entry.name);
					setStatus(`Downloading ${entry.name}`);
					return;
				}
				setPreview({ name: entry.name, path, kind: "text", loading: true });
				try {
					const text = await fetchTextPreview(sessionId, path);
					setPreview({ name: entry.name, path, kind: "text", text });
				} catch (err) {
					setPreview({ name: entry.name, path, kind: "text", error: err instanceof Error ? err.message : String(err) });
				}
			}, [rel, sessionId]);

			const runUploads = React.useCallback(async (items, overwriteAll) => {
				if (!sessionId || items.length === 0) return;
				setBusy(true);
				setError("");
				setProgress({ index: 0, total: items.length, file: items[0]?.relativePath ?? "", percent: 0 });
				let done = 0;
				try {
					for (let i = 0; i < items.length; i++) {
						const item = items[i];
						setProgress({ index: i, total: items.length, file: item.relativePath, percent: 0 });
						setStatus(`Uploading ${i + 1}/${items.length}: ${item.relativePath}`);
						try {
							await uploadFile(sessionId, rel, item.file, item.relativePath, overwriteAll === true, (p) => {
								setProgress({ index: i, total: items.length, file: item.relativePath, percent: p });
							});
						} catch (err) {
							if (err && err.code === 409 && overwriteAll !== true) {
								setConfirm({ type: "overwrite", item, remaining: items.slice(i + 1) });
								return;
							}
							throw err;
						}
						done++;
					}
					setStatus(`Uploaded ${done} file${done === 1 ? "" : "s"}`);
					await refresh();
				} catch (err) {
					setError(err instanceof Error ? err.message : String(err));
				} finally {
					setBusy(false);
					setProgress(null);
				}
			}, [sessionId, rel, refresh]);

			const onDrop = React.useCallback(async (event) => {
				event.preventDefault();
				event.stopPropagation();
				dragDepth.current = 0;
				setDragging(false);
				try {
					const items = await collectDroppedFiles(event.dataTransfer);
					await runUploads(items);
				} catch (err) {
					setError(err instanceof Error ? err.message : String(err));
				}
			}, [runUploads]);

			const onDragEnter = React.useCallback((event) => {
				event.preventDefault();
				event.stopPropagation();
				dragDepth.current++;
				if (event.dataTransfer) event.dataTransfer.dropEffect = "copy";
				setDragging(true);
			}, []);
			const onDragOver = React.useCallback((event) => {
				event.preventDefault();
				event.stopPropagation();
				if (event.dataTransfer) event.dataTransfer.dropEffect = "copy";
			}, []);
			const onDragLeave = React.useCallback((event) => {
				event.preventDefault();
				event.stopPropagation();
				dragDepth.current = Math.max(0, dragDepth.current - 1);
				if (dragDepth.current === 0) setDragging(false);
			}, []);

			const onPickFiles = React.useCallback(async (event) => {
				const files = Array.from(event.target.files ?? []);
				event.target.value = "";
				await runUploads(files.map((file) => ({
					file,
					relativePath: file.webkitRelativePath && file.webkitRelativePath.length > 0 ? file.webkitRelativePath : file.name,
				})));
			}, [runUploads]);

			const onCreateDir = React.useCallback(async () => {
				const name = newName.trim();
				if (!sessionId || name === "") return;
				setBusy(true);
				setError("");
				try {
					if (createKind === "file") {
						const empty = typeof File !== "undefined" ? new File([""], name) : new Blob([""]);
						await uploadFile(sessionId, rel, empty, name, false);
					} else {
						await mkdirPath(sessionId, joinRel(rel, name));
					}
					setCreating(false);
					setNewName("");
					setStatus(`Created ${name}`);
					await refresh();
				} catch (err) {
					setError(err instanceof Error ? err.message : String(err));
				} finally {
					setBusy(false);
				}
			}, [sessionId, rel, newName, createKind, refresh]);

			const zipCurrent = React.useCallback(() => {
				if (!sessionId) return;
				const filename = zipArchiveName(rel, cwd);
				startZip(sessionId, rel, filename);
				setStatus(`Zipping ${filename}`);
			}, [sessionId, rel, cwd]);

			const zipEntry = React.useCallback((entry) => {
				if (!sessionId) return;
				const path = joinRel(rel, entry.name);
				startZip(sessionId, path, zipArchiveName(path, cwd));
				setStatus(`Zipping ${entry.name}.zip`);
			}, [sessionId, rel, cwd]);

			const onDelete = React.useCallback(async (entry) => {
				if (!sessionId) return;
				setConfirm({ type: "delete", entry });
			}, [sessionId]);

			const confirmDelete = React.useCallback(async () => {
				if (!sessionId || !confirm || confirm.type !== "delete") return;
				const entry = confirm.entry;
				const path = joinRel(rel, entry.name);
				setConfirm(null);
				setBusy(true);
				setError("");
				try {
					await deletePath(sessionId, path);
					setSelected(null);
					setStatus(`Deleted ${entry.name}`);
					await refresh();
				} catch (err) {
					setError(err instanceof Error ? err.message : String(err));
				} finally {
					setBusy(false);
				}
			}, [sessionId, rel, refresh, confirm]);

			const confirmOverwrite = React.useCallback(async (overwriteRest) => {
				if (!sessionId || !confirm || confirm.type !== "overwrite") return;
				const { item, remaining } = confirm;
				setConfirm(null);
				setBusy(true);
				setError("");
				try {
					await uploadFile(sessionId, rel, item.file, item.relativePath, true);
					if (remaining.length > 0) await runUploads(remaining, overwriteRest === true ? true : void 0);
					else {
						setStatus(`Uploaded ${item.relativePath}`);
						await refresh();
					}
				} catch (err) {
					setError(err instanceof Error ? err.message : String(err));
				} finally {
					setBusy(false);
					setProgress(null);
				}
			}, [sessionId, rel, refresh, confirm, runUploads]);

			const skipOverwrite = React.useCallback(async () => {
				if (!confirm || confirm.type !== "overwrite") return;
				const { remaining } = confirm;
				setConfirm(null);
				if (remaining.length > 0) await runUploads(remaining);
				else {
					setBusy(false);
					setProgress(null);
					await refresh();
				}
			}, [confirm, runUploads, refresh]);

			const startRename = React.useCallback((entry) => {
				setRenaming(entry);
				setRenameValue(entry.name);
			}, []);

			const submitRename = React.useCallback(async () => {
				const entry = renaming;
				const next = renameValue.trim();
				if (!sessionId || !entry || next === "" || next === entry.name) {
					setRenaming(null);
					return;
				}
				setBusy(true);
				setError("");
				try {
					await renamePath(sessionId, joinRel(rel, entry.name), joinRel(rel, next), false);
					setRenaming(null);
					setSelected(next);
					setStatus(`Renamed to ${next}`);
					await refresh();
				} catch (err) {
					if (err && err.code === 409) {
						setConfirm({ type: "rename-overwrite", entry, next });
						return;
					}
					setError(err instanceof Error ? err.message : String(err));
				} finally {
					setBusy(false);
				}
			}, [sessionId, rel, renaming, renameValue, refresh]);

			const confirmRenameOverwrite = React.useCallback(async () => {
				if (!confirm || confirm.type !== "rename-overwrite") return;
				const { entry, next } = confirm;
				setConfirm(null);
				setBusy(true);
				setError("");
				try {
					await renamePath(sessionId, joinRel(rel, entry.name), joinRel(rel, next), true);
					setRenaming(null);
					setSelected(next);
					setStatus(`Renamed to ${next}`);
					await refresh();
				} catch (err) {
					setError(err instanceof Error ? err.message : String(err));
				} finally {
					setBusy(false);
				}
			}, [confirm, sessionId, rel, refresh]);

			const onBodyKeyDown = React.useCallback((event) => {
				if (event.key === "Backspace" && rel) {
					const target = event.target;
					if (target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA")) return;
					event.preventDefault();
					setRel(parentRel(rel));
				} else if (event.key === "Enter" && selected) {
					const entry = (listing?.entries ?? []).find((e) => e.name === selected);
					if (entry) openEntry(entry);
				}
			}, [rel, selected, listing, openEntry]);

			const allEntries = listing?.entries ?? [];
			const filtered = sortEntries(filterEntries(allEntries, query, showHidden), sortKey, sortDir);
			const visible = showAll ? filtered : filtered.slice(0, RENDER_CAP);
			const hiddenCount = filtered.length - visible.length;

			return React.createElement("div", {
				className: "fe-panel" + (panel.wide ? " fe-wide" : "") + (dragging ? " fe-dragging" : ""),
				onDragEnter,
				onDragOver,
				onDragLeave,
				onDrop,
			},
				React.createElement("div", { className: "fe-head" },
					React.createElement("span", { className: "fe-title" }, "Files"),
					React.createElement("span", { className: "fe-cwd", title: cwd ?? "" }, cwd ?? "no session"),
					React.createElement("button", { type: "button", className: "fe-btn fe-icon", title: panel.wide ? "Narrow" : "Widen", onClick: () => setPanel({ wide: !panel.wide }) }, panel.wide ? "◂" : "▸"),
					React.createElement("button", { type: "button", className: "fe-btn fe-icon", title: "Close", onClick: () => setPanel({ visible: false }) }, "×")
				),
				React.createElement(Breadcrumb, { path: rel, onGo: (v) => { setRel(v); setPreview(null); } }),
				React.createElement("div", { className: "fe-filter" },
					React.createElement("input", {
						value: query,
						placeholder: "Filter files…",
						"aria-label": "Filter files",
						onChange: (event) => setQuery(event.target.value),
					}),
					React.createElement("select", {
						value: sortKey,
						"aria-label": "Sort files",
						onChange: (event) => setSortKey(event.target.value),
					},
						React.createElement("option", { value: "name" }, "Name"),
						React.createElement("option", { value: "size" }, "Size"),
						React.createElement("option", { value: "mtime" }, "Modified")
					),
					React.createElement("button", {
						type: "button",
						className: "fe-btn fe-icon",
						title: sortDir === 1 ? "Sort ascending (click for descending)" : "Sort descending (click for ascending)",
						onClick: () => setSortDir(sortDir === 1 ? -1 : 1),
					}, sortDir === 1 ? "↑" : "↓"),
					React.createElement("button", {
						type: "button",
						className: "fe-btn",
						title: showHidden ? "Hide hidden files" : "Show hidden files",
						onClick: () => setShowHidden(!showHidden),
					}, showHidden ? "👁‍🗨" : "👁")
				),
				React.createElement("div", { className: "fe-toolbar" },
					React.createElement("button", { type: "button", className: "fe-btn", disabled: !rel, onClick: () => setRel(parentRel(rel)) }, "↑ Up"),
					React.createElement("button", { type: "button", className: "fe-btn", disabled: !sessionId || busy, onClick: refresh }, "Refresh"),
					React.createElement("button", {
						type: "button",
						className: "fe-btn fe-primary",
						disabled: !sessionId || busy,
						onClick: () => fileInputRef.current?.click(),
					}, "Upload"),
					React.createElement("button", {
						type: "button",
						className: "fe-btn",
						disabled: !sessionId || busy,
						onClick: () => folderInputRef.current?.click(),
					}, "Folder"),
					React.createElement("button", {
						type: "button",
						className: "fe-btn",
						disabled: !sessionId || busy,
						onClick: () => {
							setCreateKind("folder");
							setCreating(true);
							setNewName("");
						},
					}, "New folder"),
					React.createElement("button", {
						type: "button",
						className: "fe-btn",
						disabled: !sessionId || busy,
						onClick: () => {
							setCreateKind("file");
							setCreating(true);
							setNewName("");
						},
					}, "New file"),
					React.createElement("button", {
						type: "button",
						className: "fe-btn",
						disabled: !sessionId || busy,
						title: "Download this folder as a zip file",
						onClick: zipCurrent,
					}, "Zip"),
					React.createElement("span", { className: "fe-status" + (error ? " fe-error" : "") }, error || status)
				),
				creating ? React.createElement("div", { className: "fe-new" },
					React.createElement("input", {
						value: newName,
						placeholder: createKind === "file" ? "file name" : "folder name",
						autoFocus: true,
						onChange: (event) => setNewName(event.target.value),
						onKeyDown: (event) => {
							if (event.key === "Enter") onCreateDir();
							if (event.key === "Escape") setCreating(false);
						},
					}),
					React.createElement("button", { type: "button", className: "fe-btn fe-primary", onClick: onCreateDir, disabled: newName.trim() === "" || busy }, "Create"),
					React.createElement("button", { type: "button", className: "fe-btn", onClick: () => setCreating(false) }, "Cancel")
				) : null,
				progress ? React.createElement("div", { className: "fe-progress", title: `Uploading ${progress.file} (${progress.index + 1}/${progress.total})` },
					React.createElement("i", { style: { width: progress.percent === null ? "100%" : `${Math.round((progress.percent ?? 0) * 100)}%` } })
				) : null,
				confirm && confirm.type === "delete" ? React.createElement("div", { className: "fe-confirm", role: "alertdialog", "aria-label": "Confirm delete" },
					React.createElement("div", null, confirm.entry.type === "dir"
						? `Delete folder “${confirm.entry.name}” and everything inside it?`
						: `Delete “${confirm.entry.name}”?`),
					React.createElement("div", { className: "fe-confirm-btns" },
						React.createElement("button", { type: "button", className: "fe-btn fe-primary", onClick: confirmDelete }, "Delete"),
						React.createElement("button", { type: "button", className: "fe-btn", onClick: () => setConfirm(null) }, "Cancel")
					)
				) : null,
				confirm && confirm.type === "overwrite" ? React.createElement("div", { className: "fe-confirm", role: "alertdialog", "aria-label": "Confirm overwrite" },
					React.createElement("div", null, `“${confirm.item.relativePath}” already exists. Overwrite?`),
					React.createElement("div", { className: "fe-confirm-btns" },
						React.createElement("button", { type: "button", className: "fe-btn fe-primary", onClick: () => confirmOverwrite(false) }, "Overwrite"),
						React.createElement("button", { type: "button", className: "fe-btn", onClick: () => confirmOverwrite(true) }, "Overwrite all"),
						React.createElement("button", { type: "button", className: "fe-btn", onClick: skipOverwrite }, "Skip"),
						React.createElement("button", { type: "button", className: "fe-btn", onClick: () => { setConfirm(null); setBusy(false); setProgress(null); } }, "Cancel")
					)
				) : null,
				confirm && confirm.type === "rename-overwrite" ? React.createElement("div", { className: "fe-confirm", role: "alertdialog", "aria-label": "Confirm rename overwrite" },
					React.createElement("div", null, `“${confirm.next}” already exists. Replace it?`),
					React.createElement("div", { className: "fe-confirm-btns" },
						React.createElement("button", { type: "button", className: "fe-btn fe-primary", onClick: confirmRenameOverwrite }, "Replace"),
						React.createElement("button", { type: "button", className: "fe-btn", onClick: () => setConfirm(null) }, "Cancel")
					)
				) : null,
				renaming ? React.createElement("div", { className: "fe-new" },
					React.createElement("input", {
						value: renameValue,
						"aria-label": "New name",
						autoFocus: true,
						onChange: (event) => setRenameValue(event.target.value),
						onKeyDown: (event) => {
							if (event.key === "Enter") submitRename();
							if (event.key === "Escape") setRenaming(null);
						},
					}),
					React.createElement("button", { type: "button", className: "fe-btn fe-primary", onClick: submitRename, disabled: renameValue.trim() === "" || busy }, "Rename"),
					React.createElement("button", { type: "button", className: "fe-btn", onClick: () => setRenaming(null) }, "Cancel")
				) : null,
				React.createElement("input", {
					ref: fileInputRef,
					type: "file",
					multiple: true,
					hidden: true,
					onChange: onPickFiles,
				}),
				React.createElement("input", {
					ref: folderInputRef,
					type: "file",
					multiple: true,
					webkitdirectory: "",
					directory: "",
					hidden: true,
					onChange: onPickFiles,
				}),
				React.createElement("div", { className: "fe-body", role: "listbox", "aria-label": "Workspace files", tabIndex: 0, onKeyDown: onBodyKeyDown },
					!sessionId ? React.createElement("div", { className: "fe-empty" }, "Open a session to browse its workspace.")
						: allEntries.length === 0 && !busy ? React.createElement("div", { className: "fe-empty" }, "This folder is empty. Drop files here to upload.")
							: filtered.length === 0 ? React.createElement("div", { className: "fe-empty" }, `No matches for “${query}”.`)
								: visible.map((entry) => React.createElement(FileRow, {
									key: `${entry.type}:${entry.name}`,
									entry,
									selected: selected === entry.name,
									onSelect: (item) => setSelected(item.name),
									onOpen: openEntry,
									onDownload: (item) => startDownload(sessionId, joinRel(rel, item.name), item.name),
									onZip: zipEntry,
									onDelete,
									onRename: startRename,
									onPreview: openPreview,
								})),
					hiddenCount > 0 ? React.createElement("button", { type: "button", className: "fe-btn fe-showall", onClick: () => setShowAll(true) }, `Show all ${filtered.length} files (${hiddenCount} hidden)`) : null,
					dragging ? React.createElement("div", { className: "fe-drop" }, "Drop to upload into this folder") : null,
					preview ? React.createElement("div", { className: "fe-preview", role: "dialog", "aria-label": `Preview ${preview.name}` },
						React.createElement("div", { className: "fe-preview-head" },
							React.createElement("span", { className: "fe-preview-title", title: preview.path }, preview.name),
							preview.kind === "text" && !preview.loading ? React.createElement("button", {
								type: "button",
								className: "fe-btn",
								onClick: () => startDownload(sessionId, preview.path, preview.name),
							}, "Download") : null,
							React.createElement("button", { type: "button", className: "fe-btn fe-icon", title: "Close preview", onClick: () => setPreview(null) }, "×")
						),
						React.createElement("div", { className: "fe-preview-body" },
							preview.loading ? "Loading…"
								: preview.error ? `Preview failed: ${preview.error}`
									: preview.kind === "image" ? React.createElement("img", { src: preview.url, alt: preview.name })
										: React.createElement("pre", null, preview.text ?? "")
						)
					) : null
				),
				React.createElement("div", { className: "fe-hint" }, "Drag files or folders onto this panel to upload. Click 👁 to preview, double-click to download. Backspace goes up, Enter opens. Zip downloads a folder as an archive.")
			);
		}

		function FilesOverlay(props) {
			const state = React.useSyncExternalStore(subscribePanel, getPanelState);
			if (!state.visible) return null;
			return React.createElement(FilesPanelInner, { useSessions: props.useSessions });
		}

		function FilesToggle(props) {
			const wide = props.wide === true;
			const state = React.useSyncExternalStore(subscribePanel, getPanelState);
			const onClick = React.useCallback(() => setPanel({ visible: !state.visible }), [state.visible]);
			return React.createElement("button", {
				className: "fe-toggle" + (state.visible ? " fe-active" : ""),
				onClick,
				title: "Toggle the workspace file explorer",
			}, wide
				? React.createElement(React.Fragment, null, React.createElement("span", { className: "fe-glyph" }, "📁"), " Files")
				: React.createElement("span", { className: "fe-glyph" }, "📁"));
		}

		const inject = ["slots"];

		function apply(ctx) {
			ctx.slots.inject("shell.overlay", () => ctx.slots.register({
				name: "shell.overlay",
				id: "file-explorer",
				order: 80,
				label: "Files",
			}, FilesOverlay));
			ctx.slots.inject("sidebar.footer.action", () => ctx.slots.register({
				name: "sidebar.footer.action",
				id: "file-explorer-toggle",
				order: 20,
				label: "Files",
			}, FilesToggle));
		}

		exports.FilesOverlay = FilesOverlay;
		exports.FilesToggle = FilesToggle;
		exports.apply = apply;
		exports.inject = inject;
		exports.joinRel = joinRel;
		exports.parentRel = parentRel;
		exports.splitRel = splitRel;
		exports.formatBytes = formatBytes;
		exports.formatMtime = formatMtime;
		exports.filterEntries = filterEntries;
		exports.sortEntries = sortEntries;
		exports.previewKind = previewKind;
		exports.RENDER_CAP = RENDER_CAP;
		exports.collectDroppedFiles = collectDroppedFiles;
		exports.zipArchiveName = zipArchiveName;
		exports.getPanelState = getPanelState;
		exports.setPanel = setPanel;
		return module.exports;
	}
});
