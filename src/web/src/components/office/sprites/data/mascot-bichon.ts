/* =========================================================
   Mascot Sprite — Bichon-Poodle Mix (비숑+푸들 믹스견)

   White fluffy dog with cotton-ball head, small body, short legs.
   4 directions × 2 walk frames = 8 animation states.

   Down/Up: ~9×10  (vertical — seen from above)
   Left/Right: ~12×8  (horizontal — side profile)
   ========================================================= */

import type { Pixel } from '../engine/blueprint';

/* ── Color Palette ── */
const W = '#FAFAF7';  // white fur
const H = '#FFFFFF';  // highlight
const C = '#EDE8E2';  // cream edge
const D = '#DDD6CC';  // shadow
const E = '#1A1A2E';  // eyes
const N = '#2A2A2A';  // nose
const K = '#FFB0B0';  // tongue

/* ══════════════════════════════════════════
   Down (front-facing) — 9×10
   ══════════════════════════════════════════ */
const downBody: Pixel[] = [
  // Head fluff top
  { x: 2, y: 0, w: 1, h: 1, c: C }, { x: 3, y: 0, w: 1, h: 1, c: W }, { x: 4, y: 0, w: 1, h: 1, c: H }, { x: 5, y: 0, w: 1, h: 1, c: W }, { x: 6, y: 0, w: 1, h: 1, c: C },
  // Head upper
  { x: 1, y: 1, w: 1, h: 1, c: D }, { x: 2, y: 1, w: 1, h: 1, c: W }, { x: 3, y: 1, w: 1, h: 1, c: H }, { x: 4, y: 1, w: 1, h: 1, c: W }, { x: 5, y: 1, w: 1, h: 1, c: H }, { x: 6, y: 1, w: 1, h: 1, c: W }, { x: 7, y: 1, w: 1, h: 1, c: D },
  // Head wide (ears)
  { x: 0, y: 2, w: 1, h: 1, c: D }, { x: 1, y: 2, w: 1, h: 1, c: C }, { x: 2, y: 2, w: 1, h: 1, c: W }, { x: 3, y: 2, w: 1, h: 1, c: W }, { x: 4, y: 2, w: 1, h: 1, c: H }, { x: 5, y: 2, w: 1, h: 1, c: W }, { x: 6, y: 2, w: 1, h: 1, c: W }, { x: 7, y: 2, w: 1, h: 1, c: C }, { x: 8, y: 2, w: 1, h: 1, c: D },
  // Eyes
  { x: 1, y: 3, w: 1, h: 1, c: C }, { x: 2, y: 3, w: 1, h: 1, c: W }, { x: 3, y: 3, w: 1, h: 1, c: E }, { x: 4, y: 3, w: 1, h: 1, c: W }, { x: 5, y: 3, w: 1, h: 1, c: E }, { x: 6, y: 3, w: 1, h: 1, c: W }, { x: 7, y: 3, w: 1, h: 1, c: C },
  // Nose
  { x: 2, y: 4, w: 1, h: 1, c: C }, { x: 3, y: 4, w: 1, h: 1, c: W }, { x: 4, y: 4, w: 1, h: 1, c: N }, { x: 5, y: 4, w: 1, h: 1, c: W }, { x: 6, y: 4, w: 1, h: 1, c: C },
  // Chin
  { x: 3, y: 5, w: 1, h: 1, c: D }, { x: 4, y: 5, w: 1, h: 1, c: C }, { x: 5, y: 5, w: 1, h: 1, c: D },
  // Body
  { x: 2, y: 6, w: 1, h: 1, c: C }, { x: 3, y: 6, w: 1, h: 1, c: W }, { x: 4, y: 6, w: 1, h: 1, c: H }, { x: 5, y: 6, w: 1, h: 1, c: W }, { x: 6, y: 6, w: 1, h: 1, c: C },
  { x: 2, y: 7, w: 1, h: 1, c: D }, { x: 3, y: 7, w: 1, h: 1, c: C }, { x: 4, y: 7, w: 1, h: 1, c: W }, { x: 5, y: 7, w: 1, h: 1, c: C }, { x: 6, y: 7, w: 1, h: 1, c: D },
];
const downLegsA: Pixel[] = [
  { x: 3, y: 8, w: 1, h: 1, c: C }, { x: 5, y: 8, w: 1, h: 1, c: C },
  { x: 3, y: 9, w: 1, h: 1, c: D }, { x: 5, y: 9, w: 1, h: 1, c: D },
];
const downLegsB: Pixel[] = [
  { x: 2, y: 8, w: 1, h: 1, c: C }, { x: 6, y: 8, w: 1, h: 1, c: C },
  { x: 2, y: 9, w: 1, h: 1, c: D }, { x: 6, y: 9, w: 1, h: 1, c: D },
];

/* ══════════════════════════════════════════
   Up (back-facing) — 9×10
   ══════════════════════════════════════════ */
const upBody: Pixel[] = [
  // Head fluff top
  { x: 2, y: 0, w: 1, h: 1, c: C }, { x: 3, y: 0, w: 1, h: 1, c: W }, { x: 4, y: 0, w: 1, h: 1, c: H }, { x: 5, y: 0, w: 1, h: 1, c: W }, { x: 6, y: 0, w: 1, h: 1, c: C },
  // Head
  { x: 1, y: 1, w: 1, h: 1, c: D }, { x: 2, y: 1, w: 1, h: 1, c: C }, { x: 3, y: 1, w: 1, h: 1, c: W }, { x: 4, y: 1, w: 1, h: 1, c: H }, { x: 5, y: 1, w: 1, h: 1, c: W }, { x: 6, y: 1, w: 1, h: 1, c: C }, { x: 7, y: 1, w: 1, h: 1, c: D },
  { x: 0, y: 2, w: 1, h: 1, c: D }, { x: 1, y: 2, w: 1, h: 1, c: C }, { x: 2, y: 2, w: 1, h: 1, c: W }, { x: 3, y: 2, w: 1, h: 1, c: W }, { x: 4, y: 2, w: 1, h: 1, c: W }, { x: 5, y: 2, w: 1, h: 1, c: W }, { x: 6, y: 2, w: 1, h: 1, c: W }, { x: 7, y: 2, w: 1, h: 1, c: C }, { x: 8, y: 2, w: 1, h: 1, c: D },
  { x: 1, y: 3, w: 1, h: 1, c: D }, { x: 2, y: 3, w: 1, h: 1, c: C }, { x: 3, y: 3, w: 1, h: 1, c: W }, { x: 4, y: 3, w: 1, h: 1, c: W }, { x: 5, y: 3, w: 1, h: 1, c: W }, { x: 6, y: 3, w: 1, h: 1, c: C }, { x: 7, y: 3, w: 1, h: 1, c: D },
  // Neck
  { x: 2, y: 4, w: 1, h: 1, c: D }, { x: 3, y: 4, w: 1, h: 1, c: C }, { x: 4, y: 4, w: 1, h: 1, c: W }, { x: 5, y: 4, w: 1, h: 1, c: C }, { x: 6, y: 4, w: 1, h: 1, c: D },
  // Body
  { x: 3, y: 5, w: 1, h: 1, c: D }, { x: 4, y: 5, w: 1, h: 1, c: C }, { x: 5, y: 5, w: 1, h: 1, c: D },
  { x: 2, y: 6, w: 1, h: 1, c: C }, { x: 3, y: 6, w: 1, h: 1, c: W }, { x: 4, y: 6, w: 1, h: 1, c: W }, { x: 5, y: 6, w: 1, h: 1, c: W }, { x: 6, y: 6, w: 1, h: 1, c: C },
  { x: 2, y: 7, w: 1, h: 1, c: D }, { x: 3, y: 7, w: 1, h: 1, c: C }, { x: 4, y: 7, w: 1, h: 1, c: W }, { x: 5, y: 7, w: 1, h: 1, c: C }, { x: 6, y: 7, w: 1, h: 1, c: D },
  // Tail (curving up from back)
  { x: 4, y: 5, w: 1, h: 1, c: W }, { x: 4, y: 4, w: 1, h: 1, c: H },
];
const upLegsA: Pixel[] = [
  { x: 3, y: 8, w: 1, h: 1, c: C }, { x: 5, y: 8, w: 1, h: 1, c: C },
  { x: 3, y: 9, w: 1, h: 1, c: D }, { x: 5, y: 9, w: 1, h: 1, c: D },
];
const upLegsB: Pixel[] = [
  { x: 2, y: 8, w: 1, h: 1, c: C }, { x: 6, y: 8, w: 1, h: 1, c: C },
  { x: 2, y: 9, w: 1, h: 1, c: D }, { x: 6, y: 9, w: 1, h: 1, c: D },
];

/* ══════════════════════════════════════════
   Right (side profile → heading right) — 13×7
   Horizontal layout: tail on left, head on right
   ══════════════════════════════════════════ */
const rightBody: Pixel[] = [
  //            Head fluff top
  { x: 8, y: 0, w: 1, h: 1, c: C }, { x: 9, y: 0, w: 1, h: 1, c: W }, { x: 10, y: 0, w: 1, h: 1, c: H }, { x: 11, y: 0, w: 1, h: 1, c: W },
  //            Head upper
  { x: 7, y: 1, w: 1, h: 1, c: D }, { x: 8, y: 1, w: 1, h: 1, c: W }, { x: 9, y: 1, w: 1, h: 1, c: H }, { x: 10, y: 1, w: 1, h: 1, c: W }, { x: 11, y: 1, w: 1, h: 1, c: W }, { x: 12, y: 1, w: 1, h: 1, c: C },
  //  Tail      Body                  Head wide
  { x: 0, y: 2, w: 1, h: 1, c: H }, { x: 1, y: 2, w: 1, h: 1, c: W },
  { x: 3, y: 2, w: 1, h: 1, c: C }, { x: 4, y: 2, w: 1, h: 1, c: W }, { x: 5, y: 2, w: 1, h: 1, c: W }, { x: 6, y: 2, w: 1, h: 1, c: W },
  { x: 7, y: 2, w: 1, h: 1, c: C }, { x: 8, y: 2, w: 1, h: 1, c: W }, { x: 9, y: 2, w: 1, h: 1, c: W }, { x: 10, y: 2, w: 1, h: 1, c: W }, { x: 11, y: 2, w: 1, h: 1, c: W }, { x: 12, y: 2, w: 1, h: 1, c: C },
  //  Tail      Body                  Eye row
  { x: 0, y: 3, w: 1, h: 1, c: C }, { x: 1, y: 3, w: 1, h: 1, c: D },
  { x: 3, y: 3, w: 1, h: 1, c: D }, { x: 4, y: 3, w: 1, h: 1, c: C }, { x: 5, y: 3, w: 1, h: 1, c: W }, { x: 6, y: 3, w: 1, h: 1, c: C },
  { x: 7, y: 3, w: 1, h: 1, c: D }, { x: 8, y: 3, w: 1, h: 1, c: W }, { x: 9, y: 3, w: 1, h: 1, c: E }, { x: 10, y: 3, w: 1, h: 1, c: W }, { x: 11, y: 3, w: 1, h: 1, c: C },
  //            Body belly            Nose/snout
  { x: 3, y: 4, w: 1, h: 1, c: D }, { x: 4, y: 4, w: 1, h: 1, c: C }, { x: 5, y: 4, w: 1, h: 1, c: W }, { x: 6, y: 4, w: 1, h: 1, c: C },
  { x: 8, y: 4, w: 1, h: 1, c: C }, { x: 9, y: 4, w: 1, h: 1, c: W }, { x: 10, y: 4, w: 1, h: 1, c: N },
];
const rightLegsA: Pixel[] = [
  { x: 4, y: 5, w: 1, h: 1, c: C }, { x: 6, y: 5, w: 1, h: 1, c: C }, { x: 8, y: 5, w: 1, h: 1, c: C }, { x: 10, y: 5, w: 1, h: 1, c: C },
  { x: 4, y: 6, w: 1, h: 1, c: D }, { x: 6, y: 6, w: 1, h: 1, c: D }, { x: 8, y: 6, w: 1, h: 1, c: D }, { x: 10, y: 6, w: 1, h: 1, c: D },
];
const rightLegsB: Pixel[] = [
  { x: 3, y: 5, w: 1, h: 1, c: C }, { x: 5, y: 5, w: 1, h: 1, c: C }, { x: 9, y: 5, w: 1, h: 1, c: C }, { x: 11, y: 5, w: 1, h: 1, c: C },
  { x: 3, y: 6, w: 1, h: 1, c: D }, { x: 5, y: 6, w: 1, h: 1, c: D }, { x: 9, y: 6, w: 1, h: 1, c: D }, { x: 11, y: 6, w: 1, h: 1, c: D },
];

/* ══════════════════════════════════════════
   Left (mirror of right) — 12×8
   ══════════════════════════════════════════ */
function mirrorX(pixels: Pixel[], frameW = 13): Pixel[] {
  return pixels.map(p => ({ ...p, x: frameW - 1 - p.x }));
}

const leftBody = mirrorX(rightBody);
const leftLegsA = mirrorX(rightLegsA);
const leftLegsB = mirrorX(rightLegsB);

/* ── Combined walk frames: direction → [frameA, frameB] ── */
export type MascotDirection = 'down' | 'up' | 'left' | 'right';

export const MASCOT_FRAMES: Record<MascotDirection, [Pixel[], Pixel[]]> = {
  down: [
    [...downBody, ...downLegsA],
    [...downBody, ...downLegsB],
  ],
  up: [
    [...upBody, ...upLegsA],
    [...upBody, ...upLegsB],
  ],
  right: [
    [...rightBody, ...rightLegsA],
    [...rightBody, ...rightLegsB],
  ],
  left: [
    [...leftBody, ...leftLegsA],
    [...leftBody, ...leftLegsB],
  ],
};

/* ── Idle frame (down-facing with tongue) ── */
export const MASCOT_IDLE_TONGUE: Pixel[] = [
  { x: 4, y: 5, w: 1, h: 1, c: K },
];

/* ── Shadow (wider for side views, but we use a generic one) ── */
export const MASCOT_SHADOW: Pixel[] = [
  { x: 1, y: 9, w: 7, h: 1, c: '#100A06', a: 0.12 },
];

/* ── Side-view shadow (wider) ── */
export const MASCOT_SHADOW_SIDE: Pixel[] = [
  { x: 2, y: 6, w: 9, h: 1, c: '#100A06', a: 0.12 },
];
