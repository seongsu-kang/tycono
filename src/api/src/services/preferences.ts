/**
 * preferences.ts — .tycono/preferences.json 관리
 *
 * 캐릭터 외모, 오피스 테마 등 사용자 설정을 서버 파일로 영속화한다.
 * company-config.ts의 readConfig/writeConfig 패턴을 따른다.
 */
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

export interface CharacterAppearance {
  skinColor: string;
  hairColor: string;
  shirtColor: string;
  pantsColor: string;
  shoeColor: string;
}

export interface SpeechSettings {
  /** 'template' = static pool only, 'llm' = AI generation, 'auto' = detect engine */
  mode: 'template' | 'llm' | 'auto';
  /** Interval between ambient speech in seconds */
  intervalSec: number;
  /** Daily budget for LLM speech in USD (0 = unlimited) */
  dailyBudgetUsd: number;
}

export interface FurnitureOverride {
  offsetX: number;
  offsetY: number;
}

export interface DeskOverride {
  dx: number;
  dy: number;
}

export interface AddedFurniture {
  id: string;
  type: string;
  room: string;
  zone: 'wall' | 'floor';
  anchorX?: 'left' | 'right';
  offsetX: number;
  offsetY: number;
  accent?: string;
}

export interface OfficeExpansion {
  preset: 'M' | 'L';
  purchaseHistory: Array<{ type: string; cost: number; ts: string }>;
}

export interface Preferences {
  instanceId?: string; // anonymous persistent token — auto-generated on first read
  appearances: Record<string, CharacterAppearance>;
  theme: string;
  speech?: SpeechSettings;
  language?: string; // 'en' | 'ko' | 'ja' | 'auto'
  furnitureOverrides?: Record<string, FurnitureOverride>; // keyed by FurnitureDef.id
  deskOverrides?: Record<string, DeskOverride>; // keyed by role id
  removedFurniture?: string[]; // FurnitureDef.id list
  addedFurniture?: AddedFurniture[];
  officeExpansion?: OfficeExpansion;
}

const CONFIG_DIR = '.tycono';
const PREFS_FILE = 'preferences.json';
const DEFAULT: Preferences = { appearances: {}, theme: 'default' };

function prefsPath(companyRoot: string): string {
  return path.join(companyRoot, CONFIG_DIR, PREFS_FILE);
}

/** Read preferences from .tycono/preferences.json. Returns defaults if missing.
 *  Auto-generates instanceId on first access and persists it. */
export function readPreferences(companyRoot: string): Preferences {
  const p = prefsPath(companyRoot);
  let data: Record<string, unknown> = {};
  if (fs.existsSync(p)) {
    try { data = JSON.parse(fs.readFileSync(p, 'utf-8')); } catch { /* use defaults */ }
  }

  const prefs: Preferences = {
    instanceId: (data.instanceId as string) ?? undefined,
    appearances: (data.appearances as Record<string, CharacterAppearance>) ?? {},
    theme: (data.theme as string) ?? 'default',
    speech: (data.speech as SpeechSettings) ?? undefined,
    language: (data.language as string) ?? undefined,
    furnitureOverrides: (data.furnitureOverrides as Record<string, FurnitureOverride>) ?? undefined,
    deskOverrides: (data.deskOverrides as Record<string, DeskOverride>) ?? undefined,
    removedFurniture: (data.removedFurniture as string[]) ?? undefined,
    addedFurniture: (data.addedFurniture as AddedFurniture[]) ?? undefined,
    officeExpansion: (data.officeExpansion as OfficeExpansion) ?? undefined,
  };

  // Auto-generate instanceId on first access
  if (!prefs.instanceId) {
    prefs.instanceId = crypto.randomUUID();
    writePreferences(companyRoot, prefs);
  }

  return prefs;
}

/** Write preferences to .tycono/preferences.json. Creates dir if needed. */
export function writePreferences(companyRoot: string, prefs: Preferences): void {
  const dir = path.join(companyRoot, CONFIG_DIR);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(prefsPath(companyRoot), JSON.stringify(prefs, null, 2) + '\n');
}

/** Merge partial preferences into existing. instanceId is never overwritten by client. */
export function mergePreferences(companyRoot: string, partial: Partial<Preferences>): Preferences {
  const current = readPreferences(companyRoot);
  const merged: Preferences = {
    instanceId: current.instanceId, // preserve — never overwrite from client
    appearances: partial.appearances !== undefined
      ? { ...current.appearances, ...partial.appearances }
      : current.appearances,
    theme: partial.theme ?? current.theme,
    speech: partial.speech !== undefined
      ? { ...current.speech, ...partial.speech }
      : current.speech,
    language: partial.language !== undefined ? partial.language : current.language,
    furnitureOverrides: partial.furnitureOverrides !== undefined
      ? { ...current.furnitureOverrides, ...partial.furnitureOverrides }
      : current.furnitureOverrides,
    deskOverrides: partial.deskOverrides !== undefined
      ? { ...current.deskOverrides, ...partial.deskOverrides }
      : current.deskOverrides,
    removedFurniture: partial.removedFurniture !== undefined
      ? partial.removedFurniture
      : current.removedFurniture,
    addedFurniture: partial.addedFurniture !== undefined
      ? partial.addedFurniture
      : current.addedFurniture,
    officeExpansion: partial.officeExpansion !== undefined
      ? partial.officeExpansion
      : current.officeExpansion,
  };
  writePreferences(companyRoot, merged);
  return merged;
}
