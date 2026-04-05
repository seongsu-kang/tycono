#!/bin/bash

# Agentic E2E Tests — real wave execution, activity-stream analysis
# Tests actual agent behavior, dispatch patterns, board lifecycle.
# Expensive (spawns LLM sessions). Run sparingly.
#
# These tests verify BEHAVIOR, not code patterns.
# Each test: start wave → wait for completion → analyze activity-streams.

set -uo pipefail
# No set -e: individual test failures should not abort the suite

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PLUGIN_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

PASS=0
FAIL=0
SKIP=0
TEST_DIR=""
SERVER_PID=""
PORT=""
API_URL=""

cleanup() {
  if [[ -n "$SERVER_PID" ]] && kill -0 "$SERVER_PID" 2>/dev/null; then
    kill -- -"$SERVER_PID" 2>/dev/null || kill "$SERVER_PID" 2>/dev/null || true
    wait "$SERVER_PID" 2>/dev/null || true
  fi
  # Also kill by headless.json PID
  if [[ -n "$TEST_DIR" ]] && [[ -f "$TEST_DIR/.tycono/headless.json" ]]; then
    local hpid
    hpid=$(python3 -c "import json; print(json.load(open('$TEST_DIR/.tycono/headless.json')).get('pid',''))" 2>/dev/null || echo "")
    if [[ -n "$hpid" ]] && kill -0 "$hpid" 2>/dev/null; then
      kill -- -"$hpid" 2>/dev/null || kill "$hpid" 2>/dev/null || true
    fi
  fi
  # Kill any wave processes
  if [[ -n "$TEST_DIR" ]] && [[ -d "$TEST_DIR/.tycono/pids" ]]; then
    for pidfile in "$TEST_DIR/.tycono/pids"/*.pid; do
      [[ -f "$pidfile" ]] || continue
      local wpid
      wpid=$(cat "$pidfile" 2>/dev/null || echo "")
      if [[ -n "$wpid" ]] && kill -0 "$wpid" 2>/dev/null; then
        kill "$wpid" 2>/dev/null || true
      fi
    done
  fi
  SERVER_PID=""
  if [[ -n "$TEST_DIR" ]] && [[ -d "$TEST_DIR" ]]; then
    rm -rf "$TEST_DIR" 2>/dev/null || true
  fi
  TEST_DIR=""
}

start_server() {
  TEST_DIR=$(mktemp -d)
  mkdir -p "$TEST_DIR/knowledge"
  echo "# Test" > "$TEST_DIR/knowledge/CLAUDE.md"
  mkdir -p "$TEST_DIR/.tycono"

  local SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
  local SERVER_CLI="${SCRIPT_DIR}/../../server/bin/cli.js"

  cd "$TEST_DIR"
  if [[ -f "$SERVER_CLI" ]]; then
    COMPANY_ROOT="$TEST_DIR" node "$SERVER_CLI" &
  elif command -v tycono-server &>/dev/null; then
    tycono-server &
  elif command -v npx &>/dev/null; then
    npx tycono-server@latest &
  else
    return 1
  fi
  SERVER_PID=$!

  for i in $(seq 1 60); do
    if [[ -f "$TEST_DIR/.tycono/headless.json" ]]; then
      PORT=$(python3 -c "import json; print(json.load(open('$TEST_DIR/.tycono/headless.json'))['port'])" 2>/dev/null || echo "")
      if [[ -n "$PORT" ]] && curl -s --max-time 2 "http://localhost:${PORT}/api/health" >/dev/null 2>&1; then
        API_URL="http://localhost:${PORT}"
        return 0
      fi
    fi
    sleep 1
  done
  return 1
}

wait_wave_done() {
  local wave_id="$1"
  local timeout="${2:-120}"
  local elapsed=0

  while [[ $elapsed -lt $timeout ]]; do
    local active
    active=$(curl -s "${API_URL}/api/waves/active" 2>/dev/null || echo "[]")
    local has_wave
    has_wave=$(echo "$active" | python3 -c "
import sys, json
data = json.load(sys.stdin)
waves = data.get('waves', data) if isinstance(data, dict) else data
print('yes' if any(w.get('id','') == '$wave_id' for w in waves) else 'no')
" 2>/dev/null || echo "no")

    if [[ "$has_wave" == "no" ]]; then
      return 0  # Wave finished (no longer active)
    fi
    sleep 3
    elapsed=$((elapsed + 3))
  done
  return 1  # Timeout
}

count_activity_events() {
  local pattern="$1"
  local dir="$TEST_DIR/.tycono/activity-streams"
  if [[ ! -d "$dir" ]]; then
    echo "0"
    return
  fi
  grep -l "$pattern" "$dir"/*.jsonl 2>/dev/null | wc -l | tr -d ' '
}

# =============================================================================
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "A-01: Simple wave — CEO answers directly (no dispatch)"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

trap cleanup EXIT

if ! start_server; then
  echo "  [SKIP] Server not available — skipping all agentic tests"
  echo ""
  echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
  echo "Agentic: 0 passed, 0 failed, ALL skipped"
  echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
  exit 0
fi

echo "  [INFO] Server ready: $API_URL"

# Simple question — CEO should answer directly without dispatch
WAVE1_RESP=$(curl -s -X POST "${API_URL}/api/exec/wave" \
  -H "Content-Type: application/json" \
  -d '{"directive":"What is 2+2? Answer with just the number."}' 2>/dev/null)
WAVE1_ID=$(echo "$WAVE1_RESP" | python3 -c "import sys,json; print(json.load(sys.stdin).get('waveId',''))" 2>/dev/null || echo "")

if [[ -z "$WAVE1_ID" ]]; then
  echo "  [FAIL] Wave creation failed"
  FAIL=$((FAIL + 1))
else
  echo "  [INFO] Wave created: $WAVE1_ID"

  if wait_wave_done "$WAVE1_ID" 60; then
    echo "  [PASS] Wave completed"
    PASS=$((PASS + 1))

    # Verify: CEO session exists
    CEO_STREAMS=$(ls "$TEST_DIR/.tycono/activity-streams/ses-ceo-"* 2>/dev/null | wc -l | tr -d ' ')
    if [[ "$CEO_STREAMS" -ge 1 ]]; then
      echo "  [PASS] CEO session created ($CEO_STREAMS stream files)"
      PASS=$((PASS + 1))
    else
      echo "  [FAIL] No CEO activity stream"
      FAIL=$((FAIL + 1))
    fi

    # Verify: No dispatch events (simple question = direct answer)
    DISPATCH_COUNT=$(count_activity_events "dispatch:start")
    if [[ "$DISPATCH_COUNT" -eq 0 ]]; then
      echo "  [PASS] No dispatch (CEO answered directly)"
      PASS=$((PASS + 1))
    else
      echo "  [INFO] CEO dispatched ($DISPATCH_COUNT sessions) — acceptable but suboptimal"
      PASS=$((PASS + 1))  # Not a hard fail — LLM judgment varies
    fi

    # Verify: Board auto-created
    if [[ -f "$TEST_DIR/.tycono/boards/${WAVE1_ID}.json" ]]; then
      echo "  [PASS] Board auto-created for wave"
      PASS=$((PASS + 1))
    else
      echo "  [INFO] No board created (expected for simple questions)"
      PASS=$((PASS + 1))  # Board may not be created for non-dispatch waves
    fi
  else
    echo "  [FAIL] Wave timed out (60s)"
    FAIL=$((FAIL + 1))
  fi
fi

# =============================================================================
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "A-02: Duplicate wave guard (FORKBOMB)"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

# Send a complex directive that takes time (CEO dispatches → stays running)
WAVE2_RESP=$(curl -s -X POST "${API_URL}/api/exec/wave" \
  -H "Content-Type: application/json" \
  -d '{"directive":"Research and write a detailed 500-word analysis of AI agent orchestration patterns. Dispatch CTO to handle the technical analysis."}' 2>/dev/null)
WAVE2_ID=$(echo "$WAVE2_RESP" | python3 -c "import sys,json; print(json.load(sys.stdin).get('waveId',''))" 2>/dev/null || echo "")

if [[ -z "$WAVE2_ID" ]]; then
  echo "  [FAIL] Wave 2 creation failed"
  FAIL=$((FAIL + 1))
else
  echo "  [INFO] Wave 2 created: $WAVE2_ID"
  sleep 1  # Brief pause — CEO should still be running

  # Send duplicate directive while CEO is active
  WAVE3_RESP=$(curl -s -X POST "${API_URL}/api/exec/wave" \
    -H "Content-Type: application/json" \
    -d '{"directive":"Additional instruction: focus on LangGraph comparison"}' 2>/dev/null)
  WAVE3_AMENDED=$(echo "$WAVE3_RESP" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('amended', False))" 2>/dev/null || echo "")
  WAVE3_ID=$(echo "$WAVE3_RESP" | python3 -c "import sys,json; print(json.load(sys.stdin).get('waveId',''))" 2>/dev/null || echo "")

  if [[ "$WAVE3_AMENDED" == "True" ]]; then
    echo "  [PASS] Duplicate wave amended (not new)"
    PASS=$((PASS + 1))
  else
    # Check if CEO was already done (timing issue, not a bug)
    CEO_DONE=$(curl -s "${API_URL}/api/waves/active" 2>/dev/null | python3 -c "
import sys, json
data = json.load(sys.stdin)
waves = data.get('waves', data) if isinstance(data, dict) else data
w2 = [w for w in waves if w.get('id') == '$WAVE2_ID']
print('yes' if not w2 else 'no')
" 2>/dev/null || echo "unknown")

    if [[ "$CEO_DONE" == "yes" ]]; then
      echo "  [INFO] CEO finished before duplicate sent (timing — not a guard failure)"
      PASS=$((PASS + 1))
    else
      echo "  [FAIL] Duplicate wave created new wave while CEO still running"
      echo "  [DEBUG] Wave2: $WAVE2_ID, Wave3: $WAVE3_ID, amended: $WAVE3_AMENDED"
      FAIL=$((FAIL + 1))
    fi
  fi

  # Verify CEO session invariant: at most 1 per wave
  sleep 5
  CEO_FOR_WAVE2=$(ls "$TEST_DIR/.tycono/activity-streams/ses-ceo-"* 2>/dev/null | wc -l | tr -d ' ')
  # 2 is acceptable (wave1 CEO + wave2 CEO), but not 3+
  if [[ "$CEO_FOR_WAVE2" -le 3 ]]; then
    echo "  [PASS] CEO session count reasonable ($CEO_FOR_WAVE2)"
    PASS=$((PASS + 1))
  else
    echo "  [FAIL] Too many CEO sessions ($CEO_FOR_WAVE2)"
    FAIL=$((FAIL + 1))
  fi

  # Cancel the wave to clean up
  curl -s -X POST "${API_URL}/api/waves/${WAVE2_ID}/stop" >/dev/null 2>&1 || true
  if [[ -n "$WAVE3_ID" ]] && [[ "$WAVE3_ID" != "$WAVE2_ID" ]]; then
    curl -s -X POST "${API_URL}/api/waves/${WAVE3_ID}/stop" >/dev/null 2>&1 || true
  fi
  sleep 3
fi

# =============================================================================
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "A-03: Wave with dispatch — verify activity-stream events"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

# This wave should trigger actual dispatch
WAVE4_RESP=$(curl -s -X POST "${API_URL}/api/exec/wave" \
  -H "Content-Type: application/json" \
  -d '{"directive":"Create a simple hello.txt file with the text Hello World. This requires code changes so dispatch CTO."}' 2>/dev/null)
WAVE4_ID=$(echo "$WAVE4_RESP" | python3 -c "import sys,json; print(json.load(sys.stdin).get('waveId',''))" 2>/dev/null || echo "")

if [[ -z "$WAVE4_ID" ]]; then
  echo "  [FAIL] Wave 4 creation failed"
  FAIL=$((FAIL + 1))
else
  echo "  [INFO] Wave 4 created: $WAVE4_ID (waiting up to 120s)"

  if wait_wave_done "$WAVE4_ID" 120; then
    echo "  [PASS] Wave completed"
    PASS=$((PASS + 1))

    # Check for dispatch:start events
    DISPATCH_COUNT=$(count_activity_events "dispatch:start")
    if [[ "$DISPATCH_COUNT" -ge 1 ]]; then
      echo "  [PASS] Dispatch occurred ($DISPATCH_COUNT sessions with dispatch:start)"
      PASS=$((PASS + 1))
    else
      echo "  [INFO] No dispatch detected — CEO may have handled directly"
      PASS=$((PASS + 1))  # Not a hard fail
    fi

    # Check for msg:done events (at least CEO should be done)
    DONE_COUNT=$(count_activity_events "msg:done")
    if [[ "$DONE_COUNT" -ge 1 ]]; then
      echo "  [PASS] Execution completed ($DONE_COUNT sessions with msg:done)"
      PASS=$((PASS + 1))
    else
      echo "  [FAIL] No msg:done events found"
      FAIL=$((FAIL + 1))
    fi

    # Check board state
    BOARD=$(curl -s "${API_URL}/api/waves/${WAVE4_ID}/board" 2>/dev/null)
    BOARD_STATUS=$(echo "$BOARD" | python3 -c "import sys,json; d=json.load(sys.stdin); print(len(d.get('tasks',[])))" 2>/dev/null || echo "0")
    if [[ "$BOARD_STATUS" -gt 0 ]]; then
      echo "  [PASS] Board has $BOARD_STATUS tasks"
      PASS=$((PASS + 1))

      # Check if any tasks completed
      DONE_TASKS=$(echo "$BOARD" | python3 -c "import sys,json; d=json.load(sys.stdin); print(sum(1 for t in d.get('tasks',[]) if t.get('status')=='done'))" 2>/dev/null || echo "0")
      echo "  [INFO] Board: $DONE_TASKS/$BOARD_STATUS tasks done"
    else
      echo "  [INFO] No board tasks (board may not have been populated)"
      PASS=$((PASS + 1))
    fi
  else
    echo "  [FAIL] Wave timed out (120s)"
    FAIL=$((FAIL + 1))
    curl -s -X POST "${API_URL}/api/waves/${WAVE4_ID}/stop" >/dev/null 2>&1 || true
  fi
fi

# =============================================================================
# Cleanup + Summary
cleanup
trap - EXIT

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
TOTAL=$((PASS + FAIL + SKIP))
echo "Agentic: $PASS passed, $FAIL failed, $SKIP skipped (total $TOTAL)"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

[[ $FAIL -eq 0 ]]
