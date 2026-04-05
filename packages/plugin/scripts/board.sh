#!/bin/bash

# Tycono Plugin — Task Board viewer/editor
# Usage:
#   board.sh              — View current board
#   board.sh skip <id>    — Skip a task
#   board.sh edit <id> "new content" — Edit task title/criteria
#   board.sh add "title" --assign <role> — Add task

set -uo pipefail
export PYTHONIOENCODING=utf-8
export LC_ALL=en_US.UTF-8

STATE_FILE=".claude/tycono.local.md"

if [[ ! -f "$STATE_FILE" ]]; then
  echo "No active Tycono wave."
  echo "Start one with: /tycono \"your task\""
  exit 0
fi

# Parse state
eval "$(python3 -c "
import re, sys
text = open('$STATE_FILE', encoding='utf-8', errors='replace').read()
m = re.search(r'^---\n(.*?)\n---', text, re.DOTALL)
if not m:
    sys.exit(1)
for line in m.group(1).strip().split('\n'):
    k, _, v = line.partition(':')
    k = k.strip().upper().replace('-', '_')
    v = v.strip().strip('\"')
    print(f'{k}={repr(v)}')
")"

WAVE_ID="${WAVE_ID:-}"
API_URL="${API_URL:-}"

if [[ -z "$WAVE_ID" ]] || [[ -z "$API_URL" ]]; then
  echo "❌ Invalid state file"
  exit 1
fi

ACTION="${1:-view}"
shift 2>/dev/null || true

# ─── View board ──────────────────────────────
view_board() {
  local BOARD
  BOARD=$(curl -s --max-time 5 "${API_URL}/api/waves/${WAVE_ID}/board" 2>/dev/null)

  if echo "$BOARD" | python3 -c "import sys,json; d=json.load(sys.stdin); assert 'tasks' in d" 2>/dev/null; then
    python3 -c "
import json, sys

board = json.loads('''$BOARD''')
directive = board.get('directive', '')
tasks = board.get('tasks', [])
history = board.get('history', [])

status_icons = {
    'waiting': '⏳',
    'running': '🔄',
    'done': '✅',
    'blocked': '🚫',
    'skipped': '⏭',
}

print(f'Wave: {board[\"waveId\"]}')
print(f'Directive: {directive[:80]}')
print('━' * 70)
print(f'{\"#\":<4} {\"Task\":<25} {\"Assignee\":<12} {\"Status\":<10} {\"Criteria\"}')
print('─' * 70)

for t in tasks:
    icon = status_icons.get(t['status'], '?')
    deps = ''
    if t.get('dependsOn'):
        deps = f' ← depends {t[\"dependsOn\"]}'
    criteria = (t.get('criteria') or '')[:30]
    print(f'{t[\"id\"]:<4} {t[\"title\"][:25]:<25} {t[\"assignee\"]:<12} {icon} {t[\"status\"]:<8} {criteria}{deps}')

if history:
    print()
    print('History:')
    for h in history:
        result_icon = '✅' if h.get('result') == 'pass' else '❌'
        print(f'  {result_icon} {h[\"taskId\"]}: {h.get(\"note\", \"\")[:50]}')

done_count = sum(1 for t in tasks if t['status'] in ('done', 'skipped'))
print(f'\nProgress: {done_count}/{len(tasks)} tasks complete')
"
  else
    echo "No board for wave ${WAVE_ID}."
    echo "Board is auto-created when a wave starts with dispatch."
  fi
}

# ─── Skip task ───────────────────────────────
skip_task() {
  local TASK_ID="$1"
  if [[ -z "$TASK_ID" ]]; then
    echo "Usage: board.sh skip <task-id>"
    exit 1
  fi

  local RESULT
  RESULT=$(curl -s --max-time 5 -X PATCH \
    "${API_URL}/api/waves/${WAVE_ID}/board/tasks/${TASK_ID}" \
    -H "Content-Type: application/json" \
    -d '{"status":"skipped"}' 2>/dev/null)

  if echo "$RESULT" | python3 -c "import sys,json; d=json.load(sys.stdin); assert 'tasks' in d" 2>/dev/null; then
    echo "⏭ Task ${TASK_ID} skipped."
    view_board
  else
    echo "❌ Failed to skip task ${TASK_ID}"
    echo "$RESULT"
  fi
}

# ─── Edit task ───────────────────────────────
edit_task() {
  local TASK_ID="$1"
  shift 2>/dev/null || true
  local NEW_CONTENT="$*"

  if [[ -z "$TASK_ID" ]] || [[ -z "$NEW_CONTENT" ]]; then
    echo "Usage: board.sh edit <task-id> \"new title or criteria\""
    exit 1
  fi

  local RESULT
  RESULT=$(curl -s --max-time 5 -X PATCH \
    "${API_URL}/api/waves/${WAVE_ID}/board/tasks/${TASK_ID}" \
    -H "Content-Type: application/json" \
    -d "{\"title\":$(python3 -c "import json; print(json.dumps('$NEW_CONTENT'))")}" 2>/dev/null)

  if echo "$RESULT" | python3 -c "import sys,json; d=json.load(sys.stdin); assert 'tasks' in d" 2>/dev/null; then
    echo "✏️ Task ${TASK_ID} updated."
    view_board
  else
    echo "❌ Failed to edit task ${TASK_ID}"
    echo "$RESULT"
  fi
}

# ─── Add task ────────────────────────────────
add_task() {
  local TITLE=""
  local ASSIGNEE=""

  while [[ $# -gt 0 ]]; do
    case "$1" in
      --assign) ASSIGNEE="$2"; shift 2 ;;
      *) TITLE="$1"; shift ;;
    esac
  done

  if [[ -z "$TITLE" ]] || [[ -z "$ASSIGNEE" ]]; then
    echo "Usage: board.sh add \"Task title\" --assign <role-id>"
    exit 1
  fi

  # Generate task ID
  local BOARD
  BOARD=$(curl -s --max-time 5 "${API_URL}/api/waves/${WAVE_ID}/board" 2>/dev/null)
  local TASK_COUNT
  TASK_COUNT=$(echo "$BOARD" | python3 -c "import sys,json; print(len(json.load(sys.stdin).get('tasks',[])))" 2>/dev/null || echo "0")
  local NEW_ID="t$((TASK_COUNT + 1))"

  local RESULT
  RESULT=$(curl -s --max-time 5 -X POST \
    "${API_URL}/api/waves/${WAVE_ID}/board/tasks" \
    -H "Content-Type: application/json" \
    -d "{\"id\":\"${NEW_ID}\",\"title\":$(python3 -c "import json; print(json.dumps('$TITLE'))"),\"assignee\":\"${ASSIGNEE}\",\"status\":\"waiting\",\"dependsOn\":[]}" 2>/dev/null)

  if echo "$RESULT" | python3 -c "import sys,json; d=json.load(sys.stdin); assert 'tasks' in d" 2>/dev/null; then
    echo "➕ Task ${NEW_ID} added."
    view_board
  else
    echo "❌ Failed to add task"
    echo "$RESULT"
  fi
}

# ─── Route ───────────────────────────────────
case "$ACTION" in
  view|"") view_board ;;
  skip) skip_task "$@" ;;
  edit) edit_task "$@" ;;
  add) add_task "$@" ;;
  *)
    echo "Unknown action: $ACTION"
    echo "Usage: board.sh [view|skip|edit|add]"
    exit 1
    ;;
esac
