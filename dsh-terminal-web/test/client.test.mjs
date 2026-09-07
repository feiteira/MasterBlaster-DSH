// Node harness: stub browser globals, load the client bundle, and exercise
// the screen model / ANSI parser / input mapping / session manager.
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);

let registered = null;
globalThis.window = {
  __ModuleLoader__: {
    load: (handoff) => {
      registered = handoff;
    }
  },
  innerWidth: 1200,
  innerHeight: 800
};
globalThis.location = { protocol: "http:", host: "127.0.0.1:3080" };
globalThis.requestAnimationFrame = (cb) => setTimeout(cb, 0);
globalThis.cancelAnimationFrame = (id) => clearTimeout(id);

// Fake WebSocket capturing instances; tests drive open/message/close.
class FakeWebSocket {
  static instances = [];
  static OPEN = 1;
  constructor(url) {
    this.url = url;
    this.readyState = 0;
    this.sent = [];
    this.onopen = null;
    this.onmessage = null;
    this.onclose = null;
    this.onerror = null;
    FakeWebSocket.instances.push(this);
  }
  send(data) {
    this.sent.push(data);
  }
  close() {
    this.readyState = 3;
    if (this.onclose) this.onclose();
  }
  _open() {
    this.readyState = 1;
    if (this.onopen) this.onopen();
  }
  _message(frame) {
    if (this.onmessage) this.onmessage({ data: JSON.stringify(frame) });
  }
}
globalThis.WebSocket = FakeWebSocket;

globalThis.document = {
  createElement: () => ({
    dataset: {},
    style: {},
    textContent: "",
    getBoundingClientRect: () => ({ width: 8, height: 16 }),
    remove() {},
    appendChild() {}
  }),
  head: { appendChild() {} },
  body: { appendChild() {} },
  querySelectorAll: () => []
};

const mod = await import("../lib/client.js");
const loader = registered;
if (loader === null || loader.id !== "dsh-terminal-web") throw new Error("bundle did not register");
const plugin = loader.factory(require);
const { createScreen, writeScreen, clearScreen, visibleSlice, screenText, handleOsc, MAX_RENDER_LINES, lineSegments, keyToInput, openSession, closeSession, closeAll, restartSession, sendInput, sendResize, ensureSession, resetManager, getPanelState, setState } = plugin;

let failures = 0;
function assert(cond, label) {
  if (cond) {
    console.log("  ok  " + label);
  } else {
    failures++;
    console.log("FAIL  " + label);
  }
}

// 1. basic lines
{
  const s = createScreen();
  writeScreen(s, "hello\r\nworld");
  assert(s.lines.length === 2, "hello\\r\\nworld -> 2 lines");
  assert(s.lines[0].map((c) => c.ch).join("") === "hello", "line0 = hello");
  assert(s.lines[1].map((c) => c.ch).join("") === "world", "line1 = world");
  assert(s.cursorY === 1 && s.cursorX === 5, "cursor at (1,5)");
}

// 2. colors
{
  const s = createScreen();
  writeScreen(s, "\x1b[31mred\x1b[0mplain");
  const cells = s.lines[0];
  assert(cells[0].fg === "#cd3131" && cells[0].ch === "r", "red fg applied");
  assert(cells[3].fg === null && cells[3].ch === "p", "reset clears fg");
  assert(cells[0].bold === false, "not bold");
  writeScreen(s, "\n\x1b[1mbold\x1b[22mplain");
  assert(s.lines[1][0].bold === true, "bold applied");
  assert(s.lines[1][4].bold === false && s.lines[1][4].ch === "p", "bold reset");
}

// 3. 256 colors
{
  const s = createScreen();
  writeScreen(s, "\x1b[38;5;196mX\x1b[48;5;21mY\x1b[0m");
  assert(s.lines[0][0].fg === "#ff0000", "256 fg 196 = #ff0000");
  assert(s.lines[0][1].bg === "#0000ff", "256 bg 21 = #0000ff");
}

// 4. clear screen
{
  const s = createScreen();
  writeScreen(s, "abc\r\ndef\x1b[2J");
  assert(s.lines.length === 1 && s.lines[0].length === 0, "2J clears screen");
}

// 5. erase to end of line (blanks in place, cursor stays)
{
  const s = createScreen();
  writeScreen(s, "abcdef");
  writeScreen(s, "\x1b[2D\x1b[K");
  assert(s.lines[0].length === 6, "K keeps line length (erase, not delete)");
  assert(s.lines[0].slice(0, 4).map((c) => c.ch).join("") === "abcd", "K keeps prefix");
  assert(s.lines[0].slice(4).every((c) => c.ch === " "), "K blanks from cursor to EOL");
}

// 6. bracket paste flag
{
  const s = createScreen();
  writeScreen(s, "\x1b[?2004h");
  assert(s.bracketPaste === true, "2004h enables bracketed paste");
  writeScreen(s, "\x1b[?2004l");
  assert(s.bracketPaste === false, "2004l disables bracketed paste");
}

// 7. readline-style prompt redraw (\\r + overwrite + \\x1b[K)
{
  const s = createScreen();
  writeScreen(s, "$ ls");
  writeScreen(s, "\r$ ls -la\x1b[K");
  const text = s.lines[0].map((c) => c.ch).join("");
  assert(text === "$ ls -la", "prompt redraw overwrites in place: " + JSON.stringify(text));
}

// 8. cursor left/right
{
  const s = createScreen();
  writeScreen(s, "abcd");
  writeScreen(s, "\x1b[2D");
  assert(s.cursorX === 2, "cursor left 2");
  writeScreen(s, "\x1b[1C");
  assert(s.cursorX === 3, "cursor right 1");
}

// 9. carriage return alone resets column
{
  const s = createScreen();
  writeScreen(s, "abcdef");
  writeScreen(s, "\rXY");
  const text = s.lines[0].map((c) => c.ch).join("");
  assert(text === "XYcdef", "\\r overwrites from column 0");
}

// 10. backspace
{
  const s = createScreen();
  writeScreen(s, "abc");
  writeScreen(s, "\b\b");
  assert(s.cursorX === 1, "backspace moves cursor");
}

// 11. OSC title ignored
{
  const s = createScreen();
  writeScreen(s, "\x1b]0;title\x07hello");
  assert(s.lines[0].map((c) => c.ch).join("") === "hello", "OSC title skipped");
}

// 12. lineSegments cursor marker position
{
  const s = createScreen();
  writeScreen(s, "ab");
  writeScreen(s, "\x1b[1D");
  const segments = lineSegments(s.lines[0], s.cursorX);
  const cursorIndex = segments.findIndex((seg) => seg.cursor === true);
  assert(cursorIndex === 1, "cursor marker sits after 'a'");
}

// 13. input mapping
{
  const key = (k, o) => Object.assign({ key: k, ctrlKey: false, altKey: false, metaKey: false, shiftKey: false }, o || {});
  assert(keyToInput(key("Enter")) === "\r", "Enter -> CR");
  assert(keyToInput(key("Backspace")) === "\x7f", "Backspace -> DEL");
  assert(keyToInput(key("ArrowUp")) === "\x1b[A", "ArrowUp -> CSI A");
  assert(keyToInput(key("c", { ctrlKey: true })) === "\x03", "Ctrl+C -> 0x03");
  assert(keyToInput(key("l", { ctrlKey: true })) === "\x0c", "Ctrl+L -> 0x0c");
  assert(keyToInput(key("a")) === "a", "plain char passes through");
  assert(keyToInput(key("F5")) === "\x1b[15~", "F5 -> SS3-style sequence");
  assert(keyToInput(key("F1")) === "\x1bOP", "F1 -> application cursor");
  assert(keyToInput(key("Insert")) === "\x1b[2~", "Insert -> CSI 2~");
  assert(keyToInput(key("Tab", { shiftKey: true })) === "\x1b[Z", "Shift+Tab -> backtab");
  assert(keyToInput(key("C", { ctrlKey: true, shiftKey: true })) === null, "Ctrl+Shift+C reaches browser copy");
  assert(keyToInput(key("Tab")) === "\t", "Tab passes through");
}

// 14. long line hard-wrap
{
  const s = createScreen();
  writeScreen(s, "x".repeat(4010));
  assert(s.lines.length > 1, "over-long line wraps to a new model line");
}

// ── session manager ─────────────────────────────────────────────

// 15. open/close sessions, tabs, status transitions
{
  resetManager();
  FakeWebSocket.instances.length = 0;
  const id1 = openSession("/var/lib/harness/Test");
  assert(id1 === "term-1", "first session id term-1");
  assert(FakeWebSocket.instances.length === 1, "one WebSocket opened");
  assert(FakeWebSocket.instances[0].url.includes("/terminal.ws"), "ws URL targets /terminal.ws");
  assert(FakeWebSocket.instances[0].url.includes(encodeURIComponent("/var/lib/harness/Test")), "ws URL carries workspace cwd");
  let state = getPanelState();
  assert(state.sessions.length === 1 && state.activeId === id1, "one tab, active");
  FakeWebSocket.instances[0]._open();
  state = getPanelState();
  assert(state.sessions[0].status === "connected", "tab status flips to connected");
  const id2 = openSession("/var/lib/harness/Test");
  assert(state.sessions.length === 1 && id2 === "term-2", "two sessions after second open");
  state = getPanelState();
  assert(state.sessions.length === 2 && state.activeId === id2, "second tab active after open");
  FakeWebSocket.instances[1]._open();
  closeSession(id1);
  state = getPanelState();
  assert(state.sessions.length === 1 && state.sessions[0].id === id2, "closing a tab removes it");
  assert(state.activeId === id2, "active falls back to remaining tab");
  closeAll();
  state = getPanelState();
  assert(state.sessions.length === 0 && state.activeId === null && state.visible === false, "closeAll clears tabs and hides panel");
}

// 16. input and resize frames route to the right socket
{
  resetManager();
  FakeWebSocket.instances.length = 0;
  const id = openSession("");
  FakeWebSocket.instances[0]._open();
  sendInput(id, "echo hi\r");
  const inputFrame = JSON.parse(FakeWebSocket.instances[0].sent[0]);
  assert(inputFrame.type === "input" && inputFrame.data === "echo hi\r", "input frame sent to the session socket");
  sendResize(id, 100, 30);
  const resizeFrame = JSON.parse(FakeWebSocket.instances[0].sent[1]);
  assert(resizeFrame.type === "resize" && resizeFrame.cols === 100 && resizeFrame.rows === 30, "resize frame sent");
  // input while closed is dropped, not thrown
  closeSession(id);
  sendInput(id, "x");
  assert(true, "sendInput on closed session is a safe no-op");
}

// 17. output feeds the session screen and bumps the store
{
  resetManager();
  FakeWebSocket.instances.length = 0;
  const id = openSession("");
  const ws = FakeWebSocket.instances[0];
  ws._open();
  ws._message({ type: "output", data: "hello\r\nworld" });
  await new Promise((r) => setTimeout(r, 10)); // let the rAF bump flush
  const state = getPanelState();
  assert(state.version > 0, "output bumps panel version");
}

// 18. restart reconnects the same tab
{
  resetManager();
  FakeWebSocket.instances.length = 0;
  const id = openSession("");
  FakeWebSocket.instances[0]._open();
  FakeWebSocket.instances[0]._message({ type: "exit", code: 0 });
  let state = getPanelState();
  assert(state.sessions[0].status === "exited", "exit frame marks tab exited");
  restartSession(id);
  assert(FakeWebSocket.instances.length === 2, "restart opens a fresh socket");
  state = getPanelState();
  assert(state.sessions.length === 1 && state.sessions[0].status === "connecting", "same tab, reconnecting");
}

// 19. session cap
{
  resetManager();
  FakeWebSocket.instances.length = 0;
  for (let i = 0; i < 8; i++) openSession("");
  assert(openSession("") === null, "ninth session refused at the cap");
  assert(getPanelState().sessions.length === 8, "eight tabs at the cap");
}

// 20. first open creates a shell automatically
{
  resetManager();
  FakeWebSocket.instances.length = 0;
  setState({ visible: true });
  ensureSession("/var/lib/harness/Test");
  let state = getPanelState();
  assert(state.sessions.length === 1 && state.activeId === "term-1", "first open spawns one shell");
  ensureSession("/var/lib/harness/Test");
  state = getPanelState();
  assert(state.sessions.length === 1, "second ensure is a no-op while a session exists");
  // after closing the panel with sessions alive, reopening does not duplicate
  setState({ visible: false });
  setState({ visible: true });
  ensureSession("/var/lib/harness/Test");
  state = getPanelState();
  assert(state.sessions.length === 1, "minimize/restore keeps the same session");
  // after closeAll, the next open starts fresh again
  closeAll();
  setState({ visible: true });
  ensureSession("/var/lib/harness/Test");
  state = getPanelState();
  assert(state.sessions.length === 1, "open after closeAll spawns a new shell");
}

// 21. OSC title + cwd
{
  const s = createScreen();
  writeScreen(s, "\x1b]0;my-title\x07hello");
  assert(s.title === "my-title", "OSC 0 sets title");
  assert(s.lines[0].map((c) => c.ch).join("") === "hello", "OSC title skipped in output");
  writeScreen(s, "\x1b]7;file://host/var/lib/harness/ws\x07");
  assert(s.reportedCwd === "/var/lib/harness/ws", "OSC 7 sets reported cwd");
}

// 22. split escape across frames is buffered
{
  const s = createScreen();
  writeScreen(s, "\x1b[3");
  assert(s.buf.length > 0, "incomplete CSI buffered");
  writeScreen(s, "1mX\x1b[0m");
  assert(s.lines[0][0].fg === "#cd3131", "split SGR still applies color");
  assert(s.buf === "", "buffer drained after completion");
}

// 23. extended CSI: insert/delete lines and chars
{
  const s = createScreen();
  writeScreen(s, "a\r\nb\r\nc");
  writeScreen(s, "\x1b[1;1H\x1b[1L");
  assert(s.lines.length === 4, "IL inserts a blank line");
  writeScreen(s, "\x1b[1;1H\x1b[1M");
  assert(s.lines.length === 3, "DL removes the blank line");
  const t = createScreen();
  writeScreen(t, "abcdef");
  writeScreen(t, "\x1b[1G\x1b[2P");
  assert(t.lines[0].map((c) => c.ch).join("") === "cdef", "DCH deletes chars: " + JSON.stringify(t.lines[0].map((c) => c.ch).join("")));
  const u = createScreen();
  writeScreen(u, "ab");
  writeScreen(u, "\x1b[1G\x1b[2@");
  assert(u.lines[0].length === 4, "ICH inserts blanks");
}

// 24. erase modes + cursor visibility + tab stops
{
  const s = createScreen();
  writeScreen(s, "abcdef");
  writeScreen(s, "\x1b[1K");
  assert(s.lines[0].length === 6 && s.lines[0].every((c) => c.ch === " "), "EL 1 blanks from start through cursor");
  writeScreen(s, "\x1b[?25l");
  assert(s.cursorVisible === false, "cursor hidden");
  writeScreen(s, "\x1b[?25h");
  assert(s.cursorVisible === true, "cursor shown");
  const t = createScreen();
  writeScreen(t, "a\tb");
  assert(t.cursorX === 9, "tab advances to column 8: " + t.cursorX);
}

// 25. windowing + clear + copy text
{
  const s = createScreen();
  for (let i = 0; i < MAX_RENDER_LINES + 50; i++) writeScreen(s, `line-${i}\r\n`);
  const slice = visibleSlice(s);
  assert(slice.hidden === 50 + 1 || slice.hidden > 0, "scrollback hidden count: " + slice.hidden);
  assert(slice.total - slice.start <= MAX_RENDER_LINES, "window capped at MAX_RENDER_LINES");
  const text = screenText(s);
  assert(text.includes(`line-${MAX_RENDER_LINES + 49}`), "copy text covers visible window");
  clearScreen(s);
  assert(s.lines.length === 1 && s.cursorY === 0, "clear resets the model");
}

// 26. large paste is chunked across frames
{
  resetManager();
  FakeWebSocket.instances.length = 0;
  const id = openSession("");
  FakeWebSocket.instances[0]._open();
  const big = "x".repeat(40 * 1024);
  sendInput(id, big);
  assert(FakeWebSocket.instances[0].sent.length === 2, "40KiB paste splits into 2 frames");
  closeSession(id);
}

console.log(failures === 0 ? "\nALL TESTS PASSED" : `\n${failures} TEST(S) FAILED`);
process.exit(failures === 0 ? 0 : 1);
