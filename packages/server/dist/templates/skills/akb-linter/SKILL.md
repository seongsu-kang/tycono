---
name: akb-linter
description: "AKB document hygiene checker. Finds documents that confuse AI agents."
allowed-tools: Read, Glob, Grep, Bash
---

# AKB Document Linter

> "Only keep documents that AI can read and act on accurately."

## Core Problem

| Problem | AI Behavior | Result |
|---------|------------|--------|
| History mixed in | "Is v1 still active? Is v2 current?" | Token waste on verification |
| Placeholder docs | Grep noise, dead-end links | Search inefficiency |
| Duplicate docs | "Which one is truth?" | Wrong decisions |
| Links without context | "Why should I follow this?" | Exploration abandoned |
| **Implementation code mixed in** | Reads code directly, misses semantics | AKB purpose defeated |

---

## Checks (9 items)

### Category A: AI Confusion (Critical)

#### 1. History Contamination

AI takes documents literally. Humans skip "old stuff" but AI gets confused.

```
BAD: "Previously we used v1, then migrated to v2"
GOOD: "Currently using v2"
(History goes to separate archive)
```

**Keywords**: `previously`, `former`, `deprecated`, `no longer`, `migrated`, `legacy`, `v1`

#### 2. Placeholder/Empty Documents

Search noise. Grep matches useless files.

```
BAD: < 10 lines, only "TODO"/"TBD", frontmatter only
ACTION: Fill content or delete
```

#### 3. Duplicate/Conflict Check

Same info in 2 places = Single Source of Truth violation.

```
BAD: Two docs on same topic with slightly different info
ACTION: Merge into one, or clearly separate roles (Hub vs Node)
```

#### 4. Implementation Code Check

AKB = semantics (why, relationships). Code repo = implementation (how).

```
BAD: .py/.js/.ts/.sql files in AKB doc folders
BAD: Full function implementations in docs
GOOD: Architecture decisions, design philosophy
GOOD: Code coordinates -> "See src/web/src/components/"

EXCEPTIONS:
- .claude/ (infrastructure)
- src/ (source code submodule)
- Short code snippets in docs (<10 lines, for explanation)
```

### Category B: Structure Quality (Warning)

#### 5. TL;DR Section
- PASS: `## TL;DR` exists (3-5 lines)
- WARN: Missing

#### 6. Document Length (200-line threshold)
- PASS: <= 200 lines
- WARN: 200-300 lines (split recommended)
- FAIL: > 300 lines (split required)

#### 7. Context Links
- PASS: Links with context in body text
- WARN: Only `## Related` list (AI doesn't know why to follow)
- FAIL: No links (isolated document)

#### 8. Filename Keywords
- PASS: `competitor-analysis-openclaw.md`
- WARN: `analysis.md` (ambiguous)
- FAIL: `doc1.md`, `temp.md`

#### 9. Frontmatter
```yaml
---
title: "..."       # Required
akb_type: hub|node # Recommended
tags: [...]        # Recommended
status: active     # Recommended
---
```

---

## Severity

| Severity | Condition | Meaning |
|----------|-----------|---------|
| Critical | 1+ Category A issues | AI confusion, fix immediately |
| Warning | Category B issues only | Quality improvement recommended |
| Pass | No issues | AI can understand clearly |

---

## Core Principles

> "More docs is not better"
> "Only keep docs AI can act on accurately"

1. **History -> archive** - Current state only in active docs
2. **Empty -> delete** - Remove noise
3. **Duplicates -> merge** - Single Source of Truth
4. **Links with context** - Give AI reason to follow
5. **Semantics vs implementation** - AKB = "why", code = "how"
