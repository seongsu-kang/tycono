<p align="center">
  <strong>Cursor gives you one AI developer. Tycono gives you an AI team.</strong><br>
  <sub>Give one order. Watch your AI team plan, build, and learn together.</sub>
</p>

<h1 align="center">tycono</h1>

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

Cursor, Lovable, Bolt — they all give you **one AI agent**. It helps, but you still drive everything.

**tycono** gives you an **AI team**. A CTO reviews architecture. Engineers write code. A PM breaks down tasks. QA catches bugs. You just give the order and watch them work.

```bash
npx tycono
```

```
> Make a landing page for our product

▶ Supervisor started
💭 Analyzing the directive. I'll dispatch CTO for implementation and CBO for copy...
→ cto 배정: Landing page structure + implementation
→ cbo 배정: Product messaging + copywriting
  → Read architecture/deployment.md
  → dispatch fe-engineer: Build responsive landing page
  cto         ▶ Reviewing architecture for landing page...
  fe-engineer → Write src/landing/index.html
  📄 Write src/landing/styles.css
  cbo         ✓ done (5 turns)
  fe-engineer ✓ done (12 turns)
✓ Supervisor done (8 turns)
>
```

## Core Pillars

### 1. CEO Supervisor — Org-chart orchestration

You give one order. The system dispatches through a real hierarchy.

CEO delegates to C-levels, C-levels dispatch to their teams. Authority is enforced — engineers can't make CEO decisions, PMs can't merge code.

**Dual Mode**: Simple questions get answered directly (no team dispatch). Work tasks activate the full team. The system judges automatically.

### 2. Multi-Wave — Parallel workspaces

Multiple persistent conversations, each with its own team context.

```
/new Build the API        → Wave 1 (CTO + Engineers working)
/new Write documentation  → Wave 2 (CBO + Writer working)
/focus 1                  → Switch to Wave 1
```

Tab → Panel Mode: wave-scoped org tree, real-time stream, docs browser.

### 3. Observability — See everything

```
Tab → Panel Mode

┌── W1 Build the API ──────┬── Stream  Docs  Info ──────────────┐
│  3 sessions               │  cto     → dispatch engineer       │
│  ── Org Tree ──           │  engineer → Write src/api/routes.ts│
│  ● CEO                    │  engineer 📄 Write src/api/types.ts │
│  ├─ ● CTO                │  qa       ▶ Running test suite...   │
│  │  ├─ ● engineer         │                                     │
│  │  └─ ● qa               │                                     │
│  └─ ○ CBO                │                                     │
│  [1] [2*]                 │                                     │
└───────────────────────────┴─────────────────────────────────────┘
```

- **Wave-scoped** — org tree shows only this wave's active agents
- **Docs tab** — browse all .md files, ★ marks wave artifacts, Enter → vim
- **Info tab** — wave metadata, sessions, ports
- **Commands** — `/agents` `/sessions` `/kill` `/docs` `/read`

### 4. AKB — Knowledge that compounds

Every AI tool: `Plan → Execute → Done`. Knowledge resets. Tycono adds:

```
Pre-K:  Read existing knowledge → Plan grounded in what the company knows
Execute: Do the work
Post-K: Extract insights → Cross-link → Register in knowledge graph
```

Session 50 is dramatically smarter than session 1.

## Quick Start

```bash
mkdir my-company && cd my-company
npx tycono
```

A setup wizard guides you through:

1. **Name your company** — set mission and domain
2. **Choose a team template** — Startup, Research, Agency, or Custom
3. **Start working** — type naturally, your AI team responds

### Requirements

- Node.js >= 18
- [Claude Code CLI](https://claude.ai/download) (recommended) or Anthropic API key

## CLI

```bash
npx tycono                # Start TUI (default)
npx tycono ./my-company   # Start with specific directory
npx tycono --classic      # Pixel office web UI
npx tycono --attach       # Connect to running API server
npx tycono --help         # Show help
```

## TUI Commands

```
Type naturally to talk to your AI team.

/new [text]       Create new wave
/waves            List all waves
/focus <n>        Switch to wave n
/agents           Wave → Role → Session tree
/sessions         Sessions + ports
/kill <id>        Kill a session
/cleanup          Remove dead sessions
/docs             Files created in this wave
/read <path>      Preview file content
/open <path>      Open in $EDITOR (vim)
/help             Show help
/quit             Exit

Tab               Panel Mode (org tree + stream + docs)
1-9               Switch wave (in Panel Mode)
h/l               Switch tab (Stream/Docs/Info)
j/k               Navigate
Ctrl+C            Quit
```

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
| **Startup** | CTO + PM + Engineer + Designer + QA | Product development |
| **Research** | Lead Researcher + Analyst + Writer | Analysis & reports |
| **Agency** | Creative Director + Designer + Developer | Client projects |
| **Custom** | Start empty, hire as you go | Full control |

## Why Tycono?

| | Cursor / Lovable / Bolt | Tycono |
|---|---|---|
| **Agents** | 1 AI helps you | **AI team works for you** |
| **Your role** | Keep directing | **Give one order, watch** |
| **Knowledge** | Resets every session | **Compounds forever** |
| **Quality** | You review everything | **QA agent catches bugs** |
| **Scale** | 1 task at a time | **Parallel across roles** |
| **Interface** | Editor / chat | **Terminal-native TUI** |

## Origin Story

Tycono started as an AI office tycoon game — pixel characters walking around, sitting at desks, chatting in Slack-like channels. It was fun to watch.

But the agents underneath were actually useful. They wrote real code, real documents, made real decisions. The game UI was cute; the real value was the AI team.

So we stripped the pixels and built a terminal tool. Same AI team, no game — just work.

The pixel office lives on as `npx tycono --classic` — a reminder of where it started.

<p align="center">
  <img src=".github/assets/hero-office.png" alt="Where it started — pixel office" width="480" />
  <br>
  <sub>Where it started: an AI office tycoon game</sub>
</p>

## Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `ANTHROPIC_API_KEY` | Your Anthropic API key | — |
| `PORT` | Server port | auto-detect |
| `COMPANY_ROOT` | Company directory | current directory |
| `EDITOR` | Editor for /open command | vim |

## Roadmap

- [x] TUI — terminal-native interface (default)
- [x] Multi-Wave — parallel persistent workspaces
- [x] Dual Mode — direct answer vs team dispatch
- [x] CEO Wave dispatch with org-tree targeting
- [x] AKB — Pre-K / Post-K knowledge loop
- [x] Port Registry for multi-agent isolation
- [x] Session lifecycle persistence
- [ ] Git worktree isolation per agent session
- [ ] **Desktop app** (.dmg / .exe) — background execution, notifications
- [ ] Multi-LLM support (OpenAI, local models)
- [ ] Company Preset Marketplace

## Development

```bash
git clone https://github.com/seongsu-kang/tycono.git
cd tycono
npm install
cd src/api && npm install && cd ../..
cd src/web && npm install && cd ../..

# Dev mode (hot reload)
npm run dev
```

## License

[MIT](LICENSE)

---

<p align="center">
  <sub>Built with Tycono. An AI company that builds itself.</sub>
</p>
