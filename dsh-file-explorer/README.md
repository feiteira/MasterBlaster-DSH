# dsh-file-explorer

A workspace **file explorer** for the DeepSeek Harness **Web GUI** — browse the
open session's project directory (and, when you move "Up" past the project
root, the wider host filesystem like a regular file manager), download files,
and upload files (including drag-and-drop from the desktop).

- **Host half** (`lib/index.js`): Cordis plugin that mounts `/api/file.explorer/*`
  under the same browser-trust fence as `/api` (loopback or configured
  `trustedHosts`, never cross-site). Every target is canonicalized with
  `realpath`. Relative paths stay confined to the addressed session's project
  directory; **absolute** paths are honored anywhere the harness user can
  access, which is what lets the browser leave the project root. Destructive
  operations keep guardrails even in absolute mode (see Security notes).
- **Client half** (`lib/client.js`): a right-docked explorer panel in
  `shell.overlay` plus a `Files` toggle in `sidebar.footer.action`. Drop files
  or folders from the OS onto the panel to upload; 👁 previews text/images
  in place, double-click downloads. Filter, sort (name/size/modified),
  hidden-file toggle, upload progress, inline confirm dialogs, rename,
  new file/folder, and keyboard (Enter opens, Backspace/`↑ Up` goes to the
  parent — enabled even at the project root) are built in. Row actions stay
  visible on touch devices; huge folders render in a capped window with
  "Show all".

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

All routes require `sessionId` of an attached session. A `path` / `dir` /
`from` / `to` may be:

- **relative** — resolved against the session's project directory and must
  stay inside it (no `..` climbs, no symlink escapes), or
- **absolute** — resolved anywhere on the host filesystem the harness user
  can reach (the file-manager mode reachable by moving Up above the project
  root).

`""` always means the session's project directory. Upload `name` values are
additionally sanitized segment by segment (never absolute, no `..`).

| Method | Path | Purpose |
|---|---|---|
| `GET` | `/api/file.explorer/list?sessionId=&path=` | Directory listing (payload includes `abs` = canonical directory) |
| `GET` | `/api/file.explorer/download?sessionId=&path=` | Stream a file as an attachment |
| `GET` | `/api/file.explorer/zip?sessionId=&path=` | Stream a folder as a `.zip` (symlinks skipped) |
| `POST` | `/api/file.explorer/upload?sessionId=&dir=&name=&overwrite=` | Raw body → file (`application/octet-stream`) |
| `POST` | `/api/file.explorer/mkdir?sessionId=&path=` | Create a directory |
| `POST` | `/api/file.explorer/delete?sessionId=&path=` | Delete a file or directory (recursive) |
| `POST` | `/api/file.explorer/rename?sessionId=&from=&to=&overwrite=` | Rename/move (`from`/`path` + `to`/`name` accepted) |

Upload default cap is 100 MiB per file (`maxUploadBytes`). Listing is capped
at `maxListEntries` (default 5000). Folder zips are capped at 512 MiB
uncompressed and 10 000 entries (`maxZipBytes` / `maxZipEntries`); symlinks
are skipped rather than followed.

## Tests

`node test/policy.test.mjs` — containment of relative paths, absolute admission outside the root, guards, sanitizing, trust fence.
`node test/host.test.mjs` — list / upload / download / mkdir / delete / rename inside and outside the project / escapes.
`node test/client.test.mjs` — path helpers, filter/sort, preview kinds, size/mtime formatting.

## Security notes

The explorer can read and write as the harness user — for project-relative
requests the same boundary as the agent's own filesystem tools, and for
absolute requests whatever the OS account permits (the browser explicitly
offers "Up" above the project root). The HTTP surface is fenced to loopback /
trusted hosts and is not an authentication layer.

Relative input stays project-contained (`realpath` on both the root and the
target; symlink escapes refused). Absolute input is canonicalized too, and
even there destructive actions refuse to touch the filesystem root, the
addressed session's own project directory, or any ancestor directory whose
recursive deletion/move would swallow that project directory. Deleting a
symlink removes the link, never its target.
