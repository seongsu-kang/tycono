---
description: "Start an AI team (agencies: gamedev, startup-mvp, solo-founder)"
argument-hint: "TASK [--agency gamedev|startup-mvp|solo-founder] [--continuous]"
allowed-tools: ["Bash(${CLAUDE_PLUGIN_ROOT}/scripts/start-wave.sh *)", "Bash(${CLAUDE_PLUGIN_ROOT}/scripts/status.sh *)", "Bash(${CLAUDE_PLUGIN_ROOT}/scripts/status.sh)", "Bash(curl *)"]
---

# Tycono — AI Team Orchestration

Run the following Bash command **in the background** to start the AI team. Replace the task with the user's actual request:

```
"${CLAUDE_PLUGIN_ROOT}/scripts/start-wave.sh" $ARGUMENTS
```

IMPORTANT:
1. You MUST execute the above command using the Bash tool with `run_in_background: true`
2. This allows the wave to run in the background while the user can continue working
3. When the wave completes, a background task notification will appear automatically

After launching, tell the user:
- The Wave ID
- The team composition
- That the wave is running in the background
- They can check status anytime with: /tycono:tycono-status
- They can cancel with: /tycono:tycono-cancel

IMPORTANT: Do NOT try to do the work yourself. The Tycono server is orchestrating a team of AI agents. Your session stays free for other work while the wave runs.
