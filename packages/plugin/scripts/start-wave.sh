#!/bin/bash

# Tycono Plugin — Start Wave
# Starts headless server (if needed) and creates a wave

set -euo pipefail
export PYTHONIOENCODING=utf-8
export LC_ALL=en_US.UTF-8

# Parse arguments
PROMPT_PARTS=()
PRESET=""
CONTINUOUS=""
PERMISSION_MODE="bypassPermissions"
MODEL_OVERRIDES=""

while [[ $# -gt 0 ]]; do
  case $1 in
    -h|--help)
      echo "Usage: /tycono [TASK...] [--agency <id>] [--continuous] [--model <overrides>]"
      echo ""
      echo "  Start an AI team to work on your task."
      echo ""
      echo "  Options:"
      echo "    --agency <id>    Load domain knowledge (gamedev, startup-mvp, solo-founder)"
      echo "    --continuous     Enable continuous improvement loop (CEO restarts after completion)"
      echo "    --model <spec>   Override models per role (e.g., cto=sonnet,engineer=haiku)"
      echo "    --safe           Enable model-based safety checks (blocks risky commands)"
      echo ""
      echo "  Examples:"
      echo "    /tycono Build a browser game"
      echo "    /tycono --agency gamedev Create a tower defense game"
      echo "    /tycono --agency research-scout --continuous 'hypothesis loop'"
      echo "    /tycono --model cto=claude-sonnet-4-5,engineer=claude-haiku-4-5-20251001 Build API"
      exit 0
      ;;
    --agency|--preset)
      if [[ -z "${2:-}" ]]; then
        echo "❌ Error: --agency requires an argument (e.g., gamedev, startup-mvp)" >&2
        exit 1
      fi
      PRESET="$2"
      shift 2
      ;;
    --continuous)
      CONTINUOUS="true"
      shift
      ;;
    --model)
      if [[ -z "${2:-}" ]]; then
        echo "❌ Error: --model requires overrides (e.g., cto=sonnet,engineer=haiku)" >&2
        exit 1
      fi
      MODEL_OVERRIDES="$2"
      shift 2
      ;;
    --safe)
      PERMISSION_MODE="auto"
      shift
      ;;
    --confirmed)
      # Pre-dispatch confirmation accepted — proceed with wave
      shift
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
  echo "    /tycono --agency gamedev Create an RPG" >&2
  exit 1
fi

# --- Bootstrap (Zero Setup) ---
# Install global agencies only (roles/CLAUDE.md are managed by server)

PLUGIN_ROOT="${CLAUDE_PLUGIN_ROOT:-$(cd "$(dirname "$0")/.." && pwd)}"
BOOTSTRAP_DIR="${PLUGIN_ROOT}/bootstrap"

if [[ -d "${BOOTSTRAP_DIR}/agencies" ]]; then
  mkdir -p "$HOME/.tycono/agencies"
  for AGENCY_DIR in "${BOOTSTRAP_DIR}/agencies"/*/; do
    AGENCY_NAME=$(basename "$AGENCY_DIR")
    if [[ ! -d "$HOME/.tycono/agencies/$AGENCY_NAME" ]]; then
      cp -r "$AGENCY_DIR" "$HOME/.tycono/agencies/$AGENCY_NAME"
    fi
  done
fi

# --- Server Management ---

# Resolve companyRoot: walk up from cwd to find CLAUDE.md
# Supports both layouts:
#   - Claude Code standard: CLAUDE.md at project root
#   - Tycono scaffold: knowledge/CLAUDE.md
COMPANY_ROOT=""
if [[ -n "${COMPANY_ROOT_OVERRIDE:-}" ]]; then
  COMPANY_ROOT="$COMPANY_ROOT_OVERRIDE"
else
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
fi

# Check if a headless server is already running
HEADLESS_JSON="${COMPANY_ROOT}/.tycono/headless.json"
API_URL=""

if [[ -f "$HEADLESS_JSON" ]]; then
  EXISTING_PORT=$(python3 -c "import json; print(json.load(open('$HEADLESS_JSON'))['port'])" 2>/dev/null || echo "")
  EXISTING_PID=$(python3 -c "import json; print(json.load(open('$HEADLESS_JSON'))['pid'])" 2>/dev/null || echo "")

  if [[ -n "$EXISTING_PID" ]] && kill -0 "$EXISTING_PID" 2>/dev/null; then
    # PID alive — verify server actually responds
    HEALTH_RESPONSE=$(curl -s --max-time 3 "http://localhost:${EXISTING_PORT}/api/health" 2>/dev/null || echo "")
    if [[ -n "$HEALTH_RESPONSE" ]] && echo "$HEALTH_RESPONSE" | python3 -c "import sys,json; json.load(sys.stdin)" 2>/dev/null; then
      # Check server version — warn if outdated, auto-restart only if no active waves
      RUNNING_VERSION=$(echo "$HEALTH_RESPONSE" | python3 -c "import sys,json; print(json.load(sys.stdin).get('version',''))" 2>/dev/null || echo "")
      LATEST_VERSION=$(npm view tycono-server version --prefer-offline 2>/dev/null || echo "")
      NEED_RESTART="false"
      if [[ -z "$RUNNING_VERSION" ]] || { [[ -n "$LATEST_VERSION" ]] && [[ "$RUNNING_VERSION" != "$LATEST_VERSION" ]]; }; then
        # Check if other waves are running — don't kill them
        ACTIVE_COUNT=$(curl -s "http://localhost:${EXISTING_PORT}/api/waves/active" 2>/dev/null | python3 -c "
import sys,json
d=json.load(sys.stdin)
waves=d.get('waves',d) if isinstance(d,dict) else d
print(len(waves) if isinstance(waves,list) else 0)
" 2>/dev/null || echo "0")
        if [[ "$ACTIVE_COUNT" -gt 0 ]]; then
          DISPLAY_VER="${RUNNING_VERSION:-pre-0.1.6}"
          echo "⚠️  Server outdated (v$DISPLAY_VER → v$LATEST_VERSION) but $ACTIVE_COUNT active wave(s). Skipping restart."
          API_URL="http://localhost:${EXISTING_PORT}"
        else
          DISPLAY_VER="${RUNNING_VERSION:-pre-0.1.6}"
          echo "⚠️  Server outdated: v$DISPLAY_VER → v$LATEST_VERSION. Restarting (no active waves)..."
          kill "$EXISTING_PID" 2>/dev/null || true
          sleep 2
          rm -f "$HEADLESS_JSON"
          NEED_RESTART="true"
          # Fall through to start new server below
        fi
      else
        API_URL="http://localhost:${EXISTING_PORT}"
        echo "🔗 Connected to existing Tycono server (port $EXISTING_PORT, v$RUNNING_VERSION)"
      fi
    else
      echo "⏳ Server process alive but not ready. Waiting..."
      # Wait up to 30s for existing server to become ready
      for i in $(seq 1 30); do
        if curl -s --max-time 2 "http://localhost:${EXISTING_PORT}/api/health" >/dev/null 2>&1; then
          API_URL="http://localhost:${EXISTING_PORT}"
          echo "🔗 Connected to existing Tycono server (port $EXISTING_PORT)"
          break
        fi
        sleep 1
      done
    fi
  fi

  if [[ -z "$API_URL" ]] && [[ -f "$HEADLESS_JSON" ]]; then
    # Stale headless.json — clean up
    rm -f "$HEADLESS_JSON"
  fi

fi

# Fallback: check common ports in case headless.json is missing/stale but server is running
if [[ -z "$API_URL" ]]; then
  for PORT_CHECK in 4321 4322 4323; do
    if curl -s --max-time 2 "http://localhost:${PORT_CHECK}/api/health" >/dev/null 2>&1; then
      API_URL="http://localhost:${PORT_CHECK}"
      echo "🔗 Found existing Tycono server on port $PORT_CHECK"
      break
    fi
  done
fi

# Start server if not running
if [[ -z "$API_URL" ]]; then
  echo "🚀 Starting Tycono server..."

  # Find tycono binary
  TYCONO_BIN=$(which tycono-server 2>/dev/null || echo "")
  if [[ -z "$TYCONO_BIN" ]]; then
    # Use npx as fallback — @latest ensures the newest server features
    # (dispatch, 2-Layer Knowledge, etc.) without manual version bumps
    npx tycono-server@latest &
    SERVER_PID=$!
  else
    "$TYCONO_BIN" &
    SERVER_PID=$!
  fi

  # Wait for server to be ready (max 60s — npx cold start can be slow)
  echo "⏳ Waiting for server..."
  for i in $(seq 1 60); do
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
    echo "❌ Failed to start Tycono server after 60s" >&2
    kill "$SERVER_PID" 2>/dev/null || true
    exit 1
  fi
fi

# --- Check for active waves (BUG-CONCURRENT protection) ---
ACTIVE_WAVES=$(curl -s "${API_URL}/api/waves/active" 2>/dev/null || echo "[]")
ACTIVE_COUNT=$(echo "$ACTIVE_WAVES" | python3 -c "import sys,json; d=json.loads(sys.stdin.read()); print(len(d) if isinstance(d,list) else 0)" 2>/dev/null || echo "0")

if [[ "$ACTIVE_COUNT" -gt 0 ]]; then
  echo ""
  echo "⚠️  Warning: $ACTIVE_COUNT active wave(s) already running on this server."
  echo "   Starting a new wave may cause resource conflicts."
  echo "   Use /tycono:tycono-status to check current waves."
  echo ""
  # Non-interactive (headless/plugin): block concurrent wave to prevent BUG-CONCURRENT
  if [[ ! -t 0 ]]; then
    echo "❌ Blocking new wave — active wave detected in non-interactive mode."
    echo "   Stop the existing wave first: /tycono:tycono-cancel"
    exit 1
  fi
fi

# --- Create Wave ---

# Build JSON payload
PAYLOAD_PARTS="\"directive\": $(echo "$DIRECTIVE" | python3 -c "import sys,json; print(json.dumps(sys.stdin.read().strip()))")"
if [[ -n "$PRESET" ]]; then
  PAYLOAD_PARTS="$PAYLOAD_PARTS, \"preset\": \"$PRESET\""
fi
if [[ -n "$CONTINUOUS" ]]; then
  PAYLOAD_PARTS="$PAYLOAD_PARTS, \"continuous\": true"
fi
PAYLOAD_PARTS="$PAYLOAD_PARTS, \"permissionMode\": \"$PERMISSION_MODE\""
if [[ -n "$MODEL_OVERRIDES" ]]; then
  # Parse "cto=sonnet,engineer=haiku" → JSON object
  MODEL_JSON=$(python3 -c "
import json, sys
raw = '$MODEL_OVERRIDES'
overrides = {}
for pair in raw.split(','):
    if '=' in pair:
        role, model = pair.strip().split('=', 1)
        overrides[role.strip()] = model.strip()
print(json.dumps(overrides))
" 2>/dev/null || echo "{}")
  PAYLOAD_PARTS="$PAYLOAD_PARTS, \"modelOverrides\": $MODEL_JSON"
fi
PAYLOAD="{$PAYLOAD_PARTS}"

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
echo "📝 Saving state to $(pwd)/.claude/tycono.local.md ..."
mkdir -p .claude
cat > .claude/tycono.local.md <<TYCONO_STATE
---
active: true
wave_id: ${WAVE_ID}
api_url: ${API_URL}
session_id: ${CLAUDE_CODE_SESSION_ID:-}
directive: $(echo "$DIRECTIVE" | head -c 200)
agency: ${PRESET:-none}
started_at: "$(date -u +%Y-%m-%dT%H:%M:%SZ)"
---
TYCONO_STATE

if [[ -f ".claude/tycono.local.md" ]]; then
  echo "✅ State file saved"
else
  echo "❌ State file NOT saved!" >&2
fi

echo ""
echo "🤖 Tycono Wave started!"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "  Wave:     $WAVE_ID"
echo "  Agency:   ${PRESET:-auto}"
echo "  Server:   $API_URL"
echo ""
echo "  Directive: $DIRECTIVE"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

echo "Wave is running in the background."
if [[ "$PERMISSION_MODE" == "auto" ]]; then
  echo "🛡️  Permission mode: SAFE (model-based safety checks enabled)"
fi

# --- SSE Event Monitor ---
# Subscribe to wave SSE stream and output critical events to stdout.
# Since this script runs via Bash(run_in_background), stdout output
# wakes up the Claude Code main agent via the notification queue.
# The script stays alive until the wave ends (SSE stream closes).

# Save SSE monitor PID for cancel.sh to kill
mkdir -p ".tycono/pids"
SSE_PID_FILE=".tycono/pids/wave-${WAVE_ID}-sse.pid"
echo "$$" > "$SSE_PID_FILE"
# Legacy location for backward compat with older cancel.sh
echo "$$" > ".tycono/wave-${WAVE_ID}.pid"

curl -sN "${API_URL}/api/waves/${WAVE_ID}/stream" 2>/dev/null | while IFS= read -r line; do
  if echo "$line" | grep -q '"type"'; then
    if echo "$line" | grep -q "awaiting_input"; then
      PARSED=$(echo "$line" | python3 -c "
import sys, json
raw = sys.stdin.read()
try:
    payload = raw.split('data: ',1)[-1] if 'data: ' in raw else raw
    d = json.loads(payload)
    q = d.get('question', d.get('content', d.get('message', d.get('summary', ''))))
    r = d.get('roleId', d.get('role_id', 'agent'))
    s = d.get('sessionId', d.get('session_id', ''))
    print(f'{r}\n{s}\n{q}')
except: print('agent\n\n')
" 2>/dev/null || echo "agent")
      ROLE=$(echo "$PARSED" | sed -n '1p')
      SESSION_ID=$(echo "$PARSED" | sed -n '2p')
      QUESTION=$(echo "$PARSED" | sed -n '3p')
      echo ""
      echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
      echo "🔔 TYCONO ALERT — Agent needs your decision"
      echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
      echo "  Role:    $ROLE"
      echo "  Wave:    $WAVE_ID"
      if [[ -n "$SESSION_ID" ]]; then
        echo "  Session: $SESSION_ID"
      fi
      if [[ -n "$QUESTION" ]]; then
        echo "  Question: $QUESTION"
      fi
      echo ""
      echo "  To respond, run:"
      echo "    curl -X POST ${API_URL}/api/sessions/${SESSION_ID}/message \\"
      echo "      -H 'Content-Type: application/json' \\"
      echo "      -d '{\"message\": \"YOUR_ANSWER\"}'"
      echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

    elif echo "$line" | grep -q "msg:error"; then
      echo ""
      echo "❌ TYCONO — Agent session error in wave $WAVE_ID"
      echo "  Run /tycono:tycono-status for details."

    elif echo "$line" | grep -q "dispatch:error"; then
      echo ""
      echo "⚠️ TYCONO — Dispatch failed in wave $WAVE_ID"
      echo "  Run /tycono:tycono-status for details."
    fi
  fi

  # Detect wave completion — break the loop
  if echo "$line" | grep -q "wave:done\|wave:complete\|stream:end"; then
    echo ""
    echo "✅ TYCONO — Wave $WAVE_ID completed!"
    echo "  Run /tycono:tycono-status for results."
    break
  fi
done

# Cleanup PID files
rm -f "$SSE_PID_FILE" ".tycono/wave-${WAVE_ID}.pid"
echo ""
echo "📡 Wave $WAVE_ID — SSE monitor stopped."
