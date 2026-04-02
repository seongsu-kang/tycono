#!/bin/bash

# TC-CLAUDE-1: 빈 디렉토리에서 서버 시작 → CLAUDE.md 자동 생성
# TC-CLAUDE-2: 유저 CLAUDE.md 보호 (내용 보존 + AKB 섹션 append)
# TC-CLAUDE-3: 기존 AKB 섹션 업데이트 (유저 내용 보존 + 새 버전 교체)
#
# Usage: ./test-claude-md-protection.sh
# Exit: 0 = all pass, non-zero = failure count

set -euo pipefail
export PYTHONIOENCODING=utf-8
export LC_ALL=en_US.UTF-8

PASS=0
FAIL=0
SKIP=0
SERVER_PID=""
TEST_DIR=""

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

assert_dir_exists() {
  local label="$1"
  local path="$2"
  if [[ -d "$path" ]]; then
    echo "  [PASS] $label"
    PASS=$((PASS + 1))
  else
    echo "  [FAIL] $label — directory not found: $path"
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

start_server_and_wait() {
  local dir="$1"
  local wait_secs="${2:-15}"
  cd "$dir"
  npx tycono-server@0.1.1-beta.1 &
  SERVER_PID=$!
  echo "  [INFO] Server started (PID=$SERVER_PID), waiting ${wait_secs}s..."
  sleep "$wait_secs"
  if kill -0 "$SERVER_PID" 2>/dev/null; then
    kill "$SERVER_PID" 2>/dev/null || true
    wait "$SERVER_PID" 2>/dev/null || true
  fi
  SERVER_PID=""
}

# =============================================================================
# TC-CLAUDE-1: Zero-footprint — server does NOT scaffold in empty directory
# =============================================================================
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "TC-CLAUDE-1: Zero-footprint — no scaffold in empty dir"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

TEST_DIR=$(mktemp -d)
trap cleanup EXIT

# Create .tycono/ but NO knowledge/CLAUDE.md
mkdir -p "$TEST_DIR/.tycono"

start_server_and_wait "$TEST_DIR" 15

# Zero-footprint: server should NOT create knowledge/ or CLAUDE.md
if [[ ! -f "$TEST_DIR/knowledge/CLAUDE.md" ]]; then
  echo "  [PASS] knowledge/CLAUDE.md not created (zero-footprint)"
  PASS=$((PASS + 1))
else
  echo "  [FAIL] knowledge/CLAUDE.md was created — violates zero-footprint"
  FAIL=$((FAIL + 1))
fi

if [[ ! -d "$TEST_DIR/knowledge/roles" ]]; then
  echo "  [PASS] knowledge/roles/ not created (zero-footprint)"
  PASS=$((PASS + 1))
else
  echo "  [FAIL] knowledge/roles/ was created — violates zero-footprint"
  FAIL=$((FAIL + 1))
fi

cleanup
trap - EXIT

# =============================================================================
# TC-CLAUDE-2: 유저 CLAUDE.md 보호
# =============================================================================
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "TC-CLAUDE-2: User CLAUDE.md preserved + AKB appended"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

TEST_DIR=$(mktemp -d)
trap cleanup EXIT

# Create user-owned CLAUDE.md (no tycono:managed marker)
mkdir -p "$TEST_DIR/knowledge"
cat > "$TEST_DIR/knowledge/CLAUDE.md" << 'USEREOF'
# My Project

## My Rules

- Use TypeScript
USEREOF

# Create .tycono/ directory
mkdir -p "$TEST_DIR/.tycono"

# Record MD5 of original
ORIGINAL_MD5=$(md5 -q "$TEST_DIR/knowledge/CLAUDE.md" 2>/dev/null || md5sum "$TEST_DIR/knowledge/CLAUDE.md" | awk '{print $1}')
echo "  [INFO] Original CLAUDE.md MD5: $ORIGINAL_MD5"

start_server_and_wait "$TEST_DIR" 15

# Assertions
CLAUDE_CONTENT=$(cat "$TEST_DIR/knowledge/CLAUDE.md")

assert_contains "User content preserved (My Project)" "$CLAUDE_CONTENT" "My Project"
assert_contains "AKB section appended (tycono:akb-guide marker)" "$CLAUDE_CONTENT" "tycono:akb-guide"
assert_contains "Hub-First included" "$CLAUDE_CONTENT" "Hub-First"
assert_contains "Anti-Patterns included" "$CLAUDE_CONTENT" "Anti-Patterns"

# Check methodology doc installed (server uses methodology/ singular or methodologies/ plural)
if [[ -f "$TEST_DIR/knowledge/methodology/agentic-knowledge-base.md" ]] || [[ -f "$TEST_DIR/knowledge/methodologies/agentic-knowledge-base.md" ]]; then
  echo "  [PASS] methodology doc installed"
  PASS=$((PASS + 1))
else
  echo "  [FAIL] methodology doc not installed (checked both methodology/ and methodologies/)"
  FAIL=$((FAIL + 1))
fi

cleanup
trap - EXIT

# =============================================================================
# TC-CLAUDE-3: 기존 AKB 섹션 업데이트
# =============================================================================
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "TC-CLAUDE-3: Existing AKB section updated to new version"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

TEST_DIR=$(mktemp -d)
trap cleanup EXIT

# Create CLAUDE.md with user content + old AKB section
mkdir -p "$TEST_DIR/knowledge"
cat > "$TEST_DIR/knowledge/CLAUDE.md" << 'OLDEOF'
# My Project

## My Rules

- Use TypeScript
- Always test

<!-- tycono:akb-guide -->

## Old AKB Section

This is the old AKB content from version 0.0.1.
It should be replaced by the server.

OLD_UNIQUE_MARKER_12345

<!-- tycono:akb-guide-end -->
OLDEOF

# Create .tycono/ with old rules-version
mkdir -p "$TEST_DIR/.tycono"
echo "0.0.1" > "$TEST_DIR/.tycono/rules-version"

start_server_and_wait "$TEST_DIR" 15

# Assertions
CLAUDE_CONTENT=$(cat "$TEST_DIR/knowledge/CLAUDE.md")

assert_contains "User content preserved (My Project)" "$CLAUDE_CONTENT" "My Project"
assert_contains "User rules preserved (Use TypeScript)" "$CLAUDE_CONTENT" "Use TypeScript"
assert_contains "AKB section present (tycono:akb-guide)" "$CLAUDE_CONTENT" "tycono:akb-guide"
assert_not_contains "Old AKB content removed (OLD_UNIQUE_MARKER)" "$CLAUDE_CONTENT" "OLD_UNIQUE_MARKER_12345"
assert_not_contains "Old version text removed" "$CLAUDE_CONTENT" "old AKB content from version 0.0.1"

cleanup
trap - EXIT

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
