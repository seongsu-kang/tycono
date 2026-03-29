#!/bin/bash

# Tycono Plugin — Wave Status

set -euo pipefail
export PYTHONIOENCODING=utf-8
export LC_ALL=en_US.UTF-8

STATE_FILE=".claude/tycono.local.md"

if [[ ! -f "$STATE_FILE" ]]; then
  echo "No active Tycono wave."
  echo "Start one with: /tycono \"your task\""
  exit 0
fi

# Parse state with python3 (macOS sed breaks on UTF-8)
eval "$(python3 -c "
import re, sys
text = open('$STATE_FILE', encoding='utf-8', errors='replace').read()
m = re.search(r'^---\n(.*?)\n---', text, re.DOTALL)
if not m:
    sys.exit(1)
for line in m.group(1).strip().split('\n'):
    k, _, v = line.partition(':')
    k = k.strip().upper().replace('-', '_')
    v = v.strip().strip('\"')
    print(f'{k}={repr(v)}')
")"

WAVE_ID="${WAVE_ID:-}"
API_URL="${API_URL:-}"
DIRECTIVE="${DIRECTIVE:-}"
STARTED_AT="${STARTED_AT:-}"

if [[ -z "$WAVE_ID" ]] || [[ -z "$API_URL" ]]; then
  echo "❌ Invalid state file"
  exit 1
fi

# Check server health first
HEALTH=$(curl -s --max-time 3 "${API_URL}/api/health" 2>/dev/null || echo "")
if [[ -z "$HEALTH" ]]; then
  echo "⚠️  Cannot reach Tycono server at $API_URL"
  echo ""
  # Fall back to disk-based status
else
  echo "🔗 Server: $API_URL"
fi

echo "🤖 Tycono Wave Status"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "  Wave:      $WAVE_ID"
echo "  Started:   $STARTED_AT"
echo "  Directive: $DIRECTIVE"
echo ""

# Try active waves API
if [[ -n "$HEALTH" ]]; then
  ACTIVE_RESPONSE=$(curl -s --max-time 5 "${API_URL}/api/waves/active" 2>/dev/null || echo "")
  if [[ -n "$ACTIVE_RESPONSE" ]]; then
    echo "$ACTIVE_RESPONSE" | python3 -c "
import sys, json
try:
    data = json.load(sys.stdin)
    waves = data.get('waves', [])
    target = '$WAVE_ID'
    found = None
    for w in waves:
        if w.get('waveId') == target or w.get('id','').endswith(target.replace('wave-','')):
            found = w
            break
    if not found:
        print('  Status: completed (not in active waves)')
    else:
        status = found.get('status', 'unknown')
        print(f'  Status: {status}')
        print()
        sessions = found.get('dispatches', found.get('sessions', []))
        if sessions:
            print('  Sessions:')
            for s in sessions:
                role = s.get('roleId', '?')
                st = s.get('status', '?')
                icon = '🟢' if st in ('running','active') else '✅' if st == 'done' else '⏸️' if st == 'awaiting_input' else '❌'
                print(f'    {icon} [{role}] {st}')
        print()
except Exception as e:
    print(f'  Error: {e}')
" 2>/dev/null || echo "  (Could not parse API response)"
  fi
fi

# Also check wave file on disk
WAVE_FILE=".tycono/waves/${WAVE_ID}.json"
if [[ -f "$WAVE_FILE" ]]; then
  echo "  📁 Wave file on disk:"
  python3 -c "
import json
with open('$WAVE_FILE') as f:
    data = json.load(f)
roles = data.get('roles', [])
if roles:
    for r in roles:
        rid = r.get('roleId', '?')
        st = r.get('status', '?')
        icon = '✅' if st == 'done' else '🟢' if st in ('running','active') else '❌'
        print(f'    {icon} [{rid}] {st}')
duration = data.get('duration')
if duration:
    print(f'  Duration: {duration}s')
dispatch = data.get('dispatch')
if dispatch:
    attempted = dispatch.get('attempted', 0)
    succeeded = dispatch.get('succeeded', 0)
    failed = dispatch.get('failed', 0)
    print(f'  Dispatch: {succeeded}/{attempted} succeeded', end='')
    if failed > 0:
        print(f' ⚠️  {failed} FAILED')
        for err in dispatch.get('errors', []):
            print(f'    ❌ {err.get(\"sourceRole\",\"?\")} → {err.get(\"targetRole\",\"?\")}: {err.get(\"error\",\"?\")}')
    else:
        print()
" 2>/dev/null || true
fi

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
