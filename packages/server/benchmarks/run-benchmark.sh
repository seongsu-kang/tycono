#!/bin/bash
# Tycono Benchmark Runner v2
#
# 모든 실행은 runs/ 하위에 보존됨. 삭제하지 않음.
# 산출물(코드) + 메트릭 + activity-stream 전부 남음.
#
# Usage:
#   ./run-benchmark.sh --case C1 --version 0.2.10 --run 1
#   ./run-benchmark.sh --suite
#   ./run-benchmark.sh --report

set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
RUNS_DIR="$SCRIPT_DIR/runs"
CASES_FILE="$SCRIPT_DIR/cases.json"
mkdir -p "$RUNS_DIR"

VERSIONS="0.2.10 0.2.11-beta.5"
RUNS=3
TIMEOUT=900

run_single() {
  local case_id="$1"
  local version="$2"
  local run_num="$3"

  local case_name=$(python3 -c "import json; print(json.load(open('$CASES_FILE'))['$case_id']['name'])")
  local preset=$(python3 -c "import json; print(json.load(open('$CASES_FILE'))['$case_id']['preset'])")

  # Persistent run directory — never deleted
  local run_dir="$RUNS_DIR/${case_id}-${version}-run${run_num}"
  local result_file="$run_dir/result.json"

  if [ -f "$result_file" ]; then
    echo "  [SKIP] $run_dir already exists"
    return 0
  fi

  echo ""
  echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
  echo "  $case_id: $case_name | v$version | Run $run_num"
  echo "  Dir: $run_dir"
  echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

  # 1. Create sandbox in runs/ (persistent)
  mkdir -p "$run_dir/knowledge" "$run_dir/code"
  echo "# Benchmark: $case_id v$version run$run_num" > "$run_dir/knowledge/CLAUDE.md"
  git -C "$run_dir/code" init --quiet 2>/dev/null || true

  # 2. Install + start server
  echo "  [1/5] Installing tycono-server@$version..."
  npm install "tycono-server@$version" --prefix "$run_dir/.server" --silent 2>/dev/null

  COMPANY_ROOT="$run_dir" node "$run_dir/.server/node_modules/.bin/tycono-server" &>/dev/null &
  local srv_pid=$!
  echo "$srv_pid" > "$run_dir/server.pid"

  # Wait for server ready
  local port=""
  local i=0
  while [ $i -lt 30 ]; do
    sleep 1
    i=$((i + 1))
    if [ -f "$run_dir/.tycono/headless.json" ]; then
      port=$(python3 -c "import json; print(json.load(open('$run_dir/.tycono/headless.json'))['port'])" 2>/dev/null || true)
      if [ -n "$port" ]; then break; fi
    fi
  done

  if [ -z "$port" ]; then
    echo "  [ERROR] Server failed to start"
    kill "$srv_pid" 2>/dev/null || true
    echo '{"error":"server_start_failed"}' > "$result_file"
    return 1
  fi
  echo "  [2/5] Server ready on port $port"

  # 3. Start wave
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
except: print('')
" 2>/dev/null || true)

  if [ -z "$wave_id" ]; then
    echo "  [ERROR] Wave failed to start"
    kill "$srv_pid" 2>/dev/null || true
    echo '{"error":"wave_start_failed"}' > "$result_file"
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
      echo "  [TIMEOUT] ${TIMEOUT}s exceeded"
      break
    fi

    local status=$(python3 -c "
import json, urllib.request
try:
    resp = urllib.request.urlopen('http://localhost:$port/api/waves/$wave_id/board')
    b = json.loads(resp.read())
    tasks = b.get('tasks', [])
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

  # 5. Collect metrics (BEFORE killing server)
  local duration=$(( $(date +%s) - start_ts ))
  echo "  [5/5] Collecting metrics (${duration}s elapsed)..."

  python3 - "$case_id" "$version" "$run_num" "$wave_id" "$completed" "$duration" "$result_file" "$port" "$run_dir" <<'PYEOF'
import json, sys, urllib.request

case_id, version, run_num, wave_id, completed, duration, result_file, port, run_dir = sys.argv[1:10]

try:
    resp = urllib.request.urlopen(f'http://localhost:{port}/api/waves/{wave_id}/events?limit=9999')
    data = json.loads(resp.read())
except:
    data = {'events': []}

events = data.get('events', [])

turns = sum(1 for e in events if e.get('type') == 'msg:turn-complete')
reads = sum(1 for e in events if e.get('type') == 'tool:start' and e.get('data', {}).get('name') == 'Read')
writes = sum(1 for e in events if e.get('type') == 'tool:start' and e.get('data', {}).get('name') == 'Write')
edits = sum(1 for e in events if e.get('type') == 'tool:start' and e.get('data', {}).get('name') == 'Edit')
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

# Count output files
import os, subprocess
code_dir = os.path.join(run_dir, 'code')
code_files = []
for root, dirs, files in os.walk(code_dir):
    dirs[:] = [d for d in dirs if d not in ('.git', 'node_modules')]
    for f in files:
        code_files.append(os.path.relpath(os.path.join(root, f), code_dir))

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
    'edits': edits,
    'tools': tools,
    'sessions': sessions,
    'dispatches': dispatches,
    'errors': errors,
    'roles': roles,
    'roleTurns': role_turns,
    'totalEvents': len(events),
    'codeFiles': code_files,
    'codeFileCount': len(code_files),
    'runDir': run_dir,
}

with open(result_file, 'w') as f:
    json.dump(result, f, indent=2)

print(f'  Turns: {turns} | Reads: {reads} | Tools: {tools} | Sessions: {sessions} | Files: {len(code_files)} | Duration: {duration}s')
PYEOF

  # Kill server (sandbox stays)
  kill "$srv_pid" 2>/dev/null || true
  sleep 2
  pkill -f "$run_dir" 2>/dev/null || true
  rm -f "$run_dir/server.pid"

  echo "  [DONE] $run_dir"
}

generate_report() {
  echo ""
  echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
  echo "  Benchmark Report — $(date -u +%Y-%m-%dT%H:%M:%SZ)"
  echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

  python3 - "$RUNS_DIR" <<'PYEOF'
import json, sys, os
from pathlib import Path

runs_dir = Path(sys.argv[1])
data = {}

for run_dir in sorted(runs_dir.iterdir()):
    if not run_dir.is_dir(): continue
    result_file = run_dir / 'result.json'
    if not result_file.exists(): continue
    try:
        r = json.loads(result_file.read_text())
        if 'error' in r: continue
        case_id = r['case']
        version = r['version']
        data.setdefault(case_id, {}).setdefault(version, []).append(r)
    except: pass

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

    for metric in ['turns', 'reads', 'writes', 'tools', 'sessions', 'dispatches', 'codeFileCount', 'durationSeconds']:
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
        comp_line += f"     {c}/{t}             "
    print(comp_line)

    # Show run dirs for inspection
    print(f"  {'runs':<18}", end="")
    for v in ver_list:
        dirs = [os.path.basename(r['runDir']) for r in versions[v]]
        print(f"  {', '.join(dirs)[:40]}", end="")
    print()

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
    a = sum(all_data[ver_list[0]])/len(all_data[ver_list[0]])
    b = sum(all_data[ver_list[1]])/len(all_data[ver_list[1]])
    print(f"  Delta: {(b-a)/a*100:+.0f}%")

# Save report JSON
report = {'generated': sys.argv[0], 'cases': {}}
for case_id, versions in data.items():
    report['cases'][case_id] = {}
    for v, runs in versions.items():
        report['cases'][case_id][v] = runs
report_path = Path(sys.argv[1]).parent / 'report.json'
with open(report_path, 'w') as f:
    json.dump(report, f, indent=2)
print(f"\n  Report saved: {report_path}")
PYEOF
}

# ─── CLI ───

case "${1:-}" in
  --suite)
    echo "============================================="
    echo " Tycono Benchmark Suite v2"
    echo " $(date -u +%Y-%m-%dT%H:%M:%SZ)"
    echo " Runs preserved in: $RUNS_DIR"
    echo "============================================="
    for case_id in $(python3 -c "import json; print(' '.join(sorted(json.load(open('$CASES_FILE')).keys())))"); do
      for version in $VERSIONS; do
        for run in $(seq 1 $RUNS); do
          run_single "$case_id" "$version" "$run" || echo "  [WARN] Failed, continuing..."
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
    echo "Tycono Benchmark Runner v2"
    echo ""
    echo "Usage:"
    echo "  $0 --suite                                    # Full suite"
    echo "  $0 --report                                   # Report from runs/"
    echo "  $0 --case C1 --version 0.2.10 --run 1         # Single run"
    echo ""
    echo "Runs preserved in: $RUNS_DIR/{case}-{version}-run{n}/"
    echo "  code/        — 산출물 코드"
    echo "  .tycono/     — activity-streams, boards, benchmarks"
    echo "  result.json  — 메트릭"
    ;;
esac
