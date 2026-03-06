import { useMemo } from 'react';
import type { Role, Project, Wave, Standup, Decision } from '../../types/index';
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
};
const ROLE_ICONS: Record<string, string> = {
  cto: '\u{1F3D7}\u{FE0F}', cbo: '\u{1F4CA}', pm: '\u{1F4CB}',
  engineer: '\u2699\u{FE0F}', designer: '\u{1F3A8}', qa: '\u{1F50D}',
};

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

const DESK_LAYOUT: DeskConfig[] = [
  // Executive wing
  { roleId: 'cto', col: 1, row: 0 },
  { roleId: 'cbo', col: 0, row: 1 },
  // Workspace
  { roleId: 'pm',       col: 3, row: 0 },
  { roleId: 'engineer', col: 4, row: 1 },
  { roleId: 'designer', col: 3, row: 2 },
  { roleId: 'qa',       col: 5, row: 1 },
];

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


/* ─── Floor tiles ──────────────────────── */

function FloorTiles({ roomLookup }: { roomLookup: Map<string, RoomZone> }) {
  const tiles: React.ReactNode[] = [];
  for (let col = 0; col <= 5; col++) {
    for (let row = 0; row <= 4; row++) {
      const { x, y } = isoToScreen(col, row);
      const key = `${col},${row}`;
      const room = roomLookup.get(key);
      const isAlt = (col + row) % 2 === 0;
      const bg = room
        ? (isAlt ? room.floorColor : room.floorColorAlt)
        : (isAlt ? 'rgba(100,116,139,0.06)' : 'rgba(100,116,139,0.03)');

      tiles.push(
        <div
          key={`floor-${col}-${row}`}
          className="iso-tile"
          style={{ left: x, top: y, background: bg, opacity: 1 }}
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
  onClick: () => void;
}

function IsoDeskTile({ role, col, row, speech, liveStatus, activeTask, onClick }: DeskProps) {
  const { x, y } = isoToScreen(col, row);
  const color = ROLE_COLORS[role.id] ?? '#666';
  const icon = ROLE_ICONS[role.id] ?? '';
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
        <SpriteCanvas roleId={role.id} />
      </div>

      {/* Status indicator */}
      <div className={`iso-status-ring ${isWorking ? 'iso-status-ring--working' : ''}`} style={{ borderColor: isWorking ? '#FBBF24' : color }} />

      {/* Role label */}
      <div className="iso-role-label" style={{ color }}>
        {icon} <strong>{role.id.toUpperCase()}</strong>
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
      title={`${facility.label} -- click to open`}
    >
      <div className="iso-facility-floor" style={{ borderColor: facility.color + '44' }} />
      <div className="iso-facility-body" style={{ borderColor: facility.color + '88', background: `${facility.color}11` }}>
        <FacilityCanvas type={facility.type} />
      </div>
      <div className="iso-facility-label" style={{ color: facility.color }}>
        {facility.icon} {facility.label}
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
}

/* ─── Main component ────────────────────── */

export default function IsometricOfficeView({
  roles, projects, waves, standups, decisions,
  roleStatuses, activeExecs,
  onRoleClick, onProjectClick, onBulletinClick, onDecisionsClick, onKnowledgeClick,
  knowledgeDocsCount, getRoleSpeech,
}: IsometricOfficeViewProps) {
  const mainProject = projects[0];
  const roleMap = useMemo(() => new Map(roles.map((r) => [r.id, r])), [roles]);
  const roomLookup = useMemo(() => buildRoomLookup(), []);

  // Center the isometric grid in the scene
  const centerIso = isoToScreen(2.5, 2);

  return (
    <div className="iso-scene">
      <div className="iso-canvas">
        <div
          className="iso-inner"
          style={{
            left: '50%',
            top: '50%',
            transform: `translate(${-centerIso.x - TILE_W / 4}px, ${-centerIso.y - 10}px)`,
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

          {/* Role desks (highest z) */}
          {DESK_LAYOUT.map((desk) => {
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
                onClick={() => onRoleClick(desk.roleId)}
              />
            );
          })}
        </div>
      </div>
    </div>
  );
}
