---
title: "Game Development Knowledge"
akb_type: hub
status: active
domain: engineering
---

# Game Development Knowledge

> From concept to playable game — design the fun and build it

## TL;DR

- **Philosophy**: Fun is designed, not discovered. Iterative testing is the key.
- **Framework**: Concept > GDD > Prototype > Playtest > Polish
- **Goal**: Get to a playable version fast, then validate the fun
- **Principle**: "A playable game beats a perfect game"

---

## Knowledge Structure

| Document | Content | Role |
|----------|---------|------|
| [Game Dev Guide](./game-dev-guide.md) | Game loop, physics engine, Canvas/WebGL, frameworks | CTO, Engineer |
| [Game Design Doc](./game-design-doc.md) | GDD template, balancing methodology, difficulty curves | PM, Designer |

---

## Core Principles

### 1. Validate the Core Loop First

> "If the 30-second play loop isn't fun, 30 hours won't be either."

```
┌─────────────────────────────────────────────────────────┐
│  Core Loop (30 seconds)                                 │
│  Action → Reward → Progress → Action → ...              │
├─────────────────────────────────────────────────────────┤
│  Example: Shooter                                       │
│  Aim → Shoot → Kill enemy → Score points → Next enemy   │
└─────────────────────────────────────────────────────────┘

This loop must be fun before anything else is worth adding.
```

### 2. Prototypes Can Be Ugly

| Wrong Approach | Right Approach |
|----------------|----------------|
| "Perfect the graphics first" | "Validate core fun with placeholders" |
| "Add all features then test" | "Test one core mechanic at a time" |
| "Ship-quality prototype" | "Paper prototypes are fine" |

### 3. Playtesting Tells the Truth

```
What the developer thinks is fun ≠ What the player feels is fun

Playtest rules:
✅ Observe (behavior, expressions, stuck points)
✅ Ask questions ("why did you do that?")
✅ Don't intervene (watch, don't explain)
❌ Don't explain your intentions
```

---

## Game Development Process

```
┌─────────────────────────────────────────────────────────┐
│  Phase 1: Concept (1-2 days)                            │
│  ├─ Define core idea                                    │
│  ├─ Analyze reference games                             │
│  └─ One-page concept document                           │
├─────────────────────────────────────────────────────────┤
│  Phase 2: GDD + Design (2-3 days)                       │
│  ├─ Write game design document                          │
│  ├─ Define core mechanics                               │
│  └─ Art style direction                                 │
├─────────────────────────────────────────────────────────┤
│  Phase 3: Prototype (3-5 days)                          │
│  ├─ Implement core loop                                 │
│  ├─ Placeholder art                                     │
│  └─ First playtest                                      │
├─────────────────────────────────────────────────────────┤
│  Phase 4: Iteration (1-2 weeks)                         │
│  ├─ Feedback-driven changes                             │
│  ├─ Add/remove features                                 │
│  └─ Repeated playtesting                                │
├─────────────────────────────────────────────────────────┤
│  Phase 5: Polish (3-5 days)                             │
│  ├─ Finalize art/sound                                  │
│  ├─ UI/UX improvements                                  │
│  └─ Bug fixes, balancing                                │
└─────────────────────────────────────────────────────────┘
```

---

## Related Documents

- [Game Dev Guide](./game-dev-guide.md) — Technical guide
- [Game Design Doc](./game-design-doc.md) — GDD and balancing

---

*Preset: gamedev v1.0.0 | Tycono Official*
