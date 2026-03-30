---
name: tycono-guide
description: |
  Tycono usage guide and project understanding.
  WHEN: user asks "how does tycono work", "what can tycono do", "how to use the AI team",
  "what are the commands", "what is a wave", "what is an agency", "how to check results",
  "where are the logs", "how to see what the team did", first time using tycono.
  WHEN NOT: user is already running a wave, asking about unrelated code, general coding questions.
user-invocable: false
---

# Tycono — How It Works

You are helping a user understand how to use the Tycono AI team orchestration plugin.

## Core Concepts

**Wave** = A task you give to the AI team. Like a sprint.
**Agency** = A team configuration (which roles, what domain knowledge).
**Role** = A specialized AI agent (CTO, Engineer, QA, etc.)

## Basic Flow

```
/tycono "your task"
  → CEO Supervisor analyzes task
  → Dispatches roles (CTO, Engineer, QA, etc.)
  → Each role works as a separate Claude session
  → Real-time notifications in your session
  → Results delivered
```

## Checking Results

**During the wave:**
- Background notifications appear automatically (🔔 alerts)
- `/tycono:tycono-status` for current state

**After the wave:**
- Activity streams at `.tycono/activity-streams/ses-*.jsonl`
- Each file = one role's complete work log (thinking, tool calls, output)
- View with: `cat .tycono/activity-streams/ses-cto-*.jsonl | python3 -m json.tool`
- Or: `grep '"type":"text"' .tycono/activity-streams/ses-critic-*.jsonl`

## For Existing Projects

If user has an existing project with code/knowledge:
```
/tycono:agency-create
```
This scans the project, suggests a team, and auto-generates + auto-verifies.

## Common Questions

**"How do I see what Critic said?"**
→ `cat .tycono/activity-streams/ses-critic-*.jsonl | grep '"type":"text"'`

**"How do I give a follow-up directive?"**
→ Just run `/tycono "follow-up task"` — it creates a new wave in the same project context.

**"The team did too much / too little"**
→ Be more specific in the directive. Include what's already done, what the actual problem is, and what you expect.

**"How do I set a default agency?"**
→ Add to `.tycono/config.json`: `{ "defaultAgency": "your-agency-id" }`
