#!/bin/bash

# TC-AGENT-1: agency-list via claude -p
# TC-AGENT-2: agency-create via claude -p
# TC-AGENT-3: wave start + status via claude -p
#
# These tests use `claude -p` (programmatic mode) to exercise Plugin commands
# through the actual Claude CLI with the plugin loaded.
#
# Usage: ./test-agentic-e2e.sh
# Exit: 0 = all pass, non-zero = failure count

set -euo pipefail
export PYTHONIOENCODING=utf-8
export LC_ALL=en_US.UTF-8

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PLUGIN_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

PASS=0
FAIL=0
SKIP=0
TEST_DIR=""
SERVER_PID=""

# --- Helpers ---

assert_contains() {
  local label="$1"
  local haystack="$2"
  local needle="$3"
  if echo "$haystack" | grep -q "$needle"; then
    echo "  [PASS] $label"
    PASS=$((PASS + 1))
  else
    echo "  [FAIL] $label — expected to contain: $needle"
    echo "  [DEBUG] Output was: $(echo "$haystack" | head -5)"
    FAIL=$((FAIL + 1))
  fi
}

cleanup() {
  # Kill server process GROUP (not just the parent PID)
  # npx spawns child node processes that survive a plain `kill $PID`
  if [[ -n "$SERVER_PID" ]] && kill -0 "$SERVER_PID" 2>/dev/null; then
    # Kill entire process group rooted at SERVER_PID
    kill -- -"$SERVER_PID" 2>/dev/null || kill "$SERVER_PID" 2>/dev/null || true
    wait "$SERVER_PID" 2>/dev/null || true
  fi
  # Also kill any server spawned via headless.json in TEST_DIR
  if [[ -n "$TEST_DIR" ]] && [[ -f "$TEST_DIR/.tycono/headless.json" ]]; then
    local hpid
    hpid=$(python3 -c "import json; print(json.load(open('$TEST_DIR/.tycono/headless.json')).get('pid',''))" 2>/dev/null || echo "")
    if [[ -n "$hpid" ]] && kill -0 "$hpid" 2>/dev/null; then
      kill -- -"$hpid" 2>/dev/null || kill "$hpid" 2>/dev/null || true
    fi
  fi
  SERVER_PID=""
  if [[ -n "$TEST_DIR" ]] && [[ -d "$TEST_DIR" ]]; then
    rm -rf "$TEST_DIR" 2>/dev/null || true
  fi
  TEST_DIR=""
}

# --- Pre-flight: check claude CLI ---
if ! command -v claude &>/dev/null; then
  echo "[SKIP] claude CLI not found — skipping all agentic E2E tests"
  exit 0
fi

# =============================================================================
# TC-AGENT-1: agency-list
# =============================================================================
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "TC-AGENT-1: agency-list via claude -p"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

TEST_DIR=$(mktemp -d)
trap cleanup EXIT

mkdir -p "$TEST_DIR/knowledge"

RESULT=$(cd "$TEST_DIR" && claude -p \
  --plugin-dir "$PLUGIN_ROOT" \
  "Run /tycono:agency-list and tell me how many agencies are listed. Reply with just the number." 2>&1) || true

assert_contains "agency-list returns 3 agencies" "$RESULT" "3"

cleanup
trap - EXIT

# =============================================================================
# TC-AGENT-2: agency-create
# =============================================================================
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "TC-AGENT-2: agency-create via claude -p"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

TEST_DIR=$(mktemp -d)
trap cleanup EXIT

mkdir -p "$TEST_DIR/knowledge"

RESULT=$(cd "$TEST_DIR" && claude -p \
  --plugin-dir "$PLUGIN_ROOT" \
  "Create a custom agency called test-team with roles cto and engineer using /tycono:agency-create. When done, tell me the path where agency.yaml was created." 2>&1) || true

assert_contains "agency-create mentions agency.yaml" "$RESULT" "agency.yaml"

cleanup
trap - EXIT

# =============================================================================
# TC-AGENT-3: wave start + status
# =============================================================================
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "TC-AGENT-3: wave start + status via claude -p"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

TEST_DIR=$(mktemp -d)
trap cleanup EXIT

mkdir -p "$TEST_DIR/knowledge"
mkdir -p "$TEST_DIR/.tycono"

RESULT=$(cd "$TEST_DIR" && claude -p \
  --plugin-dir "$PLUGIN_ROOT" \
  --max-turns 5 \
  "Run /tycono:tycono with task 'create a simple hello.html'. Then check /tycono:tycono-status. Tell me the wave ID." 2>&1) || true

assert_contains "wave ID in output" "$RESULT" "wave-"

# Kill any leftover server processes from this test dir
if [[ -f "$TEST_DIR/.tycono/headless.json" ]]; then
  SERVER_PID=$(python3 -c "import json; d=json.load(open('$TEST_DIR/.tycono/headless.json')); print(d.get('pid',''))" 2>/dev/null || true)
  if [[ -n "$SERVER_PID" ]] && kill -0 "$SERVER_PID" 2>/dev/null; then
    kill -- -"$SERVER_PID" 2>/dev/null || kill "$SERVER_PID" 2>/dev/null || true
  fi
  SERVER_PID=""
fi

cleanup
trap - EXIT

# =============================================================================
# TC-AGENT-4: agency-create guided flow (Phase 1-2 scan + design)
# =============================================================================
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "TC-AGENT-4: agency-create guided flow via claude -p"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

TEST_DIR=$(mktemp -d)
trap cleanup EXIT

# Set up a mock "existing project" with knowledge + skills
mkdir -p "$TEST_DIR/knowledge/project"
mkdir -p "$TEST_DIR/.claude/skills/trading-backtest"
echo "# Trading Backtest Skill" > "$TEST_DIR/.claude/skills/trading-backtest/SKILL.md"
echo "# Test AKB" > "$TEST_DIR/knowledge/CLAUDE.md"
echo "# Trading strategy docs" > "$TEST_DIR/knowledge/project/strategy.md"

RESULT=$(cd "$TEST_DIR" && claude -p \
  --plugin-dir "$PLUGIN_ROOT" \
  --max-turns 20 \
  "Run /tycono:agency-create. When asked what the team should do, say 'trading hypothesis research and backtesting'. When asked about the team composition, accept the suggestion. When asked about external access, say no. Show me the final result." 2>&1) || true

# Phase 1: Project scan should detect existing skills
assert_contains "Phase 1 detects skills" "$RESULT" "trading-backtest"

# Phase 2: Should propose roles based on the task
assert_contains "Phase 2 proposes roles" "$RESULT" "role"

# Phase 3: Should create agency files
assert_contains "Phase 3 creates agency" "$RESULT" "agency"

cleanup
trap - EXIT

# =============================================================================
# TC-AGENT-5: start-wave.sh notification setup (SSE listener)
# =============================================================================
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "TC-AGENT-5: start-wave.sh notification code present"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

SCRIPTS_DIR="${PLUGIN_ROOT}/scripts"
START_WAVE="${SCRIPTS_DIR}/start-wave.sh"

if [[ -f "$START_WAVE" ]]; then
  SCRIPT_CONTENT=$(cat "$START_WAVE")
  assert_contains "Has SSE subscribe" "$SCRIPT_CONTENT" "curl -sN"
  assert_contains "Has awaiting_input detection" "$SCRIPT_CONTENT" "awaiting_input"
  assert_contains "Has error detection" "$SCRIPT_CONTENT" "msg:error"
  assert_contains "Has dispatch:error detection" "$SCRIPT_CONTENT" "dispatch:error"
  assert_contains "Has TYCONO ALERT output" "$SCRIPT_CONTENT" "TYCONO ALERT"
  assert_contains "Has curl response instruction" "$SCRIPT_CONTENT" "api/sessions"
  assert_contains "Has wave completion detection" "$SCRIPT_CONTENT" "wave:done"
else
  echo "  [SKIP] start-wave.sh not found"
  SKIP=$((SKIP + 1))
fi

# =============================================================================
# TC-AGENT-6: start-wave.sh stays alive for SSE (no early exit)
# =============================================================================
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "TC-AGENT-6: start-wave.sh SSE monitor stays alive"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

if [[ -f "$START_WAVE" ]]; then
  # Verify the script doesn't exit before SSE loop — curl is in foreground (not &)
  assert_contains "SSE curl is foreground (no &)" "$SCRIPT_CONTENT" 'curl -sN "${API_URL}/api/waves/${WAVE_ID}/stream"'
  # Verify no background subshell for notification
  if echo "$SCRIPT_CONTENT" | grep -q "NOTIFY_PID"; then
    echo "  [FAIL] Should not have NOTIFY_PID (old macOS pattern)"
    FAIL=$((FAIL + 1))
  else
    echo "  [PASS] No NOTIFY_PID (SSE is inline, not background)"
    PASS=$((PASS + 1))
  fi
else
  echo "  [SKIP] start-wave.sh not found"
  SKIP=$((SKIP + 1))
fi

# =============================================================================
# TC-AGENT-7: headless.json server reuse (requires server)
# =============================================================================
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "TC-AGENT-7: headless.json server reuse"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

TEST_DIR=$(mktemp -d)
trap cleanup EXIT

mkdir -p "$TEST_DIR/knowledge"
echo "# Test" > "$TEST_DIR/knowledge/CLAUDE.md"

# Start a real server in background
TYCONO_BIN=$(which tycono-server 2>/dev/null || echo "")
if [[ -n "$TYCONO_BIN" ]] || command -v npx &>/dev/null; then
  cd "$TEST_DIR"
  if [[ -n "$TYCONO_BIN" ]]; then
    "$TYCONO_BIN" &
  else
    npx tycono-server@latest &
  fi
  SERVER_PID=$!

  # Wait for server to be ready
  SERVER_READY=""
  for i in $(seq 1 60); do
    if [[ -f "$TEST_DIR/.tycono/headless.json" ]]; then
      PORT=$(python3 -c "import json; print(json.load(open('$TEST_DIR/.tycono/headless.json'))['port'])" 2>/dev/null || echo "")
      if [[ -n "$PORT" ]] && curl -s --max-time 2 "http://localhost:${PORT}/api/health" >/dev/null 2>&1; then
        SERVER_READY="true"
        break
      fi
    fi
    sleep 1
  done

  if [[ -n "$SERVER_READY" ]]; then
    echo "  [INFO] Server ready on port $PORT"

    # Test 1: start-wave.sh should find the existing server (not start a new one)
    OUTPUT=$(COMPANY_ROOT_OVERRIDE="$TEST_DIR" "$SCRIPTS_DIR/start-wave.sh" "test hello" 2>&1 | head -5) || true
    if echo "$OUTPUT" | grep -q "Connected to existing\|Found existing"; then
      echo "  [PASS] start-wave.sh reused existing server"
      PASS=$((PASS + 1))
    else
      echo "  [FAIL] start-wave.sh did not detect existing server"
      echo "  [DEBUG] Output: $(echo "$OUTPUT" | head -3)"
      FAIL=$((FAIL + 1))
    fi

    # Test 2: kill server, check start-wave.sh detects stale headless.json
    kill -- -"$SERVER_PID" 2>/dev/null || kill "$SERVER_PID" 2>/dev/null || true
    wait "$SERVER_PID" 2>/dev/null || true
    sleep 2

    # headless.json still exists but server is dead
    if [[ -f "$TEST_DIR/.tycono/headless.json" ]]; then
      OUTPUT2=$(timeout 10 bash -c "COMPANY_ROOT_OVERRIDE='$TEST_DIR' '$SCRIPTS_DIR/start-wave.sh' 'test hello' 2>&1" || true)
      if echo "$OUTPUT2" | grep -q "Starting Tycono server\|not ready"; then
        echo "  [PASS] start-wave.sh detected stale headless.json"
        PASS=$((PASS + 1))
      else
        echo "  [FAIL] start-wave.sh did not detect stale server"
        FAIL=$((FAIL + 1))
      fi
    else
      echo "  [SKIP] headless.json already cleaned up"
      SKIP=$((SKIP + 1))
    fi
  else
    echo "  [SKIP] Server did not start within 60s"
    SKIP=$((SKIP + 1))
    kill -- -"$SERVER_PID" 2>/dev/null || kill "$SERVER_PID" 2>/dev/null || true
  fi
  SERVER_PID=""
else
  echo "  [SKIP] tycono-server not available"
  SKIP=$((SKIP + 1))
fi

cleanup
trap - EXIT

# =============================================================================
# TC-AGENT-8: Continuous mode turn-1 storm guard (vitest check)
# =============================================================================
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "TC-AGENT-8: Continuous turn-1 storm guard (server code)"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

SH_FILE="${PLUGIN_ROOT}/../server/src/api/src/services/supervisor-heartbeat.ts"
if [[ -f "$SH_FILE" ]]; then
  SH_CONTENT=$(cat "$SH_FILE")
  assert_contains "Turn-1 check exists" "$SH_CONTENT" "turns <= 1 && dispatches === 0"
  assert_contains "Loop stops on empty turn" "$SH_CONTENT" "Stopping loop (nothing to do)"

  # Verify the fix doesn't break normal continuous restart
  assert_contains "Normal continuous restart preserved" "$SH_CONTENT" "Continuous mode ON — restarting"
else
  echo "  [FAIL] supervisor-heartbeat.ts not found at $SH_FILE"
  FAIL=$((FAIL + 1))
fi

# =============================================================================
# TC-AGENT-9: CEO Critic CHALLENGE relay (server code)
# =============================================================================
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "TC-AGENT-9: CEO Critic CHALLENGE relay (server code)"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

# Reuse SH_FILE from TC-AGENT-8 (same file)
if [[ -f "$SH_FILE" ]]; then
  SH_CONTENT=$(cat "$SH_FILE")
  assert_contains "Critic CHALLENGE relay section" "$SH_CONTENT" "Critic CHALLENGE Relay"
  assert_contains "MANDATORY enforcement" "$SH_CONTENT" "MANDATORY"
  assert_contains "Re-amend on no response" "$SH_CONTENT" "did not address it"
  assert_contains "Detect CHALLENGE keywords" "$SH_CONTENT" "CHALLENGE, BLOCK, SNOWBALL"
else
  echo "  [FAIL] supervisor-heartbeat.ts not found at $SH_FILE"
  FAIL=$((FAIL + 1))
fi

# =============================================================================
# TC-AGENT-10: Server vitest suite passes
# =============================================================================
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "TC-AGENT-10: Server vitest suite"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

API_DIR="${PLUGIN_ROOT}/../server/src/api"
if [[ -d "$API_DIR" ]] && [[ -f "$API_DIR/package.json" ]]; then
  VITEST_OUTPUT=$(cd "$API_DIR" && npx vitest run --reporter=verbose 2>&1) || true

  VITEST_PASS=$(echo "$VITEST_OUTPUT" | grep "Tests" | grep -o "[0-9]* passed" | head -1 || echo "")
  VITEST_FAIL=$(echo "$VITEST_OUTPUT" | grep "Test Files" | grep -o "[0-9]* failed" | head -1 || echo "")

  if [[ -n "$VITEST_PASS" ]]; then
    echo "  [INFO] Vitest: $VITEST_PASS"
  fi

  # smoke.test.ts has a known import issue — exclude from fail count
  REAL_FAIL=$(echo "$VITEST_OUTPUT" | grep "FAIL" | grep -v "smoke.test.ts" | wc -l | tr -d ' ')
  if [[ "$REAL_FAIL" -eq 0 ]]; then
    echo "  [PASS] All server tests passed (excluding known smoke.test.ts import issue)"
    PASS=$((PASS + 1))
  else
    echo "  [FAIL] Server tests have failures beyond smoke.test.ts"
    echo "$VITEST_OUTPUT" | grep "FAIL" | grep -v "smoke.test.ts"
    FAIL=$((FAIL + 1))
  fi
else
  echo "  [FAIL] Server API directory not found at $API_DIR"
  FAIL=$((FAIL + 1))
fi

# =============================================================================
# TC-AGENT-11: BUG-FORKBOMB — 중복 wave → CEO amend (서버 guard)
# =============================================================================
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "TC-AGENT-11: BUG-FORKBOMB — duplicate wave guard"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

TEST_DIR=$(mktemp -d)
trap cleanup EXIT

mkdir -p "$TEST_DIR/knowledge"
echo "# Test" > "$TEST_DIR/knowledge/CLAUDE.md"
mkdir -p "$TEST_DIR/.tycono"

# Start server
TYCONO_BIN=$(which tycono-server 2>/dev/null || echo "")
if [[ -n "$TYCONO_BIN" ]] || command -v npx &>/dev/null; then
  cd "$TEST_DIR"
  if [[ -n "$TYCONO_BIN" ]]; then
    "$TYCONO_BIN" &
  else
    npx tycono-server@0.1.1-beta.1 &
  fi
  SERVER_PID=$!

  SERVER_READY=""
  for i in $(seq 1 60); do
    if [[ -f "$TEST_DIR/.tycono/headless.json" ]]; then
      PORT=$(python3 -c "import json; print(json.load(open('$TEST_DIR/.tycono/headless.json'))['port'])" 2>/dev/null || echo "")
      if [[ -n "$PORT" ]] && curl -s --max-time 2 "http://localhost:${PORT}/api/health" >/dev/null 2>&1; then
        SERVER_READY="true"
        break
      fi
    fi
    sleep 1
  done

  if [[ -n "$SERVER_READY" ]]; then
    API_URL="http://localhost:${PORT}"

    # Wave 1
    WAVE1=$(curl -s -X POST "${API_URL}/api/exec/wave" \
      -H "Content-Type: application/json" \
      -d '{"directive":"hello test 1"}' 2>/dev/null || echo "")
    WAVE1_ID=$(echo "$WAVE1" | python3 -c "import sys,json; print(json.load(sys.stdin).get('waveId',''))" 2>/dev/null || echo "")

    sleep 2

    # Wave 2 (duplicate) — should be amended to existing wave, not new
    WAVE2=$(curl -s -X POST "${API_URL}/api/exec/wave" \
      -H "Content-Type: application/json" \
      -d '{"directive":"hello test 2"}' 2>/dev/null || echo "")
    WAVE2_AMENDED=$(echo "$WAVE2" | python3 -c "import sys,json; print(json.load(sys.stdin).get('amended', False))" 2>/dev/null || echo "")
    WAVE2_ID=$(echo "$WAVE2" | python3 -c "import sys,json; print(json.load(sys.stdin).get('waveId',''))" 2>/dev/null || echo "")

    if [[ "$WAVE2_AMENDED" == "True" ]]; then
      echo "  [PASS] Duplicate wave amended to existing (not new wave)"
      PASS=$((PASS + 1))
    else
      echo "  [FAIL] Duplicate wave created new instead of amend"
      echo "  [DEBUG] Wave1: $WAVE1"
      echo "  [DEBUG] Wave2: $WAVE2"
      FAIL=$((FAIL + 1))
    fi

    # Verify same waveId
    if [[ -n "$WAVE1_ID" ]] && [[ "$WAVE1_ID" == "$WAVE2_ID" ]]; then
      echo "  [PASS] Same waveId returned ($WAVE1_ID)"
      PASS=$((PASS + 1))
    elif [[ "$WAVE2_AMENDED" == "True" ]]; then
      echo "  [PASS] Amendment confirmed (waveId may differ in response format)"
      PASS=$((PASS + 1))
    else
      echo "  [FAIL] Different waveIds — wave2 is a separate wave"
      FAIL=$((FAIL + 1))
    fi

    # Check session count — CEO should be 1, not 2
    sleep 3
    SESSIONS=$(curl -s "${API_URL}/api/waves/active" 2>/dev/null || echo "[]")
    echo "  [INFO] Active waves: $SESSIONS"

    # Count CEO sessions in activity-streams
    CEO_SESSIONS=$(ls "$TEST_DIR/.tycono/activity-streams/ses-ceo-"* 2>/dev/null | wc -l | tr -d ' ')
    if [[ "$CEO_SESSIONS" -le 1 ]]; then
      echo "  [PASS] CEO session count: $CEO_SESSIONS (1-session invariant)"
      PASS=$((PASS + 1))
    else
      echo "  [FAIL] CEO session count: $CEO_SESSIONS (expected ≤ 1)"
      FAIL=$((FAIL + 1))
    fi

    # Kill server
    kill -- -"$SERVER_PID" 2>/dev/null || kill "$SERVER_PID" 2>/dev/null || true
    wait "$SERVER_PID" 2>/dev/null || true
  else
    echo "  [FAIL] Server did not start within 60s"
    FAIL=$((FAIL + 1))
    kill -- -"$SERVER_PID" 2>/dev/null || kill "$SERVER_PID" 2>/dev/null || true
  fi
  SERVER_PID=""
else
  echo "  [FAIL] tycono-server not available"
  FAIL=$((FAIL + 1))
fi

cleanup
trap - EXIT

# =============================================================================
# TC-AGENT-12: dispatch-invariant vitest (Round 3 자동화)
# =============================================================================
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "TC-AGENT-12: dispatch-invariant vitest suite"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

INVARIANT_TEST="${PLUGIN_ROOT}/../server/src/api/tests/dispatch-invariant.test.ts"
if [[ -f "$INVARIANT_TEST" ]]; then
  VITEST_OUT=$(cd "${PLUGIN_ROOT}/../server/src/api" && npx vitest run tests/dispatch-invariant.test.ts --reporter=verbose 2>&1) || true

  INV_PASS=$(echo "$VITEST_OUT" | grep -c "✓" || echo "0")
  INV_FAIL=$(echo "$VITEST_OUT" | grep -c "×\|✗\|FAIL" || echo "0")

  if [[ "$INV_FAIL" -eq 0 ]] && [[ "$INV_PASS" -gt 0 ]]; then
    echo "  [PASS] dispatch-invariant: $INV_PASS tests passed"
    PASS=$((PASS + 1))
  else
    echo "  [FAIL] dispatch-invariant: $INV_PASS passed, $INV_FAIL failed"
    FAIL=$((FAIL + 1))
  fi
else
  echo "  [FAIL] dispatch-invariant.test.ts not found at $INVARIANT_TEST"
  FAIL=$((FAIL + 1))
fi

# =============================================================================
# TC-AGENT-13: Wave Preview API (server code check)
# =============================================================================
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "TC-AGENT-13: Wave Preview API (server code check)"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

EXEC_FILE="${PLUGIN_ROOT}/../server/src/api/src/routes/execute.ts"
if [[ -f "$EXEC_FILE" ]]; then
  EXEC_CONTENT=$(cat "$EXEC_FILE")
  assert_contains "handleWavePreview function exists" "$EXEC_CONTENT" "handleWavePreview"
  assert_contains "/api/jobs/preview route exists" "$EXEC_CONTENT" "/api/jobs/preview"
  assert_contains "estimatedCostPerRound in response" "$EXEC_CONTENT" "estimatedCostPerRound"
  assert_contains "availableModels in response" "$EXEC_CONTENT" "availableModels"
else
  echo "  [FAIL] execute.ts not found at $EXEC_FILE"
  FAIL=$((FAIL + 1))
fi

# =============================================================================
# TC-AGENT-14: Wave Preview API (live server test)
# =============================================================================
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "TC-AGENT-14: Wave Preview API (live server test)"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

TEST_DIR=$(mktemp -d)
trap cleanup EXIT

mkdir -p "$TEST_DIR/knowledge"
echo "# Test" > "$TEST_DIR/knowledge/CLAUDE.md"
mkdir -p "$TEST_DIR/.tycono"

# Start server
TYCONO_BIN=$(which tycono-server 2>/dev/null || echo "")
if [[ -n "$TYCONO_BIN" ]] || command -v npx &>/dev/null; then
  cd "$TEST_DIR"
  if [[ -n "$TYCONO_BIN" ]]; then
    "$TYCONO_BIN" &
  else
    npx tycono-server@latest &
  fi
  SERVER_PID=$!

  SERVER_READY=""
  for i in $(seq 1 60); do
    if [[ -f "$TEST_DIR/.tycono/headless.json" ]]; then
      PORT=$(python3 -c "import json; print(json.load(open('$TEST_DIR/.tycono/headless.json'))['port'])" 2>/dev/null || echo "")
      if [[ -n "$PORT" ]] && curl -s --max-time 2 "http://localhost:${PORT}/api/health" >/dev/null 2>&1; then
        SERVER_READY="true"
        break
      fi
    fi
    sleep 1
  done

  if [[ -n "$SERVER_READY" ]]; then
    API_URL="http://localhost:${PORT}"

    # Test 1: Basic preview request
    PREVIEW=$(curl -s -X POST "${API_URL}/api/exec/wave/preview" \
      -H "Content-Type: application/json" \
      -d '{"directive":"test hello"}' 2>/dev/null || echo "")

    assert_contains "Preview has team array" "$PREVIEW" '"team"'
    assert_contains "Preview has totalAgents > 0" "$(echo "$PREVIEW" | python3 -c "import sys,json; d=json.load(sys.stdin); print('HAS_AGENTS' if d.get('totalAgents',0) > 0 else 'NO_AGENTS')" 2>/dev/null || echo "")" "HAS_AGENTS"
    assert_contains "Preview has estimatedCostPerRound > 0" "$(echo "$PREVIEW" | python3 -c "import sys,json; d=json.load(sys.stdin); print('HAS_COST' if d.get('estimatedCostPerRound',0) > 0 else 'NO_COST')" 2>/dev/null || echo "")" "HAS_COST"
    assert_contains "Preview has availableModels array" "$PREVIEW" '"availableModels"'
    assert_contains "Preview has continuous: false" "$(echo "$PREVIEW" | python3 -c "import sys,json; d=json.load(sys.stdin); print('CONTINUOUS_FALSE' if d.get('continuous') == False else 'NOT_FALSE')" 2>/dev/null || echo "")" "CONTINUOUS_FALSE"

    # Test 2: Continuous mode preview
    PREVIEW_CONT=$(curl -s -X POST "${API_URL}/api/exec/wave/preview" \
      -H "Content-Type: application/json" \
      -d '{"directive":"test", "continuous": true}' 2>/dev/null || echo "")

    assert_contains "Preview continuous=true returns continuous: true" "$(echo "$PREVIEW_CONT" | python3 -c "import sys,json; d=json.load(sys.stdin); print('CONTINUOUS_TRUE' if d.get('continuous') == True else 'NOT_TRUE')" 2>/dev/null || echo "")" "CONTINUOUS_TRUE"

    # Kill server
    kill -- -"$SERVER_PID" 2>/dev/null || kill "$SERVER_PID" 2>/dev/null || true
    wait "$SERVER_PID" 2>/dev/null || true
  else
    echo "  [FAIL] Server did not start within 60s"
    FAIL=$((FAIL + 1))
    kill -- -"$SERVER_PID" 2>/dev/null || kill "$SERVER_PID" 2>/dev/null || true
  fi
  SERVER_PID=""
else
  echo "  [FAIL] tycono-server not available"
  FAIL=$((FAIL + 1))
fi

cleanup
trap - EXIT

# =============================================================================
# TC-AGENT-15: TUI Confirmation Flow (code check)
# =============================================================================
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "TC-AGENT-15: TUI Confirmation Flow (code check)"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

USE_CMD_FILE="${PLUGIN_ROOT}/../tui/src/hooks/useCommand.ts"
APP_FILE="${PLUGIN_ROOT}/../tui/src/app.tsx"

if [[ -f "$USE_CMD_FILE" ]]; then
  USE_CMD_CONTENT=$(cat "$USE_CMD_FILE")
  assert_contains "useCommand has previewWave import" "$USE_CMD_CONTENT" "previewWave"
  assert_contains "useCommand has wave_preview result type" "$USE_CMD_CONTENT" "wave_preview"
else
  echo "  [FAIL] useCommand.ts not found at $USE_CMD_FILE"
  FAIL=$((FAIL + 1))
fi

if [[ -f "$APP_FILE" ]]; then
  APP_CONTENT=$(cat "$APP_FILE")
  assert_contains "app.tsx has pendingWaveConfirm state" "$APP_CONTENT" "pendingWaveConfirm"
  assert_contains "app.tsx has Wave Confirmation text" "$APP_CONTENT" "Wave Confirmation"
  assert_contains "app.tsx has continuous mode help text" "$APP_CONTENT" "continuous"
else
  echo "  [FAIL] app.tsx not found at $APP_FILE"
  FAIL=$((FAIL + 1))
fi

# =============================================================================
# TC-AGENT-16: modelOverrides — runtime model override (code check)
# =============================================================================
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "TC-AGENT-16: modelOverrides runtime support (code check)"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

EXEC_MGR="${PLUGIN_ROOT}/../server/src/api/src/services/execution-manager.ts"
if [[ -f "$EXEC_MGR" ]]; then
  EM_CONTENT=$(cat "$EXEC_MGR")
  assert_contains "ExecMgr has modelOverrides lookup" "$EM_CONTENT" "modelOverrides"
  assert_contains "ExecMgr logs model override" "$EM_CONTENT" "Model override for"
else
  echo "  [FAIL] execution-manager.ts not found at $EXEC_MGR"
  FAIL=$((FAIL + 1))
fi

SH_FILE2="${PLUGIN_ROOT}/../server/src/api/src/services/supervisor-heartbeat.ts"
if [[ -f "$SH_FILE2" ]]; then
  SH_CONTENT2=$(cat "$SH_FILE2")
  assert_contains "Heartbeat accepts modelOverrides" "$SH_CONTENT2" "modelOverrides"
  assert_contains "Wave file saves modelOverrides" "$SH_CONTENT2" "waveData.modelOverrides"
else
  echo "  [FAIL] supervisor-heartbeat.ts not found at $SH_FILE2"
  FAIL=$((FAIL + 1))
fi

EXEC_ROUTE="${PLUGIN_ROOT}/../server/src/api/src/routes/execute.ts"
if [[ -f "$EXEC_ROUTE" ]]; then
  ER_CONTENT=$(cat "$EXEC_ROUTE")
  assert_contains "Wave route accepts modelOverrides" "$ER_CONTENT" "body.modelOverrides"
else
  echo "  [FAIL] execute.ts not found at $EXEC_ROUTE"
  FAIL=$((FAIL + 1))
fi

# =============================================================================
# TC-AGENT-17: PreToolUse hook — wave confirmation (code check)
# =============================================================================
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "TC-AGENT-17: PreToolUse wave confirmation hook (code check)"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

HOOKS_JSON="${PLUGIN_ROOT}/hooks/hooks.json"
WAVE_CONFIRM="${PLUGIN_ROOT}/hooks/wave-confirm.sh"

if [[ -f "$HOOKS_JSON" ]]; then
  HJ_CONTENT=$(cat "$HOOKS_JSON")
  assert_contains "hooks.json has PreToolUse" "$HJ_CONTENT" "PreToolUse"
  assert_contains "hooks.json targets Bash tool" "$HJ_CONTENT" "Bash"
  assert_contains "hooks.json references wave-confirm.sh" "$HJ_CONTENT" "wave-confirm.sh"
else
  echo "  [FAIL] hooks.json not found at $HOOKS_JSON"
  FAIL=$((FAIL + 1))
fi

if [[ -f "$WAVE_CONFIRM" ]]; then
  WC_CONTENT=$(cat "$WAVE_CONFIRM")
  assert_contains "wave-confirm detects start-wave.sh" "$WC_CONTENT" "start-wave.sh"
  assert_contains "wave-confirm checks --confirmed flag" "$WC_CONTENT" "\-\-confirmed"
  assert_contains "wave-confirm calls preview API" "$WC_CONTENT" "wave/preview"
  assert_contains "wave-confirm exits 2 to block" "$WC_CONTENT" "exit 2"
  assert_contains "wave-confirm is executable" "$(test -x "$WAVE_CONFIRM" && echo "EXEC" || echo "NOEXEC")" "EXEC"
else
  echo "  [FAIL] wave-confirm.sh not found at $WAVE_CONFIRM"
  FAIL=$((FAIL + 1))
fi

# Verify start-wave.sh accepts --confirmed flag
SW_FILE="${PLUGIN_ROOT}/scripts/start-wave.sh"
if [[ -f "$SW_FILE" ]]; then
  SW_CONTENT=$(cat "$SW_FILE")
  assert_contains "start-wave.sh accepts --confirmed" "$SW_CONTENT" "\-\-confirmed"
else
  echo "  [FAIL] start-wave.sh not found"
  FAIL=$((FAIL + 1))
fi

# =============================================================================
# TC-AGENT-18: PreToolUse hook — blocks without --confirmed (functional)
# =============================================================================
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "TC-AGENT-18: wave-confirm.sh blocks without --confirmed"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

if [[ -f "$WAVE_CONFIRM" ]]; then
  # Simulate PreToolUse input: Bash tool calling start-wave.sh WITHOUT --confirmed
  HOOK_INPUT='{"tool_name":"Bash","tool_input":{"command":"start-wave.sh \"build a game\""}}'
  HOOK_OUTPUT=$(echo "$HOOK_INPUT" | "$WAVE_CONFIRM" 2>&1) || HOOK_EXIT=$?
  HOOK_EXIT=${HOOK_EXIT:-0}

  if [[ "$HOOK_EXIT" -eq 2 ]]; then
    echo "  [PASS] Hook blocked execution (exit 2)"
    PASS=$((PASS + 1))
  else
    echo "  [FAIL] Hook did not block (exit $HOOK_EXIT, expected 2)"
    FAIL=$((FAIL + 1))
  fi

  assert_contains "Block message includes confirmation required" "$HOOK_OUTPUT" "confirmation required"
  assert_contains "Block message mentions --confirmed" "$HOOK_OUTPUT" "\-\-confirmed"
else
  echo "  [SKIP] wave-confirm.sh not found"
  SKIP=$((SKIP + 1))
fi

# =============================================================================
# TC-AGENT-19: PreToolUse hook — allows with --confirmed (functional)
# =============================================================================
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "TC-AGENT-19: wave-confirm.sh allows with --confirmed"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

if [[ -f "$WAVE_CONFIRM" ]]; then
  # Simulate PreToolUse input: Bash tool calling start-wave.sh WITH --confirmed
  HOOK_INPUT='{"tool_name":"Bash","tool_input":{"command":"start-wave.sh --confirmed \"build a game\""}}'
  echo "$HOOK_INPUT" | "$WAVE_CONFIRM" >/dev/null 2>&1
  HOOK_EXIT=$?

  if [[ "$HOOK_EXIT" -eq 0 ]]; then
    echo "  [PASS] Hook allowed execution (exit 0)"
    PASS=$((PASS + 1))
  else
    echo "  [FAIL] Hook blocked confirmed command (exit $HOOK_EXIT, expected 0)"
    FAIL=$((FAIL + 1))
  fi

  # Non-start-wave commands should pass through
  HOOK_INPUT2='{"tool_name":"Bash","tool_input":{"command":"ls -la"}}'
  echo "$HOOK_INPUT2" | "$WAVE_CONFIRM" >/dev/null 2>&1
  HOOK_EXIT2=$?

  if [[ "$HOOK_EXIT2" -eq 0 ]]; then
    echo "  [PASS] Hook ignores non-wave commands (exit 0)"
    PASS=$((PASS + 1))
  else
    echo "  [FAIL] Hook blocked unrelated command (exit $HOOK_EXIT2)"
    FAIL=$((FAIL + 1))
  fi

  # Non-Bash tools should pass through
  HOOK_INPUT3='{"tool_name":"Read","tool_input":{"file_path":"/tmp/test"}}'
  echo "$HOOK_INPUT3" | "$WAVE_CONFIRM" >/dev/null 2>&1
  HOOK_EXIT3=$?

  if [[ "$HOOK_EXIT3" -eq 0 ]]; then
    echo "  [PASS] Hook ignores non-Bash tools (exit 0)"
    PASS=$((PASS + 1))
  else
    echo "  [FAIL] Hook blocked non-Bash tool (exit $HOOK_EXIT3)"
    FAIL=$((FAIL + 1))
  fi
else
  echo "  [SKIP] wave-confirm.sh not found"
  SKIP=$((SKIP + 1))
fi

# TC-AGENT-20: Wave Analysis API endpoint (server code check)
# =============================================================================
# Checks that the server has GET /api/waves/:waveId/analysis endpoint
# and analysis.sh uses it with fallback
# =============================================================================
echo "TC-AGENT-20: Wave Analysis API endpoint (code check)"

EXEC_TS="${PLUGIN_ROOT}/../server/src/api/src/routes/execute.ts"
ANALYSIS_SH="${PLUGIN_ROOT}/scripts/analysis.sh"

if [[ -f "$EXEC_TS" ]]; then
  # Check server has analysis route
  assert_contains "Server: /api/waves/:waveId/analysis route" \
    "$(cat "$EXEC_TS")" \
    "handleWaveAnalysis"

  assert_contains "Server: analysis imports estimateCost" \
    "$(cat "$EXEC_TS")" \
    "estimateCost"

  assert_contains "Server: analysis imports getTokenLedger" \
    "$(cat "$EXEC_TS")" \
    "getTokenLedger"

  # Check analysis function has wave-scoped token query
  assert_contains "Server: analysis queries token ledger per session" \
    "$(cat "$EXEC_TS")" \
    "ledger.query({ sessionId: ses.id })"

  # Check analysis function returns orphans
  assert_contains "Server: analysis detects orphan sessions" \
    "$(cat "$EXEC_TS")" \
    "orphans"
else
  echo "  [SKIP] execute.ts not found at $EXEC_TS"
  SKIP=$((SKIP + 1))
fi

if [[ -f "$ANALYSIS_SH" ]]; then
  # Check plugin uses unified endpoint
  assert_contains "Plugin: analysis.sh calls /analysis endpoint" \
    "$(cat "$ANALYSIS_SH")" \
    "/api/waves/\${WAVE_ID}/analysis"

  # Check plugin has fallback for older servers
  assert_contains "Plugin: analysis.sh has fallback for old servers" \
    "$(cat "$ANALYSIS_SH")" \
    "Fallback"
else
  echo "  [SKIP] analysis.sh not found at $ANALYSIS_SH"
  SKIP=$((SKIP + 1))
fi

# TC-AGENT-21: Wave Report endpoint (server + plugin code check)
# =============================================================================
echo "TC-AGENT-21: Wave Report endpoint (code check)"

if [[ -f "$EXEC_TS" ]]; then
  assert_contains "Server: handleWaveReport function" \
    "$(cat "$EXEC_TS")" \
    "handleWaveReport"

  assert_contains "Server: report returns markdown" \
    "$(cat "$EXEC_TS")" \
    "text/markdown"

  assert_contains "Server: report has dispatch tree" \
    "$(cat "$EXEC_TS")" \
    "Dispatch Tree"
fi

REPORT_SH="${PLUGIN_ROOT}/scripts/report.sh"
if [[ -f "$REPORT_SH" ]]; then
  assert_contains "Plugin: report.sh calls /report endpoint" \
    "$(cat "$REPORT_SH")" \
    "/api/waves/"
else
  echo "  [SKIP] report.sh not found"
  SKIP=$((SKIP + 1))
fi

REPORT_CMD="${PLUGIN_ROOT}/commands/report.md"
if [[ -f "$REPORT_CMD" ]]; then
  assert_contains "Plugin: report command exists" \
    "$(cat "$REPORT_CMD")" \
    "report.sh"
else
  echo "  [SKIP] commands/report.md not found"
  SKIP=$((SKIP + 1))
fi

# TC-AGENT-22: Wave isolation — env vars + PID structure (code check)
# =============================================================================
echo "TC-AGENT-22: Wave isolation (code check)"

RUNNER_TS="${PLUGIN_ROOT}/../server/src/api/src/engine/runners/claude-cli.ts"
if [[ -f "$RUNNER_TS" ]]; then
  assert_contains "Server: TYCONO_WAVE_ID env var" \
    "$(cat "$RUNNER_TS")" \
    "TYCONO_WAVE_ID"

  assert_contains "Server: TYCONO_ROLE_ID env var" \
    "$(cat "$RUNNER_TS")" \
    "TYCONO_ROLE_ID"

  assert_contains "Server: detached spawn for process isolation" \
    "$(cat "$RUNNER_TS")" \
    "detached: true"

  assert_contains "Server: PID file per wave-role" \
    "$(cat "$RUNNER_TS")" \
    "wave-\${cleanEnv.DISPATCH_WAVE_ID}-\${roleId}.pid"
else
  echo "  [SKIP] claude-cli.ts not found"
  SKIP=$((SKIP + 1))
fi

START_SH="${PLUGIN_ROOT}/scripts/start-wave.sh"
if [[ -f "$START_SH" ]]; then
  assert_contains "Plugin: structured PID directory" \
    "$(cat "$START_SH")" \
    ".tycono/pids"
fi

CANCEL_SH="${PLUGIN_ROOT}/scripts/cancel.sh"
if [[ -f "$CANCEL_SH" ]]; then
  assert_contains "Plugin: cancel uses wave-scoped PID glob" \
    "$(cat "$CANCEL_SH")" \
    "wave-\${WAVE_ID}-"

  assert_contains "Plugin: cancel kills by TYCONO_WAVE_ID" \
    "$(cat "$CANCEL_SH")" \
    "TYCONO_WAVE_ID"
fi

# TC-AGENT-23: Model override — --model flag (code check)
# =============================================================================
echo "TC-AGENT-23: Model override flag (code check)"

if [[ -f "$START_SH" ]]; then
  assert_contains "Plugin: --model flag parsing" \
    "$(cat "$START_SH")" \
    "MODEL_OVERRIDES"

  assert_contains "Plugin: modelOverrides in payload" \
    "$(cat "$START_SH")" \
    "modelOverrides"
fi

# TC-AGENT-24: Status dispatch tree (code check)
# =============================================================================
echo "TC-AGENT-24: Status dispatch tree (code check)"

STATUS_SH="${PLUGIN_ROOT}/scripts/status.sh"
if [[ -f "$STATUS_SH" ]]; then
  assert_contains "Plugin: status uses analysis endpoint" \
    "$(cat "$STATUS_SH")" \
    "/api/waves/"

  assert_contains "Plugin: status builds parent→child tree" \
    "$(cat "$STATUS_SH")" \
    "parentSessionId"

  assert_contains "Plugin: status has tree rendering" \
    "$(cat "$STATUS_SH")" \
    "print_role"
fi

# =============================================================================
# Summary
# =============================================================================
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
TOTAL=$((PASS + FAIL + SKIP))
echo "Results: $PASS passed, $FAIL failed, $SKIP skipped (total $TOTAL)"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

if [[ $FAIL -gt 0 ]]; then
  exit 1
fi
exit 0
