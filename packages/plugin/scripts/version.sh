#!/bin/bash
# Tycono — Version Info
# Shows plugin version, server version, hook status

PLUGIN_ROOT="${CLAUDE_PLUGIN_ROOT:-$(cd "$(dirname "$0")/.." && pwd)}"

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "  Tycono Version Info"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

# Plugin version — from package.json
PLUGIN_VER=$(python3 -c "import json; print(json.load(open('$PLUGIN_ROOT/package.json'))['version'])" 2>/dev/null || echo "unknown")
echo "  Plugin:  $PLUGIN_VER"

# Server version
SERVER_VER=$(npx tycono-server@latest --version 2>/dev/null || echo "not installed")
echo "  Server:  $SERVER_VER"

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
