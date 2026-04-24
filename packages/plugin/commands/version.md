---
description: "Show Tycono version info (plugin, server, hook status). WHEN: user asks about version, asks 'what version', 'tycono version', or wants to check if plugin is up to date."
---

Run the version script to show current Tycono component versions:

```bash
"${CLAUDE_PLUGIN_ROOT}/scripts/version.sh"
```

Show the output to the user as-is.

If the output shows a version SSOT mismatch (`plugin.json` vs `package.json`) or
"marketplace has vX.Y.Z", explain that `.claude-plugin/plugin.json` is the file
Claude Code reads for `/plugin` updates, and any real version bump must touch
that file plus `marketplace.json` plus `package.json` in a single commit.
