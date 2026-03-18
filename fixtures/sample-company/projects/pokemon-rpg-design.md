---
title: "Pokemon-Style RPG - Game Design Document"
date: 2026-03-14
status: active
version: 1.0
---

# Pokemon-Style RPG - Game Design Document

## Executive Summary

A browser-based Pokemon-style RPG where players create a custom character, battle through three progressive stages (Wild Encounters, Gym Challenge, Final Boss), and grow stronger through XP and leveling. The game emphasizes strategic turn-based combat with clear risk/reward choices.

**Target Playtime**: 15-20 minutes for full completion
**Difficulty**: Challenging but fair - requires strategic action choices

---

## 1. Game Story & Setting

### Narrative Hook

You are a young adventurer entering the **Crystal Valley** - a mystical land where fighters prove their worth by conquering three legendary trials. Customize your appearance, master turn-based combat, and become the Valley Champion.

### World Description

**Crystal Valley** is a vibrant realm divided into three regions:

1. **Wildwood Forest** - Dense woods filled with wild creatures perfect for training
2. **Azure Gym** - A prestigious combat arena run by Gym Leader Kai
3. **Obsidian Peak** - The volcanic mountain where the Shadow Dragon awaits

The Valley judges all who enter. Only those who defeat all three trials earn the title of **Valley Champion**.

### Win Condition

Defeat the Shadow Dragon at Obsidian Peak to become Valley Champion.

---

## 2. Character Customization

Players create their fighter using the following options:

### Skin Tone (5 options)
- Fair
- Tan
- Bronze
- Deep
- Alabaster

### Hair Style (6 options)
- Short Spiky
- Long Flowing
- Buzz Cut
- Ponytail
- Curly Afro
- Braided

### Hair Color (5 options)
- Black
- Brown
- Blonde
- Red
- Silver

### Clothing (4 options)
- Warrior Tunic (red/gold)
- Rogue Cloak (dark green/black)
- Mage Robes (blue/purple)
- Knight Armor (silver/white)

### Accessories (3 options)
- None
- Crystal Pendant
- Dragon Ring

**Note**: Customization is purely cosmetic - all choices have identical starting stats (stats defined in Section 5).

---

## 3. Battle System Design

### 3.1 Turn Structure

**Initiative**: Speed determines turn order. Higher Speed acts first.

**Turn Flow**:
1. Display HP, enemy HP, available actions
2. Player selects action (4 choices)
3. Player action executes
4. Enemy action executes (AI-controlled)
5. Check victory/defeat
6. Repeat until battle ends

### 3.2 Turn Actions

| Action | Effect | Cooldown |
|--------|--------|----------|
| **Attack** | Deal damage = (Attack - Enemy Defense/2) | None |
| **Defend** | Reduce incoming damage by 50% this turn, gain +10% Attack next turn | None |
| **Special Move** | Deal 2.5x normal damage, ignores 50% of enemy Defense | 3 turns |
| **Use Item** | Restore 40% max HP (3 items total per battle) | None |

**Special Move Cooldown**: After using Special Move, it's unavailable for 3 turns (displays "Special Move (Ready in X turns)")

**Item Limit**: Player starts each battle with 3 healing items. Once used, they're gone for that battle. Items reset at the start of each new battle.

### 3.3 Damage Calculation

**Normal Attack Damage**:
```
Base Damage = Attacker's Attack - (Defender's Defense / 2)
Final Damage = Base Damage × Random(0.85, 1.15) × Critical Multiplier
Minimum Damage = 1 (always deal at least 1 damage)
```

**Special Move Damage**:
```
Base Damage = Attacker's Attack × 2.5 - (Defender's Defense / 4)
Final Damage = Base Damage × Random(0.9, 1.1) × Critical Multiplier
Minimum Damage = 5
```

**Defend Damage Reduction**:
```
If Defending: Final Damage = Final Damage × 0.5
```

**Random Variance**: Attacks deal 85%-115% of base damage (prevents predictability)

### 3.4 Critical Hit Mechanics

**Critical Hit Chance**: 10% base chance per attack

**Critical Hit Multiplier**: 1.5x damage

**Calculation**:
```
Random(1, 100) <= 10 → Critical Hit!
Final Damage = Final Damage × 1.5
Display "CRITICAL HIT!" message
```

### 3.5 Type Advantages

**No type system** - keeps combat simple and focused on strategic action choices rather than rock-paper-scissors mechanics.

### 3.6 Enemy AI Behavior

**Basic AI Strategy**:
- If HP < 30%: 50% chance to Defend, 50% chance to Attack
- If HP >= 30%: 70% chance to Attack, 20% chance Special Move (if ready), 10% chance Defend

**Boss AI Strategy** (Gym Leader, Final Boss):
- If HP < 25%: Always use Special Move if ready, otherwise Defend
- If HP 25%-50%: 40% Attack, 40% Special Move (if ready), 20% Defend
- If HP > 50%: 60% Attack, 30% Special Move (if ready), 10% Defend

### 3.7 Victory/Defeat Conditions

**Victory**: Enemy HP reaches 0
**Defeat**: Player HP reaches 0

**Victory Rewards**:
- XP gain (amount varies by enemy, see Section 5.3)
- Progress to next battle/stage
- Full HP restoration before next battle

**Defeat Consequences**:
- Return to stage start with full HP
- Retry the stage from Battle 1
- Keep current level and XP

---

## 4. Stage Progression

### Stage 1: Wildwood Forest (Wild Encounters)

**Objective**: Defeat 3 wild creatures to prove basic combat skills

**Battle 1: Forest Slime**
- HP: 30
- Attack: 8
- Defense: 4
- Speed: 5
- XP Reward: 20

**Battle 2: Wild Wolf**
- HP: 40
- Attack: 12
- Defense: 6
- Speed: 10
- XP Reward: 30

**Battle 3: Stone Golem**
- HP: 60
- Attack: 10
- Defense: 12
- Speed: 3
- XP Reward: 50

**Difficulty**: Easy to Medium - introduces combat mechanics gradually

---

### Stage 2: Azure Gym (Gym Challenge)

**Objective**: Defeat Gym Leader Kai

**Battle: Gym Leader Kai**
- HP: 120
- Attack: 18
- Defense: 15
- Speed: 12
- XP Reward: 100
- AI: Boss AI (see Section 3.6)
- Special Mechanic: Uses Special Move more frequently (40% when HP > 50%)

**Difficulty**: Hard - first major difficulty spike, tests resource management (items, Special Move timing)

---

### Stage 3: Obsidian Peak (Final Boss)

**Objective**: Defeat the Shadow Dragon and become Valley Champion

**Battle: Shadow Dragon**
- HP: 200
- Attack: 25
- Defense: 20
- Speed: 15
- XP Reward: 200
- AI: Boss AI + Special Mechanic
- **Special Mechanic - Dragon Fury**: When HP drops below 50%, gains +5 Attack permanently and uses Special Move every 2 turns instead of 3

**Difficulty**: Very Hard - final test of all learned skills

---

## 5. Progression Balance

### 5.1 Starting Stats

**Player Starting Stats** (Level 1):
- HP: 50
- Attack: 10
- Defense: 8
- Speed: 8

### 5.2 XP Curve & Leveling

**XP Required Per Level**:
```
Level 2: 50 XP
Level 3: 120 XP (70 additional)
Level 4: 220 XP (100 additional)
Level 5: 350 XP (130 additional)
Level 6: 520 XP (170 additional)
Level 7: 730 XP (210 additional)
Level 8: 980 XP (250 additional)
```

**XP Formula**:
```
XP_Required(level) = 50 + (level - 1) × 35 × level
```

**Total XP Available in Game**:
- Stage 1: 20 + 30 + 50 = 100 XP
- Stage 2: 100 XP
- Stage 3: 200 XP
- **Total: 400 XP** (reaches Level 5 with buffer)

### 5.3 Stat Growth Per Level

**Each Level Up**:
- HP: +15
- Attack: +3
- Defense: +2
- Speed: +1

**Stat Progression Table**:

| Level | HP | Attack | Defense | Speed | XP Required |
|-------|-----|--------|---------|-------|-------------|
| 1 | 50 | 10 | 8 | 8 | 0 |
| 2 | 65 | 13 | 10 | 9 | 50 |
| 3 | 80 | 16 | 12 | 10 | 120 |
| 4 | 95 | 19 | 14 | 11 | 220 |
| 5 | 110 | 22 | 16 | 12 | 350 |
| 6 | 125 | 25 | 18 | 13 | 520 |

**Level Display**: Show current level, current XP, and XP needed for next level (e.g., "Level 3 - XP: 150/220")

### 5.4 Balance Verification

**Expected Player Power Curve**:
- After Stage 1 (100 XP): Level 2-3 (~70-80 HP, 13-16 Attack)
- After Stage 2 (200 XP): Level 3-4 (~80-95 HP, 16-19 Attack)
- Final Boss: Level 4-5 (~95-110 HP, 19-22 Attack)

**Difficulty Balance**:
- Stage 1 battles winnable at Level 1-2 with strategic Defend/Item use
- Gym Leader beatable at Level 3 (requires good Special Move timing)
- Shadow Dragon beatable at Level 4-5 (tight battle, requires all mechanics mastery)

**Win Rate Target**: 70% of players should win on first attempt if playing strategically

---

## 6. UX Flow (Screen-by-Screen Journey)

### Screen 1: Title Screen

**Display**:
- Game title: "Crystal Valley Champions"
- Subtitle: "A Pokemon-Style RPG Adventure"
- Button: "Start Adventure"

**Actions**: Click "Start Adventure" → Screen 2

---

### Screen 2: Character Customization

**Display**:
- Title: "Create Your Champion"
- Preview: Live character visualization (using TyconoForge Blueprint)
- Dropdowns/Buttons:
  - Skin Tone (5 options)
  - Hair Style (6 options)
  - Hair Color (5 options)
  - Clothing (4 options)
  - Accessories (3 options)
- Button: "Begin Journey"

**Actions**:
- Modify any dropdown → Preview updates in real-time
- Click "Begin Journey" → Screen 3

---

### Screen 3: Stage Introduction (Wildwood Forest)

**Display**:
- Stage Title: "Stage 1: Wildwood Forest"
- Description: "Wild creatures roam these woods. Defeat 3 enemies to advance."
- Player Stats Display:
  - Level 1
  - HP: 50/50
  - Attack: 10 | Defense: 8 | Speed: 8
  - XP: 0/50
- Button: "Enter Forest"

**Actions**: Click "Enter Forest" → Screen 4 (Battle 1)

---

### Screen 4: Battle Screen

**Display**:
- Top Section:
  - Enemy name, sprite, HP bar (e.g., "Forest Slime - HP: 30/30")
- Middle Section:
  - Battle log (last 3 actions): "Forest Slime attacks for 5 damage!"
- Bottom Section:
  - Player character sprite
  - Player HP bar: "Your HP: 45/50"
  - Player stats: Level, Attack, Defense, Speed
  - Items remaining: "Healing Items: 3"
- Action Buttons (4):
  - **Attack** (always available)
  - **Defend** (always available)
  - **Special Move** (shows cooldown if on cooldown: "Ready in 2 turns")
  - **Use Item** (disabled if 0 items remaining)

**Actions**:
- Click any available action → Execute turn → Update battle log → Enemy turn → Repeat
- Victory → Screen 5 (Victory)
- Defeat → Screen 6 (Defeat)

**Battle Log Examples**:
- "You attack for 8 damage!"
- "Forest Slime attacks for 5 damage!"
- "You defend! Damage reduced!"
- "CRITICAL HIT! You deal 12 damage!"
- "Special Move ready!"

---

### Screen 5: Victory Screen

**Display**:
- Title: "Victory!"
- Message: "You defeated [Enemy Name]!"
- XP Gain: "+20 XP" (with animation)
- Level Up (if applicable): "LEVEL UP! Level 1 → Level 2"
  - Show stat increases: "HP +15, Attack +3, Defense +2, Speed +1"
- HP Restoration: "HP fully restored!"
- Buttons:
  - "Continue" (if more battles in stage)
  - "Next Stage" (if stage complete)

**Actions**:
- Click "Continue" → Next battle (Screen 4)
- Click "Next Stage" → Next stage intro (Screen 3 with new stage)
- After Stage 3 → Screen 7 (Game Complete)

---

### Screen 6: Defeat Screen

**Display**:
- Title: "Defeated..."
- Message: "You were defeated by [Enemy Name]."
- Encouragement: "Don't give up! Your level and XP are saved."
- Current Stats:
  - Level: X
  - XP: Y/Z
- Buttons:
  - "Retry Stage" (restart stage from Battle 1, full HP restored)
  - "Return to Title" (back to Screen 1)

**Actions**:
- Click "Retry Stage" → Screen 3 (Stage Intro)
- Click "Return to Title" → Screen 1

---

### Screen 7: Game Complete (Champion Screen)

**Display**:
- Title: "🏆 VALLEY CHAMPION 🏆"
- Message: "You have conquered all three trials and defeated the Shadow Dragon!"
- Final Stats:
  - Final Level: X
  - Total XP Earned: Y
  - Battles Won: Z
- Celebratory animation (optional: confetti, character pose)
- Buttons:
  - "Play Again" (reset to Screen 2 with new character)
  - "Return to Title" (Screen 1)

**Actions**:
- Click "Play Again" → Screen 2
- Click "Return to Title" → Screen 1

---

### Screen 8: Pause Menu (accessible during any battle)

**Display** (overlay on Battle Screen):
- Semi-transparent background
- Menu options:
  - "Resume Battle"
  - "View Stats" (detailed stat breakdown)
  - "Abandon Stage" (return to title, lose progress)

**Actions**:
- Click "Resume Battle" → Close menu
- Click "View Stats" → Show detailed stats modal
- Click "Abandon Stage" → Screen 1

**Trigger**: Press ESC key or click "Pause" button in battle

---

## 7. Save/Load System

**Auto-Save Triggers** (localStorage):
- After every battle victory
- After level up
- After stage completion

**Saved Data**:
- Character customization choices
- Current level, XP, stats
- Current stage, current battle
- Items remaining (for current battle)

**Load on Page Refresh**:
- If save exists: Resume from last save point
- If no save: Start at Screen 1

---

## 8. Balance Tuning Guidelines

### 8.1 Difficulty Adjustment Levers

If playtesting reveals imbalance, adjust in this order:

1. **Too Hard**:
   - Increase XP rewards by 20%
   - Decrease enemy HP by 10%
   - Increase player starting HP to 60

2. **Too Easy**:
   - Decrease XP rewards by 15%
   - Increase enemy Attack by 2
   - Reduce item count to 2 per battle

### 8.2 Win Rate Targets

| Stage | Target Win Rate (First Attempt) |
|-------|--------------------------------|
| Stage 1 | 90% (tutorial difficulty) |
| Stage 2 | 60% (challenge spike) |
| Stage 3 | 50% (final test) |

### 8.3 Playtime Targets

- Average first playthrough: 15-20 minutes
- Speedrun potential: 8-10 minutes
- First-time defeat retry: +5 minutes per retry

---

## 9. Out of Scope (Future Enhancements)

The following features are **NOT** included in v1.0:

- ❌ Multiple character classes with different stat distributions
- ❌ Equipment/weapon system
- ❌ Multiplayer or PvP
- ❌ Side quests or optional battles
- ❌ Type advantages/weaknesses
- ❌ Status effects (poison, stun, etc.)
- ❌ Multiple save slots
- ❌ Sound effects or music (optional polish task)
- ❌ Achievements or collectibles

**Rationale**: Focus on core combat loop and progression. Polish is better than feature bloat.

---

## 10. Success Metrics

**Definition of Done**:
- ✅ All 3 stages completable from start to finish
- ✅ Damage formulas implemented exactly as specified
- ✅ XP and leveling work correctly
- ✅ Special Move cooldown functions properly
- ✅ Item system (3 items/battle) works
- ✅ Victory/defeat screens display
- ✅ Save/load preserves progress across page refresh
- ✅ Game is winnable but challenging (requires 2-3 attempts for average player)

**QA Test Cases**:
1. Create character → Beat all 3 stages → Verify Champion screen
2. Lose battle → Verify retry with same level/XP
3. Use Special Move → Verify 3-turn cooldown
4. Defend → Verify damage reduction + next-turn attack bonus
5. Level up mid-stage → Verify stat increases
6. Refresh page mid-game → Verify save loads correctly
7. Use all 3 items → Verify button disables
8. Defeat Shadow Dragon below 50% HP → Verify Dragon Fury activates (+5 Attack, faster Special Move)

---

## 11. Implementation Notes for Engineer

### Critical Formula Implementation

**Ensure these formulas are implemented exactly**:

```javascript
// Normal Attack
const baseDamage = attackerAtk - (defenderDef / 2);
const variance = Math.random() * 0.3 + 0.85; // 0.85 to 1.15
const critMultiplier = (Math.random() <= 0.1) ? 1.5 : 1.0;
const defendMultiplier = isDefending ? 0.5 : 1.0;
let finalDamage = Math.floor(baseDamage * variance * critMultiplier * defendMultiplier);
finalDamage = Math.max(1, finalDamage); // Minimum 1 damage

// Special Move
const baseDamage = (attackerAtk * 2.5) - (defenderDef / 4);
const variance = Math.random() * 0.2 + 0.9; // 0.9 to 1.1
const critMultiplier = (Math.random() <= 0.1) ? 1.5 : 1.0;
let finalDamage = Math.floor(baseDamage * variance * critMultiplier);
finalDamage = Math.max(5, finalDamage); // Minimum 5 damage

// XP Required for Level
const xpRequired = 50 + (level - 1) * 35 * level;

// Stat Growth on Level Up
newHP = oldHP + 15;
newAttack = oldAttack + 3;
newDefense = oldDefense + 2;
newSpeed = oldSpeed + 1;
```

### State Management Recommendations

Use a global game state object:
```javascript
const gameState = {
  player: { level, xp, hp, maxHp, attack, defense, speed, customization },
  currentStage: 1,
  currentBattle: 1,
  itemsRemaining: 3,
  specialMoveCooldown: 0,
  battleLog: []
};
```

Save to localStorage as JSON after each battle.

---

## Document History

| Version | Date | Changes |
|---------|------|---------|
| 1.0 | 2026-03-14 | Initial game design document |

---

**Document Owner**: Product Manager
**Reviewed By**: CTO (pending)
**Status**: Ready for Implementation
**Next Steps**: Engineer to implement Phase 1 (Foundation + Character Customization)
