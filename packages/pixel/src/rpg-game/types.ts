/* =========================================================
   RPG Game Types
   ========================================================= */

// TyconoForge appearance
export interface CharacterAppearance {
  skinColor: string;
  hairColor: string;
  shirtColor: string;
  pantsColor: string;
  shoeColor: string;
  hairStyle?: string;
  outfitStyle?: string;
  accessory?: string;
}

// Character stats
export interface CharacterStats {
  name: string;
  level: number;
  hp: number;
  maxHp: number;
  mp: number;
  maxMp: number;
  attack: number;
  defense: number;
}

// Full character (appearance + stats)
export interface Character {
  appearance: CharacterAppearance;
  stats: CharacterStats;
}

// Skill type
export type SkillType = 'attack' | 'defend' | 'heal' | 'flee';

// Skill definition
export interface Skill {
  type: SkillType;
  name: string;
  mpCost: number;
  emoji: string;
}

// Battle action
export interface BattleAction {
  actorName: string;
  skill: SkillType;
  damage?: number;
  heal?: number;
  message: string;
}

// Battle state
export interface BattleState {
  player: CharacterStats;
  enemy: CharacterStats;
  turn: 'player' | 'enemy';
  log: BattleAction[];
  defendActive: boolean;
  status: 'ongoing' | 'victory' | 'defeat' | 'fled';
}
