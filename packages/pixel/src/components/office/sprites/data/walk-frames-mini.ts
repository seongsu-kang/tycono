/* =========================================================
   MINI WALK ANIMATION FRAMES — Declarative Pixel[] data
   4 directions × 4 frames, using TyconoForge color tokens.
   Coordinates relative to character origin (0, 0).
   ========================================================= */

import type { Pixel } from 'tyconoforge';

export type WalkDirection = 'down' | 'up' | 'left' | 'right';

/** All walk frames indexed by direction then frame (0-3) */
export type WalkFrameSet = Record<WalkDirection, [Pixel[], Pixel[], Pixel[], Pixel[]]>;

/* ─── Leg X positions per phase ──────────────── */
const LEG_X_DOWN: [number, number][] = [[1, 8], [3, 5], [8, 1], [5, 3]];
const LEG_X_SIDE: [number, number][] = [[1, 4], [2, 3], [4, 1], [3, 2]];

/* ─── Frame generator ────────────────────────── */

function downFrame(phase: number): Pixel[] {
  const bob = (phase === 1 || phase === 3) ? -1 : 0;
  const lx = LEG_X_DOWN[phase];
  const armOff = phase < 2 ? [0, 1] : [1, 0];
  const by = bob; // body y offset

  return [
    // Shadow
    { x: 1, y: 17, w: 10, h: 2, c: '#100A06', a: 0.18 },
    // Legs
    { x: lx[0], y: 13, w: 3, h: 4, c: '$pants' },
    { x: lx[1], y: 13, w: 3, h: 4, c: '$pants' },
    { x: lx[0] + 1, y: 13, w: 1, h: 3, c: 'darken($pants, 25)', a: 0.2 },
    { x: lx[1] + 1, y: 13, w: 1, h: 3, c: 'darken($pants, 25)', a: 0.2 },
    // Shoes
    { x: lx[0], y: 16, w: 3, h: 2, c: '$shoes' },
    { x: lx[1], y: 16, w: 3, h: 2, c: '$shoes' },
    { x: lx[0], y: 16, w: 3, h: 1, c: 'lighten($shoes, 25)', a: 0.4 },
    { x: lx[1], y: 16, w: 3, h: 1, c: 'lighten($shoes, 25)', a: 0.4 },
    // Shirt body
    { x: 1, y: by + 8, w: 10, h: 6, c: '$shirt' },
    { x: 2, y: by + 8, w: 8, h: 1, c: 'lighten($shirt, 20)', a: 0.35 },
    { x: 1, y: by + 8, w: 1, h: 5, c: 'darken($shirt, 30)', a: 0.2 },
    { x: 10, y: by + 8, w: 1, h: 5, c: 'darken($shirt, 30)', a: 0.2 },
    // Arms
    { x: -1, y: by + 9 + armOff[0], w: 3, h: 4 - armOff[0], c: '$shirt' },
    { x: 10, y: by + 9 + armOff[1], w: 3, h: 4 - armOff[1], c: '$shirt' },
    // Hands
    { x: -1, y: by + 12, w: 2, h: 1, c: '$skin' },
    { x: 11, y: by + 12, w: 2, h: 1, c: '$skin' },
    // Neck
    { x: 4, y: by + 6, w: 4, h: 3, c: '$skin' },
    // Head
    { x: 1, y: by + 0, w: 10, h: 7, c: '$skin' },
    // Eyes
    { x: 3, y: by + 3, w: 2, h: 2, c: '#1A1A2E' },
    { x: 7, y: by + 3, w: 2, h: 2, c: '#1A1A2E' },
    { x: 3, y: by + 3, w: 1, h: 1, c: '#FFF', a: 0.4 },
    { x: 7, y: by + 3, w: 1, h: 1, c: '#FFF', a: 0.4 },
    // Nose
    { x: 5, y: by + 6, w: 2, h: 1, c: 'darken($skin, 25)', a: 0.35 },
    // Ears
    { x: 0, y: by + 3, w: 1, h: 1, c: '$skin' },
    { x: 11, y: by + 3, w: 1, h: 1, c: '$skin' },
    // Hair
    { x: 1, y: by + 0, w: 10, h: 3, c: '$hair' },
    { x: 0, y: by + 1, w: 2, h: 3, c: '$hair' },
    { x: 10, y: by + 1, w: 2, h: 3, c: '$hair' },
    { x: 2, y: by + 0, w: 8, h: 1, c: 'lighten($hair, 25)', a: 0.3 },
  ];
}

function upFrame(phase: number): Pixel[] {
  const bob = (phase === 1 || phase === 3) ? -1 : 0;
  const lx = LEG_X_DOWN[phase]; // same leg pattern as down
  const armOff = phase < 2 ? [0, 1] : [1, 0];
  const by = bob;

  return [
    // Shadow
    { x: 1, y: 17, w: 10, h: 2, c: '#100A06', a: 0.18 },
    // Legs
    { x: lx[0], y: 13, w: 3, h: 4, c: '$pants' },
    { x: lx[1], y: 13, w: 3, h: 4, c: '$pants' },
    // Shoes
    { x: lx[0], y: 16, w: 3, h: 2, c: '$shoes' },
    { x: lx[1], y: 16, w: 3, h: 2, c: '$shoes' },
    // Shirt body
    { x: 1, y: by + 8, w: 10, h: 6, c: '$shirt' },
    { x: 2, y: by + 8, w: 8, h: 1, c: 'lighten($shirt, 20)', a: 0.2 },
    { x: 5, y: by + 10, w: 2, h: 3, c: 'darken($shirt, 30)', a: 0.12 },
    // Arms
    { x: -1, y: by + 9 + armOff[0], w: 3, h: 4 - armOff[0], c: '$shirt' },
    { x: 10, y: by + 9 + armOff[1], w: 3, h: 4 - armOff[1], c: '$shirt' },
    // Neck
    { x: 4, y: by + 6, w: 4, h: 3, c: '$skin' },
    // Head
    { x: 1, y: by + 0, w: 10, h: 7, c: '$skin' },
    // Hair (back of head - more coverage)
    { x: 1, y: by + 0, w: 10, h: 6, c: '$hair' },
    { x: 0, y: by + 1, w: 2, h: 5, c: '$hair' },
    { x: 10, y: by + 1, w: 2, h: 5, c: '$hair' },
    { x: 2, y: by + 0, w: 8, h: 1, c: 'lighten($hair, 25)', a: 0.3 },
    // Ears (barely visible from back)
    { x: 0, y: by + 4, w: 1, h: 1, c: '$skin', a: 0.6 },
    { x: 11, y: by + 4, w: 1, h: 1, c: '$skin', a: 0.6 },
  ];
}

function sideFrame(phase: number, facingRight: boolean): Pixel[] {
  const bob = (phase === 1 || phase === 3) ? -1 : 0;
  const lp = LEG_X_SIDE[phase];
  const by = bob;
  const armSwing = phase % 2 === 0 ? 1 : 0;

  if (facingRight) {
    return [
      // Shadow
      { x: 1, y: 17, w: 10, h: 2, c: '#100A06', a: 0.18 },
      // Legs
      { x: lp[0], y: 13, w: 3, h: 4, c: '$pants' },
      { x: lp[1], y: 13, w: 3, h: 4, c: '$pants' },
      // Shoes
      { x: lp[0], y: 16, w: 3, h: 2, c: '$shoes' },
      { x: lp[1], y: 16, w: 3, h: 2, c: '$shoes' },
      // Shirt body
      { x: 2, y: by + 8, w: 8, h: 6, c: '$shirt' },
      { x: 2, y: by + 8, w: 8, h: 1, c: 'lighten($shirt, 20)', a: 0.2 },
      // Arm (right side, visible)
      { x: 8, y: by + 9 + armSwing, w: 3, h: 4 - armSwing, c: '$shirt' },
      { x: 9, y: by + 12, w: 2, h: 1, c: '$skin' },
      // Neck
      { x: 4, y: by + 6, w: 4, h: 3, c: '$skin' },
      // Head
      { x: 2, y: by + 0, w: 8, h: 7, c: '$skin' },
      // Eye (right side)
      { x: 7, y: by + 3, w: 2, h: 2, c: '#1A1A2E' },
      { x: 7, y: by + 3, w: 1, h: 1, c: '#FFF', a: 0.3 },
      // Ear/nose hint
      { x: 9, y: by + 4, w: 1, h: 1, c: 'darken($skin, 25)', a: 0.3 },
      // Hair
      { x: 2, y: by + 0, w: 8, h: 3, c: '$hair' },
      { x: 1, y: by + 1, w: 2, h: 4, c: '$hair' },
      { x: 9, y: by + 1, w: 2, h: 3, c: '$hair' },
      { x: 3, y: by + 0, w: 6, h: 1, c: 'lighten($hair, 25)', a: 0.25 },
    ];
  } else {
    return [
      // Shadow
      { x: 1, y: 17, w: 10, h: 2, c: '#100A06', a: 0.18 },
      // Legs
      { x: lp[0], y: 13, w: 3, h: 4, c: '$pants' },
      { x: lp[1], y: 13, w: 3, h: 4, c: '$pants' },
      // Shoes
      { x: lp[0], y: 16, w: 3, h: 2, c: '$shoes' },
      { x: lp[1], y: 16, w: 3, h: 2, c: '$shoes' },
      // Shirt body
      { x: 2, y: by + 8, w: 8, h: 6, c: '$shirt' },
      { x: 2, y: by + 8, w: 8, h: 1, c: 'lighten($shirt, 20)', a: 0.2 },
      // Arm (left side, visible)
      { x: 0, y: by + 9 + armSwing, w: 3, h: 4 - armSwing, c: '$shirt' },
      { x: -1, y: by + 12, w: 2, h: 1, c: '$skin' },
      // Neck
      { x: 4, y: by + 6, w: 4, h: 3, c: '$skin' },
      // Head
      { x: 2, y: by + 0, w: 8, h: 7, c: '$skin' },
      // Eye (left side)
      { x: 3, y: by + 3, w: 2, h: 2, c: '#1A1A2E' },
      { x: 3, y: by + 3, w: 1, h: 1, c: '#FFF', a: 0.3 },
      // Ear/nose hint
      { x: 1, y: by + 4, w: 1, h: 1, c: 'darken($skin, 25)', a: 0.3 },
      // Hair
      { x: 2, y: by + 0, w: 8, h: 3, c: '$hair' },
      { x: 1, y: by + 1, w: 2, h: 3, c: '$hair' },
      { x: 9, y: by + 1, w: 2, h: 4, c: '$hair' },
      { x: 3, y: by + 0, w: 6, h: 1, c: 'lighten($hair, 25)', a: 0.25 },
    ];
  }
}

/* ─── Pre-built frame set ────────────────────── */

export const WALK_FRAMES: WalkFrameSet = {
  down: [downFrame(0), downFrame(1), downFrame(2), downFrame(3)],
  up: [upFrame(0), upFrame(1), upFrame(2), upFrame(3)],
  right: [sideFrame(0, true), sideFrame(1, true), sideFrame(2, true), sideFrame(3, true)],
  left: [sideFrame(0, false), sideFrame(1, false), sideFrame(2, false), sideFrame(3, false)],
};
