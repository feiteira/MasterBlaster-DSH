# dsh-workspace-tabs

Browser-tab workspace switcher for the DeepSeek Harness Web GUI.

- **Workspaces across the top** — every workspace is a tab showing its title,
  a session-count badge, and a green dot while one of its sessions is running.
  An **Ungrouped** tab appears for sessions outside every workspace.
- **One native sidebar** — the plugin shadows the built-in
  `sidebar.workspaces` entry with a wrapper that renders the *original*
  WorkspaceBrowser with its workspace/session hooks filtered to the active
  tab. Session rows, icons, actions, status indicators, search, the brand
  mark, New Session, footer actions (Files, Terminal), and Settings all stay
  exactly as shipped — only the visible account is scoped.
- **Two-way sync** — picking a tab opens that workspace's most-recent session
  (reusing its blank placeholder, or starting a fresh session when empty; an
  empty Ungrouped tab stays put since there is no workspace to create in);
  navigating through the sidebar moves the active tab to the current session's
  account, including ungrouped sessions.

The selected tab persists across reloads. The tab bar reserves 42px at the
top of the app frame; the ▤ button toggles the sidebar through the layout
service when available.

Implementation notes:

- The shadow registration clones the native entry's `inject` / `store` /
  `locale` / `select` so the renderer assembles identical callbacks, the
  shared view-store seat, and locale. It takes one priority rank below the
  native entry (single slots render the lowest priority). `children` cannot
  be cloned — child slots are declared once per page — so the wrapper
  disables the directory-flow picker inside the scoped browser (the sidebar
  "+" button hides while the plugin is active) and nulls `renderSlot`.
  Workspace creation stays available from the empty-state hero picker.
  Unloading the plugin restores the native entry automatically, as does a
  native reload (the wrapper re-shadows entry changes).
- Both session `ids` **and** `byId` are filtered, so host content-search hits
  from other workspaces cannot leak into the scoped view. Subagent
  descendants of visible parents are kept so running badges keep working.
  Host content search itself stays global and capped, so a scoped query can
  report `hasMore` for matches outside the tab.
- `retainAccountKeys` is guarded to union the full registry keys, so tab
  switching never prunes other workspaces' persisted group expansion or
  session order.

Pure UI plugin: no host behavior, no network API. The browser half reads the
existing `sessions` / `workspaces` client services and drives them with
`open` / `create` only.
