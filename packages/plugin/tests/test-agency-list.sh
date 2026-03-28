#!/bin/bash

# TC-01: Agency List — 번들된 agency 3개 출력 검증
# TC-02: Agency Create — 커스텀 agency 생성 및 list 반영 검증
# TC-06 (partial): Error handling for agency commands
#
# Usage: ./test-agency-list.sh
# Exit: 0 = all pass, 1 = failure

set -euo pipefail

# --- Config ---
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PLUGIN_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
SCRIPTS_DIR="${PLUGIN_ROOT}/scripts"

PASS=0
FAIL=0
SKIP=0

# --- Helpers ---
setup() {
  TEST_DIR=$(mktemp -d)
  export CLAUDE_PLUGIN_ROOT="$PLUGIN_ROOT"
  cd "$TEST_DIR"
}

cleanup() {
  cd /
  rm -rf "$TEST_DIR" 2>/dev/null || true
}

assert_contains() {
  local label="$1"
  local haystack="$2"
  local needle="$3"
  if echo "$haystack" | grep -q "$needle"; then
    echo "  [PASS] $label"
    PASS=$((PASS + 1))
  else
    echo "  [FAIL] $label — expected to contain: $needle"
    FAIL=$((FAIL + 1))
  fi
}

assert_not_contains() {
  local label="$1"
  local haystack="$2"
  local needle="$3"
  if echo "$haystack" | grep -q "$needle"; then
    echo "  [FAIL] $label — should NOT contain: $needle"
    FAIL=$((FAIL + 1))
  else
    echo "  [PASS] $label"
    PASS=$((PASS + 1))
  fi
}

assert_file_exists() {
  local label="$1"
  local path="$2"
  if [[ -f "$path" ]]; then
    echo "  [PASS] $label"
    PASS=$((PASS + 1))
  else
    echo "  [FAIL] $label — file not found: $path"
    FAIL=$((FAIL + 1))
  fi
}

assert_exit_code() {
  local label="$1"
  local expected="$2"
  local actual="$3"
  if [[ "$actual" -eq "$expected" ]]; then
    echo "  [PASS] $label"
    PASS=$((PASS + 1))
  else
    echo "  [FAIL] $label — expected exit $expected, got $actual"
    FAIL=$((FAIL + 1))
  fi
}

# =============================================================================
# TC-01: Agency List (번들 확인)
# =============================================================================
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "TC-01: Agency List (bundled agencies)"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

setup

# Remove global agencies temporarily to test only bundled
GLOBAL_BACKUP=""
if [[ -d "$HOME/.tycono/agencies" ]]; then
  GLOBAL_BACKUP=$(mktemp -d)
  mv "$HOME/.tycono/agencies" "$GLOBAL_BACKUP/agencies"
fi

OUTPUT=$("$SCRIPTS_DIR/agency-list.sh" 2>&1) || true

# Restore global agencies
if [[ -n "$GLOBAL_BACKUP" ]]; then
  mv "$GLOBAL_BACKUP/agencies" "$HOME/.tycono/agencies"
  rm -rf "$GLOBAL_BACKUP"
fi

assert_contains "gamedev agency listed" "$OUTPUT" "gamedev"
assert_contains "startup-mvp agency listed" "$OUTPUT" "startup-mvp"
assert_contains "solo-founder agency listed" "$OUTPUT" "solo-founder"
assert_contains "marketplace link shown" "$OUTPUT" "tycono.ai/agencies"
assert_contains "total count is 3" "$OUTPUT" "Total: 3"
assert_contains "[bundled] tag shown" "$OUTPUT" "\[bundled\]"

cleanup

# =============================================================================
# TC-02: Agency Create
# =============================================================================
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "TC-02: Agency Create"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

setup
mkdir -p knowledge

# 2a. Create a custom agency
OUTPUT=$("$SCRIPTS_DIR/agency-create.sh" my-test-team --roles cto,engineer,qa 2>&1)
EC=$?
assert_exit_code "agency-create exits 0" 0 "$EC"
assert_file_exists "agency.yaml created" "knowledge/agencies/my-test-team/agency.yaml"

# 2b. Validate content
YAML_CONTENT=$(cat "knowledge/agencies/my-test-team/agency.yaml")
assert_contains "id is my-test-team" "$YAML_CONTENT" "id: my-test-team"
assert_contains "cto role present" "$YAML_CONTENT" "cto"
assert_contains "engineer role present" "$YAML_CONTENT" "engineer"
assert_contains "qa role present" "$YAML_CONTENT" "qa"

# 2c. Verify it appears in agency-list
# Remove global agencies temporarily
GLOBAL_BACKUP=""
if [[ -d "$HOME/.tycono/agencies" ]]; then
  GLOBAL_BACKUP=$(mktemp -d)
  mv "$HOME/.tycono/agencies" "$GLOBAL_BACKUP/agencies"
fi

LIST_OUTPUT=$("$SCRIPTS_DIR/agency-list.sh" 2>&1) || true

if [[ -n "$GLOBAL_BACKUP" ]]; then
  mv "$GLOBAL_BACKUP/agencies" "$HOME/.tycono/agencies"
  rm -rf "$GLOBAL_BACKUP"
fi

assert_contains "new agency in list" "$LIST_OUTPUT" "my-test-team"

# 2d. Duplicate creation should fail
OUTPUT2=$("$SCRIPTS_DIR/agency-create.sh" my-test-team 2>&1 || true)
EC2=$?
# Script uses exit 1 for duplicates
assert_contains "duplicate error message" "$OUTPUT2" "already exists"

# 2e. Invalid name should fail
OUTPUT3=$("$SCRIPTS_DIR/agency-create.sh" "INVALID" 2>&1 || true)
assert_contains "invalid name error" "$OUTPUT3" "must be lowercase"

cleanup

# =============================================================================
# TC-06 (partial): Error Handling — agency commands
# =============================================================================
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "TC-06: Error Handling (agency commands)"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

setup
mkdir -p knowledge

# No name
OUTPUT=$("$SCRIPTS_DIR/agency-create.sh" 2>&1 || true)
assert_contains "no-name error" "$OUTPUT" "required"

# Special characters
OUTPUT=$("$SCRIPTS_DIR/agency-create.sh" "hello world" 2>&1 || true)
assert_contains "space-in-name error" "$OUTPUT" "must be lowercase"

cleanup

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
