#!/bin/bash

# Tycono Plugin — Stop Hook
# Prevents session exit while a wave is still running.
# Queries Tycono API for wave status and feeds progress back to Claude.

set -euo pipefail

HOOK_INPUT=$(cat)
STATE_FILE=".claude/tycono.local.md"

# No active wave — allow exit
if [[ ! -f "$STATE_FILE" ]]; then
  exit 0
fi

# Parse state
FRONTMATTER=$(sed -n '/^---$/,/^---$/{ /^---$/d; p; }' "$STATE_FILE")
WAVE_ID=$(echo "$FRONTMATTER" | grep '^wave_id:' | sed 's/wave_id: *//')
API_URL=$(echo "$FRONTMATTER" | grep '^api_url:' | sed 's/api_url: *//')

# Session isolation
STATE_SESSION=$(echo "$FRONTMATTER" | grep '^session_id:' | sed 's/session_id: *//' || true)
HOOK_SESSION=$(echo "$HOOK_INPUT" | python3 -c "import sys,json; print(json.load(sys.stdin).get('session_id',''))" 2>/dev/null || echo "")
if [[ -n "$STATE_SESSION" ]] && [[ -n "$HOOK_SESSION" ]] && [[ "$STATE_SESSION" != "$HOOK_SESSION" ]]; then
  exit 0
fi

# No wave ID — stale state, allow exit
if [[ -z "$WAVE_ID" ]] || [[ -z "$API_URL" ]]; then
  rm -f "$STATE_FILE"
  exit 0
fi

# Query active waves from Tycono API
ACTIVE_RESPONSE=$(curl -s --max-time 5 "${API_URL}/api/waves/active" 2>/dev/null || echo "")

# Server unreachable — allow exit (don't trap user)
if [[ -z "$ACTIVE_RESPONSE" ]]; then
  echo "⚠️ Tycono server unreachable. Allowing exit."
  rm -f "$STATE_FILE"
  exit 0
fi

# Check if our wave is still in the active list
WAVE_ACTIVE=$(echo "$ACTIVE_RESPONSE" | python3 -c "
import sys, json
try:
    data = json.load(sys.stdin)
    waves = data.get('waves', [])
    target = '${WAVE_ID}'
    for w in waves:
        if w.get('waveId') == target:
            print(w.get('status', 'running'))
            sys.exit(0)
    print('not_found')
except:
    print('error')
" 2>/dev/null || echo "error")

# Wave not found or completed — allow exit
if [[ "$WAVE_ACTIVE" == "not_found" ]] || [[ "$WAVE_ACTIVE" == "stopped" ]] || [[ "$WAVE_ACTIVE" == "error" ]]; then
  echo "✅ Tycono wave $WAVE_ID finished."
  rm -f "$STATE_FILE"
  exit 0
fi

# Wave still running — block exit and feed status back

# Build status summary from active waves response
STATUS_SUMMARY=$(echo "$ACTIVE_RESPONSE" | python3 -c "
import sys, json
try:
    data = json.load(sys.stdin)
    waves = data.get('waves', [])
    target = '${WAVE_ID}'
    for w in waves:
        if w.get('waveId') == target:
            sessions = w.get('sessions', [])
            parts = []
            for s in sessions:
                role = s.get('roleId', '?')
                st = s.get('status', '?')
                parts.append(f'{role}:{st}')
            print(' | '.join(parts) if parts else w.get('status', 'running'))
            sys.exit(0)
    print('running')
except:
    print('running')
" 2>/dev/null || echo "running")

DIRECTIVE=$(echo "$FRONTMATTER" | grep '^directive:' | sed 's/directive: *//')

# Output decision: block exit, feed prompt back
python3 -c "
import json, sys
prompt = '''Tycono wave is still running.

Current team status: ${STATUS_SUMMARY}

Check on the wave progress using /tycono-status and report to the user what each role is doing.

Original directive: ${DIRECTIVE}'''

print(json.dumps({
    'decision': 'block',
    'reason': prompt,
    'systemMessage': '🤖 Tycono wave running — ${STATUS_SUMMARY}'
}))
"

exit 0
