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
import json, sys, urllib.request, os, subprocess

case_id, version, run_num, wave_id, completed, duration, result_file, port, run_dir = sys.argv[1:10]

# --- Events ---
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

# --- Tokens & Cost (from msg:done events) ---
input_tokens = 0
output_tokens = 0
cache_read_tokens = 0
model_name = ''
for e in events:
    if e.get('type') == 'msg:done':
        tokens = e.get('data', {}).get('tokens', {})
        input_tokens += tokens.get('input', 0)
        output_tokens += tokens.get('output', 0)
        cache_read_tokens += tokens.get('cacheRead', 0) or tokens.get('cache_read', 0) or 0
    if not model_name and e.get('data', {}).get('model'):
        model_name = e['data']['model']

# Estimate cost (Sonnet pricing: $3/M input, $15/M output, $0.30/M cache read)
cost_input = input_tokens * 3.0 / 1_000_000
cost_output = output_tokens * 15.0 / 1_000_000
cost_cache = cache_read_tokens * 0.3 / 1_000_000
estimated_cost = cost_input + cost_output + cost_cache

# --- Code Quality ---
code_dir = os.path.join(run_dir, 'code')
code_files = []
code_lines = 0
for root, dirs, files in os.walk(code_dir):
    dirs[:] = [d for d in dirs if d not in ('.git', 'node_modules', 'dist', '.worktrees')]
    for f in files:
        fpath = os.path.join(root, f)
        code_files.append(os.path.relpath(fpath, code_dir))
        try:
            with open(fpath, 'r', errors='ignore') as fh:
                code_lines += sum(1 for _ in fh)
        except: pass

# Check for index.html or entry point
has_index = any(f.endswith('index.html') for f in code_files)
has_package = any(f.endswith('package.json') for f in code_files)

# Try npm install + build (quick check, 30s timeout)
build_success = False
if has_package:
    try:
        pkg_dir = code_dir
        # Find package.json location
        for f in code_files:
            if f == 'package.json':
                pkg_dir = code_dir
                break
            elif f.endswith('/package.json'):
                pkg_dir = os.path.join(code_dir, os.path.dirname(f))
                break
        r = subprocess.run(['npm', 'install', '--silent'], cwd=pkg_dir, capture_output=True, timeout=30)
        build_success = r.returncode == 0
    except: pass
elif has_index:
    build_success = True  # Static HTML, no build needed

result = {
    'case': case_id,
    'version': version,
    'run': int(run_num),
    'waveId': wave_id,
    'completed': completed == 'true',
    'durationSeconds': int(duration),
    'model': model_name or 'unknown',
    # Efficiency
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
    # Cost
    'inputTokens': input_tokens,
    'outputTokens': output_tokens,
    'cacheReadTokens': cache_read_tokens,
    'estimatedCost': round(estimated_cost, 2),
    # Quality
    'codeFiles': code_files,
    'codeFileCount': len(code_files),
    'codeLines': code_lines,
    'hasIndex': has_index,
    'buildSuccess': build_success,
    'runDir': run_dir,
}

with open(result_file, 'w') as f:
    json.dump(result, f, indent=2)

print(f'  Turns: {turns} | Reads: {reads} | Tools: {tools} | Files: {len(code_files)} ({code_lines} lines)')
print(f'  Tokens: {input_tokens}in/{output_tokens}out | Cost: ${estimated_cost:.2f} | Build: {"OK" if build_success else "FAIL"}')
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
all_runs = []

for run_dir in sorted(runs_dir.iterdir()):
    if not run_dir.is_dir(): continue
    result_file = run_dir / 'result.json'
    if not result_file.exists(): continue
    try:
        r = json.loads(result_file.read_text())
        if 'error' in r: continue
        all_runs.append(r)
    except: pass

if not all_runs:
    print("  No results found.")
    sys.exit(0)

# ── Part 1: Individual Results ──
print("\n  ═══ Individual Run Results ═══")
for r in sorted(all_runs, key=lambda x: f"{x['case']}-{x['version']}-{x['run']}"):
    run_name = f"{r['case']}-{r['version']}-run{r['run']}"
    status = "✅ completed" if r.get('completed') else "⏱ timeout"
    build = "✅" if r.get('buildSuccess') else "❌"

    print(f"\n  ── {run_name} ──")
    print(f"  Status:   {status:<20} Duration:  {r.get('durationSeconds',0)}s")
    print(f"  Model:    {r.get('model','unknown')}")
    print(f"  Turns:    {r.get('turns',0):<8} Sessions:  {r.get('sessions',0)}")
    print(f"  Reads:    {r.get('reads',0):<8} Writes:    {r.get('writes',0):<8} Tools:     {r.get('tools',0)}")
    print(f"  Dispatch: {r.get('dispatches',0):<8} Errors:    {r.get('errors',0)}")

    it = r.get('inputTokens', 0)
    ot = r.get('outputTokens', 0)
    ct = r.get('cacheReadTokens', 0)
    cost = r.get('estimatedCost', 0)
    print(f"  Tokens:   {it:,}in / {ot:,}out / {ct:,}cache")
    print(f"  Cost:     ${cost:.2f}")

    fc = r.get('codeFileCount', 0)
    lc = r.get('codeLines', 0)
    print(f"  Files:    {fc:<8} Lines:     {lc:<8} Build:     {build}")

    rt = r.get('roleTurns', {})
    if rt:
        parts = [f"{role}({t})" for role, t in sorted(rt.items())]
        print(f"  Roles:    {' '.join(parts)}")

    print(f"  Dir:      {os.path.basename(r.get('runDir',''))}/")

# ── Part 2: Comparison ──
data = {}
for r in all_runs:
    data.setdefault(r['case'], {}).setdefault(r['version'], []).append(r)

print("\n\n  ═══ Comparison ═══")

def avg_std(vals):
    if not vals: return 0, 0
    a = sum(vals) / len(vals)
    s = (sum((x - a)**2 for x in vals) / len(vals))**0.5 if len(vals) > 1 else 0
    return a, s

for case_id, versions in sorted(data.items()):
    print(f"\n  ── {case_id} ──")
    ver_list = sorted(versions.keys())

    header = f"  {'Metric':<18}"
    for v in ver_list:
        header += f"  {v:>16} (N={len(versions[v])})"
    if len(ver_list) == 2: header += f"  {'Delta':>8}"
    print(header)

    metrics = [
        ('turns', 'EFFICIENCY'),
        ('reads', None), ('tools', None), ('sessions', None),
        ('dispatches', None), ('durationSeconds', None),
        ('inputTokens', 'COST'), ('outputTokens', None),
        ('cacheReadTokens', None), ('estimatedCost', None),
        ('codeFileCount', 'QUALITY'), ('codeLines', None),
    ]

    last_section = None
    for metric, section in metrics:
        if section and section != last_section:
            print(f"  --- {section} ---")
            last_section = section

        line = f"  {metric:<18}"
        avgs = []
        for v in ver_list:
            vals = [r.get(metric, 0) for r in versions[v]]
            a, s = avg_std(vals)
            avgs.append(a)
            if metric == 'estimatedCost':
                line += f"  ${a:>7.2f} ±{s:>4.2f}    "
            elif a >= 10000:
                line += f"  {a/1000:>6.0f}k ±{s/1000:>3.0f}k    "
            else:
                line += f"  {a:>8.0f} ±{s:>4.0f}    "
        if len(avgs) == 2 and avgs[0] > 0:
            delta = (avgs[1] - avgs[0]) / avgs[0] * 100
            line += f"  {delta:>+6.0f}%"
        print(line)

    # Build/completion rates
    for label, key in [('completed', 'completed'), ('buildSuccess', 'buildSuccess')]:
        line = f"  {label:<18}"
        for v in ver_list:
            ok = sum(1 for r in versions[v] if r.get(key))
            tot = len(versions[v])
            line += f"     {ok}/{tot}             "
        print(line)

# ── Part 3: Overall ──
print("\n  ═══ Overall ═══")
all_by_ver = {}
for r in all_runs:
    all_by_ver.setdefault(r['version'], []).append(r)

ver_list = sorted(all_by_ver.keys())
header = f"  {'Metric':<18}"
for v in ver_list:
    header += f"  {v:>16} (N={len(all_by_ver[v])})"
if len(ver_list) == 2: header += f"  {'Delta':>8}"
print(header)

for metric in ['turns', 'reads', 'estimatedCost', 'codeLines']:
    line = f"  {metric:<18}"
    avgs = []
    for v in ver_list:
        vals = [r.get(metric, 0) for r in all_by_ver[v]]
        a, s = avg_std(vals)
        avgs.append(a)
        if metric == 'estimatedCost':
            line += f"  ${a:>7.2f} ±{s:>4.2f}    "
        else:
            line += f"  {a:>8.0f} ±{s:>4.0f}    "
    if len(avgs) == 2 and avgs[0] > 0:
        delta = (avgs[1] - avgs[0]) / avgs[0] * 100
        line += f"  {delta:>+6.0f}%"
    print(line)

# Save report JSON
report_path = Path(sys.argv[1]).parent / 'report.json'
with open(report_path, 'w') as f:
    json.dump({'runs': all_runs}, f, indent=2)
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
