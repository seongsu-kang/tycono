#!/bin/bash
# Tycono — Wave Analysis
# Shows role-by-role status, tokens, cost + orphan session detection
# Uses unified /api/waves/:waveId/analysis endpoint (server 0.1.3+)
# Falls back to 4-endpoint approach for older servers

set -uo pipefail
export PYTHONIOENCODING=utf-8

# Find server
API_URL=""
HEADLESS_JSON=".tycono/headless.json"
if [[ -f "$HEADLESS_JSON" ]]; then
  PORT=$(python3 -c "import json; print(json.load(open('$HEADLESS_JSON'))['port'])" 2>/dev/null || echo "")
  if [[ -n "$PORT" ]] && curl -s --max-time 2 "http://localhost:${PORT}/api/health" >/dev/null 2>&1; then
    API_URL="http://localhost:${PORT}"
  fi
fi

if [[ -z "$API_URL" ]]; then
  for PORT_CHECK in 4321 4322 4323; do
    if curl -s --max-time 1 "http://localhost:${PORT_CHECK}/api/health" >/dev/null 2>&1; then
      API_URL="http://localhost:${PORT_CHECK}"
      break
    fi
  done
fi

if [[ -z "$API_URL" ]]; then
  echo "❌ No Tycono server found. Start a wave first."
  exit 1
fi

# Get active wave ID
WAVE_ID=$(curl -s "${API_URL}/api/waves/active" 2>/dev/null | python3 -c "
import json, sys
data = json.load(sys.stdin)
waves = data.get('waves', data) if isinstance(data, dict) else data
if isinstance(waves, list) and waves:
    print(waves[0].get('id', waves[0].get('waveId', '')))
elif isinstance(waves, dict):
    print(waves.get('id', waves.get('waveId', '')))
" 2>/dev/null || echo "")

if [[ -z "$WAVE_ID" ]]; then
  echo ""
  echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
  echo "  No active wave"
  echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
  exit 0
fi

# Try unified analysis endpoint (server 0.1.3+)
TMP_DIR=$(mktemp -d)
trap "rm -rf $TMP_DIR" EXIT

HTTP_CODE=$(curl -s -o "$TMP_DIR/analysis.json" -w "%{http_code}" "${API_URL}/api/waves/${WAVE_ID}/analysis" 2>/dev/null || echo "000")

if [[ "$HTTP_CODE" == "200" ]]; then
  # Unified endpoint available — render from single response
  python3 -c "
import json, sys

with open('$TMP_DIR/analysis.json') as f:
    data = json.load(f)

wave_id = data.get('waveId', 'unknown')
status = data.get('status', 'unknown')
elapsed = data.get('elapsedSeconds')
directive = data.get('directive', '')
roles = data.get('roles', [])
orphans = data.get('orphans', [])
total_cost = data.get('totalCostUsd', 0)
total_input = data.get('totalInputTokens', 0)
total_output = data.get('totalOutputTokens', 0)

elapsed_str = f'{elapsed // 60}m{elapsed % 60}s' if elapsed else '?'

def fmt_tokens(n):
    if n >= 1_000_000: return f'{n/1_000_000:.1f}M'
    if n >= 1_000: return f'{n/1_000:.0f}K'
    return str(n)

print()
print('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
print(f'  Wave: {wave_id} ({status}, {elapsed_str})')
if directive:
    d = directive[:60] + '...' if len(directive) > 60 else directive
    print(f'  Directive: {d}')
print('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
print(f'  {\"Role\":<14s} {\"Status\":<10s} {\"Model\":<12s} {\"Input\":>8s} {\"Output\":>8s} {\"Cost\":>8s}')
print(f'  {\"-\"*14:<14s} {\"-\"*10:<10s} {\"-\"*12:<12s} {\"-\"*8:>8s} {\"-\"*8:>8s} {\"-\"*8:>8s}')

for r in sorted(roles, key=lambda x: x.get('roleId', '')):
    role_id = r.get('roleId', '?')
    st = r.get('status', 'idle')
    model = r.get('model', '')
    # Shorten model name
    short_model = model.replace('claude-', '').replace('-latest', '')[:12] if model else '-'
    inp = r.get('inputTokens', 0)
    out = r.get('outputTokens', 0)
    c = r.get('costUsd', 0)
    print(f'  {role_id:<14s} {st:<10s} {short_model:<12s} {fmt_tokens(inp):>8s} {fmt_tokens(out):>8s} {\"\${:.2f}\".format(c):>8s}')

if not roles:
    print('  (no token data yet)')

print(f'  {\"-\"*14:<14s} {\"-\"*10:<10s} {\"-\"*12:<12s} {\"-\"*8:>8s} {\"-\"*8:>8s} {\"-\"*8:>8s}')
print(f'  {\"TOTAL\":<14s} {\"\":<10s} {\"\":<12s} {fmt_tokens(total_input):>8s} {fmt_tokens(total_output):>8s} {\"\${:.2f}\".format(total_cost):>8s}')

# Orphans
print()
if orphans:
    print('━━━━ Other sessions (not this wave) ━━━━━━━━━━━━━━━━━━')
    for o in orphans:
        print(f'  ⚠️  {o[\"sessionId\"]:40s} role={o[\"roleId\"]} wave={o.get(\"waveId\") or \"?\"} status={o[\"status\"]}')
    print('  → /tycono:tycono-cancel or kill to clean up')
else:
    print('━━━━ No orphan sessions or zombie processes ━━━━━━━━━━')

print('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
print()
"
else
  # Fallback: 4-endpoint approach for older servers
  curl -s "${API_URL}/api/waves/active" > "$TMP_DIR/waves.json" 2>/dev/null || echo '{"waves":[]}' > "$TMP_DIR/waves.json"
  curl -s "${API_URL}/api/sessions" > "$TMP_DIR/sessions.json" 2>/dev/null || echo '[]' > "$TMP_DIR/sessions.json"
  curl -s "${API_URL}/api/cost/summary" > "$TMP_DIR/cost.json" 2>/dev/null || echo '{}' > "$TMP_DIR/cost.json"
  curl -s "${API_URL}/api/exec/status" > "$TMP_DIR/exec.json" 2>/dev/null || echo '{}' > "$TMP_DIR/exec.json"

  python3 -c "
import json, sys

with open('$TMP_DIR/waves.json') as f: waves_raw = json.load(f)
with open('$TMP_DIR/sessions.json') as f: sessions = json.load(f)
with open('$TMP_DIR/cost.json') as f: cost = json.load(f)
with open('$TMP_DIR/exec.json') as f: exec_status = json.load(f)

waves = waves_raw.get('waves', waves_raw) if isinstance(waves_raw, dict) else waves_raw
statuses = exec_status.get('statuses', {})
by_role = cost.get('byRole', {})

if waves:
    wave = waves[0] if isinstance(waves, list) else waves
    wave_id = wave.get('id', wave.get('waveId', 'unknown'))
    started = wave.get('startedAt', 0)
    if isinstance(started, (int, float)) and started > 0:
        from datetime import datetime
        elapsed = (datetime.now().timestamp() * 1000 - started) / 1000 / 60
        elapsed_str = f'{elapsed:.0f}m'
    else:
        elapsed_str = '?'

    def fmt_tokens(n):
        if n >= 1_000_000: return f'{n/1_000_000:.1f}M'
        if n >= 1_000: return f'{n/1_000:.0f}K'
        return str(n)

    print()
    print('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
    print(f'  Wave: {wave_id} (running, {elapsed_str})')
    print('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
    print(f'  {\"Role\":<14s} {\"Status\":<10s} {\"Input\":>8s} {\"Output\":>8s} {\"Cost\":>8s}')
    print(f'  {\"-\"*14:<14s} {\"-\"*10:<10s} {\"-\"*8:>8s} {\"-\"*8:>8s} {\"-\"*8:>8s}')

    total_input = total_output = 0
    total_cost = 0.0

    for role_id, data in sorted(by_role.items()):
        inp = data.get('inputTokens', 0)
        out = data.get('outputTokens', 0)
        c = data.get('costUsd', 0)
        status = statuses.get(role_id, 'idle')
        total_input += inp; total_output += out; total_cost += c
        print(f'  {role_id:<14s} {status:<10s} {fmt_tokens(inp):>8s} {fmt_tokens(out):>8s} {\"\${:.2f}\".format(c):>8s}')

    if not by_role: print('  (no token data yet)')
    print(f'  {\"-\"*14:<14s} {\"-\"*10:<10s} {\"-\"*8:>8s} {\"-\"*8:>8s} {\"-\"*8:>8s}')
    print(f'  {\"TOTAL\":<14s} {\"\":<10s} {fmt_tokens(total_input):>8s} {fmt_tokens(total_output):>8s} {\"\${:.2f}\".format(total_cost):>8s}')
else:
    print()
    print('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
    print('  No active wave')
    print('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')

# Orphan detection
print()
active_wave_ids = set()
for w in (waves if isinstance(waves, list) else [waves] if waves else []):
    active_wave_ids.add(w.get('id', w.get('waveId', '')))
orphans = [s for s in sessions if s.get('waveId','') and s['waveId'] not in active_wave_ids and s.get('status') in ('active','running')]

if orphans:
    print('━━━━ Other sessions (not this wave) ━━━━━━━━━━━━━━━━━━')
    for s in orphans:
        print(f'  ⚠️  {s[\"id\"]:40s} wave={s.get(\"waveId\",\"?\")} status={s[\"status\"]}')
    print('  → /tycono:tycono-cancel or kill to clean up')
else:
    print('━━━━ No orphan sessions or zombie processes ━━━━━━━━━━')

print('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
print()
"
fi
