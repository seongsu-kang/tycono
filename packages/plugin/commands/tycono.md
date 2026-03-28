---
description: "Start an AI team (agencies: gamedev, startup-mvp, solo-founder)"
argument-hint: "TASK [--agency gamedev|startup-mvp|solo-founder]"
allowed-tools: ["Bash(${CLAUDE_PLUGIN_ROOT}/scripts/start-wave.sh *)", "Bash(${CLAUDE_PLUGIN_ROOT}/scripts/status.sh *)", "Bash(${CLAUDE_PLUGIN_ROOT}/scripts/status.sh)", "Bash(curl *)"]
---

# Tycono — AI Team Orchestration

Run the following Bash command to start the AI team. Replace the task with the user's actual request:

```
"${CLAUDE_PLUGIN_ROOT}/scripts/start-wave.sh" $ARGUMENTS
```

IMPORTANT: You MUST execute the above command using the Bash tool. Do NOT skip this step.

After the script runs successfully, report the Wave ID and team status to the user.

Your AI team is now working. You'll see real-time updates as each role (CTO, Engineer, QA, etc.) progresses.

The team will keep working until the task is complete. The stop hook prevents premature exit — your session stays alive until the wave finishes.

IMPORTANT: Do NOT try to do the work yourself. The Tycono server is orchestrating a team of AI agents. Your job is to:
1. Watch the progress updates
2. Provide direction if asked
3. Wait for the wave to complete

If you need to check status: /tycono:tycono-status
If you need to cancel: /tycono:tycono-cancel
