#!/bin/bash

# Tycono Plugin — Start Wave
# Starts headless server (if needed) and creates a wave

set -euo pipefail

# Parse arguments
PROMPT_PARTS=()
PRESET=""

while [[ $# -gt 0 ]]; do
  case $1 in
    -h|--help)
      echo "Usage: /tycono [TASK...] [--preset <id>]"
      echo ""
      echo "  Start an AI team to work on your task."
      echo ""
      echo "  Options:"
      echo "    --preset <id>    Load domain knowledge (gamedev, startup-mvp, saas-growth)"
      echo ""
      echo "  Examples:"
      echo "    /tycono Build a browser game"
      echo "    /tycono --preset gamedev Create a tower defense game"
      exit 0
      ;;
    --preset)
      if [[ -z "${2:-}" ]]; then
        echo "❌ Error: --preset requires an argument (e.g., gamedev, startup-mvp)" >&2
        exit 1
      fi
      PRESET="$2"
      shift 2
      ;;
    *)
      PROMPT_PARTS+=("$1")
      shift
      ;;
  esac
done

DIRECTIVE="${PROMPT_PARTS[*]:-}"

if [[ -z "$DIRECTIVE" ]]; then
  echo "❌ Error: No task provided." >&2
  echo "" >&2
  echo "  Examples:" >&2
  echo "    /tycono Build a browser shooting game" >&2
  echo "    /tycono --preset gamedev Create an RPG" >&2
  exit 1
fi

# --- Server Management ---

# Check if a headless server is already running
HEADLESS_JSON=".tycono/headless.json"
API_URL=""

if [[ -f "$HEADLESS_JSON" ]]; then
  EXISTING_PORT=$(python3 -c "import json; print(json.load(open('$HEADLESS_JSON'))['port'])" 2>/dev/null || echo "")
  EXISTING_PID=$(python3 -c "import json; print(json.load(open('$HEADLESS_JSON'))['pid'])" 2>/dev/null || echo "")

  if [[ -n "$EXISTING_PID" ]] && kill -0 "$EXISTING_PID" 2>/dev/null; then
    API_URL="http://localhost:${EXISTING_PORT}"
    echo "🔗 Connected to existing Tycono server (port $EXISTING_PORT)"
  else
    # Stale headless.json — clean up
    rm -f "$HEADLESS_JSON"
  fi
fi

# Start server if not running
if [[ -z "$API_URL" ]]; then
  echo "🚀 Starting Tycono server..."

  # Find tycono binary
  TYCONO_BIN=$(which tycono 2>/dev/null || npx which tycono 2>/dev/null || echo "")
  if [[ -z "$TYCONO_BIN" ]]; then
    # Use npx as fallback
    npx tycono --headless &
    SERVER_PID=$!
  else
    "$TYCONO_BIN" --headless &
    SERVER_PID=$!
  fi

  # Wait for server to be ready (max 30s)
  echo "⏳ Waiting for server..."
  for i in $(seq 1 30); do
    if [[ -f "$HEADLESS_JSON" ]]; then
      EXISTING_PORT=$(python3 -c "import json; print(json.load(open('$HEADLESS_JSON'))['port'])" 2>/dev/null || echo "")
      if [[ -n "$EXISTING_PORT" ]]; then
        # Verify server responds
        if curl -s --max-time 2 "http://localhost:${EXISTING_PORT}/api/health" >/dev/null 2>&1; then
          API_URL="http://localhost:${EXISTING_PORT}"
          echo "✅ Server ready (port $EXISTING_PORT, PID $SERVER_PID)"
          break
        fi
      fi
    fi
    sleep 1
  done

  if [[ -z "$API_URL" ]]; then
    echo "❌ Failed to start Tycono server after 30s" >&2
    kill "$SERVER_PID" 2>/dev/null || true
    exit 1
  fi
fi

# --- Create Wave ---

# Build JSON payload
PAYLOAD="{\"directive\": $(python3 -c "import json; print(json.dumps('$DIRECTIVE'))")}"
if [[ -n "$PRESET" ]]; then
  PAYLOAD="{\"directive\": $(python3 -c "import json; print(json.dumps('$DIRECTIVE'))"), \"preset\": \"$PRESET\"}"
fi

WAVE_RESPONSE=$(curl -s -X POST "${API_URL}/api/exec/wave" \
  -H "Content-Type: application/json" \
  -d "$PAYLOAD" 2>/dev/null || echo "")

if [[ -z "$WAVE_RESPONSE" ]]; then
  echo "❌ Failed to create wave" >&2
  exit 1
fi

WAVE_ID=$(echo "$WAVE_RESPONSE" | python3 -c "import sys,json; print(json.load(sys.stdin).get('waveId',''))" 2>/dev/null || echo "")

if [[ -z "$WAVE_ID" ]]; then
  echo "❌ Invalid wave response: $WAVE_RESPONSE" >&2
  exit 1
fi

# Save state for stop hook
mkdir -p .claude
cat > .claude/tycono.local.md <<EOF
---
active: true
wave_id: ${WAVE_ID}
api_url: ${API_URL}
session_id: ${CLAUDE_CODE_SESSION_ID:-}
directive: $(echo "$DIRECTIVE" | head -c 200)
preset: ${PRESET:-none}
started_at: "$(date -u +%Y-%m-%dT%H:%M:%SZ)"
---
EOF

echo ""
echo "🤖 Tycono Wave started!"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "  Wave:     $WAVE_ID"
echo "  Preset:   ${PRESET:-auto}"
echo "  Server:   $API_URL"
echo ""
echo "  Directive: $DIRECTIVE"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

# Stream initial events (first 10 seconds)
echo "📡 Live stream (first 10s preview):"
timeout 10 curl -s -N "${API_URL}/api/waves/${WAVE_ID}/stream" 2>/dev/null | while IFS= read -r line; do
  # Parse SSE data lines
  if [[ "$line" == data:* ]]; then
    DATA="${line#data:}"
    TYPE=$(echo "$DATA" | python3 -c "import sys,json; print(json.load(sys.stdin).get('type',''))" 2>/dev/null || echo "")
    ROLE=$(echo "$DATA" | python3 -c "import sys,json; print(json.load(sys.stdin).get('roleId',''))" 2>/dev/null || echo "")

    case "$TYPE" in
      msg:start)     echo "  🟢 [$ROLE] Session started" ;;
      dispatch:start)
        TARGET=$(echo "$DATA" | python3 -c "import sys,json; print(json.load(sys.stdin).get('data',{}).get('targetRoleId',''))" 2>/dev/null || echo "")
        echo "  📋 [$ROLE → $TARGET] Dispatched"
        ;;
      msg:done)      echo "  ✅ [$ROLE] Done" ;;
      msg:error)     echo "  ❌ [$ROLE] Error" ;;
      msg:text)      echo "  💬 [$ROLE] Working..." ;;
    esac
  fi
done || true

echo ""
echo "Wave is running in the background. Use /tycono-status to check progress."
echo "The session will stay alive until the wave completes."
