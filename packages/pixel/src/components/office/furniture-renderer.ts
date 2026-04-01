/* ═══════════════════════════════════════════
   Furniture Renderer — Draw functions + data-driven dispatch
   Extracted from TopDownOfficeView.tsx
   ═══════════════════════════════════════════ */

import type { FurnitureDef, FurnitureType } from './furniture-types';
import type { FloorLayout, RoomDef } from './floor-template';

/* ─── Canvas context (set externally) ───── */

let _ctx: CanvasRenderingContext2D;

export function setRenderContext(ctx: CanvasRenderingContext2D) { _ctx = ctx; }

/* ─── Drawing primitives ─────────────────── */

export function px(x: number, y: number, w: number, h: number, c: string, a?: number) {
  x = Math.round(x); y = Math.round(y);
  if (a !== undefined && a < 0.01) return;
  if (a !== undefined && a !== 1) _ctx.globalAlpha = a;
  _ctx.fillStyle = c; _ctx.fillRect(x, y, w, h);
  if (a !== undefined && a !== 1) _ctx.globalAlpha = 1;
}

export function dot(x: number, y: number, c: string, a?: number) { px(x, y, 1, 1, c, a); }

let _s = 1;
export function srand(s: number) { _s = s; }
export function rand() { _s = (_s * 16807) % 2147483647; return (_s & 0xffff) / 0xffff; }

/* ─── Color helpers ──────────────────────── */

export function hexToHsl(hex: string): [number, number, number] {
  const r = parseInt(hex.slice(1, 3), 16) / 255;
  const g = parseInt(hex.slice(3, 5), 16) / 255;
  const b = parseInt(hex.slice(5, 7), 16) / 255;
  const mx = Math.max(r, g, b), mn = Math.min(r, g, b);
  let h = 0, s = 0;
  const l = (mx + mn) / 2;
  if (mx !== mn) {
    const d = mx - mn;
    s = l > 0.5 ? d / (2 - mx - mn) : d / (mx + mn);
    if (mx === r) h = ((g - b) / d + (g < b ? 6 : 0)) / 6;
    else if (mx === g) h = ((b - r) / d + 2) / 6;
    else h = ((r - g) / d + 4) / 6;
  }
  return [h * 360, s * 100, l * 100];
}

export function hslToHex(h: number, s: number, l: number): string {
  h = ((h % 360) + 360) % 360;
  s = Math.max(0, Math.min(100, s)) / 100;
  l = Math.max(0, Math.min(100, l)) / 100;
  const a = s * Math.min(l, 1 - l);
  const f = (n: number) => { const k = (n + h / 30) % 12; return l - a * Math.max(-1, Math.min(k - 3, 9 - k, 1)); };
  const x = (v: number) => Math.round(v * 255).toString(16).padStart(2, '0');
  return '#' + x(f(0)) + x(f(8)) + x(f(4));
}

export function shadowOf(hex: string, amt = 1) { const [h, s, l] = hexToHsl(hex); return hslToHex(h + 15 * amt, Math.min(100, s + 8), l - 12 * amt); }
export function highlightOf(hex: string, amt = 1) { const [h, s, l] = hexToHsl(hex); return hslToHex(h - 10 * amt, s - 3, l + 10 * amt); }

/* ─── Material palettes (exported for desk/wall rendering) ── */

export const WD = { hi: '#D4AA5C', base: '#B08040', sh: '#7A5038', deep: '#4E3028' };
export const DW = { hi: '#8A6848', base: '#604832', sh: '#3A2E24', deep: '#2A1E18' };
export const CH_PAL = { hi: '#5A6A80', base: '#485868', sh: '#364858', deep: '#283848' };
export const SH = '#100A06';

/* ═══════════════════════════════════════════
   WALL DECORATION DRAW FUNCTIONS
   ═══════════════════════════════════════════ */

export function drawWindow(x: number, y: number, w = 14, h = 12) {
  px(x, y, w, h, '#4A3828'); px(x + 1, y + 1, w - 2, h - 2, '#5A4838');
  px(x + 2, y + 2, w - 4, h - 4, '#4A7098');
  px(x + 2, y + 2, w - 4, Math.floor((h - 4) / 2), '#6A90B8', 0.35);
  const mw = Math.floor(w / 2); px(x + mw, y + 1, 1, h - 2, '#4A3828');
  px(x + 1, y + Math.floor(h / 2), w - 2, 1, '#4A3828', 0.5);
  dot(x + 3, y + 3, '#8AB8E8', 0.35); dot(x + mw + 2, y + 3, '#8AB8E8', 0.25);
  px(x - 1, y + h, w + 2, 2, '#5A4838'); px(x - 1, y + h, w + 2, 1, highlightOf('#5A4838', 0.5), 0.35);
}

export function drawPicture(x: number, y: number, c: string) {
  px(x, y, 10, 8, '#3A2818'); px(x + 1, y + 1, 8, 6, c);
  px(x + 2, y + 2, 4, 3, highlightOf(c, 1.2), 0.3); dot(x + 3, y + 2, highlightOf(c, 2), 0.25);
}

export function drawClock(x: number, y: number) {
  px(x, y, 7, 7, '#3A2818'); px(x + 1, y + 1, 5, 5, '#F0EDE5');
  dot(x + 3, y + 1, '#AAA'); dot(x + 3, y + 5, '#AAA'); dot(x + 1, y + 3, '#AAA'); dot(x + 5, y + 3, '#AAA');
  dot(x + 3, y + 3, '#222'); px(x + 3, y + 1, 1, 2, '#333'); dot(x + 4, y + 3, '#D32F2F');
}

export function drawWhiteboard(x: number, y: number) {
  px(x, y, 26, 16, '#586878'); px(x + 1, y + 1, 24, 13, '#ECEFF1');
  px(x + 1, y + 1, 24, 1, '#F5F5F5', 0.4);
  px(x + 3, y + 3, 14, 1, '#1565C0', 0.6); px(x + 3, y + 5, 18, 1, '#333', 0.2);
  px(x + 3, y + 7, 12, 1, '#D32F2F', 0.35); px(x + 3, y + 9, 16, 1, '#333', 0.15);
  px(x + 1, y + 14, 24, 2, '#708898');
  px(x + 3, y + 14, 3, 1, '#D32F2F'); px(x + 7, y + 14, 3, 1, '#1565C0'); px(x + 11, y + 14, 3, 1, '#2E7D32');
}

export function drawBulletinBoard(x: number, y: number) {
  px(x, y, 22, 16, '#6A5030'); px(x + 1, y + 1, 20, 14, '#C4A66A');
  srand(88);
  for (let cy = 0; cy < 14; cy++) for (let cx = 0; cx < 20; cx++) {
    if (rand() > .5) dot(x + 1 + cx, y + 1 + cy, rand() > .5 ? '#B89858' : '#D4B87A', 0.18);
  }
  px(x + 2, y + 2, 5, 4, '#FFF176'); px(x + 8, y + 2, 5, 4, '#90CAF9'); px(x + 14, y + 3, 5, 4, '#CE93D8');
  px(x + 3, y + 8, 7, 4, '#C8E6C9'); px(x + 11, y + 8, 8, 4, '#F8BBD0');
  dot(x + 4, y + 2, '#E53935'); dot(x + 10, y + 2, '#1E88E5'); dot(x + 16, y + 3, '#FF9800');
}

export function drawShelf(x: number, y: number) {
  px(x, y, 20, 3, '#5A4030'); px(x, y, 20, 1, highlightOf('#5A4030', 0.5), 0.35);
  px(x, y + 2, 20, 1, shadowOf('#5A4030', 0.5), 0.3);
  px(x + 2, y - 4, 3, 4, '#E53935'); px(x + 2, y - 4, 3, 1, highlightOf('#E53935', 1), 0.3);
  px(x + 6, y - 3, 2, 3, '#1E88E5'); px(x + 9, y - 5, 4, 5, '#43A047');
  px(x + 14, y - 3, 3, 3, '#FFD54F'); dot(x + 15, y - 3, '#FFF176', 0.4);
}

export function drawScreen(x: number, y: number) {
  px(x, y, 16, 12, '#1E1E28'); px(x + 1, y + 1, 14, 9, '#0C1420');
  px(x + 2, y + 2, 12, 1, '#EF4444', 0.6);
  dot(x + 2, y + 4, '#4CAF50'); px(x + 4, y + 4, 7, 1, '#8b949e', 0.4);
  dot(x + 2, y + 6, '#FF9800'); px(x + 4, y + 6, 5, 1, '#8b949e', 0.3);
  dot(x + 2, y + 8, '#42A5F5'); px(x + 4, y + 8, 8, 1, '#8b949e', 0.25);
  px(x + 7, y + 10, 2, 2, '#1E1E28'); px(x + 5, y + 11, 6, 1, '#586878');
}

/* ═══════════════════════════════════════════
   FLOOR FURNITURE DRAW FUNCTIONS
   ═══════════════════════════════════════════ */

export function drawBookshelf(x: number, y: number, accent?: string) {
  px(x + 2, y + 20, 22, 2, SH, 0.15); px(x, y, 22, 20, DW.deep); px(x + 1, y + 1, 20, 18, DW.base);
  px(x, y, 22, 1, DW.hi, 0.35); px(x, y, 1, 20, DW.hi, 0.2);
  for (const sy of [6, 12]) { px(x + 1, y + sy, 20, 2, DW.sh); px(x + 1, y + sy, 20, 1, DW.hi, 0.2); }
  const cols = ['#E53935', '#1E88E5', '#43A047', '#8E24AA', '#FB8C00', '#00897B', '#5C6BC0'];
  let bx = x + 2;
  for (let i = 0; i < 5; i++) { const bw = 2 + (i % 2); px(bx, y + 1, bw, 5, cols[i]); px(bx, y + 1, bw, 1, highlightOf(cols[i], 1), 0.35); bx += bw + 1; }
  bx = x + 2; for (let i = 0; i < 4; i++) { px(bx, y + 7, 4, 5, cols[i + 3]); px(bx, y + 7, 4, 1, highlightOf(cols[i + 3], 1), 0.25); bx += 5; }
  px(x + 2, y + 14, 4, 4, '#FFD54F'); px(x + 8, y + 14, 7, 4, '#90CAF9');
  if (accent) { px(x, y - 1, 22, 1, accent, 0.7); }
}

export function drawPlant(x: number, y: number) {
  px(x + 2, y + 11, 6, 2, SH, 0.1); px(x + 2, y + 8, 6, 4, '#8B5E3C');
  px(x + 1, y + 7, 8, 2, shadowOf('#A06E48', 0.3)); px(x + 2, y + 7, 6, 1, highlightOf('#A06E48', 0.5), 0.4);
  px(x + 1, y + 3, 3, 4, '#2E7D32'); px(x + 5, y + 2, 3, 4, '#2E7D32');
  px(x + 2, y + 1, 4, 4, '#43A047'); px(x + 3, y + 0, 3, 3, '#66BB6A');
  dot(x + 4, y, '#81C784'); dot(x + 3, y + 1, '#A5D6A7', 0.4);
}

export function drawMeetingTable(x: number, y: number) {
  drawChair(x + 4, y - 4, 'down'); drawChair(x + 16, y - 4, 'down'); drawChair(x + 28, y - 4, 'down');
  px(x + 3, y + 24, 34, 3, SH, 0.15);
  px(x, y + 2, 36, 18, WD.deep); px(x + 1, y + 3, 34, 16, WD.base);
  px(x + 1, y + 3, 34, 1, WD.hi, 0.35);
  for (let g = 0; g < 14; g += 3) px(x + 1, y + 4 + g, 34, 1, shadowOf(WD.base, 0.2), 0.08);
  px(x, y + 20, 36, 4, WD.deep); px(x + 1, y + 21, 34, 2, WD.sh);
  px(x + 6, y + 7, 10, 6, '#1A1A24'); px(x + 7, y + 8, 8, 4, '#0C1420');
  px(x + 8, y + 9, 4, 1, '#2A6898', 0.4);
  px(x + 20, y + 8, 6, 4, '#F0F0F0'); px(x + 15, y + 7, 3, 3, '#ECEFF1'); dot(x + 16, y + 8, '#795548');
  drawChair(x + 4, y + 24, 'up'); drawChair(x + 16, y + 24, 'up'); drawChair(x + 28, y + 24, 'up');
}

export function drawSofa(x: number, y: number) {
  px(x + 2, y + 16, 36, 3, SH, 0.15);
  px(x, y, 36, 5, '#5D4037'); px(x + 1, y + 1, 34, 3, '#6D4C41');
  px(x + 1, y + 1, 34, 1, highlightOf('#6D4C41', 0.5), 0.3);
  px(x, y + 5, 36, 8, '#5D4037');
  px(x + 2, y + 6, 15, 6, '#6D4C41'); px(x + 3, y + 6, 13, 1, highlightOf('#6D4C41', 0.5), 0.35);
  px(x + 19, y + 6, 15, 6, '#6D4C41'); px(x + 20, y + 6, 13, 1, highlightOf('#6D4C41', 0.5), 0.35);
  px(x + 17, y + 6, 2, 6, '#5D4037');
  px(x, y + 13, 36, 3, shadowOf('#5D4037', 1));
  px(x - 2, y + 2, 3, 12, '#5D4037'); px(x + 35, y + 2, 3, 12, '#5D4037');
  px(x + 4, y + 7, 6, 4, '#FF8A65'); px(x + 5, y + 7, 4, 1, highlightOf('#FF8A65', 1), 0.35);
}

export function drawCoffeeTable(x: number, y: number) {
  px(x + 2, y + 10, 22, 2, SH, 0.12);
  px(x, y, 22, 8, DW.deep); px(x + 1, y + 1, 20, 6, DW.base);
  px(x + 1, y + 1, 20, 1, DW.hi, 0.3); px(x, y + 8, 22, 2, DW.sh);
  px(x + 3, y + 2, 6, 4, '#F0F0F0'); px(x + 13, y + 3, 3, 3, '#ECEFF1'); dot(x + 14, y + 4, '#795548');
}

export function drawCoffeeMachine(x: number, y: number) {
  px(x + 1, y + 14, 10, 2, SH, 0.12);
  px(x, y, 10, 14, '#546E7A'); px(x, y, 10, 1, highlightOf('#546E7A', 1), 0.35);
  px(x + 1, y + 1, 8, 3, '#78909C'); px(x + 1, y + 5, 8, 4, '#37474F');
  dot(x + 2, y + 6, '#EF5350'); dot(x + 4, y + 6, '#66BB6A');
  px(x + 2, y + 11, 4, 2, '#ECEFF1');
}

/* ═══════════════════════════════════════════
   SPECIAL FURNITURE DRAW FUNCTIONS
   ═══════════════════════════════════════════ */

export function drawAquarium(x: number, y: number) {
  px(x + 2, y + 18, 28, 3, SH, 0.12);
  // Tank frame
  px(x, y, 28, 18, '#37474F'); px(x + 1, y + 1, 26, 15, '#0D47A1');
  // Water
  px(x + 2, y + 2, 24, 13, '#1565C0'); px(x + 2, y + 2, 24, 4, '#1976D2', 0.4);
  // Sand bottom
  px(x + 2, y + 12, 24, 3, '#F9A825', 0.35);
  // Plants
  px(x + 4, y + 8, 2, 5, '#2E7D32'); px(x + 6, y + 9, 2, 4, '#43A047');
  px(x + 20, y + 7, 2, 6, '#2E7D32'); px(x + 22, y + 8, 2, 5, '#388E3C');
  // Fish
  px(x + 9, y + 5, 4, 2, '#FF8A65'); dot(x + 12, y + 5, '#FF5722');
  px(x + 16, y + 8, 3, 2, '#FFD54F'); dot(x + 15, y + 8, '#FFC107');
  // Bubbles
  dot(x + 13, y + 3, '#90CAF9', 0.5); dot(x + 14, y + 4, '#BBDEFB', 0.35);
  dot(x + 8, y + 3, '#BBDEFB', 0.3);
  // Stand
  px(x, y + 16, 28, 2, '#455A64'); px(x + 1, y + 16, 26, 1, highlightOf('#455A64', 0.5), 0.3);
}

export function drawNeonSign(x: number, y: number) {
  // Backing plate
  px(x, y, 24, 10, '#1A1A2E');
  // Neon glow effect (outer)
  px(x + 2, y + 1, 20, 8, '#E040FB', 0.15);
  // "OPEN" text in neon
  // O
  px(x + 3, y + 2, 4, 6, '#E040FB', 0.7); px(x + 4, y + 3, 2, 4, '#1A1A2E');
  // P
  px(x + 8, y + 2, 1, 6, '#00E5FF', 0.7); px(x + 8, y + 2, 4, 1, '#00E5FF', 0.7);
  px(x + 8, y + 4, 4, 1, '#00E5FF', 0.7); px(x + 11, y + 2, 1, 3, '#00E5FF', 0.7);
  // E
  px(x + 13, y + 2, 1, 6, '#E040FB', 0.7); px(x + 13, y + 2, 4, 1, '#E040FB', 0.7);
  px(x + 13, y + 4, 3, 1, '#E040FB', 0.7); px(x + 13, y + 7, 4, 1, '#E040FB', 0.7);
  // N
  px(x + 18, y + 2, 1, 6, '#00E5FF', 0.7); px(x + 21, y + 2, 1, 6, '#00E5FF', 0.7);
  px(x + 19, y + 3, 1, 2, '#00E5FF', 0.5); px(x + 20, y + 5, 1, 2, '#00E5FF', 0.5);
}

export function drawArcade(x: number, y: number) {
  px(x + 2, y + 28, 16, 3, SH, 0.15);
  // Cabinet body
  px(x, y, 16, 28, '#1A237E'); px(x + 1, y + 1, 14, 3, '#283593');
  // Screen
  px(x + 2, y + 4, 12, 10, '#0D1117'); px(x + 3, y + 5, 10, 8, '#1B5E20');
  // Game pixels on screen
  px(x + 5, y + 6, 2, 2, '#4CAF50'); px(x + 9, y + 8, 2, 2, '#FF5722');
  px(x + 7, y + 10, 3, 1, '#FFD54F'); dot(x + 6, y + 7, '#81C784');
  // Controls panel
  px(x + 1, y + 14, 14, 6, '#1A237E');
  px(x + 2, y + 15, 4, 4, '#212121'); // joystick area
  dot(x + 4, y + 16, '#F44336'); // joystick
  dot(x + 9, y + 16, '#F44336'); dot(x + 11, y + 16, '#2196F3'); // buttons
  dot(x + 10, y + 18, '#FFEB3B');
  // Base
  px(x, y + 20, 16, 8, '#0D47A1'); px(x + 1, y + 21, 14, 6, '#1565C0');
  // Side art stripe
  px(x, y + 4, 1, 14, '#FF4081', 0.4); px(x + 15, y + 4, 1, 14, '#FF4081', 0.4);
}

export function drawJukebox(x: number, y: number) {
  px(x + 2, y + 24, 20, 3, SH, 0.15);
  // Body
  px(x, y, 20, 24, '#4E342E'); px(x + 1, y + 1, 18, 22, '#5D4037');
  // Top dome
  px(x + 2, y + 1, 16, 4, '#FF6F00'); px(x + 3, y + 2, 14, 2, '#FF8F00', 0.6);
  // Display window (records visible)
  px(x + 2, y + 5, 16, 10, '#1A1A2E'); px(x + 3, y + 6, 14, 8, '#212121');
  // Record discs
  px(x + 4, y + 7, 4, 4, '#333'); px(x + 5, y + 8, 2, 2, '#E53935');
  px(x + 10, y + 7, 4, 4, '#333'); px(x + 11, y + 8, 2, 2, '#1E88E5');
  // Speaker grille
  px(x + 3, y + 16, 14, 6, '#3E2723');
  for (let i = 0; i < 7; i++) px(x + 4 + i * 2, y + 17, 1, 4, '#5D4037', 0.5);
  // Chrome trim
  px(x + 1, y + 5, 18, 1, '#FFD54F', 0.5); px(x + 1, y + 15, 18, 1, '#FFD54F', 0.5);
}

export function drawTrophyCase(x: number, y: number) {
  px(x + 2, y + 22, 22, 2, SH, 0.12);
  // Glass case frame
  px(x, y, 22, 22, DW.deep); px(x + 1, y + 1, 20, 20, '#37474F');
  // Glass
  px(x + 2, y + 2, 18, 18, '#546E7A', 0.3);
  // Shelves
  px(x + 1, y + 10, 20, 1, DW.base); px(x + 1, y + 10, 20, 1, DW.hi, 0.2);
  // Trophy 1 (gold cup)
  px(x + 4, y + 3, 4, 5, '#FFD54F'); px(x + 5, y + 4, 2, 3, '#FFC107');
  px(x + 4, y + 7, 4, 1, '#FFA000'); dot(x + 5, y + 3, '#FFF176', 0.5);
  // Trophy 2 (silver star)
  px(x + 13, y + 4, 4, 4, '#B0BEC5'); px(x + 14, y + 3, 2, 1, '#CFD8DC');
  dot(x + 14, y + 5, '#ECEFF1', 0.6);
  // Trophy 3 (bronze medal)
  px(x + 5, y + 12, 3, 3, '#A1887F'); px(x + 6, y + 11, 1, 1, '#D7CCC8');
  // Trophy 4 (plaque)
  px(x + 12, y + 12, 6, 4, '#5D4037'); px(x + 13, y + 13, 4, 2, '#FFD54F', 0.6);
  // Glass reflection
  px(x + 2, y + 2, 2, 18, '#fff', 0.08);
}

export function drawDesk(x: number, y: number) {
  px(x + 2, y + 16, 26, 3, SH, 0.18);
  px(x, y, 26, 10, WD.deep); px(x + 1, y + 1, 24, 8, WD.base);
  px(x + 1, y + 2, 24, 1, WD.hi, 0.2); px(x + 1, y + 4, 24, 1, shadowOf(WD.base, 0.2), 0.1);
  px(x + 1, y + 6, 24, 1, WD.hi, 0.15); px(x + 1, y + 1, 24, 1, WD.hi, 0.4); px(x + 1, y + 1, 1, 8, WD.hi, 0.2);
  px(x, y + 10, 26, 5, WD.deep); px(x + 1, y + 11, 24, 3, WD.sh);
  px(x + 1, y + 10, 24, 1, shadowOf(WD.base, 1.5), 0.4); px(x + 1, y + 14, 24, 1, WD.base, 0.15);
  px(x + 2, y + 12, 10, 1, WD.deep, 0.4); px(x + 14, y + 12, 10, 1, WD.deep, 0.4);
  dot(x + 7, y + 11, '#C8D0D8', 0.6); dot(x + 19, y + 11, '#C8D0D8', 0.6);
  // Monitor
  px(x + 6, y - 5, 14, 7, '#1E1E28'); px(x + 7, y - 4, 12, 5, '#0C1420');
  px(x + 8, y - 3, 5, 1, '#2A6898', 0.6); px(x + 8, y - 2, 8, 1, '#1A3858', 0.4);
  px(x + 8, y - 1, 3, 1, '#2A6898', 0.35); dot(x + 7, y - 4, '#4A98D8', 0.25);
  dot(x + 12, y + 1, '#4CAF50', 0.4); px(x + 12, y + 2, 2, 3, '#586878'); px(x + 10, y + 4, 6, 1, '#8898A8');
  // Keyboard
  px(x + 6, y + 4, 12, 4, '#222228'); px(x + 6, y + 4, 12, 1, '#333338', 0.4);
  for (let k = 0; k < 5; k++) { dot(x + 7 + k * 2, y + 5, '#444', 0.6); dot(x + 7 + k * 2, y + 6, '#3A3A3E', 0.4); }
  px(x + 20, y + 5, 3, 4, '#333338'); px(x + 20, y + 5, 3, 1, '#444448');
  // Papers
  px(x + 1, y + 3, 4, 4, '#F0EDE8'); px(x + 1, y + 3, 4, 1, '#F8F6F2'); dot(x + 2, y + 5, '#6D4C41');
}

export function drawChair(x: number, y: number, facing: 'up' | 'down') {
  px(x + 1, y + 9, 10, 2, SH, 0.1);
  dot(x + 5, y + 9, '#1E1E22'); dot(x + 1, y + 10, '#1A1A1E'); dot(x + 9, y + 10, '#1A1A1E');
  dot(x + 3, y + 11, '#1A1A1E'); dot(x + 7, y + 11, '#1A1A1E');
  px(x + 1, y + 2, 8, 6, CH_PAL.base); px(x + 2, y + 3, 6, 4, CH_PAL.hi, 0.35);
  px(x + 2, y + 3, 6, 1, highlightOf(CH_PAL.hi, 0.5), 0.25); px(x + 1, y + 7, 8, 1, CH_PAL.deep);
  if (facing === 'up') { px(x, y + 7, 10, 3, CH_PAL.deep); px(x + 1, y + 8, 8, 1, CH_PAL.sh); }
  else { px(x, y - 1, 10, 3, CH_PAL.deep); px(x + 1, y, 8, 1, CH_PAL.sh); }
  px(x, y + 3, 1, 4, CH_PAL.sh); px(x + 9, y + 3, 1, 4, CH_PAL.sh);
}

/* ═══════════════════════════════════════════
   DATA-DRIVEN DISPATCH
   ═══════════════════════════════════════════ */

type DrawFn = (x: number, y: number, def: FurnitureDef) => void;

const DRAW_MAP: Record<FurnitureType, DrawFn> = {
  'bookshelf':      (x, y, def) => drawBookshelf(x, y, def.accent),
  'plant':          (x, y) => drawPlant(x, y),
  'meeting-table':  (x, y) => drawMeetingTable(x, y),
  'sofa':           (x, y) => drawSofa(x, y),
  'coffee-table':   (x, y) => drawCoffeeTable(x, y),
  'coffee-machine': (x, y) => drawCoffeeMachine(x, y),
  'window':         (x, y, def) => drawWindow(x, y, def.windowW ?? 16, def.windowH ?? 14),
  'picture':        (x, y, def) => drawPicture(x, y, def.pictureColor ?? '#1565C0'),
  'clock':          (x, y) => drawClock(x, y),
  'whiteboard':     (x, y) => drawWhiteboard(x, y),
  'bulletin-board': (x, y) => drawBulletinBoard(x, y),
  'shelf':          (x, y) => drawShelf(x, y),
  'screen':         (x, y) => drawScreen(x, y),
  'aquarium':       (x, y) => drawAquarium(x, y),
  'neon-sign':      (x, y) => drawNeonSign(x, y),
  'arcade':         (x, y) => drawArcade(x, y),
  'jukebox':        (x, y) => drawJukebox(x, y),
  'trophy-case':    (x, y) => drawTrophyCase(x, y),
};

/** Resolve absolute position from room-relative offset */
export function resolvePos(def: FurnitureDef, room: RoomDef): { x: number; y: number } {
  const baseX = def.zone === 'wall' ? room.wx : room.fx;
  const baseY = def.zone === 'wall' ? room.wy : room.fy;
  const x = def.anchorX === 'right'
    ? (def.zone === 'wall' ? room.wx + room.ww : room.fx + room.fw) + def.offsetX
    : baseX + def.offsetX;
  return { x, y: baseY + def.offsetY };
}

/** Render wall decorations immediately (no Y-sorting needed) */
export function renderWallDecorations(layout: FloorLayout): void {
  for (const def of layout.wallDecorations) {
    const room = layout.rooms[def.room];
    if (!room) continue;
    const { x, y } = resolvePos(def, room);
    const drawFn = DRAW_MAP[def.type];
    if (drawFn) drawFn(x, y, def);
  }
}

/** Push floor furniture into Y-sorted entity list */
export function pushFurnitureEntities(
  layout: FloorLayout,
  entities: { y: number; draw: () => void }[],
  deskRooms: Set<string>,
): void {
  for (const def of layout.furniture) {
    const room = layout.rooms[def.room];
    if (!room) continue;
    if (def.condition === 'no-desks' && deskRooms.has(def.room)) continue;
    const { x, y } = resolvePos(def, room);
    const drawFn = DRAW_MAP[def.type];
    if (drawFn) {
      entities.push({ y, draw: () => drawFn(x, y, def) });
    }
  }
}

/** Build FacilityDef[] from furniture data (replaces manual buildFacilityZones) */
export interface FacilityZone {
  id: string;
  label: string;
  icon: string;
  color: string;
  dx: number; dy: number;
  pw: number; ph: number;
}

export function buildFacilityZonesFromFurniture(layout: FloorLayout): FacilityZone[] {
  const zones: FacilityZone[] = [];
  const allDefs = [...layout.wallDecorations, ...layout.furniture];
  for (const def of allDefs) {
    if (!def.facility) continue;
    const room = layout.rooms[def.room];
    if (!room) continue;
    const { x, y } = resolvePos(def, room);
    zones.push({
      id: def.facility.id,
      label: def.facility.label,
      icon: def.facility.icon,
      color: def.facility.color,
      dx: x, dy: y,
      pw: def.facility.hitW,
      ph: def.facility.hitH,
    });
  }
  return zones;
}

/* ═══════════════════════════════════════════
   EDIT MODE HELPERS
   ═══════════════════════════════════════════ */

/** Approximate bounding box for each furniture type */
const FURNITURE_BOUNDS: Record<FurnitureType, { w: number; h: number }> = {
  'bookshelf': { w: 22, h: 20 },
  'plant': { w: 10, h: 12 },
  'meeting-table': { w: 36, h: 28 },
  'sofa': { w: 38, h: 16 },
  'coffee-table': { w: 22, h: 10 },
  'coffee-machine': { w: 10, h: 14 },
  'window': { w: 16, h: 14 },
  'picture': { w: 10, h: 8 },
  'clock': { w: 7, h: 7 },
  'whiteboard': { w: 26, h: 16 },
  'bulletin-board': { w: 22, h: 16 },
  'shelf': { w: 20, h: 8 },
  'screen': { w: 16, h: 12 },
  'aquarium': { w: 28, h: 18 },
  'neon-sign': { w: 24, h: 10 },
  'arcade': { w: 16, h: 28 },
  'jukebox': { w: 20, h: 24 },
  'trophy-case': { w: 22, h: 22 },
};

export function getFurnitureBounds(type: FurnitureType): { w: number; h: number } {
  return FURNITURE_BOUNDS[type] ?? { w: 16, h: 16 };
}

/** Hit-test floor furniture at canvas coords (mx, my). Returns def id or null. */
export function hitTestFurniture(
  layout: FloorLayout, mx: number, my: number, deskRooms: Set<string>,
): string | null {
  // Check floor furniture (reverse order = top items first)
  for (let i = layout.furniture.length - 1; i >= 0; i--) {
    const def = layout.furniture[i];
    const room = layout.rooms[def.room];
    if (!room) continue;
    if (def.condition === 'no-desks' && deskRooms.has(def.room)) continue;
    const { x, y } = resolvePos(def, room);
    const b = getFurnitureBounds(def.type);
    if (mx >= x && mx <= x + b.w && my >= y && my <= y + b.h) return def.id;
  }
  // Check wall decorations too
  for (let i = layout.wallDecorations.length - 1; i >= 0; i--) {
    const def = layout.wallDecorations[i];
    const room = layout.rooms[def.room];
    if (!room) continue;
    const { x, y } = resolvePos(def, room);
    const b = getFurnitureBounds(def.type);
    if (mx >= x && mx <= x + b.w && my >= y && my <= y + b.h) return def.id;
  }
  return null;
}

/** Draw edit-mode highlight around a furniture piece */
export function drawFurnitureHighlight(
  ctx: CanvasRenderingContext2D,
  layout: FloorLayout,
  defId: string,
  color: string,
  deskRooms: Set<string>,
): void {
  const allDefs = [...layout.wallDecorations, ...layout.furniture];
  const def = allDefs.find(d => d.id === defId);
  if (!def) return;
  if (def.condition === 'no-desks' && deskRooms.has(def.room)) return;
  const room = layout.rooms[def.room];
  if (!room) return;
  const { x, y } = resolvePos(def, room);
  const b = getFurnitureBounds(def.type);
  ctx.save();
  // Semi-transparent fill
  ctx.fillStyle = color;
  ctx.globalAlpha = 0.2;
  ctx.fillRect(x - 1, y - 1, b.w + 2, b.h + 2);
  // Solid border
  ctx.globalAlpha = 0.9;
  ctx.strokeStyle = color;
  ctx.lineWidth = 1;
  ctx.strokeRect(x - 0.5, y - 0.5, b.w + 1, b.h + 1);
  ctx.restore();
}

/** Draw edit-mode highlight around a desk (26×40 bounding box) */
export function drawDeskHighlight(
  ctx: CanvasRenderingContext2D,
  dx: number, dy: number,
  color: string,
): void {
  const w = 26, h = 40;
  ctx.save();
  ctx.fillStyle = color;
  ctx.globalAlpha = 0.2;
  ctx.fillRect(dx - 1, dy - 1, w + 2, h + 2);
  ctx.globalAlpha = 0.9;
  ctx.strokeStyle = color;
  ctx.lineWidth = 1;
  ctx.strokeRect(dx - 0.5, dy - 0.5, w + 1, h + 1);
  ctx.restore();
}

/** Hit-test desks at canvas coords. Returns role id or null. */
export function hitTestDesks(
  desks: Record<string, { dx: number; dy: number }>,
  mx: number, my: number,
): string | null {
  for (const [roleId, d] of Object.entries(desks)) {
    if (mx >= d.dx && mx <= d.dx + 26 && my >= d.dy && my <= d.dy + 40) return roleId;
  }
  return null;
}
