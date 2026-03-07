/* =========================================================
   BLUEPRINT ENGINE — Declarative Pixel Art System

   Sprites are defined as data (Pixel arrays) instead of
   imperative draw calls. Colors use tokens ($skin, $hair, etc.)
   that get resolved at render time from CharacterAppearance.
   ========================================================= */

import type { CharacterAppearance } from '../../../../types/appearance';

/* ── Color Token System ─────────────────────────── */

/**
 * Color tokens reference appearance properties.
 * Modifiers: darken/lighten with an amount.
 */
export type ColorToken =
  | string                                    // literal hex: '#FF0000'
  | '$skin' | '$hair' | '$shirt' | '$pants' | '$shoes'  // appearance ref
  | `darken(${'$skin'|'$hair'|'$shirt'|'$pants'|'$shoes'}, ${number})`
  | `lighten(${'$skin'|'$hair'|'$shirt'|'$pants'|'$shoes'}, ${number})`;

/** Single pixel rectangle in a blueprint */
export interface Pixel {
  x: number;
  y: number;
  w: number;
  h: number;
  c: ColorToken;  // color token or literal
  a?: number;     // alpha (0-1), default 1
}

/* ── Character Blueprint ────────────────────────── */

/**
 * A character is composed of ordered layers.
 * Each layer is a named Pixel array rendered bottom-to-top.
 */
export interface CharacterBlueprint {
  /** Canvas dimensions in logical pixels (before P=2 scale) */
  width: number;   // typically 32
  height: number;  // typically 40
  /** Layers rendered in order (first = bottom, last = top) */
  layers: CharacterLayer[];
}

export interface CharacterLayer {
  name: string;    // 'body' | 'hair' | 'face' | 'accessory' | 'item' | etc.
  pixels: Pixel[];
}

/* ── Facility Blueprint ─────────────────────────── */

export interface FacilityBlueprint {
  /** Canvas dimensions (actual canvas pixels, already scaled) */
  canvasWidth: number;
  canvasHeight: number;
  /** Scale factor used in pixel definitions (Q value) */
  scale: number;    // typically 2
  pixels: Pixel[];
}

/* ── Color Resolution ───────────────────────────── */

const TOKEN_MAP: Record<string, keyof CharacterAppearance> = {
  '$skin': 'skinColor',
  '$hair': 'hairColor',
  '$shirt': 'shirtColor',
  '$pants': 'pantsColor',
  '$shoes': 'shoeColor',
};

// Regex: darken($token, amount) or lighten($token, amount)
const MODIFIER_RE = /^(darken|lighten)\((\$\w+),\s*(\d+)\)$/;

export function darken(hex: string, amt: number): string {
  const n = parseInt(hex.replace('#', ''), 16);
  const r = Math.max(0, ((n >> 16) & 0xFF) - amt);
  const g = Math.max(0, ((n >> 8) & 0xFF) - amt);
  const b = Math.max(0, (n & 0xFF) - amt);
  return `#${((r << 16) | (g << 8) | b).toString(16).padStart(6, '0')}`;
}

export function lighten(hex: string, amt: number): string {
  const n = parseInt(hex.replace('#', ''), 16);
  const r = Math.min(255, ((n >> 16) & 0xFF) + amt);
  const g = Math.min(255, ((n >> 8) & 0xFF) + amt);
  const b = Math.min(255, (n & 0xFF) + amt);
  return `#${((r << 16) | (g << 8) | b).toString(16).padStart(6, '0')}`;
}

/**
 * Resolve a color token to an actual hex color.
 * Returns the literal string if not a token.
 */
export function resolveColor(token: ColorToken, ap?: CharacterAppearance): string {
  // Direct token reference
  const key = TOKEN_MAP[token as string];
  if (key && ap) return ap[key];

  // Modifier function: darken($skin, 30) / lighten($hair, 20)
  const match = MODIFIER_RE.exec(token);
  if (match) {
    const [, fn, tokenRef, amtStr] = match;
    const baseKey = TOKEN_MAP[tokenRef];
    const base = baseKey && ap ? ap[baseKey] : tokenRef;
    const amt = parseInt(amtStr, 10);
    return fn === 'darken' ? darken(base, amt) : lighten(base, amt);
  }

  // Literal color
  return token;
}

/* ── Registry ───────────────────────────────────── */

/** Global registry of all character blueprints, keyed by roleId */
const characterRegistry = new Map<string, CharacterBlueprint>();

/** Global registry of all facility blueprints, keyed by facility type */
const facilityRegistry = new Map<string, FacilityBlueprint>();

export function registerCharacter(id: string, bp: CharacterBlueprint): void {
  characterRegistry.set(id, bp);
}

export function registerFacility(id: string, bp: FacilityBlueprint): void {
  facilityRegistry.set(id, bp);
}

export function getCharacterBlueprint(id: string): CharacterBlueprint | undefined {
  return characterRegistry.get(id);
}

export function getFacilityBlueprint(id: string): FacilityBlueprint | undefined {
  return facilityRegistry.get(id);
}

export function getAllCharacterIds(): string[] {
  return Array.from(characterRegistry.keys());
}

export function getAllFacilityIds(): string[] {
  return Array.from(facilityRegistry.keys());
}
