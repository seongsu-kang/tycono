/* =========================================================
   CHARACTER BLUEPRINT DATA
   Declarative pixel definitions for all 7 character sprites.
   Converted from spriteDrawing.ts draw functions.
   Grid: 32x40 logical pixels (canvas 64x80 at P=2 scale).
   ========================================================= */

import type { CharacterBlueprint } from '../engine/blueprint';
import { registerCharacter } from '../engine/blueprint';

/* ── CTO ──────────────────────────────────────────── */

const ctoBP: CharacterBlueprint = {
  width: 32,
  height: 40,
  layers: [
    {
      name: 'body',
      pixels: [
        // Head
        { x: 10, y: 0, w: 12, h: 10, c: '$skin' },
        // Body - shirt
        { x: 8, y: 10, w: 16, h: 14, c: '$shirt' },
        { x: 13, y: 10, w: 6, h: 3, c: 'darken($shirt, 20)' },
        // Shoulder badges
        { x: 8, y: 12, w: 4, h: 4, c: 'darken($shirt, 20)' },
        { x: 20, y: 12, w: 4, h: 4, c: 'darken($shirt, 20)' },
        // Arms
        { x: 2, y: 10, w: 6, h: 10, c: '$shirt' },
        { x: 24, y: 10, w: 6, h: 10, c: '$shirt' },
        // Hands
        { x: 2, y: 20, w: 6, h: 4, c: '$skin' },
        { x: 24, y: 20, w: 6, h: 4, c: '$skin' },
      ],
    },
    {
      name: 'hair',
      pixels: [
        // Hair (dark, neat)
        { x: 10, y: 0, w: 12, h: 3, c: '$hair' },
        { x: 8, y: 2, w: 2, h: 4, c: '$hair' },
        { x: 22, y: 2, w: 2, h: 4, c: '$hair' },
      ],
    },
    {
      name: 'face',
      pixels: [
        // Nose
        { x: 15, y: 7, w: 2, h: 1, c: 'darken($skin, 30)' },
      ],
    },
    {
      name: 'accessory',
      pixels: [
        // Glasses frame (rectangular)
        { x: 11, y: 4, w: 4, h: 3, c: '#2A3A50' },
        { x: 17, y: 4, w: 4, h: 3, c: '#2A3A50' },
        { x: 15, y: 5, w: 2, h: 1, c: '#4A5A70' },
        // Lens fill
        { x: 12, y: 5, w: 2, h: 2, c: '#0D1B2A' },
        { x: 18, y: 5, w: 2, h: 2, c: '#0D1B2A' },
        // Lens glint
        { x: 12, y: 5, w: 1, h: 1, c: '#60A5FA', a: 0.5 },
        { x: 18, y: 5, w: 1, h: 1, c: '#60A5FA', a: 0.5 },
      ],
    },
    {
      name: 'item',
      pixels: [
        // Laptop body
        { x: 4, y: 22, w: 24, h: 12, c: '#1A1A2A' },
        { x: 5, y: 23, w: 22, h: 9, c: '#0D1B3A' },
        // Screen glow lines
        { x: 7, y: 25, w: 18, h: 1, c: '#60A5FA', a: 0.75 },
        { x: 7, y: 27, w: 12, h: 1, c: '#60A5FA', a: 0.55 },
        { x: 7, y: 29, w: 15, h: 1, c: '#60A5FA', a: 0.60 },
        { x: 7, y: 31, w: 8, h: 1, c: '#34D399', a: 0.50 },
        // Laptop hinge line
        { x: 4, y: 33, w: 24, h: 2, c: '#111' },
      ],
    },
    {
      name: 'legs',
      pixels: [
        // Legs
        { x: 10, y: 24, w: 5, h: 10, c: '$pants' },
        { x: 17, y: 24, w: 5, h: 10, c: '$pants' },
        // Shoes
        { x: 9, y: 34, w: 7, h: 4, c: '$shoes' },
        { x: 16, y: 34, w: 7, h: 4, c: '$shoes' },
        { x: 9, y: 34, w: 7, h: 1, c: 'lighten($shoes, 20)' },
        { x: 16, y: 34, w: 7, h: 1, c: 'lighten($shoes, 20)' },
      ],
    },
  ],
};

/* ── CBO ──────────────────────────────────────────── */

const cboBP: CharacterBlueprint = {
  width: 32,
  height: 40,
  layers: [
    {
      name: 'body',
      pixels: [
        // Head
        { x: 10, y: 0, w: 12, h: 10, c: '$skin' },
        // Suit body
        { x: 8, y: 10, w: 16, h: 14, c: '$shirt' },
        // Shirt visible at center
        { x: 13, y: 10, w: 6, h: 14, c: 'lighten($shirt, 80)' },
        // Tie
        { x: 14, y: 11, w: 4, h: 12, c: 'darken($shirt, 30)' },
        { x: 15, y: 12, w: 2, h: 10, c: 'darken($shirt, 50)' },
        // Suit lapels
        { x: 8, y: 10, w: 5, h: 8, c: 'darken($shirt, 30)' },
        { x: 19, y: 10, w: 5, h: 8, c: 'darken($shirt, 30)' },
        // Arms
        { x: 2, y: 10, w: 6, h: 10, c: '$shirt' },
        { x: 24, y: 10, w: 6, h: 10, c: '$shirt' },
        // Cuffs
        { x: 2, y: 19, w: 6, h: 1, c: 'lighten($shirt, 80)' },
        { x: 24, y: 19, w: 6, h: 1, c: 'lighten($shirt, 80)' },
        // Hands
        { x: 2, y: 20, w: 6, h: 4, c: '$skin' },
        { x: 24, y: 20, w: 6, h: 4, c: '$skin' },
      ],
    },
    {
      name: 'hair',
      pixels: [
        // Hair (slicked back, dark)
        { x: 10, y: 0, w: 12, h: 2, c: '$hair' },
        { x: 8, y: 1, w: 2, h: 3, c: '$hair' },
        { x: 22, y: 1, w: 2, h: 3, c: '$hair' },
      ],
    },
    {
      name: 'face',
      pixels: [
        // Nose
        { x: 15, y: 7, w: 2, h: 1, c: 'darken($skin, 40)' },
      ],
    },
    {
      name: 'accessory',
      pixels: [
        // Glasses frame
        { x: 11, y: 4, w: 4, h: 3, c: '#333' },
        { x: 17, y: 4, w: 4, h: 3, c: '#333' },
        { x: 15, y: 5, w: 2, h: 1, c: '#555' },
        { x: 12, y: 5, w: 2, h: 2, c: '#222' },
        { x: 18, y: 5, w: 2, h: 2, c: '#222' },
      ],
    },
    {
      name: 'item',
      pixels: [
        // Briefcase body
        { x: 20, y: 20, w: 12, h: 9, c: '#4E342E' },
        { x: 21, y: 22, w: 10, h: 5, c: '#795548' },
        // Handle
        { x: 25, y: 19, w: 4, h: 3, c: '#4E342E' },
        { x: 25, y: 18, w: 4, h: 2, c: '#6D4C41' },
        // Clasp
        { x: 26, y: 24, w: 2, h: 2, c: '#FFD54F' },
        // Case highlight
        { x: 21, y: 22, w: 10, h: 1, c: '#6D4C41' },
      ],
    },
    {
      name: 'legs',
      pixels: [
        // Legs
        { x: 10, y: 24, w: 5, h: 10, c: '$pants' },
        { x: 17, y: 24, w: 5, h: 10, c: '$pants' },
        // Shoes
        { x: 9, y: 34, w: 7, h: 4, c: '$shoes' },
        { x: 16, y: 34, w: 7, h: 4, c: '$shoes' },
        { x: 9, y: 34, w: 7, h: 1, c: 'lighten($shoes, 20)' },
        { x: 16, y: 34, w: 7, h: 1, c: 'lighten($shoes, 20)' },
      ],
    },
  ],
};

/* ── PM ───────────────────────────────────────────── */

const pmBP: CharacterBlueprint = {
  width: 32,
  height: 40,
  layers: [
    {
      name: 'body',
      pixels: [
        // Head
        { x: 10, y: 0, w: 12, h: 10, c: '$skin' },
        // Body (shirt)
        { x: 8, y: 10, w: 16, h: 14, c: '$shirt' },
        // Pocket
        { x: 9, y: 13, w: 5, h: 5, c: 'darken($shirt, 20)' },
        // Arms
        { x: 2, y: 10, w: 6, h: 10, c: '$shirt' },
        { x: 24, y: 10, w: 6, h: 10, c: '$shirt' },
        // Hands
        { x: 2, y: 20, w: 6, h: 4, c: '$skin' },
        { x: 24, y: 20, w: 6, h: 4, c: '$skin' },
      ],
    },
    {
      name: 'hair',
      pixels: [
        // Hair (bun style)
        { x: 10, y: 0, w: 12, h: 3, c: '$hair' },
        { x: 8, y: 2, w: 2, h: 4, c: '$hair' },
        { x: 22, y: 2, w: 2, h: 4, c: '$hair' },
        // Bun on top
        { x: 13, y: 0, w: 6, h: 4, c: 'lighten($hair, 20)' },
        { x: 14, y: 0, w: 4, h: 2, c: 'lighten($hair, 40)' },
      ],
    },
    {
      name: 'face',
      pixels: [
        // Eyes
        { x: 12, y: 4, w: 2, h: 2, c: '#1A1A2E' },
        { x: 18, y: 4, w: 2, h: 2, c: '#1A1A2E' },
        // Eyelashes
        { x: 12, y: 3, w: 2, h: 1, c: 'darken($hair, 10)' },
        { x: 18, y: 3, w: 2, h: 1, c: 'darken($hair, 10)' },
        // Blush
        { x: 10, y: 6, w: 3, h: 2, c: '#FFCDD2', a: 0.6 },
        { x: 19, y: 6, w: 3, h: 2, c: '#FFCDD2', a: 0.6 },
        // Smile
        { x: 14, y: 7, w: 4, h: 1, c: '#C0392B' },
      ],
    },
    {
      name: 'accessory',
      pixels: [],
    },
    {
      name: 'item',
      pixels: [
        // Clipboard
        { x: 20, y: 14, w: 12, h: 14, c: '#F5F5F5' },
        { x: 20, y: 14, w: 12, h: 2, c: '#BDBDBD' },
        { x: 24, y: 13, w: 4, h: 3, c: '#9E9E9E' },
        // Clipboard lines
        { x: 22, y: 18, w: 8, h: 1, c: '#9E9E9E' },
        { x: 22, y: 20, w: 8, h: 1, c: '#9E9E9E' },
        { x: 22, y: 22, w: 6, h: 1, c: '#9E9E9E' },
        // Checkmark
        { x: 22, y: 24, w: 2, h: 1, c: '$shirt' },
        { x: 23, y: 25, w: 2, h: 1, c: '$shirt' },
        { x: 25, y: 23, w: 1, h: 2, c: '$shirt' },
      ],
    },
    {
      name: 'legs',
      pixels: [
        // Legs
        { x: 10, y: 24, w: 5, h: 10, c: '$pants' },
        { x: 17, y: 24, w: 5, h: 10, c: '$pants' },
        // Shoes
        { x: 9, y: 34, w: 7, h: 4, c: '$shoes' },
        { x: 16, y: 34, w: 7, h: 4, c: '$shoes' },
      ],
    },
  ],
};

/* ── Engineer ─────────────────────────────────────── */

const engineerBP: CharacterBlueprint = {
  width: 32,
  height: 40,
  layers: [
    {
      name: 'body',
      pixels: [
        // Head
        { x: 10, y: 0, w: 12, h: 10, c: '$skin' },
        // Body (hoodie)
        { x: 8, y: 10, w: 16, h: 14, c: '$shirt' },
        { x: 12, y: 18, w: 8, h: 4, c: 'darken($shirt, 20)' },
        // Hoodie strings
        { x: 13, y: 11, w: 2, h: 5, c: 'lighten($shirt, 20)' },
        { x: 17, y: 11, w: 2, h: 5, c: 'lighten($shirt, 20)' },
        // Arms
        { x: 2, y: 10, w: 6, h: 12, c: '$shirt' },
        { x: 24, y: 10, w: 6, h: 12, c: '$shirt' },
        // Hands
        { x: 2, y: 22, w: 6, h: 3, c: '$skin' },
        { x: 24, y: 22, w: 6, h: 3, c: '$skin' },
      ],
    },
    {
      name: 'hair',
      pixels: [
        // Hair (messy)
        { x: 10, y: 0, w: 12, h: 3, c: '$hair' },
        { x: 8, y: 1, w: 4, h: 4, c: '$hair' },
        { x: 20, y: 0, w: 4, h: 5, c: '$hair' },
        { x: 14, y: 0, w: 2, h: 2, c: 'lighten($hair, 30)' },
      ],
    },
    {
      name: 'face',
      pixels: [
        // Eyes
        { x: 12, y: 4, w: 2, h: 2, c: '#1A1A2E' },
        { x: 18, y: 4, w: 2, h: 2, c: '#1A1A2E' },
        // Eye shine
        { x: 12, y: 4, w: 1, h: 1, c: '#4A90D9', a: 0.7 },
        { x: 18, y: 4, w: 1, h: 1, c: '#4A90D9', a: 0.7 },
      ],
    },
    {
      name: 'accessory',
      pixels: [
        // Headphone band
        { x: 8, y: 0, w: 16, h: 3, c: 'darken($shirt, 10)' },
        // Headphone cups
        { x: 8, y: 2, w: 2, h: 6, c: 'lighten($shirt, 15)' },
        { x: 22, y: 2, w: 2, h: 6, c: 'lighten($shirt, 15)' },
        { x: 8, y: 3, w: 2, h: 4, c: 'lighten($shirt, 30)' },
        { x: 22, y: 3, w: 2, h: 4, c: 'lighten($shirt, 30)' },
      ],
    },
    {
      name: 'item',
      pixels: [
        // Keyboard
        { x: 4, y: 24, w: 24, h: 6, c: '#1A1A2E' },
        { x: 5, y: 25, w: 22, h: 4, c: '#252535' },
        // Keys
        { x: 6, y: 26, w: 3, h: 2, c: '#333' },
        { x: 10, y: 26, w: 3, h: 2, c: '#333' },
        { x: 14, y: 26, w: 5, h: 2, c: '$shirt' },
        { x: 20, y: 26, w: 3, h: 2, c: '#333' },
        { x: 24, y: 26, w: 3, h: 2, c: '#333' },
        // Key highlights
        { x: 6, y: 26, w: 3, h: 1, c: '#444' },
        { x: 14, y: 26, w: 5, h: 1, c: 'lighten($shirt, 20)' },
      ],
    },
    {
      name: 'legs',
      pixels: [
        // Legs
        { x: 10, y: 24, w: 5, h: 10, c: '$pants' },
        { x: 17, y: 24, w: 5, h: 10, c: '$pants' },
        // Sneakers
        { x: 8, y: 34, w: 8, h: 4, c: '$shoes' },
        { x: 16, y: 34, w: 8, h: 4, c: '$shoes' },
        { x: 8, y: 34, w: 8, h: 1, c: 'lighten($shoes, 20)' },
        { x: 16, y: 34, w: 8, h: 1, c: 'lighten($shoes, 20)' },
      ],
    },
  ],
};

/* ── Designer ─────────────────────────────────────── */

const designerBP: CharacterBlueprint = {
  width: 32,
  height: 40,
  layers: [
    {
      name: 'body',
      pixels: [
        // Head
        { x: 10, y: 0, w: 12, h: 10, c: '$skin' },
        // Body (shirt)
        { x: 8, y: 10, w: 16, h: 14, c: '$shirt' },
        { x: 13, y: 10, w: 6, h: 14, c: 'darken($shirt, 30)' },
        { x: 11, y: 11, w: 2, h: 4, c: 'lighten($shirt, 15)' },
        { x: 19, y: 11, w: 2, h: 4, c: 'lighten($shirt, 15)' },
        // Arms
        { x: 2, y: 10, w: 6, h: 10, c: '$shirt' },
        { x: 24, y: 10, w: 6, h: 10, c: '$shirt' },
        // Hands
        { x: 2, y: 20, w: 6, h: 4, c: '$skin' },
        { x: 24, y: 20, w: 6, h: 4, c: '$skin' },
      ],
    },
    {
      name: 'hair',
      pixels: [
        // Hair (dyed, stylish)
        { x: 8, y: 0, w: 16, h: 4, c: '$hair' },
        { x: 8, y: 3, w: 4, h: 5, c: 'lighten($hair, 15)' },
        { x: 20, y: 3, w: 4, h: 5, c: 'lighten($hair, 15)' },
        { x: 6, y: 2, w: 4, h: 3, c: '$hair' },
        { x: 22, y: 2, w: 4, h: 3, c: '$hair' },
      ],
    },
    {
      name: 'face',
      pixels: [
        // Eyes (with lashes)
        { x: 12, y: 4, w: 3, h: 2, c: '#1A1A2E' },
        { x: 18, y: 4, w: 3, h: 2, c: '#1A1A2E' },
        { x: 12, y: 3, w: 3, h: 1, c: '#1A1A2E' },
        { x: 18, y: 3, w: 3, h: 1, c: '#1A1A2E' },
        // Eye shine
        { x: 13, y: 4, w: 1, h: 1, c: '#FFF', a: 0.6 },
        { x: 19, y: 4, w: 1, h: 1, c: '#FFF', a: 0.6 },
        // Blush
        { x: 10, y: 6, w: 3, h: 2, c: '#FFCDD2', a: 0.7 },
        { x: 19, y: 6, w: 3, h: 2, c: '#FFCDD2', a: 0.7 },
      ],
    },
    {
      name: 'accessory',
      pixels: [],
    },
    {
      name: 'item',
      pixels: [
        // Palette (rounded shape approx)
        { x: 20, y: 18, w: 12, h: 10, c: '#F5F5F5' },
        { x: 19, y: 20, w: 2, h: 6, c: '#F5F5F5' },
        { x: 31, y: 20, w: 1, h: 4, c: '#F5F5F5' },
        // Thumb hole
        { x: 26, y: 19, w: 3, h: 3, c: '$skin' },
        // Color blobs
        { x: 21, y: 20, w: 3, h: 3, c: '#E53935' },
        { x: 25, y: 20, w: 3, h: 3, c: '#FFB300' },
        { x: 29, y: 20, w: 2, h: 3, c: '#43A047' },
        { x: 22, y: 24, w: 3, h: 3, c: '#1E88E5' },
        { x: 26, y: 24, w: 3, h: 3, c: '#8E24AA' },
        // Brush handle
        { x: 30, y: 14, w: 2, h: 8, c: '#795548' },
        // Brush bristle
        { x: 30, y: 22, w: 2, h: 4, c: '#F5F5F5' },
        { x: 30, y: 24, w: 2, h: 2, c: '#E53935' },
      ],
    },
    {
      name: 'legs',
      pixels: [
        // Legs
        { x: 10, y: 24, w: 5, h: 10, c: '$pants' },
        { x: 17, y: 24, w: 5, h: 10, c: '$pants' },
        // Shoes
        { x: 9, y: 34, w: 7, h: 4, c: '$shoes' },
        { x: 16, y: 34, w: 7, h: 4, c: '$shoes' },
      ],
    },
  ],
};

/* ── QA ───────────────────────────────────────────── */

const qaBP: CharacterBlueprint = {
  width: 32,
  height: 40,
  layers: [
    {
      name: 'body',
      pixels: [
        // Head
        { x: 10, y: 0, w: 12, h: 10, c: '$skin' },
        // Body (lab coat)
        { x: 8, y: 10, w: 16, h: 14, c: '$shirt' },
        // Lab coat front panels
        { x: 8, y: 10, w: 4, h: 14, c: 'darken($shirt, 15)' },
        { x: 20, y: 10, w: 4, h: 14, c: 'darken($shirt, 15)' },
        // Pocket protector
        { x: 9, y: 13, w: 3, h: 5, c: 'lighten($shirt, 10)' },
        { x: 10, y: 12, w: 1, h: 7, c: 'lighten($shirt, 60)' },
        { x: 11, y: 12, w: 1, h: 6, c: 'lighten($shirt, 50)' },
        // Arms
        { x: 2, y: 10, w: 6, h: 10, c: '$shirt' },
        { x: 24, y: 10, w: 6, h: 10, c: '$shirt' },
        // Hands
        { x: 2, y: 20, w: 6, h: 4, c: '$skin' },
        { x: 24, y: 20, w: 6, h: 4, c: '$skin' },
      ],
    },
    {
      name: 'hair',
      pixels: [
        // Hair (brown)
        { x: 10, y: 0, w: 12, h: 3, c: '$hair' },
        { x: 8, y: 2, w: 2, h: 3, c: '$hair' },
        { x: 22, y: 2, w: 2, h: 3, c: '$hair' },
      ],
    },
    {
      name: 'face',
      pixels: [
        // Eyebrows (furrowed)
        { x: 11, y: 3, w: 4, h: 1, c: '$hair' },
        { x: 17, y: 3, w: 4, h: 1, c: '$hair' },
        // Eyes (focused, narrow)
        { x: 12, y: 4, w: 2, h: 2, c: '#1A1A2E' },
        { x: 18, y: 4, w: 2, h: 2, c: '#1A1A2E' },
        // Nose
        { x: 15, y: 7, w: 2, h: 1, c: 'darken($skin, 30)' },
      ],
    },
    {
      name: 'accessory',
      pixels: [],
    },
    {
      name: 'item',
      pixels: [
        // Magnifying glass circle (ring)
        { x: 22, y: 13, w: 10, h: 10, c: 'lighten($shirt, 60)' },
        // Lens interior
        { x: 23, y: 14, w: 8, h: 8, c: '#1A2A3A' },
        // Lens tint
        { x: 24, y: 15, w: 6, h: 6, c: '#0D2A3A', a: 0.6 },
        // Glare
        { x: 24, y: 15, w: 2, h: 2, c: 'lighten($shirt, 80)', a: 0.8 },
        { x: 25, y: 16, w: 1, h: 1, c: '#FFF', a: 0.9 },
        // Handle
        { x: 30, y: 22, w: 2, h: 2, c: '#795548' },
        { x: 31, y: 24, w: 2, h: 2, c: '#795548' },
        { x: 30, y: 25, w: 2, h: 4, c: '#5D4037' },
      ],
    },
    {
      name: 'legs',
      pixels: [
        // Legs
        { x: 10, y: 24, w: 5, h: 10, c: '$pants' },
        { x: 17, y: 24, w: 5, h: 10, c: '$pants' },
        // Shoes
        { x: 9, y: 34, w: 7, h: 4, c: '$shoes' },
        { x: 16, y: 34, w: 7, h: 4, c: '$shoes' },
      ],
    },
  ],
};

/* ── Default ──────────────────────────────────────── */

const defaultBP: CharacterBlueprint = {
  width: 32,
  height: 40,
  layers: [
    {
      name: 'body',
      pixels: [
        // Head
        { x: 10, y: 0, w: 12, h: 10, c: '$skin' },
        // Body
        { x: 8, y: 10, w: 16, h: 14, c: '$shirt' },
        { x: 13, y: 10, w: 6, h: 3, c: 'darken($shirt, 15)' },
        // Arms
        { x: 2, y: 10, w: 6, h: 10, c: '$shirt' },
        { x: 24, y: 10, w: 6, h: 10, c: '$shirt' },
        // Hands
        { x: 2, y: 20, w: 6, h: 4, c: '$skin' },
        { x: 24, y: 20, w: 6, h: 4, c: '$skin' },
      ],
    },
    {
      name: 'hair',
      pixels: [
        // Hair
        { x: 10, y: 0, w: 12, h: 3, c: '$hair' },
        { x: 8, y: 2, w: 2, h: 4, c: '$hair' },
        { x: 22, y: 2, w: 2, h: 4, c: '$hair' },
      ],
    },
    {
      name: 'face',
      pixels: [
        // Eyes
        { x: 12, y: 4, w: 2, h: 2, c: 'darken($pants, 20)' },
        { x: 18, y: 4, w: 2, h: 2, c: 'darken($pants, 20)' },
      ],
    },
    {
      name: 'accessory',
      pixels: [],
    },
    {
      name: 'item',
      pixels: [],
    },
    {
      name: 'legs',
      pixels: [
        // Legs
        { x: 10, y: 24, w: 5, h: 10, c: '$pants' },
        { x: 17, y: 24, w: 5, h: 10, c: '$pants' },
        // Shoes
        { x: 9, y: 34, w: 7, h: 4, c: '$shoes' },
        { x: 16, y: 34, w: 7, h: 4, c: '$shoes' },
      ],
    },
  ],
};

/* ── Registration ─────────────────────────────────── */

registerCharacter('cto', ctoBP);
registerCharacter('cbo', cboBP);
registerCharacter('pm', pmBP);
registerCharacter('engineer', engineerBP);
registerCharacter('designer', designerBP);
registerCharacter('qa', qaBP);
registerCharacter('default', defaultBP);
