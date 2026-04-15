---
description: "Start an AI team (agencies: gamedev, startup-mvp, solo-founder)"
argument-hint: "TASK [--agency gamedev|startup-mvp|solo-founder] [--continuous]"
allowed-tools: ["Monitor", "Bash(${CLAUDE_PLUGIN_ROOT}/scripts/start-wave.sh *)", "Bash(${CLAUDE_PLUGIN_ROOT}/scripts/status.sh *)", "Bash(${CLAUDE_PLUGIN_ROOT}/scripts/status.sh)", "Bash(curl *)"]
---

# Tycono — AI Team Orchestration

Start the AI team using the **Monitor tool** so wave events stream back in real-time:

```
"${CLAUDE_PLUGIN_ROOT}/scripts/start-wave.sh" $ARGUMENTS
```

IMPORTANT:
1. Use the **Monitor** tool (NOT Bash with run_in_background)
2. Set `persistent: true` — the wave runs until completion
3. Set `description` to include the wave task summary
4. Each line of output (alerts, errors, completion) will appear as a notification

Example Monitor call:
- command: `"${CLAUDE_PLUGIN_ROOT}/scripts/start-wave.sh" Make a todo app --agency gamedev --confirmed`
- description: "Tycono wave: Make a todo app"
- persistent: true
- timeout_ms: 3600000

This way you'll receive real-time notifications for:
- 🔔 Agent needs your decision (approval requests)
- ❌ Agent session errors
- ✅ Wave completed

After launching, tell the user:
- The Wave ID
- The team composition
- That wave events will stream in real-time
- They can check status anytime with: /tycono:tycono-status
- They can cancel with: /tycono:tycono-cancel

IMPORTANT: Do NOT try to do the work yourself. The Tycono server is orchestrating a team of AI agents. Your session stays free for other work while wave events arrive as notifications.
