/* =========================================================
   MINI CHARACTER BLUEPRINTS — 12x22 logical pixels (P=1)
   For TopDown office view + card view.
   Uses TyconoForge color token system ($skin, $hair, etc.).

   Layers (bottom to top): lower → torso → head → hair → accessory
   - lower: shadow + legs + shoes (not swappable)
   - torso: shirt + arms + hands (swappable via outfitStyle)
   - head: face + ears + neck (not swappable)
   - hair: swappable via hairStyle
   - accessory: swappable via accessory
   ========================================================= */

import type { CharacterBlueprint, Pixel } from 'tyconoforge';
import { registerCharacter } from 'tyconoforge';

/* ─── Lower body (shadow + legs + shoes) ───────────── */

const BASE_LOWER: Pixel[] = [
  // Shadow
  { x: 1, y: 19, w: 10, h: 2, c: '#100A06', a: 0.15 },
  // Legs
  { x: 2, y: 15, w: 3, h: 4, c: '$pants' },
  { x: 7, y: 15, w: 3, h: 4, c: '$pants' },
  // Shoes
  { x: 2, y: 19, w: 3, h: 2, c: '$shoes' },
  { x: 7, y: 19, w: 3, h: 2, c: '$shoes' },
  { x: 2, y: 19, w: 3, h: 1, c: 'lighten($shoes, 20)', a: 0.4 },
  { x: 7, y: 19, w: 3, h: 1, c: 'lighten($shoes, 20)', a: 0.4 },
];

/* ─── Torso (shirt + arms + hands) — default t-shirt ── */

const BASE_TORSO: Pixel[] = [
  // Shirt body
  { x: 1, y: 10, w: 10, h: 6, c: '$shirt' },
  { x: 2, y: 10, w: 8, h: 1, c: 'lighten($shirt, 18)', a: 0.3 },
  { x: 1, y: 10, w: 1, h: 5, c: 'darken($shirt, 25)', a: 0.25 },
  { x: 10, y: 10, w: 1, h: 5, c: 'darken($shirt, 25)', a: 0.25 },
  { x: 4, y: 10, w: 4, h: 2, c: 'darken($shirt, 25)', a: 0.2 },
  // Arms
  { x: -1, y: 11, w: 2, h: 5, c: '$shirt' },
  { x: 11, y: 11, w: 2, h: 5, c: '$shirt' },
  // Hands
  { x: -1, y: 15, w: 2, h: 1, c: '$skin' },
  { x: 11, y: 15, w: 2, h: 1, c: '$skin' },
];

/* ─── Head (face + ears + neck) ────────────────────── */

const BASE_HEAD: Pixel[] = [
  // Neck
  { x: 4, y: 8, w: 4, h: 3, c: '$skin' },
  // Head
  { x: 1, y: 1, w: 10, h: 8, c: '$skin' },
  // Eyes
  { x: 3, y: 4, w: 2, h: 2, c: '#1A1A2E' },
  { x: 7, y: 4, w: 2, h: 2, c: '#1A1A2E' },
  { x: 3, y: 4, w: 1, h: 1, c: '#FFF', a: 0.35 },
  { x: 7, y: 4, w: 1, h: 1, c: '#FFF', a: 0.35 },
  // Nose
  { x: 5, y: 7, w: 2, h: 1, c: 'darken($skin, 25)', a: 0.4 },
  // Ears
  { x: 0, y: 4, w: 1, h: 1, c: '$skin' },
  { x: 11, y: 4, w: 1, h: 1, c: '$skin' },
];

/* ─── Default hair ─────────────────────────────────── */

const BASE_HAIR: Pixel[] = [
  { x: 1, y: 0, w: 10, h: 3, c: '$hair' },
  { x: 0, y: 1, w: 2, h: 3, c: '$hair' },
  { x: 10, y: 1, w: 2, h: 3, c: '$hair' },
  { x: 2, y: 0, w: 8, h: 1, c: 'lighten($hair, 25)', a: 0.3 },
  { x: 2, y: 2, w: 8, h: 1, c: 'darken($hair, 20)', a: 0.2 },
];

/* ─── Blueprint assembly ─────────────────────── */

function makeMini(): CharacterBlueprint {
  return {
    width: 12,
    height: 22,
    layers: [
      { name: 'lower', pixels: BASE_LOWER },
      { name: 'torso', pixels: BASE_TORSO },
      { name: 'head', pixels: BASE_HEAD },
      { name: 'hair', pixels: BASE_HAIR },
      { name: 'accessory', pixels: [] },
    ],
  };
}

/* ─── Registration ───────────────────────────── */
// All roles use the same base blueprint now.
// Differentiation comes from appearance (colors + styles).

const ROLE_IDS = ['cto', 'cbo', 'pm', 'engineer', 'designer', 'qa', 'data-analyst', 'default'];
for (const id of ROLE_IDS) {
  registerCharacter(`mini:${id}`, makeMini());
}
