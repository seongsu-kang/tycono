/**
 * preferences.ts — .the-company/preferences.json 관리
 *
 * 캐릭터 외모, 오피스 테마 등 사용자 설정을 서버 파일로 영속화한다.
 * company-config.ts의 readConfig/writeConfig 패턴을 따른다.
 */
import fs from 'node:fs';
import path from 'node:path';

export interface CharacterAppearance {
  skinColor: string;
  hairColor: string;
  shirtColor: string;
  pantsColor: string;
  shoeColor: string;
}

export interface Preferences {
  appearances: Record<string, CharacterAppearance>;
  theme: string;
}

const CONFIG_DIR = '.the-company';
const PREFS_FILE = 'preferences.json';
const DEFAULT: Preferences = { appearances: {}, theme: 'default' };

function prefsPath(companyRoot: string): string {
  return path.join(companyRoot, CONFIG_DIR, PREFS_FILE);
}

/** Read preferences from .the-company/preferences.json. Returns defaults if missing. */
export function readPreferences(companyRoot: string): Preferences {
  const p = prefsPath(companyRoot);
  if (!fs.existsSync(p)) return { ...DEFAULT, appearances: {} };
  try {
    const data = JSON.parse(fs.readFileSync(p, 'utf-8'));
    return {
      appearances: data.appearances ?? {},
      theme: data.theme ?? 'default',
    };
  } catch {
    return { ...DEFAULT, appearances: {} };
  }
}

/** Write preferences to .the-company/preferences.json. Creates dir if needed. */
export function writePreferences(companyRoot: string, prefs: Preferences): void {
  const dir = path.join(companyRoot, CONFIG_DIR);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(prefsPath(companyRoot), JSON.stringify(prefs, null, 2) + '\n');
}

/** Merge partial preferences into existing. */
export function mergePreferences(companyRoot: string, partial: Partial<Preferences>): Preferences {
  const current = readPreferences(companyRoot);
  const merged: Preferences = {
    appearances: partial.appearances !== undefined
      ? { ...current.appearances, ...partial.appearances }
      : current.appearances,
    theme: partial.theme ?? current.theme,
  };
  writePreferences(companyRoot, merged);
  return merged;
}
