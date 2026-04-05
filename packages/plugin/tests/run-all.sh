#!/bin/bash

# Tycono Plugin — Run All E2E Tests (3-Tier)
#
# Usage: ./run-all.sh [options]
#   --static-only    Run only static code checks (fastest, no server)
#   --skip-agentic   Skip agentic tests (saves LLM cost)
#   --agentic-only   Run only agentic tests
#
# Tiers:
#   1. Static    — code pattern checks (no server, no LLM, ~5s)
#   2. Integration — server API tests (server required, no LLM, ~60s)
#   3. Agentic    — real wave execution (server + LLM, ~3min, costs tokens)
#
# Exit: 0 = all pass, 1 = any failure

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
TOTAL_PASS=0
TOTAL_FAIL=0

STATIC_ONLY=false
SKIP_AGENTIC=false
AGENTIC_ONLY=false

for arg in "$@"; do
  case "$arg" in
    --static-only) STATIC_ONLY=true ;;
    --skip-agentic) SKIP_AGENTIC=true ;;
    --agentic-only) AGENTIC_ONLY=true ;;
  esac
done

echo "============================================="
echo " Tycono Plugin E2E Tests (3-Tier)"
echo " $(date -u +%Y-%m-%dT%H:%M:%SZ)"
echo "============================================="

run_test() {
  local name="$1"
  local script="$2"
  echo ""
  echo ">>> Running: $name"
  echo ""

  if bash "$SCRIPT_DIR/$script"; then
    echo ""
    echo ">>> $name: PASSED"
    TOTAL_PASS=$((TOTAL_PASS + 1))
  else
    echo ""
    echo ">>> $name: FAILED"
    TOTAL_FAIL=$((TOTAL_FAIL + 1))
  fi
}

# --- Tier 1: Static ---
if [[ "$AGENTIC_ONLY" != "true" ]]; then
  run_test "Tier 1: Static Code Checks" "test-static.sh"
fi

# --- Tier 2: Integration ---
if [[ "$STATIC_ONLY" != "true" ]] && [[ "$AGENTIC_ONLY" != "true" ]]; then
  run_test "Tier 2: Integration (Server API)" "test-integration.sh"

  # Also run existing test suites
  if [[ -f "$SCRIPT_DIR/test-agency-list.sh" ]]; then
    run_test "Tier 2: Agency List + Create" "test-agency-list.sh"
  fi
  if [[ -f "$SCRIPT_DIR/test-wave-basic.sh" ]]; then
    run_test "Tier 2: Wave Start + Status + Cancel" "test-wave-basic.sh"
  fi
  if [[ -f "$SCRIPT_DIR/test-claude-md-protection.sh" ]]; then
    run_test "Tier 2: CLAUDE.md Protection" "test-claude-md-protection.sh"
  fi
fi

# --- Tier 3: Agentic ---
if [[ "$STATIC_ONLY" != "true" ]] && [[ "$SKIP_AGENTIC" != "true" ]]; then
  run_test "Tier 3: Agentic E2E (real waves)" "test-agentic.sh"
fi

# --- Final Summary ---
echo ""
echo "============================================="
echo " Final: $TOTAL_PASS suites passed, $TOTAL_FAIL suites failed"
if [[ "$SKIP_AGENTIC" == "true" ]]; then
  echo " (agentic tests skipped)"
fi
echo "============================================="

if [[ $TOTAL_FAIL -gt 0 ]]; then
  exit 1
fi
exit 0
