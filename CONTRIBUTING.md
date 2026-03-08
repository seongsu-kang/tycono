# Contributing to tycono

Thanks for your interest in contributing!

## Development Setup

```bash
git clone https://github.com/seongsu-kang/tycono.git
cd tycono

# Install dependencies
npm install
cd src/api && npm install && cd ../..
cd src/web && npm install && cd ../..

# Start development servers
npm run dev
```

The API server runs on `localhost:3001` and the web dev server on `localhost:5173`.

## Making Changes

1. Fork the repo and create a feature branch from `main`
2. Make your changes
3. Run type checking: `npm run typecheck`
4. Build the web frontend: `npm run build:web`
5. Commit with a clear message
6. Open a PR against `main`

## Branch Strategy

- `main` — stable release branch
- `feature/*` — feature branches (PR to main)
- `fix/*` — bug fix branches (PR to main)

## Commit Messages

Use clear, descriptive commit messages:

```
feat(engine): add role validation endpoint
fix(web): correct sidebar scroll on mobile
docs: update CLI usage examples
```

## Code Style

- TypeScript for all source code
- ESM modules (`import`/`export`)
- Use semicolons (project convention)
- Use `node:` prefix for Node.js built-in imports

## Project Structure

```
src/
├── api/          ← Express API server + Context Engine
│   └── src/
│       ├── engine/     ← Core AI engine
│       ├── routes/     ← API endpoints
│       └── services/   ← Business logic
└── web/          ← React + Vite frontend
    └── src/
        ├── components/
        ├── pages/
        └── services/
```

## Questions?

Open an issue or start a discussion on GitHub.
