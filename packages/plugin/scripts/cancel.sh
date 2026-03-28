#!/bin/bash

# Tycono Plugin — Cancel Wave

set -euo pipefail

STATE_FILE=".claude/tycono.local.md"

if [[ ! -f "$STATE_FILE" ]]; then
  echo "No active Tycono wave to cancel."
  exit 0
fi

FRONTMATTER=$(sed -n '/^---$/,/^---$/{ /^---$/d; p; }' "$STATE_FILE")
WAVE_ID=$(echo "$FRONTMATTER" | grep '^wave_id:' | sed 's/wave_id: *//')
API_URL=$(echo "$FRONTMATTER" | grep '^api_url:' | sed 's/api_url: *//')

if [[ -n "$WAVE_ID" ]] && [[ -n "$API_URL" ]]; then
  curl -s -X POST "${API_URL}/api/waves/${WAVE_ID}/stop" >/dev/null 2>&1 || true
  echo "🛑 Wave $WAVE_ID cancelled."
else
  echo "⚠️ Could not find wave info in state file."
fi

rm -f "$STATE_FILE"
echo "State file cleaned up."
