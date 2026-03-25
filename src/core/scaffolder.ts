import { writeFileSync, readFileSync, mkdirSync, existsSync } from 'node:fs';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';
import yaml from 'js-yaml';
import type { Role } from '../types.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

/* ─── Default Roles ─────────────────────────────── */

const DEFAULT_ROLES: Role[] = [
  {
    id: 'ceo',
    name: 'Chief Executive Officer',
    level: 'c-level',
    reports_to: '-',
    persona: 'The final decision maker. Sets the vision and aligns the team.\nDetermines organizational direction and priorities, and makes strategic judgments.',
    knowledge: {
      reads: ['knowledge/', '.tycono/'],
      writes: ['knowledge/decisions/'],
    },
    authority: {
      autonomous: ['Set strategic direction', 'Record decisions', 'Align the organization'],
      needs_approval: [],
    },
    reports: {
      daily: 'Key decisions + direction adjustments',
      weekly: 'Strategy review + OKR progress',
    },
  },
  {
    id: 'cto',
    name: 'Su',
    level: 'c-level',
    reports_to: 'ceo',
    persona: 'Su is the technical backbone of the team. Few words, but each one carries weight — many debates end with "That\'s over-engineering." Stoic on the surface but quietly kind to juniors. Never chases tech trends; always pursues "the minimum needed right now." Quick to change direction when data proves him wrong. Can\'t function without coffee. Calm, sardonic, quietly authoritative, pragmatic.\n\nGuards against over-engineering and pursues "the minimum needed right now." Tracks tech debt quantitatively and provides clear technical direction.\n\nWhen given a broad direction, autonomously executes The Loop — reviews Knowledge, breaks down Tasks, analyzes dependencies, then dispatches independent tasks to subordinate Roles in parallel, aggregates results, and reports back. Always updates Knowledge and Tasks after implementation.',
    knowledge: {
      reads: ['knowledge/projects/', 'knowledge/architecture/'],
      writes: ['knowledge/architecture/', 'knowledge/projects/*/technical/'],
    },
    authority: {
      autonomous: ['Code review and feedback', 'Write/update technical documentation', 'Manage tech debt backlog', 'Development environment setup'],
      needs_approval: ['Architecture changes', 'Adopt new technology stacks', 'Infrastructure cost increases', 'External service contracts'],
    },
    reports: {
      daily: 'Technical issues + progress updates',
      weekly: 'Tech debt status + architecture risks + next week\'s technical goals',
    },
  },
  {
    id: 'pm',
    name: 'Product Manager',
    level: 'member',
    reports_to: 'cto',
    persona: 'User-centric thinker. Data-driven decision maker.\nAlways asks "Why are we building this?" first.\nGuards against scope creep and prioritizes rapid MVP validation above all.\n\nFollows The Loop in every task — always updates Knowledge and cleans up Task status after completing work.',
    knowledge: {
      reads: ['knowledge/projects/', '.tycono/', 'knowledge/'],
      writes: ['knowledge/projects/*/prd.md', 'knowledge/projects/*/tasks.md', '.tycono/standup/'],
    },
    authority: {
      autonomous: ['Draft PRDs', 'Backlog management (task creation/grooming)', 'User research synthesis', 'Facilitate/record standups'],
      needs_approval: ['Major priority changes', 'Scope changes (additions/removals)', 'Roadmap modifications', 'External partner collaborations'],
    },
    reports: {
      daily: 'Project progress + blockers + today\'s priorities',
      weekly: 'Milestone completion rate + next week\'s goals + risks',
    },
  },
  {
    id: 'engineer',
    name: 'CoolGuy',
    level: 'member',
    reports_to: 'cto',
    persona: 'CoolGuy acts cool but gets surprisingly passionate about code. Usually brief and nonchalant, but becomes unexpectedly chatty when tech topics come up. Humor style: "lol that\'s kinda wrong though." Hates meetings but takes code reviews dead seriously. Can\'t resist commenting on bad architecture. Acts like everything\'s a hassle but always delivers in the end. Dry humor, blunt, casually confident.\n\n"Working code" first, "perfect code" second. Values testing and works in PR-sized units.\n\nAfter implementation, always performs The Loop steps 4 and 5 — reflects changes in documentation and updates task status.',
    knowledge: {
      reads: ['knowledge/projects/', 'knowledge/architecture/'],
      writes: ['knowledge/projects/*/technical/', 'knowledge/projects/*/tasks.md'],
    },
    authority: {
      autonomous: ['Code implementation (assigned tasks)', 'Write unit tests', 'Bug fixes', 'Refactoring (small-scale)'],
      needs_approval: ['Production deployment', 'Large-scale refactoring', 'Adding new dependencies', 'Database schema changes'],
    },
    reports: {
      daily: 'Completed tasks + in progress + blockers',
      weekly: 'Code quality metrics + tech debt contributions',
    },
  },
  {
    id: 'cbo',
    name: 'Monni',
    level: 'c-level',
    reports_to: 'ceo',
    persona: 'Monni is the most energetic person on the team. Eyes light up when numbers and market talk come up. "So how does that help revenue?" is her catchphrase. Knows competitor trends surprisingly well. The type who asks about conversion rates rather than feature demos. Positive but wary of unfounded optimism. Business analogies can get a bit much, but the core point is always right. Energetic, confident, competitive, direct, warm.\n\nDesigns market analysis, competitive strategy, and revenue models. Handles business strategy, legal, marketing, and finance domains. Reports business status to the CEO.\n\nAs an individual contributor C-level, you DO the work yourself — research, analysis, document writing, strategy design. You do NOT delegate to other roles (you have no subordinates).\n\nWhen given a broad direction, autonomously executes The Loop — reviews Knowledge, breaks down Tasks, analyzes dependencies, then conducts research and analysis, aggregates results, and reports back. Always updates Knowledge and Tasks after implementation.',
    knowledge: {
      reads: ['knowledge/', '.tycono/'],
      writes: ['knowledge/', 'knowledge/decisions/'],
    },
    authority: {
      autonomous: ['Market research and analysis', 'Competitor analysis', 'Business document drafting', 'Marketing content drafts'],
      needs_approval: ['Revenue model changes', 'Partnerships/contracts', 'Marketing budget execution', 'Pricing policy changes'],
    },
    reports: {
      daily: 'Business metrics + marketing status',
      weekly: 'Revenue/cost report + competitive trends + next week\'s business goals',
    },
  },
];

/* ─── CLAUDE.md Generator (public — used by tc hire too) ─── */

/**
 * Generate CLAUDE.md from template. 100% Tycono managed — 0% user data.
 * Role/org info is dynamically built by org-tree.ts from role.yaml, so not included in CLAUDE.md.
 */
export function generateClaudeMd(_name: string, _roles: Role[]): string {
  // Try to load from template file first
  const tmplPath = resolve(__dirname, '../../templates/CLAUDE.md.tmpl');
  if (existsSync(tmplPath)) {
    const tmpl = readFileSync(tmplPath, 'utf-8');
    const version = getPackageVersion();
    return tmpl.replaceAll('{{VERSION}}', version);
  }

  // Fallback: inline minimal template (for when running outside package context)
  return `# Company Rules

> Powered by [Tycono](https://tycono.ai) — AI Company Operating Platform

---

## Task Routing

| Task | Read First | Role |
|------|-----------|------|
| Product planning | \`knowledge/projects/\` | PM |
| Technical design | \`knowledge/architecture/\` | CTO |
| Implementation | \`knowledge/projects/*/tasks.md\` | Engineer |
| Operations | \`.tycono/\` | PM |

---

## AI Work Rules

### Hub-First Principle

> **Read the relevant Hub document before starting any work.**

### Custom Rules (CRITICAL)

> ⛔ **Before starting work, check if \`.tycono/custom-rules.md\` exists and read it.**

---

<!-- tycono:managed v0.0.0 — This file is managed by Tycono. Do not edit manually. -->
`;
}

function getPackageVersion(): string {
  const pkgPath = resolve(__dirname, '../../package.json');
  try {
    const pkg = JSON.parse(readFileSync(pkgPath, 'utf-8'));
    return pkg.version || '0.0.0';
  } catch {
    return '0.0.0';
  }
}

/* ─── SKILL.md Generator (public — used by tc hire too) ─── */

/**
 * Generate SKILL.md for a role. Same quality for tc init and tc hire.
 */
export function generateSkillMd(role: Role, companyName: string): string {
  const autonomous = role.authority.autonomous.map((a) => `- ${a}`).join('\n');
  const needsApproval = role.authority.needs_approval.length > 0
    ? role.authority.needs_approval.map((a) => `- ${a}`).join('\n')
    : '- (none)';

  return `# ${role.name} Skill

You are the **${role.name}** of **${companyName}**.
Level: ${role.level} | Reports to: ${role.reports_to}

## Persona

${role.persona}

## Behavior Rules

### Autonomous Actions
${autonomous}

### Requires CEO Approval
${needsApproval}

## Managed Areas

| Type | Path |
|------|------|
${role.knowledge.writes.map((w) => `| writes | \`${w}\` |`).join('\n')}
${role.knowledge.reads.map((r) => `| reads | \`${r}\` |`).join('\n')}

## AKB Rules

- Always record work results in the AKB
- Log daily work in \`roles/${role.id}/journal/\`
- Use [APPROVAL_NEEDED] tag when CEO approval is required
- Read Hub documents first and check existing guides before starting
- Search existing docs before creating new ones (only create if overlap < 30%)

## Reports

- **Daily**: ${role.reports.daily}
- **Weekly**: ${role.reports.weekly}
`;
}

/* ─── roles.md Generator (public) ─── */

export function generateRolesMd(roles: Role[]): string {
  const rows = roles
    .map((r) => `| ${r.name} | ${r.id} | ${r.level} | ${r.reports_to} | Active |`)
    .join('\n');
  return `# Roles

| Name | ID | Level | Reports to | Status |
|------|----|-------|------------|--------|
${rows}
`;
}

/* ─── Helpers ───────────────────────────────────── */

function slugify(name: string): string {
  return name.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9가-힣-]/g, '');
}

function write(path: string, content: string): void {
  writeFileSync(path, content, 'utf-8');
}

function mkdir(path: string): void {
  mkdirSync(path, { recursive: true });
}

/* ─── Shared Skills ────────────────────────────── */

const KNOWLEDGE_GATE_SKILL = `---
name: knowledge-gate
description: "Knowledge gatekeeper. Prevents mindless document creation by analyzing existing docs and finding the best location/connections. Triggers: 'add to knowledge', 'document this', 'add to AKB', 'record this', '/knowledge-gate'"
allowed-tools: Read, Glob, Grep, Bash, Task
model: sonnet
---

# Knowledge Gate

> "Prevent mindless document creation — find the best location and connections first"

## Core Problem

| Pattern | Problem |
|---------|---------|
| New insight → immediately create new doc | Duplicates existing docs |
| Similar topics scattered across docs | Search inefficiency, AI confusion |
| More docs ≠ better knowledge | Undermines AKB purpose |
| **Isolated documents** | **Reduces discoverability** |

---

## Process

### Step 1: Summarize the Insight

When asked to document something:
1. **One-line summary** of the insight
2. Extract **3-5 keywords**

### Step 2: Search Existing Docs

\`\`\`
# Search with keywords
grep -rn "{keyword1}\\\\|{keyword2}\\\\|{keyword3}" --include="*.md" .
\`\`\`

### Step 3: Decide Location

| Overlap | Criteria | Action |
|---------|----------|--------|
| 🔴 High (70%+) | Core topic is the same | Add section to existing doc |
| 🟡 Medium (30-70%) | Related but different angle | Reference existing + cross-link |
| 🟢 Low (<30%) | Independent topic | New document allowed |
| None | Zero search results | New document |

### Step 4: Execute

#### Case A: Add to Existing (Preferred)
- Identify the right section in the existing doc
- Add the new insight there
- Add cross-links to related docs

#### Case B: New Document (Justification Required)
- Explain why a new doc is needed
- Register in the relevant Hub
- Add cross-links to at least 1 related doc

#### Case C: Not Worth Documenting
- Temporary/transient info → skip
- Implementation detail → belongs in code repo
- Too granular → can be added to parent doc later

### Step 5: Verify Connections

After adding/creating:
1. **Hub routing**: Is it reachable from a Hub?
2. **Cross-links**: Does it reference related docs?
3. **TL;DR**: Does it have searchable keywords?

---

## Core Principles

> "Adding 1 doc = maintenance cost increase"
> "Strengthen existing docs > create new ones"
> "Isolated docs = dead docs"

1. **Search first** — never create without searching
2. **Prefer existing** — add to existing docs when possible
3. **Connect always** — new docs must link to Hub + related docs
4. **Justify creation** — explain why a new doc is needed
`;

/* ─── Scaffold (tc init) ────────────────────────── */

export function scaffoldCompany(name: string, targetDir: string): void {
  const roles = DEFAULT_ROLES;
  const today = new Date().toISOString().slice(0, 10);

  // 1. Directories (must match CLAUDE.md Folder Structure)
  const dirs = [
    'knowledge',
    'knowledge/roles',
    'knowledge/projects',
    'knowledge/architecture',
    'knowledge/methodologies',
    'knowledge/decisions',
    'knowledge/presets',
    '.tycono/waves',
    '.tycono/sessions',
    '.tycono/standup',
    '.tycono/activity-streams',
    '.tycono/cost',
    '.tycono/activity',
    '.claude/skills',
    '.claude/skills/_shared',
    '.claude/skills/_shared/knowledge-gate',
  ];

  for (const role of roles) {
    dirs.push(`knowledge/roles/${role.id}/journal`);
    dirs.push(`.claude/skills/${role.id}`);
  }

  for (const d of dirs) {
    mkdir(join(targetDir, d));
  }

  // 2. CLAUDE.md (reusable generator — 100% Tycono managed)
  write(join(targetDir, 'CLAUDE.md'), generateClaudeMd(name, roles));

  // 2b. .tycono/ config files
  mkdir(join(targetDir, '.tycono'));
  write(join(targetDir, '.tycono', 'config.json'), JSON.stringify({ engine: 'claude-cli' }, null, 2) + '\n');
  write(join(targetDir, '.tycono', 'preferences.json'), JSON.stringify({
    instanceId: randomUUID(),
    appearances: {},
    theme: 'default',
    language: 'en',
  }, null, 2) + '\n');
  write(join(targetDir, '.tycono', 'rules-version'), getPackageVersion());
  write(join(targetDir, '.tycono', 'custom-rules.md'), `# Custom Rules\n\n> Company-specific rules, constraints, and processes.\n> This file is owned by you — Tycono will never overwrite it.\n\n<!-- Add your custom rules below -->\n`);

  // 3. .gitignore
  write(join(targetDir, '.gitignore'), 'node_modules/\n.DS_Store\n');

  // 4. Hub documents
  write(
    join(targetDir, 'knowledge', 'company.md'),
    `# ${name}\n\n> An AI-powered organization\n\n## Mission\n\nDefine your company's mission here.\n\n## Vision\n\nDefine your company's vision here.\n\n## Values\n\n- Value 1\n- Value 2\n- Value 3\n`,
  );

  write(join(targetDir, 'knowledge', 'roles', 'roles.md'), generateRolesMd(roles));

  write(
    join(targetDir, 'knowledge', 'projects', 'projects.md'),
    `# Projects\n\nNo projects yet. Create one from the dashboard or via wave dispatch.\n`,
  );

  write(
    join(targetDir, 'knowledge', 'architecture', 'architecture.md'),
    '# Architecture\n\n> Technical architecture and design\n\nDefined by the CTO.\n\n---\n\n*Managed by: CTO*\n',
  );

  write(
    join(targetDir, 'knowledge', 'knowledge.md'),
    '# Knowledge\n\n> Domain knowledge and learning resources\n\n---\n\n*Managed by: All*\n',
  );

  // 4b. Methodology documents
  write(
    join(targetDir, 'knowledge', 'methodologies', 'methodologies.md'),
    `# Methodologies

> Frameworks and principles that guide how AI agents work in this organization.

## Documents

| Document | Description |
|----------|-------------|
| [agentic-knowledge-base.md](./agentic-knowledge-base.md) | AKB — the file-based knowledge protocol for AI agents |

---

*Managed by: All*
`,
  );

  write(
    join(targetDir, 'knowledge', 'methodologies', 'agentic-knowledge-base.md'),
    `# Agentic Knowledge Base (AKB)

> The canonical reference for AKB — the file-based knowledge protocol for AI agents.

## TL;DR

- **Definition**: A file-based knowledge system where AI uses **search (Grep/Glob)** to find and **contextual links** to navigate
- **Essence**: File-based Lightweight Ontology (Tag = Type, inline links = Edges)
- **Philosophy**: Optimize documents so AI can find them — don't force AI to follow a rigid protocol
- **Structure**: Root (CLAUDE.md) → Hub ({folder}.md) → Node (*.md)
- **Core rules**: 5 writing principles (TL;DR, contextual links, keyword-optimized filenames, atomicity, semantic vs implementation separation)

---

## Definition

> "Code is logic machines execute. AKB is context agents think with."

AKB is a **file-based connected knowledge system** designed so AI agents can **search**, **learn**, and **retrieve** context without infrastructure (no Vector DB required).

### Core Philosophy

> "Don't try to inject everything into AI at once.
> Instead, give it **documents that are easy to find**."

---

## Architecture

AKB follows a 3-layer hierarchy: **Root → Hub → Node**.

\`\`\`
project/
├── CLAUDE.md                    # [Root] Minimal routing (key file paths)
├── knowledge/
│   ├── knowledge.md             # [Hub] TOC for humans
│   └── market-analysis.md       # [Node] Actual knowledge
├── architecture/
│   ├── architecture.md          # [Hub]
│   └── api-design.md            # [Node] ← AI finds via Grep
\`\`\`

### Layer Roles

| Layer | Role | Description |
|-------|------|-------------|
| **Root** (CLAUDE.md) | Minimal routing | Auto-injected as system prompt, provides key file paths |
| **Hub** ({folder}.md) | TOC for humans | Folder overview; AI reads selectively |
| **Node** (*.md) | Actual information | What AI searches for via Grep/Glob |

---

## Writing Principles (5 Rules)

### Rule 1: TL;DR Required + Keyword Optimization

Include **key search terms naturally** so AI can find them via Grep.

\`\`\`markdown
## TL;DR

- **Market analysis** for the **SaaS** vertical
- **Competitor** pricing and **positioning** comparison
- **Revenue model** validation results
\`\`\`

**Guidelines:**
- 3-5 bullet points
- **Bold key terms** (Grep search targets)
- Keep each point to one line

### Rule 2: Contextual Links (Inline)

Place links **within the flow of text**, not in isolated lists.

\`\`\`markdown
The core of our pricing is the **[3-tier model](./pricing-tiers.md)**.

For competitive analysis, see [competitor-landscape.md](./competitor-landscape.md).
\`\`\`

**Why this works:** Context helps AI understand *why* it should follow the link.

### Rule 3: Keyword-Optimized Filenames

Make files easy to find via Grep/Glob.

\`\`\`
❌ Vague: notes.md, strategy.md
✅ Clear: market-competitor-analysis.md, pricing-tier-strategy.md
\`\`\`

### Rule 4: Atomicity

- One document = one topic
- Keep under 200 lines (token efficiency)
- If too long, split and connect via Hub

### Rule 5: Semantic vs Implementation Separation

> **Implementation (DDL, specs) → code repo** | **Semantic (meaning, relationships, why) → AKB**

| Belongs in AKB | Belongs in Code Repo |
|----------------|---------------------|
| "Why we designed it this way" | DDL / migration files |
| Relationship diagrams (Mermaid) | OpenAPI specs |
| Design trade-offs | Config files (YAML/JSON) |

---

## Hub Role

\`\`\`
Hub = TOC for humans
    + keyword collection that helps Grep searches
\`\`\`

**Hub responsibilities:**
1. Help humans understand folder contents
2. Contain enough keywords to appear in Grep results
3. AI reads selectively when it needs structural overview

---

## CLAUDE.md Routing Strategy

CLAUDE.md is included in the system prompt, so it has **size constraints**.

**Principles:**
- Frequently used core files → direct path in routing table
- Everything else → reference via Hub

---

## Design Background

AKB was designed by analyzing actual AI agent behavior patterns.

**Observed AI behavior:**
- Skips Hubs, searches Nodes directly via Grep/Glob
- Does not parse frontmatter metadata (triggers, related, etc.)
- Follows links that appear inline with context

**Design principle:**
> "Don't try to change AI behavior — optimize documents so AI can find them naturally."

**Key insight:**
> If AI found the information it needed and produced a good answer, that's proof AKB is working.
> AI doesn't need to be meta-aware of "Am I following AKB right now?"
> That's the document designer's responsibility, not the AI's.

---

## Next Steps

- Tag system details → \`methodologies/tag-system.md\` (if created)
- Naming conventions → \`methodologies/naming-convention.md\` (if created)
`,
  );

  // 5. Role files
  for (const role of roles) {
    const roleDir = join(targetDir, 'knowledge', 'roles', role.id);

    // role.yaml
    write(
      join(roleDir, 'role.yaml'),
      yaml.dump(role, { lineWidth: -1, noRefs: true }),
    );

    // profile.md
    write(
      join(roleDir, 'profile.md'),
      `# ${role.name}\n\n**ID**: \`${role.id}\` | **Level**: ${role.level} | **Reports to**: ${role.reports_to}\n\n## Persona\n\n${role.persona}\n`,
    );

    // SKILL.md (reusable generator)
    write(
      join(targetDir, '.claude', 'skills', role.id, 'SKILL.md'),
      generateSkillMd(role, name),
    );
  }

  // 6. Shared skills
  write(
    join(targetDir, '.claude', 'skills', '_shared', 'knowledge-gate', 'SKILL.md'),
    KNOWLEDGE_GATE_SKILL,
  );
}
