---
title: Agentic Knowledge Base (AKB)
akb_type: node
status: active
tags:
  - type/how-to
  - domain/akb
---

# Agentic Knowledge Base (AKB)

**An autonomous knowledge protocol designed for AI agents**

> This is the **Canonical Reference** for AKB.

---

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

## Essence: File-Based Ontology

> "Inject the spirit of Ontology into Markdown"

```
┌─────────────────────────────────────────────────────┐
│           AKB = Lightweight Knowledge Graph          │
├─────────────────────────────────────────────────────┤
│                                                     │
│   Ontology/KG                AKB                    │
│   ───────────                ───                    │
│   Entity (Node)       →      .md file               │
│   rdf:type            →      tags: [type/]          │
│   domain              →      tags: [domain/]        │
│   rdfs:comment        →      TL;DR section          │
│   Edge/Relationship   →      Inline contextual link │
│                                                     │
└─────────────────────────────────────────────────────┘
```

---

## Architecture

AKB follows a 3-layer hierarchy: **[Root] → [Hub] → [Node]**.

```
project/
├── CLAUDE.md                      # [Root] Minimal routing (key file paths)
│
└── knowledge/
    │
    ├── domain/                    # [Hub] TOC for humans
    │   ├── domain.md              #   └─ Hub entry point
    │   └── entity-id-system.md    # [Node] Concrete knowledge
    │
    ├── investigation/
    │   ├── investigation.md       # [Hub]
    │   ├── autotrace/
    │   │   ├── autotrace.md       # [Sub-Hub]
    │   │   ├── fifo-strategy.md   # [Node] ← AI finds via search
    │   │   └── execution-flow.md  # [Node]
```

### Layer Roles

| Layer | Role | Description |
|-------|------|-------------|
| **Root** (CLAUDE.md) | Minimal routing | Auto-injected as system prompt, provides key file paths |
| **Hub** ({folder}.md) | TOC for humans | Folder overview; AI reads selectively |
| **Node** (*.md) | Actual information | What AI searches for via Grep/Glob |

---

## Schema Specification

### Frontmatter

```yaml
---
title: "Document title"
akb_type: hub|node
status: active|draft|deprecated
tags:
  - "type/..."      # Document type
  - "domain/..."    # Domain classification
---
```

| Field | Type | Purpose |
|-------|------|---------|
| `title` | string | Document identification |
| `akb_type` | enum | Distinguish hub/node |
| `status` | enum | Document lifecycle |
| `tags` | array | Domain classification (aids Grep search) |

### Tags (Classification)

| Namespace | Purpose | Examples |
|-----------|---------|----------|
| `type/` | Document type | `type/how-to`, `type/reference`, `type/api-guide` |
| `domain/` | Domain classification | `domain/investigation`, `domain/blockchain` |

---

## Writing Principles (5 Rules)

### Rule 1: TL;DR Required + Keyword Optimization

Include **key search terms naturally** so AI can find them via Grep.

```markdown
## TL;DR

- **AutoTrace** implements **FIFO tracking** strategy
- **DEX/Swap** transaction **routing** pattern handling
- **Bridge** cross-chain tracking logic
```

**Guidelines:**
- 3-5 bullet points
- **Bold key terms** (Grep search targets)
- Keep each point to one line

### Rule 2: Contextual Links (Inline)

Place links **within the flow of text**, not in isolated lists.

**Example 1: Natural inline placement**
```markdown
The core of Lambda Admin is the **[4-Layer classification system](./4-layer-architecture.md)**.

The ontology store will migrate from ES to [Virtuoso/ClickHouse](./hybrid-federation.md).
```

**Example 2: Next steps section**
```markdown
## Next Steps

- For DEX transaction handling → [dex-handling.md](./dex-handling.md)
- For Bridge tracking → [bridge-patterns.md](./bridge-patterns.md)
```

**Why it works:** Context helps AI understand *why* it should follow the link.

**Less effective pattern:**
```markdown
## Related Documentation  ← No context, just a list
- [4-layer-architecture.md](./4-layer-architecture.md)
- [hybrid-federation.md](./hybrid-federation.md)
```
→ Without context, AI can't judge *why* it should follow these links

### Rule 3: Keyword-Optimized Filenames

Make files easy to find via Grep/Glob with **descriptive filenames**.

```
❌ Vague
notes.md
strategy.md

✅ Clear
nexy-debugging.md
autotrace-fifo-strategy.md
bitcoin-utxo-handling.md
```

### Rule 4: Atomicity

- One document = one topic
- Keep under 200 lines (AI token efficiency)
- If too long, split and connect via Hub

### Rule 5: Semantic vs Implementation Separation

> **Implementation (DDL, specs) → code repo** | **Semantic (meaning, relationships, why) → AKB**

AKB holds knowledge for AI to **understand context**. Implementation details belong in the code repo.

| Belongs in AKB | Belongs in Code Repo |
|----------------|---------------------|
| "Why we designed it this way" | DDL / migration files |
| Relationship diagrams (Mermaid) | OpenAPI specs |
| Design trade-offs | Config files (YAML/JSON) |

**Reasons:**
- **Sync issues**: Code changes require AKB updates → drift happens
- **Single Source of Truth**: Code is the source of truth
- **AKB essence**: Context for AI understanding ≠ implementation details

**Recommended pattern:**
```markdown
> **DDL details**: See `{repo-name}` repo

[Mermaid ERD showing relationships only]

**Key design principles:**
- Why we chose this design
- What trade-offs exist
```

---

## Document Structure Template

```markdown
# Title

## TL;DR

- **Keyword1**: Description
- **Keyword2**: Description
- **Keyword3**: Description

---

## Body

### Section 1

Content...
See `path/file.md` for reference. (explicit path)

### Section 2

Content...

---

## Next Steps

- If [situation A] → [fileA.md](./fileA.md)
- If [situation B] → [fileB.md](./fileB.md)
- If [situation C] → [fileC.md](../folder/fileC.md)
```

---

## Hub Role

```
Hub = TOC for humans
    + keyword collection that aids Grep searches
```

**Hub responsibilities:**
1. Help humans understand folder contents
2. Contain enough keywords to appear in Grep results
3. AI reads selectively when it needs structural overview

---

## CLAUDE.md Routing Strategy

CLAUDE.md is included in the system prompt, so it has **size constraints**.

### Routing Principles

```markdown
# CLAUDE.md

## Task Routing

| Task | Entry Point |
|------|-------------|
| AutoTrace overview | `investigation/autotrace/autotrace.md` (Hub) |
| FIFO tracking strategy | `investigation/autotrace/fifo-strategy.md` |
| DEX handling | `investigation/autotrace/dex-handling.md` |
```

**Principles:**
- Frequently used core files → direct path
- Everything else → Hub reference

---

## vs Other Approaches

| Comparison | AKB | RAG | System Prompt |
|------------|-----|-----|---------------|
| Infrastructure | None | Vector DB | None |
| Token efficiency | Load only what's needed | Chunk-based | Load everything |
| AI navigation | Grep + contextual links | Similarity search | None |
| Maintenance | Edit files | Re-index | Edit prompt |

---

## Summary

> **AKB** is a file-based knowledge system designed so AI can autonomously navigate knowledge.

**Key points:**
- Minimal frontmatter (4 fields only)
- Connect via inline contextual links
- Hubs are TOCs for humans
- Optimize filenames and TL;DR for keyword search

> "Rather than changing AI behavior, optimize documents so AI can find them."

---

## Next Steps

- Tag system details → [tag-system.md](./tag-system.md)
- Naming conventions → [naming-convention.md](./naming-convention.md)

---

## Design Background

AKB was designed by analyzing actual AI agent behavior patterns.

**Observed AI behavior:**
- Skips Hubs, searches Nodes directly via Grep/Glob
- Does not parse frontmatter metadata (triggers, related, etc.)
- Follows links that appear inline with context

**Design principle:**
> "Don't try to change AI behavior — optimize documents so AI can find them naturally."

### AKB Does Not Force Navigation on AI

**AKB's responsibility lies with the document designer.**

| Misconception | Correct Understanding |
|---------------|----------------------|
| "AI must consciously navigate using AKB" | AKB does not prescribe how AI navigates |
| "AI must meta-recognize Hub intersections" | AI naturally finds what it needs |
| "Is AI following AKB principles?" | If the answer is good, AKB worked |

**Key insight:**
> If AI found the information it needed and produced a good answer, that's proof AKB is working.
> AI doesn't need to be meta-aware of "Am I following AKB right now?"
> That's the document designer's responsibility, not the AI's.
