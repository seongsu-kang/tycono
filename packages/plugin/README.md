# tycono

**Cursor gives you one dev. Tycono gives you a team.**

Give Claude Code an AI team that plans, builds, tests, and ships — while you watch in real-time.

---

## Quick Start

```
claude plugin install tycono
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

You see every dispatch, every decision, every bug fix in your session.

---

## Available Commands

| Command | Description |
|---------|-------------|
| `/tycono <task>` | Start a wave — your AI team begins working |
| `/tycono --agency <id> <task>` | Start with a specific agency (team config) |
| `/tycono-status` | Check current wave progress |
| `/tycono-cancel` | Cancel the active wave |
| `/tycono-help` | Show all commands and usage |
| `/tycono-agency-list` | List installed agencies |
| `/tycono-agency-create` | Create a new custom agency interactively |
| `/tycono-agency-install <id>` | Install an agency from marketplace or GitHub |

---

## Bundled Agencies

Agencies are team configurations with domain-specific knowledge.

| Agency | Team | Best For |
|--------|------|----------|
| `gamedev` | CTO, Engineer, QA, PM, Designer | Browser/mobile games, game jams |
| `startup-mvp` | CTO, Engineer, PM | MVP prototyping, rapid validation |
| `solo-founder` | CTO, CBO, Engineer, Designer | Solo founder building a product |

```
/tycono --agency gamedev "Create a roguelike dungeon crawler"
/tycono --agency startup-mvp "Build a SaaS dashboard MVP"
```

---

## Agency System

Build, share, and install custom team configurations.

- **`/tycono-agency-list`** — See all installed agencies (bundled + custom)
- **`/tycono-agency-create`** — Interactive wizard to create your own agency with custom roles, domain knowledge, and team composition
- **`/tycono-agency-install`** — Install from the marketplace or a GitHub URL

Agencies are portable YAML configs stored in `~/.tycono/agencies/` (global) or `.tycono/agencies/` (project-local).

---

## How it Works

```
/tycono "your task"
    |
    v
[Plugin] starts tycono-server (headless, background)
    |
    v
[Server] creates a Wave — your task becomes a mission
    |
    v
[CEO Supervisor] analyzes the task, dispatches roles
    |
    +---> [CTO] designs architecture
    |       +---> [Engineer] implements code
    |       +---> [QA] tests and validates
    +---> [CBO] analyzes market fit
            +---> [PM] defines requirements
            +---> [Designer] creates UI/UX
    |
    v
[Activity Stream] real-time updates in your session
    |
    v
[Results] delivered + knowledge saved to akb/
```

Key details:
- The server runs locally via `npx tycono-server` (auto-installed on first run)
- Each role runs as a separate Claude Code session with its own context
- A stop hook keeps your session alive until the wave completes
- Knowledge accumulates across waves in `akb/` (Agentic Knowledge Base)

---

## vs Solo AI

| | Claude Code (solo) | Ralph Loop | Tycono |
|--|-------------------|-----------|--------|
| **Who works** | You + 1 AI | 1 AI in a loop | Team of specialized AI agents |
| **Visibility** | Direct | Black box until done | Real-time activity stream |
| **Course correction** | Manual | None | CEO Supervisor auto-corrects |
| **Knowledge** | Lost between sessions | Lost between runs | Accumulated in `akb/` |
| **Quality** | Single perspective | Single perspective | Multi-perspective (plan + build + test) |
| **Best for** | Quick tasks, pair programming | Repetitive automation | Complex projects, full features |

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
