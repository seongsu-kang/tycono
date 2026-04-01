---
name: knowledge-gate
description: "Knowledge documentation gatekeeper. Dynamic domain expert analysis to find optimal placement and connections."
allowed-tools: Read, Glob, Grep, Bash, Agent
---

# Knowledge Gate (Dynamic Domain Experts)

> "Prevent mindless document creation. Domain experts find optimal connections."

## Core Problem

| Pattern | Problem |
|---------|---------|
| New insight -> create new doc immediately | Duplicates existing docs |
| Similar topics scattered across files | Inefficient search, AI confusion |
| More docs != better knowledge | Defeats AKB purpose |
| **Isolated docs with no links** | **Discovery failure** |

---

## Process

### Step 1: Insight Summary

When documenting new knowledge:
1. **One-line summary** of the insight
2. Extract **3-5 keywords**

### Step 2: Existing Document Search (Quick Scan)

```bash
# Search with keywords
grep -rn "{keyword1}\|{keyword2}\|{keyword3}" --include="*.md" .

# Find similar topic docs
find . -name "*.md" | xargs grep -l "{core_topic}"
```

### Step 3: Dynamic Domain Expert Analysis (Diverge)

#### 3.1 Discover All Hubs

Hub pattern: `{folder-name}.md` as folder entry point, or `akb_type: hub` frontmatter.

```bash
# Find Hub documents
find . -name "*.md" -exec sh -c 'dir=$(dirname "$1"); base=$(basename "$dir"); fname=$(basename "$1" .md); [ "$base" = "$fname" ] && echo "$1"' _ {} \;
grep -rl "akb_type: hub" --include="*.md" .
```

#### 3.2 Parallel Expert Agent Execution

For **every discovered Hub**, run an Expert Agent in parallel:

Each expert evaluates:
- Is there a **direct dependency** between this insight and my domain?
- Rate relevance **strictly**: high (direct dependency) / medium (indirect) / none

**Relevance criteria (strict):**

| Relevance | Criteria | Example |
|-----------|----------|---------|
| HIGH | Without this insight, **my domain docs are incomplete** | "DB migration design" -> Architecture Hub |
| MEDIUM | Nice to reference but **not required** | "DB migration" -> Knowledge Hub |
| NONE | **No direct relation** to my domain | "DB migration" -> Company Hub |

**Anti-bias rule**: Don't force connections. Only HIGH = direct dependency.

#### 3.3 Converge Results

| Rule | Description |
|------|-------------|
| **Only HIGH gets action** | MEDIUM/NONE are informational only |
| **Pick 1 primary Hub** | If multiple HIGH, choose most direct |
| **Max 3 connections** | Limit total link work to 3 |
| **Deduplicate hierarchy** | If parent Hub is HIGH, skip child |

### Step 4: Decide Placement

| Overlap | Threshold | Action |
|---------|-----------|--------|
| HIGH (70%+) | Core topic matches | Add section to existing doc |
| MEDIUM (30-70%) | Related but different angle | New doc + cross-link |
| LOW (<30%) | Independent topic | New doc (register in Hub) |
| None | 0 search results | New doc |

### Step 5: AKB Linter Verification

Run akb-linter on new/modified document.

### Step 6: Execute Connections

1. **Hub routing**: Add link in the relevant Hub
2. **Cross-links**: Add mutual references to related docs
3. **Related Documentation**: Include links in new doc

---

## Decision Criteria

| Overlap | Action |
|---------|--------|
| 70%+ | Add to existing document (preferred) |
| 30-70% | Reference existing + cross-link |
| <30% | New document (justify + register in Hub) |

---

## Core Principles

> "1 doc added = maintenance cost increased"
> "Strengthen existing > Create new"
> "Isolated doc = dead doc"

1. **Existing first** - Never create without searching
2. **Expert analysis** - All domain Hubs weigh in
3. **Links required** - Hub routing + cross-links mandatory
4. **Justify creation** - State why new doc is needed
5. **Preview before action** - Show what will change
