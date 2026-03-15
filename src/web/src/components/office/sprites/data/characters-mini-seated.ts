/* =========================================================
   MINI SEATED CHARACTER BLUEPRINTS — 12x22 logical pixels
   For TopDown office view (characters sitting at desks).
   No legs/shoes visible; longer shirt body.

   Layers: torso → head → hair → accessory
   (no 'lower' layer — seated hides legs/shoes)
   ========================================================= */

import type { Pixel } from 'tyconoforge';
import { registerCharacter } from 'tyconoforge';

/* ─── Seated torso (shirt covering legs + arms) ────── */

const SEATED_TORSO: Pixel[] = [
  // Shirt body (longer, covering legs)
  { x: 1, y: 10, w: 10, h: 8, c: '$shirt' },
  { x: 2, y: 10, w: 8, h: 1, c: 'lighten($shirt, 18)', a: 0.3 },
  { x: 1, y: 10, w: 1, h: 7, c: 'darken($shirt, 25)', a: 0.25 },
  { x: 10, y: 10, w: 1, h: 7, c: 'darken($shirt, 25)', a: 0.25 },
  { x: 4, y: 10, w: 4, h: 2, c: 'darken($shirt, 25)', a: 0.2 },
  // Arms
  { x: -1, y: 11, w: 2, h: 5, c: '$shirt' },
  { x: 11, y: 11, w: 2, h: 5, c: '$shirt' },
];

/* ─── Head ──────────────────────────────────────────── */

const SEATED_HEAD: Pixel[] = [
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

/* ─── Default hair ──────────────────────────────────── */

const SEATED_HAIR: Pixel[] = [
  { x: 1, y: 0, w: 10, h: 3, c: '$hair' },
  { x: 0, y: 1, w: 2, h: 3, c: '$hair' },
  { x: 10, y: 1, w: 2, h: 3, c: '$hair' },
  { x: 2, y: 0, w: 8, h: 1, c: 'lighten($hair, 25)', a: 0.3 },
  { x: 2, y: 2, w: 8, h: 1, c: 'darken($hair, 20)', a: 0.2 },
];

/* ─── Registration ───────────────────────────── */

function makeSeated() {
  return {
    width: 12,
    height: 22,
    layers: [
      { name: 'torso', pixels: SEATED_TORSO },
      { name: 'head', pixels: SEATED_HEAD },
      { name: 'hair', pixels: SEATED_HAIR },
      { name: 'accessory', pixels: [] },
    ],
  };
}

registerCharacter('mini-seated:default', makeSeated());
