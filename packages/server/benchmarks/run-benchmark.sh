#!/bin/bash
# Tycono Benchmark Runner — Automated A/B Testing
#
# Usage:
#   ./run-benchmark.sh --case C1 --version 0.2.10 --run 1
#   ./run-benchmark.sh --suite          # Run all cases × versions × N=3
#   ./run-benchmark.sh --report         # Generate comparison report
#
# Results: ./results/{case}/{version}/run-{n}.json
# Cases:   ./cases.json

set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
RESULTS_DIR="$SCRIPT_DIR/results"
CASES_FILE="$SCRIPT_DIR/cases.json"
mkdir -p "$RESULTS_DIR"

VERSIONS="0.2.10 0.2.11-beta.5"
RUNS=3
TIMEOUT=900

run_single() {
  local case_id="$1"
  local version="$2"
  local run_num="$3"

  local case_name=$(python3 -c "import json; print(json.load(open('$CASES_FILE'))['$case_id']['name'])")
  local preset=$(python3 -c "import json; print(json.load(open('$CASES_FILE'))['$case_id']['preset'])")

  local result_dir="$RESULTS_DIR/$case_id/$version"
  mkdir -p "$result_dir"
  local result_file="$result_dir/run-${run_num}.json"

  if [ -f "$result_file" ]; then
    echo "  [SKIP] $result_file already exists"
    return 0
  fi

  echo ""
  echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
  echo "  $case_id: $case_name | v$version | Run $run_num"
  echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

  # 1. Create isolated sandbox
  local testdir=$(mktemp -d)
  mkdir -p "$testdir/knowledge" "$testdir/code"
  echo "# Benchmark Test" > "$testdir/knowledge/CLAUDE.md"
  git -C "$testdir/code" init --quiet 2>/dev/null || true

  # 2. Install + start server
  echo "  [1/5] Installing tycono-server@$version..."
  npm install "tycono-server@$version" --prefix "$testdir/srv" --silent 2>/dev/null

  COMPANY_ROOT="$testdir" node "$testdir/srv/node_modules/.bin/tycono-server" &>/dev/null &
  local srv_pid=$!

  # Wait for server ready
  local port=""
  local i=0
  while [ $i -lt 30 ]; do
    sleep 1
    i=$((i + 1))
    if [ -f "$testdir/.tycono/headless.json" ]; then
      port=$(python3 -c "import json; print(json.load(open('$testdir/.tycono/headless.json'))['port'])" 2>/dev/null || true)
      if [ -n "$port" ]; then break; fi
    fi
  done

  if [ -z "$port" ]; then
    echo "  [ERROR] Server failed to start"
    kill "$srv_pid" 2>/dev/null || true
    rm -rf "$testdir"
    return 1
  fi
  echo "  [2/5] Server ready on port $port"

  # 3. Start wave (use python3 to avoid shell quoting issues)
  local wave_id=$(python3 -c "
import json, urllib.request
cases = json.load(open('$CASES_FILE'))
directive = cases['$case_id']['directive']
preset = cases['$case_id']['preset']
body = json.dumps({'directive': directive, 'preset': preset}).encode()
req = urllib.request.Request('http://localhost:$port/api/exec/wave', data=body, headers={'Content-Type': 'application/json'})
try:
    resp = urllib.request.urlopen(req)
    print(json.loads(resp.read()).get('waveId', ''))
except Exception as e:
    print('')
" 2>/dev/null || true)

  if [ -z "$wave_id" ]; then
    echo "  [ERROR] Wave failed to start"
    kill "$srv_pid" 2>/dev/null || true
    rm -rf "$testdir"
    return 1
  fi
  echo "  [3/5] Wave started: $wave_id"

  # 4. Wait for completion
  echo "  [4/5] Waiting for completion (max ${TIMEOUT}s)..."
  local start_ts=$(date +%s)
  local completed="false"

  while true; do
    local elapsed=$(( $(date +%s) - start_ts ))
    if [ $elapsed -ge $TIMEOUT ]; then
      echo "  [TIMEOUT] Wave did not complete within ${TIMEOUT}s"
      break
    fi

    local status=$(curl -s "http://localhost:$port/api/waves/$wave_id/board" 2>/dev/null | python3 -c "
import json,sys
try:
  b=json.load(sys.stdin)
  tasks=b.get('tasks',[])
  if not tasks: print('no-board')
  elif all(t['status'] in ('done','skipped') for t in tasks): print('done')
  else: print('running')
except: print('error')
" 2>/dev/null || echo "error")

    if [ "$status" = "done" ]; then
      completed="true"
      break
    fi

    sleep 15
  done

  # 5. Collect metrics
  local duration=$(( $(date +%s) - start_ts ))
  echo "  [5/5] Collecting metrics (${duration}s elapsed)..."

  python3 - "$case_id" "$version" "$run_num" "$wave_id" "$completed" "$duration" "$result_file" "$port" <<'PYEOF'
import json, sys, urllib.request

case_id, version, run_num, wave_id, completed, duration, result_file, port = sys.argv[1:9]

try:
    resp = urllib.request.urlopen(f'http://localhost:{port}/api/waves/{wave_id}/events?limit=9999')
    data = json.loads(resp.read())
except:
    data = {'events': []}
events = data.get('events', [])

turns = sum(1 for e in events if e.get('type') == 'msg:turn-complete')
reads = sum(1 for e in events if e.get('type') == 'tool:start' and e.get('data', {}).get('name') == 'Read')
writes = sum(1 for e in events if e.get('type') == 'tool:start' and e.get('data', {}).get('name') == 'Write')
tools = sum(1 for e in events if e.get('type') == 'tool:start')
sessions = len(set(e.get('sessionId', '') for e in events if e.get('sessionId')))
dispatches = sum(1 for e in events if e.get('type') == 'dispatch:start')
errors = sum(1 for e in events if e.get('type') == 'msg:error')
roles = sorted(set(e.get('roleId', '') for e in events if e.get('roleId')))

role_turns = {}
for e in events:
    if e.get('type') == 'msg:turn-complete':
        r = e.get('roleId', 'unknown')
        role_turns[r] = role_turns.get(r, 0) + 1

result = {
    'case': case_id,
    'version': version,
    'run': int(run_num),
    'waveId': wave_id,
    'completed': completed == 'true',
    'durationSeconds': int(duration),
    'turns': turns,
    'reads': reads,
    'writes': writes,
    'tools': tools,
    'sessions': sessions,
    'dispatches': dispatches,
    'errors': errors,
    'roles': roles,
    'roleTurns': role_turns,
    'totalEvents': len(events),
}

with open(result_file, 'w') as f:
    json.dump(result, f, indent=2)

print(f'  Turns: {turns} | Reads: {reads} | Tools: {tools} | Sessions: {sessions} | Duration: {duration}s')
PYEOF

  # Cleanup
  kill "$srv_pid" 2>/dev/null || true
  sleep 2
  pkill -f "$testdir" 2>/dev/null || true
  sleep 1
  rm -rf "$testdir"

  echo "  [DONE] Saved: $result_file"
}

generate_report() {
  echo ""
  echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
  echo "  Benchmark Report — $(date -u +%Y-%m-%dT%H:%M:%SZ)"
  echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

  python3 - "$RESULTS_DIR" <<'PYEOF'
import json, sys
from pathlib import Path

results_dir = Path(sys.argv[1])
data = {}

for case_dir in sorted(results_dir.iterdir()):
    if not case_dir.is_dir(): continue
    case_id = case_dir.name
    data[case_id] = {}
    for ver_dir in sorted(case_dir.iterdir()):
        if not ver_dir.is_dir(): continue
        version = ver_dir.name
        runs = []
        for f in sorted(ver_dir.glob("run-*.json")):
            try: runs.append(json.loads(f.read_text()))
            except: pass
        if runs: data[case_id][version] = runs

if not data:
    print("  No results found.")
    sys.exit(0)

for case_id, versions in sorted(data.items()):
    print(f"\n  ── {case_id} ──")
    ver_list = sorted(versions.keys())

    header = f"  {'Metric':<18}"
    for v in ver_list:
        n = len(versions[v])
        header += f"  {v:>16} (N={n})"
    if len(ver_list) == 2: header += f"  {'Delta':>8}"
    print(header)

    for metric in ['turns', 'reads', 'writes', 'tools', 'sessions', 'dispatches', 'durationSeconds']:
        line = f"  {metric:<18}"
        avgs = []
        for v in ver_list:
            vals = [r.get(metric, 0) for r in versions[v]]
            avg = sum(vals) / len(vals) if vals else 0
            avgs.append(avg)
            std = (sum((x - avg)**2 for x in vals) / len(vals))**0.5 if len(vals) > 1 else 0
            line += f"  {avg:>8.0f} ±{std:>4.0f}    "
        if len(avgs) == 2 and avgs[0] > 0:
            delta = (avgs[1] - avgs[0]) / avgs[0] * 100
            line += f"  {delta:>+6.0f}%"
        print(line)

    comp_line = f"  {'completed':<18}"
    for v in ver_list:
        c = sum(1 for r in versions[v] if r.get('completed'))
        t = len(versions[v])
        comp_line += f"  {c}/{t:>15}    "
    print(comp_line)

print("\n  ── Overall (turns) ──")
all_data = {}
for case_id, versions in data.items():
    for v, runs in versions.items():
        all_data.setdefault(v, []).extend(r['turns'] for r in runs)

for v in sorted(all_data.keys()):
    vals = all_data[v]
    avg = sum(vals)/len(vals)
    std = (sum((x-avg)**2 for x in vals)/len(vals))**0.5 if len(vals)>1 else 0
    print(f"  {v}: avg={avg:.0f} ±{std:.0f} (N={len(vals)})")

ver_list = sorted(all_data.keys())
if len(ver_list) == 2:
    a, b = sum(all_data[ver_list[0]])/len(all_data[ver_list[0]]), sum(all_data[ver_list[1]])/len(all_data[ver_list[1]])
    print(f"  Delta: {(b-a)/a*100:+.0f}%")
PYEOF
}

# ─── CLI ───

case "${1:-}" in
  --suite)
    echo "============================================="
    echo " Tycono Benchmark Suite"
    echo " $(date -u +%Y-%m-%dT%H:%M:%SZ)"
    echo " Versions: $VERSIONS"
    echo " Runs: $RUNS per combo"
    echo "============================================="
    for case_id in $(python3 -c "import json; print(' '.join(sorted(json.load(open('$CASES_FILE')).keys())))"); do
      for version in $VERSIONS; do
        for run in $(seq 1 $RUNS); do
          run_single "$case_id" "$version" "$run" || echo "  [WARN] Run failed, continuing..."
        done
      done
    done
    generate_report
    ;;
  --report)
    generate_report
    ;;
  --case)
    run_single "${2:?}" "${4:?}" "${6:-1}"
    ;;
  *)
    echo "Usage:"
    echo "  $0 --suite                                    # Full suite (4 cases × 2 versions × 3 runs)"
    echo "  $0 --report                                   # Report from existing results"
    echo "  $0 --case C1 --version 0.2.10 --run 1         # Single run"
    echo ""
    echo "Cases: $(python3 -c "import json; print(', '.join(sorted(json.load(open('$CASES_FILE')).keys())))")"
    ;;
esac
