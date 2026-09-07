# dsh-file-explorer

A workspace **file explorer** for the DeepSeek Harness **Web GUI** — browse the
open session's project directory, download files, and upload files (including
drag-and-drop from the desktop).

- **Host half** (`lib/index.js`): Cordis plugin that mounts `/api/file.explorer/*`
  under the same browser-trust fence as `/api` (loopback or configured
  `trustedHosts`, never cross-site). Every path is canonicalized with
  `realpath` and must stay inside the addressed session's project directory.
- **Client half** (`lib/client.js`): a right-docked explorer panel in
  `shell.overlay` plus a `Files` toggle in `sidebar.footer.action`. Drop files
  or folders from the OS onto the panel to upload; 👁 previews text/images
  in place, double-click downloads. Filter, sort (name/size/modified),
  hidden-file toggle, upload progress, inline confirm dialogs, rename,
  new file/folder, and keyboard (Enter opens, Backspace goes up) are built
  in. Row actions stay visible on touch devices; huge folders render in a
  capped window with "Show all".

## Wiring

The web profile mounts it through `cordis.patch.yml`:

```yaml
- insert:
    - id: file-explorer
      name: 'dsh-file-explorer'
      inject: [webRuntime]
      config:
        trustedHosts: !!js ctx.webRuntime.trustedHosts
```

The package lives next to `dsh-terminal-web` under `profiles/node_modules`
(Node walks up from the web profile directory).

## Endpoints

All routes require `sessionId` of an attached session. `path` / `dir` / `name`
are relative to that session's project directory (absolute paths are accepted
only when they still stay inside it).

| Method | Path | Purpose |
|---|---|---|
| `GET` | `/api/file.explorer/list?sessionId=&path=` | Directory listing |
| `GET` | `/api/file.explorer/download?sessionId=&path=` | Stream a file as an attachment |
| `GET` | `/api/file.explorer/zip?sessionId=&path=` | Stream a folder as a `.zip` (symlinks skipped) |
| `POST` | `/api/file.explorer/upload?sessionId=&dir=&name=&overwrite=` | Raw body → file (`application/octet-stream`) |
| `POST` | `/api/file.explorer/mkdir?sessionId=&path=` | Create a directory |
| `POST` | `/api/file.explorer/delete?sessionId=&path=` | Delete a file or directory (recursive) |
| `POST` | `/api/file.explorer/rename?sessionId=&from=&to=&overwrite=` | Rename/move inside the workspace (`from`/`path` + `to`/`name` accepted) |

Upload default cap is 100 MiB per file (`maxUploadBytes`). Listing is capped
at `maxListEntries` (default 5000). Folder zips are capped at 512 MiB
uncompressed and 10 000 entries (`maxZipBytes` / `maxZipEntries`); symlinks
are skipped rather than followed.

## Tests

`node test/policy.test.mjs` — containment, relative-name sanitizing, rename admission, trust fence.
`node test/host.test.mjs` — list / upload / download / mkdir / delete / rename / escapes.
`node test/client.test.mjs` — path helpers, filter/sort, preview kinds, size/mtime formatting.

## Security notes

The explorer can read and write the session workspace as the harness user —
the same boundary as the agent's own filesystem tools. The HTTP surface is
fenced to loopback / trusted hosts and is not an authentication layer.
Symlink escapes are refused (`realpath` on both the root and the target).
