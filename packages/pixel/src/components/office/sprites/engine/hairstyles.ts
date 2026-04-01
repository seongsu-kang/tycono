/* =========================================================
   HAIR STYLE REGISTRY — Swappable hair layer variants

   Each hair style is a CharacterLayer (name: 'hair') that can
   replace the default hair layer in any CharacterBlueprint.

   All coordinates are in MINI (12x22) scale — the single
   source of truth for character blueprints.
   Head area: x:1..11, y:1..9
   ========================================================= */

import type { CharacterLayer } from './blueprint';
import type { DirectionalLayers, Direction } from './blueprint';
import { resolveDirectionalLayer } from './blueprint';

export interface HairStyleMeta {
  id: string;
  name: string;
  layer: CharacterLayer;
  directions?: DirectionalLayers;
  requiredLevel?: number;
  cost?: number;
}

const registry = new Map<string, HairStyleMeta>();

export function registerHairStyle(
  id: string,
  name: string,
  layerOrDirs: CharacterLayer | DirectionalLayers,
): void {
  const isDirectional = 'down' in layerOrDirs && !('pixels' in layerOrDirs);
  if (isDirectional) {
    const dirs = layerOrDirs as DirectionalLayers;
    registry.set(id, {
      id,
      name,
      layer: { ...dirs.down, name: 'hair' },
      directions: {
        down: { ...dirs.down, name: 'hair' },
        up: dirs.up ? { ...dirs.up, name: 'hair' } : undefined,
        left: dirs.left ? { ...dirs.left, name: 'hair' } : undefined,
        right: dirs.right ? { ...dirs.right, name: 'hair' } : undefined,
      },
    });
  } else {
    const layer = layerOrDirs as CharacterLayer;
    registry.set(id, { id, name, layer: { ...layer, name: 'hair' } });
  }
}

export function getHairStyle(id: string): HairStyleMeta | undefined {
  return registry.get(id);
}

export function getHairForDirection(id: string, dir: Direction): CharacterLayer | undefined {
  const meta = registry.get(id);
  if (!meta) return undefined;
  if (meta.directions) return resolveDirectionalLayer(meta.directions, dir);
  return meta.layer;
}

export function getAllHairStyles(): HairStyleMeta[] {
  return Array.from(registry.values());
}

/* ── Built-in Hair Styles (8 variants, mini 12x22 coords) ── */

// Short — minimal top coverage (4-direction)
registerHairStyle('short', 'Short', {
  down: { name: 'hair', pixels: [
    { x: 1, y: 0, w: 10, h: 2, c: '$hair' },
    { x: 0, y: 1, w: 2, h: 2, c: '$hair' },
    { x: 10, y: 1, w: 2, h: 2, c: '$hair' },
    { x: 2, y: 0, w: 8, h: 1, c: 'lighten($hair, 25)', a: 0.3 },
  ]},
  up: { name: 'hair', pixels: [
    { x: 1, y: 0, w: 10, h: 3, c: '$hair' },
    { x: 0, y: 1, w: 2, h: 2, c: '$hair' },
    { x: 10, y: 1, w: 2, h: 2, c: '$hair' },
  ]},
  left: { name: 'hair', pixels: [
    { x: 1, y: 0, w: 9, h: 2, c: '$hair' },
    { x: 0, y: 1, w: 2, h: 2, c: '$hair' },
    { x: 2, y: 0, w: 6, h: 1, c: 'lighten($hair, 25)', a: 0.3 },
  ]},
});

// Messy — spiky uneven top (4-direction)
registerHairStyle('messy', 'Messy', {
  down: { name: 'hair', pixels: [
    { x: 1, y: 0, w: 10, h: 3, c: '$hair' },
    { x: 0, y: 1, w: 2, h: 3, c: '$hair' },
    { x: 10, y: 0, w: 2, h: 4, c: '$hair' },
    { x: 3, y: -1, w: 3, h: 2, c: '$hair' },
    { x: 7, y: -1, w: 2, h: 2, c: 'lighten($hair, 20)' },
    { x: 2, y: 0, w: 4, h: 1, c: 'lighten($hair, 30)', a: 0.3 },
  ]},
  up: { name: 'hair', pixels: [
    { x: 1, y: 0, w: 10, h: 4, c: '$hair' },
    { x: 0, y: 1, w: 2, h: 3, c: '$hair' },
    { x: 10, y: 0, w: 2, h: 4, c: '$hair' },
    { x: 3, y: -1, w: 3, h: 2, c: '$hair' },
    { x: 7, y: -1, w: 2, h: 2, c: '$hair' },
  ]},
  left: { name: 'hair', pixels: [
    { x: 1, y: 0, w: 9, h: 3, c: '$hair' },
    { x: 0, y: 1, w: 2, h: 3, c: '$hair' },
    { x: 3, y: -1, w: 3, h: 2, c: '$hair' },
    { x: 2, y: 0, w: 4, h: 1, c: 'lighten($hair, 30)', a: 0.3 },
  ]},
});

// Bun — top knot (4-direction)
registerHairStyle('bun', 'Bun', {
  down: { name: 'hair', pixels: [
    { x: 1, y: 0, w: 10, h: 2, c: '$hair' },
    { x: 0, y: 1, w: 2, h: 2, c: '$hair' },
    { x: 10, y: 1, w: 2, h: 2, c: '$hair' },
    { x: 4, y: -2, w: 4, h: 3, c: '$hair' },
    { x: 5, y: -2, w: 2, h: 1, c: 'lighten($hair, 30)', a: 0.4 },
  ]},
  up: { name: 'hair', pixels: [
    { x: 1, y: 0, w: 10, h: 3, c: '$hair' },
    { x: 0, y: 1, w: 2, h: 2, c: '$hair' },
    { x: 10, y: 1, w: 2, h: 2, c: '$hair' },
    { x: 4, y: -2, w: 4, h: 3, c: '$hair' },
    { x: 5, y: -2, w: 2, h: 1, c: 'lighten($hair, 30)', a: 0.4 },
  ]},
  left: { name: 'hair', pixels: [
    { x: 1, y: 0, w: 9, h: 2, c: '$hair' },
    { x: 0, y: 1, w: 2, h: 2, c: '$hair' },
    { x: 4, y: -2, w: 4, h: 3, c: '$hair' },
    { x: 5, y: -2, w: 2, h: 1, c: 'lighten($hair, 30)', a: 0.4 },
  ]},
});

// Long — flowing sides (4-direction)
registerHairStyle('long', 'Long', {
  down: { name: 'hair', pixels: [
    { x: 0, y: 0, w: 12, h: 3, c: '$hair' },
    { x: -1, y: 1, w: 2, h: 7, c: '$hair' },
    { x: 11, y: 1, w: 2, h: 7, c: '$hair' },
    { x: -1, y: 6, w: 2, h: 3, c: 'darken($hair, 15)', a: 0.5 },
    { x: 11, y: 6, w: 2, h: 3, c: 'darken($hair, 15)', a: 0.5 },
    { x: 2, y: 0, w: 8, h: 1, c: 'lighten($hair, 25)', a: 0.3 },
  ]},
  up: { name: 'hair', pixels: [
    { x: 0, y: 0, w: 12, h: 3, c: '$hair' },
    { x: -1, y: 1, w: 2, h: 7, c: '$hair' },
    { x: 11, y: 1, w: 2, h: 7, c: '$hair' },
    // Back hair cascade
    { x: 1, y: 2, w: 10, h: 6, c: '$hair' },
    { x: 2, y: 6, w: 8, h: 2, c: 'darken($hair, 10)', a: 0.3 },
  ]},
  left: { name: 'hair', pixels: [
    { x: 0, y: 0, w: 10, h: 3, c: '$hair' },
    { x: -1, y: 1, w: 2, h: 7, c: '$hair' },
    { x: -1, y: 6, w: 2, h: 3, c: 'darken($hair, 15)', a: 0.5 },
    { x: 2, y: 0, w: 6, h: 1, c: 'lighten($hair, 25)', a: 0.3 },
  ]},
});

// Mohawk — center spike (4-direction)
registerHairStyle('mohawk', 'Mohawk', {
  down: { name: 'hair', pixels: [
    { x: 4, y: -2, w: 4, h: 4, c: '$hair' },
    { x: 5, y: -3, w: 2, h: 2, c: 'lighten($hair, 20)' },
    { x: 1, y: 1, w: 3, h: 2, c: '$hair' },
    { x: 8, y: 1, w: 3, h: 2, c: '$hair' },
  ]},
  up: { name: 'hair', pixels: [
    { x: 4, y: -2, w: 4, h: 4, c: '$hair' },
    { x: 5, y: -3, w: 2, h: 2, c: 'lighten($hair, 20)' },
    { x: 1, y: 1, w: 3, h: 2, c: '$hair' },
    { x: 8, y: 1, w: 3, h: 2, c: '$hair' },
  ]},
  left: { name: 'hair', pixels: [
    { x: 4, y: -2, w: 3, h: 4, c: '$hair' },
    { x: 5, y: -3, w: 2, h: 2, c: 'lighten($hair, 20)' },
    { x: 1, y: 1, w: 3, h: 2, c: '$hair' },
  ]},
});

// Slicked back — flat smooth (4-direction)
registerHairStyle('slicked', 'Slicked Back', {
  down: { name: 'hair', pixels: [
    { x: 1, y: 0, w: 10, h: 2, c: '$hair' },
    { x: 0, y: 1, w: 2, h: 2, c: '$hair' },
    { x: 10, y: 1, w: 2, h: 2, c: '$hair' },
    { x: 2, y: 0, w: 8, h: 1, c: 'lighten($hair, 15)', a: 0.4 },
    { x: 3, y: 1, w: 6, h: 1, c: 'lighten($hair, 10)', a: 0.2 },
  ]},
  up: { name: 'hair', pixels: [
    { x: 1, y: 0, w: 10, h: 3, c: '$hair' },
    { x: 0, y: 1, w: 2, h: 2, c: '$hair' },
    { x: 10, y: 1, w: 2, h: 2, c: '$hair' },
    // Slicked-back flow
    { x: 2, y: 0, w: 8, h: 1, c: 'lighten($hair, 15)', a: 0.4 },
  ]},
  left: { name: 'hair', pixels: [
    { x: 1, y: 0, w: 9, h: 2, c: '$hair' },
    { x: 0, y: 1, w: 2, h: 2, c: '$hair' },
    { x: 2, y: 0, w: 6, h: 1, c: 'lighten($hair, 15)', a: 0.4 },
  ]},
});

// Bob — chin-length sides (4-direction)
registerHairStyle('bob', 'Bob Cut', {
  down: { name: 'hair', pixels: [
    { x: 0, y: 0, w: 12, h: 3, c: '$hair' },
    { x: -1, y: 1, w: 2, h: 5, c: '$hair' },
    { x: 11, y: 1, w: 2, h: 5, c: '$hair' },
    { x: -1, y: 5, w: 2, h: 1, c: 'darken($hair, 15)', a: 0.4 },
    { x: 11, y: 5, w: 2, h: 1, c: 'darken($hair, 15)', a: 0.4 },
    { x: 2, y: 0, w: 8, h: 1, c: 'lighten($hair, 25)', a: 0.3 },
  ]},
  up: { name: 'hair', pixels: [
    { x: 0, y: 0, w: 12, h: 3, c: '$hair' },
    { x: -1, y: 1, w: 2, h: 5, c: '$hair' },
    { x: 11, y: 1, w: 2, h: 5, c: '$hair' },
    // Back of bob — rounded bottom
    { x: 1, y: 2, w: 10, h: 4, c: '$hair' },
    { x: 2, y: 5, w: 8, h: 1, c: 'darken($hair, 10)', a: 0.3 },
  ]},
  left: { name: 'hair', pixels: [
    { x: 0, y: 0, w: 10, h: 3, c: '$hair' },
    { x: -1, y: 1, w: 2, h: 5, c: '$hair' },
    { x: -1, y: 5, w: 2, h: 1, c: 'darken($hair, 15)', a: 0.4 },
    { x: 2, y: 0, w: 6, h: 1, c: 'lighten($hair, 25)', a: 0.3 },
  ]},
});

// Curly — textured volume (4-direction)
registerHairStyle('curly', 'Curly', {
  down: { name: 'hair', pixels: [
    { x: 0, y: 0, w: 12, h: 4, c: '$hair' },
    { x: -1, y: 1, w: 2, h: 5, c: '$hair' },
    { x: 11, y: 1, w: 2, h: 5, c: '$hair' },
    { x: 2, y: 0, w: 2, h: 1, c: 'lighten($hair, 25)', a: 0.4 },
    { x: 6, y: 0, w: 2, h: 1, c: 'lighten($hair, 25)', a: 0.4 },
    { x: 4, y: 2, w: 2, h: 1, c: 'lighten($hair, 15)', a: 0.3 },
    { x: 8, y: 2, w: 2, h: 1, c: 'lighten($hair, 15)', a: 0.3 },
  ]},
  up: { name: 'hair', pixels: [
    { x: 0, y: 0, w: 12, h: 4, c: '$hair' },
    { x: -1, y: 1, w: 2, h: 5, c: '$hair' },
    { x: 11, y: 1, w: 2, h: 5, c: '$hair' },
    // Curly back volume
    { x: 1, y: 2, w: 10, h: 4, c: '$hair' },
    { x: 3, y: 1, w: 2, h: 1, c: 'lighten($hair, 15)', a: 0.3 },
    { x: 7, y: 1, w: 2, h: 1, c: 'lighten($hair, 15)', a: 0.3 },
  ]},
  left: { name: 'hair', pixels: [
    { x: 0, y: 0, w: 10, h: 4, c: '$hair' },
    { x: -1, y: 1, w: 2, h: 5, c: '$hair' },
    { x: 2, y: 0, w: 2, h: 1, c: 'lighten($hair, 25)', a: 0.4 },
    { x: 5, y: 0, w: 2, h: 1, c: 'lighten($hair, 25)', a: 0.4 },
    { x: 3, y: 2, w: 2, h: 1, c: 'lighten($hair, 15)', a: 0.3 },
  ]},
});

/* ── Hair Style Unlock Levels & Costs ──────── */

export const HAIR_UNLOCK_LEVELS: Record<string, number> = {
  'short': 1, 'messy': 1,
  'bun': 2, 'long': 2,
  'mohawk': 3, 'slicked': 3,
  'bob': 4, 'curly': 4,
};

export const HAIR_COSTS: Record<string, number> = {
  'short': 0, 'messy': 0,
  'bun': 500, 'long': 500,
  'mohawk': 2000, 'slicked': 2000,
  'bob': 5000, 'curly': 5000,
};

/** Get the required level to unlock a hair style (default 1) */
export function getHairRequiredLevel(id: string): number {
  return HAIR_UNLOCK_LEVELS[id] ?? 1;
}

/** Check if a hair style is unlocked at the given level */
export function isHairUnlocked(id: string, level: number): boolean {
  return level >= getHairRequiredLevel(id);
}

/** Get the coin cost for a hair style (default 0) */
export function getHairCost(id: string): number {
  return HAIR_COSTS[id] ?? 0;
}
