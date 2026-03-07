/* =========================================================
   FACILITY BLUEPRINTS — Declarative Pixel Data
   Converted from spriteDrawing.ts draw functions.
   ========================================================= */

import type { FacilityBlueprint } from '../engine/blueprint';
import { registerFacility } from '../engine/blueprint';

/* ── Meeting Table (160x80 canvas, Q=2, 80x40 grid) ───── */

const meetingTable: FacilityBlueprint = {
  canvasWidth: 160,
  canvasHeight: 80,
  scale: 2,
  pixels: [
    // Floor tint
    { x: 0, y: 0, w: 80, h: 40, c: '#1e2030' },
    // Table surface (oval approx)
    { x: 8, y: 8, w: 64, h: 24, c: '#6b5b4b' },
    { x: 4, y: 10, w: 72, h: 20, c: '#7d6d5d' },
    { x: 2, y: 12, w: 76, h: 16, c: '#7d6d5d' },
    // Edge highlights
    { x: 2, y: 12, w: 76, h: 2, c: '#8b7b6b' },
    { x: 2, y: 26, w: 76, h: 2, c: '#4b3b2b' },
    // Center inlay
    { x: 18, y: 14, w: 44, h: 12, c: '#6b5b4b', a: 0.5 },
    // Chairs — top row
    { x: 10, y: 2, w: 10, h: 6, c: '#78889c' },
    { x: 10, y: 2, w: 10, h: 1, c: '#8899ad' },
    { x: 24, y: 0, w: 10, h: 6, c: '#78889c' },
    { x: 24, y: 0, w: 10, h: 1, c: '#8899ad' },
    { x: 38, y: 2, w: 10, h: 6, c: '#78889c' },
    { x: 38, y: 2, w: 10, h: 1, c: '#8899ad' },
    { x: 54, y: 2, w: 10, h: 6, c: '#78889c' },
    { x: 54, y: 2, w: 10, h: 1, c: '#8899ad' },
    // Chairs — bottom row
    { x: 10, y: 32, w: 10, h: 6, c: '#78889c' },
    { x: 24, y: 34, w: 10, h: 6, c: '#78889c' },
    { x: 38, y: 32, w: 10, h: 6, c: '#78889c' },
    { x: 54, y: 32, w: 10, h: 6, c: '#78889c' },
    // Laptop on table
    { x: 28, y: 14, w: 14, h: 8, c: '#1a1a2e' },
    { x: 29, y: 15, w: 12, h: 6, c: '#1565C0', a: 0.5 },
    { x: 30, y: 16, w: 8, h: 1, c: '#60A5FA', a: 0.45 },
    { x: 30, y: 18, w: 5, h: 1, c: '#60A5FA', a: 0.3 },
    // Coffee mug
    { x: 58, y: 16, w: 5, h: 5, c: '#795548' },
    { x: 59, y: 17, w: 3, h: 3, c: '#A67C52' },
    { x: 63, y: 18, w: 2, h: 2, c: '#795548' },
    // Sticky note
    { x: 10, y: 16, w: 10, h: 8, c: '#FFEE58', a: 0.7 },
    { x: 11, y: 17, w: 8, h: 1, c: '#9E9E9E', a: 0.5 },
    { x: 11, y: 19, w: 8, h: 1, c: '#9E9E9E', a: 0.5 },
    { x: 11, y: 21, w: 6, h: 1, c: '#9E9E9E', a: 0.5 },
  ],
};

/* ── Bulletin Board (128x96 canvas, Q=2, 64x48 grid) ──── */

const bulletin: FacilityBlueprint = {
  canvasWidth: 128,
  canvasHeight: 96,
  scale: 2,
  pixels: [
    // Board background
    { x: 0, y: 0, w: 64, h: 48, c: '#4b3b2b' },
    { x: 3, y: 3, w: 58, h: 42, c: '#8B7355' },
    // Cork texture patches
    { x: 4, y: 4, w: 10, h: 10, c: '#A0845C', a: 0.5 },
    { x: 20, y: 8, w: 8, h: 8, c: '#A0845C', a: 0.4 },
    { x: 40, y: 6, w: 12, h: 6, c: '#A0845C', a: 0.3 },
    { x: 8, y: 30, w: 14, h: 10, c: '#A0845C', a: 0.25 },
    { x: 44, y: 32, w: 10, h: 8, c: '#A0845C', a: 0.3 },
    // Yellow sticky note
    { x: 6, y: 8, w: 18, h: 12, c: '#FFEE58' },
    { x: 5, y: 7, w: 3, h: 3, c: '#EF5350' },
    { x: 6, y: 7, w: 2, h: 2, c: '#C62828' },
    { x: 8, y: 10, w: 14, h: 1, c: '#9E9E9E' },
    { x: 8, y: 12, w: 12, h: 1, c: '#9E9E9E' },
    { x: 8, y: 14, w: 10, h: 1, c: '#9E9E9E' },
    // Blue card
    { x: 28, y: 6, w: 16, h: 14, c: '#B3E5FC' },
    { x: 35, y: 5, w: 3, h: 3, c: '#42A5F5' },
    { x: 36, y: 5, w: 2, h: 2, c: '#1565C0' },
    { x: 30, y: 9, w: 12, h: 1, c: '#9E9E9E' },
    { x: 30, y: 11, w: 10, h: 1, c: '#9E9E9E' },
    { x: 30, y: 13, w: 11, h: 1, c: '#9E9E9E' },
    // Green card
    { x: 8, y: 24, w: 16, h: 14, c: '#C8E6C9' },
    { x: 15, y: 23, w: 3, h: 3, c: '#66BB6A' },
    { x: 16, y: 23, w: 2, h: 2, c: '#388E3C' },
    { x: 10, y: 27, w: 12, h: 1, c: '#9E9E9E' },
    { x: 10, y: 29, w: 8, h: 1, c: '#9E9E9E' },
    { x: 10, y: 31, w: 10, h: 1, c: '#9E9E9E' },
    // Pink card
    { x: 28, y: 24, w: 28, h: 16, c: '#FFCDD2' },
    { x: 43, y: 23, w: 3, h: 3, c: '#EF5350' },
    { x: 44, y: 23, w: 2, h: 2, c: '#B71C1C' },
    { x: 32, y: 27, w: 24, h: 1, c: '#9E9E9E' },
    { x: 32, y: 29, w: 20, h: 1, c: '#9E9E9E' },
    { x: 32, y: 31, w: 22, h: 1, c: '#9E9E9E' },
    { x: 32, y: 33, w: 15, h: 1, c: '#9E9E9E' },
    // Frame top & bottom
    { x: 0, y: 0, w: 64, h: 3, c: '#5a4a3a' },
    { x: 0, y: 45, w: 64, h: 3, c: '#3a2a1a' },
  ],
};

/* ── Knowledge Bookshelf (128x96 canvas, Q=2, 64x48 grid) ── */

const knowledgeShelf: FacilityBlueprint = {
  canvasWidth: 128,
  canvasHeight: 96,
  scale: 2,
  pixels: [
    // Shelf body
    { x: 2, y: 0, w: 60, h: 48, c: '#3b1f0a' },
    { x: 4, y: 2, w: 56, h: 44, c: '#5a3310' },
    // Shelf dividers (horizontal)
    { x: 4, y: 13, w: 56, h: 2, c: '#2d1508' },
    { x: 4, y: 27, w: 56, h: 2, c: '#2d1508' },
    { x: 4, y: 41, w: 56, h: 2, c: '#2d1508' },
    // === Top shelf books ===
    { x: 5, y: 3, w: 4, h: 10, c: '#2563EB' },
    { x: 5, y: 3, w: 4, h: 2, c: '#1D4ED8' },
    { x: 10, y: 4, w: 3, h: 9, c: '#DC2626' },
    { x: 10, y: 4, w: 3, h: 2, c: '#B91C1C' },
    { x: 14, y: 3, w: 5, h: 10, c: '#16A34A' },
    { x: 14, y: 3, w: 5, h: 2, c: '#15803D' },
    { x: 20, y: 4, w: 3, h: 9, c: '#9333EA' },
    { x: 20, y: 4, w: 3, h: 2, c: '#7E22CE' },
    { x: 24, y: 3, w: 4, h: 10, c: '#D97706' },
    { x: 24, y: 3, w: 4, h: 2, c: '#B45309' },
    { x: 29, y: 4, w: 3, h: 9, c: '#0891B2' },
    { x: 29, y: 4, w: 3, h: 2, c: '#0E7490' },
    { x: 33, y: 3, w: 5, h: 10, c: '#BE123C' },
    { x: 33, y: 3, w: 5, h: 2, c: '#9F1239' },
    { x: 39, y: 4, w: 4, h: 9, c: '#4F46E5' },
    { x: 39, y: 4, w: 4, h: 2, c: '#3730A3' },
    { x: 44, y: 3, w: 3, h: 10, c: '#065F46' },
    { x: 44, y: 3, w: 3, h: 2, c: '#064E3B' },
    { x: 48, y: 4, w: 4, h: 9, c: '#92400E' },
    { x: 48, y: 4, w: 4, h: 2, c: '#78350F' },
    { x: 53, y: 3, w: 5, h: 10, c: '#1E3A5F' },
    { x: 53, y: 3, w: 5, h: 2, c: '#1e3060' },
    // Top shelf book spine highlights
    { x: 6, y: 6, w: 2, h: 1, c: '#BFDBFE', a: 0.7 },
    { x: 11, y: 7, w: 1, h: 1, c: '#FCA5A5', a: 0.7 },
    { x: 16, y: 6, w: 3, h: 1, c: '#BBF7D0', a: 0.7 },
    { x: 21, y: 7, w: 1, h: 1, c: '#D8B4FE', a: 0.7 },
    { x: 25, y: 6, w: 2, h: 1, c: '#FDE68A', a: 0.7 },
    // === Middle shelf books ===
    { x: 5, y: 16, w: 5, h: 11, c: '#0F766E' },
    { x: 5, y: 16, w: 5, h: 2, c: '#0D6056' },
    { x: 11, y: 17, w: 3, h: 10, c: '#C2410C' },
    { x: 11, y: 17, w: 3, h: 2, c: '#9A3412' },
    { x: 15, y: 16, w: 4, h: 11, c: '#7C3AED' },
    { x: 15, y: 16, w: 4, h: 2, c: '#6D28D9' },
    { x: 20, y: 17, w: 3, h: 10, c: '#1D4ED8' },
    { x: 20, y: 17, w: 3, h: 2, c: '#1E40AF' },
    { x: 24, y: 16, w: 5, h: 11, c: '#166534' },
    { x: 24, y: 16, w: 5, h: 2, c: '#14532D' },
    { x: 30, y: 17, w: 4, h: 10, c: '#991B1B' },
    { x: 30, y: 17, w: 4, h: 2, c: '#7F1D1D' },
    { x: 35, y: 16, w: 3, h: 11, c: '#854D0E' },
    { x: 35, y: 16, w: 3, h: 2, c: '#713F12' },
    { x: 39, y: 17, w: 4, h: 10, c: '#1E40AF' },
    { x: 39, y: 17, w: 4, h: 2, c: '#1E3A8A' },
    { x: 44, y: 16, w: 5, h: 11, c: '#065F46' },
    { x: 44, y: 16, w: 5, h: 2, c: '#064E3B' },
    { x: 50, y: 17, w: 3, h: 10, c: '#831843' },
    { x: 50, y: 17, w: 3, h: 2, c: '#6B21A8' },
    { x: 54, y: 16, w: 5, h: 11, c: '#374151' },
    { x: 54, y: 16, w: 5, h: 2, c: '#1F2937' },
    // === Bottom shelf books ===
    { x: 5, y: 30, w: 4, h: 11, c: '#0E7490' },
    { x: 5, y: 30, w: 4, h: 2, c: '#0C6B7E' },
    { x: 10, y: 31, w: 3, h: 10, c: '#B45309' },
    { x: 10, y: 31, w: 3, h: 2, c: '#92400E' },
    { x: 14, y: 30, w: 5, h: 11, c: '#6D28D9' },
    { x: 14, y: 30, w: 5, h: 2, c: '#5B21B6' },
    // Tablet/device
    { x: 20, y: 30, w: 7, h: 8, c: '#1e293b' },
    { x: 22, y: 32, w: 3, h: 3, c: '#3b82f6', a: 0.9 },
    { x: 22, y: 32, w: 1, h: 3, c: '#60a5fa', a: 0.6 },
    { x: 28, y: 31, w: 4, h: 10, c: '#DC2626' },
    { x: 28, y: 31, w: 4, h: 2, c: '#B91C1C' },
    { x: 33, y: 30, w: 3, h: 11, c: '#065F46' },
    { x: 33, y: 30, w: 3, h: 2, c: '#064E3B' },
    { x: 37, y: 31, w: 4, h: 10, c: '#1D4ED8' },
    { x: 37, y: 31, w: 4, h: 2, c: '#1E40AF' },
    // Plant pot
    { x: 42, y: 35, w: 6, h: 6, c: '#92400E' },
    { x: 43, y: 30, w: 4, h: 6, c: '#16a34a', a: 0.8 },
    { x: 43, y: 29, w: 2, h: 3, c: '#15803d', a: 0.7 },
    { x: 45, y: 28, w: 2, h: 4, c: '#16a34a', a: 0.6 },
    { x: 49, y: 30, w: 3, h: 11, c: '#7C3AED' },
    { x: 49, y: 30, w: 3, h: 2, c: '#6D28D9' },
    { x: 53, y: 31, w: 5, h: 10, c: '#B45309' },
    { x: 53, y: 31, w: 5, h: 2, c: '#92400E' },
    // Bottom edge
    { x: 2, y: 46, w: 60, h: 2, c: '#1a0a03' },
    // Top edge
    { x: 2, y: 0, w: 60, h: 2, c: '#4a2510' },
    // Side edges
    { x: 2, y: 0, w: 2, h: 48, c: '#2d1508' },
    { x: 60, y: 0, w: 2, h: 48, c: '#2d1508' },
  ],
};

/* ── Filing Cabinet (96x120 canvas, Q=2, 48x60 grid) ───── */

const cabinet: FacilityBlueprint = {
  canvasWidth: 96,
  canvasHeight: 120,
  scale: 2,
  pixels: [
    // Cabinet body
    { x: 2, y: 0, w: 44, h: 60, c: '#546E7A' },
    { x: 2, y: 0, w: 44, h: 3, c: '#78909C' },
    { x: 2, y: 57, w: 44, h: 3, c: '#37474F' },
    { x: 2, y: 0, w: 2, h: 60, c: '#455A64' },
    { x: 44, y: 0, w: 2, h: 60, c: '#37474F' },
    // Folder tabs on top
    { x: 5, y: 4, w: 38, h: 3, c: '#FFD54F', a: 0.5 },
    { x: 6, y: 1, w: 2, h: 4, c: '#FFFDE7' },
    { x: 10, y: 0, w: 2, h: 5, c: '#FFF9C4' },
    { x: 14, y: 1, w: 2, h: 3, c: '#FFFDE7' },
    { x: 18, y: 0, w: 2, h: 4, c: '#FFF8E1' },
    // === Drawer 1 (top) ===
    { x: 5, y: 5, w: 38, h: 16, c: '#607D8B' },
    { x: 5, y: 5, w: 38, h: 2, c: '#78909C' },
    { x: 15, y: 12, w: 18, h: 4, c: '#37474F' },
    { x: 22, y: 11, w: 4, h: 6, c: '#455A64' },
    { x: 23, y: 13, w: 2, h: 2, c: '#B0BEC5' },
    // Label area drawer 1
    { x: 7, y: 14, w: 8, h: 5, c: '#B0BEC5' },
    { x: 8, y: 15, w: 6, h: 1, c: '#607D8B' },
    { x: 8, y: 17, w: 5, h: 1, c: '#607D8B' },
    // === Drawer 2 (middle) ===
    { x: 5, y: 23, w: 38, h: 16, c: '#607D8B' },
    { x: 5, y: 23, w: 38, h: 2, c: '#78909C' },
    { x: 15, y: 30, w: 18, h: 4, c: '#37474F' },
    { x: 22, y: 29, w: 4, h: 6, c: '#455A64' },
    { x: 23, y: 31, w: 2, h: 2, c: '#B0BEC5' },
    // Label area drawer 2
    { x: 7, y: 32, w: 8, h: 5, c: '#B0BEC5' },
    { x: 8, y: 33, w: 6, h: 1, c: '#607D8B' },
    { x: 8, y: 35, w: 4, h: 1, c: '#607D8B' },
    // === Drawer 3 (bottom) ===
    { x: 5, y: 41, w: 38, h: 16, c: '#607D8B' },
    { x: 5, y: 41, w: 38, h: 2, c: '#78909C' },
    { x: 15, y: 48, w: 18, h: 4, c: '#37474F' },
    { x: 22, y: 47, w: 4, h: 6, c: '#455A64' },
    { x: 23, y: 49, w: 2, h: 2, c: '#B0BEC5' },
    // Label area drawer 3
    { x: 7, y: 50, w: 8, h: 5, c: '#B0BEC5' },
    { x: 8, y: 51, w: 6, h: 1, c: '#607D8B' },
    { x: 8, y: 53, w: 3, h: 1, c: '#607D8B' },
  ],
};

/* ── Register all facilities ───────────────────────────── */

registerFacility('meeting', meetingTable);
registerFacility('bulletin', bulletin);
registerFacility('decision', cabinet);
registerFacility('knowledge', knowledgeShelf);
