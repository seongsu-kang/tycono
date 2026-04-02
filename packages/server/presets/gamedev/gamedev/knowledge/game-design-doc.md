---
title: "Game Design Document Template"
akb_type: node
status: active
tags: ["gdd", "game-design", "balancing", "difficulty"]
domain: business
---

# Game Design Document (GDD) — Template & Balancing Guide

> "An undocumented game design isn't an idea — it's a fantasy."

## TL;DR

- **GDD Purpose**: Get the entire team imagining the same game
- **Key Sections**: Concept, mechanics, player experience, content
- **Balancing**: Data-driven design + iterative playtesting

---

## 1. GDD Template

### 1.1 One-Page Concept (1-Page Pitch)

```markdown
# [Game Title]

## One-Line Description
A game where players experience [core fun] through [unique mechanic] in [genre]

## Elevator Pitch (30 seconds)
A [genre] game for [target players].
Delivers [player experience] through [core mechanic].
[Reference Game 1] meets [Reference Game 2].

## Core Fun
- 1. [First fun element]
- 2. [Second fun element]
- 3. [Third fun element]

## Target Player
- Age: [range]
- Gaming experience: [casual/core]
- Play time: [minutes per session]

## References
- [Game 1]: [which element to reference]
- [Game 2]: [which element to reference]
```

### 1.2 Full GDD Structure

```markdown
# [Game Title] - Game Design Document

## 1. Game Overview
### 1.1 Concept
### 1.2 Genre
### 1.3 Target Platform
### 1.4 Target Player
### 1.5 USP (Unique Selling Points)

## 2. Gameplay
### 2.1 Core Loop
### 2.2 Game Mechanics
### 2.3 Progression System
### 2.4 Difficulty Curve
### 2.5 Controls

## 3. Game World
### 3.1 Setting/Background
### 3.2 Characters
### 3.3 Story (if applicable)
### 3.4 Level/Map Structure

## 4. Art & Audio
### 4.1 Art Style
### 4.2 UI/UX Guide
### 4.3 Sound Design
### 4.4 Music

## 5. Technical Requirements
### 5.1 Platform
### 5.2 Engine/Framework
### 5.3 Performance Targets

## 6. Production Plan
### 6.1 Milestones
### 6.2 Resources
### 6.3 Risks
```

---

## 2. Core Mechanic Design

### 2.1 Mechanic Definition Template

```markdown
## Mechanic: [Name]

**Description**: [What the player does]

**Input**: [What controls trigger it]

**Result**: [What happens]

**Feedback**:
- Visual: [effects, animations]
- Audio: [sounds]
- Haptic: [vibration, if applicable]

**Fun Factor**: [Why this is fun]

**Related Values**:
| Variable | Value | Description |
|----------|-------|-------------|
| [var1] | [val] | [meaning] |
```

### 2.2 Mechanic Example

```markdown
## Mechanic: Dash

**Description**: Player moves a short distance at high speed

**Input**: Shift key

**Result**:
- 3x movement speed for 0.2 seconds
- Invincibility frames (dodge through attacks)
- 3-second cooldown

**Feedback**:
- Visual: Afterimage effect + screen blur
- Audio: "Swoosh" sound effect
- Haptic: Short vibration (mobile)

**Fun Factor**:
- Thrill of escaping dangerous situations
- Reward for mastering timing
- Aggressive engage option

**Related Values**:
| Variable | Value | Description |
|----------|-------|-------------|
| dashDuration | 0.2s | Dash duration |
| dashMultiplier | 3x | Speed multiplier |
| dashCooldown | 3s | Cooldown time |
| iFrames | 0.15s | Invincibility window |
```

---

## 3. Balancing Methodology

### 3.1 Balancing Variable Design

```
┌─────────────────────────────────────────────────────────┐
│  Core of balancing = meaningful choices                  │
├─────────────────────────────────────────────────────────┤
│  ✅ Good balance: Multiple viable strategies             │
│  ❌ Bad balance: One obvious optimal choice (no-brainer) │
└─────────────────────────────────────────────────────────┘

Trade-off design:
- Weapon A: High damage, slow attack speed
- Weapon B: Low damage, fast attack speed
→ Similar DPS, but different preferences per situation
```

### 3.2 Numerical Balancing Basics

```
RPG Damage Formula Example:

Base formula:
Damage = (Attack - Defense) × Skill Multiplier × Critical Multiplier

Variables:
| Element | Range | Growth Rate |
|---------|-------|-------------|
| Base Attack | 10-100 | +2/level |
| Defense | 5-50 | +1/level |
| Skill Multiplier | 1.0-3.0 | Fixed |
| Critical Chance | 5-25% | +0.5%/level |
| Critical Multiplier | 1.5-2.5 | Gear-dependent |

Balance checks:
1. Level 1 vs Level 1: Expected fight duration?
2. Level 10 vs Level 10: Scaling appropriate?
3. Max level vs Boss: Challenging but fair?
```

### 3.3 Difficulty Curve

```
Ideal difficulty curve:

Difficulty
  │
  │                    ╭──────
  │              ╭─────╯
  │         ╭────╯
  │     ╭───╯
  │  ───╯
  │──╯
  └────────────────────────── Progression
     Tutorial  Early  Mid   Late

Core principles:
1. Early: Low difficulty → System learning
2. Mid: Gradual increase → Mastery development
3. Late: Steep increase → Challenge and achievement
4. Spikes: Temporary spikes at bosses/gates
```

### 3.4 Economy Balancing

```
Resource circulation model:

Income
├── Base hourly income: 100
├── Quest rewards: 50-500
├── Enemy drops: 5-50
└── Treasure chests: 100-1000

Sinks
├── Equipment purchase: 500-5000
├── Upgrades: 100-1000
├── Consumables: 50-200
└── Repair costs: 10-50 per battle

Balance checks:
- 1 hour of play = Can buy 1 piece of equipment?
- Top-tier equipment = Achievable in reasonable play time?
- Economy not overflowing or starved?
```

---

## 4. Playtest Guide

### 4.1 Test Types

| Type | Purpose | Timing | Participants |
|------|---------|--------|--------------|
| Internal Test | Bugs, basic fun | During development | Dev team |
| Alpha Test | Core mechanic validation | After prototype | Friends/acquaintances |
| Beta Test | Balance, content | Pre-launch | External testers |
| Post-Launch | Real user data | After launch | Actual players |

### 4.2 Observation Points

```
Playtest checklist:

□ Did they understand the tutorial?
□ Were goals clear?
□ Where did they get stuck?
□ Where did they have fun?
□ Where did they get bored?
□ Did they play differently than expected?
□ What questions came up naturally?
□ When did they want to quit?
□ Did they want to play again?
```

### 4.3 Feedback Collection Questions

```
Post-test questions:

1. How would you describe this game to someone?
2. What was the most fun moment?
3. What was the most frustrating moment?
4. What didn't you understand?
5. Would you play again? Why?
6. What do you think about [Feature X]?
7. How likely would you recommend this to a friend? (1-10)
```

---

## 5. GDD Writing Tips

### 5.1 Do's and Don'ts

```
✅ DO:
- Write specifically (include numbers, examples)
- Make it understandable for any team member
- Version control + change history
- Use visual aids (mockups, flowcharts)
- Update regularly

❌ DON'T:
- Vague language ("make it fun," "feel natural")
- Write once and forget
- Make it too long (core first)
- Vision that can't be built
- Fear of changes
```

### 5.2 Document Management

```
GDD version management:

v0.1 — Initial concept (1 page)
v0.5 — Core mechanic definition
v1.0 — Complete version for prototype
v1.x — Updates during development
v2.0 — Release version

Change log:
| Date | Version | Change | Author |
|------|---------|--------|--------|
| 2024-01-15 | v1.1 | Adjusted jump height | @designer |
| 2024-01-18 | v1.2 | Added new enemy type | @pm |
```

---

## Related Documents

- [Game Dev Guide](./game-dev-guide.md) — Technical guide
- [Knowledge Hub](./knowledge.md) — Game development knowledge hub

---

*Preset: gamedev v1.0.0 | Tycono Official*
