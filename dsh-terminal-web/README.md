# dsh-terminal-web

An interactive command-line terminal for the DeepSeek Harness **Web GUI**, opened
directly in the workspace you are working in — no agent round-trip needed.

- **Host half** (`lib/index.js`): a Cordis plugin that mounts one WebSocket
  endpoint, `/terminal.ws`, and owns a real PTY shell (`node-pty`) per socket.
  The shell starts in the requested workspace directory; the socket lifecycle
  IS the session lifecycle (closing the socket kills the shell).
- **Client half** (`lib/client.js`): a browser bundle that renders a
  bottom-docked terminal panel into the `shell.overlay` slot, plus a
  `>_ Terminal` toggle into the `sidebar.footer.action` slot. It streams PTY
  output into a compact ANSI-aware screen model (colors, 256-color, bold,
  cursor movement, erase/clear, insert/delete line/char, scroll, tab stops,
  OSC title + cwd, bracketed paste, split-sequence buffering) and forwards
  keystrokes, paste, and resize frames to the host. Only the last 400 lines
  render (scrollback stays in the model); the header offers Copy, Clear,
  and font-size controls, and text selection no longer steals focus.

## Wiring

The web profile mounts it through `cordis.patch.yml`:

```yaml
- insert:
    - id: terminal-web
      name: 'dsh-terminal-web'
      inject: [webRuntime]
      config:
        trustedHosts: !!js ctx.webRuntime.trustedHosts
```

## Endpoint

`ws(s)://<host>/terminal.ws?cwd=<workspace>&cols=<n>&rows=<n>`

- Requests pass the same browser-trust fence as `/api` (loopback or configured
  `trustedHosts` authority plus a same-origin browser marker).
- Client → server frames (JSON): `{type:"input",data}`, `{type:"resize",cols,rows}`.
- Server → client frames (JSON): `{type:"output",data}`, `{type:"exit",code,signal}`.

The shell binary defaults to `$SHELL`, then `/bin/bash` (`powershell.exe` on
Windows); override with the `shell` config key. `maxSessions` caps concurrent
PTYs (default 8). `maxInputBytes` caps each input frame (default 64 KiB —
the client chunks large pastes automatically).

Tab titles follow the shell's OSC 0/1/2 title when set, and the header cwd
follows OSC 7 `file://` reports (so `cd` updates the display). `Ctrl+Shift+C`
is left for browser copy; function keys, Insert, Shift+Tab, and Ctrl/Shift
arrow modifiers are forwarded.

## Tests

`node test/client.test.mjs` — screen model / ANSI parser / OSC / windowing /
input mapping / chunking.
`node test/host.test.mjs` — trust fence, PTY spawn in workspace cwd, resize,
fallback cwd, exit frames (needs a real `ws` client and `node-pty`).

## Security notes

The terminal runs as the harness user with full host access — the same
boundary as the agent's own `bash` tool. The endpoint is fenced to loopback /
trusted hosts and is not an authentication layer.
