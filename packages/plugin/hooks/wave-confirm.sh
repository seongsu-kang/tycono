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

# Try to find running server for preview — start one if needed
API_URL=""
HEADLESS_JSON=".tycono/headless.json"

# Check existing server
if [[ -f "$HEADLESS_JSON" ]]; then
  PORT=$(python3 -c "import json; print(json.load(open('$HEADLESS_JSON'))['port'])" 2>/dev/null || echo "")
  if [[ -n "$PORT" ]] && curl -s --max-time 2 "http://localhost:${PORT}/api/health" >/dev/null 2>&1; then
    API_URL="http://localhost:${PORT}"
  else
    # Stale headless.json — clean up
    rm -f "$HEADLESS_JSON"
  fi
fi

# Fallback: scan common ports
if [[ -z "$API_URL" ]]; then
  for PORT_CHECK in 4321 4322 4323; do
    if curl -s --max-time 1 "http://localhost:${PORT_CHECK}/api/health" >/dev/null 2>&1; then
      API_URL="http://localhost:${PORT_CHECK}"
      break
    fi
  done
fi

# No server found — start one for preview
if [[ -z "$API_URL" ]]; then
  npx tycono-server@latest >/dev/null 2>&1 &
  HOOK_SERVER_PID=$!

  # Wait for server (max 30s)
  for i in $(seq 1 30); do
    if [[ -f "$HEADLESS_JSON" ]]; then
      PORT=$(python3 -c "import json; print(json.load(open('$HEADLESS_JSON'))['port'])" 2>/dev/null || echo "")
      if [[ -n "$PORT" ]] && curl -s --max-time 1 "http://localhost:${PORT}/api/health" >/dev/null 2>&1; then
        API_URL="http://localhost:${PORT}"
        break
      fi
    fi
    sleep 1
  done
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

# Output preview to stderr (Claude Code shows stderr on exit 2)
{
  if [[ -n "$API_URL" ]]; then
    PREVIEW=$(curl -s -X POST "${API_URL}/api/exec/wave/preview" \
      -H "Content-Type: application/json" \
      -d "$BODY" 2>/dev/null || echo "")

    if [[ -n "$PREVIEW" ]] && echo "$PREVIEW" | python3 -c "import sys,json; json.load(sys.stdin)" 2>/dev/null; then
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
" 2>/dev/null || echo "Preview parsing failed"
    else
      echo ""
      echo "┌─ Wave Confirmation ─────────────────────────┐"
      echo "│ Directive: ${DIRECTIVE:0:40}"
      [[ -n "$CONTINUOUS" ]] && echo "│ Mode:      ⚠️  CONTINUOUS"
      [[ -n "$PRESET_MATCH" ]] && echo "│ Preset:    ${PRESET_MATCH}"
      echo "│ (Server started but preview API failed)"
      echo "└─────────────────────────────────────────────┘"
    fi
  else
    echo ""
    echo "┌─ Wave Confirmation ─────────────────────────┐"
    echo "│ Directive: ${DIRECTIVE:0:40}"
    [[ -n "$CONTINUOUS" ]] && echo "│ Mode:      ⚠️  CONTINUOUS"
    [[ -n "$PRESET_MATCH" ]] && echo "│ Preset:    ${PRESET_MATCH}"
    echo "│ (Server could not start — no team preview)"
    echo "└─────────────────────────────────────────────┘"
  fi

  echo ""
  echo "⛔ Wave dispatch requires user confirmation."
  echo "Show the preview above to the user and ask for approval."
  echo "If approved, re-run with --confirmed flag."
} >&2
exit 2
