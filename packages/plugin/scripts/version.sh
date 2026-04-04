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

# Running server
HEADLESS_JSON=".tycono/headless.json"
if [[ -f "$HEADLESS_JSON" ]]; then
  PORT=$(python3 -c "import json; print(json.load(open('$HEADLESS_JSON'))['port'])" 2>/dev/null || echo "")
  PID=$(python3 -c "import json; print(json.load(open('$HEADLESS_JSON'))['pid'])" 2>/dev/null || echo "")
  if [[ -n "$PORT" ]] && curl -s --max-time 2 "http://localhost:${PORT}/api/health" >/dev/null 2>&1; then
    echo "  Runtime: ✅ running (port $PORT, PID $PID)"
  else
    # Stale headless.json — server is dead, clean it up
    rm -f "$HEADLESS_JSON"
    echo "  Runtime: ⏸  no active server (cleaned stale headless.json)"
  fi
else
  echo "  Runtime: ⏸  no active server"
fi

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
