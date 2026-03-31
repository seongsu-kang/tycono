# Sentinel Tower Defense — Game Design Document

**Version:** 1.0
**Date:** 2026-03-31
**Author:** PM

---

## 1. Game Overview

**Sentinel** is a grid-based tower defense game where players strategically place and upgrade towers to prevent waves of enemies from reaching the exit. The game features 4 distinct tower types, 5 enemy types, and 10 progressively challenging waves.

**Core Loop:** Earn gold → Place/upgrade towers → Survive wave → Repeat

---

## 2. Grid & Core Mechanics

### 2.1 Grid

| Parameter     | Value  |
|---------------|--------|
| Grid Width    | 15 cells |
| Grid Height   | 10 cells |
| Cell Size     | Uniform square |

- Enemies follow a predefined path from spawn to exit.
- Towers can only be placed on non-path cells.
- Grid is visible at all times with clear cell boundaries.

### 2.2 Lives System

- **Starting Lives:** 20
- Each enemy that reaches the exit subtracts **1 life** (regardless of enemy type).
- At 0 lives, the game is over.
- Lives cannot be recovered.

### 2.3 Speed Toggle

Players can toggle game speed at any time during a wave:

| Speed   | Multiplier | Use Case             |
|---------|------------|----------------------|
| Normal  | 1x         | Strategic planning   |
| Fast    | 2x         | Mid-wave speedup     |
| Turbo   | 3x         | Late-game efficiency |

Speed affects enemy movement, tower fire rates, and spawn intervals equally.

### 2.4 Gold Economy

| Source              | Details                          |
|---------------------|----------------------------------|
| Starting Gold       | 200G                             |
| Kill Rewards        | Per-enemy, varies by type        |
| Wave Completion     | Bonus gold, scales with wave #   |

---

## 3. Tower Types

All towers occupy exactly 1 grid cell. Towers can be upgraded in-place up to Level 3. Selling a tower refunds 50% of total invested gold.

### 3.1 Arrow Tower

**Role:** Fast, reliable single-target damage dealer. Backbone of early defense.

| Stat         | Level 1  | Level 2  | Level 3  |
|--------------|----------|----------|----------|
| Damage       | 10       | 18       | 30       |
| Range        | 3.0 cells| 3.5 cells| 4.0 cells|
| Fire Rate    | 1.5/sec  | 1.8/sec  | 2.2/sec  |
| Base Cost    | 50G      | —        | —        |
| Upgrade Cost | —        | 35G      | 45G      |
| Total Invest | 50G      | 85G      | 130G     |
| DPS          | 15.0     | 32.4     | 66.0     |

**Design Notes:**
- L1→L2: 116% DPS increase for 70% of base cost. Strong early investment.
- L2→L3: 104% DPS increase for 90% of base cost. Costly but powerful for late game.
- The go-to tower for the first 3 waves. Scales well into mid-game.

### 3.2 Cannon Tower

**Role:** Area damage dealer. Effective against clustered enemies.

| Stat           | Level 1   | Level 2   | Level 3   |
|----------------|-----------|-----------|-----------|
| Damage         | 40        | 70        | 110       |
| Range          | 2.5 cells | 3.0 cells | 3.5 cells |
| Fire Rate      | 0.5/sec   | 0.6/sec   | 0.7/sec   |
| Splash Radius  | 1.0 cell  | 1.3 cells | 1.6 cells |
| Base Cost      | 150G      | —         | —         |
| Upgrade Cost   | —         | 100G      | 120G      |
| Total Invest   | 150G      | 250G      | 370G      |
| DPS (single)   | 20.0      | 42.0      | 77.0      |

**Design Notes:**
- Single-target DPS is low, but splash makes it devastating against groups.
- L2 upgrade is the sweet spot: 67% of base cost for 110% DPS increase + splash growth.
- Best positioned at path choke points where enemies bunch up.
- Synergizes with Slow Tower to keep enemies clustered.

### 3.3 Slow Tower

**Role:** Utility/debuff tower. Slows enemies, amplifying other towers' effectiveness.

| Stat           | Level 1   | Level 2   | Level 3   |
|----------------|-----------|-----------|-----------|
| Damage         | 0         | 0         | 5         |
| Range          | 2.5 cells | 3.0 cells | 3.5 cells |
| Slow Effect    | 30%       | 45%       | 60%       |
| Slow Duration  | 2.0 sec   | 2.5 sec   | 3.0 sec   |
| Fire Rate      | 1.0/sec   | 1.0/sec   | 1.2/sec   |
| Base Cost      | 100G      | —         | —         |
| Upgrade Cost   | —         | 65G       | 80G       |
| Total Invest   | 100G      | 165G      | 245G      |

**Design Notes:**
- Does not deal meaningful damage — value is purely in slow effect.
- L3 adds minor damage (5) and faster application for finishing off weak enemies.
- One Slow Tower per choke point is usually sufficient.
- 60% slow on a Scout (2.0 → 0.8 cells/sec) makes it trivial; on a Tank (0.6 → 0.24), it nearly stops them.
- Critical tower for waves 5+ when Tanks and Bosses appear.

### 3.4 Sniper Tower

**Role:** Long-range, high single-target damage. Anti-boss specialist.

| Stat         | Level 1   | Level 2   | Level 3   |
|--------------|-----------|-----------|-----------|
| Damage       | 80        | 140       | 220       |
| Range        | 6.0 cells | 7.0 cells | 8.0 cells |
| Fire Rate    | 0.3/sec   | 0.35/sec  | 0.4/sec   |
| Base Cost    | 200G      | —         | —         |
| Upgrade Cost | —         | 130G      | 160G      |
| Total Invest | 200G      | 330G      | 490G      |
| DPS          | 24.0      | 49.0      | 88.0      |

**Design Notes:**
- Highest single-shot damage in the game. One-shots Scouts at L1.
- L3 Sniper covers most of the map (8 cells on a 15-wide grid).
- Slow fire rate means it wastes damage on weak enemies — position to target from afar so it hits tougher enemies first.
- Essential for Boss waves. Two L3 Snipers = 176 DPS on a single target.
- Expensive to max out (490G total), making it a late-game commitment.

---

## 4. Enemy Types

All enemies move along the predefined path. Speed is measured in grid cells per second.

### 4.1 Scout

| Stat         | Value         |
|--------------|---------------|
| HP           | 30            |
| Speed        | 2.0 cells/sec |
| Gold Reward  | 5G            |
| Abilities    | None          |

**Design Notes:** Appears in early waves in large numbers. Fast but fragile. Tests the player's coverage across the path. An Arrow Tower L1 kills one in 2 shots (1.3 sec).

### 4.2 Soldier

| Stat         | Value         |
|--------------|---------------|
| HP           | 80            |
| Speed        | 1.2 cells/sec |
| Gold Reward  | 10G           |
| Abilities    | None          |

**Design Notes:** The baseline enemy. Balanced HP and speed. Introduced wave 2. Requires focused fire or multiple towers. Arrow Tower L1 needs ~5.3 shots (3.5 sec) to kill.

### 4.3 Tank

| Stat         | Value                          |
|--------------|--------------------------------|
| HP           | 200                            |
| Speed        | 0.6 cells/sec                  |
| Gold Reward  | 25G                            |
| Abilities    | **Armored** — takes 20% reduced damage from Arrow towers |

**Design Notes:** Slow-moving damage sponge. Forces players to diversify tower types since Arrow towers deal reduced damage. Cannon splash and Sniper high-damage shots are effective counters. First appears wave 4.

### 4.4 Healer

| Stat         | Value                          |
|--------------|--------------------------------|
| HP           | 60                             |
| Speed        | 1.0 cells/sec                  |
| Gold Reward  | 15G                            |
| Abilities    | **Heal Aura** — heals all enemies within 1.5 cells for 5 HP/sec |

**Design Notes:** Low HP but extremely dangerous if not prioritized. The heal aura can sustain Tanks and Bosses significantly. Players should target Healers first or use Sniper towers to burst them down. First appears wave 6.

### 4.5 Boss

| Stat         | Value                          |
|--------------|--------------------------------|
| HP           | 800 (Wave 5) / 1500 (Wave 10) |
| Speed        | 0.5 cells/sec                  |
| Gold Reward  | 100G                           |
| Abilities    | **Fortified** — immune to slow effects above 40%. **Intimidate** — towers within 1.5 cells have 25% reduced fire rate |

**Design Notes:** The ultimate threat. Wave 5 Boss has 800 HP as a mid-game check; Wave 10 Boss has 1500 HP as the final challenge. Slow immunity cap means even L3 Slow Towers only slow to 40%. Intimidate punishes close-range placement — Snipers positioned far away are the counter. Requires a full defense setup to defeat.

---

## 5. Wave Design

### Design Philosophy
- **Waves 1-3:** Tutorial phase. Scouts and Soldiers teach basic tower placement.
- **Wave 4:** Introduction of Tanks forces tower diversity.
- **Wave 5:** Mid-boss spike — tests whether the player has built a solid foundation.
- **Waves 6-8:** Healers add complexity. Mixed compositions demand strategy.
- **Wave 9:** Stress test with high enemy count and variety.
- **Wave 10:** Final boss with support enemies. The ultimate challenge.

### Wave Definitions

#### Wave 1 — "First Contact"
| Enemy  | Count | Spawn Interval |
|--------|-------|----------------|
| Scout  | 8     | 1.5 sec        |

- **Completion Bonus:** 20G
- **Total Kill Gold:** 40G
- **Intent:** Gentle intro. Player places first towers.

#### Wave 2 — "Reinforcements"
| Enemy   | Count | Spawn Interval |
|---------|-------|----------------|
| Scout   | 5     | 1.5 sec        |
| Soldier | 4     | 2.0 sec        |

- **Completion Bonus:** 30G
- **Total Kill Gold:** 65G
- **Intent:** Soldiers are tougher; player may need a second tower.

#### Wave 3 — "Marching Orders"
| Enemy   | Count | Spawn Interval |
|---------|-------|----------------|
| Scout   | 3     | 1.2 sec        |
| Soldier | 6     | 1.8 sec        |

- **Completion Bonus:** 40G
- **Total Kill Gold:** 75G
- **Intent:** More Soldiers push the player to upgrade or add towers.

#### Wave 4 — "Heavy Armor"
| Enemy   | Count | Spawn Interval |
|---------|-------|----------------|
| Soldier | 8     | 1.5 sec        |
| Tank    | 2     | 3.0 sec        |

- **Completion Bonus:** 50G
- **Total Kill Gold:** 130G
- **Intent:** First Tanks. Arrow-only builds struggle due to armor. Player should consider Cannon or Sniper.

#### Wave 5 — "The Warden" (Mid-Boss)
| Enemy   | Count | Spawn Interval |
|---------|-------|----------------|
| Soldier | 4     | 1.5 sec        |
| Tank    | 3     | 2.5 sec        |
| Boss    | 1     | 5.0 sec (spawns last) |

- **Completion Bonus:** 75G
- **Total Kill Gold:** 215G
- **Intent:** Major difficulty spike. The Boss (800 HP) is the mid-game check. Support enemies soften defenses before the Boss arrives. Players who invested wisely survive; others lose significant lives.

#### Wave 6 — "Field Medics"
| Enemy   | Count | Spawn Interval |
|---------|-------|----------------|
| Soldier | 6     | 1.5 sec        |
| Tank    | 4     | 2.5 sec        |
| Healer  | 2     | 3.0 sec        |

- **Completion Bonus:** 60G
- **Total Kill Gold:** 190G
- **Intent:** Healers introduced. If the player ignores them, Tanks become very hard to kill. Teaches target prioritization.

#### Wave 7 — "Sustained Assault"
| Enemy   | Count | Spawn Interval |
|---------|-------|----------------|
| Soldier | 4     | 1.5 sec        |
| Tank    | 5     | 2.0 sec        |
| Healer  | 3     | 2.5 sec        |

- **Completion Bonus:** 70G
- **Total Kill Gold:** 210G
- **Intent:** More Tanks + Healers. Sustained pressure. Player needs both damage and utility (Slow + Cannon combos).

#### Wave 8 — "Swarm Tactics"
| Enemy   | Count | Spawn Interval |
|---------|-------|----------------|
| Scout   | 8     | 0.8 sec        |
| Soldier | 6     | 1.2 sec        |
| Tank    | 3     | 2.5 sec        |
| Healer  | 2     | 3.0 sec        |

- **Completion Bonus:** 80G
- **Total Kill Gold:** 205G
- **Intent:** Fast Scout swarm mixed with heavies. Tests both AoE (Cannon for Scouts) and single-target (Sniper for Tanks). Widest enemy variety so far.

#### Wave 9 — "The Gauntlet"
| Enemy   | Count | Spawn Interval |
|---------|-------|----------------|
| Soldier | 6     | 1.0 sec        |
| Tank    | 6     | 1.8 sec        |
| Healer  | 4     | 2.0 sec        |
| Scout   | 6     | 0.6 sec        |

- **Completion Bonus:** 90G
- **Total Kill Gold:** 280G
- **Intent:** Largest enemy count. Relentless pace. Everything the player has built is tested. Gold reward is generous to prepare for the finale.

#### Wave 10 — "Sentinel's Last Stand" (Final Boss)
| Enemy   | Count | Spawn Interval |
|---------|-------|----------------|
| Tank    | 4     | 2.0 sec        |
| Healer  | 3     | 2.5 sec        |
| Soldier | 4     | 1.5 sec        |
| Boss    | 2     | 6.0 sec (spawn last) |

- **Completion Bonus:** 150G (victory bonus)
- **Total Kill Gold:** 345G
- **Intent:** Two Bosses (1500 HP each) supported by Healers and Tanks. The hardest wave. Healers sustaining Bosses is the primary threat. Slow Towers to control pace + Snipers for Boss damage is the intended strategy.

---

## 6. Gold Economy Balance

### Cumulative Gold Projection

| After Wave | Kill Gold | Bonus | Cumulative Total (incl. 200G start) |
|------------|-----------|-------|--------------------------------------|
| 1          | 40        | 20    | 260                                  |
| 2          | 65        | 30    | 355                                  |
| 3          | 75        | 40    | 470                                  |
| 4          | 130       | 50    | 650                                  |
| 5          | 215       | 75    | 940                                  |
| 6          | 190       | 60    | 1190                                 |
| 7          | 210       | 70    | 1470                                 |
| 8          | 205       | 80    | 1755                                 |
| 9          | 280       | 90    | 2125                                 |
| 10         | 345       | 150   | 2620                                 |

### Spending Budget Milestones

| Milestone             | Gold Available | Example Build                              |
|-----------------------|----------------|--------------------------------------------|
| Start                 | 200G           | 2 Arrow (100G) + 1 Slow (100G)            |
| After Wave 3          | 470G           | 4 Arrow + 1 Slow + some upgrades          |
| After Wave 5          | 940G           | 6-8 towers, mix of types, some at L2      |
| After Wave 7          | 1470G          | 8-10 towers, core towers at L2-L3         |
| After Wave 10         | 2620G          | Full defense, key towers maxed             |

### Balance Targets
- **By Wave 5:** Player should afford 6-8 towers (mix of types). Average tower cost ~120G → 720-960G budget aligns with 940G available.
- **Upgrade vs. New Tower:** Upgrading an Arrow to L3 costs 80G (35+45) for +51 DPS. A new Arrow L1 costs 50G for 15 DPS. Upgrades are gold-efficient for damage but sacrifice coverage — this is the core strategic tension.
- **Late Game:** Total gold supports ~10-12 towers with several maxed, or more towers at lower levels. Player must choose depth vs. breadth.

---

## 7. UI/UX Considerations

### HUD Elements
- **Top Bar:** Lives (heart icon), Gold (coin icon), Wave counter (X/10)
- **Bottom Panel:** Tower selection bar with cost labels
- **Speed Control:** Toggle button in top-right corner (1x/2x/3x)
- **Tower Info:** Click placed tower to see stats, upgrade button, sell button

### Feedback
- Damage numbers float above enemies when hit
- Tower range circle shown on hover/selection
- Path highlighted at game start
- Wave preview showing upcoming enemy types before wave starts
- Screen shake on Boss spawn

---

## 8. Win/Lose Conditions

- **Win:** Survive all 10 waves with at least 1 life remaining.
- **Lose:** Lives reach 0 at any point.
- **Score:** Based on remaining lives, gold unspent, and waves completed. Encourages efficiency.
