/* =========================================================
   CANVAS SPRITE DRAWING FUNCTIONS
   Character sprites: 64x80 canvas, scale P=2 (32x40 grid)
   All drawing via ctx.fillRect() exclusively — no SVG, no images

   Each role draw function accepts an optional CharacterAppearance
   to override default colors while preserving unique accessories.
   ========================================================= */

import type { CharacterAppearance } from '../../../types/appearance';

function px(
  ctx: CanvasRenderingContext2D,
  x: number, y: number,
  w: number, h: number,
  color: string,
  alpha?: number,
): void {
  if (alpha !== undefined && alpha !== 1) ctx.globalAlpha = alpha;
  ctx.fillStyle = color;
  ctx.fillRect(x * 2, y * 2, w * 2, h * 2);
  if (alpha !== undefined && alpha !== 1) ctx.globalAlpha = 1;
}

/* ── Color utilities ─────────────────────────────────── */

function darken(hex: string, amt: number): string {
  const n = parseInt(hex.replace('#', ''), 16);
  const r = Math.max(0, ((n >> 16) & 0xFF) - amt);
  const g = Math.max(0, ((n >> 8) & 0xFF) - amt);
  const b = Math.max(0, (n & 0xFF) - amt);
  return `#${((r << 16) | (g << 8) | b).toString(16).padStart(6, '0')}`;
}

function lighten(hex: string, amt: number): string {
  const n = parseInt(hex.replace('#', ''), 16);
  const r = Math.min(255, ((n >> 16) & 0xFF) + amt);
  const g = Math.min(255, ((n >> 8) & 0xFF) + amt);
  const b = Math.min(255, (n & 0xFF) + amt);
  return `#${((r << 16) | (g << 8) | b).toString(16).padStart(6, '0')}`;
}

/* ── Character Sprites ─────────────────────────────────── */
/* bobY: 0 or 1 — idle bob Y offset */

export function drawCTO(ctx: CanvasRenderingContext2D, bobY: number, ap?: CharacterAppearance): void {
  ctx.clearRect(0, 0, 64, 80);
  const b = bobY;
  const skin = ap?.skinColor ?? '#F5CBA7';
  const hair = ap?.hairColor ?? '#2C1810';
  const shirt = ap?.shirtColor ?? '#1565C0';
  const pants = ap?.pantsColor ?? '#37474F';
  const shoes = ap?.shoeColor ?? '#212121';
  // Head
  px(ctx, 10, b+0, 12, 10, skin);
  // Hair (dark, neat)
  px(ctx, 10, b+0, 12, 3, hair);
  px(ctx, 8,  b+2, 2,  4, hair);
  px(ctx, 22, b+2, 2,  4, hair);
  // Glasses frame (rectangular)
  px(ctx, 11, b+4, 4, 3, '#2A3A50');
  px(ctx, 17, b+4, 4, 3, '#2A3A50');
  px(ctx, 15, b+5, 2, 1, '#4A5A70');
  // Lens fill
  px(ctx, 12, b+5, 2, 2, '#0D1B2A');
  px(ctx, 18, b+5, 2, 2, '#0D1B2A');
  // Lens glint
  px(ctx, 12, b+5, 1, 1, '#60A5FA', 0.5);
  px(ctx, 18, b+5, 1, 1, '#60A5FA', 0.5);
  // Nose
  px(ctx, 15, b+7, 2, 1, darken(skin, 30));
  // Body — shirt
  px(ctx, 8,  b+10, 16, 14, shirt);
  px(ctx, 13, b+10,  6,  3, darken(shirt, 20));
  // Shoulder badges
  px(ctx, 8,  b+12, 4, 4, darken(shirt, 20));
  px(ctx, 20, b+12, 4, 4, darken(shirt, 20));
  // Arms
  px(ctx, 2,  b+10, 6, 10, shirt);
  px(ctx, 24, b+10, 6, 10, shirt);
  // Hands
  px(ctx, 2,  b+20, 6, 4, skin);
  px(ctx, 24, b+20, 6, 4, skin);
  // Laptop body
  px(ctx, 4,  b+22, 24, 12, '#1A1A2A');
  px(ctx, 5,  b+23, 22,  9, '#0D1B3A');
  // Screen glow lines
  px(ctx, 7, b+25, 18, 1, '#60A5FA', 0.75);
  px(ctx, 7, b+27, 12, 1, '#60A5FA', 0.55);
  px(ctx, 7, b+29, 15, 1, '#60A5FA', 0.60);
  px(ctx, 7, b+31,  8, 1, '#34D399', 0.50);
  // Laptop hinge line
  px(ctx, 4, b+33, 24, 2, '#111');
  // Legs
  px(ctx, 10, b+24, 5, 10, pants);
  px(ctx, 17, b+24, 5, 10, pants);
  // Shoes
  px(ctx, 9,  b+34, 7, 4, shoes);
  px(ctx, 16, b+34, 7, 4, shoes);
  px(ctx, 9,  b+34, 7, 1, lighten(shoes, 20));
  px(ctx, 16, b+34, 7, 1, lighten(shoes, 20));
}

export function drawCBO(ctx: CanvasRenderingContext2D, bobY: number, ap?: CharacterAppearance): void {
  ctx.clearRect(0, 0, 64, 80);
  const b = bobY;
  const skin = ap?.skinColor ?? '#FDEBD0';
  const hair = ap?.hairColor ?? '#1A0A00';
  const shirt = ap?.shirtColor ?? '#E65100';
  const pants = ap?.pantsColor ?? '#37474F';
  const shoes = ap?.shoeColor ?? '#1A1A1A';
  // Head
  px(ctx, 10, b+0, 12, 10, skin);
  // Hair (slicked back, dark)
  px(ctx, 10, b+0, 12, 2, hair);
  px(ctx, 8,  b+1,  2,  3, hair);
  px(ctx, 22, b+1,  2,  3, hair);
  // Glasses frame
  px(ctx, 11, b+4, 4, 3, '#333');
  px(ctx, 17, b+4, 4, 3, '#333');
  px(ctx, 15, b+5, 2, 1, '#555');
  px(ctx, 12, b+5, 2, 2, '#222');
  px(ctx, 18, b+5, 2, 2, '#222');
  // Nose
  px(ctx, 15, b+7, 2, 1, darken(skin, 40));
  // Suit body
  px(ctx, 8,  b+10, 16, 14, shirt);
  // Shirt visible at center
  px(ctx, 13, b+10,  6, 14, lighten(shirt, 80));
  // Tie
  px(ctx, 14, b+11,  4, 12, darken(shirt, 30));
  px(ctx, 15, b+12,  2, 10, darken(shirt, 50));
  // Suit lapels
  px(ctx, 8,  b+10,  5,  8, darken(shirt, 30));
  px(ctx, 19, b+10,  5,  8, darken(shirt, 30));
  // Arms
  px(ctx, 2,  b+10, 6, 10, shirt);
  px(ctx, 24, b+10, 6, 10, shirt);
  // Cuffs
  px(ctx, 2,  b+19, 6, 1, lighten(shirt, 80));
  px(ctx, 24, b+19, 6, 1, lighten(shirt, 80));
  // Hands
  px(ctx, 2,  b+20, 6, 4, skin);
  px(ctx, 24, b+20, 6, 4, skin);
  // Briefcase body
  px(ctx, 20, b+20, 12, 9, '#4E342E');
  px(ctx, 21, b+22, 10, 5, '#795548');
  // Handle
  px(ctx, 25, b+19,  4, 3, '#4E342E');
  px(ctx, 25, b+18,  4, 2, '#6D4C41');
  // Clasp
  px(ctx, 26, b+24, 2, 2, '#FFD54F');
  // Case highlight
  px(ctx, 21, b+22, 10, 1, '#6D4C41');
  // Legs
  px(ctx, 10, b+24, 5, 10, pants);
  px(ctx, 17, b+24, 5, 10, pants);
  // Shoes
  px(ctx, 9,  b+34, 7, 4, shoes);
  px(ctx, 16, b+34, 7, 4, shoes);
  px(ctx, 9,  b+34, 7, 1, lighten(shoes, 20));
  px(ctx, 16, b+34, 7, 1, lighten(shoes, 20));
}

export function drawPM(ctx: CanvasRenderingContext2D, bobY: number, ap?: CharacterAppearance): void {
  ctx.clearRect(0, 0, 64, 80);
  const b = bobY;
  const skin = ap?.skinColor ?? '#FDEBD0';
  const hair = ap?.hairColor ?? '#6D4C41';
  const shirt = ap?.shirtColor ?? '#2E7D32';
  const pants = ap?.pantsColor ?? '#37474F';
  const shoes = ap?.shoeColor ?? '#212121';
  // Head
  px(ctx, 10, b+0, 12, 10, skin);
  // Hair (bun style)
  px(ctx, 10, b+0, 12,  3, hair);
  px(ctx, 8,  b+2,  2,  4, hair);
  px(ctx, 22, b+2,  2,  4, hair);
  // Bun on top
  px(ctx, 13, b+0,  6,  4, lighten(hair, 20));
  px(ctx, 14, b+0,  4,  2, lighten(hair, 40));
  // Eyes
  px(ctx, 12, b+4, 2, 2, '#1A1A2E');
  px(ctx, 18, b+4, 2, 2, '#1A1A2E');
  // Eyelashes
  px(ctx, 12, b+3, 2, 1, darken(hair, 10));
  px(ctx, 18, b+3, 2, 1, darken(hair, 10));
  // Blush
  px(ctx, 10, b+6, 3, 2, '#FFCDD2', 0.6);
  px(ctx, 19, b+6, 3, 2, '#FFCDD2', 0.6);
  // Smile
  px(ctx, 14, b+7, 4, 1, '#C0392B');
  // Body (shirt)
  px(ctx, 8,  b+10, 16, 14, shirt);
  // Pocket
  px(ctx, 9,  b+13,  5,  5, darken(shirt, 20));
  // Arms
  px(ctx, 2,  b+10, 6, 10, shirt);
  px(ctx, 24, b+10, 6, 10, shirt);
  // Hands
  px(ctx, 2,  b+20, 6, 4, skin);
  px(ctx, 24, b+20, 6, 4, skin);
  // Clipboard
  px(ctx, 20, b+14, 12, 14, '#F5F5F5');
  px(ctx, 20, b+14, 12,  2, '#BDBDBD');
  px(ctx, 24, b+13,  4,  3, '#9E9E9E');
  // Clipboard lines
  px(ctx, 22, b+18,  8, 1, '#9E9E9E');
  px(ctx, 22, b+20,  8, 1, '#9E9E9E');
  px(ctx, 22, b+22,  6, 1, '#9E9E9E');
  // Checkmark
  px(ctx, 22, b+24, 2, 1, shirt);
  px(ctx, 23, b+25, 2, 1, shirt);
  px(ctx, 25, b+23, 1, 2, shirt);
  // Legs
  px(ctx, 10, b+24, 5, 10, pants);
  px(ctx, 17, b+24, 5, 10, pants);
  // Shoes
  px(ctx, 9,  b+34, 7, 4, shoes);
  px(ctx, 16, b+34, 7, 4, shoes);
}

export function drawEngineer(ctx: CanvasRenderingContext2D, bobY: number, ap?: CharacterAppearance): void {
  ctx.clearRect(0, 0, 64, 80);
  const b = bobY;
  const skin = ap?.skinColor ?? '#F5CBA7';
  const hair = ap?.hairColor ?? '#1A1A1A';
  const shirt = ap?.shirtColor ?? '#4A148C';
  const pants = ap?.pantsColor ?? '#37474F';
  const shoes = ap?.shoeColor ?? '#7B1FA2';
  // Head
  px(ctx, 10, b+0, 12, 10, skin);
  // Hair (messy)
  px(ctx, 10, b+0, 12, 3, hair);
  px(ctx, 8,  b+1,  4, 4, hair);
  px(ctx, 20, b+0,  4, 5, hair);
  px(ctx, 14, b+0,  2, 2, lighten(hair, 30));
  // Headphone band
  px(ctx, 8, b+0, 16, 3, darken(shirt, 10));
  // Headphone cups
  px(ctx, 8,  b+2, 2, 6, lighten(shirt, 15));
  px(ctx, 22, b+2, 2, 6, lighten(shirt, 15));
  px(ctx, 8,  b+3, 2, 4, lighten(shirt, 30));
  px(ctx, 22, b+3, 2, 4, lighten(shirt, 30));
  // Eyes
  px(ctx, 12, b+4, 2, 2, '#1A1A2E');
  px(ctx, 18, b+4, 2, 2, '#1A1A2E');
  // Eye shine
  px(ctx, 12, b+4, 1, 1, '#4A90D9', 0.7);
  px(ctx, 18, b+4, 1, 1, '#4A90D9', 0.7);
  // Body (hoodie)
  px(ctx, 8,  b+10, 16, 14, shirt);
  px(ctx, 12, b+18,  8,  4, darken(shirt, 20));
  // Hoodie strings
  px(ctx, 13, b+11, 2, 5, lighten(shirt, 20));
  px(ctx, 17, b+11, 2, 5, lighten(shirt, 20));
  // Arms
  px(ctx, 2,  b+10, 6, 12, shirt);
  px(ctx, 24, b+10, 6, 12, shirt);
  // Hands
  px(ctx, 2,  b+22, 6, 3, skin);
  px(ctx, 24, b+22, 6, 3, skin);
  // Keyboard
  px(ctx, 4,  b+24, 24, 6, '#1A1A2E');
  px(ctx, 5,  b+25, 22, 4, '#252535');
  // Keys
  px(ctx, 6,  b+26, 3, 2, '#333');
  px(ctx, 10, b+26, 3, 2, '#333');
  px(ctx, 14, b+26, 5, 2, shirt);
  px(ctx, 20, b+26, 3, 2, '#333');
  px(ctx, 24, b+26, 3, 2, '#333');
  // Key highlights
  px(ctx, 6,  b+26, 3, 1, '#444');
  px(ctx, 14, b+26, 5, 1, lighten(shirt, 20));
  // Legs
  px(ctx, 10, b+24, 5, 10, pants);
  px(ctx, 17, b+24, 5, 10, pants);
  // Sneakers
  px(ctx, 8,  b+34, 8, 4, shoes);
  px(ctx, 16, b+34, 8, 4, shoes);
  px(ctx, 8,  b+34, 8, 1, lighten(shoes, 20));
  px(ctx, 16, b+34, 8, 1, lighten(shoes, 20));
}

export function drawDesigner(ctx: CanvasRenderingContext2D, bobY: number, ap?: CharacterAppearance): void {
  ctx.clearRect(0, 0, 64, 80);
  const b = bobY;
  const skin = ap?.skinColor ?? '#FDEBD0';
  const hair = ap?.hairColor ?? '#AD1457';
  const shirt = ap?.shirtColor ?? '#AD1457';
  const pants = ap?.pantsColor ?? '#37474F';
  const shoes = ap?.shoeColor ?? '#212121';
  // Head
  px(ctx, 10, b+0, 12, 10, skin);
  // Hair (dyed, stylish)
  px(ctx, 8,  b+0, 16, 4, hair);
  px(ctx, 8,  b+3,  4, 5, lighten(hair, 15));
  px(ctx, 20, b+3,  4, 5, lighten(hair, 15));
  px(ctx, 6,  b+2,  4, 3, hair);
  px(ctx, 22, b+2,  4, 3, hair);
  // Eyes (with lashes)
  px(ctx, 12, b+4, 3, 2, '#1A1A2E');
  px(ctx, 18, b+4, 3, 2, '#1A1A2E');
  px(ctx, 12, b+3, 3, 1, '#1A1A2E');
  px(ctx, 18, b+3, 3, 1, '#1A1A2E');
  // Eye shine
  px(ctx, 13, b+4, 1, 1, '#FFF', 0.6);
  px(ctx, 19, b+4, 1, 1, '#FFF', 0.6);
  // Blush
  px(ctx, 10, b+6, 3, 2, '#FFCDD2', 0.7);
  px(ctx, 19, b+6, 3, 2, '#FFCDD2', 0.7);
  // Body (shirt)
  px(ctx, 8,  b+10, 16, 14, shirt);
  px(ctx, 13, b+10,  6, 14, darken(shirt, 30));
  px(ctx, 11, b+11,  2,  4, lighten(shirt, 15));
  px(ctx, 19, b+11,  2,  4, lighten(shirt, 15));
  // Arms
  px(ctx, 2,  b+10, 6, 10, shirt);
  px(ctx, 24, b+10, 6, 10, shirt);
  // Hands
  px(ctx, 2,  b+20, 6, 4, skin);
  px(ctx, 24, b+20, 6, 4, skin);
  // Palette (rounded shape approx)
  px(ctx, 20, b+18, 12, 10, '#F5F5F5');
  px(ctx, 19, b+20,  2,  6, '#F5F5F5');
  px(ctx, 31, b+20,  1,  4, '#F5F5F5');
  // Thumb hole
  px(ctx, 26, b+19,  3,  3, skin);
  // Color blobs
  px(ctx, 21, b+20, 3, 3, '#E53935');
  px(ctx, 25, b+20, 3, 3, '#FFB300');
  px(ctx, 29, b+20, 2, 3, '#43A047');
  px(ctx, 22, b+24, 3, 3, '#1E88E5');
  px(ctx, 26, b+24, 3, 3, '#8E24AA');
  // Brush handle
  px(ctx, 30, b+14, 2, 8, '#795548');
  // Brush bristle
  px(ctx, 30, b+22, 2, 4, '#F5F5F5');
  px(ctx, 30, b+24, 2, 2, '#E53935');
  // Legs
  px(ctx, 10, b+24, 5, 10, pants);
  px(ctx, 17, b+24, 5, 10, pants);
  // Shoes
  px(ctx, 9,  b+34, 7, 4, shoes);
  px(ctx, 16, b+34, 7, 4, shoes);
}

export function drawQA(ctx: CanvasRenderingContext2D, bobY: number, ap?: CharacterAppearance): void {
  ctx.clearRect(0, 0, 64, 80);
  const b = bobY;
  const skin = ap?.skinColor ?? '#F5CBA7';
  const hair = ap?.hairColor ?? '#4E342E';
  const shirt = ap?.shirtColor ?? '#00695C';
  const pants = ap?.pantsColor ?? '#37474F';
  const shoes = ap?.shoeColor ?? '#212121';
  // Head
  px(ctx, 10, b+0, 12, 10, skin);
  // Hair (brown)
  px(ctx, 10, b+0, 12, 3, hair);
  px(ctx, 8,  b+2,  2, 3, hair);
  px(ctx, 22, b+2,  2, 3, hair);
  // Eyebrows (furrowed)
  px(ctx, 11, b+3, 4, 1, hair);
  px(ctx, 17, b+3, 4, 1, hair);
  // Eyes (focused, narrow)
  px(ctx, 12, b+4, 2, 2, '#1A1A2E');
  px(ctx, 18, b+4, 2, 2, '#1A1A2E');
  // Nose
  px(ctx, 15, b+7, 2, 1, darken(skin, 30));
  // Body (lab coat)
  px(ctx, 8,  b+10, 16, 14, shirt);
  // Lab coat front panels
  px(ctx, 8,  b+10,  4, 14, darken(shirt, 15));
  px(ctx, 20, b+10,  4, 14, darken(shirt, 15));
  // Pocket protector
  px(ctx, 9,  b+13,  3,  5, lighten(shirt, 10));
  px(ctx, 10, b+12,  1,  7, lighten(shirt, 60));
  px(ctx, 11, b+12,  1,  6, lighten(shirt, 50));
  // Arms
  px(ctx, 2,  b+10, 6, 10, shirt);
  px(ctx, 24, b+10, 6, 10, shirt);
  // Hands
  px(ctx, 2,  b+20, 6, 4, skin);
  px(ctx, 24, b+20, 6, 4, skin);
  // Magnifying glass circle (ring)
  px(ctx, 22, b+13, 10, 10, lighten(shirt, 60));
  // Lens interior
  px(ctx, 23, b+14,  8,  8, '#1A2A3A');
  // Lens tint
  px(ctx, 24, b+15,  6,  6, '#0D2A3A', 0.6);
  // Glare
  px(ctx, 24, b+15, 2, 2, lighten(shirt, 80), 0.8);
  px(ctx, 25, b+16, 1, 1, '#FFF', 0.9);
  // Handle
  px(ctx, 30, b+22, 2, 2, '#795548');
  px(ctx, 31, b+24, 2, 2, '#795548');
  px(ctx, 30, b+25, 2, 4, '#5D4037');
  // Legs
  px(ctx, 10, b+24, 5, 10, pants);
  px(ctx, 17, b+24, 5, 10, pants);
  // Shoes
  px(ctx, 9,  b+34, 7, 4, shoes);
  px(ctx, 16, b+34, 7, 4, shoes);
}

/* Generic silhouette for new/unknown roles */
export function drawDefault(ctx: CanvasRenderingContext2D, bobY: number, ap?: CharacterAppearance): void {
  ctx.clearRect(0, 0, 64, 80);
  const b = bobY;
  const skin = ap?.skinColor ?? '#B0BEC5';
  const hair = ap?.hairColor ?? '#78909C';
  const shirt = ap?.shirtColor ?? '#607D8B';
  const pants = ap?.pantsColor ?? '#455A64';
  const shoes = ap?.shoeColor ?? '#37474F';
  // Head
  px(ctx, 10, b+0, 12, 10, skin);
  // Hair
  px(ctx, 10, b+0, 12, 3, hair);
  px(ctx, 8,  b+2, 2,  4, hair);
  px(ctx, 22, b+2, 2,  4, hair);
  // Eyes
  px(ctx, 12, b+4, 2, 2, darken(pants, 20));
  px(ctx, 18, b+4, 2, 2, darken(pants, 20));
  // Body
  px(ctx, 8,  b+10, 16, 14, shirt);
  px(ctx, 13, b+10,  6,  3, darken(shirt, 15));
  // Arms
  px(ctx, 2,  b+10, 6, 10, shirt);
  px(ctx, 24, b+10, 6, 10, shirt);
  // Hands
  px(ctx, 2,  b+20, 6, 4, skin);
  px(ctx, 24, b+20, 6, 4, skin);
  // Legs
  px(ctx, 10, b+24, 5, 10, pants);
  px(ctx, 17, b+24, 5, 10, pants);
  // Shoes
  px(ctx, 9,  b+34, 7, 4, shoes);
  px(ctx, 16, b+34, 7, 4, shoes);
}

/* ── Facility Sprites (static, no animation) ────────────── */

/* Meeting table top-down: 160x80 canvas (Q=2, 80x40 grid) */
export function drawMeetingTable(ctx: CanvasRenderingContext2D): void {
  ctx.clearRect(0, 0, 160, 80);
  const Q = 2;
  function q(x: number, y: number, w: number, h: number, c: string, a?: number): void {
    if (a !== undefined && a !== 1) ctx.globalAlpha = a;
    ctx.fillStyle = c;
    ctx.fillRect(x * Q, y * Q, w * Q, h * Q);
    if (a !== undefined && a !== 1) ctx.globalAlpha = 1;
  }
  // Floor tint
  q(0, 0, 80, 40, '#1e2030');
  // Table surface (oval approx)
  q(8, 8, 64, 24, '#6b5b4b');
  q(4, 10, 72, 20, '#7d6d5d');
  q(2, 12, 76, 16, '#7d6d5d');
  // Edge highlights
  q(2, 12, 76,  2, '#8b7b6b');
  q(2, 26, 76,  2, '#4b3b2b');
  // Center inlay
  q(18, 14, 44, 12, '#6b5b4b', 0.5);
  // Chairs — top row
  q(10, 2, 10, 6, '#78889c'); q(10, 2, 10, 1, '#8899ad');
  q(24, 0, 10, 6, '#78889c'); q(24, 0, 10, 1, '#8899ad');
  q(38, 2, 10, 6, '#78889c'); q(38, 2, 10, 1, '#8899ad');
  q(54, 2, 10, 6, '#78889c'); q(54, 2, 10, 1, '#8899ad');
  // Chairs — bottom row
  q(10, 32, 10, 6, '#78889c');
  q(24, 34, 10, 6, '#78889c');
  q(38, 32, 10, 6, '#78889c');
  q(54, 32, 10, 6, '#78889c');
  // Laptop on table
  q(28, 14, 14, 8, '#1a1a2e');
  q(29, 15, 12, 6, '#1565C0', 0.5);
  q(30, 16,  8, 1, '#60A5FA', 0.45);
  q(30, 18,  5, 1, '#60A5FA', 0.3);
  // Coffee mug
  q(58, 16, 5, 5, '#795548');
  q(59, 17, 3, 3, '#A67C52');
  q(63, 18, 2, 2, '#795548');
  // Sticky note
  q(10, 16, 10, 8, '#FFEE58', 0.7);
  q(11, 17,  8, 1, '#9E9E9E', 0.5);
  q(11, 19,  8, 1, '#9E9E9E', 0.5);
  q(11, 21,  6, 1, '#9E9E9E', 0.5);
}

/* Bulletin board: 128x96 canvas (Q=2, 64x48 grid) */
export function drawBulletin(ctx: CanvasRenderingContext2D): void {
  ctx.clearRect(0, 0, 128, 96);
  const Q = 2;
  function q(x: number, y: number, w: number, h: number, c: string, a?: number): void {
    if (a !== undefined && a !== 1) ctx.globalAlpha = a;
    ctx.fillStyle = c;
    ctx.fillRect(x * Q, y * Q, w * Q, h * Q);
    if (a !== undefined && a !== 1) ctx.globalAlpha = 1;
  }
  q(0, 0, 64, 48, '#4b3b2b');
  q(3, 3, 58, 42, '#8B7355');
  q(4,  4, 10, 10, '#A0845C', 0.5);
  q(20, 8,  8,  8, '#A0845C', 0.4);
  q(40, 6, 12,  6, '#A0845C', 0.3);
  q(8, 30, 14, 10, '#A0845C', 0.25);
  q(44, 32, 10, 8, '#A0845C', 0.3);
  q(6, 8, 18, 12, '#FFEE58');
  q(5, 7,  3,  3, '#EF5350'); q(6, 7, 2, 2, '#C62828');
  q(8, 10, 14, 1, '#9E9E9E');
  q(8, 12, 12, 1, '#9E9E9E');
  q(8, 14, 10, 1, '#9E9E9E');
  q(28, 6, 16, 14, '#B3E5FC');
  q(35, 5,  3,  3, '#42A5F5'); q(36, 5, 2, 2, '#1565C0');
  q(30,  9, 12, 1, '#9E9E9E');
  q(30, 11, 10, 1, '#9E9E9E');
  q(30, 13, 11, 1, '#9E9E9E');
  q(8, 24, 16, 14, '#C8E6C9');
  q(15, 23,  3,  3, '#66BB6A'); q(16, 23, 2, 2, '#388E3C');
  q(10, 27, 12, 1, '#9E9E9E');
  q(10, 29,  8, 1, '#9E9E9E');
  q(10, 31, 10, 1, '#9E9E9E');
  q(28, 24, 28, 16, '#FFCDD2');
  q(43, 23,  3,  3, '#EF5350'); q(44, 23, 2, 2, '#B71C1C');
  q(32, 27, 24, 1, '#9E9E9E');
  q(32, 29, 20, 1, '#9E9E9E');
  q(32, 31, 22, 1, '#9E9E9E');
  q(32, 33, 15, 1, '#9E9E9E');
  q(0, 0, 64,  3, '#5a4a3a');
  q(0, 45, 64, 3, '#3a2a1a');
}

/* Knowledge bookshelf: 128x96 canvas (Q=2, 64x48 grid) */
export function drawKnowledgeShelf(ctx: CanvasRenderingContext2D): void {
  ctx.clearRect(0, 0, 128, 96);
  const Q = 2;
  function q(x: number, y: number, w: number, h: number, c: string, a?: number): void {
    if (a !== undefined && a !== 1) ctx.globalAlpha = a;
    ctx.fillStyle = c;
    ctx.fillRect(x * Q, y * Q, w * Q, h * Q);
    if (a !== undefined && a !== 1) ctx.globalAlpha = 1;
  }
  q(2, 0, 60, 48, '#3b1f0a');
  q(4, 2, 56, 44, '#5a3310');
  q(4, 13, 56, 2, '#2d1508');
  q(4, 27, 56, 2, '#2d1508');
  q(4, 41, 56, 2, '#2d1508');
  q(5,  3, 4, 10, '#2563EB'); q(5,  3, 4,  2, '#1D4ED8');
  q(10, 4, 3, 9,  '#DC2626'); q(10, 4, 3,  2, '#B91C1C');
  q(14, 3, 5, 10, '#16A34A'); q(14, 3, 5,  2, '#15803D');
  q(20, 4, 3, 9,  '#9333EA'); q(20, 4, 3,  2, '#7E22CE');
  q(24, 3, 4, 10, '#D97706'); q(24, 3, 4,  2, '#B45309');
  q(29, 4, 3, 9,  '#0891B2'); q(29, 4, 3,  2, '#0E7490');
  q(33, 3, 5, 10, '#BE123C'); q(33, 3, 5,  2, '#9F1239');
  q(39, 4, 4, 9,  '#4F46E5'); q(39, 4, 4,  2, '#3730A3');
  q(44, 3, 3, 10, '#065F46'); q(44, 3, 3,  2, '#064E3B');
  q(48, 4, 4, 9,  '#92400E'); q(48, 4, 4,  2, '#78350F');
  q(53, 3, 5, 10, '#1E3A5F'); q(53, 3, 5,  2, '#1e3060');
  q(6,  6, 2, 1, '#BFDBFE', 0.7);
  q(11, 7, 1, 1, '#FCA5A5', 0.7);
  q(16, 6, 3, 1, '#BBF7D0', 0.7);
  q(21, 7, 1, 1, '#D8B4FE', 0.7);
  q(25, 6, 2, 1, '#FDE68A', 0.7);
  q(5,  16, 5, 11, '#0F766E'); q(5,  16, 5, 2, '#0D6056');
  q(11, 17, 3, 10, '#C2410C'); q(11, 17, 3, 2, '#9A3412');
  q(15, 16, 4, 11, '#7C3AED'); q(15, 16, 4, 2, '#6D28D9');
  q(20, 17, 3, 10, '#1D4ED8'); q(20, 17, 3, 2, '#1E40AF');
  q(24, 16, 5, 11, '#166534'); q(24, 16, 5, 2, '#14532D');
  q(30, 17, 4, 10, '#991B1B'); q(30, 17, 4, 2, '#7F1D1D');
  q(35, 16, 3, 11, '#854D0E'); q(35, 16, 3, 2, '#713F12');
  q(39, 17, 4, 10, '#1E40AF'); q(39, 17, 4, 2, '#1E3A8A');
  q(44, 16, 5, 11, '#065F46'); q(44, 16, 5, 2, '#064E3B');
  q(50, 17, 3, 10, '#831843'); q(50, 17, 3, 2, '#6B21A8');
  q(54, 16, 5, 11, '#374151'); q(54, 16, 5, 2, '#1F2937');
  q(5,  30, 4, 11, '#0E7490'); q(5,  30, 4, 2, '#0C6B7E');
  q(10, 31, 3, 10, '#B45309'); q(10, 31, 3, 2, '#92400E');
  q(14, 30, 5, 11, '#6D28D9'); q(14, 30, 5, 2, '#5B21B6');
  q(20, 30, 7, 8, '#1e293b');
  q(22, 32, 3, 3, '#3b82f6', 0.9);
  q(22, 32, 1, 3, '#60a5fa', 0.6);
  q(28, 31, 4, 10, '#DC2626'); q(28, 31, 4, 2, '#B91C1C');
  q(33, 30, 3, 11, '#065F46'); q(33, 30, 3, 2, '#064E3B');
  q(37, 31, 4, 10, '#1D4ED8'); q(37, 31, 4, 2, '#1E40AF');
  q(42, 35, 6, 6, '#92400E');
  q(43, 30, 4, 6, '#16a34a', 0.8);
  q(43, 29, 2, 3, '#15803d', 0.7);
  q(45, 28, 2, 4, '#16a34a', 0.6);
  q(49, 30, 3, 11, '#7C3AED'); q(49, 30, 3, 2, '#6D28D9');
  q(53, 31, 5, 10, '#B45309'); q(53, 31, 5, 2, '#92400E');
  q(2, 46, 60, 2, '#1a0a03');
  q(2, 0, 60, 2, '#4a2510');
  q(2,  0, 2, 48, '#2d1508');
  q(60, 0, 2, 48, '#2d1508');
}

/* Filing cabinet: 96x120 canvas (Q=2, 48x60 grid) */
export function drawCabinet(ctx: CanvasRenderingContext2D): void {
  ctx.clearRect(0, 0, 96, 120);
  const Q = 2;
  function q(x: number, y: number, w: number, h: number, c: string, a?: number): void {
    if (a !== undefined && a !== 1) ctx.globalAlpha = a;
    ctx.fillStyle = c;
    ctx.fillRect(x * Q, y * Q, w * Q, h * Q);
    if (a !== undefined && a !== 1) ctx.globalAlpha = 1;
  }
  q(2, 0, 44, 60, '#546E7A');
  q(2, 0, 44,  3, '#78909C');
  q(2, 57, 44, 3, '#37474F');
  q(2,  0,  2, 60, '#455A64');
  q(44, 0,  2, 60, '#37474F');
  q(5, 4, 38, 3, '#FFD54F', 0.5);
  q(6,  1, 2, 4, '#FFFDE7');
  q(10, 0, 2, 5, '#FFF9C4');
  q(14, 1, 2, 3, '#FFFDE7');
  q(18, 0, 2, 4, '#FFF8E1');
  q(5,  5, 38, 16, '#607D8B');
  q(5,  5, 38,  2, '#78909C');
  q(15, 12, 18, 4, '#37474F');
  q(22, 11,  4, 6, '#455A64');
  q(23, 13,  2, 2, '#B0BEC5');
  q(7, 14,  8, 5, '#B0BEC5');
  q(8, 15,  6, 1, '#607D8B');
  q(8, 17,  5, 1, '#607D8B');
  q(5, 23, 38, 16, '#607D8B');
  q(5, 23, 38,  2, '#78909C');
  q(15, 30, 18, 4, '#37474F');
  q(22, 29,  4, 6, '#455A64');
  q(23, 31,  2, 2, '#B0BEC5');
  q(7, 32,  8, 5, '#B0BEC5');
  q(8, 33,  6, 1, '#607D8B');
  q(8, 35,  4, 1, '#607D8B');
  q(5, 41, 38, 16, '#607D8B');
  q(5, 41, 38,  2, '#78909C');
  q(15, 48, 18, 4, '#37474F');
  q(22, 47,  4, 6, '#455A64');
  q(23, 49,  2, 2, '#B0BEC5');
  q(7, 50,  8, 5, '#B0BEC5');
  q(8, 51,  6, 1, '#607D8B');
  q(8, 53,  3, 1, '#607D8B');
}
