# Session icons

An optional DSH Web plugin. It leaves session titles, grouping, and the row
menu alone, and adds a **reserved icon column** at the left of every session
row.

## Use

1. Refresh the existing DSH page after installation.
2. Hover a session in the sidebar. A faint **+** appears in the left column.
3. Click it and pick a glyph (star, smiley, sandclock, and others). Click
   **No icon** to clear.
4. Sessions without an icon keep an empty column, so titles stay aligned with
   the row below.

Selections are saved per session in DSH's durable plugin storage. The column
is always the same width, whether or not a glyph is set.

## Installation

Make this package resolvable from the DSH Web profile's `node_modules` (a
symlink to this directory is sufficient). Add this entry to the profile's
`cordis.patch.yml`:

```yaml
- insert:
    - id: session-icon
      name: dsh-session-icon
```

A Web profile with `patchReload: live` can mount the host plugin without a
process restart. A browser refresh at the existing DSH URL is required to
discover a newly mounted client plugin.

## Tests

```sh
npm test
```
