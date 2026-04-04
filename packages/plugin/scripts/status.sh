#!/bin/bash

# Tycono Plugin — Wave Status (dispatch tree + cost)
# Uses /api/waves/:waveId/analysis for unified data

set -uo pipefail
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

# Check server health
HEALTH=$(curl -s --max-time 3 "${API_URL}/api/health" 2>/dev/null || echo "")

# Try unified analysis endpoint first (server 0.1.3+)
if [[ -n "$HEALTH" ]]; then
  TMP_FILE=$(mktemp)
  trap "rm -f $TMP_FILE" EXIT
  HTTP_CODE=$(curl -s -o "$TMP_FILE" -w "%{http_code}" "${API_URL}/api/waves/${WAVE_ID}/analysis" 2>/dev/null || echo "000")

  if [[ "$HTTP_CODE" == "200" ]]; then
    python3 -c "
import json, sys

with open('$TMP_FILE') as f:
    data = json.load(f)

wave_id = data.get('waveId', 'unknown')
status = data.get('status', 'unknown')
elapsed = data.get('elapsedSeconds')
directive = data.get('directive', '') or '$DIRECTIVE'
roles = data.get('roles', [])
orphans = data.get('orphans', [])
total_cost = data.get('totalCostUsd', 0)

elapsed_str = f'{elapsed // 60}m{elapsed % 60}s' if elapsed else '?'

def fmt_tokens(n):
    if n >= 1_000_000: return f'{n/1_000_000:.1f}M'
    if n >= 1_000: return f'{n/1_000:.0f}K'
    return str(n)

def status_icon(st):
    if st in ('working', 'running', 'active'): return '🟢'
    if st == 'done': return '✅'
    if st == 'awaiting_input': return '⏸️'
    return '❌'

# Build parent→children map for tree
session_to_role = {}
children_map = {}  # parentSessionId → [role entries]
roots = []

for r in roles:
    session_to_role[r['sessionId']] = r
    parent = r.get('parentSessionId')
    if parent and parent in [rr['sessionId'] for rr in roles]:
        children_map.setdefault(parent, []).append(r)
    else:
        roots.append(r)

# Sort: CEO first, then alphabetical
roots.sort(key=lambda r: (0 if r['roleId'] == 'ceo' else 1, r['roleId']))

print()
print('🤖 Tycono Wave Status')
print('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━��━━━━━━━━━━━━━━━━━━━━')
print(f'  Wave: {wave_id} ({status}, {elapsed_str})')
if directive:
    d = directive[:60] + '...' if len(directive) > 60 else directive
    print(f'  Directive: {d}')
print('━━━━━━━━━━━━━━━━━━━━��━━━━━━━��━━━━━��━━━━━━━━━━��━━━━━━━━')

def print_role(r, prefix='', is_last=True):
    icon = status_icon(r['status'])
    connector = '└── ' if is_last else '├── '
    inp = fmt_tokens(r.get('inputTokens', 0))
    cost = '\${:.2f}'.format(r.get('costUsd', 0))
    print(f'  {prefix}{connector}{icon} {r[\"roleId\"]:<12s} {inp:>6s} in  {cost}')

    kids = children_map.get(r['sessionId'], [])
    kids.sort(key=lambda c: c['roleId'])
    child_prefix = prefix + ('    ' if is_last else '│   ')
    for i, child in enumerate(kids):
        print_role(child, child_prefix, i == len(kids) - 1)

if roots:
    print()
    for i, root in enumerate(roots):
        print_role(root, '', i == len(roots) - 1)
    print()
else:
    print('  (no sessions yet)')
    print()

print(f'  Total: \${total_cost:.2f}')

# Approvals
approvals = [r for r in roles if r.get('status') == 'awaiting_input']
if approvals:
    print()
    print('  ⏸️  APPROVAL NEEDED:')
    for r in approvals:
        print(f'    {r[\"roleId\"]}: awaiting input')
    print(f'    → Reply with: /tycono:tycono-directive \"your decision\"')

# Orphans
if orphans:
    print()
    print('  ⚠️  Other active sessions (not this wave):')
    for o in orphans:
        print(f'    {o[\"roleId\"]} (session={o[\"sessionId\"][:20]}...)')

print('━━━━��━━━━━━��━━━━━━━━━━━������━━━━━━━━��━━━━━━━━━━━━━━━━━━━━')
print()
" 2>/dev/null
    exit 0
  fi
fi

# Fallback: legacy flat status (server < 0.1.3 or no server)
echo "🤖 Tycono Wave Status"
echo "━━━━━��━━━━━━━━━━━━━━━━━━━━━��━━━━━━━━━━━━━"
echo "  Wave:      $WAVE_ID"
echo "  Started:   $STARTED_AT"
echo "  Directive: $DIRECTIVE"
echo ""

if [[ -n "$HEALTH" ]]; then
  echo "🔗 Server: $API_URL"
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
        sessions = found.get('dispatches', found.get('sessions', []))
        if sessions:
            print('  Sessions:')
            for s in sessions:
                role = s.get('roleId', '?')
                st = s.get('status', '?')
                icon = '🟢' if st in ('running','active') else '✅' if st == 'done' else '⏸️' if st == 'awaiting_input' else '❌'
                print(f'    {icon} [{role}] {st}')
except Exception as e:
    print(f'  Error: {e}')
" 2>/dev/null || echo "  (Could not parse API response)"
  fi
else
  echo "⚠️  Cannot reach server at $API_URL"
fi

# Wave file on disk
WAVE_FILE=".tycono/waves/${WAVE_ID}.json"
if [[ -f "$WAVE_FILE" ]]; then
  echo ""
  echo "  📁 Wave file on disk:"
  python3 -c "
import json
with open('$WAVE_FILE') as f:
    data = json.load(f)
roles = data.get('roles', [])
for r in roles:
    rid = r.get('roleId', '?')
    st = r.get('status', '?')
    icon = '✅' if st == 'done' else '����' if st in ('running','active') else '❌'
    print(f'    {icon} [{rid}] {st}')
" 2>/dev/null || true
fi

echo "━━━���━━━━━━━━���━━━���━━━━━━━���━━━━━━━━━━━━━━━━"
