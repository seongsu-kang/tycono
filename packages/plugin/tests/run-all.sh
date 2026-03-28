#!/bin/bash

# Tycono Plugin — Run All E2E Tests
#
# Usage: ./run-all.sh [--skip-server]
#   --skip-server    Skip tests that require tycono-server (TC-03/04/05)
#
# Exit: 0 = all pass, 1 = any failure

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
TOTAL_PASS=0
TOTAL_FAIL=0

echo "============================================="
echo " Tycono Plugin E2E Tests"
echo " $(date -u +%Y-%m-%dT%H:%M:%SZ)"
echo "============================================="

run_test() {
  local name="$1"
  local script="$2"
  echo ""
  echo ">>> Running: $name"
  echo ""

  if "$SCRIPT_DIR/$script" "$@"; then
    echo ""
    echo ">>> $name: ALL PASSED"
    TOTAL_PASS=$((TOTAL_PASS + 1))
  else
    echo ""
    echo ">>> $name: FAILED"
    TOTAL_FAIL=$((TOTAL_FAIL + 1))
  fi
}

# --- Test suites ---

run_test "Agency List + Create + Error Handling" "test-agency-list.sh"
run_test "Wave Start + Status + Cancel" "test-wave-basic.sh"
run_test "CLAUDE.md Protection" "test-claude-md-protection.sh"
run_test "Agentic E2E (claude -p)" "test-agentic-e2e.sh"

# --- Final Summary ---
echo ""
echo "============================================="
echo " Final: $TOTAL_PASS suites passed, $TOTAL_FAIL suites failed"
echo "============================================="

if [[ $TOTAL_FAIL -gt 0 ]]; then
  exit 1
fi
exit 0
