#!/bin/bash

# Static Code Checks — deterministic, no server, no LLM
# Verifies code patterns exist in source files.
# Fast, reliable, runs in CI without dependencies.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PLUGIN_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
SERVER_SRC="${PLUGIN_ROOT}/../server/src"

PASS=0
FAIL=0
SKIP=0

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

assert_file_exists() {
  local label="$1"
  local filepath="$2"
  if [[ -f "$filepath" ]]; then
    echo "  [PASS] $label"
    PASS=$((PASS + 1))
  else
    echo "  [FAIL] $label — file not found: $filepath"
    FAIL=$((FAIL + 1))
  fi
}

# =============================================================================
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "S-01: start-wave.sh notification setup"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

START_WAVE="${PLUGIN_ROOT}/scripts/start-wave.sh"
if [[ -f "$START_WAVE" ]]; then
  SW=$(cat "$START_WAVE")
  assert_contains "SSE subscribe" "$SW" "curl -sN"
  assert_contains "awaiting_input detection" "$SW" "awaiting_input"
  assert_contains "error detection" "$SW" "msg:error"
  assert_contains "dispatch:error detection" "$SW" "dispatch:error"
  assert_contains "TYCONO ALERT output" "$SW" "TYCONO ALERT"
  assert_contains "session API for response" "$SW" "api/sessions"
  assert_contains "wave completion detection" "$SW" "wave:done"
  assert_contains "SSE curl is foreground" "$SW" 'curl -sN "${API_URL}/api/waves/${WAVE_ID}/stream"'
  assert_contains "--confirmed flag" "$SW" "\-\-confirmed"
  assert_contains "--model flag parsing" "$SW" "MODEL_OVERRIDES"
  assert_contains "modelOverrides payload" "$SW" "modelOverrides"
  assert_contains "structured PID directory" "$SW" ".tycono/pids"
  assert_contains "COMPANY_ROOT passed to server (npx)" "$SW" 'COMPANY_ROOT="$COMPANY_ROOT" npx'
  assert_contains "COMPANY_ROOT passed to server (bin)" "$SW" 'COMPANY_ROOT="$COMPANY_ROOT" node "$TYCONO_BIN"'
else
  echo "  [SKIP] start-wave.sh not found"
  SKIP=$((SKIP + 1))
fi

# =============================================================================
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "S-02: Supervisor heartbeat guards"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

SH_FILE="${SERVER_SRC}/api/src/services/supervisor-heartbeat.ts"
if [[ -f "$SH_FILE" ]]; then
  SH=$(cat "$SH_FILE")
  assert_contains "Turn-1 storm guard" "$SH" "turns <= 1 && dispatches === 0"
  assert_contains "Stop on empty turn" "$SH" "Stopping loop (nothing to do)"
  assert_contains "Continuous restart" "$SH" "Continuous mode ON — restarting"
  assert_contains "Critic CHALLENGE relay" "$SH" "Critic CHALLENGE Relay"
  assert_contains "MANDATORY enforcement" "$SH" "MANDATORY"
  assert_contains "Re-amend protocol" "$SH" "did not address it"
  assert_contains "CHALLENGE keywords" "$SH" "CHALLENGE, BLOCK, SNOWBALL"
else
  echo "  [SKIP] supervisor-heartbeat.ts not found"
  SKIP=$((SKIP + 1))
fi

# =============================================================================
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "S-03: Wave preview API"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

EXEC_FILE="${SERVER_SRC}/api/src/routes/execute.ts"
if [[ -f "$EXEC_FILE" ]]; then
  EX=$(cat "$EXEC_FILE")
  assert_contains "handleWavePreview" "$EX" "handleWavePreview"
  assert_contains "/api/jobs/preview route" "$EX" "/api/jobs/preview"
  assert_contains "estimatedCostPerRound" "$EX" "estimatedCostPerRound"
  assert_contains "availableModels" "$EX" "availableModels"
else
  echo "  [SKIP] execute.ts not found"
  SKIP=$((SKIP + 1))
fi

# =============================================================================
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "S-04: PreToolUse hook structure"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

HOOKS_JSON="${PLUGIN_ROOT}/hooks/hooks.json"
WAVE_CONFIRM="${PLUGIN_ROOT}/hooks/wave-confirm.sh"

if [[ -f "$HOOKS_JSON" ]]; then
  HJ=$(cat "$HOOKS_JSON")
  assert_contains "PreToolUse event" "$HJ" "PreToolUse"
  assert_contains "Bash tool target" "$HJ" "Bash"
  assert_contains "wave-confirm.sh reference" "$HJ" "wave-confirm.sh"
fi

if [[ -f "$WAVE_CONFIRM" ]]; then
  WC=$(cat "$WAVE_CONFIRM")
  assert_contains "Detects start-wave.sh" "$WC" "start-wave.sh"
  assert_contains "Checks --confirmed" "$WC" "\-\-confirmed"
  assert_contains "Calls preview API" "$WC" "wave/preview"
  assert_contains "Exit 2 to block" "$WC" "exit 2"
  assert_contains "Is executable" "$(test -x "$WAVE_CONFIRM" && echo "EXEC")" "EXEC"
fi

# =============================================================================
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "S-05: TUI confirmation flow"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

TUI_SRC="${PLUGIN_ROOT}/../tui/src"
if [[ -d "$TUI_SRC" ]]; then
  assert_contains "previewWave import" "$(cat "$TUI_SRC"/hooks/useCommand.ts 2>/dev/null)" "previewWave"
  assert_contains "wave_preview result" "$(cat "$TUI_SRC"/hooks/useCommand.ts 2>/dev/null)" "wave_preview"
  assert_contains "pendingWaveConfirm state" "$(cat "$TUI_SRC"/app.tsx 2>/dev/null)" "pendingWaveConfirm"
  assert_contains "Wave Confirmation text" "$(cat "$TUI_SRC"/app.tsx 2>/dev/null)" "Wave Confirmation"
  assert_contains "Continuous mode help" "$(cat "$TUI_SRC"/app.tsx 2>/dev/null)" "Continuous mode"
else
  echo "  [SKIP] TUI source not found"
  SKIP=$((SKIP + 1))
fi

# =============================================================================
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "S-06: Model override runtime"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

EM_FILE="${SERVER_SRC}/api/src/services/execution-manager.ts"
if [[ -f "$EM_FILE" ]]; then
  EM=$(cat "$EM_FILE")
  assert_contains "modelOverrides lookup" "$EM" "modelOverrides"
  assert_contains "model override log" "$EM" "Model override"
fi

SH_FILE2="${SERVER_SRC}/api/src/services/supervisor-heartbeat.ts"
if [[ -f "$SH_FILE2" ]]; then
  SH2=$(cat "$SH_FILE2")
  assert_contains "Heartbeat accepts modelOverrides" "$SH2" "modelOverrides"
fi

# =============================================================================
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "S-07: Wave analysis + report endpoints"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

if [[ -f "$EXEC_FILE" ]]; then
  EX=$(cat "$EXEC_FILE")
  assert_contains "handleWaveAnalysis" "$EX" "handleWaveAnalysis"
  assert_contains "estimateCost import" "$EX" "estimateCost"
  assert_contains "getTokenLedger import" "$EX" "getTokenLedger"
  assert_contains "orphan detection" "$EX" "orphans"
  assert_contains "handleWaveReport" "$EX" "handleWaveReport"
  assert_contains "markdown report" "$EX" "text/markdown"
  assert_contains "dispatch tree" "$EX" "Dispatch Tree"
fi

ANALYSIS_SH="${PLUGIN_ROOT}/scripts/analysis.sh"
if [[ -f "$ANALYSIS_SH" ]]; then
  assert_contains "analysis calls endpoint" "$(cat "$ANALYSIS_SH")" "/api/waves/\${WAVE_ID}/analysis"
  assert_contains "analysis has fallback" "$(cat "$ANALYSIS_SH")" "Fallback"
fi

REPORT_SH="${PLUGIN_ROOT}/scripts/report.sh"
assert_file_exists "report.sh exists" "$REPORT_SH"
assert_file_exists "report command exists" "${PLUGIN_ROOT}/commands/report.md"

# =============================================================================
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "S-08: Wave isolation"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

RUNNER_TS="${SERVER_SRC}/api/src/engine/runners/claude-cli.ts"
if [[ -f "$RUNNER_TS" ]]; then
  RT=$(cat "$RUNNER_TS")
  assert_contains "TYCONO_WAVE_ID env" "$RT" "TYCONO_WAVE_ID"
  assert_contains "TYCONO_ROLE_ID env" "$RT" "TYCONO_ROLE_ID"
  assert_contains "detached spawn" "$RT" "detached: true"
fi

CANCEL_SH="${PLUGIN_ROOT}/scripts/cancel.sh"
if [[ -f "$CANCEL_SH" ]]; then
  CS=$(cat "$CANCEL_SH")
  assert_contains "cancel wave-scoped PID" "$CS" "wave-\${WAVE_ID}-"
  assert_contains "cancel TYCONO_WAVE_ID" "$CS" "TYCONO_WAVE_ID"
fi

STATUS_SH="${PLUGIN_ROOT}/scripts/status.sh"
if [[ -f "$STATUS_SH" ]]; then
  SS=$(cat "$STATUS_SH")
  assert_contains "status uses analysis" "$SS" "/api/waves/"
  assert_contains "status parent-child tree" "$SS" "parentSessionId"
  assert_contains "status tree rendering" "$SS" "print_role"
fi

# =============================================================================
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "S-09: Board API (Task Board)"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

BOARD_ROUTE="${SERVER_SRC}/api/src/routes/board.ts"
BOARD_STORE="${SERVER_SRC}/api/src/services/board-store.ts"
BOARD_TYPES="${SERVER_SRC}/shared/types.ts"

assert_file_exists "board route exists" "$BOARD_ROUTE"
assert_file_exists "board store exists" "$BOARD_STORE"

if [[ -f "$BOARD_ROUTE" ]]; then
  BR=$(cat "$BOARD_ROUTE")
  assert_contains "Board create endpoint" "$BR" "POST.*board"
  assert_contains "Board get endpoint" "$BR" "GET.*board"
  assert_contains "Board task patch" "$BR" "PATCH.*tasks"
  assert_contains "Board task complete" "$BR" "complete"
fi

if [[ -f "$BOARD_TYPES" ]]; then
  assert_contains "BoardTask type" "$(cat "$BOARD_TYPES")" "interface BoardTask"
  assert_contains "Board type" "$(cat "$BOARD_TYPES")" "interface Board"
  assert_contains "BoardTaskStatus type" "$(cat "$BOARD_TYPES")" "BoardTaskStatus"
fi

BOARD_CMD="${PLUGIN_ROOT}/commands/board.md"
BOARD_SH="${PLUGIN_ROOT}/scripts/board.sh"
assert_file_exists "board command exists" "$BOARD_CMD"
assert_file_exists "board script exists" "$BOARD_SH"
if [[ -f "$BOARD_SH" ]]; then
  BS=$(cat "$BOARD_SH")
  assert_contains "board view action" "$BS" "view_board"
  assert_contains "board skip action" "$BS" "skip_task"
  assert_contains "board edit action" "$BS" "edit_task"
  assert_contains "board add action" "$BS" "add_task"
  assert_contains "board uses board API" "$BS" "/api/waves/"
fi

# =============================================================================
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "S-10: Template system"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

if [[ -f "$BOARD_STORE" ]]; then
  BST=$(cat "$BOARD_STORE")
  assert_contains "saveTemplate function" "$BST" "saveTemplate"
  assert_contains "getTemplate function" "$BST" "getTemplate"
  assert_contains "listTemplates function" "$BST" "listTemplates"
  assert_contains "createBoardFromTemplate" "$BST" "createBoardFromTemplate"
fi

if [[ -f "$BOARD_ROUTE" ]]; then
  BRT=$(cat "$BOARD_ROUTE")
  assert_contains "POST /api/templates route" "$BRT" "templates.*POST\|POST.*templates"
  assert_contains "GET /api/templates route" "$BRT" "templates.*GET\|GET.*templates"
fi

assert_contains "BoardTemplate type" "$(cat "$BOARD_TYPES")" "interface BoardTemplate"

if [[ -f "$BOARD_SH" ]]; then
  assert_contains "board save command" "$(cat "$BOARD_SH")" "save_template"
  assert_contains "board templates command" "$(cat "$BOARD_SH")" "list_templates"
fi

# =============================================================================
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "S-11: Dashboard UI file"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

# React dashboard (Vite + React Flow)
UI_SRC="${SERVER_SRC}/ui/src"
assert_file_exists "App.jsx exists" "${UI_SRC}/App.jsx"

if [[ -f "${UI_SRC}/App.jsx" ]]; then
  APP=$(cat "${UI_SRC}/App.jsx")
  assert_contains "imports ReactFlow" "$APP" "ReactFlow"
  assert_contains "imports AgentNode" "$APP" "AgentNode"
  assert_contains "imports ActivityFeed" "$APP" "ActivityFeed"
  assert_contains "imports TaskDetail" "$APP" "TaskDetail"
  assert_contains "imports dagre layout" "$APP" "applyDagreLayout"
  assert_contains "SSE EventSource" "$APP" "EventSource"
  assert_contains "board API fetch" "$APP" "/board"
  assert_contains "skip action" "$APP" "skipped"
  assert_contains "wave selector" "$APP" "selectWave"
fi

assert_file_exists "AgentNode.jsx exists" "${UI_SRC}/AgentNode.jsx"
assert_file_exists "TaskDetail.jsx exists" "${UI_SRC}/TaskDetail.jsx"
assert_file_exists "layout.js exists" "${UI_SRC}/layout.js"

# Check /ui route in server
CREATE_SERVER="${SERVER_SRC}/api/src/create-server.ts"
if [[ -f "$CREATE_SERVER" ]]; then
  assert_contains "/ui route registered" "$(cat "$CREATE_SERVER")" "/ui"
fi

# =============================================================================
# Summary
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
TOTAL=$((PASS + FAIL + SKIP))
echo "Static: $PASS passed, $FAIL failed, $SKIP skipped (total $TOTAL)"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

[[ $FAIL -eq 0 ]]
