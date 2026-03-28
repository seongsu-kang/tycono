# tycono — AI Team Orchestration Plugin for Claude Code

> **"Cursor gives you one dev. Tycono gives you a team you can watch."**

## What is Tycono?

Tycono turns Claude Code into a full AI team. Instead of one agent working alone, you get:

- **CBO** — analyzes the market, expands your vision to commercial quality
- **CTO** — designs the architecture, manages the engineering team
- **Engineer** — writes the code
- **QA** — tests and validates everything works
- **PM** — defines user scenarios and requirements
- **Designer** — handles UI/UX design

You watch them work in real-time. Every dispatch, every decision, every bug fix — visible in your session.

## Quick Start

```
/tycono "Build a browser tower defense game"
```

That's it. The team starts working immediately.

## Commands

| Command | Description |
|---------|-------------|
| `/tycono <task>` | Start a wave — your AI team begins working |
| `/tycono --preset gamedev <task>` | Start with domain-specific knowledge |
| `/tycono-status` | Check current progress |
| `/tycono-cancel` | Cancel the active wave |
| `/tycono-help` | Show detailed help |

## Presets

| Preset | Team | Best For |
|--------|------|----------|
| `gamedev` | CTO, Engineer, QA, PM, Designer | Browser/mobile games |
| `startup-mvp` | CTO, Engineer, PM | MVP prototyping |
| `saas-growth` | CTO, PM, CBO | SaaS products |

## How it Works

```
/tycono "task"
  → Tycono server starts (headless, background)
  → Wave created via API
  → CEO Supervisor dispatches roles
  → Real-time activity stream in your session
  → Stop hook keeps session alive until done
  → Results delivered + knowledge saved to akb/
```

## vs Ralph Loop

| | Ralph Loop | Tycono |
|--|-----------|--------|
| **Structure** | Solo loop | Team of specialized agents |
| **Visibility** | Black box until done | Real-time activity stream |
| **Direction** | No course correction | Supervision + amend |
| **Knowledge** | Lost between runs | Accumulated in `akb/` |
| **Quality** | Single perspective | Multi-perspective (plan→build→test) |

## Requirements

- Claude Code CLI
- Node.js 18+
- `npx tycono` must be available (auto-installed on first run)

## License

MIT
