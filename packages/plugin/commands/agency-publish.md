---
description: "Publish an agency to the tycono.ai marketplace"
argument-hint: "<agency-id> [--update]"
allowed-tools: ["Bash(${CLAUDE_PLUGIN_ROOT}/scripts/agency-publish.sh *)", "Bash(${CLAUDE_PLUGIN_ROOT}/scripts/agency-publish.sh)"]
---

# Agency Publish

Run the following Bash command to publish an agency:

```
"${CLAUDE_PLUGIN_ROOT}/scripts/agency-publish.sh" $ARGUMENTS
```

IMPORTANT: You MUST execute the above command using the Bash tool. Do NOT skip this step.

If no arguments are provided, explain the usage:
- Publish to marketplace: `/tycono:agency-publish market-intel`
- Update existing: `/tycono:agency-publish market-intel --update`

After publishing, tell the user:
- The agency is available at `https://tycono.ai/agencies/<id>`
- Others can install it with `/tycono:agency-install <id>`
