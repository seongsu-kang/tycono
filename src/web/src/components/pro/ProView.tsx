import { useState, type ReactNode } from 'react';
import TopDownCharCanvas from '../office/TopDownCharCanvas';
import type { Role, Session, Wave, KnowledgeDoc, Message, ImageAttachment } from '../../types';
import { type RoleStatus, isRoleActive } from '../../types';
import type { CharacterAppearance } from '../../types/appearance';
import type { RoleLevelData } from '../../utils/role-level';
import MessageList from '../terminal/MessageList';
import InputBar from '../terminal/InputBar';

const ROLE_COLORS: Record<string, string> = {
  cto: '#1565C0', cbo: '#E65100', pm: '#2E7D32',
  engineer: '#4A148C', designer: '#AD1457', qa: '#00695C',
  'data-analyst': '#0277BD',
};

/* ─── Channel Types ─── */

export type ProChannel =
  | { type: 'dashboard' }
  | { type: 'terminal' }
  | { type: 'wave' }
  | { type: 'knowledge' }
  | { type: 'operations' }
  | { type: 'role'; roleId: string };

export interface ProViewProps {
  /* Data */
  roles: Role[];
  roleStatuses: Record<string, string>;
  activeExecs: { roleId: string; task: string; jobId?: string }[];
  waves: Wave[];
  knowledgeDocs: KnowledgeDoc[];
  sessions: Session[];
  roleLevels: RoleLevelData;
  companyName: string;
  getAppearance: (roleId: string) => CharacterAppearance | undefined;
  waveCenterWaves: Array<{ id: string; directive: string; rootJobs: Array<{ sessionId: string; roleId: string; roleName: string; jobId?: string }>; startedAt: number }>;

  /* Profile panel — rendered in right column when open.
     Receives a close callback so the panel × button can dismiss it. */
  renderProfile?: (onClose: () => void) => ReactNode;

  /* Navigation */
  channel: ProChannel;
  onChannelChange: (ch: ProChannel) => void;
  onClose: () => void;

  /* Content — rendered full-width in main area */
  children: ReactNode;
}

export default function ProView({
  roles, roleStatuses, activeExecs, sessions,
  knowledgeDocs, roleLevels, companyName, getAppearance, waveCenterWaves,
  renderProfile,
  channel, onChannelChange, onClose,
  children,
}: ProViewProps) {
  const [showProfile, setShowProfile] = useState(false);

  const runningWaves = waveCenterWaves.filter(w =>
    w.rootJobs.some(j => {
      const s = roleStatuses[j.roleId];
      return s === 'working' || s === 'thinking';
    }),
  );

  const sortedRoles = [...roles].sort((a, b) => {
    if (a.level === 'c-level' && b.level !== 'c-level') return -1;
    if (a.level !== 'c-level' && b.level === 'c-level') return 1;
    return a.name.localeCompare(b.name);
  });

  const workingCount = roles.filter(r => isRoleActive(roleStatuses[r.id] as RoleStatus)).length;
  const activeSessions = sessions.filter(s => s.status === 'active').length;

  const channelRole = channel.type === 'role' ? roles.find(r => r.id === channel.roleId) : null;

  const channelTitle = channel.type === 'dashboard' ? 'Dashboard'
    : channel.type === 'terminal' ? 'Chats'
    : channel.type === 'wave' ? 'Wave Center'
    : channel.type === 'knowledge' ? 'Knowledge Base'
    : channel.type === 'operations' ? 'Operations'
    : channel.type === 'role' ? (channelRole?.name ?? channel.roleId)
    : 'Dashboard';

  const channelSubtext = channel.type === 'terminal' ? `${activeSessions} active sessions`
    : channel.type === 'wave' ? `${runningWaves.length} running`
    : channel.type === 'knowledge' ? `${knowledgeDocs.length} documents`
    : channel.type === 'role' ? (channelRole?.level === 'c-level' ? 'C-Level' : 'Team member')
    : `${workingCount} working \u00B7 ${roles.length} total`;

  return (
    <div className="fixed inset-0 z-[60] flex" style={{ background: 'var(--terminal-bg, #1C1612)' }}>
      {/* ─── Left Sidebar (240px) ─── */}
      <div
        className="flex flex-col shrink-0 overflow-y-auto"
        style={{
          width: 240,
          borderRight: '1px solid var(--terminal-border, #2E261F)',
          background: 'var(--terminal-surface, #1a1510)',
        }}
      >
        {/* Company header */}
        <div
          className="px-4 py-3 flex items-center gap-2 shrink-0"
          style={{ borderBottom: '1px solid var(--terminal-border, #2E261F)' }}
        >
          <span
            className="text-[11px] font-bold tracking-wider flex-1"
            style={{ color: 'var(--terminal-text, #fff5eb)', fontFamily: 'var(--pixel-font)' }}
          >
            {companyName}
          </span>
          {workingCount > 0 && (
            <span className="text-[9px] px-1.5 py-0.5 rounded-full animate-pulse" style={{
              background: '#4CAF5020', color: '#4CAF50',
            }}>
              {workingCount} live
            </span>
          )}
        </div>

        {/* Active Wave (pinned) */}
        {runningWaves.length > 0 && (
          <button
            className="mx-3 mt-3 px-3 py-2.5 rounded-lg text-left transition-all hover:opacity-90"
            style={{
              background: channel.type === 'wave' ? '#EF444420' : '#EF444410',
              border: '1px solid #EF444430',
            }}
            onClick={() => onChannelChange({ type: 'wave' })}
          >
            <div className="flex items-center gap-2 mb-1">
              <span className="text-[10px] font-bold truncate flex-1" style={{ color: '#EF4444' }}>
                {'\u26A1'} {runningWaves[0].directive.slice(0, 28)}
              </span>
              <span className="text-[7px] px-1.5 py-0.5 rounded font-bold shrink-0" style={{
                background: '#EF4444', color: '#fff',
              }}>LIVE</span>
            </div>
            <div className="text-[9px]" style={{ color: 'var(--terminal-text-muted)' }}>
              {runningWaves[0].rootJobs.filter(j => {
                const s = roleStatuses[j.roleId];
                return s === 'working' || s === 'thinking';
              }).length}/{runningWaves[0].rootJobs.length} roles working
            </div>
          </button>
        )}

        {/* Main Features */}
        <div className="mx-3 mt-3 grid grid-cols-2 gap-1.5">
          <NavTile
            icon={'\u{1F4AC}'} label="Chats" badge={activeSessions || undefined}
            active={channel.type === 'terminal'}
            onClick={() => onChannelChange({ type: 'terminal' })}
          />
          <NavTile
            icon={'\u26A1'} label="Waves" live={runningWaves.length > 0}
            active={channel.type === 'wave'}
            onClick={() => onChannelChange({ type: 'wave' })}
          />
          <NavTile
            icon={'\u{1F4CB}'} label="Decisions"
            active={channel.type === 'operations'}
            onClick={() => onChannelChange({ type: 'operations' })}
          />
          <NavTile
            icon={'\u{1F4DA}'} label="Knowledge" badge={knowledgeDocs.length || undefined}
            active={channel.type === 'knowledge'}
            onClick={() => onChannelChange({ type: 'knowledge' })}
          />
        </div>

        {/* Team */}
        <div className="mt-4">
          <div className="px-4 py-1 text-[9px] font-bold tracking-widest" style={{ color: 'var(--terminal-text-muted)' }}>
            TEAM
          </div>
          {sortedRoles.map(role => {
            const status = roleStatuses[role.id];
            const exec = activeExecs.find(e => e.roleId === role.id);
            const color = ROLE_COLORS[role.id] ?? '#666';
            const level = roleLevels[role.id]?.level;
            const isActive = channel.type === 'role' && channel.roleId === role.id;
            return (
              <button
                key={role.id}
                onClick={() => onChannelChange({ type: 'role', roleId: role.id })}
                className="flex items-center gap-2.5 w-full px-4 py-1.5 text-left hover:opacity-80 transition-all"
                style={{
                  background: isActive ? `${color}18` : 'transparent',
                  borderLeft: isActive ? `2px solid ${color}` : '2px solid transparent',
                }}
              >
                <div className="relative shrink-0" style={{ width: 22, height: 22 }}>
                  <TopDownCharCanvas roleId={role.id} appearance={getAppearance(role.id)} scale={1.3} />
                  <span
                    className="absolute -bottom-0.5 -right-0.5 w-2 h-2 rounded-full"
                    style={{
                      background: isRoleActive(status as RoleStatus) ? '#4CAF50' : status === 'idle' ? '#FFC107' : '#9E9E9E',
                      border: '1.5px solid var(--terminal-surface, #1a1510)',
                    }}
                  />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="text-[11px] truncate" style={{ color: 'var(--terminal-text, #fff5eb)' }}>
                    {role.name}
                    {level != null && <span className="ml-1 opacity-40 text-[8px]">Lv.{level}</span>}
                  </div>
                  {exec ? (
                    <div className="text-[9px] truncate" style={{ color }}>{exec.task.slice(0, 28)}</div>
                  ) : (
                    <div className="text-[9px]" style={{ color: 'var(--terminal-text-muted, #887766)' }}>
                      {role.level === 'c-level' ? role.id.toUpperCase() : role.id}
                    </div>
                  )}
                </div>
                {isRoleActive(status as RoleStatus) && (
                  <span className="w-1.5 h-1.5 rounded-full animate-pulse shrink-0" style={{ background: color }} />
                )}
              </button>
            );
          })}
        </div>


        {/* Spacer */}
        <div className="flex-1" />

        {/* Active Jobs — Slack-style bottom section */}
        {activeExecs.length > 0 && (
          <div className="shrink-0 px-3 pb-2" style={{ borderTop: '1px solid var(--terminal-border, #2E261F)' }}>
            <div className="px-1 py-1.5 text-[8px] font-bold tracking-widest" style={{ color: 'var(--terminal-text-muted)' }}>
              ACTIVE JOBS ({activeExecs.length})
            </div>
            <div className="space-y-0.5 max-h-[140px] overflow-y-auto">
              {activeExecs.map(exec => {
                const role = roles.find(r => r.id === exec.roleId);
                const color = ROLE_COLORS[exec.roleId] ?? '#666';
                const isActive = channel.type === 'role' && channel.roleId === exec.roleId;
                return (
                  <button
                    key={exec.jobId ?? exec.roleId}
                    onClick={() => onChannelChange({ type: 'role', roleId: exec.roleId })}
                    className="flex items-center gap-2 w-full px-2 py-1.5 rounded text-left hover:opacity-80 transition-all"
                    style={{
                      background: isActive ? `${color}18` : 'transparent',
                    }}
                  >
                    <span className="w-1.5 h-1.5 rounded-full animate-pulse shrink-0" style={{ background: color }} />
                    <div className="min-w-0 flex-1">
                      <div className="text-[10px] truncate" style={{ color: 'var(--terminal-text, #fff5eb)' }}>
                        {role?.name ?? exec.roleId}
                      </div>
                      <div className="text-[8px] truncate" style={{ color: 'var(--terminal-text-muted)' }}>
                        {exec.task.slice(0, 40)}
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* Bottom: Office button */}
        <div className="px-3 py-3 shrink-0" style={{ borderTop: '1px solid var(--terminal-border, #2E261F)' }}>
          <button
            onClick={onClose}
            className="flex items-center gap-2 w-full px-3 py-2.5 rounded-lg hover:opacity-80 transition-opacity"
            style={{ background: 'var(--terminal-border, #2E261F)', color: 'var(--terminal-text, #fff5eb)' }}
          >
            <span className="text-[12px]">{'\u{1F3E2}'}</span>
            <span className="text-[11px] font-medium">Office</span>
          </button>
        </div>
      </div>

      {/* ─── Main Content Area ─── */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Header */}
        <div
          className="px-5 py-3 flex items-center gap-3 shrink-0"
          style={{ borderBottom: '1px solid var(--terminal-border, #2E261F)' }}
        >
          {/* Role avatar in header — clickable to toggle profile */}
          {channel.type === 'role' && channelRole && (
            <button
              onClick={() => setShowProfile(v => !v)}
              className="relative shrink-0 rounded-lg overflow-hidden hover:opacity-80 transition-opacity cursor-pointer"
              style={{ width: 28, height: 28, background: `${ROLE_COLORS[channelRole.id] ?? '#666'}30` }}
              title="View profile"
            >
              <TopDownCharCanvas roleId={channelRole.id} appearance={getAppearance(channelRole.id)} scale={1.5} />
              <span
                className="absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full"
                style={{
                  background: isRoleActive(roleStatuses[channelRole.id] as RoleStatus) ? '#4CAF50' : roleStatuses[channelRole.id] === 'idle' ? '#FFC107' : '#9E9E9E',
                  border: '2px solid var(--terminal-bg, #1C1612)',
                }}
              />
            </button>
          )}
          <span className="text-[15px] font-semibold" style={{ color: 'var(--terminal-text, #fff5eb)' }}>
            {channelTitle}
          </span>
          <span className="text-[10px]" style={{ color: 'var(--terminal-text-muted, #887766)' }}>
            {channelSubtext}
          </span>
          <span className="flex-1" />
          {channel.type === 'role' && (
            <button
              onClick={() => setShowProfile(v => !v)}
              className="text-[10px] px-2 py-1 rounded hover:opacity-80 transition-opacity"
              style={{
                color: showProfile ? 'var(--terminal-text)' : 'var(--terminal-text-muted)',
                border: '1px solid var(--terminal-border)',
                background: showProfile ? 'var(--terminal-border)' : 'transparent',
              }}
            >
              Profile
            </button>
          )}
          {channel.type !== 'dashboard' && (
            <button
              onClick={() => onChannelChange({ type: 'dashboard' })}
              className="text-[10px] px-2 py-1 rounded hover:opacity-80 transition-opacity"
              style={{ color: 'var(--terminal-text-muted)', border: '1px solid var(--terminal-border)' }}
            >
              Dashboard
            </button>
          )}
        </div>

        {/* Content + Profile Panel */}
        <div className="flex-1 flex overflow-hidden">
          {/* Main content */}
          <div className="flex-1 overflow-hidden relative pro-panel-inline">
            {children}
          </div>

          {/* Right-side Profile Panel (reuses SidePanel) */}
          {showProfile && channel.type === 'role' && renderProfile && (
            <div className="shrink-0 overflow-hidden pro-panel-inline" style={{ width: 420, borderLeft: '1px solid var(--terminal-border, #2E261F)' }}>
              {renderProfile(() => setShowProfile(false))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

/* ─── Pro Role Chat (DM-style chat view) ─── */

export function ProRoleChat({ role, messages, isStreaming, mode, onModeChange, onSend, isWave }: {
  role: Role;
  messages: Message[];
  isStreaming: boolean;
  mode: 'talk' | 'do';
  onModeChange: (mode: 'talk' | 'do') => void;
  onSend: (content: string, mode: 'talk' | 'do', attachments?: ImageAttachment[]) => void;
  isWave?: boolean;
}) {
  const color = ROLE_COLORS[role.id] ?? '#666';

  return (
    <div className="flex flex-col h-full">
      {/* Chat Messages */}
      <MessageList messages={messages} roleId={role.id} roleColor={color} />

      {/* Input */}
      {isWave ? (
        <div className="shrink-0 px-4 py-2 border-t flex items-center gap-2" style={{ borderColor: 'var(--terminal-border)', background: 'var(--terminal-bg-deeper)' }}>
          <span className="w-1.5 h-1.5 rounded-full bg-amber-400 shrink-0" style={{ animation: 'pulse 2s infinite' }} />
          <span className="text-[11px] text-amber-400/80">Wave execution · read-only</span>
        </div>
      ) : (
        <InputBar
          mode={mode}
          onModeChange={onModeChange}
          onSend={(content, attachments) => onSend(content, mode, attachments)}
          disabled={isStreaming}
          disabledReason={isStreaming ? `${role.id.toUpperCase()} is responding...` : undefined}
        />
      )}
    </div>
  );
}

/* ─── Pro Role Empty State ─── */

export function ProRoleChatEmpty({ role, onSend, getAppearance, onOpenProfile }: {
  role: Role;
  onSend: (content: string, mode: 'talk' | 'do') => void;
  getAppearance: (roleId: string) => CharacterAppearance | undefined;
  onOpenProfile?: () => void;
}) {
  const [mode, setMode] = useState<'talk' | 'do'>('talk');
  const color = ROLE_COLORS[role.id] ?? '#666';

  return (
    <div className="flex flex-col h-full">
      {/* Empty state */}
      <div className="flex-1 flex flex-col items-center justify-center gap-4">
        <button onClick={onOpenProfile} className="cursor-pointer hover:opacity-80 transition-opacity">
          <div className="rounded-lg p-1" style={{ background: `${color}20` }}>
            <TopDownCharCanvas roleId={role.id} appearance={getAppearance(role.id)} scale={5} />
          </div>
        </button>
        <div className="text-center">
          <div className="text-sm font-semibold" style={{ color: 'var(--terminal-text)' }}>{role.name}</div>
          <div className="text-xs mt-0.5" style={{ color: 'var(--terminal-text-muted)' }}>
            {role.level === 'c-level' ? role.id.toUpperCase() : role.id} · Start a conversation
          </div>
        </div>
      </div>

      {/* Input */}
      <InputBar
        mode={mode}
        onModeChange={setMode}
        onSend={(content) => onSend(content, mode)}
        disabled={false}
      />
    </div>
  );
}

/* ─── Sidebar Components ─── */

function NavTile({ icon, label, active, badge, live, onClick }: {
  icon: string; label: string; active?: boolean; badge?: number; live?: boolean; onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className="flex flex-col items-center gap-1 py-3 rounded-lg transition-all hover:opacity-90"
      style={{
        background: active ? 'var(--desk-wood, #5C3D2E)' : 'var(--terminal-border, #2E261F)',
        border: active ? '1px solid var(--desk-wood, #5C3D2E)' : '1px solid transparent',
      }}
    >
      <div className="relative">
        <span className="text-[16px]">{icon}</span>
        {live && (
          <span className="absolute -top-1 -right-2 w-2 h-2 rounded-full animate-pulse" style={{ background: '#EF4444' }} />
        )}
        {badge !== undefined && badge > 0 && !live && (
          <span className="absolute -top-1.5 -right-3 text-[7px] px-1 py-0.5 rounded-full font-bold leading-none" style={{
            background: 'var(--desk-wood, #5C3D2E)', color: '#fff', minWidth: 14, textAlign: 'center',
          }}>{badge}</span>
        )}
      </div>
      <span className="text-[10px] font-semibold" style={{
        color: active ? '#fff' : 'var(--terminal-text, #fff5eb)',
      }}>{label}</span>
    </button>
  );
}

/* ─── Pro Dashboard (shown when channel = dashboard) ─── */

export function ProDashboard({ roles, roleStatuses, activeExecs, waves, knowledgeDocs, roleLevels, getAppearance, onRoleClick, onWaveClick, onKnowledgeClick }: {
  roles: Role[]; roleStatuses: Record<string, string>;
  activeExecs: { roleId: string; task: string; jobId?: string }[];
  waves: Wave[]; knowledgeDocs: KnowledgeDoc[];
  roleLevels: RoleLevelData;
  getAppearance: (roleId: string) => CharacterAppearance | undefined;
  onRoleClick: (roleId: string) => void; onWaveClick: () => void; onKnowledgeClick: () => void;
}) {
  const workingRoles = roles.filter(r => isRoleActive(roleStatuses[r.id] as RoleStatus));

  return (
    <div className="h-full overflow-y-auto px-6 py-5">
      <div className="space-y-5 max-w-4xl">
        {/* Quick Actions */}
        <div className="flex gap-3">
          <QuickAction label="New Wave" icon={'\u26A1'} color="#EF4444" onClick={onWaveClick} />
          <QuickAction label="Knowledge" icon={'\u{1F4DA}'} color="#0D9488" onClick={onKnowledgeClick} />
        </div>

        {/* Currently Working */}
        {workingRoles.length > 0 && (
          <Card title="Currently Working" count={workingRoles.length}>
            {activeExecs.map(exec => {
              const role = roles.find(r => r.id === exec.roleId);
              const color = ROLE_COLORS[exec.roleId] ?? '#666';
              return (
                <button key={exec.roleId} onClick={() => onRoleClick(exec.roleId)}
                  className="flex items-center gap-3 px-4 py-2.5 rounded hover:opacity-80 w-full text-left"
                  style={{ background: `${color}10` }}>
                  <div className="shrink-0" style={{ width: 24, height: 24 }}>
                    <TopDownCharCanvas roleId={exec.roleId} appearance={getAppearance(exec.roleId)} scale={1.2} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <span className="text-[12px] font-medium" style={{ color }}>{role?.name}</span>
                    <span className="text-[11px] ml-2 truncate" style={{ color: 'var(--terminal-text-muted)' }}>{exec.task.slice(0, 60)}</span>
                  </div>
                  <span className="text-[10px] animate-pulse" style={{ color }}>{'\u25CF'}</span>
                </button>
              );
            })}
          </Card>
        )}

        {/* Team */}
        <Card title="Team" count={roles.length}>
          <div className="grid grid-cols-3 gap-1 px-2">
            {roles.map(role => {
              const status = roleStatuses[role.id] ?? 'offline';
              const level = roleLevels[role.id]?.level;
              return (
                <button key={role.id} onClick={() => onRoleClick(role.id)}
                  className="flex items-center gap-2 px-3 py-2 rounded hover:opacity-80 text-left">
                  <span className="w-2 h-2 rounded-full shrink-0" style={{
                    background: isRoleActive(status as RoleStatus) ? '#4CAF50' : status === 'idle' ? '#FFC107' : '#9E9E9E',
                  }} />
                  <span className="text-[11px] truncate" style={{ color: 'var(--terminal-text)' }}>{role.name}</span>
                  {level != null && <span className="text-[9px] opacity-40">Lv.{level}</span>}
                </button>
              );
            })}
          </div>
        </Card>

        {/* Recent Waves */}
        {waves.length > 0 && (
          <Card title="Recent Waves" count={waves.length}>
            {waves.slice(0, 5).map(wave => (
              <div key={wave.id} className="px-4 py-2 text-[11px]" style={{ color: 'var(--terminal-text-muted)' }}>
                <span style={{ color: 'var(--terminal-text)' }}>Wave {wave.id}</span>
                {' \u2014 '}{wave.directive?.slice(0, 80)}
              </div>
            ))}
          </Card>
        )}

        {/* Knowledge */}
        <Card title="Knowledge Base" count={knowledgeDocs.length}>
          <button onClick={onKnowledgeClick} className="px-4 py-3 text-[11px] hover:opacity-80"
            style={{ color: 'var(--terminal-text-muted)' }}>
            {knowledgeDocs.length} documents · Click to explore {'\u2192'}
          </button>
        </Card>
      </div>
    </div>
  );
}

function QuickAction({ label, icon, color, onClick }: { label: string; icon: string; color: string; onClick: () => void }) {
  return (
    <button onClick={onClick}
      className="flex items-center gap-2 px-5 py-3 rounded-lg hover:opacity-80 transition-opacity"
      style={{ background: `${color}15`, border: `1px solid ${color}30` }}>
      <span className="text-sm">{icon}</span>
      <span className="text-[12px] font-medium" style={{ color }}>{label}</span>
    </button>
  );
}

function Card({ title, count, children }: { title: string; count?: number; children: ReactNode }) {
  return (
    <div className="rounded-lg overflow-hidden"
      style={{ background: 'var(--terminal-surface, #241E19)', border: '1px solid var(--terminal-border, #2E261F)' }}>
      <div className="px-4 py-2.5 flex items-center gap-2" style={{ borderBottom: '1px solid var(--terminal-border, #2E261F)' }}>
        <span className="text-[10px] font-bold tracking-wider" style={{ color: 'var(--terminal-text-muted)' }}>{title.toUpperCase()}</span>
        {count !== undefined && (
          <span className="text-[9px] px-1.5 py-0.5 rounded-full"
            style={{ background: 'var(--terminal-border)', color: 'var(--terminal-text-muted)' }}>{count}</span>
        )}
      </div>
      <div className="py-1">{children}</div>
    </div>
  );
}
