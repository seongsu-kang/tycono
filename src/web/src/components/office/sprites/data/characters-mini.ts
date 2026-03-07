/* =========================================================
   MINI CHARACTER BLUEPRINTS — 12x22 logical pixels (P=1)
   For TopDown office view + card view.
   Uses TyconoForge color token system ($skin, $hair, etc.).
   ========================================================= */

import type { CharacterBlueprint, Pixel } from '../engine/blueprint';
import { registerCharacter } from '../engine/blueprint';

/* ─── Shared base layers ────────────────────────── */

/** Full standing character: head + body + arms + legs + shoes */
const BASE_BODY: Pixel[] = [
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

const BASE_HAIR: Pixel[] = [
  { x: 1, y: 0, w: 10, h: 3, c: '$hair' },
  { x: 0, y: 1, w: 2, h: 3, c: '$hair' },
  { x: 10, y: 1, w: 2, h: 3, c: '$hair' },
  { x: 2, y: 0, w: 8, h: 1, c: 'lighten($hair, 25)', a: 0.3 },
  { x: 2, y: 2, w: 8, h: 1, c: 'darken($hair, 20)', a: 0.2 },
];

/* ─── Role-specific accessory layers ──────────── */

const CTO_ACC: Pixel[] = [
  // Glasses
  { x: 2, y: 4, w: 3, h: 2, c: '#2A3A50', a: 0.5 },
  { x: 7, y: 4, w: 3, h: 2, c: '#2A3A50', a: 0.5 },
  { x: 5, y: 4, w: 2, h: 1, c: '#2A3A50', a: 0.3 },
];

const CBO_ACC: Pixel[] = [
  // Suit lapels
  { x: 1, y: 10, w: 3, h: 2, c: '#1A1A2E', a: 0.4 },
  { x: 8, y: 10, w: 3, h: 2, c: '#1A1A2E', a: 0.4 },
];

const PM_ACC: Pixel[] = [
  // Blush
  { x: 2, y: 6, w: 1, h: 1, c: '#FFCDD2', a: 0.3 },
  { x: 9, y: 6, w: 1, h: 1, c: '#FFCDD2', a: 0.3 },
];

const ENGINEER_ACC: Pixel[] = [
  // Headband
  { x: 0, y: 0, w: 12, h: 1, c: '#333', a: 0.7 },
  // Headphone cups
  { x: -1, y: 1, w: 2, h: 5, c: '#444' },
  { x: 11, y: 1, w: 2, h: 5, c: '#444' },
  { x: -1, y: 2, w: 2, h: 3, c: '#555', a: 0.3 },
  { x: 11, y: 2, w: 2, h: 3, c: '#555', a: 0.3 },
];

const DESIGNER_ACC: Pixel[] = [
  // Long hair sides
  { x: 0, y: 3, w: 2, h: 5, c: '$hair' },
  { x: 10, y: 3, w: 2, h: 5, c: '$hair' },
  // Beret
  { x: 3, y: -1, w: 6, h: 2, c: '#E91E63' },
];

const QA_ACC: Pixel[] = [
  // Badge
  { x: 2, y: 9, w: 2, h: 1, c: '#FFF', a: 0.3 },
];

/* ─── Blueprint assembly ─────────────────────── */

function makeMini(roleAccessory: Pixel[] = []): CharacterBlueprint {
  return {
    width: 12,
    height: 22,
    layers: [
      { name: 'body', pixels: BASE_BODY },
      { name: 'head', pixels: BASE_HEAD },
      { name: 'hair', pixels: BASE_HAIR },
      { name: 'accessory', pixels: roleAccessory },
    ],
  };
}

/* ─── Registration ───────────────────────────── */

registerCharacter('mini:cto', makeMini(CTO_ACC));
registerCharacter('mini:cbo', makeMini(CBO_ACC));
registerCharacter('mini:pm', makeMini(PM_ACC));
registerCharacter('mini:engineer', makeMini(ENGINEER_ACC));
registerCharacter('mini:designer', makeMini(DESIGNER_ACC));
registerCharacter('mini:qa', makeMini(QA_ACC));
registerCharacter('mini:data-analyst', makeMini([]));
registerCharacter('mini:default', makeMini([]));
