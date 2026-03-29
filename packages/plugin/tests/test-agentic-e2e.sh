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
  if [[ -n "$SERVER_PID" ]] && kill -0 "$SERVER_PID" 2>/dev/null; then
    kill "$SERVER_PID" 2>/dev/null || true
    wait "$SERVER_PID" 2>/dev/null || true
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
    kill "$SERVER_PID" 2>/dev/null || true
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
  --max-turns 8 \
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
# TC-AGENT-5: Tycono Channel unit tests pass
# =============================================================================
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "TC-AGENT-5: Tycono Channel unit tests"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

CHANNEL_DIR="${PLUGIN_ROOT}/channel"

if [[ -f "$CHANNEL_DIR/tycono-channel.test.ts" ]]; then
  RESULT=$(cd "$CHANNEL_DIR" && npx tsx --test tycono-channel.test.ts 2>&1) || true

  if echo "$RESULT" | grep -q "fail 0"; then
    echo "  [PASS] All channel unit tests passed"
    # Extract pass count
    CHANNEL_PASS_COUNT=$(echo "$RESULT" | grep "^# pass" | awk '{print $3}')
    echo "  [INFO] $CHANNEL_PASS_COUNT tests passed"
    PASS=$((PASS + 1))
  else
    echo "  [FAIL] Channel unit tests have failures"
    echo "$RESULT" | grep -E "\[FAIL\]|not ok" | head -5
    FAIL=$((FAIL + 1))
  fi
else
  echo "  [SKIP] Channel test file not found"
  SKIP=$((SKIP + 1))
fi

# =============================================================================
# TC-AGENT-6: Channel server starts without crash
# =============================================================================
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "TC-AGENT-6: Tycono Channel server smoke test"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

if [[ -f "$CHANNEL_DIR/tycono-channel.ts" ]]; then
  # Start channel server in background, wait 2s, check it's alive
  cd "$CHANNEL_DIR"
  npx tsx tycono-channel.ts &
  CHANNEL_PID=$!
  sleep 2

  if kill -0 "$CHANNEL_PID" 2>/dev/null; then
    echo "  [PASS] Channel server started successfully (PID $CHANNEL_PID)"
    PASS=$((PASS + 1))
    kill "$CHANNEL_PID" 2>/dev/null || true
    wait "$CHANNEL_PID" 2>/dev/null || true
  else
    echo "  [FAIL] Channel server crashed on startup"
    FAIL=$((FAIL + 1))
  fi
  CHANNEL_PID=""
else
  echo "  [SKIP] Channel server file not found"
  SKIP=$((SKIP + 1))
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
