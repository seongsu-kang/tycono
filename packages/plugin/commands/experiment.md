---
description: "Run A/B experiments — compare server versions/features in isolated sandboxes. WHEN: user asks to compare versions, run experiment, A/B test, or benchmark different configs."
allowed-tools: ["Bash(curl *)"]
---

# Experiment — Sandbox A/B Testing

First, find the server URL:

```bash
HEADLESS=$(find . -name "headless.json" -path "*/.tycono/*" 2>/dev/null | head -1)
if [[ -n "$HEADLESS" ]]; then
  API_URL="http://localhost:$(python3 -c "import json; print(json.load(open('$HEADLESS'))['port'])")"
else
  API_URL="http://localhost:3001"
fi
echo "API: $API_URL"
```

## Actions

### Create Experiment

Create isolated sandboxes with different server versions and run the same directive:

```bash
curl -s -X POST "${API_URL}/api/experiments" \
  -H "Content-Type: application/json" \
  -d '{
    "directive": "USER_DIRECTIVE_HERE",
    "agencyId": "AGENCY_ID",
    "runs": [
      { "serverVersion": "0.2.7", "features": ["baseline"] },
      { "serverVersion": "0.2.8", "features": ["wave-briefing", "ceo-prompt"] }
    ]
  }'
```

### Check Status

```bash
curl -s "${API_URL}/api/experiments" | python3 -m json.tool
curl -s "${API_URL}/api/experiments/{expId}" | python3 -m json.tool
```

### Cleanup

```bash
curl -s -X DELETE "${API_URL}/api/experiments/{expId}"
```

## Your Job

1. Ask the user what they want to compare (versions? features? agency configs?)
2. Create the experiment with appropriate runs
3. Poll status until done
4. Fetch benchmarks from each run and **create a comparison table**
5. Provide verdict: which config won, by how much, and why

## Comparison Format

```
Experiment: exp-{id}
Directive: "{directive}"

| Metric          | Run A (v0.2.7)  | Run B (v0.2.8)  | Delta   |
|-----------------|-----------------|-----------------|---------|
| Total Cost      | $5.23           | $2.85           | -45% ✅ |
| CEO Cost        | $1.50           | $0.80           | -47% ✅ |
| CEO Bash        | 3               | 1               | -67% ✅ |
| Total Turns     | 33              | 22              | -33% ✅ |
| Duration        | 2m              | 1.3m            | -35% ✅ |
| Features        | [baseline]      | [wave-briefing] |         |

Verdict: ✅ Run B (v0.2.8 + wave-briefing) is 45% cheaper.
```

## Notes

- Each run creates an isolated sandbox (tmpdir) with its own server + port
- npm install per sandbox — first run slow (~2min), subsequent fast (npm cache)
- Sandbox servers auto-cleanup on DELETE
- CEO direct-answer waves won't produce benchmarks (no dispatch = no supervisor completion path)
- For meaningful comparison, use directives that trigger dispatch
