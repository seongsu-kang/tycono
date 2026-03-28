#!/bin/bash

# Tycono Plugin — Wave Status

set -euo pipefail

STATE_FILE=".claude/tycono.local.md"

if [[ ! -f "$STATE_FILE" ]]; then
  echo "No active Tycono wave."
  echo "Start one with: /tycono \"your task\""
  exit 0
fi

# Parse state
FRONTMATTER=$(sed -n '/^---$/,/^---$/{ /^---$/d; p; }' "$STATE_FILE")
WAVE_ID=$(echo "$FRONTMATTER" | grep '^wave_id:' | sed 's/wave_id: *//')
API_URL=$(echo "$FRONTMATTER" | grep '^api_url:' | sed 's/api_url: *//')
DIRECTIVE=$(echo "$FRONTMATTER" | grep '^directive:' | sed 's/directive: *//')
STARTED=$(echo "$FRONTMATTER" | grep '^started_at:' | sed 's/started_at: *//' | tr -d '"')

if [[ -z "$WAVE_ID" ]] || [[ -z "$API_URL" ]]; then
  echo "❌ Invalid state file"
  exit 1
fi

# Query API
WAVE_STATUS=$(curl -s --max-time 5 "${API_URL}/api/waves/${WAVE_ID}" 2>/dev/null || echo "")

if [[ -z "$WAVE_STATUS" ]]; then
  echo "❌ Cannot reach Tycono server at $API_URL"
  exit 1
fi

echo "🤖 Tycono Wave Status"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "  Wave:      $WAVE_ID"
echo "  Started:   $STARTED"
echo "  Directive: $DIRECTIVE"
echo ""

# Parse and display session statuses
echo "$WAVE_STATUS" | python3 -c "
import sys, json
try:
    data = json.load(sys.stdin)
    status = data.get('status', 'unknown')
    sessions = data.get('sessions', [])
    print(f'  Status: {status}')
    print()
    if sessions:
        print('  Sessions:')
        for s in sessions:
            role = s.get('roleId', '?')
            st = s.get('status', '?')
            icon = '🟢' if st == 'running' else '✅' if st == 'done' else '⏸️' if st == 'awaiting_input' else '❌'
            task_preview = s.get('task', '')[:80]
            print(f'    {icon} [{role}] {st} — {task_preview}')
    print()
except Exception as e:
    print(f'  Raw: {data}' if 'data' in dir() else f'  Error parsing response')
" 2>/dev/null || echo "  (Could not parse wave status)"

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
