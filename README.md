<p align="center">
  <img src=".github/assets/hero-office.png" alt="Tycono — AI Office" width="720" />
</p>

<h1 align="center">tycono</h1>

<p align="center">
  <strong>Build an AI company. Watch them work.</strong><br>
  <sub>Infrastructure-as-Code defined servers. Company-as-Code defines organizations.</sub>
</p>

<p align="center">
  <a href="https://www.npmjs.com/package/tycono"><img src="https://img.shields.io/npm/v/tycono.svg" alt="npm version" /></a>
  <a href="https://github.com/seongsu-kang/tycono/blob/main/LICENSE"><img src="https://img.shields.io/npm/l/tycono.svg" alt="license" /></a>
  <a href="https://www.npmjs.com/package/tycono"><img src="https://img.shields.io/node/v/tycono.svg" alt="node version" /></a>
</p>

<p align="center">
  <a href="https://tycono.ai">Website</a> ·
  <a href="#quick-start">Quick Start</a> ·
  <a href="#how-it-works">How It Works</a> ·
  <a href="#company-as-code">Company-as-Code</a> ·
  <a href="CONTRIBUTING.md">Contributing</a>
</p>

---

**tycono** is an open-source platform that lets you define and run an AI-powered organization. Roles, authority, knowledge, and workflows — all defined in files, executed by AI agents, visualized in real time.

One command. Your AI company is running.

```bash
npx tycono
```

## Why Tycono?

Coding agents simulate **one developer**. Tycono simulates **the entire company**.

| | Single AI Agent | Tycono |
|---|---|---|
| **What it runs** | One agent, one context | Multiple roles with org hierarchy |
| **Knowledge** | Resets every session | Compounds forever — file-based, cross-linked |
| **Authority** | Can do anything (or nothing) | Scoped — each role has clear boundaries |
| **Delegation** | Manual prompt chaining | CEO dispatches, org chart routes automatically |
| **Scale** | 1 agent | 7 → 700 agents |
| **Visibility** | Terminal output | Isometric office + Slack-style Pro dashboard |

## Company-as-Code

Just as Terraform turns `.tf` files into running infrastructure, Tycono turns YAML and Markdown into a running company.

```
IaC                          CaC (Company-as-Code)
─────────────────────        ─────────────────────
.tf         → servers        role.yaml   → org structure
playbook    → config         CLAUDE.md   → operating rules
Dockerfile  → containers     skills/     → capabilities
state file  → infra state    knowledge/  → org memory
```

Your company is **versionable**, **reproducible**, and **forkable** — just like code.

## Quick Start

```bash
mkdir my-company && cd my-company
npx tycono
```

A setup wizard guides you through:

1. **Pick an AI engine** — Claude API, Claude Max, or auto-detect
2. **Name your company** — set mission and domain
3. **Choose a team template** — or build from scratch
4. **Watch them work** — your browser opens to a live dashboard

### Requirements

- Node.js >= 18
- [Anthropic API key](https://console.anthropic.com/) or Claude Max subscription

## Two Ways to Work

### Office View — Watch your AI team

An isometric pixel-art office where your AI agents sit at their desks, work, chat, and think. Click any agent to talk to them directly.

<p align="center">
  <img src=".github/assets/hero-office.png" alt="Office View" width="640" />
</p>

- Pixel-art characters with personalities and levels
- Ambient speech bubbles — agents think out loud
- Rooms: Leadership, Engineering, Meeting, Knowledge Library
- Edit mode — rearrange furniture, customize your office

### Pro View — Manage your AI company

A Slack-style professional dashboard for serious work. Chats, Wave dispatch, Decisions log, Knowledge graph.

<p align="center">
  <img src=".github/assets/pro-view.png" alt="Pro View" width="640" />
</p>

- **Wave Center** — selective org-tree dispatch with target checkboxes
- **Chats** — 1:1 conversations with any role, persistent sessions
- **Knowledge Base** — graph/tree/list views, 194+ cross-linked documents
- **Decisions** — CEO strategic decision log with full context

## Key Features

### CEO Wave — One order moves the company

Write a directive. Select target roles on the org tree. Hit dispatch. Every selected agent receives their piece of the work, filtered through the hierarchy.

<p align="center">
  <img src=".github/assets/wave-center.png" alt="Wave Center — selective org-tree dispatch" width="640" />
</p>

### Living Knowledge (AKB)

Every task produces knowledge. Cross-linked Markdown documents that grow with every session. Search, navigate, never lose context. Session 50 is dramatically smarter than session 1.

### Role-Based Authority

Each role has scoped authority defined in `role.yaml`. Engineers can't make CEO decisions. PMs can't merge code. The org chart isn't decoration — it's enforcement.

### Level System

Roles gain XP from completed work. Level up unlocks accessories and reflects experience. Your CTO at Lv.14 has seen things your new intern hasn't.

### Local-First, BYOK

Everything runs on your machine. Your data never leaves. Bring your own Anthropic API key — no middleman, no telemetry, no tracking.

## How It Works

```
You (CEO)
  └── Give a directive via Wave or direct chat
        └── Context Engine routes to the right Role
              └── Role reads its knowledge + skills, executes within authority
                    └── Knowledge updates, results flow back up
                          └── Your company gets smarter
```

Every role has:
- `role.yaml` — Identity, authority, knowledge scope, reporting structure
- `SKILL.md` — Tools, commands, and capability guides
- `profile.md` — Public-facing description and persona
- `journal/` — Work history and learnings

## Your Company Structure

```
your-company/
├── CLAUDE.md           ← AI operating rules (auto-managed)
├── company/            ← Mission, vision, values
├── roles/              ← AI role definitions (role.yaml + skills)
├── projects/           ← Product specs, PRDs, and tasks
├── architecture/       ← Technical decisions and designs
├── operations/         ← Standups, decisions, wave history
├── knowledge/          ← Domain knowledge (compounds over time)
└── .tycono/            ← Config and preferences
```

## Team Templates

| Template | Roles | Best For |
|----------|-------|----------|
| **Startup** | CTO + PM + Engineer + Designer | Product development |
| **Research** | Lead Researcher + Analyst + Writer | Analysis & reports |
| **Agency** | Creative Director + Designer + Developer | Client projects |
| **Custom** | Start empty, hire as you go | Full control |

## CLI Usage

```bash
npx tycono              # Start server + open dashboard
npx tycono --help       # Show help
npx tycono --version    # Show version
```

## Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `ANTHROPIC_API_KEY` | Your Anthropic API key | — |
| `PORT` | Server port | auto-detect |
| `COMPANY_ROOT` | Company directory | current directory |

## Built with Tycono

This isn't a demo. Tycono's own landing page, documentation, and knowledge base were built by AI agents running inside Tycono. The PM wrote the PRD. The CTO reviewed architecture. The Designer created UX specs. The Engineer implemented every section.

194 knowledge documents. 12 CEO decisions. 8 active roles. All managed through the same system you're about to use.

## Development

```bash
git clone https://github.com/seongsu-kang/tycono.git
cd tycono
npm install
cd src/api && npm install && cd ../..
cd src/web && npm install && cd ../..

# Dev mode (hot reload)
npm run dev

# Type check
npm run typecheck
```

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for guidelines.

## Get Help

- [GitHub Issues](https://github.com/seongsu-kang/tycono/issues) — Bug reports and feature requests
- [GitHub Discussions](https://github.com/seongsu-kang/tycono/discussions) — Questions and ideas

## License

[MIT](LICENSE)

---

<p align="center">
  <sub>Built with Tycono. An AI company that builds itself.</sub>
</p>
