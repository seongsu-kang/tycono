#!/bin/bash
# Tycono — Wave Analysis
# Shows role-by-role status, tokens, cost + orphan session detection

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
  # Scan common ports
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

# Fetch data to temp files (avoid shell escaping issues with JSON)
TMP_DIR=$(mktemp -d)
trap "rm -rf $TMP_DIR" EXIT

curl -s "${API_URL}/api/waves/active" > "$TMP_DIR/waves.json" 2>/dev/null || echo '{"waves":[]}' > "$TMP_DIR/waves.json"
curl -s "${API_URL}/api/sessions" > "$TMP_DIR/sessions.json" 2>/dev/null || echo '[]' > "$TMP_DIR/sessions.json"
curl -s "${API_URL}/api/cost/summary" > "$TMP_DIR/cost.json" 2>/dev/null || echo '{}' > "$TMP_DIR/cost.json"
curl -s "${API_URL}/api/exec/status" > "$TMP_DIR/exec.json" 2>/dev/null || echo '{}' > "$TMP_DIR/exec.json"

# Render with python3
python3 -c "
import json, sys, os
from datetime import datetime

with open('$TMP_DIR/waves.json') as f: waves_raw = json.load(f)
with open('$TMP_DIR/sessions.json') as f: sessions = json.load(f)
with open('$TMP_DIR/cost.json') as f: cost = json.load(f)
with open('$TMP_DIR/exec.json') as f: exec_status = json.load(f)

waves = waves_raw.get('waves', waves_raw) if isinstance(waves_raw, dict) else waves_raw

statuses = exec_status.get('statuses', {})
by_role = cost.get('byRole', {})
by_model = cost.get('byModel', {})

# Active wave
if waves:
    wave = waves[0] if isinstance(waves, list) else waves
    wave_id = wave.get('id', wave.get('waveId', 'unknown'))
    started = wave.get('startedAt', 0)
    if isinstance(started, (int, float)) and started > 0:
        elapsed = (datetime.now().timestamp() * 1000 - started) / 1000 / 60
        elapsed_str = f'{elapsed:.0f}m'
    else:
        elapsed_str = '?'

    dispatches = wave.get('dispatches', [])
    wave_sessions = set(wave.get('sessionIds', []))

    print()
    print('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
    print(f'  Wave: {wave_id} (running, {elapsed_str})')
    print('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
    print(f'  {\"Role\":<14s} {\"Status\":<10s} {\"Input\":>8s} {\"Output\":>8s} {\"Cost\":>8s}')
    print(f'  {\"-\"*14:<14s} {\"-\"*10:<10s} {\"-\"*8:>8s} {\"-\"*8:>8s} {\"-\"*8:>8s}')

    total_input = 0
    total_output = 0
    total_cost = 0.0

    for role_id, data in sorted(by_role.items()):
        inp = data.get('inputTokens', 0)
        out = data.get('outputTokens', 0)
        c = data.get('costUsd', 0)
        status = statuses.get(role_id, 'idle')
        total_input += inp
        total_output += out
        total_cost += c

        def fmt_tokens(n):
            if n >= 1_000_000: return f'{n/1_000_000:.1f}M'
            if n >= 1_000: return f'{n/1_000:.0f}K'
            return str(n)

        print(f'  {role_id:<14s} {status:<10s} {fmt_tokens(inp):>8s} {fmt_tokens(out):>8s} {\"\${:.2f}\".format(c):>8s}')

    if not by_role:
        print('  (no token data yet)')

    print(f'  {\"-\"*14:<14s} {\"-\"*10:<10s} {\"-\"*8:>8s} {\"-\"*8:>8s} {\"-\"*8:>8s}')

    def fmt_tokens(n):
        if n >= 1_000_000: return f'{n/1_000_000:.1f}M'
        if n >= 1_000: return f'{n/1_000:.0f}K'
        return str(n)

    print(f'  {\"TOTAL\":<14s} {\"\":<10s} {fmt_tokens(total_input):>8s} {fmt_tokens(total_output):>8s} {\"\${:.2f}\".format(total_cost):>8s}')
else:
    print()
    print('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
    print('  No active wave')
    print('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')

# Orphan detection: sessions not in current wave
print()
active_wave_ids = set()
for w in (waves if isinstance(waves, list) else [waves] if waves else []):
    active_wave_ids.add(w.get('id', w.get('waveId', '')))

orphans = []
for s in sessions:
    wave_id = s.get('waveId', '')
    if wave_id and wave_id not in active_wave_ids and s.get('status') in ('active', 'running'):
        orphans.append(s)

# Also check OS processes
import subprocess
try:
    ps = subprocess.run(['ps', 'aux'], capture_output=True, text=True)
    ps_lines = [l for l in ps.stdout.split('\n') if 'tycono' in l.lower() and 'grep' not in l]
    zombie_procs = [l for l in ps_lines if 'supervision-' in l or ('start-wave' in l and 'confirmed' not in l)]
except:
    zombie_procs = []

if orphans or zombie_procs:
    print('━━━━ Other sessions (not this wave) ━━━━━━━━━━━━━━━━━━')
    for s in orphans:
        print(f'  ⚠️  {s[\"id\"]:40s} wave={s.get(\"waveId\",\"?\")} status={s[\"status\"]}')
    for p in zombie_procs[:5]:
        parts = p.split()
        if len(parts) > 10:
            pid = parts[1]
            cmd = ' '.join(parts[10:13])
            print(f'  ⚠️  PID {pid:6s}  {cmd[:50]}')
    print('  → /tycono:tycono-cancel or kill to clean up')
else:
    print('━━━━ No orphan sessions or zombie processes ━━━━━━━━━━')

print('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
print()
"
