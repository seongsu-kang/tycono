#!/bin/bash
# Tycono — Wave Pre-Dispatch Confirmation Hook (PreToolUse)
#
# Intercepts start-wave.sh calls and requires --confirmed flag.
# Without it: shows preview (team/model/cost) and blocks execution.
# With it: allows execution.
#
# This hook is harness-enforced — the AI cannot bypass it.

set -uo pipefail
# NOTE: -e removed intentionally. With -e, any intermediate grep/python3 failure
# kills the entire script with exit 1, which Claude Code interprets as "hook error".
# We need explicit error handling: exit 0 (allow) or exit 2 (block).

# Read tool input from stdin (JSON: { tool_name, tool_input: { command } })
INPUT=$(cat)

TOOL_NAME=$(echo "$INPUT" | python3 -c "import sys,json; print(json.load(sys.stdin).get('tool_name',''))" 2>/dev/null || echo "")
COMMAND=$(echo "$INPUT" | python3 -c "import sys,json; print(json.load(sys.stdin).get('tool_input',{}).get('command',''))" 2>/dev/null || echo "")

# Only intercept Bash tool calls containing start-wave.sh
if [[ "$TOOL_NAME" != "Bash" ]]; then
  exit 0
fi

# Only intercept actual execution of start-wave.sh
# Execution patterns:
#   1. "$SW" "directive"           (variable-based, after && )
#   2. start-wave.sh "directive"   (direct invocation)
#   3. /path/to/start-wave.sh "d"  (full path)
# Non-execution (should pass through):
#   - echo "...start-wave.sh..."   (just printing)
#   - ls -la "$SW"                 (just checking)
#   - find ... start-wave.sh       (searching)
#   - SW="...start-wave.sh"        (assignment only, no &&)

# Must contain start-wave.sh somewhere
if ! echo "$COMMAND" | grep -q "start-wave\.sh"; then
  exit 0
fi

# Must have an execution pattern: $SW with string args, or start-wave.sh with string args
HAS_EXEC="false"
# Pattern 1: "$SW" "args" or "$SW" --flag (variable execution with arguments)
echo "$COMMAND" | grep -qE '"\$SW"\s+["'"'"'-]' && HAS_EXEC="true"
echo "$COMMAND" | grep -qE '\$SW\s+["'"'"'-]' && HAS_EXEC="true"
# Pattern 2: start-wave.sh "args" or start-wave.sh --flag (direct with arguments)
echo "$COMMAND" | grep -qE 'start-wave\.sh\s+["'"'"'-]' && HAS_EXEC="true"

if [[ "$HAS_EXEC" != "true" ]]; then
  exit 0
fi

# If --confirmed flag is present, allow execution
if echo "$COMMAND" | grep -q "\-\-confirmed"; then
  exit 0
fi

# --- Block and show preview ---

# Extract directive from the command
# start-wave.sh [flags] "directive" or start-wave.sh [flags] directive words
DIRECTIVE=$(echo "$COMMAND" | sed 's/.*start-wave\.sh//' | sed 's/--agency [^ ]*//' | sed 's/--continuous//' | sed 's/--safe//' | sed 's/--confirmed//' | sed 's/^[[:space:]]*//' | sed 's/[[:space:]]*$//' | sed "s/^['\"]//;s/['\"]$//")

# Extract flags
CONTINUOUS=""
PRESET=""
if echo "$COMMAND" | grep -q "\-\-continuous"; then
  CONTINUOUS="true"
fi
PRESET_MATCH=$(echo "$COMMAND" | sed -n 's/.*--agency[[:space:]]\+\([^[:space:]]*\).*/\1/p' 2>/dev/null || echo "")

# Try to find running server for preview
API_URL=""
HEADLESS_JSON=".tycono/headless.json"
if [[ -f "$HEADLESS_JSON" ]]; then
  PORT=$(python3 -c "import json; print(json.load(open('$HEADLESS_JSON'))['port'])" 2>/dev/null || echo "")
  if [[ -n "$PORT" ]] && curl -s --max-time 2 "http://localhost:${PORT}/api/health" >/dev/null 2>&1; then
    API_URL="http://localhost:${PORT}"
  fi
fi

# Build preview request body
BODY="{\"directive\":\"${DIRECTIVE}\""
if [[ -n "$CONTINUOUS" ]]; then
  BODY="${BODY},\"continuous\":true"
fi
if [[ -n "$PRESET_MATCH" ]]; then
  BODY="${BODY},\"preset\":\"${PRESET_MATCH}\""
fi
BODY="${BODY}}"

# If server is available, get live preview
if [[ -n "$API_URL" ]]; then
  PREVIEW=$(curl -s -X POST "${API_URL}/api/exec/wave/preview" \
    -H "Content-Type: application/json" \
    -d "$BODY" 2>/dev/null || echo "")

  if [[ -n "$PREVIEW" ]] && echo "$PREVIEW" | python3 -c "import sys,json; json.load(sys.stdin)" 2>/dev/null; then
    # Parse and display preview (pass via stdin to avoid quote escaping issues)
    echo "$PREVIEW" | python3 -c "
import sys, json
d = json.load(sys.stdin)

print()
print('┌─ Wave Confirmation ─────────────────────────────────┐')
print(f'│ Directive: {d.get(\"directive\", \"(empty)\")[:45]}')
preset = d.get('preset')
if preset:
    auto = ' (auto-detected)' if d.get('presetAutoDetected') else ''
    print(f'│ Preset:    {d.get(\"presetName\", preset)}{auto}')
if d.get('continuous'):
    print(f'│ Mode:      ⚠️  CONTINUOUS (auto-restart until /stop)')
print('│')
print('│ Team:')
def show(roles, indent='│   '):
    for i, r in enumerate(roles):
        model = r['model'].replace('claude-','')
        print(f'{indent}{r[\"name\"]} → {model}')
        if r.get('children'):
            show(r['children'], indent + '  ')
show(d.get('team', []))
print('│')
agents = d.get('totalAgents', 0)
cost = d.get('estimatedCostPerRound', 0)
order = d.get('dispatchOrder', 'sequential')
print(f'│ Dispatch: {order}  Agents: {agents}  Est. cost: ~\${cost}/round')
print('└─────────────────────────────────────────────────────┘')
print()
" 2>/dev/null || echo "Preview parsing failed"
  fi
else
  # No server running — show basic info
  echo ""
  echo "┌─ Wave Confirmation ─────────────────────────┐"
  echo "│ Directive: ${DIRECTIVE:0:40}"
  [[ -n "$CONTINUOUS" ]] && echo "│ Mode:      ⚠️  CONTINUOUS"
  [[ -n "$PRESET_MATCH" ]] && echo "│ Preset:    ${PRESET_MATCH}"
  echo "│ (Server not running — no team preview)"
  echo "└─────────────────────────────────────────────┘"
  echo ""
fi

# Block execution — exit 2 sends stderr message back to Claude as feedback
echo "⛔ Wave dispatch blocked — user confirmation required." >&2
echo "" >&2
echo "The wave preview is shown above. To proceed, the user must approve." >&2
echo "Re-run the command with --confirmed flag:" >&2
echo "  start-wave.sh --confirmed ${COMMAND##*start-wave.sh}" >&2
exit 2
