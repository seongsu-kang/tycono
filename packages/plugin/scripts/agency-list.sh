#!/bin/bash

# Tycono Plugin — Agency List
# Scans 3 locations: local (.tycono/agencies), global (~/.tycono/agencies), bundled (plugin)
# Local overrides global, global overrides bundled.

set -euo pipefail
export PYTHONIOENCODING=utf-8
export LC_ALL=en_US.UTF-8

PLUGIN_ROOT="${CLAUDE_PLUGIN_ROOT:-$(cd "$(dirname "$0")/.." && pwd)}"
LOCAL_DIR=".tycono/agencies"
GLOBAL_DIR="$HOME/.tycono/agencies"
BUNDLED_DIR="${PLUGIN_ROOT}/bootstrap/agencies"
# Backward compat: also check knowledge/agencies
LEGACY_DIR="knowledge/agencies"

echo "📋 Tycono Agencies"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

COUNT=0
SHOWN_IDS=()

show_agency() {
  local AGENCY_DIR="$1"
  local TAG="$2"

  local AGENCY_FILE="${AGENCY_DIR}/agency.yaml"
  if [[ ! -f "$AGENCY_FILE" ]]; then
    AGENCY_FILE="${AGENCY_DIR}/preset.yaml"
  fi
  [[ ! -f "$AGENCY_FILE" ]] && return

  local ID NAME DESC ROLES
  ID=$(grep -m1 '^id:' "$AGENCY_FILE" | sed 's/id: *//' | tr -d '"' 2>/dev/null || echo "?")
  NAME=$(grep -m1 '^name:' "$AGENCY_FILE" | sed 's/name: *//' | tr -d '"' 2>/dev/null || echo "?")
  DESC=$(grep -m1 '^description:' "$AGENCY_FILE" | sed 's/description: *//' | tr -d '"' | head -c 80 2>/dev/null || echo "")
  ROLES=$(sed -n '/^roles:/,/^[^ ]/{ /^ *- /p; }' "$AGENCY_FILE" | sed 's/^ *- //' | tr '\n' ', ' | sed 's/,$//' 2>/dev/null || echo "")

  for shown in "${SHOWN_IDS[@]+"${SHOWN_IDS[@]}"}"; do
    [[ "$shown" == "$ID" ]] && return
  done
  SHOWN_IDS+=("$ID")

  echo "  🏢 $NAME ($ID) $TAG"
  [[ -n "$DESC" ]] && echo "     $DESC"
  echo "     Roles: $ROLES"
  echo "     Use: /tycono --agency $ID \"your task\""
  echo ""

  COUNT=$((COUNT + 1))
}

# 1. Local (.tycono/agencies/) — project-specific, highest priority
if [[ -d "$LOCAL_DIR" ]]; then
  for DIR in "$LOCAL_DIR"/*/; do
    [[ -d "$DIR" ]] && show_agency "$DIR" "[local]"
  done
fi

# 2. Legacy (knowledge/agencies/) — backward compat
if [[ -d "$LEGACY_DIR" ]]; then
  for DIR in "$LEGACY_DIR"/*/; do
    [[ -d "$DIR" ]] && show_agency "$DIR" "[project]"
  done
fi

# 3. Global (~/.tycono/agencies/) — user-wide
if [[ -d "$GLOBAL_DIR" ]]; then
  for DIR in "$GLOBAL_DIR"/*/; do
    [[ -d "$DIR" ]] && show_agency "$DIR" "[global]"
  done
fi

# 4. Bundled (plugin bootstrap) — lowest priority
if [[ -d "$BUNDLED_DIR" ]]; then
  for DIR in "$BUNDLED_DIR"/*/; do
    [[ -d "$DIR" ]] && show_agency "$DIR" "[bundled]"
  done
fi

if [[ $COUNT -eq 0 ]]; then
  echo "  (no agencies found)"
  echo ""
fi

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "  Total: $COUNT agencies"
echo ""
echo "  Locations:"
echo "    .tycono/agencies/      Project-local agencies"
echo "    ~/.tycono/agencies/    Global agencies (shared across projects)"
echo ""
echo "  /tycono:agency-create            Create a custom agency (interactive)"
echo "  /tycono:agency-install <id>      Install from tycono.ai"
echo ""
echo "🌐 https://tycono.ai/agencies"
echo "   Browse & install agencies shared by the community."
