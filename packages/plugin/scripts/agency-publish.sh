#!/bin/bash

# Tycono Plugin — Agency Publish
# Packages and uploads an agency to the tycono.ai marketplace
# Auth: anonymous instanceId token from .tycono/preferences.json

set -euo pipefail
export PYTHONIOENCODING=utf-8
export LC_ALL=en_US.UTF-8

AGENCY_ID=""
UPDATE_MODE=false

while [[ $# -gt 0 ]]; do
  case $1 in
    --update) UPDATE_MODE=true; shift ;;
    *) AGENCY_ID="$1"; shift ;;
  esac
done

if [[ -z "$AGENCY_ID" ]]; then
  echo "❌ Error: Agency ID required." >&2
  echo "" >&2
  echo "  Usage:" >&2
  echo "    agency-publish <agency-id>              Publish to tycono.ai" >&2
  echo "    agency-publish <agency-id> --update     Update existing" >&2
  echo "" >&2
  echo "  The agency must exist in .tycono/agencies/ or ~/.tycono/agencies/" >&2
  exit 1
fi

# --- Locate agency directory ---
AGENCY_DIR=""
if [[ -d ".tycono/agencies/${AGENCY_ID}" ]]; then
  AGENCY_DIR=".tycono/agencies/${AGENCY_ID}"
elif [[ -d "$HOME/.tycono/agencies/${AGENCY_ID}" ]]; then
  AGENCY_DIR="$HOME/.tycono/agencies/${AGENCY_ID}"
fi

if [[ -z "$AGENCY_DIR" ]]; then
  echo "❌ Error: Agency '${AGENCY_ID}' not found." >&2
  echo "   Searched: .tycono/agencies/ and ~/.tycono/agencies/" >&2
  exit 1
fi

YAML_FILE="${AGENCY_DIR}/agency.yaml"
if [[ ! -f "$YAML_FILE" ]]; then
  echo "❌ Error: No agency.yaml found in ${AGENCY_DIR}/" >&2
  exit 1
fi

echo "📦 Preparing agency '${AGENCY_ID}' for publish..."
echo "   Source: ${AGENCY_DIR}/"

# --- Validate required fields ---
AGENCY_NAME=$(grep -m1 '^name:' "$YAML_FILE" | sed 's/^name:[[:space:]]*//' | sed 's/^"//' | sed 's/"$//')
AGENCY_VERSION=$(grep -m1 '^version:' "$YAML_FILE" | sed 's/^version:[[:space:]]*//' | sed 's/^"//' | sed 's/"$//')
HAS_ROLES=$(grep -c '^roles:' "$YAML_FILE" || true)

if [[ -z "$AGENCY_NAME" ]]; then
  echo "❌ Error: 'name' field missing in agency.yaml" >&2
  exit 1
fi

if [[ "$HAS_ROLES" -eq 0 ]]; then
  echo "❌ Error: 'roles' field missing in agency.yaml" >&2
  exit 1
fi

AGENCY_VERSION="${AGENCY_VERSION:-1.0.0}"
echo "   Name: ${AGENCY_NAME}"
echo "   Version: ${AGENCY_VERSION}"

# --- Read instanceId (anonymous token) ---
INSTANCE_ID=""

# Try local preferences first, then global
for PREF_PATH in ".tycono/preferences.json" "$HOME/.tycono/preferences.json"; do
  if [[ -f "$PREF_PATH" ]]; then
    INSTANCE_ID=$(python3 -c "import json; print(json.load(open('$PREF_PATH')).get('instanceId',''))" 2>/dev/null || echo "")
    if [[ -n "$INSTANCE_ID" ]]; then
      break
    fi
  fi
done

if [[ -z "$INSTANCE_ID" ]]; then
  echo "❌ Error: No instanceId found in preferences.json" >&2
  echo "   Run 'npx tycono' once to generate your identity token." >&2
  exit 1
fi

echo "   Publisher: ${INSTANCE_ID:0:8}..."

# --- Package as tar.gz ---
TEMP_DIR=$(mktemp -d)
trap 'rm -rf "$TEMP_DIR"' EXIT

ARCHIVE_PATH="${TEMP_DIR}/${AGENCY_ID}.tar.gz"
tar -czf "$ARCHIVE_PATH" -C "$AGENCY_DIR" .

ARCHIVE_SIZE=$(wc -c < "$ARCHIVE_PATH" | tr -d ' ')
echo "   Archive: ${ARCHIVE_SIZE} bytes"

# --- Convert to base64 ---
ARCHIVE_B64=$(base64 < "$ARCHIVE_PATH")

# --- Build metadata JSON from agency.yaml ---
# Use python3 for reliable YAML→JSON conversion
METADATA_JSON=$(python3 -c "
import json, sys

data = {}
current_key = None
current_list = None

with open('$YAML_FILE', 'r') as f:
    for line in f:
        line = line.rstrip()
        if not line or line.startswith('#'):
            continue

        # Handle list items
        if line.startswith('  - ') and current_key:
            if current_list is None:
                current_list = []
            current_list.append(line.strip('- ').strip())
            data[current_key] = current_list
            continue

        # Handle key: value
        if ':' in line and not line.startswith(' '):
            # Save previous list
            current_list = None

            parts = line.split(':', 1)
            key = parts[0].strip()
            val = parts[1].strip()

            # Handle inline lists like [a, b, c]
            if val.startswith('[') and val.endswith(']'):
                items = [x.strip().strip('\"').strip(\"'\") for x in val[1:-1].split(',')]
                data[key] = items
                current_key = key
                continue

            # Handle multiline (|)
            if val == '|':
                current_key = key
                data[key] = ''
                continue

            # Regular value
            val = val.strip('\"').strip(\"'\")
            if val:
                data[key] = val
            current_key = key

print(json.dumps(data))
" 2>/dev/null || echo '{}')

# --- Upload to tycono.ai ---
echo ""
echo "🚀 Uploading to tycono.ai..."

API_URL="https://tycono.ai/api/agencies/publish"

# Build request body
REQUEST_BODY=$(python3 -c "
import json, sys

metadata = json.loads('''$METADATA_JSON''')
archive_b64 = sys.stdin.read()

body = {
    'id': '$AGENCY_ID',
    'name': '$AGENCY_NAME',
    'version': '$AGENCY_VERSION',
    'data': metadata,
    'archive': archive_b64,
    'publisherId': '$INSTANCE_ID'
}

print(json.dumps(body))
" <<< "$ARCHIVE_B64")

TEMP_RESPONSE=$(mktemp)
HTTP_CODE=$(curl -s -w "%{http_code}" \
  -X POST "$API_URL" \
  -H "Content-Type: application/json" \
  -H "X-Instance-Id: ${INSTANCE_ID}" \
  --max-time 60 \
  -o "$TEMP_RESPONSE" \
  -d "$REQUEST_BODY" 2>/dev/null || echo "000")

HTTP_BODY=$(cat "$TEMP_RESPONSE" 2>/dev/null || echo "")
rm -f "$TEMP_RESPONSE"

echo ""

case "$HTTP_CODE" in
  200)
    echo "✅ Agency '${AGENCY_ID}' published successfully!"
    echo ""
    echo "  🌐 URL: https://tycono.ai/agencies/${AGENCY_ID}"
    echo "  📦 Install: /tycono:agency-install ${AGENCY_ID}"
    echo ""
    echo "  Others can install with:"
    echo "    /tycono:agency-install ${AGENCY_ID}"
    ;;
  403)
    echo "❌ Error: Not authorized." >&2
    echo "   Another user already published '${AGENCY_ID}'." >&2
    echo "   Only the original publisher can update this agency." >&2
    echo "" >&2
    echo "   Response: ${HTTP_BODY}" >&2
    exit 1
    ;;
  409)
    echo "⚠️  Agency '${AGENCY_ID}' already exists on marketplace." >&2
    echo "   Use --update flag to update: agency-publish ${AGENCY_ID} --update" >&2
    exit 1
    ;;
  429)
    echo "❌ Error: Rate limit exceeded." >&2
    echo "   Max 5 publishes per hour. Try again later." >&2
    exit 1
    ;;
  000)
    echo "❌ Error: Could not connect to tycono.ai" >&2
    echo "   Check your internet connection." >&2
    exit 1
    ;;
  *)
    echo "❌ Error: Upload failed (HTTP ${HTTP_CODE})" >&2
    echo "   ${HTTP_BODY}" >&2
    exit 1
    ;;
esac

echo ""
echo "🌐 Browse agencies: https://tycono.ai/agencies"
