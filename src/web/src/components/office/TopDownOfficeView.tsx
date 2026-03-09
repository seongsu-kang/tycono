import { useRef, useEffect, useCallback, useMemo, useState } from 'react';
import type { Role, Project, Wave, Standup, Decision } from '../../types/index';
import type { CharacterAppearance } from '../../types/appearance';
import { getDefaultAppearance } from '../../types/appearance';
import { getCharacterBlueprint, renderPixelsAt, getAccessoryForDirection } from './sprites/engine';
import type { Direction } from './sprites/engine';
import { applyStyles } from './TopDownCharCanvas';
import './sprites/data'; // trigger blueprint registration
import { WALK_FRAMES } from './sprites/data/walk-frames-mini';
import type { WalkDirection } from './sprites/data/walk-frames-mini';
import { MASCOT_FRAMES, MASCOT_IDLE_TONGUE, MASCOT_SHADOW, MASCOT_SHADOW_SIDE } from './sprites/data/mascot-bichon';
import type { MascotDirection } from './sprites/data/mascot-bichon';
import { generateFloorLayout, selectPreset, applyFurnitureOverrides, applyDeskOverrides, applyFurnitureRemovals, applyAddedFurniture } from './floor-template';
import type { FloorLayout, DeskDef, RoomDef } from './floor-template';
import {
  setRenderContext, px, dot, srand, rand,
  shadowOf, highlightOf,
  drawDesk, drawChair,
  renderWallDecorations, pushFurnitureEntities,
  buildFacilityZonesFromFurniture,
  hitTestFurniture, drawFurnitureHighlight,
  hitTestDesks, drawDeskHighlight,
  type FacilityZone,
} from './furniture-renderer';
import type { FurnitureDef, FurnitureType } from './furniture-types';
import { FURNITURE_CATALOG } from './furniture-types';
import { api } from '../../api/client';

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
  onSettingsClick?: () => void;
  onThemeClick?: () => void;
  onStatsClick?: () => void;
  knowledgeDocsCount: number;
  getRoleSpeech: (roleId: string) => string;
  getAppearance?: (roleId: string) => CharacterAppearance;
  onCustomize?: (roleId: string) => void;
  onHireClick?: () => void;
  roleLevels?: Record<string, { level: number; totalTokens: number; progress: number }>;
}

/* ─── Canvas constants ──────────────────── */

const T = 16;
const DEFAULT_ZOOM = 4;

const BORDER = 4;
// WALL_H moved to floor-template.ts
const BASEBOARD = 2;
const DIV_H = 4;
const SIDE_W = 4;

/* ─── Dynamic floor layout (set by FloorTemplate) ── */

let _layout: FloorLayout = generateFloorLayout(7);  // default M preset

/* ─── Role colors ───────────────────────── */

const ROLE_COLORS: Record<string, string> = {
  cto: '#1565C0', cbo: '#E65100', pm: '#2E7D32',
  engineer: '#4A148C', designer: '#AD1457', qa: '#00695C',
  'data-analyst': '#0277BD',
};

/* ─── Facility zones (built from furniture data) ─── */

let _facilityZones: FacilityZone[] = buildFacilityZonesFromFurniture(_layout);

function facilityHitBox(f: FacilityZone) {
  return { x: f.dx, y: f.dy, w: f.pw, h: f.ph };
}
function facilityLabelPos(f: FacilityZone) {
  return { cx: f.dx + f.pw / 2, botY: f.dy + f.ph };
}

/* ─── Desk placement (from FloorLayout) ─── */

// DESKS maps roleId → desk. Built when layout changes.
let DESKS: Record<string, DeskDef> = {};

/** Assign role IDs to layout desks (1:1 by index) */
function assignDesks(roleIds: string[]): Record<string, DeskDef> {
  const result: Record<string, DeskDef> = {};
  for (let i = 0; i < roleIds.length && i < _layout.desks.length; i++) {
    result[roleIds[i]] = _layout.desks[i];
  }
  return result;
}

/* ═══════════════════════════════════════════
   DRAWING STATE
   ═══════════════════════════════════════════ */

let _ctx: CanvasRenderingContext2D;
let _hoverRole: string | null = null;
let _hoverFacility: string | null = null;
let _editMode = false;
let _hoverFurniture: string | null = null;
let _selectedFurniture: string | null = null;   // furniture id or 'desk:roleId'
let _dragging: { defId: string; startMx: number; startMy: number; origOffX: number; origOffY: number } | null = null;
let _draggingDesk: { roleId: string; startMx: number; startMy: number; origDx: number; origDy: number } | null = null;
let _placingType: FurnitureType | null = null;   // furniture type being placed
let _placingZone: 'wall' | 'floor' | null = null;


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
  const { canvasW: AW, canvasH: AH, rooms, doors } = _layout;
  const frame = '#2A1E14', frameHi = '#3A2E24';
  px(0, 0, AW, BORDER, frame); px(0, AH - BORDER, AW, BORDER, frame);
  px(0, 0, BORDER, AH, frame); px(AW - BORDER, 0, BORDER, AH, frame);
  px(0, 0, AW, 1, frameHi, 0.3); px(0, 0, 1, AH, frameHi, 0.2);

  // Only draw dividers for 4-room presets
  if (!rooms['exec'] || !rooms['work'] || !rooms['meet'] || !rooms['comm']) return;

  const E = rooms['exec'], M2 = rooms['meet'];
  const MID_X = AW / 2;
  const divX = MID_X - DIV_H / 2;
  const divY = E.fy + E.fh;

  // Read door positions from layout instead of hardcoding
  const dEW = doors['exec_work'];
  const dMC = doors['meet_comm'];
  const dEM = doors['exec_meet'];
  const dWC = doors['work_comm'];

  const doorH = 24, doorW = 28;
  const doorY1 = (dEW?.doorY ?? E.fy + 20) - doorH / 2;
  const doorX1 = (dEM?.doorX ?? BORDER + SIDE_W + 54) - doorW / 2;
  const doorX2 = (dWC?.doorX ?? MID_X + DIV_H / 2 + SIDE_W + 54) - doorW / 2;
  const doorY2 = (dMC?.doorY ?? M2.fy + 20) - doorH / 2;

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

/* ─── Wall & furniture draw functions: see furniture-renderer.ts ─── */

/* ─── Furniture draw functions: see furniture-renderer.ts ─── */

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

  // Overlay accessory on top of walk frame, direction-aware
  const bob = (phase === 1 || phase === 3) ? -1 : 0;
  if (ap.accessory && ap.accessory !== 'none') {
    const accLayer = getAccessoryForDirection(ap.accessory, d as Direction);
    if (accLayer && accLayer.pixels.length > 0) {
      renderPixelsAt(_ctx, accLayer.pixels, cx, cy + bob, ap);
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

/* ── Mascot (office pet) ── */
interface MascotState {
  x: number; y: number;
  dir: MascotDirection;
  walkFrame: number; walkTimer: number;
  path: { x: number; y: number }[];
  room: string;
  state: 'walking' | 'idle';
  stateTimer: number;
  tongueTimer: number;  // tongue animation while idle
}

function createMascot(): MascotState {
  const rooms = Object.keys(_layout.rooms);
  const startRoom = rooms[Math.floor(Math.random() * rooms.length)];
  const rm = _layout.rooms[startRoom];
  return {
    x: rm.fx + rm.fw / 2,
    y: rm.fy + rm.fh / 2,
    dir: 'down', walkFrame: 0, walkTimer: 0,
    path: [], room: startRoom,
    state: 'walking',
    stateTimer: 0,
    tongueTimer: 0,
  };
}

function updateMascot(m: MascotState) {
  m.stateTimer--;

  if (m.state === 'idle') {
    m.tongueTimer++;
    if (m.stateTimer <= 0) {
      m.state = 'walking';
      m.tongueTimer = 0;
      // pick a random destination
      const allRooms = Object.keys(_layout.rooms);
      if (Math.random() < 0.35 && allRooms.length > 1) {
        // cross-room walk
        const rooms = allRooms.filter(r => r !== m.room);
        const targetRoom = rooms[Math.floor(Math.random() * rooms.length)];
        const crossPath = buildCrossRoomPath(m as any, targetRoom);
        const tWp = _layout.waypoints[targetRoom];
        if (tWp && tWp.length > 0) {
          const twp = tWp[Math.floor(Math.random() * tWp.length)];
          const last = crossPath[crossPath.length - 1] ?? { x: m.x, y: m.y };
          const inRoom = buildPathInRoom(last.x, last.y, twp.x, twp.y, targetRoom);
          m.path = [...crossPath, ...inRoom];
        } else {
          m.path = crossPath;
        }
      } else {
        const pts = _layout.waypoints[m.room];
        if (pts && pts.length > 0) {
          const wp = pts[Math.floor(Math.random() * pts.length)];
          m.path = buildPathInRoom(m.x, m.y, wp.x, wp.y, m.room);
        }
      }
      m.walkTimer = 0;
    }
  } else if (m.state === 'walking') {
    if (m.path.length === 0) {
      m.state = 'idle'; m.dir = 'down';
      m.stateTimer = 120 + Math.floor(Math.random() * 240);
      return;
    }
    const tgt = m.path[0];
    const dx = tgt.x - m.x, dy = tgt.y - m.y;
    const dist = Math.sqrt(dx * dx + dy * dy);
    if (dist < 1.5) {
      m.x = tgt.x; m.y = tgt.y; m.path.shift();
      for (const [rn, rm] of Object.entries(_layout.rooms)) {
        if (m.x >= rm.fx && m.x <= rm.fx + rm.fw && m.y >= rm.fy && m.y <= rm.fy + rm.fh) {
          m.room = rn; break;
        }
      }
    } else {
      const spd = 0.15;  // slightly slower than employees
      m.x += dx / dist * spd; m.y += dy / dist * spd;
      if (Math.abs(dx) > Math.abs(dy)) m.dir = dx > 0 ? 'right' : 'left';
      else m.dir = dy > 0 ? 'down' : 'up';
      m.walkTimer++;
      m.walkFrame = Math.floor(m.walkTimer / 15) % 2;  // 2 frames for mascot
    }
  }
}

function drawMascot(m: MascotState) {
  const frame = m.state === 'walking' ? m.walkFrame : 0;
  const pixels = MASCOT_FRAMES[m.dir][frame];
  const mx = Math.round(m.x), my = Math.round(m.y);
  const isSide = m.dir === 'left' || m.dir === 'right';
  // shadow (wider for side views)
  renderPixelsAt(_ctx, isSide ? MASCOT_SHADOW_SIDE : MASCOT_SHADOW, mx, my);
  // dog sprite
  renderPixelsAt(_ctx, pixels, mx, my);
  // tongue when idle facing down
  if (m.state === 'idle' && m.dir === 'down' && (m.tongueTimer % 80) < 50) {
    renderPixelsAt(_ctx, MASCOT_IDLE_TONGUE, mx, my);
  }
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
  const corrY = _layout.corridorY[room] ?? fromY;
  const path: { x: number; y: number }[] = [];
  if (fromY < corrY - 4) path.push({ x: fromX, y: corrY });
  if (Math.abs(fromX - tx) > 4) path.push({ x: tx, y: corrY });
  path.push({ x: tx, y: ty });
  return path;
}

function buildCrossRoomPath_single(fx: number, fy: number, fromRoom: string, toRoom: string) {
  const adj = _layout.adjacency[fromRoom];
  if (!adj) return [];
  const conn = adj.find(a => a.room === toRoom);
  if (!conn) return [];
  const door = _layout.doors[conn.door];
  if (!door) return [];
  const path: { x: number; y: number }[] = [];
  const corrY = _layout.corridorY[fromRoom] ?? fy;
  const tCorrY = _layout.corridorY[toRoom] ?? fy;
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
  const adj = _layout.adjacency[ch.room];
  if (!adj) return [];
  let conn = adj.find(a => a.room === targetRoom);
  if (!conn) {
    for (const mid of adj) {
      const midAdj = _layout.adjacency[mid.room];
      if (midAdj?.find(a => a.room === targetRoom)) {
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
        const allRooms = Object.keys(_layout.rooms);
        if (Math.random() < 0.25 && allRooms.length > 1) {
          const rooms = allRooms.filter(r => r !== ch.room);
          const targetRoom = rooms[Math.floor(Math.random() * rooms.length)];
          const crossPath = buildCrossRoomPath(ch, targetRoom);
          const tWp = _layout.waypoints[targetRoom];
          if (tWp && tWp.length > 0) {
            const twp = tWp[Math.floor(Math.random() * tWp.length)];
            const lastPt = crossPath[crossPath.length - 1] ?? { x: ch.x, y: ch.y };
            const inRoomPath = buildPathInRoom(lastPt.x, lastPt.y, twp.x, twp.y, targetRoom);
            ch.path = [...crossPath, ...inRoomPath];
          } else {
            ch.path = crossPath;
          }
          ch.walkTimer = 0;
        } else {
          const pts = _layout.waypoints[ch.room];
          if (pts && pts.length > 0) {
            const wp = pts[Math.floor(Math.random() * pts.length)];
            ch.path = buildPathInRoom(ch.x, ch.y, wp.x, wp.y, ch.room);
          }
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
        for (const [rn, rm] of Object.entries(_layout.rooms)) {
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
          const pts = _layout.waypoints[ch.room];
          if (pts && pts.length > 0) {
            const wp = pts[Math.floor(Math.random() * pts.length)];
            ch.path = buildPathInRoom(ch.x, ch.y, wp.x, wp.y, ch.room);
          }
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
  mascot?: MascotState | null,
) {
  const { canvasW: AW, canvasH: AH, rooms } = _layout;
  _ctx.clearRect(0, 0, AW, AH);
  px(0, 0, AW, AH, '#2A1E14');

  // Floors — draw based on room floorType
  const floorDrawers: Record<string, (r: { fx: number; fy: number; fw: number; fh: number }) => void> = {
    wood: drawWoodFloor, dark: drawDarkFloor, carpet: drawCarpetFloor, tile: drawTileFloor,
  };
  for (const rm of Object.values(rooms)) {
    const drawFloor = floorDrawers[rm.floorType] ?? drawWoodFloor;
    drawFloor(rm);
  }

  // Door floor patches (only for 4-room presets)
  const roomIds = Object.keys(rooms);
  if (roomIds.length >= 4) {
    const E = rooms['exec'], M2 = rooms['meet'];
    const { doors } = _layout;
    if (E && M2 && doors['exec_meet'] && doors['work_comm']) {
      const doorW = 28;
      const doorX1 = (doors['exec_meet'].doorX ?? 0) - doorW / 2;
      const doorX2 = (doors['work_comm'].doorX ?? 0) - doorW / 2;
      const gapTop = E.fy + E.fh;
      const gapBot = M2.fy;
      drawWoodFloor({ fx: doorX1, fy: gapTop, fw: doorW, fh: gapBot - gapTop });
      drawDarkFloor({ fx: doorX2, fy: gapTop, fw: doorW, fh: gapBot - gapTop });
    }
  }

  // Walls — pass door gaps so meet/comm top walls don't cover horizontal doors
  const doorGaps: Record<string, { x: number; w: number }> = {};
  if (roomIds.length >= 4) {
    const { doors: drs } = _layout;
    const dw = 28;
    const dEM = drs['exec_meet'];
    const dWC = drs['work_comm'];
    if (dEM?.doorX) doorGaps['meet'] = { x: dEM.doorX - dw / 2, w: dw };
    if (dWC?.doorX) doorGaps['comm'] = { x: dWC.doorX - dw / 2, w: dw };
  }
  for (const rm of Object.values(rooms)) {
    drawWallFace(rm, doorGaps[rm.id]);
    drawSideWalls(rm);
  }
  drawFrame();

  // Wall decorations (data-driven)
  renderWallDecorations(_layout);

  // Y-sorted entities
  const entities: { y: number; draw: () => void }[] = [];

  // Static furniture (data-driven)
  const deskRooms = new Set(Object.values(DESKS).map(d => d.room));
  pushFurnitureEntities(_layout, entities, deskRooms);

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

  // Office mascot (bichon dog)
  if (mascot) {
    entities.push({
      y: mascot.y + 10,  // offset for Y-sort (mascot is smaller)
      draw: () => drawMascot(mascot),
    });
  }

  entities.sort((a, b) => a.y - b.y);
  for (const e of entities) e.draw();

  // Facility interaction indicators
  for (const fz of _facilityZones) {
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

  // Edit mode: furniture + desk highlights
  if (_editMode) {
    const editDeskRooms = new Set(Object.values(DESKS).map(d => d.room));
    // Furniture highlights
    if (_hoverFurniture && _hoverFurniture !== _selectedFurniture) {
      if (_hoverFurniture.startsWith('desk:')) {
        const rid = _hoverFurniture.slice(5);
        const d = DESKS[rid];
        if (d) drawDeskHighlight(_ctx, d.dx, d.dy, '#FBBF24');
      } else {
        drawFurnitureHighlight(_ctx, _layout, _hoverFurniture, '#FBBF24', editDeskRooms);
      }
    }
    if (_selectedFurniture) {
      if (_selectedFurniture.startsWith('desk:')) {
        const rid = _selectedFurniture.slice(5);
        const d = DESKS[rid];
        if (d) drawDeskHighlight(_ctx, d.dx, d.dy, '#3B82F6');
      } else {
        drawFurnitureHighlight(_ctx, _layout, _selectedFurniture, '#3B82F6', editDeskRooms);
      }
    }
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
  onRoleClick, onProjectClick, onBulletinClick, onDecisionsClick, onKnowledgeClick, onSettingsClick, onThemeClick, onStatsClick,
  getRoleSpeech, getAppearance, onHireClick, roleLevels,
}: TopDownOfficeViewProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const overlayRef = useRef<HTMLDivElement>(null);
  const charsRef = useRef<Record<string, CharState>>({});
  const mascotRef = useRef<MascotState | null>(null);
  const frameRef = useRef(0);
  const zoomRef = useRef(DEFAULT_ZOOM);
  const [editMode, setEditMode] = useState(false);
  const [placingType, setPlacingType] = useState<FurnitureType | null>(null);
  const [placingZone, setPlacingZone] = useState<'wall' | 'floor' | null>(null);
  const overridesRef = useRef<Record<string, { offsetX: number; offsetY: number }>>({});
  const deskOverridesRef = useRef<Record<string, { dx: number; dy: number }>>({});
  const removedRef = useRef<string[]>([]);
  const addedRef = useRef<FurnitureDef[]>([]);

  // Sync editMode to module-level flag for drawScene
  useEffect(() => { _editMode = editMode; }, [editMode]);
  useEffect(() => { _placingType = placingType; _placingZone = placingZone; }, [placingType, placingZone]);

  // Load all edit overrides from preferences on mount
  useEffect(() => {
    api.getPreferences().then((prefs: Record<string, unknown>) => {
      const ov = prefs.furnitureOverrides as Record<string, { offsetX: number; offsetY: number }> | undefined;
      if (ov && Object.keys(ov).length > 0) {
        overridesRef.current = ov;
        _layout = applyFurnitureOverrides(_layout, ov);
      }
      const dov = prefs.deskOverrides as Record<string, { dx: number; dy: number }> | undefined;
      if (dov && Object.keys(dov).length > 0) {
        deskOverridesRef.current = dov;
        applyDeskOverrides(DESKS, dov);
        // Update character home positions
        for (const [roleId, d] of Object.entries(DESKS)) {
          const ch = charsRef.current[roleId];
          if (ch) { ch.homeX = d.dx + 8; ch.homeY = d.dy + 34; }
        }
      }
      const rem = prefs.removedFurniture as string[] | undefined;
      if (rem && rem.length > 0) {
        removedRef.current = rem;
        _layout = applyFurnitureRemovals(_layout, rem);
      }
      const added = prefs.addedFurniture as FurnitureDef[] | undefined;
      if (added && added.length > 0) {
        addedRef.current = added;
        _layout = applyAddedFurniture(_layout, added);
      }
      _facilityZones = buildFacilityZonesFromFurniture(_layout);
    }).catch(() => { /* ignore */ });
  }, []);

  // Mutable refs for data the animation loop reads
  const propsRef = useRef({ roleStatuses, activeExecs, getRoleSpeech, getAppearance });
  propsRef.current = { roleStatuses, activeExecs, getRoleSpeech, getAppearance };

  // All role IDs — layout adapts to count
  const assignedRoleIds = useMemo(() => roles.map(r => r.id), [roles]);

  // Generate layout + assign desks when role count changes
  const layoutRef = useRef<FloorLayout>(_layout);
  useEffect(() => {
    const count = assignedRoleIds.length;
    const newPreset = selectPreset(count, layoutRef.current.preset);
    let newLayout = generateFloorLayout(count, newPreset);
    if (removedRef.current.length > 0) newLayout = applyFurnitureRemovals(newLayout, removedRef.current);
    if (addedRef.current.length > 0) newLayout = applyAddedFurniture(newLayout, addedRef.current);
    if (Object.keys(overridesRef.current).length > 0) {
      newLayout = applyFurnitureOverrides(newLayout, overridesRef.current);
    }
    _layout = newLayout;
    layoutRef.current = newLayout;
    DESKS = assignDesks(assignedRoleIds);
    if (Object.keys(deskOverridesRef.current).length > 0) applyDeskOverrides(DESKS, deskOverridesRef.current);
    _facilityZones = buildFacilityZonesFromFurniture(newLayout);
    charsRef.current = createChars(assignedRoleIds);
    mascotRef.current = createMascot();

    // Update canvas dimensions
    const canvas = canvasRef.current;
    if (canvas) {
      canvas.width = newLayout.canvasW;
      canvas.height = newLayout.canvasH;
    }
    updateZoom();
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

    const { canvasW, canvasH } = _layout;
    let z = Math.floor(Math.min(pw / canvasW, ph / canvasH));
    z = Math.max(2, Math.min(z, 5));
    zoomRef.current = z;

    canvas.style.width = canvasW * z + 'px';
    canvas.style.height = canvasH * z + 'px';
    wrap.style.width = canvasW * z + 'px';
    wrap.style.height = canvasH * z + 'px';
  }, []);

  // Animation loop
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    _ctx = ctx;
    setRenderContext(ctx);

    updateZoom();
    const resizeObs = new ResizeObserver(() => updateZoom());
    const parent = wrapRef.current?.parentElement;
    if (parent) resizeObs.observe(parent);

    let raf: number;
    const tick = () => {
      frameRef.current++;
      updateChars(charsRef.current, frameRef.current);
      if (mascotRef.current) updateMascot(mascotRef.current);
      drawScene(charsRef.current, getAp, propsRef.current.roleStatuses, mascotRef.current);
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

    const roleNameMap: Record<string, string> = {};
    for (const r of roles) { roleNameMap[r.id] = r.name; }

    for (const id of assignedRoleIds) {
      const color = ROLE_COLORS[id] ?? '#8b949e';
      const rName = roleNameMap[id];
      const displayName = rName && rName.toLowerCase() !== id.toLowerCase()
        ? `${id.toUpperCase()} · ${rName}`
        : id.toUpperCase();

      // Name tag
      const tag = document.createElement('div');
      tag.className = 'td-nametag';
      tag.dataset.role = id;
      const dotEl = document.createElement('span');
      dotEl.className = 'td-dot';
      dotEl.style.background = color;
      tag.appendChild(dotEl);
      tag.appendChild(document.createTextNode(displayName));
      // Level badge
      const lvl = roleLevels?.[id]?.level ?? 1;
      if (lvl > 1) {
        const lvlEl = document.createElement('span');
        lvlEl.className = 'td-lvl';
        lvlEl.textContent = `Lv.${lvl}`;
        tag.appendChild(lvlEl);
      }
      overlay.appendChild(tag);

      // Speech bubble
      const bub = document.createElement('div');
      bub.className = 'td-bubble';
      bub.dataset.role = id;
      bub.dataset.type = 'bubble';
      overlay.appendChild(bub);
    }

    // Facility labels
    const facilityHandlers: Record<string, (() => void) | undefined> = {
      meeting: () => { const p = projects[0]; if (p) onProjectClick(p.id); else onBulletinClick(); },
      bulletin: onBulletinClick,
      decisions: onDecisionsClick,
      knowledge: onKnowledgeClick,
      settings: onSettingsClick,
      theme: onThemeClick,
      stats: onStatsClick,
    };
    for (const fz of _facilityZones) {
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
  }, [assignedRoleIds, roles, projects, onProjectClick, onBulletinClick, onDecisionsClick, onKnowledgeClick, onSettingsClick, onThemeClick, onStatsClick, roleLevels]);

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

      const ox = (cx / _layout.canvasW * 100);

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
        const text = isWorking && activeTask ? activeTask.slice(0, 60) : speech ? speech.slice(0, 60) : '';

        if (text && ch.state === 'sitting') {
          bub.style.display = '';
          bub.style.left = ox + '%';
          bub.style.top = ((charTopY - 10) * z) + 'px';
          bub.textContent = text;
        } else {
          bub.style.display = 'none';
        }
      }
    }

    // Facility labels
    for (const fz of _facilityZones) {
      const lbl = overlay.querySelector(`.td-facility-label[data-facility="${fz.id}"]`) as HTMLElement;
      if (lbl) {
        const lp = facilityLabelPos(fz);
        lbl.style.left = (lp.cx / _layout.canvasW * 100) + '%';
        lbl.style.top = (lp.botY * z - 4) + 'px';
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
    for (const fz of _facilityZones) {
      const hb = facilityHitBox(fz);
      if (mx >= hb.x && mx <= hb.x + hb.w && my >= hb.y && my <= hb.y + hb.h)
        return { type: 'facility' as const, id: fz.id };
    }
    return null;
  }, []);

  // Helper: get canvas-space coords from mouse event
  const canvasCoords = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return { mx: 0, my: 0 };
    const rect = canvas.getBoundingClientRect();
    const z = zoomRef.current;
    return { mx: (e.clientX - rect.left) / z, my: (e.clientY - rect.top) / z };
  }, []);

  // Save overrides to server
  const saveOverrides = useCallback((patch: Record<string, unknown>) => {
    api.updatePreferences(patch).catch(() => { /* ignore */ });
  }, []);

  // Remove furniture by id
  const removeFurnitureById = useCallback((fId: string) => {
    const newRemoved = [...removedRef.current, fId];
    removedRef.current = newRemoved;
    _layout = applyFurnitureRemovals(_layout, [fId]);
    _facilityZones = buildFacilityZonesFromFurniture(_layout);
    _selectedFurniture = null;
    _hoverFurniture = null;
    saveOverrides({ removedFurniture: newRemoved });
  }, [saveOverrides]);

  // Place new furniture at canvas coords
  const placeFurniture = useCallback((mx: number, my: number) => {
    if (!_placingType || !_placingZone) return;
    // Find which room was clicked
    let targetRoom: string | null = null;
    for (const [id, room] of Object.entries(_layout.rooms)) {
      const rx = _placingZone === 'wall' ? room.wx : room.fx;
      const ry = _placingZone === 'wall' ? room.wy : room.fy;
      const rw = _placingZone === 'wall' ? room.ww : room.fw;
      const rh = _placingZone === 'wall' ? room.wh : room.fh;
      if (mx >= rx && mx <= rx + rw && my >= ry && my <= ry + rh) { targetRoom = id; break; }
    }
    if (!targetRoom) return;
    const room = _layout.rooms[targetRoom];
    const baseX = _placingZone === 'wall' ? room.wx : room.fx;
    const baseY = _placingZone === 'wall' ? room.wy : room.fy;
    const newDef: FurnitureDef = {
      id: `user-${_placingType}-${Date.now()}`,
      type: _placingType,
      room: targetRoom,
      zone: _placingZone,
      offsetX: Math.round(mx - baseX),
      offsetY: Math.round(my - baseY),
    };
    const newAdded = [...addedRef.current, newDef];
    addedRef.current = newAdded;
    // Add to current layout
    if (_placingZone === 'wall') _layout.wallDecorations.push(newDef);
    else _layout.furniture.push(newDef);
    _facilityZones = buildFacilityZonesFromFurniture(_layout);
    saveOverrides({ addedFurniture: newAdded });
    // Exit placement mode
    setPlacingType(null);
    setPlacingZone(null);
  }, [saveOverrides]);

  // Mouse move — hover detection + drag
  const handleMouseMove = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;

    // Dragging furniture
    if (_editMode && _dragging) {
      const { mx, my } = canvasCoords(e);
      const allDefs = [..._layout.furniture, ..._layout.wallDecorations];
      const def = allDefs.find(d => d.id === _dragging!.defId);
      if (!def) return;
      const dx = mx - _dragging.startMx;
      const dy = my - _dragging.startMy;
      def.offsetX = Math.round(_dragging.origOffX + dx);
      def.offsetY = Math.round(_dragging.origOffY + dy);
      _facilityZones = buildFacilityZonesFromFurniture(_layout);
      if (canvas) canvas.style.cursor = 'grabbing';
      return;
    }

    // Dragging desk
    if (_editMode && _draggingDesk) {
      const { mx, my } = canvasCoords(e);
      const d = DESKS[_draggingDesk.roleId];
      if (!d) return;
      d.dx = Math.round(_draggingDesk.origDx + (mx - _draggingDesk.startMx));
      d.dy = Math.round(_draggingDesk.origDy + (my - _draggingDesk.startMy));
      // Update character home
      const ch = charsRef.current[_draggingDesk.roleId];
      if (ch) { ch.homeX = d.dx + 8; ch.homeY = d.dy + 34; }
      if (canvas) canvas.style.cursor = 'grabbing';
      return;
    }

    if (_editMode) {
      const { mx, my } = canvasCoords(e);
      if (_placingType) {
        if (canvas) canvas.style.cursor = 'crosshair';
        return;
      }
      const deskRooms = new Set(Object.values(DESKS).map(d => d.room));
      const fId = hitTestFurniture(_layout, mx, my, deskRooms);
      if (fId) {
        _hoverFurniture = fId;
      } else {
        // Check desks
        const deskHit = hitTestDesks(DESKS, mx, my);
        _hoverFurniture = deskHit ? `desk:${deskHit}` : null;
      }
      _hoverRole = null;
      _hoverFacility = null;
      if (canvas) canvas.style.cursor = _hoverFurniture ? 'grab' : 'default';
      return;
    }

    const hit = hitTest(e);
    _hoverRole = hit?.type === 'role' ? hit.id : null;
    _hoverFacility = hit?.type === 'facility' ? hit.id : null;
    _hoverFurniture = null;
    if (canvas) canvas.style.cursor = hit ? 'pointer' : 'default';
  }, [hitTest, canvasCoords]);

  const handleMouseDown = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!_editMode) return;
    const { mx, my } = canvasCoords(e);

    // Placement mode — click to place
    if (_placingType) {
      placeFurniture(mx, my);
      e.preventDefault();
      return;
    }

    const deskRooms = new Set(Object.values(DESKS).map(d => d.room));
    const fId = hitTestFurniture(_layout, mx, my, deskRooms);
    if (fId) {
      const allDefs = [..._layout.furniture, ..._layout.wallDecorations];
      const def = allDefs.find(d => d.id === fId);
      if (def) {
        _selectedFurniture = fId;
        _dragging = { defId: fId, startMx: mx, startMy: my, origOffX: def.offsetX, origOffY: def.offsetY };
        e.preventDefault();
      }
      return;
    }
    // Check desk hit
    const deskHit = hitTestDesks(DESKS, mx, my);
    if (deskHit) {
      const d = DESKS[deskHit];
      _selectedFurniture = `desk:${deskHit}`;
      _draggingDesk = { roleId: deskHit, startMx: mx, startMy: my, origDx: d.dx, origDy: d.dy };
      e.preventDefault();
      return;
    }
    _selectedFurniture = null;
  }, [canvasCoords, placeFurniture]);

  const handleMouseUp = useCallback((_e: React.MouseEvent<HTMLCanvasElement>) => {
    // Furniture drag release
    if (_dragging) {
      const allDefs = [..._layout.furniture, ..._layout.wallDecorations];
      const def = allDefs.find(d => d.id === _dragging!.defId);
      if (def) {
        const newOverrides = { ...overridesRef.current, [def.id]: { offsetX: def.offsetX, offsetY: def.offsetY } };
        overridesRef.current = newOverrides;
        saveOverrides({ furnitureOverrides: newOverrides });
        _facilityZones = buildFacilityZonesFromFurniture(_layout);
      }
      _dragging = null;
      if (canvasRef.current) canvasRef.current.style.cursor = 'grab';
      return;
    }
    // Desk drag release
    if (_draggingDesk) {
      const d = DESKS[_draggingDesk.roleId];
      if (d) {
        const newDeskOv = { ...deskOverridesRef.current, [_draggingDesk.roleId]: { dx: d.dx, dy: d.dy } };
        deskOverridesRef.current = newDeskOv;
        saveOverrides({ deskOverrides: newDeskOv });
      }
      _draggingDesk = null;
      if (canvasRef.current) canvasRef.current.style.cursor = 'grab';
    }
  }, [saveOverrides]);

  // Right-click to remove furniture
  const handleContextMenu = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!_editMode) return;
    e.preventDefault();
    const { mx, my } = canvasCoords(e);
    const deskRooms = new Set(Object.values(DESKS).map(d => d.room));
    const fId = hitTestFurniture(_layout, mx, my, deskRooms);
    if (fId) removeFurnitureById(fId);
  }, [canvasCoords, removeFurnitureById]);

  // DEL key to remove selected furniture
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!_editMode || !_selectedFurniture) return;
      if (e.key === 'Delete' || e.key === 'Backspace') {
        if (!_selectedFurniture.startsWith('desk:')) {
          removeFurnitureById(_selectedFurniture);
        }
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [removeFurnitureById]);

  const handleMouseLeave = useCallback(() => {
    if (_dragging) {
      const allDefs = [..._layout.furniture, ..._layout.wallDecorations];
      const def = allDefs.find(d => d.id === _dragging!.defId);
      if (def) {
        def.offsetX = _dragging.origOffX;
        def.offsetY = _dragging.origOffY;
        _facilityZones = buildFacilityZonesFromFurniture(_layout);
      }
      _dragging = null;
    }
    if (_draggingDesk) {
      const d = DESKS[_draggingDesk.roleId];
      if (d) { d.dx = _draggingDesk.origDx; d.dy = _draggingDesk.origDy; }
      const ch = charsRef.current[_draggingDesk.roleId];
      if (ch) { ch.homeX = d.dx + 8; ch.homeY = d.dy + 34; }
      _draggingDesk = null;
    }
    _hoverRole = null;
    _hoverFacility = null;
    _hoverFurniture = null;
    if (canvasRef.current) canvasRef.current.style.cursor = 'default';
  }, []);

  // Canvas click handler
  const handleClick = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    if (_editMode) return; // clicks handled by mouseDown/Up in edit mode
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
      case 'settings': onSettingsClick?.(); break;
      case 'theme': onThemeClick?.(); break;
      case 'stats': onStatsClick?.(); break;
    }
  }, [hitTest, onRoleClick, onProjectClick, onBulletinClick, onDecisionsClick, onKnowledgeClick, onSettingsClick, onThemeClick, onStatsClick]);

  return (
    <div className={`td-scene${editMode ? ' td-scene--editing' : ''}`}>
      <div ref={wrapRef} className="td-wrap">
        <canvas
          ref={canvasRef}
          width={_layout.canvasW}
          height={_layout.canvasH}
          className="td-canvas"
          onClick={handleClick}
          onMouseDown={handleMouseDown}
          onMouseUp={handleMouseUp}
          onMouseMove={handleMouseMove}
          onMouseLeave={handleMouseLeave}
          onContextMenu={handleContextMenu}
        />
        <div ref={overlayRef} className="td-overlay" />
      </div>
      {editMode && (
        <div className="td-edit-banner">
          <span className="td-edit-banner__icon">✎</span> EDIT MODE — Click DONE when finished
        </div>
      )}
      <button
        className={`td-edit-btn${editMode ? ' td-edit-btn--active' : ''}`}
        onClick={() => {
          setEditMode(m => {
            const next = !m;
            if (!next) { setPlacingType(null); setPlacingZone(null); }
            return next;
          });
          _selectedFurniture = null; _dragging = null; _draggingDesk = null;
        }}
        title={editMode ? 'Exit Edit Mode' : 'Edit Furniture Layout'}
      >
        <span className="td-edit-btn__icon">{editMode ? '✓' : '✎'}</span>
        <span className="td-edit-btn__label">{editMode ? 'DONE' : 'EDIT'}</span>
      </button>
      {editMode && (
        <div className="td-palette">
          {FURNITURE_CATALOG.map(entry => (
            <button
              key={entry.type}
              className={`td-palette__item${placingType === entry.type ? ' td-palette__item--active' : ''}`}
              onClick={() => {
                if (placingType === entry.type) { setPlacingType(null); setPlacingZone(null); }
                else { setPlacingType(entry.type); setPlacingZone(entry.zone); }
              }}
              title={entry.label}
            >
              <span>{entry.icon}</span>
            </button>
          ))}
        </div>
      )}
      {onHireClick && (
        <button className="td-hire-btn" onClick={onHireClick} title="Hire New Role">
          <span className="td-hire-btn__icon">+</span>
          <span className="td-hire-btn__label">HIRE</span>
        </button>
      )}
    </div>
  );
}
