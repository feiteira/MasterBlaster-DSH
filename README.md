# Master Blaster

**Master Blaster** is the plugin pack that powers the DeepSeek Harness Web
GUI in this deployment: a monorepo of client + host plugins that extend the
stock harness with browser-style workspace tabs, a file manager, a real
terminal, search, and quality-of-life tweaks.

## Plugins

| Package | What it does |
|---|---|
| [`dsh-workspace-tabs`](dsh-workspace-tabs) | Browser-style tabs across the top for every workspace, a `+` button that opens/creates a new project folder, and a scoped native sidebar that follows the active tab. |
| [`dsh-file-explorer`](dsh-file-explorer) | Right-docked file manager: browse (Up works even above the project root), upload via drag-and-drop, preview, download, zip, rename, delete, new file/folder. |
| [`dsh-terminal-web`](dsh-terminal-web) | Bottom-docked real PTY terminal rooted at the session workspace. |
| [`dsh-fart-search`](dsh-fart-search) | FART (file-and-symbol) search across the workspace. |
| [`dsh-session-icon`](dsh-session-icon) | Optional leading icons on sidebar session rows. |
| [`dsh-executor-model`](dsh-executor-model) | Optional per-chat executor model (Main/Thinker delegates bounded tasks to it). |
| [`dsh-remote-settings`](dsh-remote-settings) | Host-backed Settings → Models for the basic-auth reverse proxy. |

Plus the deployment helpers at the repo root:

- `patch-dsh-remote-settings.sh` — installs the remote-settings patch.
- `upgrade-dsh-0.1.2-rc.1.sh` — upgrades the base `dsh` installation.

## Installation

Each plugin is a plain Node package installed under
`~/.dsh/profiles/node_modules` (the running `dsh web` profile) and enabled
with an `insert` entry in `~/.dsh/profiles/web/cordis.patch.yml` — see the
individual READMEs for the exact wiring. Client halves are plain
`window.__ModuleLoader__.load()` bundles, so page reloads pick them up
immediately; host halves load when the `dsh web` process starts.

## Development

- Each package is self-contained: `lib/client.js` (browser half),
  `lib/index.js` + support files (host half), and `test/*.test.mjs`.
- Run a package's tests with plain Node — no build step:
  `(cd dsh-file-explorer && node test/policy.test.mjs test/host.test.mjs test/client.test.mjs)`
- The GUI can be exercised headlessly with the Playwright scripts in
  `.verification/` (browser runtime libraries are downloaded there too).

## License

MIT — see the individual packages.
