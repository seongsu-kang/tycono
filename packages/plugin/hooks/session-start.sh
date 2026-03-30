#!/bin/bash
# Tycono — Session Start Hook
# Injects Tycono awareness into Claude's context at session start.

cat << 'TYCONO_CONTEXT'
You have Tycono installed — an AI team orchestration plugin.

## What you can do:
- `/tycono "task"` — Dispatch an AI team (CEO, CTO, Engineer, QA, etc.) to work on a task in the background
- `/tycono:agency-create` — Guided setup: scan project → design team → auto-generate → auto-verify
- `/tycono:tycono-status` — Check wave progress
- `/tycono:help` — Full command reference

## Key facts:
- Waves run in background. You'll get notifications for important events (errors, decisions needed, completion).
- Each role's full work log is at `.tycono/activity-streams/ses-{role}-*.jsonl`
- Custom agencies: `/tycono:agency-create` walks you through setup for your existing project
- Set default agency: `{ "defaultAgency": "your-id" }` in `.tycono/config.json`

## When user asks about Tycono:
Use `/tycono:help` for the full guide. For questions about results/logs, point to `.tycono/activity-streams/`.
TYCONO_CONTEXT
