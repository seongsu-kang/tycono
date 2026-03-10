/* ═══════════════════════════════════════════
   Floor Template System — Growth Presets

   Preset M: 1~12 people, 4 rooms, 288×208 canvas (minimum — facilities need 4 rooms)
   Preset L: 13~25 people, 4 rooms, 360×260 canvas

   Each preset generates rooms, desks, waypoints,
   doors, adjacency, and corridor data dynamically.
   ═══════════════════════════════════════════ */

import type { FurnitureDef } from './furniture-types';

/* ─── Shared types ─────────────────────── */

export interface RoomDef {
  id: string;
  wx: number; wy: number; ww: number; wh: number;  // wall
  fx: number; fy: number; fw: number; fh: number;  // floor
  wallColor: string; baseboardColor: string;
  floorType: 'wood' | 'dark' | 'carpet' | 'tile';
}

export interface DeskDef {
  dx: number; dy: number; room: string;
}

export interface DoorDef {
  id: string;
  type: 'v' | 'h';
  doorY?: number; doorX?: number;
  xA?: number; xB?: number;
  yA?: number; yB?: number;
}

export interface AdjEntry { room: string; door: string; side: 'A' | 'B'; }

export type Preset = 'S' | 'M' | 'L';

export interface FloorLayout {
  preset: Preset;
  canvasW: number;
  canvasH: number;
  rooms: Record<string, RoomDef>;
  desks: DeskDef[];
  doors: Record<string, DoorDef>;
  adjacency: Record<string, AdjEntry[]>;
  corridorY: Record<string, number>;
  waypoints: Record<string, { x: number; y: number }[]>;
  wallDecorations: FurnitureDef[];
  furniture: FurnitureDef[];
}

/* ─── Layout constants ─────────────────── */

const BORDER = 4;
const WALL_H = 28;
const BASEBOARD = 2;
const DIV_H = 4;
const SIDE_W = 4;

/* ─── Room themes ──────────────────────── */

interface RoomTheme {
  wallColor: string;
  baseboardColor: string;
  floorType: 'wood' | 'dark' | 'carpet' | 'tile';
}

const THEMES: RoomTheme[] = [
  { wallColor: '#C8B898', baseboardColor: '#6A5840', floorType: 'wood' },
  { wallColor: '#A8B8C8', baseboardColor: '#586878', floorType: 'dark' },
  { wallColor: '#A8C8B0', baseboardColor: '#4A6A50', floorType: 'carpet' },
  { wallColor: '#C8C0A8', baseboardColor: '#7A6A50', floorType: 'tile' },
];

/* ─── Desk generation ──────────────────── */

/** Place desks in a room as a grid. Returns desk positions. */
function generateDesksInRoom(
  room: RoomDef,
  count: number,
  maxCols: number,
): DeskDef[] {
  const DESK_W = 28;    // desk unit width (including gap)
  const PAD_X = 8;      // padding from floor edge
  // Place desk row so character sits behind desk (matches original hand-tuned positions)
  const DESK_ROW_Y = room.fy + Math.max(10, Math.floor(room.fh * 0.18));

  const cols = Math.min(count, maxCols);
  const rows = Math.ceil(count / cols);
  const desks: DeskDef[] = [];

  // Center the grid horizontally in the room
  const gridW = cols * DESK_W;
  const startX = room.fx + Math.max(PAD_X, Math.floor((room.fw - gridW) / 2));

  for (let r = 0; r < rows && desks.length < count; r++) {
    const colsInRow = Math.min(cols, count - r * cols);
    for (let c = 0; c < colsInRow; c++) {
      desks.push({
        dx: startX + c * DESK_W,
        dy: DESK_ROW_Y + r * 28,  // 28px between rows (not 44)
        room: room.id,
      });
    }
  }
  return desks;
}

/* ─── Preset S: 1 room ─────────────────── */

function presetS(deskCount: number): FloorLayout {
  const CW = 160, CH = 120;
  const theme = THEMES[0];

  const room: RoomDef = {
    id: 'main',
    wx: BORDER + SIDE_W, wy: BORDER,
    ww: CW - 2 * (BORDER + SIDE_W), wh: WALL_H,
    fx: BORDER + SIDE_W, fy: BORDER + WALL_H + BASEBOARD,
    fw: CW - 2 * (BORDER + SIDE_W), fh: CH - BORDER - WALL_H - BASEBOARD - BORDER,
    ...theme,
  };

  const desks = generateDesksInRoom(room, Math.min(deskCount, 6), 3);

  const wallDecorations: FurnitureDef[] = [
    { id: 's-window-l', type: 'window', room: 'main', zone: 'wall', offsetX: 10, offsetY: 6, windowW: 16, windowH: 14 },
    { id: 's-window-r', type: 'window', room: 'main', zone: 'wall', anchorX: 'right', offsetX: -26, offsetY: 6, windowW: 16, windowH: 14 },
    { id: 's-clock', type: 'clock', room: 'main', zone: 'wall', offsetX: Math.floor((CW - 2 * (BORDER + SIDE_W)) / 2), offsetY: 10 },
  ];

  const furniture: FurnitureDef[] = [
    { id: 's-plant-l', type: 'plant', room: 'main', zone: 'floor', offsetX: 4, offsetY: 4 },
    { id: 's-plant-r', type: 'plant', room: 'main', zone: 'floor', anchorX: 'right', offsetX: -8, offsetY: 4 },
  ];

  return {
    preset: 'S',
    canvasW: CW, canvasH: CH,
    rooms: { main: room },
    desks,
    doors: {},
    adjacency: { main: [] },
    corridorY: { main: room.fy + room.fh - 12 },
    waypoints: {
      main: [
        { x: room.fx + 10, y: room.fy + room.fh - 14 },
        { x: room.fx + room.fw / 2, y: room.fy + room.fh - 14 },
        { x: room.fx + room.fw - 10, y: room.fy + room.fh - 14 },
      ],
    },
    wallDecorations,
    furniture,
  };
}

/* ─── Preset M: 4 rooms (current layout) ── */

function presetM(deskCount: number): FloorLayout {
  const CW = 288, CH = 208;
  const MID_X = CW / 2;

  // Top-left
  const exec: RoomDef = {
    id: 'exec',
    wx: BORDER + SIDE_W, wy: BORDER,
    ww: MID_X - BORDER - SIDE_W - DIV_H / 2, wh: WALL_H,
    fx: BORDER + SIDE_W, fy: BORDER + WALL_H + BASEBOARD,
    fw: MID_X - BORDER - SIDE_W - DIV_H / 2, fh: 66,
    ...THEMES[0],
  };
  // Top-right
  const work: RoomDef = {
    id: 'work',
    wx: MID_X + DIV_H / 2 + SIDE_W, wy: BORDER,
    ww: CW - MID_X - DIV_H / 2 - SIDE_W - BORDER, wh: WALL_H,
    fx: MID_X + DIV_H / 2 + SIDE_W, fy: BORDER + WALL_H + BASEBOARD,
    fw: CW - MID_X - DIV_H / 2 - SIDE_W - BORDER, fh: 66,
    ...THEMES[1],
  };
  // Bottom-left
  const meet: RoomDef = {
    id: 'meet',
    wx: BORDER + SIDE_W, wy: BORDER + WALL_H + BASEBOARD + 66 + DIV_H,
    ww: MID_X - BORDER - SIDE_W - DIV_H / 2, wh: WALL_H,
    fx: BORDER + SIDE_W, fy: BORDER + WALL_H + BASEBOARD + 66 + DIV_H + WALL_H + BASEBOARD,
    fw: MID_X - BORDER - SIDE_W - DIV_H / 2, fh: 70,
    ...THEMES[2],
  };
  // Bottom-right
  const comm: RoomDef = {
    id: 'comm',
    wx: MID_X + DIV_H / 2 + SIDE_W, wy: BORDER + WALL_H + BASEBOARD + 66 + DIV_H,
    ww: CW - MID_X - DIV_H / 2 - SIDE_W - BORDER, wh: WALL_H,
    fx: MID_X + DIV_H / 2 + SIDE_W, fy: BORDER + WALL_H + BASEBOARD + 66 + DIV_H + WALL_H + BASEBOARD,
    fw: CW - MID_X - DIV_H / 2 - SIDE_W - BORDER, fh: 70,
    ...THEMES[3],
  };

  const rooms = { exec, work, meet, comm };

  // Distribute desks: exec/work first (up to 3 each), then meet/comm (have furniture)
  const allDesks: DeskDef[] = [];
  let left = deskCount;
  // Phase 1: fill exec and work (max 3 each, no furniture conflicts)
  const phase1: [RoomDef, number][] = [[exec, Math.min(3, left)], [work, 0]];
  phase1[1][1] = Math.min(3, left - phase1[0][1]);
  // Phase 2: overflow to meet then comm (max 2 each — furniture takes space)
  const phase2: [RoomDef, number][] = [[meet, 0], [comm, 0]];
  let overflow = left - phase1[0][1] - phase1[1][1];
  if (overflow > 0) { phase2[0][1] = Math.min(2, overflow); overflow -= phase2[0][1]; }
  if (overflow > 0) { phase2[1][1] = Math.min(2, overflow); }
  for (const [rm, n] of [...phase1, ...phase2]) {
    if (n > 0) allDesks.push(...generateDesksInRoom(rm, n, 3));
  }

  // Pathfinding
  const divY = BORDER + WALL_H + BASEBOARD + 66;
  const divX = MID_X - DIV_H / 2;

  const doors: Record<string, DoorDef> = {
    exec_work: { id: 'exec_work', type: 'v', doorY: BORDER + WALL_H + BASEBOARD + 20 + 12, xA: divX - 2, xB: work.fx + 2 },
    meet_comm: { id: 'meet_comm', type: 'v', doorY: BORDER + WALL_H + BASEBOARD + 66 + DIV_H + WALL_H + BASEBOARD + 20 + 12, xA: divX - 2, xB: comm.fx + 2 },
    exec_meet: { id: 'exec_meet', type: 'h', doorX: BORDER + SIDE_W + 40 + 14, yA: divY - 2, yB: meet.fy + 2 },
    work_comm: { id: 'work_comm', type: 'h', doorX: MID_X + DIV_H / 2 + SIDE_W + 40 + 14, yA: divY - 2, yB: comm.fy + 2 },
  };

  const adjacency: Record<string, AdjEntry[]> = {
    exec: [{ room: 'work', door: 'exec_work', side: 'A' }, { room: 'meet', door: 'exec_meet', side: 'A' }],
    work: [{ room: 'exec', door: 'exec_work', side: 'B' }, { room: 'comm', door: 'work_comm', side: 'A' }],
    meet: [{ room: 'exec', door: 'exec_meet', side: 'B' }, { room: 'comm', door: 'meet_comm', side: 'A' }],
    comm: [{ room: 'work', door: 'work_comm', side: 'B' }, { room: 'meet', door: 'meet_comm', side: 'B' }],
  };

  const corridorY: Record<string, number> = {
    exec: exec.fy + 52, work: work.fy + 48,
    meet: meet.fy + 56, comm: comm.fy + 42,
  };

  const waypoints: Record<string, { x: number; y: number }[]> = {
    exec: [{ x: exec.fx + 6, y: exec.fy + 52 }, { x: exec.fx + 60, y: exec.fy + 54 }, { x: exec.fx + 112, y: exec.fy + 50 }, { x: exec.fx + 50, y: exec.fy + 52 }],
    work: [{ x: work.fx + 14, y: work.fy + 48 }, { x: work.fx + 44, y: work.fy + 48 }, { x: work.fx + 70, y: work.fy + 48 }, { x: work.fx + 100, y: work.fy + 48 }],
    meet: [{ x: meet.fx + 60, y: meet.fy + 56 }, { x: meet.fx + 30, y: meet.fy + 54 }, { x: meet.fx + 110, y: meet.fy + 50 }, { x: meet.fx + 80, y: meet.fy + 56 }],
    comm: [{ x: comm.fx + 96, y: comm.fy + 8 }, { x: comm.fx + 60, y: comm.fy + 42 }, { x: comm.fx + 40, y: comm.fy + 42 }, { x: comm.fx + 20, y: comm.fy + 42 }],
  };

  /* ─── Wall decorations (from original hardcoded coords) ── */
  const wallDecorations: FurnitureDef[] = [
    // exec room walls
    { id: 'exec-window-1', type: 'window', room: 'exec', zone: 'wall', offsetX: 10, offsetY: 6, windowW: 16, windowH: 14 },
    { id: 'exec-picture-1', type: 'picture', room: 'exec', zone: 'wall', offsetX: 34, offsetY: 8, pictureColor: '#1565C0',
      facility: { id: 'theme', label: 'THEME', icon: '\u{1F3A8}', color: '#42A5F5', hitW: 12, hitH: 10 } },
    { id: 'exec-picture-2', type: 'picture', room: 'exec', zone: 'wall', offsetX: 48, offsetY: 8, pictureColor: '#E65100' },
    { id: 'exec-clock', type: 'clock', room: 'exec', zone: 'wall', offsetX: 64, offsetY: 10,
      facility: { id: 'settings', label: 'SETTINGS', icon: '\u{2699}', color: '#78909C', hitW: 10, hitH: 10 } },
    { id: 'exec-shelf', type: 'shelf', room: 'exec', zone: 'wall', offsetX: 78, offsetY: 14,
      facility: { id: 'stats', label: 'STATS', icon: '\u{1F4CA}', color: '#7E57C2', hitW: 16, hitH: 8 } },
    { id: 'exec-window-2', type: 'window', room: 'exec', zone: 'wall', offsetX: 104, offsetY: 6, windowW: 16, windowH: 14 },
    // work room walls
    { id: 'work-whiteboard', type: 'whiteboard', room: 'work', zone: 'wall', offsetX: 6, offsetY: 4 },
    { id: 'work-window-1', type: 'window', room: 'work', zone: 'wall', offsetX: 50, offsetY: 6, windowW: 16, windowH: 14 },
    { id: 'work-window-2', type: 'window', room: 'work', zone: 'wall', offsetX: 92, offsetY: 6, windowW: 16, windowH: 14 },
    // meet room walls
    { id: 'meet-bulletin', type: 'bulletin-board', room: 'meet', zone: 'wall', offsetX: 6, offsetY: 4,
      facility: { id: 'bulletin', label: 'BULLETIN', icon: '\u{1F4CB}', color: '#F59E0B', hitW: 22, hitH: 16 } },
    { id: 'meet-picture', type: 'picture', room: 'meet', zone: 'wall', offsetX: 28, offsetY: 8, pictureColor: '#10B981' },
    { id: 'meet-window', type: 'window', room: 'meet', zone: 'wall', offsetX: 80, offsetY: 6, windowW: 16, windowH: 14 },
    { id: 'meet-shelf', type: 'shelf', room: 'meet', zone: 'wall', offsetX: 102, offsetY: 18 },
    // comm room walls
    { id: 'comm-screen', type: 'screen', room: 'comm', zone: 'wall', offsetX: 6, offsetY: 6,
      facility: { id: 'decisions', label: 'DECISIONS', icon: '\u{1F4DC}', color: '#EF4444', hitW: 16, hitH: 12 } },
    { id: 'comm-picture', type: 'picture', room: 'comm', zone: 'wall', offsetX: 28, offsetY: 8, pictureColor: '#d4956a' },
    { id: 'comm-window', type: 'window', room: 'comm', zone: 'wall', offsetX: 76, offsetY: 6, windowW: 16, windowH: 14 },
    { id: 'comm-clock', type: 'clock', room: 'comm', zone: 'wall', offsetX: 98, offsetY: 10 },
    { id: 'comm-shelf', type: 'shelf', room: 'comm', zone: 'wall', offsetX: 108, offsetY: 18 },
  ];

  /* ─── Floor furniture ── */
  const furniture: FurnitureDef[] = [
    // exec room
    { id: 'exec-bookshelf', type: 'bookshelf', room: 'exec', zone: 'floor', offsetX: 2, offsetY: 4 },
    { id: 'exec-plant-r', type: 'plant', room: 'exec', zone: 'floor', anchorX: 'right', offsetX: -10, offsetY: 4 },
    { id: 'exec-plant-c', type: 'plant', room: 'exec', zone: 'floor', offsetX: Math.floor(exec.fw / 2), offsetY: 4 },
    // work room
    { id: 'work-plant-1', type: 'plant', room: 'work', zone: 'floor', offsetX: 36, offsetY: 4 },
    { id: 'work-plant-2', type: 'plant', room: 'work', zone: 'floor', offsetX: 80, offsetY: 4 },
    // meet room
    { id: 'meet-plant', type: 'plant', room: 'meet', zone: 'floor', anchorX: 'right', offsetX: -12, offsetY: 4 },
    { id: 'meet-table', type: 'meeting-table', room: 'meet', zone: 'floor', offsetX: 10, offsetY: 42,
      facility: { id: 'meeting', label: 'MEETING', icon: '\u{1F3E2}', color: '#3B82F6', hitW: 44, hitH: 40 } },
    // comm room
    { id: 'comm-coffee-machine', type: 'coffee-machine', room: 'comm', zone: 'floor', anchorX: 'right', offsetX: -30, offsetY: 4, condition: 'no-desks' },
    { id: 'comm-plant-1', type: 'plant', room: 'comm', zone: 'floor', offsetX: 38, offsetY: 4, condition: 'no-desks' },
    { id: 'comm-bookshelf', type: 'bookshelf', room: 'comm', zone: 'floor', anchorX: 'right', offsetX: -26, offsetY: 16, accent: '#10B981', condition: 'no-desks',
      facility: { id: 'knowledge', label: 'KNOWLEDGE', icon: '\u{1F4DA}', color: '#10B981', hitW: 26, hitH: 24 } },
    { id: 'comm-sofa', type: 'sofa', room: 'comm', zone: 'floor', offsetX: 44, offsetY: 30, condition: 'no-desks' },
    { id: 'comm-coffee-table', type: 'coffee-table', room: 'comm', zone: 'floor', offsetX: 50, offsetY: 50, condition: 'no-desks' },
    { id: 'comm-plant-2', type: 'plant', room: 'comm', zone: 'floor', offsetX: 38, offsetY: 50, condition: 'no-desks' },
  ];

  return {
    preset: 'M',
    canvasW: CW, canvasH: CH,
    rooms, desks: allDesks, doors, adjacency, corridorY, waypoints,
    wallDecorations, furniture,
  };
}

/* ─── Preset L: 4 rooms, expanded ──────── */

function presetL(deskCount: number): FloorLayout {
  const CW = 360, CH = 260;
  const MID_X = CW / 2;
  const topFloorH = 82;   // taller rooms than M
  const botFloorH = 86;

  const exec: RoomDef = {
    id: 'exec',
    wx: BORDER + SIDE_W, wy: BORDER,
    ww: MID_X - BORDER - SIDE_W - DIV_H / 2, wh: WALL_H,
    fx: BORDER + SIDE_W, fy: BORDER + WALL_H + BASEBOARD,
    fw: MID_X - BORDER - SIDE_W - DIV_H / 2, fh: topFloorH,
    ...THEMES[0],
  };
  const work: RoomDef = {
    id: 'work',
    wx: MID_X + DIV_H / 2 + SIDE_W, wy: BORDER,
    ww: CW - MID_X - DIV_H / 2 - SIDE_W - BORDER, wh: WALL_H,
    fx: MID_X + DIV_H / 2 + SIDE_W, fy: BORDER + WALL_H + BASEBOARD,
    fw: CW - MID_X - DIV_H / 2 - SIDE_W - BORDER, fh: topFloorH,
    ...THEMES[1],
  };
  const divYBase = BORDER + WALL_H + BASEBOARD + topFloorH;
  const meet: RoomDef = {
    id: 'meet',
    wx: BORDER + SIDE_W, wy: divYBase + DIV_H,
    ww: MID_X - BORDER - SIDE_W - DIV_H / 2, wh: WALL_H,
    fx: BORDER + SIDE_W, fy: divYBase + DIV_H + WALL_H + BASEBOARD,
    fw: MID_X - BORDER - SIDE_W - DIV_H / 2, fh: botFloorH,
    ...THEMES[2],
  };
  const comm: RoomDef = {
    id: 'comm',
    wx: MID_X + DIV_H / 2 + SIDE_W, wy: divYBase + DIV_H,
    ww: CW - MID_X - DIV_H / 2 - SIDE_W - BORDER, wh: WALL_H,
    fx: MID_X + DIV_H / 2 + SIDE_W, fy: divYBase + DIV_H + WALL_H + BASEBOARD,
    fw: CW - MID_X - DIV_H / 2 - SIDE_W - BORDER, fh: botFloorH,
    ...THEMES[3],
  };

  const rooms = { exec, work, meet, comm };

  // Distribute desks: exec/work first (max 5 each), then meet/comm (max 3 each — furniture)
  const allDesks: DeskDef[] = [];
  let left = deskCount;
  // Phase 1: fill exec and work (max 5 each, bigger rooms in L)
  const phase1: [RoomDef, number][] = [[exec, Math.min(5, left)], [work, 0]];
  phase1[1][1] = Math.min(5, left - phase1[0][1]);
  // Phase 2: overflow to meet then comm (max 3 each — furniture takes space)
  const phase2: [RoomDef, number][] = [[meet, 0], [comm, 0]];
  let overflow = left - phase1[0][1] - phase1[1][1];
  if (overflow > 0) { phase2[0][1] = Math.min(3, overflow); overflow -= phase2[0][1]; }
  if (overflow > 0) { phase2[1][1] = Math.min(3, overflow); }
  for (const [rm, n] of [...phase1, ...phase2]) {
    if (n > 0) allDesks.push(...generateDesksInRoom(rm, n, 4));
  }

  const divX = MID_X - DIV_H / 2;
  const doors: Record<string, DoorDef> = {
    exec_work: { id: 'exec_work', type: 'v', doorY: exec.fy + topFloorH / 2, xA: divX - 2, xB: work.fx + 2 },
    meet_comm: { id: 'meet_comm', type: 'v', doorY: meet.fy + botFloorH / 2, xA: divX - 2, xB: comm.fx + 2 },
    exec_meet: { id: 'exec_meet', type: 'h', doorX: exec.fx + 54, yA: divYBase - 2, yB: meet.fy + 2 },
    work_comm: { id: 'work_comm', type: 'h', doorX: work.fx + 54, yA: divYBase - 2, yB: comm.fy + 2 },
  };

  const adjacency: Record<string, AdjEntry[]> = {
    exec: [{ room: 'work', door: 'exec_work', side: 'A' }, { room: 'meet', door: 'exec_meet', side: 'A' }],
    work: [{ room: 'exec', door: 'exec_work', side: 'B' }, { room: 'comm', door: 'work_comm', side: 'A' }],
    meet: [{ room: 'exec', door: 'exec_meet', side: 'B' }, { room: 'comm', door: 'meet_comm', side: 'A' }],
    comm: [{ room: 'work', door: 'work_comm', side: 'B' }, { room: 'meet', door: 'meet_comm', side: 'B' }],
  };

  const corridorY: Record<string, number> = {
    exec: exec.fy + topFloorH - 12,
    work: work.fy + topFloorH - 12,
    meet: meet.fy + botFloorH - 12,
    comm: comm.fy + botFloorH - 12,
  };

  const waypoints: Record<string, { x: number; y: number }[]> = {
    exec: [
      { x: exec.fx + 10, y: corridorY.exec },
      { x: exec.fx + exec.fw / 2, y: corridorY.exec },
      { x: exec.fx + exec.fw - 10, y: corridorY.exec },
    ],
    work: [
      { x: work.fx + 10, y: corridorY.work },
      { x: work.fx + work.fw / 2, y: corridorY.work },
      { x: work.fx + work.fw - 10, y: corridorY.work },
    ],
    meet: [
      { x: meet.fx + 10, y: corridorY.meet },
      { x: meet.fx + meet.fw / 2, y: corridorY.meet },
      { x: meet.fx + meet.fw - 10, y: corridorY.meet },
    ],
    comm: [
      { x: comm.fx + 10, y: corridorY.comm },
      { x: comm.fx + comm.fw / 2, y: corridorY.comm },
      { x: comm.fx + comm.fw - 10, y: corridorY.comm },
    ],
  };

  /* ─── Wall decorations (same layout as M, same offsets) ── */
  const wallDecorations: FurnitureDef[] = [
    { id: 'exec-window-1', type: 'window', room: 'exec', zone: 'wall', offsetX: 10, offsetY: 6, windowW: 16, windowH: 14 },
    { id: 'exec-picture-1', type: 'picture', room: 'exec', zone: 'wall', offsetX: 34, offsetY: 8, pictureColor: '#1565C0',
      facility: { id: 'theme', label: 'THEME', icon: '\u{1F3A8}', color: '#42A5F5', hitW: 12, hitH: 10 } },
    { id: 'exec-picture-2', type: 'picture', room: 'exec', zone: 'wall', offsetX: 48, offsetY: 8, pictureColor: '#E65100' },
    { id: 'exec-clock', type: 'clock', room: 'exec', zone: 'wall', offsetX: 64, offsetY: 10,
      facility: { id: 'settings', label: 'SETTINGS', icon: '\u{2699}', color: '#78909C', hitW: 10, hitH: 10 } },
    { id: 'exec-shelf', type: 'shelf', room: 'exec', zone: 'wall', offsetX: 78, offsetY: 14,
      facility: { id: 'stats', label: 'STATS', icon: '\u{1F4CA}', color: '#7E57C2', hitW: 16, hitH: 8 } },
    { id: 'exec-window-2', type: 'window', room: 'exec', zone: 'wall', offsetX: 104, offsetY: 6, windowW: 16, windowH: 14 },
    { id: 'work-whiteboard', type: 'whiteboard', room: 'work', zone: 'wall', offsetX: 6, offsetY: 4 },
    { id: 'work-window-1', type: 'window', room: 'work', zone: 'wall', offsetX: 50, offsetY: 6, windowW: 16, windowH: 14 },
    { id: 'work-window-2', type: 'window', room: 'work', zone: 'wall', offsetX: 92, offsetY: 6, windowW: 16, windowH: 14 },
    { id: 'meet-bulletin', type: 'bulletin-board', room: 'meet', zone: 'wall', offsetX: 6, offsetY: 4,
      facility: { id: 'bulletin', label: 'BULLETIN', icon: '\u{1F4CB}', color: '#F59E0B', hitW: 22, hitH: 16 } },
    { id: 'meet-picture', type: 'picture', room: 'meet', zone: 'wall', offsetX: 28, offsetY: 8, pictureColor: '#10B981' },
    { id: 'meet-window', type: 'window', room: 'meet', zone: 'wall', offsetX: 80, offsetY: 6, windowW: 16, windowH: 14 },
    { id: 'meet-shelf', type: 'shelf', room: 'meet', zone: 'wall', offsetX: 102, offsetY: 18 },
    { id: 'comm-screen', type: 'screen', room: 'comm', zone: 'wall', offsetX: 6, offsetY: 6,
      facility: { id: 'decisions', label: 'DECISIONS', icon: '\u{1F4DC}', color: '#EF4444', hitW: 16, hitH: 12 } },
    { id: 'comm-picture', type: 'picture', room: 'comm', zone: 'wall', offsetX: 28, offsetY: 8, pictureColor: '#d4956a' },
    { id: 'comm-window', type: 'window', room: 'comm', zone: 'wall', offsetX: 76, offsetY: 6, windowW: 16, windowH: 14 },
    { id: 'comm-clock', type: 'clock', room: 'comm', zone: 'wall', offsetX: 98, offsetY: 10 },
    { id: 'comm-shelf', type: 'shelf', room: 'comm', zone: 'wall', offsetX: 108, offsetY: 18 },
  ];

  const furniture: FurnitureDef[] = [
    { id: 'exec-bookshelf', type: 'bookshelf', room: 'exec', zone: 'floor', offsetX: 2, offsetY: 4 },
    { id: 'exec-plant-r', type: 'plant', room: 'exec', zone: 'floor', anchorX: 'right', offsetX: -10, offsetY: 4 },
    { id: 'exec-plant-c', type: 'plant', room: 'exec', zone: 'floor', offsetX: Math.floor(exec.fw / 2), offsetY: 4 },
    { id: 'work-plant-1', type: 'plant', room: 'work', zone: 'floor', offsetX: 36, offsetY: 4 },
    { id: 'work-plant-2', type: 'plant', room: 'work', zone: 'floor', offsetX: 80, offsetY: 4 },
    { id: 'meet-plant', type: 'plant', room: 'meet', zone: 'floor', anchorX: 'right', offsetX: -12, offsetY: 4 },
    { id: 'meet-table', type: 'meeting-table', room: 'meet', zone: 'floor', offsetX: 10, offsetY: 42,
      facility: { id: 'meeting', label: 'MEETING', icon: '\u{1F3E2}', color: '#3B82F6', hitW: 44, hitH: 40 } },
    { id: 'comm-coffee-machine', type: 'coffee-machine', room: 'comm', zone: 'floor', anchorX: 'right', offsetX: -30, offsetY: 4, condition: 'no-desks' },
    { id: 'comm-plant-1', type: 'plant', room: 'comm', zone: 'floor', offsetX: 38, offsetY: 4, condition: 'no-desks' },
    { id: 'comm-bookshelf', type: 'bookshelf', room: 'comm', zone: 'floor', anchorX: 'right', offsetX: -26, offsetY: 16, accent: '#10B981', condition: 'no-desks',
      facility: { id: 'knowledge', label: 'KNOWLEDGE', icon: '\u{1F4DA}', color: '#10B981', hitW: 26, hitH: 24 } },
    { id: 'comm-sofa', type: 'sofa', room: 'comm', zone: 'floor', offsetX: 44, offsetY: 30, condition: 'no-desks' },
    { id: 'comm-coffee-table', type: 'coffee-table', room: 'comm', zone: 'floor', offsetX: 50, offsetY: 50, condition: 'no-desks' },
    { id: 'comm-plant-2', type: 'plant', room: 'comm', zone: 'floor', offsetX: 38, offsetY: 50, condition: 'no-desks' },
  ];

  return {
    preset: 'L',
    canvasW: CW, canvasH: CH,
    rooms, desks: allDesks, doors, adjacency, corridorY, waypoints,
    wallDecorations, furniture,
  };
}

/* ─── Preset selection ─────────────────── */

const HYSTERESIS = 2; // prevent flapping at boundaries

export function selectPreset(count: number, current?: Preset, purchasedPreset?: Preset): Preset {
  if (purchasedPreset) return purchasedPreset;
  if (!current) {
    // Minimum is M — 4 rooms needed for facilities (meeting/bulletin/decisions/knowledge)
    if (count <= 12) return 'M';
    return 'L';
  }
  // With hysteresis: need to drop below threshold - HYSTERESIS to downgrade
  if (current === 'L' && count <= 12 - HYSTERESIS) return 'M';
  // Upgrade at exact boundary
  if (current === 'M' && count > 12) return 'L';
  return current;
}

export function generateFloorLayout(deskCount: number, preset?: Preset): FloorLayout {
  const p = preset ?? selectPreset(deskCount);
  switch (p) {
    case 'S': return presetS(deskCount);
    case 'M': return presetM(deskCount);
    case 'L': return presetL(deskCount);
  }
}

/** Apply user overrides (from preferences) to furniture offsets */
export function applyFurnitureOverrides(
  layout: FloorLayout,
  overrides: Record<string, { offsetX: number; offsetY: number }>,
): FloorLayout {
  if (!overrides || Object.keys(overrides).length === 0) return layout;

  const applyTo = (defs: FurnitureDef[]): FurnitureDef[] =>
    defs.map(d => {
      const ov = overrides[d.id];
      if (!ov) return d;
      return { ...d, offsetX: ov.offsetX, offsetY: ov.offsetY };
    });

  return {
    ...layout,
    wallDecorations: applyTo(layout.wallDecorations),
    furniture: applyTo(layout.furniture),
  };
}

/** Apply desk position overrides (keyed by role id, applied after assignDesks) */
export function applyDeskOverrides(
  desks: Record<string, DeskDef>,
  overrides: Record<string, { dx: number; dy: number }>,
): void {
  if (!overrides) return;
  for (const [roleId, ov] of Object.entries(overrides)) {
    if (desks[roleId]) {
      desks[roleId] = { ...desks[roleId], dx: ov.dx, dy: ov.dy };
    }
  }
}

/** Remove furniture by id list */
export function applyFurnitureRemovals(
  layout: FloorLayout,
  removedIds: string[],
): FloorLayout {
  if (!removedIds || removedIds.length === 0) return layout;
  const removed = new Set(removedIds);
  return {
    ...layout,
    wallDecorations: layout.wallDecorations.filter(d => !removed.has(d.id)),
    furniture: layout.furniture.filter(d => !removed.has(d.id)),
  };
}

/** Append user-added furniture to layout */
export function applyAddedFurniture(
  layout: FloorLayout,
  added: FurnitureDef[],
): FloorLayout {
  if (!added || added.length === 0) return layout;
  const walls: FurnitureDef[] = [];
  const floor: FurnitureDef[] = [];
  for (const d of added) {
    if (d.zone === 'wall') walls.push(d);
    else floor.push(d);
  }
  return {
    ...layout,
    wallDecorations: [...layout.wallDecorations, ...walls],
    furniture: [...layout.furniture, ...floor],
  };
}
