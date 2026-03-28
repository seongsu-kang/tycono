---
description: "Explain Tycono plugin and available commands"
---

# Tycono — AI Team Orchestration Plugin

**"Cursor gives you one dev. Tycono gives you a team you can watch."**

## What is Tycono?

Tycono orchestrates a team of AI agents to work on your task:
- **CBO** analyzes the market and expands your vision
- **CTO** designs the architecture and manages the team
- **Engineer** writes the code
- **QA** tests and validates

You see everything in real-time — who's working on what, what they're producing, when they hit issues.

## Commands

| Command | Description |
|---------|-------------|
| `/tycono <task>` | Start a wave — your AI team begins working |
| `/tycono-status` | Check current wave progress |
| `/tycono-cancel` | Cancel the active wave |

## Examples

```
/tycono "Build a browser tower defense game"
/tycono --preset gamedev "Create an RPG with combat and inventory"
/tycono "Refactor this project's API layer"
```

## Presets

Presets load domain-specific knowledge for your team:

| Preset | Team | Use Case |
|--------|------|----------|
| `gamedev` | CTO, Engineer, QA, PM, Designer | Game development |
| `startup-mvp` | CTO, Engineer, PM | MVP prototyping |
| `saas-growth` | CTO, PM, CBO | SaaS product development |

## How it Works

1. `/tycono` starts a Tycono server in the background
2. Your task is sent as a "wave" to the CEO Supervisor
3. The CEO dispatches roles (CTO, CBO, Engineer, QA...)
4. Each role runs as a separate Claude session with specialized skills
5. The supervisor monitors progress and course-corrects
6. You see real-time updates in your Claude Code session
7. When done, you get the results + knowledge is saved to `akb/`

## vs Ralph Loop

| | Ralph Loop | Tycono |
|--|-----------|--------|
| Structure | Solo loop | Team collaboration |
| Visibility | Black box | Real-time activity stream |
| Direction | No correction | Supervision + amend |
| Knowledge | None | Accumulated in akb/ |
| Quality | Single perspective | Multi-perspective (plan + build + test) |
