---
description: "List installed agencies"
allowed-tools: ["Bash(${CLAUDE_PLUGIN_ROOT}/scripts/agency-list.sh *)", "Bash(${CLAUDE_PLUGIN_ROOT}/scripts/agency-list.sh)"]
---

# Agency List

Run the following Bash command to list all installed agencies:

```
"${CLAUDE_PLUGIN_ROOT}/scripts/agency-list.sh"
```

IMPORTANT: You MUST execute the above command using the Bash tool. Do NOT skip this step.

After the script runs, summarize the available agencies to the user. If no agencies are found, suggest creating one or installing from the marketplace.
