# tycono

> Build an AI company. Watch them work.

**tycono** is an open-source platform that lets you create and run an AI-powered organization. Define roles (CTO, PM, Engineer...), assign them AI agents, and watch them collaborate through a real-time dashboard.

## Quick Start

```bash
# Create a new company
mkdir my-company && cd my-company
npx tycono init

# Start the dashboard
npx tycono
```

That's it. Your browser opens to a live dashboard showing your AI team at work.

## What You Get

- **Role-based AI agents** — Each role has its own persona, authority scope, and knowledge boundaries
- **Org hierarchy** — Roles report to each other. CTO dispatches to Engineers. PM coordinates with Design.
- **Real-time dashboard** — Watch your AI team work in an isometric office view
- **Knowledge management** — Automatic document routing, cross-linking, and Hub-based organization
- **Local-first** — Everything runs on your machine. Your data stays yours.
- **BYOK** — Bring your own Anthropic API key. No middleman.

## Requirements

- Node.js >= 18
- [Anthropic API key](https://console.anthropic.com/)

## Team Templates

When you run `init`, pick a template:

| Template | Roles |
|----------|-------|
| **Startup** | CTO + PM + Engineer |
| **Research** | Lead Researcher + Analyst + Writer |
| **Agency** | Creative Director + Designer + Developer |
| **Custom** | Start with no roles, build your own |

## How It Works

```
You (CEO)
  └── Give instructions via dashboard
        └── Context Engine routes to the right Role
              └── Role reads its knowledge, executes with authority
                    └── Results flow back up the org chart
```

Every role has:
- `role.yaml` — Identity, authority, knowledge scope
- `SKILL.md` — Tools and capabilities
- `profile.md` — Public-facing description
- `journal/` — Work history

## Project Structure

```
your-company/
├── CLAUDE.md           ← AI entry point
├── company/            ← Mission, vision, values
├── roles/              ← AI role definitions
├── projects/           ← Product specs and tasks
├── architecture/       ← Technical decisions
├── operations/         ← Standups, decisions
└── knowledge/          ← Domain knowledge
```

## CLI Usage

```bash
tycono              # Start server + open dashboard
tycono init          # Create a new company
tycono --help        # Show help
tycono --version     # Show version
```

## Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `ANTHROPIC_API_KEY` | Your Anthropic API key | — |
| `PORT` | Server port | auto-detect |
| `COMPANY_ROOT` | Company directory | current directory |

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

## License

[MIT](LICENSE)

---

*Built with tycono. An AI company that builds itself.*
