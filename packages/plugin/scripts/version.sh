#!/bin/bash
# Tycono — Version Info
# Shows plugin version, server version, hook status

PLUGIN_ROOT="${CLAUDE_PLUGIN_ROOT:-$(cd "$(dirname "$0")/.." && pwd)}"

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "  Tycono Version Info"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

# Plugin version — from hooks.json or git
PLUGIN_VER="unknown"
if [[ -f "$PLUGIN_ROOT/hooks/hooks.json" ]]; then
  # Use git commit short hash as plugin version
  PLUGIN_VER=$(cd "$PLUGIN_ROOT" && git rev-parse --short HEAD 2>/dev/null || echo "unknown")
fi
echo "  Plugin:  $PLUGIN_VER ($(basename "$PLUGIN_ROOT"))"

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
    echo "  Runtime: ⚠️  headless.json exists but server not responding"
  fi
else
  echo "  Runtime: ⏸  no active server"
fi

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
