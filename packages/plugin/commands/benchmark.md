---
description: "Compare wave performance — cost, turns, tool calls across waves. WHEN: user asks about benchmark, performance comparison, cost trend, or 'is it better?'"
allowed-tools: ["Bash(curl *)", "Bash(${CLAUDE_PLUGIN_ROOT}/scripts/version.sh *)"]
---

# Wave Benchmark — Cross-wave Performance Comparison

First, find the server URL by checking for a running server:

```bash
HEADLESS=$(find . -name "headless.json" -path "*/.tycono/*" 2>/dev/null | head -1)
if [[ -n "$HEADLESS" ]]; then
  API_URL="http://localhost:$(python3 -c "import json; print(json.load(open('$HEADLESS'))['port'])")"
else
  API_URL="http://localhost:3001"
fi
echo "API: $API_URL"
```

Then fetch all benchmarks:

```bash
curl -s "${API_URL}/api/benchmarks" 2>/dev/null
```

If an agencyId is specified:
```bash
curl -s "${API_URL}/api/benchmarks?agencyId=AGENCY_ID" 2>/dev/null
```

## Your Job

After fetching the benchmark data, **YOU analyze and compare**:

1. **If multiple benchmarks exist**: Create a comparison table showing:
   - Wave ID, Server Version, Features enabled
   - Total cost, per-role cost breakdown
   - CEO Bash calls, total turns, duration
   - Delta (%) from previous wave

2. **If only one benchmark**: Show the single wave metrics as a baseline.

3. **If no benchmarks**: Tell the user to run a wave first (`/tycono "task"`).

## Comparison Table Format

```
Wave Benchmark Comparison (agency: {agencyId})

| Metric          | Wave A (v0.2.7) | Wave B (v0.2.8) | Delta   |
|-----------------|-----------------|-----------------|---------|
| Total Cost      | $168.32         | $72.45          | -57% ✅ |
| CEO Cost        | $36.86          | $20.12          | -45% ✅ |
| CEO Bash Calls  | 31              | 5               | -84% ✅ |
| verdict-judge   | $54.09          | $12.30          | -77% ✅ |
| Total Turns     | 234             | 98              | -58% ✅ |
| Duration        | 12m             | 5m              | -58% ✅ |
| Features        | [none]          | [wave-briefing, ceo-prompt, briefing-first] |

Verdict: ✅ Significant improvement. Wave Briefing + CEO Prompt override effective.
```

## Judgment Criteria

| Metric | Improved | Degraded | Neutral |
|--------|----------|----------|---------|
| Cost   | -20%+    | +20%+    | ±20%    |
| Turns  | -30%+    | +30%+    | ±30%    |
| Duration | -20%+  | +20%+    | ±20%    |

IMPORTANT: Provide actionable insights, not just numbers. "verdict-judge cost exploded because it tried psql 3 times" is more useful than "verdict-judge +514%".
