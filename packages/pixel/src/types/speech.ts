/* =========================================================
   AMBIENT SPEECH SYSTEM — Types
   ========================================================= */

/** Speech display type */
export type SpeechType = 'work' | 'personality' | 'guilt' | 'social';

/** A speech item to display */
export interface Speech {
  text: string;
  type: SpeechType;
  /** For social speech: the conversation partner */
  partnerId?: string;
  /** Timestamp when this speech was set */
  ts: number;
}

/** Relationship between two roles */
export interface RoleRelationship {
  roleA: string;
  roleB: string;
  dispatches: number;
  wavesTogether: number;
  conversations: number;
  familiarity: number; // 0~100
  lastInteraction: string; // ISO date
}

/** Conversation template for social speech */
export interface ConversationTemplate {
  id: string;
  relation: 'superior-subordinate' | 'peer' | 'c-level' | 'any';
  minFamiliarity: number;
  turns: Array<{ speaker: 'A' | 'B'; text: string }>;
  topic: string;
}

/** Speech system settings (persisted in preferences) */
export interface SpeechSettings {
  /** 'template' = static pool only, 'llm' = AI generation, 'auto' = detect engine */
  mode: 'template' | 'llm' | 'auto';
  /** Interval between ambient speech in seconds */
  intervalSec: number;
  /** Daily budget for LLM speech in USD (0 = unlimited) */
  dailyBudgetUsd: number;
}

/** Familiarity level label */
export type FamiliarityLevel = 'stranger' | 'colleague' | 'friend' | 'bestie';

export function getFamiliarityLevel(f: number): FamiliarityLevel {
  if (f <= 20) return 'stranger';
  if (f <= 50) return 'colleague';
  if (f <= 80) return 'friend';
  return 'bestie';
}
