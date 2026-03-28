---
description: "Start an AI team to work on your task"
argument-hint: "TASK [--preset gamedev|startup-mvp|saas-growth]"
allowed-tools: ["Bash(${CLAUDE_PLUGIN_ROOT}/scripts/start-wave.sh:*)"]
hide-from-slash-command-tool: "true"
---

# Tycono — AI Team Orchestration

Execute the setup script to start your AI team:

```!
"${CLAUDE_PLUGIN_ROOT}/scripts/start-wave.sh" $ARGUMENTS
```

Your AI team is now working. You'll see real-time updates as each role (CTO, Engineer, QA, etc.) progresses.

The team will keep working until the task is complete. The stop hook prevents premature exit — your session stays alive until the wave finishes.

IMPORTANT: Do NOT try to do the work yourself. The Tycono server is orchestrating a team of AI agents. Your job is to:
1. Watch the progress updates
2. Provide direction if asked
3. Wait for the wave to complete

If you need to check status: /tycono-status
If you need to cancel: /tycono-cancel
