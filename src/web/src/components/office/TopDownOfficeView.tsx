import { useRef, useEffect, useCallback, useMemo } from 'react';
import type { Role, Project, Wave, Standup, Decision } from '../../types/index';
import type { CharacterAppearance } from '../../types/appearance';
import { getDefaultAppearance } from '../../types/appearance';
import { getCharacterBlueprint, renderPixelsAt, getAccessory, getHairStyle, getOutfitStyle } from './sprites/engine';
import { applyStyles } from './TopDownCharCanvas';
import './sprites/data'; // trigger blueprint registration
import { WALK_FRAMES } from './sprites/data/walk-frames-mini';
import type { WalkDirection } from './sprites/data/walk-frames-mini';

/* ═══════════════════════════════════════════
   TopDown 3/4 Office View
   Based on POC office-topdown-v3.html
   288x208 canvas, 4 rooms, pixel art
   ═══════════════════════════════════════════ */

/* ─── Props ─────────────────────────────── */

interface TopDownOfficeViewProps {
  roles: Role[];
  projects: Project[];
  waves: Wave[];
  standups: Standup[];
  decisions: Decision[];
  roleStatuses: Record<string, string>;
  activeExecs: { roleId: string; task: string; id?: string; startedAt?: string }[];
  onRoleClick: (roleId: string) => void;
  onProjectClick: (projectId: string) => void;
  onBulletinClick: () => void;
  onDecisionsClick: () => void;
  onKnowledgeClick: () => void;
  knowledgeDocsCount: number;
  getRoleSpeech: (roleId: string) => string;
  getAppearance?: (roleId: string) => CharacterAppearance;
  onCustomize?: (roleId: string) => void;
}

/* ─── Canvas constants ──────────────────── */

const T = 16;
const AW = 288, AH = 208;
const DEFAULT_ZOOM = 4;

const BORDER = 4;
const WALL_H = 28;
const BASEBOARD = 2;
const DIV_H = 4;
const MID_X = AW / 2;
const SIDE_W = 4;

/* ─── Room layout ───────────────────────── */

interface RoomDef {
  wx: number; wy: number; ww: number; wh: number;
  fx: number; fy: number; fw: number; fh: number;
  wallColor: string; baseboardColor: string;
}

const ROOMS: Record<string, RoomDef> = {
  exec: {
    wx: BORDER + SIDE_W, wy: BORDER,
    ww: MID_X - BORDER - SIDE_W - DIV_H / 2, wh: WALL_H,
    fx: BORDER + SIDE_W, fy: BORDER + WALL_H + BASEBOARD,
    fw: MID_X - BORDER - SIDE_W - DIV_H / 2, fh: 66,
    wallColor: '#C8B898', baseboardColor: '#6A5840',
  },
  work: {
    wx: MID_X + DIV_H / 2 + SIDE_W, wy: BORDER,
    ww: AW - MID_X - DIV_H / 2 - SIDE_W - BORDER, wh: WALL_H,
    fx: MID_X + DIV_H / 2 + SIDE_W, fy: BORDER + WALL_H + BASEBOARD,
    fw: AW - MID_X - DIV_H / 2 - SIDE_W - BORDER, fh: 66,
    wallColor: '#A8B8C8', baseboardColor: '#586878',
  },
  meet: {
    wx: BORDER + SIDE_W, wy: BORDER + WALL_H + BASEBOARD + 66 + DIV_H,
    ww: MID_X - BORDER - SIDE_W - DIV_H / 2, wh: WALL_H,
    fx: BORDER + SIDE_W, fy: BORDER + WALL_H + BASEBOARD + 66 + DIV_H + WALL_H + BASEBOARD,
    fw: MID_X - BORDER - SIDE_W - DIV_H / 2, fh: 70,
    wallColor: '#A8C8B0', baseboardColor: '#4A6A50',
  },
  comm: {
    wx: MID_X + DIV_H / 2 + SIDE_W, wy: BORDER + WALL_H + BASEBOARD + 66 + DIV_H,
    ww: AW - MID_X - DIV_H / 2 - SIDE_W - BORDER, wh: WALL_H,
    fx: MID_X + DIV_H / 2 + SIDE_W, fy: BORDER + WALL_H + BASEBOARD + 66 + DIV_H + WALL_H + BASEBOARD,
    fw: AW - MID_X - DIV_H / 2 - SIDE_W - BORDER, fh: 70,
    wallColor: '#C8C0A8', baseboardColor: '#7A6A50',
  },
};

const E = ROOMS.exec, W = ROOMS.work, M = ROOMS.meet, Co = ROOMS.comm;

/* ─── Role colors ───────────────────────── */

const ROLE_COLORS: Record<string, string> = {
  cto: '#1565C0', cbo: '#E65100', pm: '#2E7D32',
  engineer: '#4A148C', designer: '#AD1457', qa: '#00695C',
  'data-analyst': '#0277BD',
};

/* ─── Facility definitions ─────────────── */
// Each facility: draw origin (dx, dy) + pixel size (pw, ph) from its draw function.
// Hit zone & label position are derived automatically.

interface FacilityDef {
  id: string;
  label: string;
  icon: string;
  color: string;
  /** draw origin (passed to draw function) */
  dx: number; dy: number;
  /** pixel size of the drawn object */
  pw: number; ph: number;
}

// Sizes from draw functions:
//   drawMeetingTable: 36w body, chairs extend -4 above / +11 below → total ~44w x 40h
//   drawBulletinBoard: 22w x 16h
//   drawScreen: 16w x 12h
//   drawBookshelf: 22w x 22h (incl shadow)
const FACILITY_ZONES: FacilityDef[] = [
  { id: 'meeting',   label: 'MEETING',   icon: '\u{1F3E2}', color: '#3B82F6', dx: M.fx + 10,   dy: M.fy + 14,   pw: 44, ph: 40 },
  { id: 'bulletin',  label: 'BULLETIN',  icon: '\u{1F4CB}', color: '#F59E0B', dx: M.wx + 6,    dy: M.wy + 4,    pw: 22, ph: 16 },
  { id: 'decisions', label: 'DECISIONS', icon: '\u{1F4DC}', color: '#EF4444', dx: Co.wx + 6,   dy: Co.wy + 6,   pw: 16, ph: 12 },
  { id: 'knowledge', label: 'KNOWLEDGE', icon: '\u{1F4DA}', color: '#10B981', dx: Co.fx + 108, dy: Co.fy + 16,  pw: 22, ph: 22 },
];

/** Derived hit zone from facility def */
function facilityHitBox(f: FacilityDef) {
  return { x: f.dx, y: f.dy, w: f.pw, h: f.ph };
}
/** Label position: centered below object */
function facilityLabelPos(f: FacilityDef) {
  return { cx: f.dx + f.pw / 2, botY: f.dy + f.ph };
}

/* ─── Desk placement ────────────────────── */

interface DeskDef { dx: number; dy: number; room: string; }

const DESKS: Record<string, DeskDef> = {
  cbo:      { dx: E.fx + 30,  dy: E.fy + 14, room: 'exec' },
  cto:      { dx: E.fx + 78,  dy: E.fy + 14, room: 'exec' },
  pm:       { dx: W.fx + 8,   dy: W.fy + 10, room: 'work' },
  engineer: { dx: W.fx + 52,  dy: W.fy + 10, room: 'work' },
  designer: { dx: W.fx + 96,  dy: W.fy + 10, room: 'work' },
  qa:       { dx: M.fx + 82,  dy: M.fy + 10, room: 'meet' },
  'data-analyst': { dx: Co.fx + 14, dy: Co.fy + 14, room: 'comm' },
};

/* ─── Pathfinding ───────────────────────── */

const CORRIDOR_Y: Record<string, number> = {
  exec: E.fy + 52, work: W.fy + 48, meet: M.fy + 56, comm: Co.fy + 42,
};

const divY = BORDER + WALL_H + BASEBOARD + 66;
const divX = MID_X - DIV_H / 2;

const DOORS: Record<string, { type: 'v' | 'h'; doorY?: number; doorX?: number; xA?: number; xB?: number; yA?: number; yB?: number }> = {
  exec_work: { type: 'v', doorY: BORDER + WALL_H + BASEBOARD + 20 + 12, xA: divX - 2, xB: W.fx + 2 },
  meet_comm: { type: 'v', doorY: BORDER + WALL_H + BASEBOARD + 66 + DIV_H + WALL_H + BASEBOARD + 20 + 12, xA: divX - 2, xB: Co.fx + 2 },
  exec_meet: { type: 'h', doorX: BORDER + SIDE_W + 40 + 14, yA: divY - 2, yB: M.fy + 2 },
  work_comm: { type: 'h', doorX: MID_X + DIV_H / 2 + SIDE_W + 40 + 14, yA: divY - 2, yB: Co.fy + 2 },
};

const ADJACENCY: Record<string, { room: string; door: string; side: 'A' | 'B' }[]> = {
  exec: [{ room: 'work', door: 'exec_work', side: 'A' }, { room: 'meet', door: 'exec_meet', side: 'A' }],
  work: [{ room: 'exec', door: 'exec_work', side: 'B' }, { room: 'comm', door: 'work_comm', side: 'A' }],
  meet: [{ room: 'exec', door: 'exec_meet', side: 'B' }, { room: 'comm', door: 'meet_comm', side: 'A' }],
  comm: [{ room: 'work', door: 'work_comm', side: 'B' }, { room: 'meet', door: 'meet_comm', side: 'B' }],
};

const WAYPOINTS: Record<string, { x: number; y: number }[]> = {
  exec: [{ x: E.fx + 6, y: E.fy + 52 }, { x: E.fx + 60, y: E.fy + 54 }, { x: E.fx + 112, y: E.fy + 50 }, { x: E.fx + 50, y: E.fy + 52 }],
  work: [{ x: W.fx + 14, y: W.fy + 48 }, { x: W.fx + 44, y: W.fy + 48 }, { x: W.fx + 70, y: W.fy + 48 }, { x: W.fx + 100, y: W.fy + 48 }],
  meet: [{ x: M.fx + 60, y: M.fy + 56 }, { x: M.fx + 30, y: M.fy + 54 }, { x: M.fx + 110, y: M.fy + 50 }, { x: M.fx + 80, y: M.fy + 56 }],
  comm: [{ x: Co.fx + 96, y: Co.fy + 8 }, { x: Co.fx + 60, y: Co.fy + 42 }, { x: Co.fx + 40, y: Co.fy + 42 }, { x: Co.fx + 20, y: Co.fy + 42 }],
};

/* ═══════════════════════════════════════════
   DRAWING HELPERS
   ═══════════════════════════════════════════ */

let _ctx: CanvasRenderingContext2D;
let _hoverRole: string | null = null;
let _hoverFacility: string | null = null;

function px(x: number, y: number, w: number, h: number, c: string, a?: number) {
  x = Math.round(x); y = Math.round(y);
  if (a !== undefined && a < 0.01) return;
  if (a !== undefined && a !== 1) _ctx.globalAlpha = a;
  _ctx.fillStyle = c; _ctx.fillRect(x, y, w, h);
  if (a !== undefined && a !== 1) _ctx.globalAlpha = 1;
}

function dot(x: number, y: number, c: string, a?: number) { px(x, y, 1, 1, c, a); }

let _s = 1;
function srand(s: number) { _s = s; }
function rand() { _s = (_s * 16807) % 2147483647; return (_s & 0xffff) / 0xffff; }

/* ─── Color helpers ─────────────────────── */

function hexToHsl(hex: string): [number, number, number] {
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

function hslToHex(h: number, s: number, l: number): string {
  h = ((h % 360) + 360) % 360;
  s = Math.max(0, Math.min(100, s)) / 100;
  l = Math.max(0, Math.min(100, l)) / 100;
  const a = s * Math.min(l, 1 - l);
  const f = (n: number) => { const k = (n + h / 30) % 12; return l - a * Math.max(-1, Math.min(k - 3, 9 - k, 1)); };
  const x = (v: number) => Math.round(v * 255).toString(16).padStart(2, '0');
  return '#' + x(f(0)) + x(f(8)) + x(f(4));
}

function shadowOf(hex: string, amt = 1) { const [h, s, l] = hexToHsl(hex); return hslToHex(h + 15 * amt, Math.min(100, s + 8), l - 12 * amt); }
function highlightOf(hex: string, amt = 1) { const [h, s, l] = hexToHsl(hex); return hslToHex(h - 10 * amt, s - 3, l + 10 * amt); }


/* ═══════════════════════════════════════════
   WALL & FLOOR RENDERING
   ═══════════════════════════════════════════ */

function drawWallFace(room: RoomDef, doorGap?: { x: number; w: number }) {
  const { wx, wy, ww, wh, wallColor, baseboardColor } = room;
  const wSh = shadowOf(wallColor, 0.5), wHi = highlightOf(wallColor, 0.5);
  const segments: { sx: number; sw: number }[] = [];
  if (doorGap) {
    const dx = doorGap.x - wx, dw = doorGap.w;
    if (dx > 0) segments.push({ sx: wx, sw: dx });
    if (dx + dw < ww) segments.push({ sx: doorGap.x + dw, sw: ww - dx - dw });
  } else {
    segments.push({ sx: wx, sw: ww });
  }
  for (const seg of segments) {
    px(seg.sx, wy, seg.sw, wh, wallColor);
    for (let y = 0; y < wh; y += 4) { px(seg.sx, wy + y, seg.sw, 1, wHi, 0.08); px(seg.sx, wy + y + 2, seg.sw, 1, wSh, 0.05); }
    srand(Math.round(seg.sx * 7 + wy * 13));
    for (let x = 0; x < seg.sw; x += 3) { if (rand() > 0.4) px(seg.sx + x, wy, 1, wh, wHi, 0.04); }
    px(seg.sx, wy, seg.sw, 2, wHi, 0.3); px(seg.sx, wy, seg.sw, 1, highlightOf(wallColor, 1), 0.2);
    px(seg.sx, wy + wh - 2, seg.sw, 2, wSh, 0.3);
    px(seg.sx, wy + wh, seg.sw, BASEBOARD, baseboardColor);
    px(seg.sx, wy + wh, seg.sw, 1, highlightOf(baseboardColor, 0.5), 0.4);
  }
  if (doorGap) {
    px(doorGap.x - 1, wy, 1, wh + BASEBOARD, '#4A3828');
    px(doorGap.x + doorGap.w, wy, 1, wh + BASEBOARD, '#4A3828');
    px(doorGap.x, wy, doorGap.w, 1, '#0A0808', 0.12);
  }
  px(room.fx, room.fy, room.fw, 3, '#0A0808', 0.12);
  px(room.fx, room.fy + 3, room.fw, 2, '#0A0808', 0.06);
}

function drawSideWalls(room: RoomDef) {
  const wallBase = '#504038', wallSh = shadowOf(wallBase, 0.5), wallHi = highlightOf(wallBase, 0.5);
  const lx = room.wx - SIDE_W, ly = room.wy, lh = room.wh + BASEBOARD + room.fh;
  px(lx, ly, SIDE_W, lh, wallBase); px(lx, ly, 1, lh, wallHi, 0.3); px(lx + SIDE_W - 1, ly, 1, lh, wallSh, 0.4);
  for (let y = 0; y < lh; y += 6) px(lx + 1, ly + y, SIDE_W - 2, 1, wallHi, 0.06);
  const rx = room.wx + room.ww;
  px(rx, ly, SIDE_W, lh, wallBase); px(rx, ly, 1, lh, wallHi, 0.2); px(rx + SIDE_W - 1, ly, 1, lh, wallSh, 0.3);
}

/* ─── Floor textures ────────────────────── */

function drawWoodFloor(room: { fx: number; fy: number; fw: number; fh: number }) {
  const { fx, fy, fw, fh } = room;
  const base = '#B08040', hi = '#C89848', sh = '#8A6030', deep = '#6A4820';
  px(fx, fy, fw, fh, base); srand(42);
  for (let py = 0; py < fh; py += 5) {
    const rowOff = (Math.floor(py / 5) % 2) * 10;
    for (let px2 = -10; px2 < fw + 10; px2 += 20) {
      const sx = fx + px2 + rowOff, cx = Math.max(fx, sx), cw = Math.min(sx + 19, fx + fw) - cx;
      if (cw <= 0) continue;
      const c = rand() > .5 ? hi : base;
      px(cx, fy + py, cw, 4, c, 0.25); px(cx, fy + py, cw, 1, hi, 0.3);
      px(cx, fy + py + 4, cw, 1, deep, 0.35);
      if (sx >= fx && sx < fx + fw) px(sx, fy + py, 1, 4, deep, 0.2);
      px(cx, fy + py + 2, cw, 1, sh, 0.1);
    }
  }
  px(fx, fy, fw, 2, '#0A0808', 0.08); px(fx, fy, 2, fh, '#0A0808', 0.06);
}

function drawDarkFloor(room: { fx: number; fy: number; fw: number; fh: number }) {
  const { fx, fy, fw, fh } = room;
  const base = '#1C2A38', grout = '#101820'; srand(99);
  px(fx, fy, fw, fh, base);
  for (let py = 0; py < fh; py += T) {
    for (let px2 = 0; px2 < fw; px2 += T) {
      const tw = Math.min(T, fw - px2), th = Math.min(T, fh - py);
      if (rand() > .5) px(fx + px2, fy + py, tw, th, highlightOf(base, 0.2), 0.15);
      px(fx + px2 + 2, fy + py + 2, tw - 4, th - 4, highlightOf(base, 0.3), 0.08);
      px(fx + px2, fy + py, tw, 1, grout, 0.5); px(fx + px2, fy + py, 1, th, grout, 0.5);
      px(fx + px2 + 1, fy + py + 1, 1, th - 1, highlightOf(base, 0.4), 0.1);
      if (rand() > .85) dot(fx + px2 + 4 + Math.floor(rand() * 8), fy + py + 4 + Math.floor(rand() * 8), '#3A6A9A', 0.08);
    }
  }
}

function drawCarpetFloor(room: { fx: number; fy: number; fw: number; fh: number }) {
  const { fx, fy, fw, fh } = room;
  const base = '#387848', hi = '#4A9058', sh = '#285E38';
  px(fx, fy, fw, fh, base); srand(77);
  for (let y = 0; y < fh; y += 2) for (let x = 0; x < fw; x += 2) {
    if (rand() > .5) dot(fx + x, fy + y, hi, 0.1);
    if (rand() > .8) dot(fx + x + 1, fy + y + 1, sh, 0.12);
  }
  const m = 5;
  px(fx + m, fy + m, fw - m * 2, 1, hi, 0.45); px(fx + m, fy + fh - m - 1, fw - m * 2, 1, sh, 0.45);
  px(fx + m, fy + m, 1, fh - m * 2, hi, 0.35); px(fx + fw - m - 1, fy + m, 1, fh - m * 2, sh, 0.35);
}

function drawTileFloor(room: { fx: number; fy: number; fw: number; fh: number }) {
  const { fx, fy, fw, fh } = room;
  const hi = '#D8C490', sh = '#B09060', grout = '#907848'; srand(55);
  for (let py = 0; py < fh; py += 8) {
    for (let px2 = 0; px2 < fw; px2 += 8) {
      const tw = Math.min(8, fw - px2), th = Math.min(8, fh - py);
      const c = ((px2 / 8 + py / 8) % 2 === 0) ? sh : hi;
      px(fx + px2, fy + py, tw, th, c);
      px(fx + px2 + 1, fy + py + 1, tw - 2, 1, highlightOf(c, 0.4), 0.2);
      px(fx + px2 + 1, fy + py + 1, 1, th - 2, highlightOf(c, 0.4), 0.15);
      px(fx + px2 + tw - 2, fy + py + 2, 1, th - 3, shadowOf(c, 0.4), 0.15);
      px(fx + px2 + 2, fy + py + th - 2, tw - 3, 1, shadowOf(c, 0.4), 0.15);
      px(fx + px2, fy + py, tw, 1, grout, 0.3); px(fx + px2, fy + py, 1, th, grout, 0.3);
    }
  }
}

/* ─── Frame & Dividers ──────────────────── */

function drawFrame() {
  const frame = '#2A1E14', frameHi = '#3A2E24';
  px(0, 0, AW, BORDER, frame); px(0, AH - BORDER, AW, BORDER, frame);
  px(0, 0, BORDER, AH, frame); px(AW - BORDER, 0, BORDER, AH, frame);
  px(0, 0, AW, 1, frameHi, 0.3); px(0, 0, 1, AH, frameHi, 0.2);

  const doorY1 = BORDER + WALL_H + BASEBOARD + 20, doorH = 24;
  const doorX1 = BORDER + SIDE_W + 40, doorW = 28;
  const doorX2 = MID_X + DIV_H / 2 + SIDE_W + 40;
  const doorY2 = BORDER + WALL_H + BASEBOARD + 66 + DIV_H + WALL_H + BASEBOARD + 20;

  // Horizontal divider segments
  px(0, divY, doorX1, DIV_H, frame); px(doorX1 + doorW, divY, divX - doorX1 - doorW, DIV_H, frame);
  px(divX + DIV_H, divY, doorX2 - divX - DIV_H, DIV_H, frame); px(doorX2 + doorW, divY, AW - doorX2 - doorW, DIV_H, frame);
  px(0, divY, doorX1, 1, frameHi, 0.3); px(doorX1 + doorW, divY, divX - doorX1 - doorW, 1, frameHi, 0.3);
  px(divX + DIV_H, divY, doorX2 - divX - DIV_H, 1, frameHi, 0.3); px(doorX2 + doorW, divY, AW - doorX2 - doorW, 1, frameHi, 0.3);

  // Vertical divider segments
  px(divX, 0, DIV_H, doorY1, frame); px(divX, doorY1 + doorH, DIV_H, divY - doorY1 - doorH, frame);
  px(divX, divY + DIV_H, DIV_H, doorY2 - divY - DIV_H, frame); px(divX, doorY2 + doorH, DIV_H, AH - doorY2 - doorH, frame);
  px(divX, 0, 1, doorY1, frameHi, 0.2); px(divX, doorY1 + doorH, 1, divY - doorY1 - doorH, frameHi, 0.2);
  px(divX, divY + DIV_H, 1, doorY2 - divY - DIV_H, frameHi, 0.2); px(divX, doorY2 + doorH, 1, AH - doorY2 - doorH, frameHi, 0.2);

  // Door floor patches
  px(divX, doorY1, DIV_H, doorH, '#C4A070'); px(divX + DIV_H / 2, doorY1, DIV_H / 2, doorH, '#3A4858');
  px(divX, doorY2, DIV_H, doorH, '#7AA880'); px(divX + DIV_H / 2, doorY2, DIV_H / 2, doorH, '#C8B890');

  // Door frame edges
  const df = '#4A3828';
  px(divX, doorY1 - 1, DIV_H, 1, df); px(divX, doorY1 + doorH, DIV_H, 1, df);
  px(doorX1 - 1, divY, 1, DIV_H, df); px(doorX1 + doorW, divY, 1, DIV_H, df);
  px(doorX2 - 1, divY, 1, DIV_H, df); px(doorX2 + doorW, divY, 1, DIV_H, df);
  px(divX, doorY2 - 1, DIV_H, 1, df); px(divX, doorY2 + doorH, DIV_H, 1, df);
}

/* ─── Wall decorations ──────────────────── */

function drawWindow(x: number, y: number, w = 14, h = 12) {
  px(x, y, w, h, '#4A3828'); px(x + 1, y + 1, w - 2, h - 2, '#5A4838');
  px(x + 2, y + 2, w - 4, h - 4, '#4A7098');
  px(x + 2, y + 2, w - 4, Math.floor((h - 4) / 2), '#6A90B8', 0.35);
  const mw = Math.floor(w / 2); px(x + mw, y + 1, 1, h - 2, '#4A3828');
  px(x + 1, y + Math.floor(h / 2), w - 2, 1, '#4A3828', 0.5);
  dot(x + 3, y + 3, '#8AB8E8', 0.35); dot(x + mw + 2, y + 3, '#8AB8E8', 0.25);
  px(x - 1, y + h, w + 2, 2, '#5A4838'); px(x - 1, y + h, w + 2, 1, highlightOf('#5A4838', 0.5), 0.35);
}

function drawPicture(x: number, y: number, c: string) {
  px(x, y, 10, 8, '#3A2818'); px(x + 1, y + 1, 8, 6, c);
  px(x + 2, y + 2, 4, 3, highlightOf(c, 1.2), 0.3); dot(x + 3, y + 2, highlightOf(c, 2), 0.25);
}

function drawClock(x: number, y: number) {
  px(x, y, 7, 7, '#3A2818'); px(x + 1, y + 1, 5, 5, '#F0EDE5');
  dot(x + 3, y + 1, '#AAA'); dot(x + 3, y + 5, '#AAA'); dot(x + 1, y + 3, '#AAA'); dot(x + 5, y + 3, '#AAA');
  dot(x + 3, y + 3, '#222'); px(x + 3, y + 1, 1, 2, '#333'); dot(x + 4, y + 3, '#D32F2F');
}

function drawWhiteboard(x: number, y: number) {
  px(x, y, 26, 16, '#586878'); px(x + 1, y + 1, 24, 13, '#ECEFF1');
  px(x + 1, y + 1, 24, 1, '#F5F5F5', 0.4);
  px(x + 3, y + 3, 14, 1, '#1565C0', 0.6); px(x + 3, y + 5, 18, 1, '#333', 0.2);
  px(x + 3, y + 7, 12, 1, '#D32F2F', 0.35); px(x + 3, y + 9, 16, 1, '#333', 0.15);
  px(x + 1, y + 14, 24, 2, '#708898');
  px(x + 3, y + 14, 3, 1, '#D32F2F'); px(x + 7, y + 14, 3, 1, '#1565C0'); px(x + 11, y + 14, 3, 1, '#2E7D32');
}

function drawBulletinBoard(x: number, y: number) {
  px(x, y, 22, 16, '#6A5030'); px(x + 1, y + 1, 20, 14, '#C4A66A');
  srand(88);
  for (let cy = 0; cy < 14; cy++) for (let cx = 0; cx < 20; cx++) {
    if (rand() > .5) dot(x + 1 + cx, y + 1 + cy, rand() > .5 ? '#B89858' : '#D4B87A', 0.18);
  }
  px(x + 2, y + 2, 5, 4, '#FFF176'); px(x + 8, y + 2, 5, 4, '#90CAF9'); px(x + 14, y + 3, 5, 4, '#CE93D8');
  px(x + 3, y + 8, 7, 4, '#C8E6C9'); px(x + 11, y + 8, 8, 4, '#F8BBD0');
  dot(x + 4, y + 2, '#E53935'); dot(x + 10, y + 2, '#1E88E5'); dot(x + 16, y + 3, '#FF9800');
}

function drawShelf(x: number, y: number) {
  px(x, y, 20, 3, '#5A4030'); px(x, y, 20, 1, highlightOf('#5A4030', 0.5), 0.35);
  px(x, y + 2, 20, 1, shadowOf('#5A4030', 0.5), 0.3);
  px(x + 2, y - 4, 3, 4, '#E53935'); px(x + 2, y - 4, 3, 1, highlightOf('#E53935', 1), 0.3);
  px(x + 6, y - 3, 2, 3, '#1E88E5'); px(x + 9, y - 5, 4, 5, '#43A047');
  px(x + 14, y - 3, 3, 3, '#FFD54F'); dot(x + 15, y - 3, '#FFF176', 0.4);
}

function drawScreen(x: number, y: number) {
  px(x, y, 16, 12, '#1E1E28'); px(x + 1, y + 1, 14, 9, '#0C1420');
  px(x + 2, y + 2, 12, 1, '#EF4444', 0.6);
  dot(x + 2, y + 4, '#4CAF50'); px(x + 4, y + 4, 7, 1, '#8b949e', 0.4);
  dot(x + 2, y + 6, '#FF9800'); px(x + 4, y + 6, 5, 1, '#8b949e', 0.3);
  dot(x + 2, y + 8, '#42A5F5'); px(x + 4, y + 8, 8, 1, '#8b949e', 0.25);
  px(x + 7, y + 10, 2, 2, '#1E1E28'); px(x + 5, y + 11, 6, 1, '#586878');
}

/* ═══════════════════════════════════════════
   FURNITURE
   ═══════════════════════════════════════════ */

const WD = { hi: '#D4AA5C', base: '#B08040', sh: '#7A5038', deep: '#4E3028' };
const DW = { hi: '#8A6848', base: '#604832', sh: '#3A2E24', deep: '#2A1E18' };
const CH = { hi: '#5A6A80', base: '#485868', sh: '#364858', deep: '#283848' };
const SH = '#100A06';

function drawDesk(x: number, y: number) {
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

function drawChair(x: number, y: number, facing: 'up' | 'down') {
  px(x + 1, y + 9, 10, 2, SH, 0.1);
  dot(x + 5, y + 9, '#1E1E22'); dot(x + 1, y + 10, '#1A1A1E'); dot(x + 9, y + 10, '#1A1A1E');
  dot(x + 3, y + 11, '#1A1A1E'); dot(x + 7, y + 11, '#1A1A1E');
  px(x + 1, y + 2, 8, 6, CH.base); px(x + 2, y + 3, 6, 4, CH.hi, 0.35);
  px(x + 2, y + 3, 6, 1, highlightOf(CH.hi, 0.5), 0.25); px(x + 1, y + 7, 8, 1, CH.deep);
  if (facing === 'up') { px(x, y + 7, 10, 3, CH.deep); px(x + 1, y + 8, 8, 1, CH.sh); }
  else { px(x, y - 1, 10, 3, CH.deep); px(x + 1, y, 8, 1, CH.sh); }
  px(x, y + 3, 1, 4, CH.sh); px(x + 9, y + 3, 1, 4, CH.sh);
}

function drawPlant(x: number, y: number) {
  px(x + 2, y + 11, 6, 2, SH, 0.1); px(x + 2, y + 8, 6, 4, '#8B5E3C');
  px(x + 1, y + 7, 8, 2, shadowOf('#A06E48', 0.3)); px(x + 2, y + 7, 6, 1, highlightOf('#A06E48', 0.5), 0.4);
  px(x + 1, y + 3, 3, 4, '#2E7D32'); px(x + 5, y + 2, 3, 4, '#2E7D32');
  px(x + 2, y + 1, 4, 4, '#43A047'); px(x + 3, y + 0, 3, 3, '#66BB6A');
  dot(x + 4, y, '#81C784'); dot(x + 3, y + 1, '#A5D6A7', 0.4);
}

function drawBookshelf(x: number, y: number, accent?: string) {
  px(x + 2, y + 20, 22, 2, SH, 0.15); px(x, y, 22, 20, DW.deep); px(x + 1, y + 1, 20, 18, DW.base);
  px(x, y, 22, 1, DW.hi, 0.35); px(x, y, 1, 20, DW.hi, 0.2);
  for (const sy of [6, 12]) { px(x + 1, y + sy, 20, 2, DW.sh); px(x + 1, y + sy, 20, 1, DW.hi, 0.2); }
  const cols = ['#E53935', '#1E88E5', '#43A047', '#8E24AA', '#FB8C00', '#00897B', '#5C6BC0'];
  let bx = x + 2;
  for (let i = 0; i < 5; i++) { const bw = 2 + (i % 2); px(bx, y + 1, bw, 5, cols[i]); px(bx, y + 1, bw, 1, highlightOf(cols[i], 1), 0.35); bx += bw + 1; }
  bx = x + 2; for (let i = 0; i < 4; i++) { px(bx, y + 7, 4, 5, cols[i + 3]); px(bx, y + 7, 4, 1, highlightOf(cols[i + 3], 1), 0.25); bx += 5; }
  px(x + 2, y + 14, 4, 4, '#FFD54F'); px(x + 8, y + 14, 7, 4, '#90CAF9');
  // Accent strip on top for interactive bookshelves
  if (accent) { px(x, y - 1, 22, 1, accent, 0.7); }
}

function drawMeetingTable(x: number, y: number) {
  // Top chairs first (behind table in 3/4 view)
  drawChair(x + 4, y - 4, 'down'); drawChair(x + 16, y - 4, 'down'); drawChair(x + 28, y - 4, 'down');
  // Table surface (covers bottom of top chairs)
  px(x + 3, y + 24, 34, 3, SH, 0.15);
  px(x, y + 2, 36, 18, WD.deep); px(x + 1, y + 3, 34, 16, WD.base);
  px(x + 1, y + 3, 34, 1, WD.hi, 0.35);
  for (let g = 0; g < 14; g += 3) px(x + 1, y + 4 + g, 34, 1, shadowOf(WD.base, 0.2), 0.08);
  px(x, y + 20, 36, 4, WD.deep); px(x + 1, y + 21, 34, 2, WD.sh);
  px(x + 6, y + 7, 10, 6, '#1A1A24'); px(x + 7, y + 8, 8, 4, '#0C1420');
  px(x + 8, y + 9, 4, 1, '#2A6898', 0.4);
  px(x + 20, y + 8, 6, 4, '#F0F0F0'); px(x + 15, y + 7, 3, 3, '#ECEFF1'); dot(x + 16, y + 8, '#795548');
  // Bottom chairs last (in front of table)
  drawChair(x + 4, y + 24, 'up'); drawChair(x + 16, y + 24, 'up'); drawChair(x + 28, y + 24, 'up');
}

function drawSofa(x: number, y: number) {
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

function drawCoffeeTable(x: number, y: number) {
  px(x + 2, y + 10, 22, 2, SH, 0.12);
  px(x, y, 22, 8, DW.deep); px(x + 1, y + 1, 20, 6, DW.base);
  px(x + 1, y + 1, 20, 1, DW.hi, 0.3); px(x, y + 8, 22, 2, DW.sh);
  px(x + 3, y + 2, 6, 4, '#F0F0F0'); px(x + 13, y + 3, 3, 3, '#ECEFF1'); dot(x + 14, y + 4, '#795548');
}

function drawCoffeeMachine(x: number, y: number) {
  px(x + 1, y + 14, 10, 2, SH, 0.12);
  px(x, y, 10, 14, '#546E7A'); px(x, y, 10, 1, highlightOf('#546E7A', 1), 0.35);
  px(x + 1, y + 1, 8, 3, '#78909C'); px(x + 1, y + 5, 8, 4, '#37474F');
  dot(x + 2, y + 6, '#EF5350'); dot(x + 4, y + 6, '#66BB6A');
  px(x + 2, y + 11, 4, 2, '#ECEFF1');
}

/* ═══════════════════════════════════════════
   CHARACTERS — TyconoForge mini blueprints
   ═══════════════════════════════════════════ */

const _seatedPixelsCache = new Map<string, import('./sprites/engine/blueprint').Pixel[]>();

function getSeatedPixels(ap: CharacterAppearance): import('./sprites/engine/blueprint').Pixel[] {
  const key = `${ap.hairStyle ?? ''}|${ap.outfitStyle ?? ''}|${ap.accessory ?? ''}`;
  let cached = _seatedPixelsCache.get(key);
  if (!cached) {
    const base = getCharacterBlueprint('mini-seated:default');
    const bp = applyStyles(base, ap);
    cached = bp ? bp.layers.flatMap(l => l.pixels) : [];
    _seatedPixelsCache.set(key, cached);
  }
  return cached;
}

function drawSeatedChar(x: number, y: number, ap: CharacterAppearance) {
  renderPixelsAt(_ctx, getSeatedPixels(ap), x, y, ap);
}

function drawDeskUnit(dx: number, dy: number, ap: CharacterAppearance, bobY: number, empty: boolean) {
  drawChair(dx + 8, dy + 20, 'up');
  if (!empty) drawSeatedChar(dx + 8, dy + 0 + bobY, ap);
  drawDesk(dx, dy + 14);
}

function drawWalkChar(cx: number, cy: number, ap: CharacterAppearance, dir: string, wf: number) {
  const d = (dir as WalkDirection) in WALK_FRAMES ? (dir as WalkDirection) : 'down';
  const phase = wf % 4;
  const pixels = WALK_FRAMES[d][phase];
  renderPixelsAt(_ctx, pixels, cx, cy, ap);

  // Overlay accessory on top of walk frame (bob offset matches frame)
  const bob = (phase === 1 || phase === 3) ? -1 : 0;
  if (ap.accessory && ap.accessory !== 'none') {
    const acc = getAccessory(ap.accessory);
    if (acc) {
      // Accessory pixels are relative to head origin; walk frame head is at (0, bob)
      renderPixelsAt(_ctx, acc.layer.pixels, cx, cy + bob, ap);
    }
  }

  _ctx.globalAlpha = 1;
}

/* ═══════════════════════════════════════════
   CHARACTER STATE MACHINE
   ═══════════════════════════════════════════ */

interface CharState {
  state: 'sitting' | 'walking' | 'idle' | 'returning';
  homeX: number; homeY: number; homeRoom: string;
  x: number; y: number;
  path: { x: number; y: number }[];
  room: string;
  dir: string; walkFrame: number; walkTimer: number;
  bobY: number; bobOff: number;
  stateTimer: number;
}

function createChars(roleIds: string[]): Record<string, CharState> {
  const chars: Record<string, CharState> = {};
  let idx = 0;
  for (const id of roleIds) {
    const d = DESKS[id];
    if (!d) continue;
    chars[id] = {
      state: 'sitting',
      homeX: d.dx + 8, homeY: d.dy + 34,
      homeRoom: d.room,
      x: d.dx + 8, y: d.dy + 34,
      path: [],
      room: d.room,
      dir: 'down', walkFrame: 0, walkTimer: 0,
      bobY: 0, bobOff: idx * 17,
      stateTimer: 600 + Math.floor(Math.random() * 900),
    };
    idx++;
  }
  return chars;
}

function buildPathInRoom(fromX: number, fromY: number, tx: number, ty: number, room: string) {
  const corrY = CORRIDOR_Y[room];
  const path: { x: number; y: number }[] = [];
  if (fromY < corrY - 4) path.push({ x: fromX, y: corrY });
  if (Math.abs(fromX - tx) > 4) path.push({ x: tx, y: corrY });
  path.push({ x: tx, y: ty });
  return path;
}

function buildCrossRoomPath_single(fx: number, fy: number, fromRoom: string, toRoom: string) {
  const adj = ADJACENCY[fromRoom];
  const conn = adj.find(a => a.room === toRoom);
  if (!conn) return [];
  const door = DOORS[conn.door];
  const path: { x: number; y: number }[] = [];
  const corrY = CORRIDOR_Y[fromRoom];
  const tCorrY = CORRIDOR_Y[toRoom];
  if (Math.abs(fy - corrY) > 4) path.push({ x: fx, y: corrY });
  if (door.type === 'v') {
    const approachX = conn.side === 'A' ? door.xA! : door.xB!;
    const exitX = conn.side === 'A' ? door.xB! : door.xA!;
    path.push({ x: approachX, y: corrY }); path.push({ x: approachX, y: door.doorY! });
    path.push({ x: exitX, y: door.doorY! }); path.push({ x: exitX, y: tCorrY });
  } else {
    const approachY = conn.side === 'A' ? door.yA! : door.yB!;
    const exitY = conn.side === 'A' ? door.yB! : door.yA!;
    path.push({ x: door.doorX!, y: corrY }); path.push({ x: door.doorX!, y: approachY });
    path.push({ x: door.doorX!, y: exitY }); path.push({ x: door.doorX!, y: tCorrY });
  }
  return path;
}

function buildCrossRoomPath(ch: CharState, targetRoom: string) {
  const adj = ADJACENCY[ch.room];
  let conn = adj.find(a => a.room === targetRoom);
  if (!conn) {
    for (const mid of adj) {
      const midAdj = ADJACENCY[mid.room];
      if (midAdj.find(a => a.room === targetRoom)) {
        const path1 = buildCrossRoomPath_single(ch.x, ch.y, ch.room, mid.room);
        const last = path1[path1.length - 1];
        const path2 = buildCrossRoomPath_single(last?.x ?? ch.x, last?.y ?? ch.y, mid.room, targetRoom);
        return [...path1, ...path2];
      }
    }
    return [];
  }
  return buildCrossRoomPath_single(ch.x, ch.y, ch.room, targetRoom);
}

function buildReturnPath(ch: CharState) {
  if (ch.room !== ch.homeRoom) {
    const crossPath = buildCrossRoomPath({ ...ch }, ch.homeRoom);
    const last = crossPath[crossPath.length - 1];
    const homePath = buildPathInRoom(last?.x ?? ch.x, last?.y ?? ch.y, ch.homeX, ch.homeY, ch.homeRoom);
    return [...crossPath, ...homePath];
  }
  return buildPathInRoom(ch.x, ch.y, ch.homeX, ch.homeY, ch.room);
}

function updateChars(chars: Record<string, CharState>, frame: number) {
  for (const [, ch] of Object.entries(chars)) {
    ch.stateTimer--;

    if (ch.state === 'sitting') {
      ch.bobY = ((frame + ch.bobOff) % 60) < 30 ? 1 : 0;
      if (ch.stateTimer <= 0) {
        ch.state = 'walking';
        ch.x = ch.homeX; ch.y = ch.homeY;
        ch.room = ch.homeRoom;
        if (Math.random() < 0.25) {
          const rooms = ['exec', 'work', 'meet', 'comm'].filter(r => r !== ch.room);
          const targetRoom = rooms[Math.floor(Math.random() * rooms.length)];
          const crossPath = buildCrossRoomPath(ch, targetRoom);
          const tWp = WAYPOINTS[targetRoom];
          const twp = tWp[Math.floor(Math.random() * tWp.length)];
          const lastPt = crossPath[crossPath.length - 1] ?? { x: ch.x, y: ch.y };
          const inRoomPath = buildPathInRoom(lastPt.x, lastPt.y, twp.x, twp.y, targetRoom);
          ch.path = [...crossPath, ...inRoomPath];
          ch.walkTimer = 0;
        } else {
          const pts = WAYPOINTS[ch.room];
          const wp = pts[Math.floor(Math.random() * pts.length)];
          ch.path = buildPathInRoom(ch.x, ch.y, wp.x, wp.y, ch.room);
          ch.walkTimer = 0;
        }
      }
    } else if (ch.state === 'walking' || ch.state === 'returning') {
      if (ch.path.length === 0) {
        if (ch.state === 'returning') {
          ch.state = 'sitting'; ch.room = ch.homeRoom;
          ch.stateTimer = 800 + Math.floor(Math.random() * 1200);
        } else {
          ch.state = 'idle'; ch.dir = 'down';
          ch.stateTimer = 180 + Math.floor(Math.random() * 360);
        }
        continue;
      }
      const tgt = ch.path[0];
      const dx = tgt.x - ch.x, dy = tgt.y - ch.y;
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (dist < 1.5) {
        ch.x = tgt.x; ch.y = tgt.y; ch.path.shift();
        for (const [rn, rm] of Object.entries(ROOMS)) {
          if (ch.x >= rm.fx && ch.x <= rm.fx + rm.fw && ch.y >= rm.fy && ch.y <= rm.fy + rm.fh) {
            ch.room = rn; break;
          }
        }
      } else {
        const spd = 0.2;
        ch.x += dx / dist * spd; ch.y += dy / dist * spd;
        if (Math.abs(dx) > Math.abs(dy)) ch.dir = dx > 0 ? 'right' : 'left';
        else ch.dir = dy > 0 ? 'down' : 'up';
        ch.walkTimer++;
        ch.walkFrame = Math.floor(ch.walkTimer / 12) % 4;
      }
    } else if (ch.state === 'idle') {
      if (ch.stateTimer <= 0) {
        if (Math.random() < 0.3) {
          ch.state = 'walking';
          const pts = WAYPOINTS[ch.room];
          const wp = pts[Math.floor(Math.random() * pts.length)];
          ch.path = buildPathInRoom(ch.x, ch.y, wp.x, wp.y, ch.room);
          ch.walkTimer = 0;
        } else {
          ch.state = 'returning';
          ch.path = buildReturnPath(ch);
          ch.walkTimer = 0;
        }
      }
    }
  }
}

/* ═══════════════════════════════════════════
   SCENE RENDERER
   ═══════════════════════════════════════════ */

function drawScene(
  chars: Record<string, CharState>,
  getAp: (roleId: string) => CharacterAppearance,
  roleStatuses: Record<string, string>,
) {
  _ctx.clearRect(0, 0, AW, AH);
  px(0, 0, AW, AH, '#2A1E14');

  // Floors
  drawWoodFloor(ROOMS.exec); drawDarkFloor(ROOMS.work);
  drawCarpetFloor(ROOMS.meet); drawTileFloor(ROOMS.comm);

  // Door floor patches
  const doorX1 = BORDER + SIDE_W + 40, doorW = 28;
  const doorX2 = MID_X + DIV_H / 2 + SIDE_W + 40;
  const gapTop = BORDER + WALL_H + BASEBOARD + 66;
  const gapBot = M.fy;
  drawWoodFloor({ fx: doorX1, fy: gapTop, fw: doorW, fh: gapBot - gapTop });
  drawDarkFloor({ fx: doorX2, fy: gapTop, fw: doorW, fh: gapBot - gapTop });

  // Walls
  drawWallFace(ROOMS.exec); drawWallFace(ROOMS.work);
  drawWallFace(ROOMS.meet, { x: doorX1, w: doorW });
  drawWallFace(ROOMS.comm, { x: doorX2, w: doorW });
  drawSideWalls(ROOMS.exec); drawSideWalls(ROOMS.work);
  drawSideWalls(ROOMS.meet); drawSideWalls(ROOMS.comm);
  drawFrame();

  // Wall decorations
  drawWindow(E.wx + 10, E.wy + 6, 16, 14);
  drawPicture(E.wx + 34, E.wy + 8, '#1565C0'); drawPicture(E.wx + 48, E.wy + 8, '#E65100');
  drawClock(E.wx + 64, E.wy + 10); drawShelf(E.wx + 78, E.wy + 18);
  drawWindow(E.wx + 104, E.wy + 6, 16, 14);
  drawWhiteboard(W.wx + 6, W.wy + 4);
  drawWindow(W.wx + 50, W.wy + 6, 16, 14); drawWindow(W.wx + 92, W.wy + 6, 16, 14);
  drawBulletinBoard(M.wx + 6, M.wy + 4); drawPicture(M.wx + 28, M.wy + 8, '#10B981');
  drawWindow(M.wx + 80, M.wy + 6, 16, 14); drawShelf(M.wx + 102, M.wy + 18);
  drawScreen(Co.wx + 6, Co.wy + 6); drawPicture(Co.wx + 28, Co.wy + 8, '#d4956a');
  drawWindow(Co.wx + 76, Co.wy + 6, 16, 14); drawClock(Co.wx + 98, Co.wy + 10);
  drawShelf(Co.wx + 108, Co.wy + 18);

  // Y-sorted entities
  const entities: { y: number; draw: () => void }[] = [];

  // Static furniture
  entities.push({ y: E.fy + 4, draw: () => drawBookshelf(E.fx + 2, E.fy + 4) });
  entities.push({ y: E.fy + 4, draw: () => drawPlant(E.fx + 112, E.fy + 4) });
  entities.push({ y: E.fy + 4, draw: () => drawPlant(E.fx + 68, E.fy + 4) });
  entities.push({ y: W.fy + 4, draw: () => drawPlant(W.fx + 36, W.fy + 4) });
  entities.push({ y: W.fy + 4, draw: () => drawPlant(W.fx + 80, W.fy + 4) });
  entities.push({ y: M.fy + 4, draw: () => drawPlant(M.fx + 110, M.fy + 4) });
  entities.push({ y: M.fy + 14, draw: () => drawMeetingTable(M.fx + 10, M.fy + 14) });
  entities.push({ y: Co.fy + 4, draw: () => drawCoffeeMachine(Co.fx + 92, Co.fy + 4) });
  entities.push({ y: Co.fy + 4, draw: () => drawPlant(Co.fx + 38, Co.fy + 4) });
  entities.push({ y: Co.fy + 16, draw: () => drawBookshelf(Co.fx + 108, Co.fy + 16, '#10B981') });
  entities.push({ y: Co.fy + 30, draw: () => drawSofa(Co.fx + 44, Co.fy + 30) });
  entities.push({ y: Co.fy + 50, draw: () => drawCoffeeTable(Co.fx + 50, Co.fy + 50) });
  entities.push({ y: Co.fy + 50, draw: () => drawPlant(Co.fx + 38, Co.fy + 50) });

  // Desk units with characters
  for (const [id, d] of Object.entries(DESKS)) {
    const ch = chars[id];
    if (!ch) continue;
    const sit = ch.state === 'sitting';
    const ap = getAp(id);
    const isWorking = roleStatuses[id] === 'working';
    entities.push({
      y: d.dy + 14,
      draw: () => {
        drawDeskUnit(d.dx, d.dy, ap, sit ? ch.bobY : 0, !sit);
        // Working indicator: glowing monitor
        if (sit && isWorking) {
          const color = ROLE_COLORS[id] ?? '#388bfd';
          px(d.dx + 7, d.dy + 14 - 4, 12, 5, color, 0.15);
          dot(d.dx + 12, d.dy + 14 + 1, '#4CAF50', 0.8);
        }
      },
    });
  }

  // Walking characters
  for (const [id, ch] of Object.entries(chars)) {
    if (ch.state !== 'sitting') {
      const ap = getAp(id);
      entities.push({
        y: ch.y + 14,
        draw: () => drawWalkChar(Math.round(ch.x), Math.round(ch.y), ap, ch.dir, ch.walkFrame),
      });
    }
  }

  entities.sort((a, b) => a.y - b.y);
  for (const e of entities) e.draw();

  // Facility interaction indicators
  for (const fz of FACILITY_ZONES) {
    const isHov = _hoverFacility === fz.id;
    const lp = facilityLabelPos(fz);
    // Small colored dot below object
    _ctx.save();
    _ctx.globalAlpha = isHov ? 0.9 : 0.5;
    _ctx.fillStyle = fz.color;
    _ctx.fillRect(lp.cx - 1, lp.botY - 2, 3, 3);
    if (isHov) {
      const hb = facilityHitBox(fz);
      _ctx.globalAlpha = 0.3;
      _ctx.strokeStyle = fz.color;
      _ctx.lineWidth = 1;
      _ctx.strokeRect(hb.x - 1, hb.y - 1, hb.w + 2, hb.h + 2);
    }
    _ctx.restore();
  }

  // Draw hover highlight
  if (_hoverRole) {
    const d = DESKS[_hoverRole];
    const ch = chars[_hoverRole];
    if (d && ch) {
      _ctx.save();
      _ctx.globalAlpha = 0.25;
      _ctx.fillStyle = ROLE_COLORS[_hoverRole] ?? '#fff';
      if (ch.state === 'sitting') {
        _ctx.fillRect(d.dx - 1, d.dy + 6, 28, 30);
      } else {
        _ctx.fillRect(Math.round(ch.x) - 1, Math.round(ch.y) - 1, 14, 24);
      }
      _ctx.restore();
    }
  }
}

/* ═══════════════════════════════════════════
   REACT COMPONENT
   ═══════════════════════════════════════════ */

export default function TopDownOfficeView({
  roles, projects, roleStatuses, activeExecs,
  onRoleClick, onProjectClick, onBulletinClick, onDecisionsClick, onKnowledgeClick,
  getRoleSpeech, getAppearance,
}: TopDownOfficeViewProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const overlayRef = useRef<HTMLDivElement>(null);
  const charsRef = useRef<Record<string, CharState>>({});
  const frameRef = useRef(0);
  const zoomRef = useRef(DEFAULT_ZOOM);

  // Mutable refs for data the animation loop reads
  const propsRef = useRef({ roleStatuses, activeExecs, getRoleSpeech, getAppearance });
  propsRef.current = { roleStatuses, activeExecs, getRoleSpeech, getAppearance };

  // Role IDs that have desk assignments
  const assignedRoleIds = useMemo(() => {
    return roles.map(r => r.id).filter(id => DESKS[id]);
  }, [roles]);

  // Initialize characters when roles change
  useEffect(() => {
    charsRef.current = createChars(assignedRoleIds);
  }, [assignedRoleIds]);

  // Get appearance helper
  const getAp = useCallback((roleId: string): CharacterAppearance => {
    return propsRef.current.getAppearance?.(roleId) ?? getDefaultAppearance(roleId);
  }, []);

  // Auto-zoom to fit container
  const updateZoom = useCallback(() => {
    const wrap = wrapRef.current;
    const canvas = canvasRef.current;
    if (!wrap || !canvas) return;
    const parent = wrap.parentElement;
    if (!parent) return;
    const pw = parent.clientWidth;
    const ph = parent.clientHeight;
    if (pw === 0 || ph === 0) return;

    // Find best integer zoom that fits
    let z = Math.floor(Math.min(pw / AW, ph / AH));
    z = Math.max(2, Math.min(z, 5));
    zoomRef.current = z;

    canvas.style.width = AW * z + 'px';
    canvas.style.height = AH * z + 'px';
    wrap.style.width = AW * z + 'px';
    wrap.style.height = AH * z + 'px';
  }, []);

  // Animation loop
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    _ctx = ctx;

    updateZoom();
    const resizeObs = new ResizeObserver(() => updateZoom());
    const parent = wrapRef.current?.parentElement;
    if (parent) resizeObs.observe(parent);

    let raf: number;
    const tick = () => {
      frameRef.current++;
      updateChars(charsRef.current, frameRef.current);
      drawScene(charsRef.current, getAp, propsRef.current.roleStatuses);
      updateOverlay();
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);

    return () => {
      cancelAnimationFrame(raf);
      resizeObs.disconnect();
    };
  }, [getAp, updateZoom]);

  // Create/update overlay elements
  useEffect(() => {
    const overlay = overlayRef.current;
    if (!overlay) return;
    overlay.innerHTML = '';

    for (const id of assignedRoleIds) {
      const color = ROLE_COLORS[id] ?? '#8b949e';

      // Name tag
      const tag = document.createElement('div');
      tag.className = 'td-nametag';
      tag.dataset.role = id;
      const dotEl = document.createElement('span');
      dotEl.className = 'td-dot';
      dotEl.style.background = color;
      tag.appendChild(dotEl);
      tag.appendChild(document.createTextNode(id.toUpperCase()));
      overlay.appendChild(tag);

      // Speech bubble
      const bub = document.createElement('div');
      bub.className = 'td-bubble';
      bub.dataset.role = id;
      bub.dataset.type = 'bubble';
      overlay.appendChild(bub);
    }

    // Facility labels
    const facilityHandlers: Record<string, () => void> = {
      meeting: () => { const p = projects[0]; if (p) onProjectClick(p.id); else onBulletinClick(); },
      bulletin: onBulletinClick,
      decisions: onDecisionsClick,
      knowledge: onKnowledgeClick,
    };
    for (const fz of FACILITY_ZONES) {
      const lbl = document.createElement('div');
      lbl.className = 'td-facility-label';
      lbl.dataset.facility = fz.id;
      lbl.textContent = `${fz.icon} ${fz.label}`;
      lbl.style.borderColor = `${fz.color}44`;
      const handler = facilityHandlers[fz.id];
      if (handler) lbl.addEventListener('click', handler);
      lbl.addEventListener('mouseenter', () => { _hoverFacility = fz.id; });
      lbl.addEventListener('mouseleave', () => { _hoverFacility = null; });
      overlay.appendChild(lbl);
    }
  }, [assignedRoleIds, projects, onProjectClick, onBulletinClick, onDecisionsClick, onKnowledgeClick]);

  // Update overlay positions
  const updateOverlay = useCallback(() => {
    const overlay = overlayRef.current;
    if (!overlay) return;
    const z = zoomRef.current;
    const chars = charsRef.current;
    const { getRoleSpeech: gs, roleStatuses: rs, activeExecs: ae } = propsRef.current;

    for (const id of Object.keys(chars)) {
      const ch = chars[id];
      const d = DESKS[id];
      if (!d) continue;

      let cx: number, charBotY: number, charTopY: number;
      if (ch.state === 'sitting') {
        cx = d.dx + 13; charTopY = d.dy + 2; charBotY = d.dy + 37;
      } else {
        cx = Math.round(ch.x) + 6; charTopY = Math.round(ch.y) - 2; charBotY = Math.round(ch.y) + 18;
      }

      const ox = (cx / AW * 100);

      // Name tag
      const tag = overlay.querySelector(`.td-nametag[data-role="${id}"]`) as HTMLElement;
      if (tag) {
        tag.style.left = ox + '%';
        tag.style.top = (charBotY * z + 2) + 'px';
        // Update status dot
        const dotEl = tag.querySelector('.td-dot') as HTMLElement;
        if (dotEl) {
          const isWorking = rs[id] === 'working';
          dotEl.style.background = isWorking ? '#FBBF24' : (ROLE_COLORS[id] ?? '#8b949e');
          if (isWorking) dotEl.style.animation = 'td-pulse 1s ease-in-out infinite';
          else dotEl.style.animation = '';
        }
      }

      // Speech bubble
      const bub = overlay.querySelector(`.td-bubble[data-role="${id}"]`) as HTMLElement;
      if (bub) {
        const isWorking = rs[id] === 'working';
        const activeTask = ae.find(e => e.roleId === id)?.task;
        const speech = gs(id);
        const text = isWorking && activeTask ? activeTask.slice(0, 30) : speech ? speech.slice(0, 30) : '';

        if (text && ch.state === 'sitting') {
          bub.style.display = '';
          bub.style.left = ox + '%';
          bub.style.top = ((charTopY - 5) * z) + 'px';
          bub.textContent = text;
        } else {
          bub.style.display = 'none';
        }
      }
    }

    // Facility labels
    for (const fz of FACILITY_ZONES) {
      const lbl = overlay.querySelector(`.td-facility-label[data-facility="${fz.id}"]`) as HTMLElement;
      if (lbl) {
        const lp = facilityLabelPos(fz);
        lbl.style.left = (lp.cx / AW * 100) + '%';
        lbl.style.top = (lp.botY * z + 2) + 'px';
        lbl.classList.toggle('td-facility-label--hover', _hoverFacility === fz.id);
      }
    }
  }, []);

  // Hit-test helper: returns { type, id } or null
  const hitTest = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return null;
    const rect = canvas.getBoundingClientRect();
    const z = zoomRef.current;
    const mx = (e.clientX - rect.left) / z;
    const my = (e.clientY - rect.top) / z;
    const chars = charsRef.current;

    // Check roles
    for (const [id, d] of Object.entries(DESKS)) {
      if (!chars[id]) continue;
      const ch = chars[id];
      if (ch.state === 'sitting') {
        if (mx >= d.dx && mx <= d.dx + 26 && my >= d.dy && my <= d.dy + 40)
          return { type: 'role' as const, id };
      } else {
        if (mx >= ch.x - 2 && mx <= ch.x + 14 && my >= ch.y - 2 && my <= ch.y + 20)
          return { type: 'role' as const, id };
      }
    }
    // Check facilities
    for (const fz of FACILITY_ZONES) {
      const hb = facilityHitBox(fz);
      if (mx >= hb.x && mx <= hb.x + hb.w && my >= hb.y && my <= hb.y + hb.h)
        return { type: 'facility' as const, id: fz.id };
    }
    return null;
  }, []);

  // Mouse move — hover detection
  const handleMouseMove = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    const hit = hitTest(e);
    const canvas = canvasRef.current;
    _hoverRole = hit?.type === 'role' ? hit.id : null;
    _hoverFacility = hit?.type === 'facility' ? hit.id : null;
    if (canvas) canvas.style.cursor = hit ? 'pointer' : 'default';
  }, [hitTest]);

  const handleMouseLeave = useCallback(() => {
    _hoverRole = null;
    _hoverFacility = null;
    if (canvasRef.current) canvasRef.current.style.cursor = 'default';
  }, []);

  // Canvas click handler
  const handleClick = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    const hit = hitTest(e);
    if (!hit) return;
    if (hit.type === 'role') { onRoleClick(hit.id); return; }
    // Facility clicks
    switch (hit.id) {
      case 'meeting': {
        const p = projects[0];
        if (p) onProjectClick(p.id); else onBulletinClick();
        break;
      }
      case 'bulletin': onBulletinClick(); break;
      case 'decisions': onDecisionsClick(); break;
      case 'knowledge': onKnowledgeClick(); break;
    }
  }, [hitTest, onRoleClick, onProjectClick, onBulletinClick, onDecisionsClick, onKnowledgeClick]);

  return (
    <div className="td-scene">
      <div ref={wrapRef} className="td-wrap">
        <canvas
          ref={canvasRef}
          width={AW}
          height={AH}
          className="td-canvas"
          onClick={handleClick}
          onMouseMove={handleMouseMove}
          onMouseLeave={handleMouseLeave}
        />
        <div ref={overlayRef} className="td-overlay" />
      </div>
    </div>
  );
}
