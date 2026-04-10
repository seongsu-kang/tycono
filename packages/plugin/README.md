# tycono

**You're one person building a company. Tycono gives you the team.**

Give Claude Code an AI team that plans, builds, tests, and ships — while you watch in real-time.

---

## Quick Start

```bash
# 1. Add marketplace (one-time)
/plugin marketplace add seongsu-kang/tycono

# 2. Install
/plugin install tycono@seongsu-kang-tycono

# Update anytime
/plugin update tycono
```

Then:
```
/tycono "Build a browser tower defense game"
```

Your AI team starts working immediately.

---

## What it Does

When you run `/tycono`, a team of specialized AI agents collaborates on your task:

```
You: /tycono "Build an RPG with combat and inventory"

  CEO Supervisor
   ├── CTO ─── designs architecture, manages engineers
   │    ├── Engineer ─── writes the code
   │    └── QA ─── tests and validates
   └── CBO ─── analyzes market, expands vision
        ├── PM ─── defines requirements
        └── Designer ─── handles UI/UX
```

Each role runs as a separate Claude session with specialized knowledge. The CEO supervises the whole team, course-corrects when needed, and delivers results back to you.

---

## Commands

| Command | Description |
|---------|-------------|
| `/tycono <task>` | Start a wave — your AI team begins working |
| `/tycono --agency <id> <task>` | Start with a specific agency (team config) |
| `/tycono:tycono-status` | Check current wave progress |
| `/tycono:tycono-cancel` | Cancel the active wave |
| `/tycono:help` | Show all commands and usage |
| `/tycono:agency-list` | List installed agencies |
| `/tycono:agency-create` | Create a custom agency with guided setup |
| `/tycono:agency-install <id>` | Install an agency from marketplace or GitHub |

---

## Guided Agency Setup

`/tycono:agency-create` walks you through setting up an AI team for your existing project:

```
Phase 1: Auto-scan your project (code, skills, knowledge)
Phase 2: 3 questions → team composition + skill attachment
Phase 3: Auto-generate agency files
Phase 4: Auto-verify with test waves (mandatory)
```

Detects your existing `.claude/skills/`, suggests role-skill matching, handles writes scope, and verifies everything works before you start.

---

## Tycono Channel

Real-time notifications from your AI team, pushed directly into your Claude Code session via MCP Channel:

```
[You're working on something else...]

💬 Tycono: "🔔 backtester needs your decision.
   Option A (conservative) or Option B (aggressive)?"

You: "Option A"
→ Agent resumes immediately
```

No more checking status manually. Errors, completions, approval requests — all pushed to you.

---

## Bundled Agencies

| Agency | Team | Best For |
|--------|------|----------|
| `gamedev` | CTO, Engineer, QA, PM, Designer | Browser/mobile games |
| `startup-mvp` | CTO, Engineer, PM | MVP prototyping |
| `solo-founder` | CTO, CBO, Engineer, Designer | Solo founder products |

```
/tycono --agency gamedev "Create a roguelike dungeon crawler"
/tycono --agency startup-mvp "Build a SaaS dashboard MVP"
```

Create your own with `/tycono:agency-create` or install from the community.

---

## How it Works

```
/tycono "your task"
    │
    ▼
[Plugin] starts tycono-server (headless, background)
    │
    ▼
[CEO Supervisor] analyzes task, dispatches roles
    │
    ├──▶ [CTO] designs architecture
    │      ├──▶ [Engineer] implements code
    │      └──▶ [QA] tests and validates
    └──▶ [CBO] analyzes market fit
           ├──▶ [PM] defines requirements
           └──▶ [Designer] creates UI/UX
    │
    ▼
[Activity Stream] real-time updates via Tycono Channel
    │
    ▼
[Results] delivered + knowledge saved
```

- Server runs locally via `npx tycono-server` (auto-installed on first run)
- Each role runs as a separate Claude Code session
- Knowledge accumulates across waves (AKB — Agentic Knowledge Base)
- CEO Supervisor auto-corrects when things go off track

---

## Requirements

- Claude Code CLI
- Node.js 18+

---

## Links

- **Website**: [tycono.ai](https://tycono.ai)
- **GitHub**: [github.com/seongsu-kang/tycono](https://github.com/seongsu-kang/tycono)
- **npm**: [npmjs.com/package/tycono-server](https://www.npmjs.com/package/tycono-server)

## License

MIT
