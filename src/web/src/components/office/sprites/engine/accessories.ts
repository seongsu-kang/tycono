/* =========================================================
   ACCESSORY REGISTRY — Swappable accessory layer variants

   Each accessory replaces the 'accessory' layer in a blueprint.
   Overlays on top of all other layers.
   All coordinates in MINI (12x22) scale.
   ========================================================= */

import type { CharacterLayer } from './blueprint';
import type { DirectionalLayers, Direction } from './blueprint';
import { resolveDirectionalLayer } from './blueprint';

export interface AccessoryMeta {
  id: string;
  name: string;
  layer: CharacterLayer;            // down direction (backward compat)
  directions?: DirectionalLayers;   // all directions (when defined)
  requiredLevel?: number;           // gamification level needed to unlock
  cost?: number;                    // coin cost to purchase
}

const registry = new Map<string, AccessoryMeta>();

/**
 * Register an accessory. Accepts either:
 * - A single CharacterLayer (backward compat, used as 'down')
 * - A DirectionalLayers object with up to 4 directions
 */
export function registerAccessory(
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
      layer: { ...dirs.down, name: 'accessory' },
      directions: {
        down: { ...dirs.down, name: 'accessory' },
        up: dirs.up ? { ...dirs.up, name: 'accessory' } : undefined,
        left: dirs.left ? { ...dirs.left, name: 'accessory' } : undefined,
        right: dirs.right ? { ...dirs.right, name: 'accessory' } : undefined,
      },
    });
  } else {
    const layer = layerOrDirs as CharacterLayer;
    registry.set(id, { id, name, layer: { ...layer, name: 'accessory' } });
  }
}

export function getAccessory(id: string): AccessoryMeta | undefined {
  return registry.get(id);
}

/** Get the accessory layer resolved for a specific direction */
export function getAccessoryForDirection(id: string, dir: Direction): CharacterLayer | undefined {
  const meta = registry.get(id);
  if (!meta) return undefined;
  if (meta.directions) return resolveDirectionalLayer(meta.directions, dir);

  // Legacy fallback: no directional data
  if (dir === 'down') return meta.layer;
  // For up/side: only show top pixels (ears, crown, horns) as interim
  const topOnly = meta.layer.pixels.filter(p => p.y < 2);
  if (topOnly.length === 0) return undefined;
  const shift = dir === 'right' ? 1 : dir === 'left' ? -1 : 0;
  return {
    name: meta.layer.name,
    pixels: shift ? topOnly.map(p => ({ ...p, x: p.x + shift })) : topOnly,
  };
}

export function getAllAccessories(): AccessoryMeta[] {
  return Array.from(registry.values());
}

/* ── Built-in Accessories (mini 12x22 coords) ──────── */

// None — empty
registerAccessory('none', 'None', {
  name: 'accessory',
  pixels: [],
});

// Glasses — rectangular frames (4-direction)
registerAccessory('glasses', 'Glasses', {
  down: { name: 'accessory', pixels: [
    { x: 2, y: 4, w: 3, h: 2, c: '#2A3A50', a: 0.5 },
    { x: 7, y: 4, w: 3, h: 2, c: '#2A3A50', a: 0.5 },
    { x: 5, y: 4, w: 2, h: 1, c: '#2A3A50', a: 0.3 },
  ]},
  up: { name: 'accessory', pixels: [
    // Temple arms visible from back
    { x: 0, y: 3, w: 2, h: 1, c: '#2A3A50', a: 0.4 },
    { x: 10, y: 3, w: 2, h: 1, c: '#2A3A50', a: 0.4 },
  ]},
  left: { name: 'accessory', pixels: [
    { x: 2, y: 4, w: 3, h: 2, c: '#2A3A50', a: 0.5 },
    { x: 5, y: 4, w: 6, h: 1, c: '#2A3A50', a: 0.3 }, // temple arm
  ]},
});

// Round glasses (4-direction)
registerAccessory('round-glasses', 'Round Glasses', {
  down: { name: 'accessory', pixels: [
    { x: 2, y: 3, w: 3, h: 3, c: '#8B7355', a: 0.4 },
    { x: 7, y: 3, w: 3, h: 3, c: '#8B7355', a: 0.4 },
    { x: 3, y: 4, w: 1, h: 1, c: '#B0E0FF', a: 0.15 },
    { x: 8, y: 4, w: 1, h: 1, c: '#B0E0FF', a: 0.15 },
    { x: 5, y: 4, w: 2, h: 1, c: '#8B7355', a: 0.3 },
  ]},
  up: { name: 'accessory', pixels: [
    { x: 0, y: 3, w: 2, h: 1, c: '#8B7355', a: 0.3 },
    { x: 10, y: 3, w: 2, h: 1, c: '#8B7355', a: 0.3 },
  ]},
  left: { name: 'accessory', pixels: [
    { x: 2, y: 3, w: 3, h: 3, c: '#8B7355', a: 0.4 },
    { x: 3, y: 4, w: 1, h: 1, c: '#B0E0FF', a: 0.15 },
    { x: 5, y: 4, w: 6, h: 1, c: '#8B7355', a: 0.25 },
  ]},
});

// Sunglasses — dark lenses (4-direction)
registerAccessory('sunglasses', 'Sunglasses', {
  down: { name: 'accessory', pixels: [
    { x: 2, y: 4, w: 3, h: 2, c: '#1A1A2E', a: 0.7 },
    { x: 7, y: 4, w: 3, h: 2, c: '#1A1A2E', a: 0.7 },
    { x: 5, y: 4, w: 2, h: 1, c: '#1A1A2E', a: 0.4 },
    { x: 3, y: 4, w: 1, h: 1, c: '#334', a: 0.3 },
    { x: 8, y: 4, w: 1, h: 1, c: '#334', a: 0.3 },
  ]},
  up: { name: 'accessory', pixels: [
    { x: 0, y: 3, w: 2, h: 1, c: '#1A1A2E', a: 0.4 },
    { x: 10, y: 3, w: 2, h: 1, c: '#1A1A2E', a: 0.4 },
  ]},
  left: { name: 'accessory', pixels: [
    { x: 2, y: 4, w: 3, h: 2, c: '#1A1A2E', a: 0.7 },
    { x: 3, y: 4, w: 1, h: 1, c: '#334', a: 0.3 },
    { x: 5, y: 4, w: 6, h: 1, c: '#1A1A2E', a: 0.35 },
  ]},
});

// Headphones — over-ear (4-direction)
registerAccessory('headphones', 'Headphones', {
  down: { name: 'accessory', pixels: [
    { x: 0, y: 0, w: 12, h: 1, c: '#333', a: 0.7 },
    { x: -1, y: 1, w: 2, h: 5, c: '#444' },
    { x: 11, y: 1, w: 2, h: 5, c: '#444' },
    { x: -1, y: 2, w: 2, h: 3, c: '#555', a: 0.3 },
    { x: 11, y: 2, w: 2, h: 3, c: '#555', a: 0.3 },
  ]},
  up: { name: 'accessory', pixels: [
    { x: 0, y: 0, w: 12, h: 1, c: '#333', a: 0.7 },
    { x: -1, y: 1, w: 2, h: 5, c: '#444' },
    { x: 11, y: 1, w: 2, h: 5, c: '#444' },
    { x: -1, y: 2, w: 2, h: 3, c: '#555', a: 0.3 },
    { x: 11, y: 2, w: 2, h: 3, c: '#555', a: 0.3 },
  ]},
  left: { name: 'accessory', pixels: [
    { x: 1, y: 0, w: 10, h: 1, c: '#333', a: 0.7 },
    { x: -1, y: 1, w: 3, h: 5, c: '#444' },
    { x: -1, y: 2, w: 3, h: 3, c: '#555', a: 0.3 },
  ]},
});

// Beret — flat cap (4-direction)
registerAccessory('beret', 'Beret', {
  down: { name: 'accessory', pixels: [
    { x: 2, y: -1, w: 8, h: 2, c: '#E91E63' },
    { x: 1, y: 0, w: 2, h: 1, c: '#E91E63', a: 0.6 },
    { x: 4, y: -1, w: 4, h: 1, c: '#F06292', a: 0.3 },
  ]},
  up: { name: 'accessory', pixels: [
    { x: 2, y: -1, w: 8, h: 2, c: '#E91E63' },
    { x: 9, y: 0, w: 2, h: 1, c: '#E91E63', a: 0.6 },
  ]},
  left: { name: 'accessory', pixels: [
    { x: 0, y: -1, w: 8, h: 2, c: '#E91E63' },
    { x: 2, y: -1, w: 4, h: 1, c: '#F06292', a: 0.3 },
  ]},
});

// Cap — baseball cap (4-direction)
registerAccessory('cap', 'Cap', {
  down: { name: 'accessory', pixels: [
    { x: 1, y: -1, w: 10, h: 2, c: '#1565C0' },
    { x: 0, y: 1, w: 12, h: 1, c: '#0D47A1' }, // brim
    { x: 3, y: -1, w: 6, h: 1, c: '#1E88E5', a: 0.3 },
  ]},
  up: { name: 'accessory', pixels: [
    { x: 1, y: -1, w: 10, h: 2, c: '#1565C0' },
    { x: 3, y: -1, w: 6, h: 1, c: '#1E88E5', a: 0.3 },
    // Snap back
    { x: 5, y: 1, w: 2, h: 1, c: '#0D47A1', a: 0.5 },
  ]},
  left: { name: 'accessory', pixels: [
    { x: 0, y: -1, w: 9, h: 2, c: '#1565C0' },
    { x: -2, y: 1, w: 6, h: 1, c: '#0D47A1' }, // brim protruding
    { x: 2, y: -1, w: 5, h: 1, c: '#1E88E5', a: 0.3 },
  ]},
});

// Badge — ID badge on chest (4-direction)
registerAccessory('badge', 'Badge', {
  down: { name: 'accessory', pixels: [
    { x: 5, y: 8, w: 2, h: 3, c: '#2196F3', a: 0.4 },
    { x: 4, y: 11, w: 4, h: 3, c: '#FFF', a: 0.5 },
    { x: 5, y: 12, w: 2, h: 1, c: '#333', a: 0.3 },
  ]},
  up: { name: 'accessory', pixels: [] }, // not visible from back
  left: { name: 'accessory', pixels: [
    { x: 3, y: 8, w: 1, h: 3, c: '#2196F3', a: 0.4 },
    { x: 2, y: 11, w: 3, h: 3, c: '#FFF', a: 0.5 },
  ]},
});

// Suit lapels — formal overlay (4-direction)
registerAccessory('lapels', 'Lapels', {
  down: { name: 'accessory', pixels: [
    { x: 1, y: 10, w: 3, h: 2, c: '#1A1A2E', a: 0.4 },
    { x: 8, y: 10, w: 3, h: 2, c: '#1A1A2E', a: 0.4 },
  ]},
  up: { name: 'accessory', pixels: [] },
  left: { name: 'accessory', pixels: [
    { x: 1, y: 10, w: 3, h: 2, c: '#1A1A2E', a: 0.4 },
  ]},
});

// Blush — subtle cheek color (4-direction)
registerAccessory('blush', 'Blush', {
  down: { name: 'accessory', pixels: [
    { x: 2, y: 6, w: 1, h: 1, c: '#FFCDD2', a: 0.3 },
    { x: 9, y: 6, w: 1, h: 1, c: '#FFCDD2', a: 0.3 },
  ]},
  up: { name: 'accessory', pixels: [] },
  left: { name: 'accessory', pixels: [
    { x: 2, y: 6, w: 1, h: 1, c: '#FFCDD2', a: 0.3 },
  ]},
});

// Scarf (4-direction)
registerAccessory('scarf', 'Scarf', {
  down: { name: 'accessory', pixels: [
    { x: 2, y: 9, w: 8, h: 2, c: '#E53935', a: 0.6 },
    { x: 3, y: 9, w: 6, h: 1, c: '#EF5350', a: 0.3 },
    { x: 3, y: 11, w: 2, h: 3, c: '#E53935', a: 0.5 },
  ]},
  up: { name: 'accessory', pixels: [
    { x: 2, y: 9, w: 8, h: 2, c: '#E53935', a: 0.6 },
    { x: 3, y: 9, w: 6, h: 1, c: '#EF5350', a: 0.3 },
  ]},
  left: { name: 'accessory', pixels: [
    { x: 1, y: 9, w: 8, h: 2, c: '#E53935', a: 0.6 },
    { x: 2, y: 9, w: 5, h: 1, c: '#EF5350', a: 0.3 },
    { x: 1, y: 11, w: 2, h: 3, c: '#E53935', a: 0.5 },
  ]},
});

// Tie (4-direction)
registerAccessory('tie', 'Tie', {
  down: { name: 'accessory', pixels: [
    { x: 5, y: 9, w: 2, h: 1, c: '#B71C1C' },
    { x: 5, y: 10, w: 2, h: 4, c: '#D32F2F' },
    { x: 5, y: 10, w: 1, h: 4, c: '#E53935', a: 0.3 },
    { x: 5, y: 14, w: 2, h: 1, c: '#B71C1C', a: 0.8 },
  ]},
  up: { name: 'accessory', pixels: [] },
  left: { name: 'accessory', pixels: [
    { x: 4, y: 9, w: 2, h: 1, c: '#B71C1C' },
    { x: 4, y: 10, w: 2, h: 4, c: '#D32F2F' },
    { x: 4, y: 14, w: 2, h: 1, c: '#B71C1C', a: 0.8 },
  ]},
});

// Bowtie (4-direction)
registerAccessory('bowtie', 'Bowtie', {
  down: { name: 'accessory', pixels: [
    { x: 3, y: 9, w: 2, h: 1, c: '#D32F2F' },
    { x: 7, y: 9, w: 2, h: 1, c: '#D32F2F' },
    { x: 5, y: 9, w: 2, h: 1, c: '#B71C1C' },
    { x: 4, y: 9, w: 1, h: 1, c: '#E53935', a: 0.3 },
    { x: 7, y: 9, w: 1, h: 1, c: '#E53935', a: 0.3 },
  ]},
  up: { name: 'accessory', pixels: [] },
  left: { name: 'accessory', pixels: [
    { x: 3, y: 9, w: 3, h: 1, c: '#D32F2F' },
    { x: 4, y: 9, w: 1, h: 1, c: '#B71C1C' },
  ]},
});

/* ── Animal / Fun Accessories ──────────────────── */

// Cat Ears (4-direction)
registerAccessory('cat-ears', 'Cat Ears', {
  down: { name: 'accessory', pixels: [
    { x: 1, y: -3, w: 2, h: 1, c: '#555' },
    { x: 0, y: -2, w: 3, h: 1, c: '#555' },
    { x: 0, y: -1, w: 3, h: 1, c: '#555' },
    { x: 1, y: -2, w: 1, h: 1, c: '#FFB0C0', a: 0.6 },
    { x: 9, y: -3, w: 2, h: 1, c: '#555' },
    { x: 9, y: -2, w: 3, h: 1, c: '#555' },
    { x: 9, y: -1, w: 3, h: 1, c: '#555' },
    { x: 10, y: -2, w: 1, h: 1, c: '#FFB0C0', a: 0.6 },
  ]},
  up: { name: 'accessory', pixels: [
    { x: 1, y: -3, w: 2, h: 1, c: '#555' },
    { x: 0, y: -2, w: 3, h: 1, c: '#555' },
    { x: 0, y: -1, w: 3, h: 1, c: '#555' },
    { x: 9, y: -3, w: 2, h: 1, c: '#555' },
    { x: 9, y: -2, w: 3, h: 1, c: '#555' },
    { x: 9, y: -1, w: 3, h: 1, c: '#555' },
  ]},
  left: { name: 'accessory', pixels: [
    { x: 2, y: -3, w: 2, h: 1, c: '#555' },
    { x: 1, y: -2, w: 3, h: 1, c: '#555' },
    { x: 1, y: -1, w: 3, h: 1, c: '#555' },
    { x: 2, y: -2, w: 1, h: 1, c: '#FFB0C0', a: 0.6 },
  ]},
});

// Bear Ears (4-direction)
registerAccessory('bear-ears', 'Bear Ears', {
  down: { name: 'accessory', pixels: [
    { x: 0, y: -2, w: 3, h: 2, c: '#8B6914' },
    { x: 1, y: -1, w: 1, h: 1, c: '#C4A24A', a: 0.5 },
    { x: 9, y: -2, w: 3, h: 2, c: '#8B6914' },
    { x: 10, y: -1, w: 1, h: 1, c: '#C4A24A', a: 0.5 },
  ]},
  up: { name: 'accessory', pixels: [
    { x: 0, y: -2, w: 3, h: 2, c: '#8B6914' },
    { x: 9, y: -2, w: 3, h: 2, c: '#8B6914' },
  ]},
  left: { name: 'accessory', pixels: [
    { x: 1, y: -2, w: 3, h: 2, c: '#8B6914' },
    { x: 2, y: -1, w: 1, h: 1, c: '#C4A24A', a: 0.5 },
  ]},
});

// Bunny Ears (4-direction)
registerAccessory('bunny-ears', 'Bunny Ears', {
  down: { name: 'accessory', pixels: [
    { x: 2, y: -5, w: 2, h: 4, c: '#F5F5F5' },
    { x: 2, y: -4, w: 1, h: 2, c: '#FFB0C0', a: 0.5 },
    { x: 8, y: -5, w: 2, h: 4, c: '#F5F5F5' },
    { x: 9, y: -4, w: 1, h: 2, c: '#FFB0C0', a: 0.5 },
    { x: 9, y: -6, w: 2, h: 1, c: '#F5F5F5' },
  ]},
  up: { name: 'accessory', pixels: [
    { x: 2, y: -5, w: 2, h: 4, c: '#F5F5F5' },
    { x: 8, y: -5, w: 2, h: 4, c: '#F5F5F5' },
    { x: 9, y: -6, w: 2, h: 1, c: '#F5F5F5' },
  ]},
  left: { name: 'accessory', pixels: [
    { x: 3, y: -5, w: 2, h: 4, c: '#F5F5F5' },
    { x: 3, y: -4, w: 1, h: 2, c: '#FFB0C0', a: 0.5 },
    { x: 4, y: -6, w: 2, h: 1, c: '#F5F5F5' },
  ]},
});

// Dog Nose — snout overlay (4-direction)
registerAccessory('dog-nose', 'Dog Nose', {
  down: { name: 'accessory', pixels: [
    { x: 4, y: 5, w: 4, h: 3, c: '#D2B48C', a: 0.5 },
    { x: 5, y: 5, w: 2, h: 1, c: '#222' },
    { x: 6, y: 7, w: 1, h: 1, c: '#FF6B8A', a: 0.7 },
  ]},
  up: { name: 'accessory', pixels: [] },
  left: { name: 'accessory', pixels: [
    { x: 0, y: 5, w: 4, h: 2, c: '#D2B48C', a: 0.5 },
    { x: 0, y: 5, w: 2, h: 1, c: '#222' },
    { x: 1, y: 7, w: 1, h: 1, c: '#FF6B8A', a: 0.7 },
  ]},
});

// Fox Mask — ears + nose accent (4-direction)
registerAccessory('fox-mask', 'Fox Mask', {
  down: { name: 'accessory', pixels: [
    { x: 0, y: -3, w: 2, h: 1, c: '#E65100' },
    { x: -1, y: -2, w: 3, h: 1, c: '#E65100' },
    { x: 0, y: -1, w: 3, h: 1, c: '#E65100' },
    { x: 10, y: -3, w: 2, h: 1, c: '#E65100' },
    { x: 10, y: -2, w: 3, h: 1, c: '#E65100' },
    { x: 9, y: -1, w: 3, h: 1, c: '#E65100' },
    { x: 0, y: -2, w: 1, h: 1, c: '#FFF', a: 0.4 },
    { x: 11, y: -2, w: 1, h: 1, c: '#FFF', a: 0.4 },
    { x: 1, y: 5, w: 2, h: 2, c: '#FFF', a: 0.25 },
    { x: 9, y: 5, w: 2, h: 2, c: '#FFF', a: 0.25 },
    { x: 5, y: 6, w: 2, h: 1, c: '#222', a: 0.6 },
  ]},
  up: { name: 'accessory', pixels: [
    { x: 0, y: -3, w: 2, h: 1, c: '#E65100' },
    { x: -1, y: -2, w: 3, h: 1, c: '#E65100' },
    { x: 0, y: -1, w: 3, h: 1, c: '#E65100' },
    { x: 10, y: -3, w: 2, h: 1, c: '#E65100' },
    { x: 10, y: -2, w: 3, h: 1, c: '#E65100' },
    { x: 9, y: -1, w: 3, h: 1, c: '#E65100' },
  ]},
  left: { name: 'accessory', pixels: [
    { x: 1, y: -3, w: 2, h: 1, c: '#E65100' },
    { x: 0, y: -2, w: 3, h: 1, c: '#E65100' },
    { x: 1, y: -1, w: 3, h: 1, c: '#E65100' },
    { x: 1, y: -2, w: 1, h: 1, c: '#FFF', a: 0.4 },
    { x: 1, y: 5, w: 2, h: 2, c: '#FFF', a: 0.25 },
    { x: 1, y: 6, w: 2, h: 1, c: '#222', a: 0.6 },
  ]},
});

// Crown (4-direction)
registerAccessory('crown', 'Crown', {
  down: { name: 'accessory', pixels: [
    { x: 2, y: -1, w: 8, h: 2, c: '#FFD700' },
    { x: 3, y: -3, w: 2, h: 2, c: '#FFD700' },
    { x: 5, y: -2, w: 2, h: 1, c: '#FFD700' },
    { x: 7, y: -3, w: 2, h: 2, c: '#FFD700' },
    { x: 4, y: -2, w: 1, h: 1, c: '#E53935', a: 0.8 },
    { x: 6, y: -1, w: 1, h: 1, c: '#42A5F5', a: 0.8 },
    { x: 8, y: -2, w: 1, h: 1, c: '#66BB6A', a: 0.8 },
    { x: 3, y: -1, w: 6, h: 1, c: '#FFF', a: 0.15 },
  ]},
  up: { name: 'accessory', pixels: [
    { x: 2, y: -1, w: 8, h: 2, c: '#FFD700' },
    { x: 3, y: -3, w: 2, h: 2, c: '#FFD700' },
    { x: 5, y: -2, w: 2, h: 1, c: '#FFD700' },
    { x: 7, y: -3, w: 2, h: 2, c: '#FFD700' },
    { x: 3, y: -1, w: 6, h: 1, c: '#FFF', a: 0.15 },
  ]},
  left: { name: 'accessory', pixels: [
    { x: 1, y: -1, w: 7, h: 2, c: '#FFD700' },
    { x: 2, y: -3, w: 2, h: 2, c: '#FFD700' },
    { x: 5, y: -2, w: 2, h: 1, c: '#FFD700' },
    { x: 3, y: -2, w: 1, h: 1, c: '#E53935', a: 0.8 },
    { x: 5, y: -1, w: 1, h: 1, c: '#42A5F5', a: 0.8 },
    { x: 2, y: -1, w: 5, h: 1, c: '#FFF', a: 0.15 },
  ]},
});

// Halo (4-direction)
registerAccessory('halo', 'Halo', {
  down: { name: 'accessory', pixels: [
    { x: 2, y: -3, w: 8, h: 1, c: '#FFE082', a: 0.7 },
    { x: 1, y: -2, w: 1, h: 1, c: '#FFE082', a: 0.5 },
    { x: 10, y: -2, w: 1, h: 1, c: '#FFE082', a: 0.5 },
    { x: 3, y: -4, w: 6, h: 1, c: '#FFF9C4', a: 0.4 },
    { x: 3, y: -3, w: 6, h: 1, c: '#FFF', a: 0.15 },
  ]},
  up: { name: 'accessory', pixels: [
    { x: 2, y: -3, w: 8, h: 1, c: '#FFE082', a: 0.7 },
    { x: 1, y: -2, w: 1, h: 1, c: '#FFE082', a: 0.5 },
    { x: 10, y: -2, w: 1, h: 1, c: '#FFE082', a: 0.5 },
    { x: 3, y: -4, w: 6, h: 1, c: '#FFF9C4', a: 0.4 },
    { x: 3, y: -3, w: 6, h: 1, c: '#FFF', a: 0.15 },
  ]},
  left: { name: 'accessory', pixels: [
    { x: 1, y: -3, w: 7, h: 1, c: '#FFE082', a: 0.7 },
    { x: 0, y: -2, w: 1, h: 1, c: '#FFE082', a: 0.5 },
    { x: 8, y: -2, w: 1, h: 1, c: '#FFE082', a: 0.5 },
    { x: 2, y: -4, w: 5, h: 1, c: '#FFF9C4', a: 0.4 },
    { x: 2, y: -3, w: 5, h: 1, c: '#FFF', a: 0.15 },
  ]},
});

// Horns — devil horns (4-direction)
registerAccessory('horns', 'Horns', {
  down: { name: 'accessory', pixels: [
    { x: 1, y: -1, w: 2, h: 2, c: '#8B0000' },
    { x: 0, y: -3, w: 2, h: 2, c: '#A00' },
    { x: 0, y: -4, w: 1, h: 1, c: '#C62828' },
    { x: 9, y: -1, w: 2, h: 2, c: '#8B0000' },
    { x: 10, y: -3, w: 2, h: 2, c: '#A00' },
    { x: 11, y: -4, w: 1, h: 1, c: '#C62828' },
  ]},
  up: { name: 'accessory', pixels: [
    { x: 1, y: -1, w: 2, h: 2, c: '#8B0000' },
    { x: 0, y: -3, w: 2, h: 2, c: '#A00' },
    { x: 0, y: -4, w: 1, h: 1, c: '#C62828' },
    { x: 9, y: -1, w: 2, h: 2, c: '#8B0000' },
    { x: 10, y: -3, w: 2, h: 2, c: '#A00' },
    { x: 11, y: -4, w: 1, h: 1, c: '#C62828' },
  ]},
  left: { name: 'accessory', pixels: [
    { x: 2, y: -1, w: 2, h: 2, c: '#8B0000' },
    { x: 1, y: -3, w: 2, h: 2, c: '#A00' },
    { x: 1, y: -4, w: 1, h: 1, c: '#C62828' },
  ]},
});

// Mask — masquerade / phantom style (4-direction)
registerAccessory('mask', 'Mask', {
  down: { name: 'accessory', pixels: [
    { x: 1, y: 3, w: 10, h: 3, c: '#1A1A2E', a: 0.75 },
    { x: 3, y: 4, w: 2, h: 1, c: '#000', a: 0 },
    { x: 7, y: 4, w: 2, h: 1, c: '#000', a: 0 },
    { x: 1, y: 3, w: 10, h: 1, c: '#FFD700', a: 0.3 },
    { x: 1, y: 5, w: 10, h: 1, c: '#FFD700', a: 0.2 },
  ]},
  up: { name: 'accessory', pixels: [
    // Strap visible from back
    { x: 0, y: 4, w: 12, h: 1, c: '#1A1A2E', a: 0.3 },
  ]},
  left: { name: 'accessory', pixels: [
    { x: 1, y: 3, w: 6, h: 3, c: '#1A1A2E', a: 0.75 },
    { x: 2, y: 4, w: 2, h: 1, c: '#000', a: 0 },
    { x: 1, y: 3, w: 6, h: 1, c: '#FFD700', a: 0.3 },
    { x: 1, y: 5, w: 6, h: 1, c: '#FFD700', a: 0.2 },
  ]},
});

// Bandana (4-direction)
registerAccessory('bandana', 'Bandana', {
  down: { name: 'accessory', pixels: [
    { x: 0, y: 1, w: 12, h: 2, c: '#E53935' },
    { x: 1, y: 1, w: 10, h: 1, c: '#EF5350', a: 0.3 },
  ]},
  up: { name: 'accessory', pixels: [
    { x: 0, y: 1, w: 12, h: 2, c: '#E53935' },
    { x: 1, y: 1, w: 10, h: 1, c: '#EF5350', a: 0.3 },
    // Knot visible from back
    { x: 11, y: 2, w: 2, h: 2, c: '#E53935', a: 0.7 },
    { x: 12, y: 3, w: 1, h: 1, c: '#C62828', a: 0.5 },
  ]},
  left: { name: 'accessory', pixels: [
    { x: 0, y: 1, w: 10, h: 2, c: '#E53935' },
    { x: 1, y: 1, w: 8, h: 1, c: '#EF5350', a: 0.3 },
  ]},
});

// Eye Patch (4-direction)
registerAccessory('eyepatch', 'Eye Patch', {
  down: { name: 'accessory', pixels: [
    { x: 0, y: 3, w: 12, h: 1, c: '#222', a: 0.5 },
    { x: 2, y: 3, w: 3, h: 3, c: '#1A1A1A' },
    { x: 3, y: 4, w: 1, h: 1, c: '#333', a: 0.3 },
  ]},
  up: { name: 'accessory', pixels: [
    { x: 0, y: 3, w: 12, h: 1, c: '#222', a: 0.5 },
  ]},
  left: { name: 'accessory', pixels: [
    { x: 0, y: 3, w: 10, h: 1, c: '#222', a: 0.5 },
    { x: 1, y: 3, w: 3, h: 3, c: '#1A1A1A' },
    { x: 2, y: 4, w: 1, h: 1, c: '#333', a: 0.3 },
  ]},
});

/* ── Full-Face Animal Masks ─────────────────── */

// Cat Face — full head replacement (4-direction)
registerAccessory('cat-face', 'Cat Face', {
  down: {
    name: 'accessory',
    pixels: [
      // Face base (round)
      { x: 1, y: 1, w: 10, h: 8, c: '#555' },
      { x: 2, y: 0, w: 8, h: 1, c: '#555' },
      // Ears (pointy triangles)
      { x: 0, y: -2, w: 3, h: 2, c: '#555' },
      { x: 1, y: -3, w: 2, h: 1, c: '#555' },
      { x: 9, y: -2, w: 3, h: 2, c: '#555' },
      { x: 9, y: -3, w: 2, h: 1, c: '#555' },
      // Inner ears (pink)
      { x: 1, y: -1, w: 1, h: 1, c: '#FFB0C0', a: 0.7 },
      { x: 10, y: -1, w: 1, h: 1, c: '#FFB0C0', a: 0.7 },
      // Eyes (big round)
      { x: 2, y: 3, w: 3, h: 3, c: '#222' },
      { x: 7, y: 3, w: 3, h: 3, c: '#222' },
      { x: 3, y: 3, w: 1, h: 2, c: '#4FC3F7', a: 0.8 },
      { x: 8, y: 3, w: 1, h: 2, c: '#4FC3F7', a: 0.8 },
      // Pupil slit
      { x: 3, y: 4, w: 1, h: 1, c: '#111' },
      { x: 8, y: 4, w: 1, h: 1, c: '#111' },
      // Nose (pink triangle)
      { x: 5, y: 5, w: 2, h: 1, c: '#FFB0C0' },
      // Mouth
      { x: 4, y: 6, w: 1, h: 1, c: '#444', a: 0.6 },
      { x: 7, y: 6, w: 1, h: 1, c: '#444', a: 0.6 },
      // Whiskers
      { x: 0, y: 5, w: 2, h: 1, c: '#888', a: 0.4 },
      { x: 10, y: 5, w: 2, h: 1, c: '#888', a: 0.4 },
      { x: 0, y: 6, w: 2, h: 1, c: '#888', a: 0.3 },
      { x: 10, y: 6, w: 2, h: 1, c: '#888', a: 0.3 },
    ],
  },
  up: {
    name: 'accessory',
    pixels: [
      // Back of head
      { x: 1, y: 1, w: 10, h: 8, c: '#555' },
      { x: 2, y: 0, w: 8, h: 1, c: '#555' },
      // Ears from behind
      { x: 0, y: -2, w: 3, h: 2, c: '#555' },
      { x: 1, y: -3, w: 2, h: 1, c: '#555' },
      { x: 9, y: -2, w: 3, h: 2, c: '#555' },
      { x: 9, y: -3, w: 2, h: 1, c: '#555' },
      // Fur pattern on back
      { x: 5, y: 1, w: 2, h: 5, c: '#4A4A4A', a: 0.3 },
      // Tail hint at bottom
      { x: 9, y: 8, w: 2, h: 2, c: '#555' },
      { x: 10, y: 7, w: 1, h: 1, c: '#555' },
    ],
  },
  left: {
    name: 'accessory',
    pixels: [
      // Side face profile
      { x: 1, y: 1, w: 9, h: 8, c: '#555' },
      { x: 2, y: 0, w: 7, h: 1, c: '#555' },
      // Ear (one visible, pointy)
      { x: 2, y: -2, w: 3, h: 2, c: '#555' },
      { x: 3, y: -3, w: 2, h: 1, c: '#555' },
      { x: 3, y: -1, w: 1, h: 1, c: '#FFB0C0', a: 0.7 },
      // Eye (one, side-facing)
      { x: 2, y: 3, w: 3, h: 3, c: '#222' },
      { x: 3, y: 3, w: 1, h: 2, c: '#4FC3F7', a: 0.8 },
      { x: 3, y: 4, w: 1, h: 1, c: '#111' },
      // Nose / snout protruding
      { x: 0, y: 5, w: 3, h: 2, c: '#555' },
      { x: 0, y: 5, w: 2, h: 1, c: '#FFB0C0' },
      // Whiskers
      { x: -1, y: 5, w: 2, h: 1, c: '#888', a: 0.4 },
      { x: -1, y: 6, w: 2, h: 1, c: '#888', a: 0.3 },
    ],
  },
});

// Bear Face — round brown head (4-direction)
registerAccessory('bear-face', 'Bear Face', {
  down: {
    name: 'accessory',
    pixels: [
      { x: 1, y: 0, w: 10, h: 9, c: '#8B6914' },
      { x: 2, y: -1, w: 8, h: 1, c: '#8B6914' },
      { x: 0, y: -1, w: 3, h: 3, c: '#8B6914' },
      { x: 9, y: -1, w: 3, h: 3, c: '#8B6914' },
      { x: 1, y: 0, w: 1, h: 1, c: '#C4A24A', a: 0.6 },
      { x: 10, y: 0, w: 1, h: 1, c: '#C4A24A', a: 0.6 },
      { x: 3, y: 5, w: 6, h: 4, c: '#C4A24A', a: 0.7 },
      { x: 3, y: 3, w: 2, h: 2, c: '#111' },
      { x: 7, y: 3, w: 2, h: 2, c: '#111' },
      { x: 3, y: 3, w: 1, h: 1, c: '#FFF', a: 0.3 },
      { x: 7, y: 3, w: 1, h: 1, c: '#FFF', a: 0.3 },
      { x: 5, y: 5, w: 2, h: 1, c: '#222' },
      { x: 5, y: 7, w: 2, h: 1, c: '#6B4F10', a: 0.5 },
    ],
  },
  up: {
    name: 'accessory',
    pixels: [
      { x: 1, y: 0, w: 10, h: 9, c: '#8B6914' },
      { x: 2, y: -1, w: 8, h: 1, c: '#8B6914' },
      { x: 0, y: -1, w: 3, h: 3, c: '#8B6914' },
      { x: 9, y: -1, w: 3, h: 3, c: '#8B6914' },
      { x: 1, y: 0, w: 1, h: 1, c: '#C4A24A', a: 0.6 },
      { x: 10, y: 0, w: 1, h: 1, c: '#C4A24A', a: 0.6 },
      { x: 5, y: 1, w: 2, h: 5, c: '#7A5B10', a: 0.3 },
    ],
  },
  left: {
    name: 'accessory',
    pixels: [
      { x: 1, y: 0, w: 9, h: 9, c: '#8B6914' },
      { x: 2, y: -1, w: 7, h: 1, c: '#8B6914' },
      { x: 0, y: -1, w: 3, h: 3, c: '#8B6914' },
      { x: 0, y: 0, w: 1, h: 1, c: '#C4A24A', a: 0.6 },
      { x: 0, y: 4, w: 3, h: 4, c: '#C4A24A', a: 0.7 },
      { x: 3, y: 3, w: 2, h: 2, c: '#111' },
      { x: 3, y: 3, w: 1, h: 1, c: '#FFF', a: 0.3 },
      { x: 1, y: 5, w: 2, h: 1, c: '#222' },
    ],
  },
});

// Panda Face — black & white (4-direction)
registerAccessory('panda-face', 'Panda Face', {
  down: {
    name: 'accessory',
    pixels: [
      { x: 1, y: 0, w: 10, h: 9, c: '#F5F5F5' },
      { x: 2, y: -1, w: 8, h: 1, c: '#F5F5F5' },
      { x: 0, y: -2, w: 3, h: 3, c: '#222' },
      { x: 9, y: -2, w: 3, h: 3, c: '#222' },
      { x: 2, y: 2, w: 3, h: 4, c: '#222' },
      { x: 7, y: 2, w: 3, h: 4, c: '#222' },
      { x: 3, y: 3, w: 1, h: 2, c: '#FFF' },
      { x: 8, y: 3, w: 1, h: 2, c: '#FFF' },
      { x: 3, y: 4, w: 1, h: 1, c: '#111' },
      { x: 8, y: 4, w: 1, h: 1, c: '#111' },
      { x: 5, y: 6, w: 2, h: 1, c: '#222' },
      { x: 5, y: 7, w: 1, h: 1, c: '#CCC', a: 0.4 },
      { x: 6, y: 7, w: 1, h: 1, c: '#CCC', a: 0.4 },
    ],
  },
  up: {
    name: 'accessory',
    pixels: [
      { x: 1, y: 0, w: 10, h: 9, c: '#F5F5F5' },
      { x: 2, y: -1, w: 8, h: 1, c: '#F5F5F5' },
      { x: 0, y: -2, w: 3, h: 3, c: '#222' },
      { x: 9, y: -2, w: 3, h: 3, c: '#222' },
      { x: 5, y: 1, w: 2, h: 5, c: '#EEE', a: 0.3 },
    ],
  },
  left: {
    name: 'accessory',
    pixels: [
      { x: 1, y: 0, w: 9, h: 9, c: '#F5F5F5' },
      { x: 2, y: -1, w: 7, h: 1, c: '#F5F5F5' },
      { x: 0, y: -2, w: 3, h: 3, c: '#222' },
      { x: 2, y: 2, w: 3, h: 4, c: '#222' },
      { x: 3, y: 3, w: 1, h: 2, c: '#FFF' },
      { x: 3, y: 4, w: 1, h: 1, c: '#111' },
      { x: 0, y: 5, w: 3, h: 2, c: '#F5F5F5' },
      { x: 1, y: 6, w: 1, h: 1, c: '#222' },
    ],
  },
});

// Frog Face — green with big eyes (4-direction)
registerAccessory('frog-face', 'Frog Face', {
  down: {
    name: 'accessory',
    pixels: [
      { x: 1, y: 1, w: 10, h: 8, c: '#4CAF50' },
      { x: 2, y: 0, w: 8, h: 1, c: '#4CAF50' },
      { x: 1, y: -2, w: 4, h: 3, c: '#4CAF50' },
      { x: 7, y: -2, w: 4, h: 3, c: '#4CAF50' },
      { x: 2, y: -1, w: 2, h: 2, c: '#FFF' },
      { x: 8, y: -1, w: 2, h: 2, c: '#FFF' },
      { x: 3, y: 0, w: 1, h: 1, c: '#111' },
      { x: 9, y: 0, w: 1, h: 1, c: '#111' },
      { x: 3, y: 5, w: 6, h: 3, c: '#81C784', a: 0.5 },
      { x: 2, y: 7, w: 8, h: 1, c: '#388E3C', a: 0.6 },
      { x: 4, y: 4, w: 1, h: 1, c: '#388E3C', a: 0.5 },
      { x: 7, y: 4, w: 1, h: 1, c: '#388E3C', a: 0.5 },
      { x: 1, y: 5, w: 2, h: 1, c: '#FF8A80', a: 0.25 },
      { x: 9, y: 5, w: 2, h: 1, c: '#FF8A80', a: 0.25 },
    ],
  },
  up: {
    name: 'accessory',
    pixels: [
      { x: 1, y: 1, w: 10, h: 8, c: '#4CAF50' },
      { x: 2, y: 0, w: 8, h: 1, c: '#4CAF50' },
      { x: 1, y: -2, w: 4, h: 2, c: '#4CAF50' },
      { x: 7, y: -2, w: 4, h: 2, c: '#4CAF50' },
      { x: 5, y: 2, w: 2, h: 4, c: '#388E3C', a: 0.2 },
    ],
  },
  left: {
    name: 'accessory',
    pixels: [
      { x: 1, y: 1, w: 9, h: 8, c: '#4CAF50' },
      { x: 2, y: 0, w: 7, h: 1, c: '#4CAF50' },
      { x: 0, y: -2, w: 4, h: 3, c: '#4CAF50' },
      { x: 1, y: -1, w: 2, h: 2, c: '#FFF' },
      { x: 2, y: 0, w: 1, h: 1, c: '#111' },
      { x: 0, y: 5, w: 3, h: 3, c: '#81C784', a: 0.5 },
      { x: 0, y: 7, w: 8, h: 1, c: '#388E3C', a: 0.6 },
      { x: 1, y: 5, w: 1, h: 1, c: '#FF8A80', a: 0.25 },
    ],
  },
});

// Rabbit Face — white with long ears (4-direction)
registerAccessory('rabbit-face', 'Rabbit Face', {
  down: {
    name: 'accessory',
    pixels: [
      { x: 1, y: 1, w: 10, h: 8, c: '#F5F5F5' },
      { x: 2, y: 0, w: 8, h: 1, c: '#F5F5F5' },
      { x: 2, y: -6, w: 3, h: 6, c: '#F5F5F5' },
      { x: 7, y: -6, w: 3, h: 6, c: '#F5F5F5' },
      { x: 3, y: -5, w: 1, h: 4, c: '#FFB0C0', a: 0.6 },
      { x: 8, y: -5, w: 1, h: 4, c: '#FFB0C0', a: 0.6 },
      { x: 2, y: 3, w: 3, h: 3, c: '#E57373', a: 0.7 },
      { x: 7, y: 3, w: 3, h: 3, c: '#E57373', a: 0.7 },
      { x: 3, y: 3, w: 1, h: 1, c: '#FFF', a: 0.4 },
      { x: 8, y: 3, w: 1, h: 1, c: '#FFF', a: 0.4 },
      { x: 5, y: 5, w: 2, h: 1, c: '#FFB0C0' },
      { x: 5, y: 6, w: 1, h: 1, c: '#DDD', a: 0.4 },
      { x: 6, y: 6, w: 1, h: 1, c: '#DDD', a: 0.4 },
      { x: 0, y: 4, w: 2, h: 3, c: '#F5F5F5', a: 0.6 },
      { x: 10, y: 4, w: 2, h: 3, c: '#F5F5F5', a: 0.6 },
    ],
  },
  up: {
    name: 'accessory',
    pixels: [
      { x: 1, y: 1, w: 10, h: 8, c: '#F5F5F5' },
      { x: 2, y: 0, w: 8, h: 1, c: '#F5F5F5' },
      { x: 2, y: -6, w: 3, h: 6, c: '#F5F5F5' },
      { x: 7, y: -6, w: 3, h: 6, c: '#F5F5F5' },
      { x: 3, y: -5, w: 1, h: 4, c: '#FFB0C0', a: 0.6 },
      { x: 8, y: -5, w: 1, h: 4, c: '#FFB0C0', a: 0.6 },
      // Cotton tail
      { x: 5, y: 8, w: 3, h: 2, c: '#FFF' },
    ],
  },
  left: {
    name: 'accessory',
    pixels: [
      { x: 1, y: 1, w: 9, h: 8, c: '#F5F5F5' },
      { x: 2, y: 0, w: 7, h: 1, c: '#F5F5F5' },
      // One ear visible (tilted)
      { x: 3, y: -6, w: 3, h: 6, c: '#F5F5F5' },
      { x: 4, y: -5, w: 1, h: 4, c: '#FFB0C0', a: 0.6 },
      // Eye
      { x: 2, y: 3, w: 3, h: 3, c: '#E57373', a: 0.7 },
      { x: 3, y: 3, w: 1, h: 1, c: '#FFF', a: 0.4 },
      // Snout
      { x: 0, y: 4, w: 3, h: 3, c: '#F5F5F5' },
      { x: 1, y: 5, w: 1, h: 1, c: '#FFB0C0' },
      // Cheek fluff
      { x: 0, y: 4, w: 2, h: 3, c: '#F5F5F5', a: 0.6 },
    ],
  },
});

// Dog Face — brown with floppy ear vibe (4-direction)
registerAccessory('dog-face', 'Dog Face', {
  down: {
    name: 'accessory',
    pixels: [
      // Face base (golden brown)
      { x: 1, y: 0, w: 10, h: 9, c: '#D2A25C' },
      { x: 2, y: -1, w: 8, h: 1, c: '#D2A25C' },
      // Floppy ears (hanging down on sides)
      { x: -1, y: 1, w: 3, h: 6, c: '#A67B3D' },
      { x: 10, y: 1, w: 3, h: 6, c: '#A67B3D' },
      // White muzzle area
      { x: 3, y: 5, w: 6, h: 4, c: '#F5E6D0', a: 0.8 },
      // Eyes (big friendly)
      { x: 3, y: 2, w: 2, h: 3, c: '#3E2723' },
      { x: 7, y: 2, w: 2, h: 3, c: '#3E2723' },
      { x: 3, y: 2, w: 1, h: 1, c: '#FFF', a: 0.4 },
      { x: 7, y: 2, w: 1, h: 1, c: '#FFF', a: 0.4 },
      // Nose (big black)
      { x: 5, y: 5, w: 2, h: 2, c: '#222' },
      // Tongue
      { x: 5, y: 7, w: 2, h: 2, c: '#FF6B8A', a: 0.8 },
      { x: 5, y: 7, w: 1, h: 1, c: '#FF8A9E', a: 0.4 },
    ],
  },
  up: {
    name: 'accessory',
    pixels: [
      // Back of head (golden brown)
      { x: 1, y: 0, w: 10, h: 9, c: '#D2A25C' },
      { x: 2, y: -1, w: 8, h: 1, c: '#D2A25C' },
      // Floppy ears from behind
      { x: -1, y: 1, w: 3, h: 6, c: '#A67B3D' },
      { x: 10, y: 1, w: 3, h: 6, c: '#A67B3D' },
      // Darker center fur line
      { x: 5, y: 0, w: 2, h: 6, c: '#B8883C', a: 0.3 },
      // Collar hint
      { x: 2, y: 8, w: 8, h: 1, c: '#A67B3D', a: 0.5 },
    ],
  },
  left: {
    name: 'accessory',
    pixels: [
      // Side face profile (golden brown)
      { x: 1, y: 0, w: 9, h: 9, c: '#D2A25C' },
      { x: 2, y: -1, w: 7, h: 1, c: '#D2A25C' },
      // Single floppy ear (visible side)
      { x: -1, y: 1, w: 3, h: 6, c: '#A67B3D' },
      // Snout protruding left
      { x: -1, y: 4, w: 3, h: 4, c: '#D2A25C' },
      { x: -1, y: 5, w: 2, h: 3, c: '#F5E6D0', a: 0.8 },
      // Eye (one visible)
      { x: 3, y: 2, w: 2, h: 3, c: '#3E2723' },
      { x: 3, y: 2, w: 1, h: 1, c: '#FFF', a: 0.4 },
      // Nose
      { x: 0, y: 5, w: 2, h: 1, c: '#222' },
      // Tongue
      { x: 0, y: 7, w: 2, h: 1, c: '#FF6B8A', a: 0.7 },
    ],
  },
  // right: auto-mirrored from left
});

/* ── Accessory Unlock Levels (Gamification) ──────── */

export const ACCESSORY_UNLOCK_LEVELS: Record<string, number> = {
  'none': 1,
  'glasses': 1, 'beret': 1, 'cap': 1, 'badge': 1, 'blush': 1, 'lapels': 1,
  'round-glasses': 2, 'headphones': 2,
  'scarf': 3, 'tie': 3, 'bowtie': 3,
  'sunglasses': 4, 'bandana': 4, 'eyepatch': 4,
  'crown': 5, 'halo': 5, 'horns': 5, 'mask': 5,
  'cat-ears': 6, 'bear-ears': 6, 'bunny-ears': 6, 'dog-nose': 6, 'fox-mask': 6,
  'cat-face': 7, 'bear-face': 7, 'panda-face': 7,
  'frog-face': 8, 'rabbit-face': 8, 'dog-face': 8,
  'star-glasses': 9,
};

/** Get the required level to unlock an accessory (default 1) */
export function getAccessoryRequiredLevel(id: string): number {
  return ACCESSORY_UNLOCK_LEVELS[id] ?? 1;
}

/** Check if an accessory is unlocked at the given level */
export function isAccessoryUnlocked(id: string, level: number): boolean {
  return level >= getAccessoryRequiredLevel(id);
}

export const ACCESSORY_COSTS: Record<string, number> = {
  'none': 0,
  'glasses': 0, 'beret': 0, 'cap': 0, 'badge': 0, 'blush': 0, 'lapels': 0,
  'round-glasses': 500, 'headphones': 800,
  'scarf': 1500, 'tie': 1500, 'bowtie': 1500,
  'sunglasses': 3000, 'bandana': 3000, 'eyepatch': 3000,
  'crown': 8000, 'halo': 8000, 'horns': 5000, 'mask': 5000,
  'cat-ears': 8000, 'bear-ears': 8000, 'bunny-ears': 8000, 'dog-nose': 5000, 'fox-mask': 8000,
  'cat-face': 15000, 'bear-face': 15000, 'panda-face': 15000,
  'frog-face': 25000, 'rabbit-face': 25000, 'dog-face': 25000,
  'star-glasses': 50000,
};

/** Get the coin cost for an accessory (default 0) */
export function getAccessoryCost(id: string): number {
  return ACCESSORY_COSTS[id] ?? 0;
}

// Star Glasses — fun star-shaped shades (4-direction)
registerAccessory('star-glasses', 'Star Glasses', {
  down: { name: 'accessory', pixels: [
    { x: 1, y: 3, w: 4, h: 3, c: '#FF4081', a: 0.6 },
    { x: 2, y: 2, w: 2, h: 1, c: '#FF4081', a: 0.6 },
    { x: 2, y: 6, w: 2, h: 1, c: '#FF4081', a: 0.6 },
    { x: 7, y: 3, w: 4, h: 3, c: '#FF4081', a: 0.6 },
    { x: 8, y: 2, w: 2, h: 1, c: '#FF4081', a: 0.6 },
    { x: 8, y: 6, w: 2, h: 1, c: '#FF4081', a: 0.6 },
    { x: 5, y: 4, w: 2, h: 1, c: '#FF4081', a: 0.4 },
  ]},
  up: { name: 'accessory', pixels: [
    { x: 0, y: 3, w: 2, h: 1, c: '#FF4081', a: 0.3 },
    { x: 10, y: 3, w: 2, h: 1, c: '#FF4081', a: 0.3 },
  ]},
  left: { name: 'accessory', pixels: [
    { x: 1, y: 3, w: 4, h: 3, c: '#FF4081', a: 0.6 },
    { x: 2, y: 2, w: 2, h: 1, c: '#FF4081', a: 0.6 },
    { x: 2, y: 6, w: 2, h: 1, c: '#FF4081', a: 0.6 },
    { x: 5, y: 4, w: 6, h: 1, c: '#FF4081', a: 0.3 }, // temple arm
  ]},
});
