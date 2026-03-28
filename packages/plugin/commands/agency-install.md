---
description: "Install an agency from marketplace or GitHub"
argument-hint: "<agency-id | github-url>"
allowed-tools: ["Bash(${CLAUDE_PLUGIN_ROOT}/scripts/agency-install.sh *)", "Bash(${CLAUDE_PLUGIN_ROOT}/scripts/agency-install.sh)"]
---

# Agency Install

Run the following Bash command to install an agency:

```
"${CLAUDE_PLUGIN_ROOT}/scripts/agency-install.sh" $ARGUMENTS
```

IMPORTANT: You MUST execute the above command using the Bash tool. Do NOT skip this step.

If no arguments are provided, explain the usage:
- Install from marketplace: `/tycono-agency-install gamedev`
- Install from GitHub: `/tycono-agency-install https://github.com/user/agency-repo`

After installation, tell the user they can use the agency with `/tycono --agency <id>`.
