#!/usr/bin/env bash
# LOCAL DSH PATCH — allow host-backed settings from the reverse-proxy origin.
#
# Preferred (no root, survives most DSH package updates):
#   the profile plugin at
#   $DSH_HOME/profiles/web/node_modules/dsh-remote-settings
#   (source of truth: /var/lib/harness/dsh-patches/dsh-remote-settings)
#   inserted from profiles/web/cordis.patch.yml. That serves patched
#   settings clients for loopback OR dev.thehumanloop.eu only.
#   0.1.2-rc.1 moved the gate to ctx.remote.$host.isLoopback and split
#   dsh-client-ui-settings-general; the plugin covers both layouts.
#
# This 0.1.1 in-place rewrite is the fallback if that plugin is not mounted.
#
# This script is the fallback if that plugin is not mounted: it rewrites the
# same two gates in the root-owned upstream file. Reapply after npm overwrite.
set -euo pipefail

F=/opt/node/lib/node_modules/@deepseek-ai/dsh/node_modules/@deepseek-ai/dsh-client-ui-settings/lib/client.js
OLD='connection.isLoopback ? "host" : "memory"'
NEW='(connection.isLoopback || ["dev.thehumanloop.eu"].includes(globalThis.location?.hostname)) ? "host" : "memory"'
MARKER='LOCAL-PATCH(dsh-remote-settings)'

[ -f "$F" ] || { echo "FAIL: target missing: $F" >&2; exit 1; }

if grep -q "$MARKER" "$F"; then
    echo "Already patched — nothing to do."
    exit 0
fi

COUNT=$(grep -cF "$OLD" "$F" || true)
if [ "$COUNT" != "2" ]; then
    echo "FAIL: expected exactly 2 gate expressions, found '${COUNT}' — DSH layout changed, refusing to blind-patch." >&2
    exit 1
fi

BACKUP="${F}.pre-remotepatch-$(date +%Y%m%d-%H%M%S)"
cp -a "$F" "$BACKUP"

python3 - "$F" <<'PYEOF'
import sys

path = sys.argv[1]
with open(path, encoding="utf-8") as fh:
    source = fh.read()

old = 'connection.isLoopback ? "host" : "memory"'
new = '(connection.isLoopback || ["dev.thehumanloop.eu"].includes(globalThis.location?.hostname)) ? "host" : "memory"'
comment = " /* LOCAL-PATCH(dsh-remote-settings): host-backed settings only on loopback or the authenticated reverse-proxy origin */"
assert source.count(old) == 2, f"pattern count drifted: {source.count(old)}"
source = source.replace(old, f"{new}{comment}")

with open(path, "w", encoding="utf-8") as fh:
    fh.write(source)
print("patched: 2 gate expressions -> origin-scoped host persistence")
PYEOF

if COMMAND=$(command -v node || ls /opt/node/bin/node 2>/dev/null); then
    "$COMMAND" --check "$F" && echo "syntax ok"
else
    echo "note: node not found for --check; served-page test below still verifies"
fi

echo "backup: $BACKUP"
echo "verify from the harness session: curl -s http://127.0.0.1:3080/plugins/@deepseek-ai/dsh-client-ui-settings/client.js | grep -c LOCAL-PATCH"
