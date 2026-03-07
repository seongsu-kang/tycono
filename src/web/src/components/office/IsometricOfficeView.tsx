import { useMemo, useRef, useEffect, useState, useCallback } from 'react';
import type { Role, Project, Wave, Standup, Decision } from '../../types/index';
import type { CharacterAppearance } from '../../types/appearance';
import SpriteCanvas from './SpriteCanvas';
import FacilityCanvas from './FacilityCanvas';

/* ─── Isometric grid config ─────────────── */

const TILE_W = 200;
const TILE_H = 100;

function isoToScreen(col: number, row: number): { x: number; y: number } {
  const x = (col - row) * (TILE_W / 2);
  const y = (col + row) * (TILE_H / 2);
  return { x, y };
}

/* ─── Role metadata ─────────────────────── */

const ROLE_COLORS: Record<string, string> = {
  cto: '#1565C0', cbo: '#E65100', pm: '#2E7D32',
  engineer: '#4A148C', designer: '#AD1457', qa: '#00695C',
  'data-analyst': '#0277BD',
};
const ROLE_ICONS: Record<string, string> = {
  cto: '\u{1F3D7}\u{FE0F}', cbo: '\u{1F4CA}', pm: '\u{1F4CB}',
  engineer: '\u2699\u{FE0F}', designer: '\u{1F3A8}', qa: '\u{1F50D}',
  'data-analyst': '\u{1F4CA}',
};

/** Generate a deterministic color from a role ID for unknown roles */
function hashRoleColor(id: string): string {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = id.charCodeAt(i) + ((h << 5) - h);
  const hue = ((h % 360) + 360) % 360;
  return `hsl(${hue}, 50%, 35%)`;
}

/* ─── Room zone definitions ─────────────── */

interface RoomZone {
  id: string;
  label: string;
  /** Tiles that belong to this room (col, row) */
  tiles: [number, number][];
  floorColor: string;
  floorColorAlt: string;
  borderColor: string;
}

const ROOMS: RoomZone[] = [
  {
    id: 'executive',
    label: 'EXECUTIVE WING',
    tiles: [[0,0],[1,0],[2,0],[0,1],[1,1],[2,1]],
    floorColor: 'rgba(37, 99, 235, 0.18)',
    floorColorAlt: 'rgba(37, 99, 235, 0.10)',
    borderColor: 'rgba(37, 99, 235, 0.35)',
  },
  {
    id: 'workspace',
    label: 'WORKSPACE',
    tiles: [[3,0],[4,0],[5,0],[3,1],[4,1],[5,1],[3,2],[4,2],[5,2],[3,3],[4,3],[5,3]],
    floorColor: 'rgba(99, 102, 241, 0.12)',
    floorColorAlt: 'rgba(99, 102, 241, 0.06)',
    borderColor: 'rgba(99, 102, 241, 0.25)',
  },
  {
    id: 'meeting',
    label: 'MEETING ROOM',
    tiles: [[0,2],[1,2],[2,2],[0,3],[1,3],[2,3]],
    floorColor: 'rgba(16, 185, 129, 0.15)',
    floorColorAlt: 'rgba(16, 185, 129, 0.08)',
    borderColor: 'rgba(16, 185, 129, 0.30)',
  },
  {
    id: 'commons',
    label: 'COMMON AREA',
    tiles: [[0,4],[1,4],[2,4],[3,4],[4,4],[5,4]],
    floorColor: 'rgba(245, 158, 11, 0.12)',
    floorColorAlt: 'rgba(245, 158, 11, 0.06)',
    borderColor: 'rgba(245, 158, 11, 0.25)',
  },
];

/** Build a lookup: "col,row" => RoomZone */
function buildRoomLookup(): Map<string, RoomZone> {
  const map = new Map<string, RoomZone>();
  for (const room of ROOMS) {
    for (const [c, r] of room.tiles) {
      map.set(`${c},${r}`, room);
    }
  }
  return map;
}

/* ─── Layout: desks, facilities, decorations ── */

interface DeskConfig { roleId: string; col: number; row: number; }

/** Preferred positions for known roles (used when available) */
const PREFERRED_DESK: Record<string, { col: number; row: number }> = {
  cto: { col: 1, row: 0 },
  cbo: { col: 0, row: 1 },
  pm:  { col: 3, row: 0 },
  engineer: { col: 4, row: 1 },
  designer: { col: 3, row: 2 },
  qa:  { col: 5, row: 1 },
};

/** Workspace slot pool for dynamically placed roles (col 3-5, rows 0-3) */
const WORKSPACE_SLOTS: [number, number][] = [
  [3,0],[4,0],[5,0],
  [3,1],[4,1],[5,1],
  [3,2],[4,2],[5,2],
  [3,3],[4,3],[5,3],
];

function generateDeskLayout(roles: Role[]): DeskConfig[] {
  const desks: DeskConfig[] = [];
  const occupied = new Set<string>();

  // Place c-level roles in executive wing
  const cLevels = roles.filter(r => r.level === 'c-level');
  const members = roles.filter(r => r.level !== 'c-level');

  for (const role of cLevels) {
    const pref = PREFERRED_DESK[role.id];
    if (pref && !occupied.has(`${pref.col},${pref.row}`)) {
      desks.push({ roleId: role.id, col: pref.col, row: pref.row });
      occupied.add(`${pref.col},${pref.row}`);
    } else {
      // Find open executive wing slot (cols 0-2, rows 0-1)
      const execSlots: [number, number][] = [[0,0],[1,0],[2,0],[0,1],[1,1],[2,1]];
      for (const [c, r] of execSlots) {
        if (!occupied.has(`${c},${r}`)) {
          desks.push({ roleId: role.id, col: c, row: r });
          occupied.add(`${c},${r}`);
          break;
        }
      }
    }
  }

  // Place members in workspace
  for (const role of members) {
    const pref = PREFERRED_DESK[role.id];
    if (pref && !occupied.has(`${pref.col},${pref.row}`)) {
      desks.push({ roleId: role.id, col: pref.col, row: pref.row });
      occupied.add(`${pref.col},${pref.row}`);
    } else {
      for (const [c, r] of WORKSPACE_SLOTS) {
        if (!occupied.has(`${c},${r}`)) {
          desks.push({ roleId: role.id, col: c, row: r });
          occupied.add(`${c},${r}`);
          break;
        }
      }
    }
  }

  return desks;
}

interface FacilityConfig {
  id: string;
  col: number;
  row: number;
  type: 'meeting' | 'bulletin' | 'decision' | 'knowledge';
  label: string;
  icon: string;
  color: string;
}

const FACILITY_LAYOUT: FacilityConfig[] = [
  { id: 'meeting',   col: 1, row: 2, type: 'meeting',   label: 'MEETING',    icon: '\u{1F3E2}', color: '#10B981' },
  { id: 'bulletin',  col: 1, row: 4, type: 'bulletin',  label: 'BULLETIN',   icon: '\u{1F4CB}', color: '#F59E0B' },
  { id: 'decisions', col: 3, row: 4, type: 'decision',  label: 'DECISIONS',  icon: '\u{1F4DC}', color: '#EF4444' },
  { id: 'knowledge', col: 5, row: 3, type: 'knowledge', label: 'KNOWLEDGE',  icon: '\u{1F4DA}', color: '#0D9488' },
];

const FACILITY_DESCRIPTIONS: Record<string, string> = {
  meeting: 'Projects, PRDs, and task boards',
  bulletin: 'Waves and daily standups',
  decisions: 'CEO strategic decision log',
  knowledge: 'Research, analysis, and references',
};

/* ─── Decorations ──────────────────────── */

interface DecoConfig { col: number; row: number; icon: string; label: string; }

const DECORATIONS: DecoConfig[] = [
  { col: 2, row: 0, icon: '\u{2615}', label: 'Coffee' },       // Executive wing coffee
  { col: 0, row: 0, icon: '\u{1F33F}', label: 'Plant' },       // Exec plant
  { col: 5, row: 0, icon: '\u{1F4F0}', label: 'Whiteboard' },  // Workspace whiteboard
  { col: 4, row: 3, icon: '\u{1F33F}', label: 'Plant' },       // Workspace plant
  { col: 0, row: 3, icon: '\u{1F4A1}', label: 'Idea Board' },  // Meeting room deco
  { col: 2, row: 4, icon: '\u{2615}', label: 'Break Room' },   // Commons coffee
  { col: 4, row: 4, icon: '\u{1F3AE}', label: 'Game Corner' }, // Commons game
  { col: 5, row: 4, icon: '\u{1F33F}', label: 'Plant' },       // Commons plant
];


/* ─── Floor tiles ──────────────────────── */

function FloorTiles({ roomLookup }: { roomLookup: Map<string, RoomZone> }) {
  const tiles: React.ReactNode[] = [];
  for (let col = 0; col <= 5; col++) {
    for (let row = 0; row <= 4; row++) {
      const { x, y } = isoToScreen(col, row);
      const key = `${col},${row}`;
      const room = roomLookup.get(key);
      const isAlt = (col + row) % 2 === 0;
      // Base tile uses theme CSS variable; room tint overlays on top
      const baseBg = isAlt ? 'var(--floor-light)' : 'var(--floor-dark)';
      const roomTint = room
        ? (isAlt ? room.floorColor : room.floorColorAlt)
        : undefined;

      tiles.push(
        <div
          key={`floor-${col}-${row}`}
          className="iso-tile"
          style={{
            left: x, top: y,
            background: roomTint
              ? `linear-gradient(${roomTint}, ${roomTint}), ${baseBg}`
              : baseBg,
            opacity: 1,
          }}
        />,
      );
    }
  }
  return <>{tiles}</>;
}

/* ─── Room zone borders & labels ─────────── */

function RoomOverlays({ roomLookup }: { roomLookup: Map<string, RoomZone> }) {
  // For each room, draw a subtle label
  const rendered = new Set<string>();
  const labels: React.ReactNode[] = [];

  for (const room of ROOMS) {
    if (rendered.has(room.id)) continue;
    rendered.add(room.id);
    // Place label at center of room
    const midC = room.tiles.reduce((s, [c]) => s + c, 0) / room.tiles.length;
    const midR = room.tiles.reduce((s, [, r]) => s + r, 0) / room.tiles.length;
    const { x, y } = isoToScreen(midC, midR);
    labels.push(
      <div
        key={`room-label-${room.id}`}
        className="iso-room-label"
        style={{
          left: x + TILE_W / 2,
          top: y + TILE_H / 2,
          color: room.borderColor,
        }}
      >
        {room.label}
      </div>,
    );
  }

  // Draw border tiles (outer edges of each room)
  for (const room of ROOMS) {
    for (const [c, r] of room.tiles) {
      const neighbors = [[c-1,r],[c+1,r],[c,r-1],[c,r+1]];
      const isBorder = neighbors.some(([nc, nr]) => {
        const nk = `${nc},${nr}`;
        const nRoom = roomLookup.get(nk);
        return !nRoom || nRoom.id !== room.id;
      });
      if (isBorder) {
        const { x, y } = isoToScreen(c, r);
        labels.push(
          <div
            key={`room-border-${room.id}-${c}-${r}`}
            className="iso-tile iso-tile-border"
            style={{
              left: x, top: y,
              borderColor: room.borderColor,
            }}
          />,
        );
      }
    }
  }

  return <>{labels}</>;
}

/* ─── Desk component ────────────────────── */

interface DeskProps {
  role: Role;
  col: number;
  row: number;
  speech: string;
  liveStatus?: string;
  activeTask?: string;
  appearance?: CharacterAppearance;
  onClick: () => void;
  onCustomize?: () => void;
}

function IsoDeskTile({ role, col, row, speech, liveStatus, activeTask, appearance, onClick, onCustomize }: DeskProps) {
  const { x, y } = isoToScreen(col, row);
  const color = ROLE_COLORS[role.id] ?? hashRoleColor(role.id);
  const icon = ROLE_ICONS[role.id] ?? '\u{1F464}';
  const isWorking = liveStatus === 'working';
  const isCLevel = role.level === 'c-level';

  const speechText = isWorking && activeTask
    ? activeTask.slice(0, 36)
    : speech
      ? speech.slice(0, 36)
      : '';

  return (
    <div
      className={`iso-desk${isWorking ? ' iso-desk--working' : ''}${isCLevel ? ' iso-desk--clevel' : ''}`}
      style={{ left: x, top: y }}
      onClick={onClick}
      title={`${role.name} -- click to open`}
    >
      {/* Desk highlight floor */}
      <div className="iso-desk-floor" style={{ borderColor: `${color}44` }} />

      {/* Desk surface */}
      <div className="iso-desk-surface" style={{ borderColor: color + '66' }}>
        <div className="iso-desk-monitor" style={{ boxShadow: isWorking ? `0 0 6px ${color}88` : 'none' }}>
          <div className="iso-monitor-screen" style={{ background: isWorking ? color : '#1a1a2e' }} />
        </div>
      </div>

      {/* Sprite */}
      <div className="iso-desk-sprite">
        <SpriteCanvas roleId={role.id} appearance={appearance} />
      </div>

      {/* Status indicator */}
      <div className={`iso-status-ring ${isWorking ? 'iso-status-ring--working' : ''}`} style={{ borderColor: isWorking ? '#FBBF24' : color }} />

      {/* Role label */}
      <div className="iso-role-label" style={{ color }}>
        {icon} <strong>{role.id.toUpperCase()}</strong>
        {onCustomize && (
          <button
            className="iso-customize-btn"
            onClick={(e) => { e.stopPropagation(); onCustomize(); }}
            title="Customize"
          >
            {'\u{1F3A8}'}
          </button>
        )}
      </div>

      {/* Speech bubble */}
      {speechText && (
        <div className="iso-speech-bubble" style={{ borderColor: `${color}33` }}>
          {speechText}
        </div>
      )}

      {/* Working indicator particles */}
      {isWorking && (
        <div className="iso-working-particles">
          <span style={{ animationDelay: '0s' }}>.</span>
          <span style={{ animationDelay: '0.3s' }}>.</span>
          <span style={{ animationDelay: '0.6s' }}>.</span>
        </div>
      )}
    </div>
  );
}

/* ─── Facility tile ────────────────────── */

interface FacilityTileProps {
  facility: FacilityConfig;
  project?: Project;
  waves: Wave[];
  standups: Standup[];
  decisions: Decision[];
  knowledgeDocsCount: number;
  onClick: () => void;
}

function IsoFacilityTile({ facility, project, waves, standups, decisions, knowledgeDocsCount, onClick }: FacilityTileProps) {
  const { x, y } = isoToScreen(facility.col, facility.row);

  let subtitle = '';
  if (facility.id === 'meeting' && project) {
    subtitle = `"${project.name}"`;
  } else if (facility.id === 'bulletin') {
    if (waves[0]) subtitle = `Wave ${waves[0].id}`;
    else if (standups[0]) subtitle = `Standup ${standups[0].date}`;
  } else if (facility.id === 'decisions') {
    subtitle = `${decisions.length} decisions`;
  } else if (facility.id === 'knowledge') {
    subtitle = `${knowledgeDocsCount} docs`;
  }

  return (
    <div
      className="iso-facility"
      style={{ left: x, top: y }}
      onClick={onClick}
      title={`${facility.label} — ${FACILITY_DESCRIPTIONS[facility.id] ?? ''}`}
    >
      <div className="iso-facility-floor" style={{ borderColor: facility.color + '44' }} />
      <div className="iso-facility-body" style={{ borderColor: facility.color + '88', background: `${facility.color}11` }}>
        <FacilityCanvas type={facility.type} />
      </div>
      <div className="iso-facility-label" style={{ color: facility.color }}>
        {facility.icon} {facility.label}
      </div>
      <div className="iso-facility-desc" style={{ color: facility.color }}>
        {FACILITY_DESCRIPTIONS[facility.id]}
      </div>
      {subtitle && (
        <div className="iso-facility-sublabel">{subtitle}</div>
      )}
    </div>
  );
}


/* ─── Props ─────────────────────────────── */

interface IsometricOfficeViewProps {
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

/* ─── Auto-fit: compute scale & offset to fit grid in viewport ── */

function useAutoFit(maxCol: number, maxRow: number) {
  const sceneRef = useRef<HTMLDivElement>(null);
  const [fit, setFit] = useState({ scale: 1, offsetX: 0, offsetY: 0 });

  const compute = useCallback(() => {
    const el = sceneRef.current;
    if (!el) return;

    const vw = el.clientWidth;
    const vh = el.clientHeight;
    if (vw === 0 || vh === 0) return;

    // Compute bounding box of all tiles in screen coords
    const points: { x: number; y: number }[] = [];
    for (let c = 0; c <= maxCol; c++) {
      for (let r = 0; r <= maxRow; r++) {
        const { x, y } = isoToScreen(c, r);
        // Diamond corners of each tile
        points.push({ x: x + TILE_W / 2, y });               // top
        points.push({ x: x + TILE_W, y: y + TILE_H / 2 });   // right
        points.push({ x: x + TILE_W / 2, y: y + TILE_H });   // bottom
        points.push({ x, y: y + TILE_H / 2 });                // left
      }
    }

    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    for (const p of points) {
      if (p.x < minX) minX = p.x;
      if (p.x > maxX) maxX = p.x;
      if (p.y < minY) minY = p.y;
      if (p.y > maxY) maxY = p.y;
    }

    // Add padding for speech bubbles, labels, etc.
    const padX = 120;
    const padTop = 140;  // speech bubbles above
    const padBottom = 80;

    const contentW = (maxX - minX) + padX * 2;
    const contentH = (maxY - minY) + padTop + padBottom;

    const scale = Math.min(vw / contentW, vh / contentH, 1.3);
    const cx = (minX + maxX) / 2;
    const cy = minY + (maxY - minY + padTop - padBottom) / 2;

    setFit({
      scale,
      offsetX: vw / 2 - cx * scale,
      offsetY: vh / 2 - cy * scale,
    });
  }, [maxCol, maxRow]);

  useEffect(() => {
    compute();
    const obs = new ResizeObserver(() => compute());
    if (sceneRef.current) obs.observe(sceneRef.current);
    return () => obs.disconnect();
  }, [compute]);

  return { sceneRef, ...fit };
}

/* ─── Main component ────────────────────── */

export default function IsometricOfficeView({
  roles, projects, waves, standups, decisions,
  roleStatuses, activeExecs,
  onRoleClick, onProjectClick, onBulletinClick, onDecisionsClick, onKnowledgeClick,
  knowledgeDocsCount, getRoleSpeech, getAppearance, onCustomize,
}: IsometricOfficeViewProps) {
  const mainProject = projects[0];
  const roleMap = useMemo(() => new Map(roles.map((r) => [r.id, r])), [roles]);
  const deskLayout = useMemo(() => generateDeskLayout(roles), [roles]);
  const roomLookup = useMemo(() => buildRoomLookup(), []);

  // Filter decorations to avoid overlapping with desks/facilities
  const occupiedTiles = useMemo(() => {
    const set = new Set<string>();
    for (const d of deskLayout) set.add(`${d.col},${d.row}`);
    for (const f of FACILITY_LAYOUT) set.add(`${f.col},${f.row}`);
    return set;
  }, [deskLayout]);

  const visibleDecos = useMemo(
    () => DECORATIONS.filter(d => !occupiedTiles.has(`${d.col},${d.row}`)),
    [occupiedTiles],
  );

  // Compute grid bounds (max col/row from all occupied tiles)
  const gridBounds = useMemo(() => {
    let maxCol = 5, maxRow = 4; // base grid
    for (const d of deskLayout) {
      if (d.col > maxCol) maxCol = d.col;
      if (d.row > maxRow) maxRow = d.row;
    }
    return { maxCol, maxRow };
  }, [deskLayout]);

  // Auto-fit camera to grid
  const { sceneRef, scale, offsetX, offsetY } = useAutoFit(gridBounds.maxCol, gridBounds.maxRow);

  return (
    <div className="iso-scene" ref={sceneRef}>
      <div className="iso-canvas">
        <div
          className="iso-inner"
          style={{
            left: 0,
            top: 0,
            transform: `translate(${offsetX}px, ${offsetY}px) scale(${scale})`,
            transformOrigin: '0 0',
          }}
        >
          {/* Floor tiles with room zones */}
          <FloorTiles roomLookup={roomLookup} />

          {/* Room borders & labels */}
          <RoomOverlays roomLookup={roomLookup} />

          {/* Facilities */}
          {FACILITY_LAYOUT.map((facility) => (
            <IsoFacilityTile
              key={facility.id}
              facility={facility}
              project={mainProject}
              waves={waves}
              standups={standups}
              decisions={decisions}
              knowledgeDocsCount={knowledgeDocsCount}
              onClick={
                facility.id === 'meeting'
                  ? () => mainProject && onProjectClick(mainProject.id)
                  : facility.id === 'bulletin'
                    ? onBulletinClick
                    : facility.id === 'knowledge'
                      ? onKnowledgeClick
                      : onDecisionsClick
              }
            />
          ))}

          {/* Decorations */}
          {visibleDecos.map((deco) => {
            const { x, y } = isoToScreen(deco.col, deco.row);
            return (
              <div
                key={`deco-${deco.col}-${deco.row}`}
                className="iso-deco"
                style={{ left: x, top: y }}
                title={deco.label}
              >
                <span className="iso-deco-icon">{deco.icon}</span>
                <span className="iso-deco-label">{deco.label}</span>
              </div>
            );
          })}

          {/* Role desks (highest z) */}
          {deskLayout.map((desk) => {
            const role = roleMap.get(desk.roleId);
            if (!role) return null;
            return (
              <IsoDeskTile
                key={desk.roleId}
                role={role}
                col={desk.col}
                row={desk.row}
                speech={getRoleSpeech(desk.roleId)}
                liveStatus={roleStatuses[desk.roleId]}
                activeTask={activeExecs.find((e) => e.roleId === desk.roleId)?.task}
                appearance={getAppearance?.(desk.roleId)}
                onClick={() => onRoleClick(desk.roleId)}
                onCustomize={onCustomize ? () => onCustomize(desk.roleId) : undefined}
              />
            );
          })}
        </div>
      </div>
    </div>
  );
}
