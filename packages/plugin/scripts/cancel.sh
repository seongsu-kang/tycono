#!/bin/bash

# Tycono Plugin — Cancel Wave (wave-scoped cleanup)

set -euo pipefail
export PYTHONIOENCODING=utf-8
export LC_ALL=en_US.UTF-8

STATE_FILE=".claude/tycono.local.md"

if [[ ! -f "$STATE_FILE" ]]; then
  echo "No active Tycono wave to cancel."
  exit 0
fi

# Parse state with python3 (macOS sed breaks on UTF-8)
eval "$(python3 -c "
import re
text = open('$STATE_FILE', encoding='utf-8', errors='replace').read()
m = re.search(r'^---\n(.*?)\n---', text, re.DOTALL)
if not m: exit(1)
for line in m.group(1).strip().split('\n'):
    k, _, v = line.partition(':')
    k = k.strip().upper().replace('-', '_')
    v = v.strip().strip('\"')
    print(f'{k}={repr(v)}')
")"

WAVE_ID="${WAVE_ID:-}"
API_URL="${API_URL:-}"

if [[ -n "$WAVE_ID" ]] && [[ -n "$API_URL" ]]; then
  # Stop the wave via API
  curl -s -X POST "${API_URL}/api/waves/${WAVE_ID}/stop" >/dev/null 2>&1 || true
  echo "🛑 Wave $WAVE_ID cancelled."

  # Kill wave-scoped PID files (new structure)
  if [[ -d ".tycono/pids" ]]; then
    for PID_FILE in .tycono/pids/wave-${WAVE_ID}-*.pid; do
      [[ -f "$PID_FILE" ]] || continue
      PID_VAL=$(cat "$PID_FILE" 2>/dev/null || echo "")
      if [[ -n "$PID_VAL" ]] && kill -0 "$PID_VAL" 2>/dev/null; then
        kill -- -"$PID_VAL" 2>/dev/null || kill "$PID_VAL" 2>/dev/null || true
        echo "🧹 Killed process $PID_VAL ($(basename "$PID_FILE"))"
      fi
      rm -f "$PID_FILE"
    done
  fi

  # Legacy PID file
  SSE_PID_FILE=".tycono/wave-${WAVE_ID}.pid"
  if [[ -f "$SSE_PID_FILE" ]]; then
    SSE_PID=$(cat "$SSE_PID_FILE")
    if [[ -n "$SSE_PID" ]] && kill -0 "$SSE_PID" 2>/dev/null; then
      kill -- -"$SSE_PID" 2>/dev/null || kill "$SSE_PID" 2>/dev/null || true
      echo "🧹 SSE monitor (PID $SSE_PID) killed."
    fi
    rm -f "$SSE_PID_FILE"
  fi

  # Kill any lingering curl SSE processes for this wave
  pkill -f "curl.*${WAVE_ID}/stream" 2>/dev/null || true

  # Kill any claude processes with this wave ID in env
  pkill -f "TYCONO_WAVE_ID=${WAVE_ID}" 2>/dev/null || true
else
  echo "⚠️ Could not find wave info in state file."
fi

rm -f "$STATE_FILE"
echo "State file cleaned up."
