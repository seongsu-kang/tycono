---
title: "Lean Startup Methodology"
akb_type: node
status: active
tags: ["lean", "startup", "mvp", "validation", "hypothesis"]
domain: business
---

# Lean Startup — Build-Measure-Learn

> "The real risk is building the wrong product. Fail fast, learn fast."

## TL;DR

- **Core**: Hypothesis > Experiment > Validate > Pivot/Proceed cycle
- **Goal**: Maximum learning with minimum resources
- **Tools**: Wizard of Oz MVP, Concierge MVP, Landing Page MVP

---

## 1. Build-Measure-Learn Cycle

```
┌─────────────────────────────────────────┐
│                                         │
│    IDEAS ─────────► BUILD              │
│      ▲                 │               │
│      │                 ▼               │
│    LEARN ◄──────── MEASURE             │
│                                         │
└─────────────────────────────────────────┘
```

### 1.1 Build

**Principle**: Only build the "minimum" needed to validate the hypothesis.

| MVP Type | Description | Best For |
|----------|-------------|----------|
| **Wizard of Oz** | Looks automated but is actually manual | Validating AI/automation services |
| **Concierge** | 1:1 manual service delivery | Validating service value |
| **Landing Page** | Feature description + email collection | Validating market demand |
| **Fake Door** | Button exists but feature doesn't | Measuring feature interest |
| **Prototype** | Minimal working version | Validating usability |

### 1.2 Measure

**Essential Metrics**:

```
┌──────────────────────────────────────────┐
│  AARRR Funnel (Pirate Metrics)           │
├──────────────────────────────────────────┤
│  Acquisition  — How did they find us?    │
│  Activation   — Was the first experience │
│                 good?                    │
│  Retention    — Did they come back?      │
│  Revenue      — Did they pay?            │
│  Referral     — Did they recommend?      │
└──────────────────────────────────────────┘
```

**Key MVP Metrics**:

| Metric | Calculation | Baseline |
|--------|-------------|----------|
| **Activation Rate** | Core action after signup / Signups | 40%+ |
| **Sean Ellis Test** | "Very disappointed without this product" responses | 40%+ |
| **NPS** | Recommendation intent (0-10) | 50+ |

### 1.3 Learn

**Decision Framework**:

```
Hypothesis: "{Customer} has {problem}, and {solution} will solve it"

Validation result:
  ✅ Hypothesis validated → Scale
  ❌ Hypothesis rejected → Pivot
  ⚠️ Inconclusive → More experiments needed
```

**Pivot Types**:

| Type | Description | Example |
|------|-------------|---------|
| **Zoom-in** | A feature becomes the whole product | Flickr (game → photos) |
| **Zoom-out** | Product becomes just a feature | - |
| **Customer Segment** | Different target customer | YouTube (dating → video) |
| **Customer Need** | Same customer, different problem | - |
| **Platform** | App → Platform or vice versa | - |
| **Channel** | Different distribution channel | - |
| **Value Capture** | Different revenue model | - |

---

## 2. Hypothesis Templates

### 2.1 Problem Hypothesis

```markdown
## Problem Hypothesis

**Customer Segment**: [Who?]
**Problem**: [What?]
**Current Alternatives**: [How are they solving it now?]
**Evidence**: [Why do we think this is a real problem?]

### Validation Method
- [ ] Customer interviews (N people)
- [ ] Survey (N respondents)
- [ ] Existing data analysis

### Success Criteria
- 60%+ of interviewees mention the problem
- Express dissatisfaction with current alternatives
```

### 2.2 Solution Hypothesis

```markdown
## Solution Hypothesis

**Core Feature**: [What?]
**Value Proposition**: [Why better than alternatives?]
**Differentiation**: [What's different from competitors?]

### Validation Method
- [ ] Wizard of Oz MVP test
- [ ] A/B test
- [ ] Prototype usability test

### Success Criteria
- Activation Rate 40%+
- Re-use intent 70%+
```

---

## 3. Customer Interview Guide

### 3.1 Interview Structure (30 minutes)

```
[5 min] Background questions
  - Role, daily routine, relevant experience

[15 min] Problem exploration
  - Tell me about the last time you did [X]
  - What was the hardest part?
  - How did you solve it?

[5 min] Solution reaction (optional)
  - Show [demo/mockup]
  - First impressions?
  - When would you use this?

[5 min] Wrap-up
  - Could you introduce someone else?
  - Any questions?
```

### 3.2 Questions to Avoid

| ❌ Bad Question | ✅ Good Question |
|----------------|-----------------|
| "Would you use this feature?" | "What did you do last time you faced this problem?" |
| "Do you like it?" | "What would you do without this?" |
| "How much would you pay?" | "How much do you spend on something similar now?" |

---

## 4. Execution Checklist

### 4.1 Week 1: Hypothesis Development

- [ ] Write problem hypothesis
- [ ] Define target customer (be specific)
- [ ] Line up 5+ customer interviews
- [ ] Prepare interview script

### 4.2 Week 2: Validation

- [ ] Complete 5 customer interviews
- [ ] Summarize interviews and extract patterns
- [ ] Validate/revise problem hypothesis
- [ ] Decide on MVP type

### 4.3 Week 3-4: Build & Measure

- [ ] Develop MVP (minimum features only)
- [ ] Set up measurement metrics
- [ ] Acquire first 10 users
- [ ] Collect and analyze data

### 4.4 Decision

- [ ] Consolidate learnings
- [ ] Decide: pivot or proceed
- [ ] Plan next cycle

---

## Related Documents

- [MVP Checklist](./mvp-checklist.md) — Pre-launch checklist
- [Tech Stack Guide](./tech-stack-guide.md) — Fast development stacks

---

*Preset: startup-mvp v1.0.0 | Tycono Official*
