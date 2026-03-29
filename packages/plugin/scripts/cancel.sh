#!/bin/bash

# Tycono Plugin — Cancel Wave

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
  curl -s -X POST "${API_URL}/api/waves/${WAVE_ID}/stop" >/dev/null 2>&1 || true
  echo "🛑 Wave $WAVE_ID cancelled."
else
  echo "⚠️ Could not find wave info in state file."
fi

# Kill notification listener if running
NOTIFY_PID="${NOTIFY_PID:-}"
if [[ -n "$NOTIFY_PID" ]] && kill -0 "$NOTIFY_PID" 2>/dev/null; then
  kill "$NOTIFY_PID" 2>/dev/null || true
fi

rm -f "$STATE_FILE"
echo "State file cleaned up."
