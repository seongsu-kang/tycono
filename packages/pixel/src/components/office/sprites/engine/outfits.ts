/* =========================================================
   OUTFIT STYLE REGISTRY — Swappable torso layer variants

   Each outfit replaces the 'torso' layer in a blueprint.
   Torso area: shirt body (y:10..16) + arms (y:11..16).
   All coordinates in MINI (12x22) scale.
   ========================================================= */

import type { CharacterLayer } from './blueprint';
import type { DirectionalLayers, Direction } from './blueprint';
import { resolveDirectionalLayer } from './blueprint';

export interface OutfitStyleMeta {
  id: string;
  name: string;
  layer: CharacterLayer;
  directions?: DirectionalLayers;
  requiredLevel?: number;
  cost?: number;
}

const registry = new Map<string, OutfitStyleMeta>();

export function registerOutfitStyle(
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
      layer: { ...dirs.down, name: 'torso' },
      directions: {
        down: { ...dirs.down, name: 'torso' },
        up: dirs.up ? { ...dirs.up, name: 'torso' } : undefined,
        left: dirs.left ? { ...dirs.left, name: 'torso' } : undefined,
        right: dirs.right ? { ...dirs.right, name: 'torso' } : undefined,
      },
    });
  } else {
    const layer = layerOrDirs as CharacterLayer;
    registry.set(id, { id, name, layer: { ...layer, name: 'torso' } });
  }
}

export function getOutfitStyle(id: string): OutfitStyleMeta | undefined {
  return registry.get(id);
}

export function getOutfitForDirection(id: string, dir: Direction): CharacterLayer | undefined {
  const meta = registry.get(id);
  if (!meta) return undefined;
  if (meta.directions) return resolveDirectionalLayer(meta.directions, dir);
  return meta.layer;
}

export function getAllOutfitStyles(): OutfitStyleMeta[] {
  return Array.from(registry.values());
}

/* ── Built-in Outfit Styles (mini 12x22 coords) ──────── */

// T-shirt — basic default (4-direction)
registerOutfitStyle('tshirt', 'T-Shirt', {
  down: { name: 'torso', pixels: [
    { x: 1, y: 10, w: 10, h: 6, c: '$shirt' },
    { x: 2, y: 10, w: 8, h: 1, c: 'lighten($shirt, 18)', a: 0.3 },
    { x: 1, y: 10, w: 1, h: 5, c: 'darken($shirt, 25)', a: 0.25 },
    { x: 10, y: 10, w: 1, h: 5, c: 'darken($shirt, 25)', a: 0.25 },
    { x: -1, y: 11, w: 2, h: 5, c: '$shirt' },
    { x: 11, y: 11, w: 2, h: 5, c: '$shirt' },
    { x: -1, y: 15, w: 2, h: 1, c: '$skin' },
    { x: 11, y: 15, w: 2, h: 1, c: '$skin' },
  ]},
  up: { name: 'torso', pixels: [
    { x: 1, y: 10, w: 10, h: 6, c: '$shirt' },
    { x: 1, y: 10, w: 1, h: 5, c: 'darken($shirt, 25)', a: 0.25 },
    { x: 10, y: 10, w: 1, h: 5, c: 'darken($shirt, 25)', a: 0.25 },
    { x: 5, y: 10, w: 2, h: 3, c: 'darken($shirt, 10)', a: 0.15 },
    { x: -1, y: 11, w: 2, h: 5, c: '$shirt' },
    { x: 11, y: 11, w: 2, h: 5, c: '$shirt' },
    { x: -1, y: 15, w: 2, h: 1, c: '$skin' },
    { x: 11, y: 15, w: 2, h: 1, c: '$skin' },
  ]},
  left: { name: 'torso', pixels: [
    { x: 1, y: 10, w: 9, h: 6, c: '$shirt' },
    { x: 2, y: 10, w: 7, h: 1, c: 'lighten($shirt, 18)', a: 0.3 },
    { x: 1, y: 10, w: 1, h: 5, c: 'darken($shirt, 25)', a: 0.25 },
    { x: -1, y: 11, w: 3, h: 5, c: '$shirt' },
    { x: -1, y: 15, w: 3, h: 1, c: '$skin' },
  ]},
});

// Suit — formal jacket with collar (4-direction)
registerOutfitStyle('suit', 'Suit', {
  down: { name: 'torso', pixels: [
    { x: 1, y: 10, w: 10, h: 6, c: '$shirt' },
    { x: 2, y: 10, w: 8, h: 1, c: 'lighten($shirt, 12)', a: 0.3 },
    { x: 1, y: 10, w: 1, h: 5, c: 'darken($shirt, 30)', a: 0.3 },
    { x: 10, y: 10, w: 1, h: 5, c: 'darken($shirt, 30)', a: 0.3 },
    { x: 2, y: 10, w: 3, h: 3, c: 'darken($shirt, 20)', a: 0.3 },
    { x: 7, y: 10, w: 3, h: 3, c: 'darken($shirt, 20)', a: 0.3 },
    { x: 5, y: 10, w: 2, h: 5, c: '#E8E8E8', a: 0.5 },
    { x: -1, y: 11, w: 2, h: 5, c: '$shirt' },
    { x: 11, y: 11, w: 2, h: 5, c: '$shirt' },
    { x: -1, y: 11, w: 2, h: 1, c: 'darken($shirt, 20)', a: 0.2 },
    { x: 11, y: 11, w: 2, h: 1, c: 'darken($shirt, 20)', a: 0.2 },
    { x: -1, y: 15, w: 2, h: 1, c: '$skin' },
    { x: 11, y: 15, w: 2, h: 1, c: '$skin' },
  ]},
  up: { name: 'torso', pixels: [
    { x: 1, y: 10, w: 10, h: 6, c: '$shirt' },
    { x: 1, y: 10, w: 1, h: 5, c: 'darken($shirt, 30)', a: 0.3 },
    { x: 10, y: 10, w: 1, h: 5, c: 'darken($shirt, 30)', a: 0.3 },
    // Back vent
    { x: 5, y: 12, w: 2, h: 4, c: 'darken($shirt, 10)', a: 0.15 },
    { x: -1, y: 11, w: 2, h: 5, c: '$shirt' },
    { x: 11, y: 11, w: 2, h: 5, c: '$shirt' },
    { x: -1, y: 15, w: 2, h: 1, c: '$skin' },
    { x: 11, y: 15, w: 2, h: 1, c: '$skin' },
  ]},
  left: { name: 'torso', pixels: [
    { x: 1, y: 10, w: 9, h: 6, c: '$shirt' },
    { x: 1, y: 10, w: 1, h: 5, c: 'darken($shirt, 30)', a: 0.3 },
    { x: 2, y: 10, w: 3, h: 3, c: 'darken($shirt, 20)', a: 0.3 },
    { x: -1, y: 11, w: 3, h: 5, c: '$shirt' },
    { x: -1, y: 11, w: 3, h: 1, c: 'darken($shirt, 20)', a: 0.2 },
    { x: -1, y: 15, w: 3, h: 1, c: '$skin' },
  ]},
});

// Hoodie — casual with hood outline (4-direction)
registerOutfitStyle('hoodie', 'Hoodie', {
  down: { name: 'torso', pixels: [
    { x: 0, y: 10, w: 12, h: 6, c: '$shirt' },
    { x: 1, y: 10, w: 10, h: 1, c: 'lighten($shirt, 15)', a: 0.25 },
    { x: 0, y: 10, w: 1, h: 5, c: 'darken($shirt, 25)', a: 0.3 },
    { x: 11, y: 10, w: 1, h: 5, c: 'darken($shirt, 25)', a: 0.3 },
    { x: 2, y: 8, w: 8, h: 2, c: '$shirt', a: 0.4 },
    { x: 3, y: 13, w: 6, h: 2, c: 'darken($shirt, 15)', a: 0.2 },
    { x: 5, y: 10, w: 1, h: 2, c: '#DDD', a: 0.3 },
    { x: 6, y: 10, w: 1, h: 2, c: '#DDD', a: 0.3 },
    { x: -1, y: 11, w: 2, h: 5, c: '$shirt' },
    { x: 11, y: 11, w: 2, h: 5, c: '$shirt' },
    { x: -1, y: 15, w: 2, h: 1, c: '$skin' },
    { x: 11, y: 15, w: 2, h: 1, c: '$skin' },
  ]},
  up: { name: 'torso', pixels: [
    { x: 0, y: 10, w: 12, h: 6, c: '$shirt' },
    { x: 0, y: 10, w: 1, h: 5, c: 'darken($shirt, 25)', a: 0.3 },
    { x: 11, y: 10, w: 1, h: 5, c: 'darken($shirt, 25)', a: 0.3 },
    // Hood visible from back
    { x: 2, y: 7, w: 8, h: 3, c: '$shirt', a: 0.5 },
    { x: 3, y: 7, w: 6, h: 1, c: 'darken($shirt, 10)', a: 0.3 },
    { x: -1, y: 11, w: 2, h: 5, c: '$shirt' },
    { x: 11, y: 11, w: 2, h: 5, c: '$shirt' },
    { x: -1, y: 15, w: 2, h: 1, c: '$skin' },
    { x: 11, y: 15, w: 2, h: 1, c: '$skin' },
  ]},
  left: { name: 'torso', pixels: [
    { x: 0, y: 10, w: 10, h: 6, c: '$shirt' },
    { x: 1, y: 10, w: 8, h: 1, c: 'lighten($shirt, 15)', a: 0.25 },
    { x: 0, y: 10, w: 1, h: 5, c: 'darken($shirt, 25)', a: 0.3 },
    { x: 2, y: 8, w: 6, h: 2, c: '$shirt', a: 0.4 },
    { x: -1, y: 11, w: 3, h: 5, c: '$shirt' },
    { x: -1, y: 15, w: 3, h: 1, c: '$skin' },
  ]},
});

// Vest — sleeveless with visible arms (4-direction)
registerOutfitStyle('vest', 'Vest', {
  down: { name: 'torso', pixels: [
    { x: 1, y: 10, w: 10, h: 6, c: '$shirt' },
    { x: 2, y: 10, w: 8, h: 1, c: 'lighten($shirt, 18)', a: 0.3 },
    { x: 1, y: 10, w: 1, h: 5, c: 'darken($shirt, 25)', a: 0.25 },
    { x: 10, y: 10, w: 1, h: 5, c: 'darken($shirt, 25)', a: 0.25 },
    { x: 5, y: 10, w: 2, h: 2, c: '$skin', a: 0.6 },
    { x: -1, y: 11, w: 2, h: 5, c: '$skin' },
    { x: 11, y: 11, w: 2, h: 5, c: '$skin' },
    { x: -1, y: 15, w: 2, h: 1, c: 'darken($skin, 10)' },
    { x: 11, y: 15, w: 2, h: 1, c: 'darken($skin, 10)' },
  ]},
  up: { name: 'torso', pixels: [
    { x: 1, y: 10, w: 10, h: 6, c: '$shirt' },
    { x: 1, y: 10, w: 1, h: 5, c: 'darken($shirt, 25)', a: 0.25 },
    { x: 10, y: 10, w: 1, h: 5, c: 'darken($shirt, 25)', a: 0.25 },
    { x: -1, y: 11, w: 2, h: 5, c: '$skin' },
    { x: 11, y: 11, w: 2, h: 5, c: '$skin' },
    { x: -1, y: 15, w: 2, h: 1, c: 'darken($skin, 10)' },
    { x: 11, y: 15, w: 2, h: 1, c: 'darken($skin, 10)' },
  ]},
  left: { name: 'torso', pixels: [
    { x: 1, y: 10, w: 9, h: 6, c: '$shirt' },
    { x: 1, y: 10, w: 1, h: 5, c: 'darken($shirt, 25)', a: 0.25 },
    { x: -1, y: 11, w: 3, h: 5, c: '$skin' },
    { x: -1, y: 15, w: 3, h: 1, c: 'darken($skin, 10)' },
  ]},
});

// Tank top — minimal coverage (4-direction)
registerOutfitStyle('tank', 'Tank Top', {
  down: { name: 'torso', pixels: [
    { x: 2, y: 10, w: 8, h: 6, c: '$shirt' },
    { x: 3, y: 10, w: 6, h: 1, c: 'lighten($shirt, 18)', a: 0.3 },
    { x: 2, y: 10, w: 1, h: 5, c: 'darken($shirt, 25)', a: 0.25 },
    { x: 9, y: 10, w: 1, h: 5, c: 'darken($shirt, 25)', a: 0.25 },
    { x: 0, y: 10, w: 2, h: 2, c: '$skin' },
    { x: 10, y: 10, w: 2, h: 2, c: '$skin' },
    { x: -1, y: 11, w: 2, h: 5, c: '$skin' },
    { x: 11, y: 11, w: 2, h: 5, c: '$skin' },
    { x: -1, y: 15, w: 2, h: 1, c: 'darken($skin, 10)' },
    { x: 11, y: 15, w: 2, h: 1, c: 'darken($skin, 10)' },
  ]},
  up: { name: 'torso', pixels: [
    { x: 2, y: 10, w: 8, h: 6, c: '$shirt' },
    { x: 2, y: 10, w: 1, h: 5, c: 'darken($shirt, 25)', a: 0.25 },
    { x: 9, y: 10, w: 1, h: 5, c: 'darken($shirt, 25)', a: 0.25 },
    { x: 0, y: 10, w: 2, h: 2, c: '$skin' },
    { x: 10, y: 10, w: 2, h: 2, c: '$skin' },
    { x: -1, y: 11, w: 2, h: 5, c: '$skin' },
    { x: 11, y: 11, w: 2, h: 5, c: '$skin' },
    { x: -1, y: 15, w: 2, h: 1, c: 'darken($skin, 10)' },
    { x: 11, y: 15, w: 2, h: 1, c: 'darken($skin, 10)' },
  ]},
  left: { name: 'torso', pixels: [
    { x: 2, y: 10, w: 7, h: 6, c: '$shirt' },
    { x: 2, y: 10, w: 1, h: 5, c: 'darken($shirt, 25)', a: 0.25 },
    { x: 0, y: 10, w: 2, h: 2, c: '$skin' },
    { x: -1, y: 11, w: 3, h: 5, c: '$skin' },
    { x: -1, y: 15, w: 3, h: 1, c: 'darken($skin, 10)' },
  ]},
});

// Polo — collar detail (4-direction)
registerOutfitStyle('polo', 'Polo', {
  down: { name: 'torso', pixels: [
    { x: 1, y: 10, w: 10, h: 6, c: '$shirt' },
    { x: 2, y: 10, w: 8, h: 1, c: 'lighten($shirt, 18)', a: 0.3 },
    { x: 1, y: 10, w: 1, h: 5, c: 'darken($shirt, 25)', a: 0.25 },
    { x: 10, y: 10, w: 1, h: 5, c: 'darken($shirt, 25)', a: 0.25 },
    { x: 3, y: 9, w: 6, h: 2, c: 'lighten($shirt, 25)', a: 0.5 },
    { x: 5, y: 9, w: 2, h: 1, c: '$skin', a: 0.4 },
    { x: 5, y: 10, w: 2, h: 3, c: 'darken($shirt, 15)', a: 0.15 },
    { x: -1, y: 11, w: 2, h: 5, c: '$shirt' },
    { x: 11, y: 11, w: 2, h: 5, c: '$shirt' },
    { x: -1, y: 15, w: 2, h: 1, c: '$skin' },
    { x: 11, y: 15, w: 2, h: 1, c: '$skin' },
  ]},
  up: { name: 'torso', pixels: [
    { x: 1, y: 10, w: 10, h: 6, c: '$shirt' },
    { x: 1, y: 10, w: 1, h: 5, c: 'darken($shirt, 25)', a: 0.25 },
    { x: 10, y: 10, w: 1, h: 5, c: 'darken($shirt, 25)', a: 0.25 },
    // Collar from back
    { x: 3, y: 9, w: 6, h: 1, c: 'lighten($shirt, 25)', a: 0.5 },
    { x: -1, y: 11, w: 2, h: 5, c: '$shirt' },
    { x: 11, y: 11, w: 2, h: 5, c: '$shirt' },
    { x: -1, y: 15, w: 2, h: 1, c: '$skin' },
    { x: 11, y: 15, w: 2, h: 1, c: '$skin' },
  ]},
  left: { name: 'torso', pixels: [
    { x: 1, y: 10, w: 9, h: 6, c: '$shirt' },
    { x: 1, y: 10, w: 1, h: 5, c: 'darken($shirt, 25)', a: 0.25 },
    { x: 3, y: 9, w: 4, h: 2, c: 'lighten($shirt, 25)', a: 0.5 },
    { x: -1, y: 11, w: 3, h: 5, c: '$shirt' },
    { x: -1, y: 15, w: 3, h: 1, c: '$skin' },
  ]},
});

// Lab Coat — white coat over shirt (4-direction)
registerOutfitStyle('labcoat', 'Lab Coat', {
  down: { name: 'torso', pixels: [
    { x: 4, y: 10, w: 4, h: 5, c: '$shirt' },
    { x: 0, y: 10, w: 4, h: 7, c: '#F0F0F0' },
    { x: 8, y: 10, w: 4, h: 7, c: '#F0F0F0' },
    { x: 1, y: 10, w: 10, h: 1, c: '#FAFAFA' },
    { x: 0, y: 10, w: 1, h: 7, c: '#DDD', a: 0.5 },
    { x: 11, y: 10, w: 1, h: 7, c: '#DDD', a: 0.5 },
    { x: 1, y: 13, w: 2, h: 2, c: '#E0E0E0', a: 0.4 },
    { x: 9, y: 13, w: 2, h: 2, c: '#E0E0E0', a: 0.4 },
    { x: -1, y: 11, w: 2, h: 5, c: '#F0F0F0' },
    { x: 11, y: 11, w: 2, h: 5, c: '#F0F0F0' },
    { x: -1, y: 15, w: 2, h: 1, c: '$skin' },
    { x: 11, y: 15, w: 2, h: 1, c: '$skin' },
  ]},
  up: { name: 'torso', pixels: [
    { x: 0, y: 10, w: 12, h: 7, c: '#F0F0F0' },
    { x: 0, y: 10, w: 1, h: 7, c: '#DDD', a: 0.5 },
    { x: 11, y: 10, w: 1, h: 7, c: '#DDD', a: 0.5 },
    // Back seam
    { x: 5, y: 11, w: 2, h: 5, c: '#E8E8E8', a: 0.3 },
    { x: -1, y: 11, w: 2, h: 5, c: '#F0F0F0' },
    { x: 11, y: 11, w: 2, h: 5, c: '#F0F0F0' },
    { x: -1, y: 15, w: 2, h: 1, c: '$skin' },
    { x: 11, y: 15, w: 2, h: 1, c: '$skin' },
  ]},
  left: { name: 'torso', pixels: [
    { x: 3, y: 10, w: 3, h: 5, c: '$shirt' },
    { x: 0, y: 10, w: 3, h: 7, c: '#F0F0F0' },
    { x: 6, y: 10, w: 4, h: 7, c: '#F0F0F0' },
    { x: 1, y: 10, w: 8, h: 1, c: '#FAFAFA' },
    { x: 0, y: 10, w: 1, h: 7, c: '#DDD', a: 0.5 },
    { x: 1, y: 13, w: 2, h: 2, c: '#E0E0E0', a: 0.4 },
    { x: -1, y: 11, w: 3, h: 5, c: '#F0F0F0' },
    { x: -1, y: 15, w: 3, h: 1, c: '$skin' },
  ]},
});

// Overalls — denim work outfit (4-direction)
registerOutfitStyle('overalls', 'Overalls', {
  down: { name: 'torso', pixels: [
    { x: 1, y: 10, w: 10, h: 3, c: '$shirt' },
    { x: 2, y: 10, w: 8, h: 1, c: 'lighten($shirt, 18)', a: 0.3 },
    { x: 3, y: 11, w: 6, h: 5, c: '#3D6B99' },
    { x: 3, y: 10, w: 2, h: 1, c: '#3D6B99' },
    { x: 7, y: 10, w: 2, h: 1, c: '#3D6B99' },
    { x: 3, y: 11, w: 1, h: 1, c: '#FFD700', a: 0.6 },
    { x: 8, y: 11, w: 1, h: 1, c: '#FFD700', a: 0.6 },
    { x: 1, y: 13, w: 2, h: 3, c: '#3D6B99' },
    { x: 9, y: 13, w: 2, h: 3, c: '#3D6B99' },
    { x: 5, y: 13, w: 2, h: 2, c: '#345E87', a: 0.4 },
    { x: -1, y: 11, w: 2, h: 5, c: '$shirt' },
    { x: 11, y: 11, w: 2, h: 5, c: '$shirt' },
    { x: -1, y: 15, w: 2, h: 1, c: '$skin' },
    { x: 11, y: 15, w: 2, h: 1, c: '$skin' },
  ]},
  up: { name: 'torso', pixels: [
    { x: 1, y: 10, w: 10, h: 3, c: '$shirt' },
    // Back of overalls — cross straps
    { x: 3, y: 10, w: 2, h: 1, c: '#3D6B99' },
    { x: 7, y: 10, w: 2, h: 1, c: '#3D6B99' },
    { x: 1, y: 13, w: 10, h: 3, c: '#3D6B99' },
    { x: -1, y: 11, w: 2, h: 5, c: '$shirt' },
    { x: 11, y: 11, w: 2, h: 5, c: '$shirt' },
    { x: -1, y: 15, w: 2, h: 1, c: '$skin' },
    { x: 11, y: 15, w: 2, h: 1, c: '$skin' },
  ]},
  left: { name: 'torso', pixels: [
    { x: 1, y: 10, w: 9, h: 3, c: '$shirt' },
    { x: 3, y: 11, w: 5, h: 5, c: '#3D6B99' },
    { x: 3, y: 10, w: 2, h: 1, c: '#3D6B99' },
    { x: 3, y: 11, w: 1, h: 1, c: '#FFD700', a: 0.6 },
    { x: 1, y: 13, w: 2, h: 3, c: '#3D6B99' },
    { x: -1, y: 11, w: 3, h: 5, c: '$shirt' },
    { x: -1, y: 15, w: 3, h: 1, c: '$skin' },
  ]},
});

// Turtleneck — high collar (4-direction)
registerOutfitStyle('turtleneck', 'Turtleneck', {
  down: { name: 'torso', pixels: [
    { x: 1, y: 10, w: 10, h: 6, c: '$shirt' },
    { x: 1, y: 10, w: 1, h: 5, c: 'darken($shirt, 25)', a: 0.25 },
    { x: 10, y: 10, w: 1, h: 5, c: 'darken($shirt, 25)', a: 0.25 },
    { x: 3, y: 8, w: 6, h: 2, c: '$shirt' },
    { x: 4, y: 8, w: 4, h: 1, c: 'lighten($shirt, 12)', a: 0.3 },
    { x: 3, y: 9, w: 1, h: 1, c: 'darken($shirt, 15)', a: 0.2 },
    { x: 8, y: 9, w: 1, h: 1, c: 'darken($shirt, 15)', a: 0.2 },
    { x: -1, y: 11, w: 2, h: 5, c: '$shirt' },
    { x: 11, y: 11, w: 2, h: 5, c: '$shirt' },
    { x: -1, y: 15, w: 2, h: 1, c: '$skin' },
    { x: 11, y: 15, w: 2, h: 1, c: '$skin' },
  ]},
  up: { name: 'torso', pixels: [
    { x: 1, y: 10, w: 10, h: 6, c: '$shirt' },
    { x: 1, y: 10, w: 1, h: 5, c: 'darken($shirt, 25)', a: 0.25 },
    { x: 10, y: 10, w: 1, h: 5, c: 'darken($shirt, 25)', a: 0.25 },
    { x: 3, y: 8, w: 6, h: 2, c: '$shirt' },
    { x: 4, y: 8, w: 4, h: 1, c: 'lighten($shirt, 12)', a: 0.3 },
    { x: -1, y: 11, w: 2, h: 5, c: '$shirt' },
    { x: 11, y: 11, w: 2, h: 5, c: '$shirt' },
    { x: -1, y: 15, w: 2, h: 1, c: '$skin' },
    { x: 11, y: 15, w: 2, h: 1, c: '$skin' },
  ]},
  left: { name: 'torso', pixels: [
    { x: 1, y: 10, w: 9, h: 6, c: '$shirt' },
    { x: 1, y: 10, w: 1, h: 5, c: 'darken($shirt, 25)', a: 0.25 },
    { x: 3, y: 8, w: 4, h: 2, c: '$shirt' },
    { x: 3, y: 8, w: 3, h: 1, c: 'lighten($shirt, 12)', a: 0.3 },
    { x: -1, y: 11, w: 3, h: 5, c: '$shirt' },
    { x: -1, y: 15, w: 3, h: 1, c: '$skin' },
  ]},
});

// Kimono / Robe — wrap style (4-direction)
registerOutfitStyle('robe', 'Robe', {
  down: { name: 'torso', pixels: [
    { x: 0, y: 10, w: 12, h: 7, c: '$shirt' },
    { x: 0, y: 10, w: 1, h: 6, c: 'darken($shirt, 25)', a: 0.3 },
    { x: 11, y: 10, w: 1, h: 6, c: 'darken($shirt, 25)', a: 0.3 },
    { x: 3, y: 10, w: 3, h: 4, c: 'lighten($shirt, 15)', a: 0.25 },
    { x: 6, y: 10, w: 3, h: 4, c: 'darken($shirt, 10)', a: 0.2 },
    { x: 1, y: 14, w: 10, h: 1, c: 'darken($shirt, 35)' },
    { x: 2, y: 14, w: 8, h: 1, c: 'darken($shirt, 25)', a: 0.4 },
    { x: -2, y: 11, w: 3, h: 5, c: '$shirt' },
    { x: 11, y: 11, w: 3, h: 5, c: '$shirt' },
    { x: -2, y: 15, w: 3, h: 1, c: 'darken($shirt, 15)', a: 0.3 },
    { x: 11, y: 15, w: 3, h: 1, c: 'darken($shirt, 15)', a: 0.3 },
    { x: -1, y: 15, w: 2, h: 1, c: '$skin' },
    { x: 11, y: 15, w: 2, h: 1, c: '$skin' },
  ]},
  up: { name: 'torso', pixels: [
    { x: 0, y: 10, w: 12, h: 7, c: '$shirt' },
    { x: 0, y: 10, w: 1, h: 6, c: 'darken($shirt, 25)', a: 0.3 },
    { x: 11, y: 10, w: 1, h: 6, c: 'darken($shirt, 25)', a: 0.3 },
    { x: 1, y: 14, w: 10, h: 1, c: 'darken($shirt, 35)' },
    { x: -2, y: 11, w: 3, h: 5, c: '$shirt' },
    { x: 11, y: 11, w: 3, h: 5, c: '$shirt' },
    { x: -2, y: 15, w: 3, h: 1, c: 'darken($shirt, 15)', a: 0.3 },
    { x: 11, y: 15, w: 3, h: 1, c: 'darken($shirt, 15)', a: 0.3 },
    { x: -1, y: 15, w: 2, h: 1, c: '$skin' },
    { x: 11, y: 15, w: 2, h: 1, c: '$skin' },
  ]},
  left: { name: 'torso', pixels: [
    { x: 0, y: 10, w: 10, h: 7, c: '$shirt' },
    { x: 0, y: 10, w: 1, h: 6, c: 'darken($shirt, 25)', a: 0.3 },
    { x: 1, y: 14, w: 8, h: 1, c: 'darken($shirt, 35)' },
    { x: -2, y: 11, w: 4, h: 5, c: '$shirt' },
    { x: -2, y: 15, w: 4, h: 1, c: 'darken($shirt, 15)', a: 0.3 },
    { x: -1, y: 15, w: 2, h: 1, c: '$skin' },
  ]},
});

/* ── Outfit Unlock Levels & Costs ──────── */

export const OUTFIT_UNLOCK_LEVELS: Record<string, number> = {
  'tshirt': 1, 'polo': 1,
  'hoodie': 2, 'vest': 2,
  'suit': 3, 'tank': 3,
  'overalls': 4, 'turtleneck': 4,
  'labcoat': 5, 'robe': 5,
};

export const OUTFIT_COSTS: Record<string, number> = {
  'tshirt': 0, 'polo': 0,
  'hoodie': 500, 'vest': 500,
  'suit': 3000, 'tank': 1000,
  'overalls': 5000, 'turtleneck': 5000,
  'labcoat': 10000, 'robe': 10000,
};

/** Get the required level to unlock an outfit (default 1) */
export function getOutfitRequiredLevel(id: string): number {
  return OUTFIT_UNLOCK_LEVELS[id] ?? 1;
}

/** Check if an outfit is unlocked at the given level */
export function isOutfitUnlocked(id: string, level: number): boolean {
  return level >= getOutfitRequiredLevel(id);
}

/** Get the coin cost for an outfit (default 0) */
export function getOutfitCost(id: string): number {
  return OUTFIT_COSTS[id] ?? 0;
}
