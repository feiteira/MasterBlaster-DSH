# dsh-fart-search

**FART** (Find And Retrieve Text) is a workspace search panel for the DeepSeek
Harness **Web GUI**. Search file contents or names in the open session's
project directory, preview a snippet, and jump between matches.

- **Host half** (`lib/index.js`): Cordis plugin that mounts `/api/fart.search/*`
  under the same browser-trust fence as `/api` (loopback or configured
  `trustedHosts`, never cross-site). Every path is canonicalized with
  `realpath` and must stay inside the addressed session's project directory.
  Search is backed by the packaged ripgrep binary (`@vscode/ripgrep`).
- **Client half** (`lib/client.js`): a right-docked FART panel in
  `shell.overlay` plus a Search toggle in `sidebar.footer.action`.
  `Ctrl+Shift+F` / `Cmd+Shift+F` opens and focuses the query box.

## Use

1. Refresh the existing DSH page after installation.
2. Open a chat so a workspace session is attached.
3. Click **Search** in the sidebar footer, or press **Ctrl+Shift+F**.
4. Type. **Text** searches contents; **Files** matches names.
   **Aa** case, **.*** regex, **W** whole word, **·** hidden files, **All**
   also walks `node_modules` / gitignored trees. Optional include glob
   (for example `*.js`). Click a hit to preview surrounding lines.

## Wiring

The web profile mounts it through `cordis.patch.yml`:

```yaml
- insert:
    - id: fart-search
      name: 'dsh-fart-search'
      inject: [webRuntime]
      config:
        trustedHosts: !!js ctx.webRuntime.trustedHosts
```

The package lives next to `dsh-file-explorer` under `profiles/node_modules`
(Node walks up from the web profile directory). A Web profile with
`patchReload: live` can mount the host plugin without a process restart. A
browser refresh at the existing DSH URL is required to discover a newly
mounted client plugin.

## Endpoints

All routes require `sessionId` of an attached session. `path` is relative to
that session's project directory (absolute paths are accepted only when they
still stay inside it).

| Method | Path | Purpose |
|---|---|---|
| `GET` | `/api/fart.search/query?sessionId=&q=&kind=content\|files&regex=&case=&word=&hidden=&all=&include=&path=` | Ripgrep search |
| `GET` | `/api/fart.search/snippet?sessionId=&path=&line=&context=` | Bounded preview around a line |

Default result cap is 250 matches (`maxMatches`). Search is killed after
15s (`timeoutMs`). Symlinks are not followed. `.git` is never searched;
`node_modules`, `.verification`, `.upgrade`, `dist`, and `build` are skipped
unless **All** is on.

## Tests

```sh
npm test
```

`node test/policy.test.mjs` — containment and the trust fence.
`node test/search.test.mjs` — argv, JSON parse, live ripgrep.
`node test/host.test.mjs` — query / snippet / escapes / cross-origin.
`node test/client.test.mjs` — grouping, highlight, hotkey, URL helpers.

## Security notes

FART can read the session workspace as the harness user — the same boundary
as the agent's own filesystem tools. The HTTP surface is fenced to loopback /
trusted hosts and is not an authentication layer. Symlink escapes are refused
(`realpath` on both the root and the target). A host `RIPGREP_CONFIG_PATH` is
ignored (`--no-config`).
