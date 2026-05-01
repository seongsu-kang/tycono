# tycono

**Your company, in code.**

Define your org. Give one order. Your AI team plans, builds, and learns — and they remember everything next time.

Terminal-native. Local-first. Open source.

<p align="center">
  <a href="https://www.npmjs.com/package/tycono-server"><img src="https://img.shields.io/npm/v/tycono-server.svg?label=server" alt="server version" /></a>
  <a href="https://github.com/seongsu-kang/tycono/blob/main/LICENSE"><img src="https://img.shields.io/github/license/seongsu-kang/tycono.svg" alt="license" /></a>
</p>

<p align="center">
  <img src=".github/assets/wave-center.png" alt="Tycono — multi-wave workspace" width="700" />
</p>

---

## Install

Tycono runs as a [Claude Code](https://claude.ai/download) plugin. Inside Claude Code:

```
/plugin marketplace add seongsu-kang/tycono
/plugin install tycono@seongsu-kang-tycono
```

That's it. The first `/tycono` command auto-downloads `tycono-server` into your plugin data directory — no manual `npm install`, no extra config.

```
/plugin update tycono       # update later
/tycono:version             # check installed versions
```

---

## First Wave

```
You: /tycono "Build a tower defense game"

CEO       → Breaks it down, dispatches CTO
CTO       → Plans architecture, dispatches Engineer
Engineer  → Writes code
QA        → Reviews and tests
CEO       → Approves final result
```

Watch the team work in real time at `http://localhost:8765/ui` (browser dashboard) or with `/tycono:tycono-status`.

---

## Company-as-Code

Terraform turns `.tf` files into running infrastructure.
Tycono turns YAML and Markdown into a running company.

```yaml
# roles/engineer/role.yaml
id: engineer
name: "Alex"
level: member
reports_to: cto
model: claude-opus-4-7
effort: medium

authority:
  autonomous: ["Code implementation", "Bug fixes"]
  requires_approval: ["Architecture changes"]

knowledge_scope:
  readable: ["projects/", "architecture/"]
  writable: ["projects/*/technical/"]
```

One file defines who the agent is, what they can do, what they know, and who they report to.

- **One order, whole org moves.** You tell the CEO what you want. The hierarchy handles the rest.
- **Authority is enforced.** Engineers can't make architecture decisions. PMs can't merge code.
- **Knowledge compounds.** Every session reads what came before and writes back what it learned.

---

## Agencies

Pre-built team configurations — pick one or design your own.

```
/tycono --agency gamedev "Build a browser game"
/tycono --agency startup-mvp "Build an MVP"
/tycono --agency solo-founder "Research and plan my next product"
```

Need a custom team for *your* project?

```
/tycono:agency-create
```

Walks you through scanning your project, suggesting roles, auto-generating role files, and verifying the team works — all in one guided flow.

Browse the marketplace at [tycono.ai/agencies](https://tycono.ai/agencies).

---

## Commands

```
/tycono "<task>"              Start a wave
/tycono:tycono-status         Check current wave progress
/tycono:tycono-cancel         Cancel active wave
/tycono:board                 View task board for active wave
/tycono:report                Generate wave report (markdown)
/tycono:analysis              Wave cost + token breakdown by role
/tycono:benchmark             Compare wave performance
/tycono:version               Show plugin/server versions
/tycono:help                  Full reference
/tycono:agency-create         Build a custom agency for your project
/tycono:agency-install        Install agency from marketplace
/tycono:agency-list           List installed agencies
/tycono:agency-publish        Publish to tycono.ai marketplace
```

---

## Features

| Feature | What it does |
|---------|-------------|
| **Wave Dispatch** | One order cascades through the entire org hierarchy. |
| **Auto-Amend** | Follow-up work continues in the same session — major cost reduction. |
| **Handoff Summary** | Re-dispatched roles get previous session context automatically. |
| **Prompt Caching** | Static system prompt sections cached — up to 90% input cost reduction. |
| **Critic Role** | Built-in Devil's Advocate that challenges team conclusions. |
| **Memory System** | Pre/During/Post-K. Each wave reads relevant memory, writes new insights, persists across sessions. |
| **Workflow Visibility** | Browser dashboard (`/ui`) — live org tree, dispatch flow, per-role streams. |
| **Role-Level Effort** | `effort: low/medium/high` per role — match cognition budget to task. |
| **AKB** | File-based knowledge system. Search-driven. Compounds over time. |
| **Heartbeat Watch** | Real-time supervision. Redirect mid-execution if direction drifts. |

---

## Real-World Results

A crypto trading research team ran **13.5 hours of autonomous AI work** — zero human intervention:

| Metric | Value |
|--------|-------|
| Duration | 13.5 hours |
| Agent sessions | 174 |
| Hypotheses tested | 29 |
| Cost | $54 total ($2.5/hypothesis) |
| Critic role | Caught a false-positive before production |

**Cost trajectory across versions:**

| Version | Cost per wave |
|---------|--------------|
| Early beta (0.1.0-beta.8) | $1,342 |
| 0.2.0 | $19 |
| **0.2.16 (current)** | **$4** |

Auto-Amend + Handoff + Prompt Caching = 67–79% cost reduction per wave on identical workloads.

---

## Surfaces

| Surface | Status | What |
|---------|--------|------|
| **Plugin** | ✅ Primary | Claude Code plugin. Recommended entry point. |
| **Server** | ✅ Backbone | `tycono-server` headless API. All surfaces consume this. |
| **TUI** | 🟡 Maintenance | Standalone terminal UI — `npx tycono`. |
| **Pixel** | ❄️ Frozen | Isometric pixel office. Demo-only. |

### Pixel (Frozen)

Watch your AI team walk around and collaborate in an isometric office. Not actively developed — kept for demos. See [tycono.ai](https://tycono.ai) for a preview.

<p align="center">
  <img src=".github/assets/hero-office.png" alt="Pixel office" width="600" />
</p>

---

## Requirements

- Node.js >= 18
- [Claude Code CLI](https://claude.ai/download)

---

## Development

```bash
git clone https://github.com/seongsu-kang/tycono.git
cd tycono
npm install
npm run dev
```

### Monorepo

```
tycono/
├── packages/
│   ├── server/   ← tycono-server (headless API)
│   ├── plugin/   ← Claude Code plugin
│   ├── web/      ← tycono.ai
│   ├── tui/      ← Terminal UI
│   └── pixel/    ← Pixel office (frozen)
└── README.md
```

---

## Links

- [tycono.ai](https://tycono.ai)
- [Agencies](https://tycono.ai/agencies)
- [npm: tycono-server](https://www.npmjs.com/package/tycono-server)
- License: [MIT](LICENSE)
