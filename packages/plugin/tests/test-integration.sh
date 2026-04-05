#!/bin/bash

# Integration Tests — real server, deterministic API calls (no LLM)
# Tests server lifecycle, API contracts, hook behavior.
# Requires: tycono-server installed (npm -g or npx)

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PLUGIN_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

PASS=0
FAIL=0
SKIP=0
TEST_DIR=""
SERVER_PID=""
PORT=""
API_URL=""

assert_contains() {
  local label="$1"
  local haystack="$2"
  local needle="$3"
  if echo "$haystack" | grep -q "$needle"; then
    echo "  [PASS] $label"
    PASS=$((PASS + 1))
  else
    echo "  [FAIL] $label — expected: $needle"
    echo "  [DEBUG] $(echo "$haystack" | head -3)"
    FAIL=$((FAIL + 1))
  fi
}

assert_eq() {
  local label="$1"
  local actual="$2"
  local expected="$3"
  if [[ "$actual" == "$expected" ]]; then
    echo "  [PASS] $label"
    PASS=$((PASS + 1))
  else
    echo "  [FAIL] $label — got: $actual, expected: $expected"
    FAIL=$((FAIL + 1))
  fi
}

assert_http() {
  local label="$1"
  local method="$2"
  local url="$3"
  local expected_status="$4"
  local body="${5:-}"

  local args=(-s -o /dev/null -w "%{http_code}" --max-time 5)
  [[ "$method" != "GET" ]] && args+=(-X "$method")
  [[ -n "$body" ]] && args+=(-H "Content-Type: application/json" -d "$body")

  local status
  status=$(curl "${args[@]}" "$url" 2>/dev/null || echo "000")

  if [[ "$status" == "$expected_status" ]]; then
    echo "  [PASS] $label (HTTP $status)"
    PASS=$((PASS + 1))
  else
    echo "  [FAIL] $label — got HTTP $status, expected $expected_status"
    FAIL=$((FAIL + 1))
  fi
}

cleanup() {
  if [[ -n "$SERVER_PID" ]] && kill -0 "$SERVER_PID" 2>/dev/null; then
    kill -- -"$SERVER_PID" 2>/dev/null || kill "$SERVER_PID" 2>/dev/null || true
    wait "$SERVER_PID" 2>/dev/null || true
  fi
  if [[ -n "$TEST_DIR" ]] && [[ -d "$TEST_DIR" ]]; then
    # Kill any server found in headless.json
    if [[ -f "$TEST_DIR/.tycono/headless.json" ]]; then
      local hpid
      hpid=$(python3 -c "import json; print(json.load(open('$TEST_DIR/.tycono/headless.json')).get('pid',''))" 2>/dev/null || echo "")
      if [[ -n "$hpid" ]] && kill -0 "$hpid" 2>/dev/null; then
        kill -- -"$hpid" 2>/dev/null || kill "$hpid" 2>/dev/null || true
      fi
    fi
    rm -rf "$TEST_DIR" 2>/dev/null || true
  fi
  SERVER_PID=""
  TEST_DIR=""
}

start_server() {
  TEST_DIR=$(mktemp -d)
  mkdir -p "$TEST_DIR/knowledge"
  echo "# Test" > "$TEST_DIR/knowledge/CLAUDE.md"
  mkdir -p "$TEST_DIR/.tycono"

  # Use local server package if available, otherwise npx
  local SERVER_PKG="${PLUGIN_ROOT}/../server"

  cd "$TEST_DIR"
  if [[ -f "${SERVER_PKG}/bin/cli.js" ]]; then
    echo "  [INFO] Using local dev server"
    COMPANY_ROOT="$TEST_DIR" node "${SERVER_PKG}/bin/cli.js" &
  elif command -v tycono-server &>/dev/null; then
    tycono-server &
  elif command -v npx &>/dev/null; then
    npx tycono-server@latest &
  else
    echo "  [SKIP] tycono-server not available"
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

  echo "  [FAIL] Server did not start within 60s"
  return 1
}

# =============================================================================
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "I-01: Server health + status"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

trap cleanup EXIT

if start_server; then
  echo "  [INFO] Server ready: $API_URL"

  assert_http "GET /api/health" GET "${API_URL}/api/health" "200"
  assert_http "GET /api/status" GET "${API_URL}/api/status" "200"

  # Verify JSON contract
  HEALTH=$(curl -s "${API_URL}/api/health")
  assert_contains "health has status:ok" "$HEALTH" '"status":"ok"'

  STATUS=$(curl -s "${API_URL}/api/status")
  assert_contains "status has companyRoot" "$STATUS" "companyRoot"
  assert_contains "status has engine" "$STATUS" "engine"
else
  SKIP=$((SKIP + 5))
fi

# =============================================================================
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "I-02: Wave preview API"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

if [[ -n "$API_URL" ]]; then
  PREVIEW=$(curl -s -X POST "${API_URL}/api/jobs/preview" \
    -H "Content-Type: application/json" \
    -d '{"directive":"test","type":"wave"}' 2>/dev/null)

  assert_contains "preview has team" "$PREVIEW" "team"
  assert_contains "preview has totalAgents" "$PREVIEW" "totalAgents"
  assert_contains "preview has estimatedCostPerRound" "$PREVIEW" "estimatedCostPerRound"
  assert_contains "preview has availableModels" "$PREVIEW" "availableModels"

  # Continuous mode
  PREVIEW_C=$(curl -s -X POST "${API_URL}/api/jobs/preview" \
    -H "Content-Type: application/json" \
    -d '{"directive":"test","type":"wave","continuous":true}' 2>/dev/null)
  assert_contains "continuous mode in preview" "$PREVIEW_C" '"continuous":true'
else
  echo "  [SKIP] No server"
  SKIP=$((SKIP + 5))
fi

# =============================================================================
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "I-03: Board CRUD API"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

BOARD_WAVE="wave-integration-test-$$"
if [[ -n "$API_URL" ]]; then
  # 404 when no board
  assert_http "GET board (404)" GET "${API_URL}/api/waves/${BOARD_WAVE}/board" "404"

  # Create board
  assert_http "POST create board (201)" POST "${API_URL}/api/waves/${BOARD_WAVE}/board" "201" \
    "{\"directive\":\"test\",\"tasks\":[{\"id\":\"t1\",\"title\":\"task1\",\"assignee\":\"cto\",\"status\":\"waiting\",\"dependsOn\":[]},{\"id\":\"t2\",\"title\":\"task2\",\"assignee\":\"engineer\",\"status\":\"waiting\",\"dependsOn\":[\"t1\"]}]}"

  # Get board
  BOARD=$(curl -s "${API_URL}/api/waves/${BOARD_WAVE}/board")
  assert_contains "board has waveId" "$BOARD" "$BOARD_WAVE"
  assert_contains "board has 2 tasks" "$BOARD" '"id":"t2"'

  # Duplicate create → 409
  assert_http "POST duplicate (409)" POST "${API_URL}/api/waves/${BOARD_WAVE}/board" "409" \
    "{\"directive\":\"dup\",\"tasks\":[{\"id\":\"x\",\"title\":\"x\",\"assignee\":\"x\",\"status\":\"waiting\",\"dependsOn\":[]}]}"

  # Claim task (waiting → running)
  assert_http "PATCH claim task (200)" PATCH "${API_URL}/api/waves/${BOARD_WAVE}/board/tasks/t1" "200" \
    "{\"status\":\"running\"}"

  # Invalid transition (running → waiting)
  assert_http "PATCH invalid transition (400)" PATCH "${API_URL}/api/waves/${BOARD_WAVE}/board/tasks/t1" "400" \
    "{\"status\":\"waiting\"}"

  # Complete task
  assert_http "POST complete task (200)" POST "${API_URL}/api/waves/${BOARD_WAVE}/board/tasks/t1/complete" "200" \
    "{\"result\":\"pass\",\"note\":\"done\"}"

  # Verify history
  BOARD_AFTER=$(curl -s "${API_URL}/api/waves/${BOARD_WAVE}/board")
  assert_contains "history recorded" "$BOARD_AFTER" '"result":"pass"'

  # Update task content
  assert_http "PATCH update content (200)" PATCH "${API_URL}/api/waves/${BOARD_WAVE}/board/tasks/t2" "200" \
    "{\"title\":\"updated task\"}"

  # Add task
  assert_http "POST add task (201)" POST "${API_URL}/api/waves/${BOARD_WAVE}/board/tasks" "201" \
    "{\"id\":\"t3\",\"title\":\"new task\",\"assignee\":\"qa\",\"dependsOn\":[\"t2\"]}"

  # Verify final state
  BOARD_FINAL=$(curl -s "${API_URL}/api/waves/${BOARD_WAVE}/board")
  assert_contains "3 tasks total" "$BOARD_FINAL" '"id":"t3"'
else
  echo "  [SKIP] No server"
  SKIP=$((SKIP + 10))
fi

# =============================================================================
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "I-04: PreToolUse hook behavior"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

WAVE_CONFIRM="${PLUGIN_ROOT}/hooks/wave-confirm.sh"
if [[ -f "$WAVE_CONFIRM" ]]; then
  # Run from a safe directory (avoid getcwd errors from cleaned-up dirs)
  cd /tmp

  # Block without --confirmed
  HOOK_INPUT='{"tool_name":"Bash","tool_input":{"command":"start-wave.sh \"build a game\""}}'
  HOOK_OUTPUT=$(echo "$HOOK_INPUT" | "$WAVE_CONFIRM" 2>&1) || HOOK_EXIT=$?
  HOOK_EXIT=${HOOK_EXIT:-0}

  assert_eq "blocks without --confirmed (exit 2)" "$HOOK_EXIT" "2"
  assert_contains "block mentions --confirmed" "$HOOK_OUTPUT" "\-\-confirmed"

  # Allow with --confirmed
  HOOK_INPUT2='{"tool_name":"Bash","tool_input":{"command":"start-wave.sh --confirmed \"build a game\""}}'
  echo "$HOOK_INPUT2" | "$WAVE_CONFIRM" >/dev/null 2>&1
  HOOK_EXIT2=$?
  assert_eq "allows with --confirmed (exit 0)" "$HOOK_EXIT2" "0"

  # Ignore non-wave commands
  HOOK_INPUT3='{"tool_name":"Bash","tool_input":{"command":"ls -la"}}'
  echo "$HOOK_INPUT3" | "$WAVE_CONFIRM" >/dev/null 2>&1
  assert_eq "ignores non-wave (exit 0)" "$?" "0"

  # Ignore non-Bash tools
  HOOK_INPUT4='{"tool_name":"Read","tool_input":{"file_path":"/tmp/test"}}'
  echo "$HOOK_INPUT4" | "$WAVE_CONFIRM" >/dev/null 2>&1
  assert_eq "ignores non-Bash tool (exit 0)" "$?" "0"
else
  echo "  [SKIP] wave-confirm.sh not found"
  SKIP=$((SKIP + 4))
fi

# =============================================================================
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "I-05: Agency list API"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

if [[ -n "$API_URL" ]]; then
  AGENCIES=$(curl -s "${API_URL}/api/presets" 2>/dev/null)
  # Count agencies from JSON (not from LLM response)
  AGENCY_COUNT=$(echo "$AGENCIES" | python3 -c "import sys,json; data=json.load(sys.stdin); print(len(data) if isinstance(data, list) else len(data.get('presets',data.get('agencies',[]))))" 2>/dev/null || echo "0")

  if [[ "$AGENCY_COUNT" -gt 0 ]]; then
    echo "  [PASS] Agency list returns $AGENCY_COUNT agencies"
    PASS=$((PASS + 1))
  else
    echo "  [FAIL] Agency list returned 0 agencies"
    FAIL=$((FAIL + 1))
  fi
else
  echo "  [SKIP] No server"
  SKIP=$((SKIP + 1))
fi

# =============================================================================
# Cleanup + Summary
cleanup
trap - EXIT

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
TOTAL=$((PASS + FAIL + SKIP))
echo "Integration: $PASS passed, $FAIL failed, $SKIP skipped (total $TOTAL)"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

[[ $FAIL -eq 0 ]]
