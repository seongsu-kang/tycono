#!/bin/bash
# Tycono — Wave Report
# Generates markdown report from /api/waves/:waveId/report

set -uo pipefail
export PYTHONIOENCODING=utf-8

# Find server
API_URL=""
HEADLESS_JSON=".tycono/headless.json"
if [[ -f "$HEADLESS_JSON" ]]; then
  PORT=$(python3 -c "import json; print(json.load(open('$HEADLESS_JSON'))['port'])" 2>/dev/null || echo "")
  if [[ -n "$PORT" ]] && curl -s --max-time 2 "http://localhost:${PORT}/api/health" >/dev/null 2>&1; then
    API_URL="http://localhost:${PORT}"
  fi
fi

if [[ -z "$API_URL" ]]; then
  for PORT_CHECK in 4321 4322 4323; do
    if curl -s --max-time 1 "http://localhost:${PORT_CHECK}/api/health" >/dev/null 2>&1; then
      API_URL="http://localhost:${PORT_CHECK}"
      break
    fi
  done
fi

if [[ -z "$API_URL" ]]; then
  echo "❌ No Tycono server found. Start a wave first."
  exit 1
fi

# Get active wave ID (or use arg)
WAVE_ID="${1:-}"
if [[ -z "$WAVE_ID" ]]; then
  WAVE_ID=$(curl -s "${API_URL}/api/waves/active" 2>/dev/null | python3 -c "
import json, sys
data = json.load(sys.stdin)
waves = data.get('waves', data) if isinstance(data, dict) else data
if isinstance(waves, list) and waves:
    print(waves[0].get('id', waves[0].get('waveId', '')))
elif isinstance(waves, dict):
    print(waves.get('id', waves.get('waveId', '')))
" 2>/dev/null || echo "")
fi

if [[ -z "$WAVE_ID" ]]; then
  # Try from state file
  STATE_FILE=".claude/tycono.local.md"
  if [[ -f "$STATE_FILE" ]]; then
    WAVE_ID=$(python3 -c "
import re
text = open('$STATE_FILE', encoding='utf-8', errors='replace').read()
m = re.search(r'wave-id:\s*\"?([^\"\n]+)', text)
if m: print(m.group(1).strip())
" 2>/dev/null || echo "")
  fi
fi

if [[ -z "$WAVE_ID" ]]; then
  echo "❌ No active or recent wave found."
  exit 1
fi

# Fetch report
REPORT=$(curl -s --max-time 10 "${API_URL}/api/waves/${WAVE_ID}/report" 2>/dev/null || echo "")

if [[ -z "$REPORT" ]] || echo "$REPORT" | grep -q '"error"'; then
  echo "❌ Could not generate report for wave $WAVE_ID"
  echo "$REPORT"
  exit 1
fi

echo "$REPORT"
