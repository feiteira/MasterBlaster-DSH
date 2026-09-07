/**
 * dsh-terminal-web — browser half (hand-built in the client-modules bundle
 * format: window.__ModuleLoader__.load({ id, factory })). Only platform seed
 * words are required (react); everything else is self-contained.
 *
 * The client opens one WebSocket per terminal session at
 * ws(s)://<host>/terminal.ws?cwd=...&cols=..&rows=.., streams PTY output into
 * a compact ANSI-aware screen model, and forwards keystrokes/paste/resize
 * frames back to the host. Sessions live in a module-level manager so they
 * survive panel minimize; the panel mounts into the shell.overlay slot (full
 * panel or a slim minimized bar), and a toggle mounts into
 * sidebar.footer.action.
 */
window.__ModuleLoader__.load({
	id: "dsh-terminal-web",
	factory: (require) => {
		var module = { exports: {} };
		var exports = module.exports;
		Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });
		let React = require("react");

		// ───────────────────────── styles ─────────────────────────

		const css = [
			".tw-terminal-panel{position:fixed;left:0;right:0;bottom:0;z-index:1200;height:38vh;min-height:140px;display:flex;flex-direction:column;background:rgba(12,14,18,.97);color:#e6e6e6;border-top:1px solid rgba(255,255,255,.14);box-shadow:0 -8px 24px rgba(0,0,0,.35);pointer-events:auto;font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,'Liberation Mono',monospace;font-size:13px;line-height:1.42}",
			".tw-terminal-panel.tw-maximized{height:calc(100vh - 24px)}",
			".tw-terminal-tabs{display:flex;align-items:center;gap:4px;flex:0 0 auto;padding:2px 8px 0;background:rgba(255,255,255,.03);border-bottom:1px solid rgba(255,255,255,.08);overflow-x:auto;user-select:none}",
			".tw-terminal-tab{display:inline-flex;align-items:center;gap:6px;padding:4px 10px;font-size:12px;color:#a8adb5;border:1px solid transparent;border-radius:6px 6px 0 0;cursor:pointer;white-space:nowrap;max-width:200px;overflow:hidden}",
			".tw-terminal-tab.tw-active{color:#e6e6e6;background:rgba(255,255,255,.08);border-color:rgba(255,255,255,.14)}",
			".tw-terminal-tab-dot{width:7px;height:7px;border-radius:50%;flex:0 0 auto}",
			".tw-dot-connected{background:#6ccb5f}",
			".tw-dot-connecting{background:#e5c07b}",
			".tw-dot-error,.tw-dot-exited{background:#f14c4c}",
			".tw-terminal-tab-x{border:none;background:transparent;color:#8a8f98;cursor:pointer;font-size:12px;line-height:1;padding:1px 3px;border-radius:3px;flex:0 0 auto}",
			".tw-terminal-tab-x:hover{color:#f14c4c;background:rgba(241,76,76,.15)}",
			".tw-terminal-head{display:flex;align-items:center;gap:10px;padding:4px 10px;background:rgba(255,255,255,.06);border-bottom:1px solid rgba(255,255,255,.1);flex:0 0 auto;user-select:none}",
			".tw-terminal-title{font-weight:600;font-size:12px;letter-spacing:.04em;text-transform:uppercase;color:#9cdcfe}",
			".tw-terminal-cwd{flex:1;font-size:12px;color:#8a8f98;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;direction:rtl;text-align:left}",
			".tw-terminal-btn{background:transparent;border:1px solid rgba(255,255,255,.22);color:#cfd3d8;border-radius:4px;font-size:11px;padding:2px 8px;cursor:pointer;font-family:inherit}",
			".tw-terminal-btn:hover{background:rgba(255,255,255,.12)}",
			".tw-terminal-btn.tw-icon{min-width:22px;padding:2px 5px;text-align:center}",
			".tw-terminal-status{font-size:11px;color:#8a8f98;min-width:70px;text-align:right}",
			".tw-terminal-status.tw-running{color:#6ccb5f}",
			".tw-terminal-status.tw-error{color:#f14c4c}",
			".tw-terminal-body{flex:1;overflow:auto;padding:4px 8px;position:relative;cursor:text}",
			".tw-terminal-lines{white-space:pre-wrap;word-break:break-all}",
			".tw-terminal-line{min-height:1.42em}",
			".tw-cursor{display:inline-block;width:.58em;height:1.15em;margin:0 .05em -0.2em .02em;background:#9cdcfe;animation:tw-blink 1.06s steps(1) infinite}",
			"@keyframes tw-blink{50%{opacity:0}}",
			".tw-terminal-notice{position:absolute;left:10px;right:10px;bottom:8px;padding:6px 10px;background:rgba(40,44,52,.95);border:1px solid rgba(255,255,255,.18);border-radius:6px;font-size:12px;color:#e6e6e6;display:flex;align-items:center;gap:10px}",
			".tw-terminal-notice code{color:#9cdcfe}",
			".tw-terminal-input{position:absolute;width:1px;height:1px;opacity:0;pointer-events:none}",
			".tw-terminal-scrollback{position:sticky;top:0;display:flex;justify-content:center;padding:2px 0;z-index:2}",
			".tw-terminal-scrollback span{font-size:11px;color:#8a8f98;background:rgba(255,255,255,.06);border:1px solid rgba(255,255,255,.12);border-radius:10px;padding:1px 10px}",
			".tw-terminal-copyok{color:#6ccb5f !important}",
			".tw-terminal-minbar{position:fixed;left:0;right:0;bottom:0;z-index:1200;display:flex;align-items:center;gap:10px;padding:4px 12px;background:rgba(12,14,18,.97);border-top:1px solid rgba(255,255,255,.14);color:#e6e6e6;font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,'Liberation Mono',monospace;font-size:12px;cursor:pointer;pointer-events:auto;user-select:none}",
			".tw-terminal-minbar-title{font-weight:600;letter-spacing:.04em;text-transform:uppercase;color:#9cdcfe}",
			".tw-terminal-minbar-count{color:#8a8f98}",
			".tw-term-toggle{display:inline-flex;align-items:center;gap:6px;background:transparent;border:1px solid transparent;color:inherit;border-radius:4px;padding:3px 8px;cursor:pointer;font-family:inherit;font-size:12px}",
			".tw-term-toggle:hover{background:rgba(255,255,255,.1);border-color:rgba(255,255,255,.18)}",
			".tw-term-toggle.tw-active{color:#9cdcfe;border-color:rgba(156,220,254,.5)}",
			".tw-term-glyph{font-weight:700;letter-spacing:-.05em}"
		].join("\n");
		const styleTag = document.createElement("style");
		styleTag.dataset.plugin = "dsh-terminal-web";
		styleTag.textContent = css;
		document.head.appendChild(styleTag);

		// ───────────────── panel store (immutable snapshots) ─────────────────

		const MAX_SESSIONS = 8;
		let panelState = { visible: false, maximized: false, version: 0, sessions: [], activeId: null, fontSize: 13 };
		const panelListeners = new Set();

		function setState(partial) {
			panelState = { ...panelState, ...partial };
			for (const listener of [...panelListeners]) listener();
		}

		let pendingBump = false;
		function bump() {
			setState({ version: panelState.version + 1 });
		}
		/** Coalesce output-driven re-renders into one per animation frame. */
		function scheduleBump() {
			if (pendingBump) return;
			pendingBump = true;
			requestAnimationFrame(() => {
				pendingBump = false;
				bump();
			});
		}

		function subscribePanel(listener) {
			panelListeners.add(listener);
			return () => panelListeners.delete(listener);
		}
		function getPanelState() {
			return panelState;
		}

		// ─────────────────────── ANSI screen ───────────────────────

		const MAX_LINES = 1500;
		const MAX_LINE_LEN = 4000;
		/** DOM cap: only the last N lines render (scrollback stays in the model). */
		const MAX_RENDER_LINES = 400;
		const PALETTE = ["#000000", "#cd3131", "#0dbc79", "#e5e510", "#2472c8", "#bc3fbc", "#11a8cd", "#e5e5e5", "#666666", "#f14c4c", "#23d18b", "#f5f543", "#3b8eea", "#d670d6", "#29b8db", "#ffffff"];

		/** 256-color palette: 0-15 palette, 16-231 6x6x6 cube, 232-255 grayscale. */
		function color256(index) {
			if (index < 16) return PALETTE[index];
			if (index < 232) {
				const value = index - 16;
				const r = Math.floor(value / 36);
				const g = Math.floor((value % 36) / 6);
				const b = value % 6;
				const channel = (c) => (c === 0 ? 0 : 55 + c * 40).toString(16).padStart(2, "0");
				return `#${channel(r)}${channel(g)}${channel(b)}`;
			}
			const gray = 8 + (index - 232) * 10;
			const hex = gray.toString(16).padStart(2, "0");
			return `#${hex}${hex}${hex}`;
		}

		function blankCell() {
			return { ch: " ", fg: null, bg: null, bold: false, inverse: false };
		}

		function createScreen() {
			return { lines: [[]], cursorY: 0, cursorX: 0, fg: null, bg: null, bold: false, inverse: false, bracketPaste: false, version: 0, buf: "", title: null, reportedCwd: null, cursorVisible: true, bell: 0, savedX: 0, savedY: 0 };
		}

		/** Visible window into the scrollback: last MAX_RENDER_LINES plus hidden count. */
		function visibleSlice(screen) {
			const total = screen.lines.length;
			const start = Math.max(0, total - MAX_RENDER_LINES);
			return { start, total, hidden: start };
		}

		/** Clear the scrollback and reset the cursor (Clear button / CSI 3 J). */
		function clearScreen(screen) {
			screen.lines = [[]];
			screen.cursorY = 0;
			screen.cursorX = 0;
			screen.buf = "";
			screen.version++;
		}

		/** Handle one OSC payload (without the leading ESC ] / trailing BEL or ST). */
		function handleOsc(screen, payload) {
			const match = /^(\d+);([\s\S]*)$/.exec(payload);
			if (!match) return;
			const code = match[1];
			const text = match[2];
			if (code === "0" || code === "1" || code === "2") {
				const title = text.trim().slice(0, 200);
				if (title) screen.title = title;
			} else if (code === "7") {
				// OSC 7: current directory as file:// URL (emitted by shells on cd).
				try {
					const url = new URL(text.trim());
					if (url.protocol === "file:") {
						const path = decodeURIComponent(url.pathname).slice(0, 4096);
						if (path.startsWith("/")) screen.reportedCwd = path;
					}
				} catch {
					// non-URL payloads are ignored
				}
			}
		}

		/** Push the cursor down one line, scrolling the buffer when full. */
		function feedLine(screen) {
			if (screen.cursorY < screen.lines.length - 1) {
				screen.cursorY++;
				return;
			}
			screen.lines.push([]);
			if (screen.lines.length > MAX_LINES) {
				screen.lines.shift();
			} else {
				screen.cursorY++;
			}
		}

		function ensureLine(screen, y) {
			while (screen.lines.length <= y) screen.lines.push([]);
		}

		function putChar(screen, ch) {
			let line = screen.lines[screen.cursorY];
			if (line === void 0) {
				ensureLine(screen, screen.cursorY);
				line = screen.lines[screen.cursorY];
			}
			if (screen.cursorX >= line.length) {
				while (line.length < screen.cursorX) line.push(blankCell());
				line.push({ ch, fg: screen.fg, bg: screen.bg, bold: screen.bold, inverse: screen.inverse });
			} else {
				line[screen.cursorX] = { ch, fg: screen.fg, bg: screen.bg, bold: screen.bold, inverse: screen.inverse };
			}
			screen.cursorX++;
			if (line.length >= MAX_LINE_LEN) {
				line.length = MAX_LINE_LEN;
				feedLine(screen);
				screen.cursorX = 0;
			}
		}

		function clamp(value, min, max) {
			return Math.min(max, Math.max(min, value));
		}

		/** Apply one SGR parameter list (may contain a 38/48 sub-sequence). */
		function applySgr(screen, params) {
			for (let i = 0; i < params.length; i++) {
				const code = params[i];
				if (code === 0) {
					screen.fg = null;
					screen.bg = null;
					screen.bold = false;
					screen.inverse = false;
				} else if (code === 1) {
					screen.bold = true;
				} else if (code === 22) {
					screen.bold = false;
				} else if (code === 7) {
					screen.inverse = true;
				} else if (code === 27) {
					screen.inverse = false;
				} else if (code >= 30 && code <= 37) {
					screen.fg = PALETTE[code - 30];
				} else if (code >= 90 && code <= 97) {
					screen.fg = PALETTE[code - 90 + 8];
				} else if (code === 38) {
					if (params[i + 1] === 5) {
						screen.fg = color256(params[i + 2]);
						i += 2;
					} else if (params[i + 1] === 2) {
						screen.fg = `rgb(${params[i + 2]},${params[i + 3]},${params[i + 4]})`;
						i += 4;
					}
				} else if (code === 39) {
					screen.fg = null;
				} else if (code >= 40 && code <= 47) {
					screen.bg = PALETTE[code - 40];
				} else if (code >= 100 && code <= 107) {
					screen.bg = PALETTE[code - 100 + 8];
				} else if (code === 48) {
					if (params[i + 1] === 5) {
						screen.bg = color256(params[i + 2]);
						i += 2;
					} else if (params[i + 1] === 2) {
						screen.bg = `rgb(${params[i + 2]},${params[i + 3]},${params[i + 4]})`;
						i += 4;
					}
				} else if (code === 49) {
					screen.bg = null;
				}
			}
		}

		/** Feed raw terminal output (a string) into the screen model. */
		function writeScreen(screen, data) {
			if (screen.buf) {
				data = screen.buf + data;
				screen.buf = "";
			}
			for (let i = 0; i < data.length; i++) {
				const ch = data[i];
				if (ch === "\r") {
					screen.cursorX = 0;
				} else if (ch === "\n" || ch === "\v" || ch === "\f") {
					feedLine(screen);
					screen.cursorX = 0;
				} else if (ch === "\t") {
					screen.cursorX += 8 - (screen.cursorX % 8);
				} else if (ch === "\b") {
					screen.cursorX = Math.max(0, screen.cursorX - 1);
				} else if (ch === "\x07") {
					screen.bell++;
				} else if (ch === "\x1b") {
					const next = consumeEscape(screen, data, i);
					if (next === -1) {
						// Incomplete sequence split across frames — buffer and resume later.
						screen.buf = data.slice(i).slice(0, 4096);
						break;
					}
					i = next;
				} else {
					putChar(screen, ch);
				}
			}
			screen.version++;
		}

		/** Parse one escape sequence starting at data[i] === ESC; returns the index of its last char, or -1 when incomplete. */
		function consumeEscape(screen, data, i) {
			const next = data[i + 1];
			if (next === void 0) return -1;
			if (next === "[") {
				let j = i + 2;
				let paramText = "";
				let privateMode = false;
				for (; j < data.length; j++) {
					const c = data[j];
					if (c === "?") {
						privateMode = true;
					} else if (c >= "0" && c <= "9" || c === ";" || c === ":") {
						paramText += c;
					} else {
						break;
					}
				}
				if (j >= data.length) return -1;
				const final = data[j];
				const rawParams = paramText.length > 0 ? paramText.split(";") : [];
				const params = rawParams.map((p) => {
					const n = Number.parseInt(p, 10);
					return Number.isFinite(n) ? n : 0;
				});
				const n = params.length > 0 ? params[0] : 1;
				const count = (def) => (params.length > 0 && params[0] > 0 ? params[0] : def);
				if (privateMode) {
					if (final === "h" && n === 2004) screen.bracketPaste = true;
					if (final === "l" && n === 2004) screen.bracketPaste = false;
					if (final === "h" && n === 25) screen.cursorVisible = true;
					if (final === "l" && n === 25) screen.cursorVisible = false;
					return j;
				}
				if (final === "m") {
					applySgr(screen, params.length > 0 ? params : [0]);
				} else if (final === "K") {
					const mode = params.length > 0 ? params[0] : 0;
					const line = screen.lines[screen.cursorY];
					if (line !== void 0) {
						if (mode === 2) {
							for (let x = 0; x < line.length; x++) line[x] = blankCell();
						} else if (mode === 1) {
							for (let x = 0; x <= screen.cursorX && x < line.length; x++) line[x] = blankCell();
						} else if (screen.cursorX < line.length) {
							for (let x = screen.cursorX; x < line.length; x++) line[x] = blankCell();
						}
					}
				} else if (final === "J") {
					if (n === 2 || n === 3) {
						screen.lines = [[]];
						screen.cursorY = 0;
						screen.cursorX = 0;
					} else if (n === 1) {
						for (let y = 0; y < screen.cursorY; y++) screen.lines[y] = [];
						const line = screen.lines[screen.cursorY];
						if (line !== void 0) {
							line.splice(0, screen.cursorX);
							screen.cursorX = 0;
						}
					} else if (n === 0) {
						const line = screen.lines[screen.cursorY];
						if (line !== void 0) line.length = screen.cursorX;
						screen.lines = screen.lines.slice(0, screen.cursorY + 1);
					}
				} else if (final === "H" || final === "f") {
					const row = params.length > 0 ? params[0] : 1;
					const col = params.length > 1 ? params[1] : 1;
					screen.cursorY = clamp(row - 1, 0, Math.max(0, screen.lines.length - 1));
					screen.cursorX = Math.max(0, col - 1);
				} else if (final === "A") {
					screen.cursorY = Math.max(0, screen.cursorY - count(1));
				} else if (final === "B" || final === "e") {
					screen.cursorY = clamp(screen.cursorY + count(1), 0, Math.max(0, screen.lines.length - 1));
				} else if (final === "C") {
					screen.cursorX += count(1);
				} else if (final === "D") {
					screen.cursorX = Math.max(0, screen.cursorX - count(1));
				} else if (final === "E") {
					screen.cursorY = clamp(screen.cursorY + count(1), 0, Math.max(0, screen.lines.length - 1));
					screen.cursorX = 0;
				} else if (final === "F") {
					screen.cursorY = Math.max(0, screen.cursorY - count(1));
					screen.cursorX = 0;
				} else if (final === "G" || final === "`") {
					screen.cursorX = Math.max(0, count(1) - 1);
				} else if (final === "d") {
					screen.cursorY = clamp(count(1) - 1, 0, Math.max(0, screen.lines.length - 1));
				} else if (final === "L") {
					// Insert blank lines at the cursor row.
					const at = screen.cursorY;
					for (let k = 0; k < count(1); k++) {
						screen.lines.splice(at, 0, []);
						if (screen.lines.length > MAX_LINES) screen.lines.pop();
					}
				} else if (final === "M") {
					// Delete lines at the cursor row.
					const at = screen.cursorY;
					for (let k = 0; k < count(1) && at < screen.lines.length; k++) screen.lines.splice(at, 1);
					if (screen.lines.length === 0) screen.lines.push([]);
					screen.cursorY = Math.min(screen.cursorY, screen.lines.length - 1);
					screen.cursorX = Math.min(screen.cursorX, (screen.lines[screen.cursorY] ?? []).length);
				} else if (final === "@") {
					// Insert blank characters at the cursor column.
					const line = screen.lines[screen.cursorY];
					if (line !== void 0) for (let k = 0; k < count(1); k++) line.splice(screen.cursorX, 0, blankCell());
				} else if (final === "P") {
					// Delete characters at the cursor column.
					const line = screen.lines[screen.cursorY];
					if (line !== void 0) line.splice(screen.cursorX, count(1));
				} else if (final === "X") {
					// Erase characters (overwrite with blanks, cursor stays).
					const line = screen.lines[screen.cursorY];
					if (line !== void 0) for (let k = 0; k < count(1); k++) {
						const x = screen.cursorX + k;
						if (x < line.length) line[x] = blankCell();
						else if (x < MAX_LINE_LEN) {
							while (line.length < x) line.push(blankCell());
							line.push(blankCell());
						}
					}
				} else if (final === "S") {
					// Scroll up: drop lines from the top.
					for (let k = 0; k < count(1); k++) {
						if (screen.lines.length > 1) {
							screen.lines.shift();
							screen.cursorY = Math.max(0, screen.cursorY - 1);
						}
					}
				} else if (final === "T") {
					// Scroll down: insert blank lines at the top.
					for (let k = 0; k < count(1); k++) {
						screen.lines.unshift([]);
						if (screen.lines.length > MAX_LINES) screen.lines.pop();
						screen.cursorY = Math.min(screen.lines.length - 1, screen.cursorY + 1);
					}
				} else if (final === "s") {
					screen.savedX = screen.cursorX;
					screen.savedY = screen.cursorY;
				} else if (final === "u") {
					screen.cursorX = screen.savedX ?? 0;
					screen.cursorY = clamp(screen.savedY ?? 0, 0, Math.max(0, screen.lines.length - 1));
				}
				// other finals (c, n, h, l, ...) are ignored
				return j;
			}
			if (next === "]") {
				// OSC — run until BEL or ESC \; buffer when split across frames.
				for (let j = i + 2; j < data.length; j++) {
					if (data[j] === "\x07") {
						handleOsc(screen, data.slice(i + 2, j));
						return j;
					}
					if (data[j] === "\x1b" && data[j + 1] === "\\") {
						handleOsc(screen, data.slice(i + 2, j));
						return j + 1;
					}
				}
				return -1;
			}
			if (next === "M") {
				screen.cursorY = Math.max(0, screen.cursorY - 1);
				return i + 1;
			}
			if (next === "7") {
				screen.savedX = screen.cursorX;
				screen.savedY = screen.cursorY;
				return i + 1;
			}
			if (next === "8") {
				screen.cursorX = screen.savedX ?? 0;
				screen.cursorY = clamp(screen.savedY ?? 0, 0, Math.max(0, screen.lines.length - 1));
				return i + 1;
			}
			if (next === "(" || next === ")" || next === "*" || next === "+") {
				if (i + 2 >= data.length) return -1;
				return i + 2;
			}
			return i + 1;
		}

		// ─────────────────────── rendering ───────────────────────

		/** Merge a line's cells into styled segments (text runs + one optional cursor marker). */
		function lineSegments(line, cursorAt) {
			const segments = [];
			let current = null;
			const flush = () => {
				if (current !== null) segments.push(current);
				current = null;
			};
			for (let x = 0; x <= line.length; x++) {
				if (x === cursorAt) {
					flush();
					segments.push({ cursor: true });
				}
				if (x === line.length) break;
				const cell = line[x];
				let fg = cell.fg;
				let bg = cell.bg;
				if (cell.inverse) {
					const swap = fg;
					fg = bg;
					bg = swap;
				}
				const style = {
					color: fg ?? void 0,
					backgroundColor: bg ?? void 0,
					fontWeight: cell.bold ? "700" : void 0
				};
				const key = `${style.color}|${style.backgroundColor}|${style.fontWeight}`;
				if (current === null || current.key !== key) {
					flush();
					current = { key, text: cell.ch, style };
				} else {
					current.text += cell.ch;
				}
			}
			flush();
			return segments;
		}

		/** React line nodes for one screen (windowed to the last MAX_RENDER_LINES). */
		function renderScreenLines(screen, windowStart) {
			const lineNodes = [];
			const start = typeof windowStart === "number" ? windowStart : Math.max(0, screen.lines.length - MAX_RENDER_LINES);
			for (let y = start; y < screen.lines.length; y++) {
				const line = screen.lines[y];
				const cursorAt = y === screen.cursorY && screen.cursorVisible !== false ? screen.cursorX : -1;
				const segments = lineSegments(line, cursorAt);
				const children = [];
				for (const segment of segments) {
					if (segment.cursor === true) {
						children.push(React.createElement("span", { key: children.length, className: "tw-cursor" }, "\u00a0"));
					} else {
						children.push(React.createElement("span", { key: children.length, style: segment.style }, segment.text));
					}
				}
				lineNodes.push(React.createElement("div", { key: y, className: "tw-terminal-line" }, children));
			}
			return lineNodes;
		}

		let cellMetrics = null;
		function measureCell() {
			if (cellMetrics !== null) return cellMetrics;
			const el = document.createElement("span");
			el.style.cssText = "position:absolute;visibility:hidden;white-space:pre;font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,'Liberation Mono',monospace;font-size:13px;line-height:1.42";
			el.textContent = "M";
			document.body.appendChild(el);
			const rect = el.getBoundingClientRect();
			el.remove();
			cellMetrics = { w: Math.max(4, rect.width), h: Math.max(6, rect.height) };
			return cellMetrics;
		}

		// ─────────────────── input translation ───────────────────

		/** Translate a browser keydown into terminal bytes; returns null when unhandled. */
		function keyToInput(event) {
			const ctrl = event.ctrlKey;
			const alt = event.altKey;
			const meta = event.metaKey;
			const shift = event.shiftKey === true;
			const key = event.key;
			if (ctrl && meta) return null; // leave OS/browser shortcuts alone
			// Let copy/paste shortcuts reach the browser (Ctrl+Shift+C/V, Cmd+C/V).
			if (ctrl && shift && (key === "C" || key === "c" || key === "V" || key === "v")) return null;
			if (key === "Enter") return "\r";
			if (key === "Backspace") return ctrl ? "\x17" : "\x7f";
			if (key === "Tab") return shift ? "\x1b[Z" : "\t";
			if (key === "Escape") return "\x1b";
			if (key === "ArrowUp") return (ctrl ? "\x1b[1;5A" : shift ? "\x1b[1;2A" : "\x1b[A");
			if (key === "ArrowDown") return (ctrl ? "\x1b[1;5B" : shift ? "\x1b[1;2B" : "\x1b[B");
			if (key === "ArrowRight") return ctrl ? "\x1b[1;5C" : shift ? "\x1b[1;2C" : "\x1b[C";
			if (key === "ArrowLeft") return ctrl ? "\x1b[1;5D" : shift ? "\x1b[1;2D" : "\x1b[D";
			if (key === "Home") return "\x1b[H";
			if (key === "End") return "\x1b[F";
			if (key === "Insert") return "\x1b[2~";
			if (key === "PageUp") return shift ? "\x1b[5;2~" : "\x1b[5~";
			if (key === "PageDown") return shift ? "\x1b[6;2~" : "\x1b[6~";
			if (key === "Delete") return ctrl ? "\x1b[3;5~" : "\x1b[3~";
			if (key === "F1") return "\x1bOP";
			if (key === "F2") return "\x1bOQ";
			if (key === "F3") return "\x1bOR";
			if (key === "F4") return "\x1bOS";
			if (key === "F5") return "\x1b[15~";
			if (key === "F6") return "\x1b[17~";
			if (key === "F7") return "\x1b[18~";
			if (key === "F8") return "\x1b[19~";
			if (key === "F9") return "\x1b[20~";
			if (key === "F10") return "\x1b[21~";
			if (key === "F11") return "\x1b[23~";
			if (key === "F12") return "\x1b[24~";
			if (ctrl && key.length === 1) {
				const code = key.toUpperCase().charCodeAt(0);
				if (code >= 65 && code <= 90) return String.fromCharCode(code - 64);
				return null;
			}
			if (alt && key.length === 1) return `\x1b${key}`;
			if (key.length === 1 && !ctrl && !alt && !meta) return key;
			return null;
		}

		// ─────────────────── session manager ───────────────────

		const sessionMap = new Map();
		let nextSessionId = 1;

		function defaultTitle(cwd, id) {
			if (typeof cwd === "string" && cwd.length > 0) {
				const base = cwd.split("/").filter(Boolean).pop();
				if (base) return base;
			}
			return `shell ${id}`;
		}

		function wsUrlFor(cwd) {
			const metrics = measureCell();
			const cols = Math.max(20, Math.floor((window.innerWidth - 16) / metrics.w));
			const rows = Math.max(5, Math.floor((window.innerHeight * 0.38 - 110) / metrics.h));
			return `${location.protocol === "https:" ? "wss:" : "ws:"}//${location.host}/terminal.ws?cols=${cols}&rows=${rows}&cwd=${encodeURIComponent(cwd ?? "")}`;
		}

		function patchTab(id, patch) {
			const sessions = panelState.sessions.map((tab) => (tab.id === id ? { ...tab, ...patch } : tab));
			setState({ sessions });
		}

		function connectSession(session) {
			const screen = session.screen;
			screen.lines = [[]];
			screen.cursorY = 0;
			screen.cursorX = 0;
			screen.buf = "";
			screen.title = null;
			screen.reportedCwd = null;
			session.status = "connecting";
			session.exitInfo = null;
			patchTab(session.id, { status: "connecting" });
			let ws;
			try {
				ws = new WebSocket(wsUrlFor(session.cwd));
			} catch {
				session.status = "error";
				patchTab(session.id, { status: "error" });
				return;
			}
			session.ws = ws;
			ws.onopen = () => {
				session.status = "connected";
				patchTab(session.id, { status: "connected" });
			};
			ws.onmessage = (event) => {
				let frame;
				try {
					frame = JSON.parse(event.data);
				} catch {
					return;
				}
				if (frame.type === "output") {
					const prevTitle = screen.title;
					const prevCwd = screen.reportedCwd;
					writeScreen(screen, frame.data);
					// Live tab title / cwd from OSC 0/2 and OSC 7 (shell prompt integration).
					if (screen.title !== prevTitle && screen.title) patchTab(session.id, { title: screen.title });
					if (screen.reportedCwd !== prevCwd && screen.reportedCwd) {
						session.cwd = screen.reportedCwd;
						patchTab(session.id, { cwd: screen.reportedCwd });
					}
					scheduleBump();
				} else if (frame.type === "exit") {
					session.exitInfo = { code: frame.code ?? null, signal: frame.signal ?? null };
					session.status = "exited";
					patchTab(session.id, { status: "exited" });
				}
			};
			ws.onclose = () => {
				session.ws = null;
				if (session.status !== "exited" && session.status !== "error") {
					session.status = "error";
					patchTab(session.id, { status: "error" });
				}
			};
			ws.onerror = () => {
				// onclose follows
			};
		}

		/** Open a new terminal session; returns its id, or null at the cap. */
		function openSession(cwd) {
			if (sessionMap.size >= MAX_SESSIONS) return null;
			const id = `term-${nextSessionId++}`;
			const session = {
				id,
				cwd: cwd ?? "",
				screen: createScreen(),
				ws: null,
				status: "connecting",
				exitInfo: null
			};
			sessionMap.set(id, session);
			const tab = { id, status: "connecting", title: defaultTitle(session.cwd, id) };
			setState({ sessions: [...panelState.sessions, tab], activeId: id });
			connectSession(session);
			return id;
		}

		/** Kill one session and drop its tab. */
		function closeSession(id) {
			const session = sessionMap.get(id);
			if (session !== void 0) {
				try {
					session.ws?.close();
				} catch {
					// already closed
				}
				sessionMap.delete(id);
			}
			const remaining = panelState.sessions.filter((tab) => tab.id !== id);
			const activeId = remaining.length === 0
				? null
				: panelState.activeId === id
					? remaining[remaining.length - 1].id
					: panelState.activeId;
			setState({ sessions: remaining, activeId });
		}

		/** Reconnect one session (fresh shell after exit / error). */
		function restartSession(id) {
			const session = sessionMap.get(id);
			if (session === void 0) return;
			try {
				session.ws?.close();
			} catch {
				// already closed
			}
			connectSession(session);
			bump();
		}

		/** Kill every session and hide the panel. */
		function closeAll() {
			for (const session of sessionMap.values()) {
				try {
					session.ws?.close();
				} catch {
					// already closed
				}
			}
			sessionMap.clear();
			setState({ sessions: [], activeId: null, visible: false });
		}

		/** First-open behavior: a visible panel always has at least one shell. */
		function ensureSession(cwd) {
			if (panelState.visible && panelState.sessions.length === 0) return openSession(cwd);
			return null;
		}

		/** Chunk large pastes to stay under the host input cap (64 KiB default). */
		const MAX_INPUT_CHUNK = 32 * 1024;

		function sendInput(id, data) {
			const session = sessionMap.get(id);
			const ws = session?.ws;
			if (ws === null || ws === void 0 || ws.readyState !== WebSocket.OPEN) return;
			if (typeof data !== "string" || data.length === 0) return;
			if (data.length <= MAX_INPUT_CHUNK) {
				ws.send(JSON.stringify({ type: "input", data }));
				return;
			}
			for (let i = 0; i < data.length; i += MAX_INPUT_CHUNK) {
				ws.send(JSON.stringify({ type: "input", data: data.slice(i, i + MAX_INPUT_CHUNK) }));
			}
		}

		/** Plain-text snapshot of the visible window (Copy button). */
		function screenText(screen) {
			const start = Math.max(0, screen.lines.length - MAX_RENDER_LINES);
			return screen.lines.slice(start).map((line) => line.map((c) => c.ch).join("").replace(/\s+$/, "")).join("\n");
		}

		function sendResize(id, cols, rows) {
			const session = sessionMap.get(id);
			const ws = session?.ws;
			if (ws === null || ws === void 0 || ws.readyState !== WebSocket.OPEN) return;
			ws.send(JSON.stringify({ type: "resize", cols, rows }));
		}

		/** Test seam: reset the manager and panel store. */
		function resetManager() {
			for (const session of sessionMap.values()) {
				try {
					session.ws?.close();
				} catch {
					// already closed
				}
			}
			sessionMap.clear();
			nextSessionId = 1;
			panelState = { visible: false, maximized: false, version: 0, sessions: [], activeId: null, fontSize: 13 };
		}

		// ─────────────────── components ───────────────────

		function StatusDot({ status }) {
			const className = "tw-terminal-tab-dot tw-dot-" + (status === "connected" ? "connected" : status === "exited" || status === "error" ? "error" : "connecting");
			return React.createElement("span", { className });
		}

		function TabBar({ sessions, activeId, onSelect, onClose, onNew, canAdd }) {
			const tabs = sessions.map((tab) =>
				React.createElement("div", {
					key: tab.id,
					className: "tw-terminal-tab" + (tab.id === activeId ? " tw-active" : ""),
					onClick: () => onSelect(tab.id),
					title: tab.title
				},
					React.createElement(StatusDot, { status: tab.status }),
					React.createElement("span", { style: { overflow: "hidden", textOverflow: "ellipsis" } }, tab.title),
					React.createElement("button", {
						className: "tw-terminal-tab-x",
						title: "Close this shell",
						onClick: (event) => {
							event.stopPropagation();
							onClose(tab.id);
						}
					}, "\u00d7")
				)
			);
			return React.createElement("div", { className: "tw-terminal-tabs" },
				tabs,
				React.createElement("button", {
					className: "tw-terminal-btn",
					onClick: onNew,
					disabled: !canAdd,
					title: canAdd ? "New shell" : "Session limit reached"
				}, "+")
			);
		}

		/** Bottom-docked terminal panel (tabs + active session body). */
		function TerminalPanelInner(props) {
			const useSessions = props.useSessions;
			const state = props.state;
			const activeId = state.activeId;
			const session = activeId !== null ? sessionMap.get(activeId) : void 0;
			const bodyRef = React.useRef(null);
			const inputRef = React.useRef(null);
			const stickRef = React.useRef(true);
			const [copyOk, setCopyOk] = React.useState(false);
			const fontSize = typeof state.fontSize === "number" ? Math.min(20, Math.max(10, state.fontSize)) : 13;
			const cwd = typeof useSessions === "function"
				? useSessions((s) => (s.current ? s.byId[s.current]?.cwd ?? null : null))
				: null;

			// keep input focused on the active session
			React.useEffect(() => {
				if (session?.status === "connected") inputRef.current?.focus();
			}, [activeId, session?.status]);

			// auto-scroll while stuck to the bottom
			React.useLayoutEffect(() => {
				const body = bodyRef.current;
				if (body !== null && stickRef.current) body.scrollTop = body.scrollHeight;
			}, [state.version, activeId]);

			// forward container size changes to the active PTY
			React.useEffect(() => {
				const body = bodyRef.current;
				if (body === null) return;
				let raf = null;
				const send = () => {
					raf = null;
					if (activeId === null) return;
					const metrics = measureCell();
					const cols = Math.max(2, Math.floor(body.clientWidth / metrics.w));
					const rows = Math.max(2, Math.floor(body.clientHeight / metrics.h));
					sendResize(activeId, cols, rows);
				};
				const observer = new ResizeObserver(() => {
					if (raf === null) raf = requestAnimationFrame(send);
				});
				observer.observe(body);
				send();
				return () => {
					observer.disconnect();
					if (raf !== null) cancelAnimationFrame(raf);
				};
			}, [activeId]);

			const onScroll = React.useCallback(() => {
				const body = bodyRef.current;
				if (body === null) return;
				stickRef.current = body.scrollHeight - body.scrollTop - body.clientHeight < 40;
			}, []);

			const onKeyDown = React.useCallback((event) => {
				if (activeId === null) return;
				const data = keyToInput(event);
				if (data === null) return;
				event.preventDefault();
				sendInput(activeId, data);
			}, [activeId]);

			const onPaste = React.useCallback((event) => {
				if (activeId === null) return;
				event.preventDefault();
				const text = event.clipboardData?.getData("text") ?? "";
				if (text.length === 0) return;
				const screen = sessionMap.get(activeId)?.screen;
				const payload = screen !== void 0 && screen.bracketPaste ? `\x1b[200~${text}\x1b[201~` : text;
				sendInput(activeId, payload);
			}, [activeId]);

			const onContainerClick = React.useCallback(() => {
				// Don't steal focus while the user is selecting text to copy.
				try {
					const sel = typeof window !== "undefined" && window.getSelection ? window.getSelection() : null;
					if (sel && !sel.isCollapsed) return;
				} catch {
					// selection API unavailable; fall through to focus
				}
				inputRef.current?.focus();
			}, []);

			const onCopy = React.useCallback(() => {
				const screen = activeId !== null ? sessionMap.get(activeId)?.screen : void 0;
				if (!screen) return;
				const text = screenText(screen);
				const done = () => {
					setCopyOk(true);
					setTimeout(() => setCopyOk(false), 1200);
				};
				try {
					const clipboard = typeof navigator !== "undefined" ? navigator.clipboard : null;
					if (clipboard && typeof clipboard.writeText === "function") {
						clipboard.writeText(text).then(done, () => setCopyOk(false));
						return;
					}
				} catch {
					// fall through to the textarea fallback
				}
				try {
					const ta = document.createElement("textarea");
					ta.value = text;
					document.body.appendChild(ta);
					ta.select();
					document.execCommand("copy");
					ta.remove();
					done();
				} catch {
					// clipboard unavailable
				}
			}, [activeId]);

			const onClear = React.useCallback(() => {
				const screen = activeId !== null ? sessionMap.get(activeId)?.screen : void 0;
				if (!screen) return;
				clearScreen(screen);
				bump();
				inputRef.current?.focus();
			}, [activeId]);

			const screen = session?.screen;
			const slice = screen !== void 0 ? visibleSlice(screen) : { start: 0, total: 0, hidden: 0 };
			const lineNodes = screen !== void 0 ? renderScreenLines(screen, slice.start) : [];

			const notice = session !== void 0 && session.status === "exited"
				? React.createElement("div", { className: "tw-terminal-notice" },
					React.createElement("span", null, "Process exited",
						session.exitInfo !== null && session.exitInfo.code !== null
							? React.createElement("code", null, `code ${session.exitInfo.code}`)
							: session.exitInfo !== null && session.exitInfo.signal
								? React.createElement("code", null, `signal ${session.exitInfo.signal}`)
								: null),
					React.createElement("button", { className: "tw-terminal-btn", onClick: () => restartSession(activeId) }, "Start new shell")
				)
				: session !== void 0 && session.status === "error"
					? React.createElement("div", { className: "tw-terminal-notice" },
						React.createElement("span", null, "Connection lost."),
						React.createElement("button", { className: "tw-terminal-btn", onClick: () => restartSession(activeId) }, "Reconnect")
					)
					: null;

			const statusText = session === void 0 ? "no session" : session.status === "connected" ? "connected" : session.status === "connecting" ? "connecting…" : session.status === "exited" ? "exited" : "disconnected";
			const statusClass = "tw-terminal-status" + (session?.status === "connected" ? " tw-running" : session?.status === "error" || session?.status === "exited" ? " tw-error" : "");

			return React.createElement("div", { className: "tw-terminal-panel" + (state.maximized ? " tw-maximized" : "") },
				React.createElement(TabBar, {
					sessions: state.sessions,
					activeId,
					onSelect: (id) => setState({ activeId: id }),
					onClose: closeSession,
					onNew: () => openSession(cwd),
					canAdd: state.sessions.length < MAX_SESSIONS
				}),
				React.createElement("div", { className: "tw-terminal-head" },
					React.createElement("span", { className: "tw-terminal-title" }, "Terminal"),
					React.createElement("span", { className: "tw-terminal-cwd", title: session?.cwd ?? cwd ?? "" }, session?.cwd ?? cwd ?? "workspace"),
					React.createElement("span", { className: statusClass }, statusText),
					React.createElement("button", { className: "tw-terminal-btn tw-icon" + (copyOk ? " tw-terminal-copyok" : ""), title: "Copy visible output to clipboard", onClick: onCopy }, copyOk ? "✓" : "⧉"),
					React.createElement("button", { className: "tw-terminal-btn tw-icon", title: "Clear scrollback (local view only)", onClick: onClear }, "⌫"),
					React.createElement("button", { className: "tw-terminal-btn tw-icon", title: "Smaller font", disabled: fontSize <= 10, onClick: () => setState({ fontSize: fontSize - 1 }) }, "A−"),
					React.createElement("button", { className: "tw-terminal-btn tw-icon", title: "Larger font", disabled: fontSize >= 20, onClick: () => setState({ fontSize: fontSize + 1 }) }, "A+"),
					React.createElement("button", { className: "tw-terminal-btn tw-icon", title: "Minimize (keep shells running)", onClick: () => setState({ visible: false }) }, "\u2013"),
					React.createElement("button", { className: "tw-terminal-btn tw-icon", title: state.maximized ? "Restore" : "Maximize", onClick: () => setState({ maximized: !state.maximized }) }, state.maximized ? "\u21f2" : "\u26f6"),
					React.createElement("button", { className: "tw-terminal-btn tw-icon", title: "Close all shells", onClick: closeAll }, "\u00d7")
				),
				React.createElement("div", { className: "tw-terminal-body", ref: bodyRef, onScroll, onClick: onContainerClick, style: { fontSize: `${fontSize}px` } },
					slice.hidden > 0 ? React.createElement("div", { className: "tw-terminal-scrollback" },
						React.createElement("span", null, `showing last ${slice.total - slice.start} of ${slice.total} lines — Clear frees memory`)
					) : null,
					React.createElement("div", { className: "tw-terminal-lines" }, lineNodes),
					React.createElement("input", {
						ref: inputRef,
						className: "tw-terminal-input",
						autoComplete: "off",
						spellCheck: false,
						"aria-label": "Terminal input",
						onKeyDown,
						onPaste
					}),
					notice
				)
			);
		}

		/** Slim bottom bar shown while the panel is minimized with live sessions. */
		function MinimizedBar({ sessions }) {
			return React.createElement("div", {
				className: "tw-terminal-minbar",
				onClick: () => setState({ visible: true })
			},
				React.createElement("span", { className: "tw-term-glyph" }, ">_"),
				React.createElement("span", { className: "tw-terminal-minbar-title" }, "Terminal"),
				React.createElement("span", { className: "tw-terminal-minbar-count" }, `${sessions.length} session${sessions.length === 1 ? "" : "s"} running`),
				React.createElement("button", {
					className: "tw-terminal-btn",
					title: "Close all shells",
					onClick: (event) => {
						event.stopPropagation();
						closeAll();
					}
				}, "Close")
			);
		}

		/** Overlay slot occupant: full panel when visible, slim bar when minimized. */
		function TerminalOverlay(props) {
			const state = React.useSyncExternalStore(subscribePanel, getPanelState);
			const useSessions = props.useSessions;
			const cwd = typeof useSessions === "function"
				? useSessions((s) => (s.current ? s.byId[s.current]?.cwd ?? null : null))
				: null;
			// First open should land in a working shell, not an empty panel.
			React.useEffect(() => {
				ensureSession(cwd);
			}, [state.visible, state.sessions.length, cwd]);
			if (state.visible) return React.createElement(TerminalPanelInner, { state, useSessions });
			if (state.sessions.length > 0) return React.createElement(MinimizedBar, { sessions: state.sessions });
			return null;
		}

		/** Sidebar foot toggle beside Settings. */
		function TerminalToggle(props) {
			const wide = props.wide === true;
			const state = React.useSyncExternalStore(subscribePanel, getPanelState);
			const onClick = React.useCallback(() => setState({ visible: !state.visible }), [state.visible]);
			const label = state.sessions.length > 0 ? `Terminal (${state.sessions.length})` : "Terminal";
			return React.createElement("button", {
				className: "tw-term-toggle" + (state.visible ? " tw-active" : ""),
				onClick,
				title: "Toggle the workspace terminal"
			}, wide
				? React.createElement(React.Fragment, null, React.createElement("span", { className: "tw-term-glyph" }, ">_"), " ", label)
				: React.createElement("span", { className: "tw-term-glyph" }, ">_"));
		}

		// ─────────────────────── plugin body ───────────────────────

		const inject = ["slots"];

		function apply(ctx) {
			ctx.slots.inject("shell.overlay", () => ctx.slots.register({
				name: "shell.overlay",
				id: "terminal",
				order: 90,
				label: "Terminal"
			}, TerminalOverlay));
			ctx.slots.inject("sidebar.footer.action", () => ctx.slots.register({
				name: "sidebar.footer.action",
				id: "terminal-toggle",
				order: 10,
				label: "Terminal"
			}, TerminalToggle));
		}

		exports.TerminalOverlay = TerminalOverlay;
		exports.TerminalToggle = TerminalToggle;
		exports.apply = apply;
		exports.inject = inject;
		exports.createScreen = createScreen;
		exports.writeScreen = writeScreen;
		exports.clearScreen = clearScreen;
		exports.visibleSlice = visibleSlice;
		exports.screenText = screenText;
		exports.handleOsc = handleOsc;
		exports.MAX_RENDER_LINES = MAX_RENDER_LINES;
		exports.MAX_LINES = MAX_LINES;
		exports.lineSegments = lineSegments;
		exports.keyToInput = keyToInput;
		exports.openSession = openSession;
		exports.closeSession = closeSession;
		exports.closeAll = closeAll;
		exports.restartSession = restartSession;
		exports.sendInput = sendInput;
		exports.sendResize = sendResize;
		exports.ensureSession = ensureSession;
		exports.resetManager = resetManager;
		exports.getPanelState = getPanelState;
		exports.setState = setState;
		return module.exports;
	}
});
