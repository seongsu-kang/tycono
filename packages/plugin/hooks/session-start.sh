#!/bin/bash
# Tycono — Session Start Hook
# 1. Injects Tycono awareness into Claude's context
# 2. Auto-installs/updates tycono-server in PLUGIN_DATA (background)

# ── Context injection ──
cat << 'TYCONO_CONTEXT'
You have Tycono installed — an AI team orchestration plugin.

## What you can do:
- `/tycono "task"` — Dispatch an AI team (CEO, CTO, Engineer, QA, etc.) to work on a task in the background
- `/tycono:agency-create` — Guided setup: scan project → design team → auto-generate → auto-verify
- `/tycono:tycono-status` — Check wave progress
- `/tycono:help` — Full command reference

## Key facts:
- Waves run in background. You'll get notifications for important events (errors, decisions needed, completion).
- Each role's full work log is at `.tycono/activity-streams/ses-{role}-*.jsonl`
- Custom agencies: `/tycono:agency-create` walks you through setup for your existing project
- Set default agency: `{ "defaultAgency": "your-id" }` in `.tycono/config.json`

## When user asks about Tycono:
Use `/tycono:help` for the full guide. For questions about results/logs, point to `.tycono/activity-streams/`.
TYCONO_CONTEXT

# ── Server auto-install/update (background, non-blocking) ──
(
  PLUGIN_DATA="${CLAUDE_PLUGIN_DATA:-$HOME/.tycono/plugin-data}"
  SERVER_DIR="$PLUGIN_DATA/server"
  LOCK_FILE="$PLUGIN_DATA/.server-update.lock"

  # Prevent concurrent updates
  if [[ -f "$LOCK_FILE" ]]; then
    LOCK_AGE=$(( $(date +%s) - $(stat -f %m "$LOCK_FILE" 2>/dev/null || stat -c %Y "$LOCK_FILE" 2>/dev/null || echo 0) ))
    if [[ $LOCK_AGE -lt 120 ]]; then
      exit 0  # Another update in progress
    fi
    rm -f "$LOCK_FILE"  # Stale lock
  fi

  mkdir -p "$SERVER_DIR"
  touch "$LOCK_FILE"
  trap 'rm -f "$LOCK_FILE"' EXIT

  # Check installed version
  INSTALLED_VER=""
  if [[ -f "$SERVER_DIR/node_modules/.bin/tycono-server" ]]; then
    INSTALLED_VER=$(node "$SERVER_DIR/node_modules/.bin/tycono-server" --version 2>/dev/null || echo "")
  fi

  # Check latest version (prefer offline cache for speed)
  LATEST_VER=$(npm view tycono-server version 2>/dev/null || echo "")

  if [[ -z "$LATEST_VER" ]]; then
    exit 0  # Can't reach npm, skip update
  fi

  if [[ "$INSTALLED_VER" == "$LATEST_VER" ]]; then
    exit 0  # Already up to date
  fi

  # Install/update
  cd "$SERVER_DIR"
  if [[ ! -f "package.json" ]]; then
    echo '{"private":true}' > package.json
  fi
  npm install "tycono-server@$LATEST_VER" --save --loglevel=error 2>/dev/null

  # Verify
  NEW_VER=$(node "$SERVER_DIR/node_modules/.bin/tycono-server" --version 2>/dev/null || echo "")
  if [[ -n "$NEW_VER" ]]; then
    echo "tycono-server $NEW_VER installed" > "$PLUGIN_DATA/.server-version"
  fi
) &>/dev/null &
