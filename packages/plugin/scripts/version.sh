#!/bin/bash
# Tycono — Version Info
# Shows plugin version, server version, hook status

PLUGIN_ROOT="${CLAUDE_PLUGIN_ROOT:-$(cd "$(dirname "$0")/.." && pwd)}"

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "  Tycono Version Info"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

# Plugin version — .claude-plugin/plugin.json is the SSOT that Claude Code
# actually reads for /plugin updates. package.json is only a secondary label.
PLUGIN_VER=$(python3 -c "import json; print(json.load(open('$PLUGIN_ROOT/.claude-plugin/plugin.json'))['version'])" 2>/dev/null || echo "unknown")
PKG_VER=$(python3 -c "import json; print(json.load(open('$PLUGIN_ROOT/package.json'))['version'])" 2>/dev/null || echo "?")
if [[ "$PLUGIN_VER" != "unknown" && "$PKG_VER" != "?" && "$PLUGIN_VER" != "$PKG_VER" ]]; then
  echo "  Plugin:  $PLUGIN_VER  ⚠️  package.json says $PKG_VER — version SSOT mismatch"
else
  echo "  Plugin:  $PLUGIN_VER"
fi

# Marketplace latest (from local marketplace clone, no network)
MKT_MANIFEST="$HOME/.claude/plugins/marketplaces/tycono/.claude-plugin/marketplace.json"
if [[ -f "$MKT_MANIFEST" ]]; then
  MKT_VER=$(python3 -c "import json,sys; d=json.load(open('$MKT_MANIFEST')); p=[x for x in d.get('plugins',[]) if x.get('name')=='tycono']; print(p[0]['version'] if p else '?')" 2>/dev/null || echo "?")
  if [[ "$MKT_VER" != "?" && "$MKT_VER" != "$PLUGIN_VER" ]]; then
    echo "           marketplace has v$MKT_VER — run '/plugin' to update"
  fi
fi

# Server version (check PLUGIN_DATA first, then global, then npm)
PLUGIN_DATA="${CLAUDE_PLUGIN_DATA:-$HOME/.tycono/plugin-data}"
PLUGIN_SERVER="$PLUGIN_DATA/server/node_modules/.bin/tycono-server"
if [[ -f "$PLUGIN_SERVER" ]]; then
  SERVER_VER=$(node "$PLUGIN_SERVER" --version 2>/dev/null || echo "unknown")
  SERVER_SRC="plugin-data"
elif command -v tycono-server &>/dev/null; then
  SERVER_VER=$(tycono-server --version 2>/dev/null || echo "unknown")
  SERVER_SRC="global"
else
  SERVER_VER=$(npm view tycono-server version --prefer-online 2>/dev/null || echo "not installed")
  SERVER_SRC="npm (not installed locally)"
fi
echo "  Server:  $SERVER_VER ($SERVER_SRC)"

# Hook status
HOOK_FILE="$PLUGIN_ROOT/hooks/wave-confirm.sh"
if [[ -f "$HOOK_FILE" ]]; then
  echo "  Hook:    ✅ wave-confirm (PreToolUse)"
else
  echo "  Hook:    ❌ wave-confirm not found"
fi

# Resolve COMPANY_ROOT (same logic as start-wave.sh)
COMPANY_ROOT=""
CHECK_DIR="$(pwd)"
while [[ "$CHECK_DIR" != "/" ]]; do
  if [[ -f "$CHECK_DIR/CLAUDE.md" ]]; then
    COMPANY_ROOT="$CHECK_DIR"
    break
  fi
  if [[ -f "$CHECK_DIR/knowledge/CLAUDE.md" ]]; then
    COMPANY_ROOT="$CHECK_DIR"
    break
  fi
  CHECK_DIR="$(dirname "$CHECK_DIR")"
done
if [[ -z "$COMPANY_ROOT" ]]; then
  COMPANY_ROOT="$(pwd)"
fi

# Running server — check headless.json at COMPANY_ROOT
HEADLESS_JSON="${COMPANY_ROOT}/.tycono/headless.json"
if [[ -f "$HEADLESS_JSON" ]]; then
  PORT=$(python3 -c "import json; print(json.load(open('$HEADLESS_JSON'))['port'])" 2>/dev/null || echo "")
  PID=$(python3 -c "import json; print(json.load(open('$HEADLESS_JSON'))['pid'])" 2>/dev/null || echo "")
  if [[ -n "$PORT" ]] && curl -s --max-time 2 "http://localhost:${PORT}/api/health" >/dev/null 2>&1; then
    RUNNING_VER=$(curl -s --max-time 2 "http://localhost:${PORT}/api/health" 2>/dev/null | python3 -c "import sys,json; print(json.load(sys.stdin).get('version','?'))" 2>/dev/null || echo "?")
    echo "  Runtime: ✅ running (port $PORT, PID $PID, v$RUNNING_VER)"
    echo "  Board:   http://localhost:${PORT}/ui/"
  else
    # Stale headless.json — server is dead, clean it up
    rm -f "$HEADLESS_JSON"
    echo "  Runtime: ⏸  no active server (cleaned stale headless.json)"
  fi
else
  echo "  Runtime: ⏸  no active server"
fi

echo "  Root:    $COMPANY_ROOT"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
