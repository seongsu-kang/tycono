#!/bin/bash

# Tycono Plugin — Agency Install
# Installs to ~/.tycono/agencies/ (global) by default
# Use --local to install to .tycono/agencies/ (project-specific)

set -euo pipefail
export PYTHONIOENCODING=utf-8
export LC_ALL=en_US.UTF-8

SOURCE=""
LOCAL_MODE=false

while [[ $# -gt 0 ]]; do
  case $1 in
    --local) LOCAL_MODE=true; shift ;;
    *) SOURCE="$1"; shift ;;
  esac
done

if [[ -z "$SOURCE" ]]; then
  echo "❌ Error: Agency ID or URL required." >&2
  echo "" >&2
  echo "  Usage:" >&2
  echo "    agency-install <agency-id>                        Install from tycono.ai" >&2
  echo "    agency-install <agency-id> --local                Install to project only" >&2
  echo "    agency-install https://github.com/user/repo       Install from GitHub" >&2
  echo "" >&2
  echo "  Agencies are installed to ~/.tycono/agencies/ (global) by default." >&2
  echo "  Use --local to install to .tycono/agencies/ (project only)." >&2
  exit 1
fi

if [[ "$LOCAL_MODE" == true ]]; then
  AGENCIES_DIR=".tycono/agencies"
  LOCATION_TAG="local"
else
  AGENCIES_DIR="$HOME/.tycono/agencies"
  LOCATION_TAG="global"
fi
mkdir -p "$AGENCIES_DIR"

# --- GitHub Install ---
if [[ "$SOURCE" == https://github.com/* ]]; then
  echo "📦 Installing agency from GitHub ($LOCATION_TAG)..."
  echo "   Source: $SOURCE"
  echo ""

  REPO_NAME=$(basename "$SOURCE" .git)
  AGENCY_ID=$(echo "$REPO_NAME" | sed 's/^agency-//' | tr '[:upper:]' '[:lower:]')
  AGENCY_DIR="${AGENCIES_DIR}/${AGENCY_ID}"

  if [[ -d "$AGENCY_DIR" ]]; then
    echo "⚠️  Agency '${AGENCY_ID}' already exists. Updating..."
    rm -rf "$AGENCY_DIR"
  fi

  TEMP_DIR=$(mktemp -d)
  trap 'rm -rf "$TEMP_DIR"' EXIT

  if git clone --depth 1 "$SOURCE" "$TEMP_DIR/repo" 2>/dev/null; then
    if [[ -f "$TEMP_DIR/repo/agency.yaml" ]]; then
      mkdir -p "$AGENCY_DIR"
      cp -r "$TEMP_DIR/repo/"* "$AGENCY_DIR/"
      rm -rf "$AGENCY_DIR/.git" "$AGENCY_DIR/.github"
    elif [[ -f "$TEMP_DIR/repo/agency/agency.yaml" ]]; then
      mkdir -p "$AGENCY_DIR"
      cp -r "$TEMP_DIR/repo/agency/"* "$AGENCY_DIR/"
    else
      echo "❌ Error: No agency.yaml found in repository." >&2
      exit 1
    fi

    echo "✅ Agency '${AGENCY_ID}' installed ($LOCATION_TAG)!"
    echo ""
    echo "  📁 Location: ${AGENCY_DIR}/"
    echo "  Use: /tycono --agency ${AGENCY_ID} \"your task\""
  else
    echo "❌ Error: Failed to clone repository." >&2
    exit 1
  fi

  echo ""
  echo "🌐 Find more agencies: https://tycono.ai/agencies"
  exit 0
fi

# --- Marketplace Install ---
AGENCY_ID="$SOURCE"
echo "📦 Installing agency '${AGENCY_ID}' from tycono.ai ($LOCATION_TAG)..."
echo ""

API_URL="https://tycono.ai/api/agencies/${AGENCY_ID}/download"

HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" --max-time 10 "$API_URL" 2>/dev/null || echo "000")

if [[ "$HTTP_CODE" == "200" ]]; then
  AGENCY_DIR="${AGENCIES_DIR}/${AGENCY_ID}"
  mkdir -p "$AGENCY_DIR"

  TEMP_FILE=$(mktemp)
  trap 'rm -f "$TEMP_FILE"' EXIT

  curl -s --max-time 30 "$API_URL" -o "$TEMP_FILE"

  if file "$TEMP_FILE" | grep -q 'gzip'; then
    tar -xzf "$TEMP_FILE" -C "$AGENCY_DIR"
  else
    cp "$TEMP_FILE" "$AGENCY_DIR/agency.yaml"
  fi

  echo "✅ Agency '${AGENCY_ID}' installed ($LOCATION_TAG)!"
  echo ""
  echo "  📁 Location: ${AGENCY_DIR}/"
  echo "  Use: /tycono --agency ${AGENCY_ID} \"your task\""
else
  echo "⚠️  Agency '${AGENCY_ID}' not found on tycono.ai (HTTP $HTTP_CODE)"
  echo ""
  echo "  The Tycono Agency Hub is coming soon."
  echo "  In the meantime, you can:"
  echo ""
  echo "    1. Create a custom agency:"
  echo "       /tycono:agency-create"
  echo ""
  echo "    2. Install from GitHub:"
  echo "       /tycono:agency-install https://github.com/tycono/agency-${AGENCY_ID}"
  echo ""
  echo "    3. Browse available agencies:"
  echo "       /tycono:agency-list"
fi

echo ""
echo "🌐 Browse agencies: https://tycono.ai/agencies"
