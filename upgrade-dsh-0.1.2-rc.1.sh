#!/usr/bin/env bash
# Privileged cutover: replace the global @deepseek-ai/dsh install with
# 0.1.2-rc.1, refresh the reverse-proxy settings plugin, and restart dsh-web.
#
# This script MUST run as root. Restarting dsh-web.service drops every live
# GUI session. After restart, open the URL in $DSH_HOME/web-launch.url once
# (https://dev.thehumanloop.eu/?token=...) to mint the browser cookie.
set -euo pipefail

TARGET="${DSH_TARGET_VERSION:-0.1.2-rc.1}"
NODE_PREFIX="${NODE_PREFIX:-/opt/node}"
NPM="${NODE_PREFIX}/bin/npm"
DSH_HOME="${DSH_HOME:-/var/lib/harness/.dsh}"
WORKSPACE="${WORKSPACE:-/var/lib/harness/dsh-patches}"
CACHE="${WORKSPACE}/.upgrade/npm-cache"
STAGED="${WORKSPACE}/.upgrade/prefix/lib/node_modules/@deepseek-ai/dsh"
LIVE="${NODE_PREFIX}/lib/node_modules/@deepseek-ai/dsh"
PLUGIN_SRC="${WORKSPACE}/dsh-remote-settings"
PLUGIN_DST="${DSH_HOME}/profiles/web/node_modules/dsh-remote-settings"
LOG="${DSH_HOME}/dsh-web.log"

if [[ "$(id -u)" -ne 0 ]]; then
    echo "FAIL: run as root (needed to replace ${LIVE} and restart dsh-web.service)" >&2
    exit 1
fi

[[ -x "$NPM" ]] || { echo "FAIL: npm missing at $NPM" >&2; exit 1; }
[[ -d "$PLUGIN_SRC" ]] || { echo "FAIL: plugin source missing: $PLUGIN_SRC" >&2; exit 1; }

current="$("$NODE_PREFIX/bin/dsh" -V 2>/dev/null || true)"
echo "current: ${current:-unknown}"
echo "target:  $TARGET"

if [[ "$current" == "$TARGET" ]]; then
    echo "already at $TARGET — will still refresh the settings plugin and restart"
fi

backup="${LIVE}.bak-${current:-unknown}-$(date +%Y%m%d-%H%M%S)"
if [[ -d "$LIVE" ]]; then
    echo "backup: $backup"
    cp -a "$LIVE" "$backup"
fi

export PATH="${NODE_PREFIX}/bin:$PATH"
if [[ -d "$STAGED" ]] && [[ "$(python3 -c "import json; print(json.load(open('${STAGED}/package.json'))['version'])")" == "$TARGET" ]]; then
    echo "install: copy staged $TARGET over $LIVE"
    rm -rf "${LIVE}.next"
    cp -a "$STAGED" "${LIVE}.next"
    rm -rf "$LIVE"
    mv "${LIVE}.next" "$LIVE"
else
    echo "install: npm install -g @deepseek-ai/dsh@${TARGET}"
    "$NPM" install -g "@deepseek-ai/dsh@${TARGET}" --cache "$CACHE" --no-fund --no-audit
fi

installed="$("$NODE_PREFIX/bin/dsh" -V)"
if [[ "$installed" != "$TARGET" ]]; then
    echo "FAIL: dsh -V is ${installed}, expected ${TARGET}" >&2
    exit 1
fi
echo "installed: $installed"

echo "plugin: $PLUGIN_SRC -> $PLUGIN_DST"
mkdir -p "$(dirname "$PLUGIN_DST")"
rm -rf "$PLUGIN_DST"
mkdir -p "$PLUGIN_DST"
cp -a "$PLUGIN_SRC/lib" "$PLUGIN_SRC/package.json" "$PLUGIN_SRC/README.md" "$PLUGIN_DST/"
chown -R harness:harness "$PLUGIN_DST"

echo "on-disk patch: 0.1.2 combo /plugins/?? URLs ignore exact-route overlays"
"${NODE_PREFIX}/bin/node" "$PLUGIN_SRC/lib/patch-files.js" --dsh "$LIVE" --host dev.thehumanloop.eu

# Retarget profile node_modules links that pointed at the previous dsh tree.
# Keep first-party plugins (dsh-file-explorer, dsh-terminal-web, dsh-remote-settings).
python3 - "$DSH_HOME/profiles/node_modules" "$LIVE" <<'PY'
import os, sys
from pathlib import Path
root = Path(sys.argv[1])
live = Path(sys.argv[2]).resolve()
old_prefixes = (
    "/opt/node/lib/node_modules/@deepseek-ai/dsh",
)
keep_names = {"dsh-file-explorer", "dsh-terminal-web"}
relinked = missing = skipped = 0
for dirpath, dirnames, filenames in os.walk(root, followlinks=False):
    # do not walk into the live dsh tree if a link already points there
    for name in dirnames + filenames:
        path = Path(dirpath) / name
        if not path.is_symlink():
            continue
        if path.name in keep_names:
            skipped += 1
            continue
        target = os.readlink(path)
        if not target.startswith("/opt/node/lib/node_modules/@deepseek-ai/dsh"):
            continue
        # rewrite /opt/node/lib/node_modules/@deepseek-ai/dsh[/node_modules]/...
        suffix = target[len("/opt/node/lib/node_modules/@deepseek-ai/dsh"):]
        new_target = str(live) + suffix
        if os.path.lexists(new_target):
            if os.path.abspath(target) != os.path.abspath(new_target):
                path.unlink()
                path.symlink_to(new_target)
                relinked += 1
        else:
            missing += 1
print(f"profile-links: relinked={relinked} missing-target={missing} kept-plugins={skipped}")
PY

install -d -o harness -g harness "$(dirname "$LOG")"
touch "$LOG"
chown harness:harness "$LOG"

dropin=/etc/systemd/system/dsh-web.service.d/stdout.conf
mkdir -p "$(dirname "$dropin")"
cat > "$dropin" <<EOF
[Service]
StandardOutput=append:${LOG}
StandardError=append:${LOG}
EOF

systemctl daemon-reload
echo "restarting dsh-web.service (this drops live GUI sessions)"
systemctl restart dsh-web.service
sleep 2
systemctl --no-pager --full status dsh-web.service | head -20

echo
echo "dsh is $installed. After the GUI 401s, open the URL in:"
echo "  ${DSH_HOME}/web-launch.url"
echo "as https://dev.thehumanloop.eu/?token=... (once per browser, cookie lasts 30 days)."
echo "Do not paste that token into chat."
