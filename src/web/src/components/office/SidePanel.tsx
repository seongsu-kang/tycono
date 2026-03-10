import { useState, useEffect, useCallback, useRef } from 'react';
import type { RoleDetail, Session } from '../../types';
import type { CharacterAppearance } from '../../types/appearance';
import useActivityStream from '../../hooks/useActivityStream';
import OfficeMarkdown from './OfficeMarkdown';
import TopDownCharCanvas from './TopDownCharCanvas';
import { cloudApi } from '../../api/cloud';
import { api } from '../../api/client';

interface Props {
  role: RoleDetail | null;
  allRoles: { id: string; name: string; level: string; reportsTo: string }[];
  recentActivity: string;
  onClose: () => void;
  onFireRole?: (roleId: string, roleName: string) => void;
  terminalWidth?: number;
  // Live activity
  activeJobId?: string;
  activeTask?: string;
  isWorking?: boolean;
  jobStartedAt?: string;
  onStopJob?: (jobId: string) => void;
  // Inline chat
  sessions: Session[];
  streamingSessionId: string | null;
  onCreateSessionSilent: (roleId: string) => void;
  onSendMessage: (sessionId: string, content: string, mode: 'talk' | 'do') => void;
  onFocusTerminal: (roleId: string) => void;
  onCustomize?: (roleId: string) => void;
  onUpdateRole?: (roleId: string, changes: { name?: string; persona?: string }) => Promise<void>;
  appearance?: CharacterAppearance;
  relationships?: Array<{ roleA: string; roleB: string; familiarity: number; dispatches: number; wavesTogether: number; conversations: number }>;
  roleLevel?: number;
}

const ROLE_ICONS: Record<string, string> = {
  cto: '\u{1F3D7}\u{FE0F}', cbo: '\u{1F4CA}', pm: '\u{1F4CB}',
  engineer: '\u{2699}\u{FE0F}', designer: '\u{1F3A8}', qa: '\u{1F50D}',
};

const ROLE_COLORS: Record<string, string> = {
  cto: '#1565C0', cbo: '#E65100', pm: '#2E7D32',
  engineer: '#4A148C', designer: '#AD1457', qa: '#00695C',
};

const ROLE_NAMES: Record<string, string> = {
  cto: 'Chief Technology Officer',
  cbo: 'Chief Business Officer',
  pm: 'Product Manager',
  engineer: 'Software Engineer',
  designer: 'UI/UX Designer',
  qa: 'QA Engineer',
};

const DEFAULT_WIDTH = 500;
const MIN_WIDTH = 360;
const MAX_WIDTH = 700;

const fmtElapsed = (seconds: number) => `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;

export default function SidePanel({
  role, allRoles, recentActivity, onClose, onFireRole, terminalWidth = 0,
  activeJobId, activeTask, isWorking, jobStartedAt, onStopJob,
  sessions, streamingSessionId, onCreateSessionSilent, onSendMessage, onFocusTerminal, onCustomize, onUpdateRole, appearance, relationships, roleLevel,
}: Props) {
  const [panelW, setPanelW] = useState(DEFAULT_WIDTH);
  const [isResizing, setIsResizing] = useState(false);
  const startXRef = useRef(0);
  const startWidthRef = useRef(0);

  // Collapsible sections
  const [showProfile, setShowProfile] = useState(false);
  const [showAuthority, setShowAuthority] = useState(false);
  const [showRelationships, setShowRelationships] = useState(false);
  const [showJournal, setShowJournal] = useState(false);

  // Idle mode input
  const [idleMode, setIdleMode] = useState<'talk' | 'do'>('talk');

  // Inline name editing
  const [editingName, setEditingName] = useState(false);
  const [nameValue, setNameValue] = useState('');
  const [nameSaving, setNameSaving] = useState(false);
  const nameInputRef = useRef<HTMLInputElement>(null);

  // Persona editing
  const [editingPersona, setEditingPersona] = useState(false);
  const [personaValue, setPersonaValue] = useState('');
  const [personaSaving, setPersonaSaving] = useState(false);

  // Activity stream for working state (compact summary)
  const { events: activityEvents, status: activityStatus } = useActivityStream(activeJobId ?? null);

  // Elapsed timer
  const [elapsed, setElapsed] = useState(0);
  useEffect(() => {
    if (!isWorking || !jobStartedAt) { setElapsed(0); return; }
    const start = new Date(jobStartedAt).getTime();
    const tick = () => setElapsed(Math.floor((Date.now() - start) / 1000));
    tick();
    const timer = setInterval(tick, 1000);
    return () => clearInterval(timer);
  }, [isWorking, jobStartedAt]);

  const hasTerminal = terminalWidth > 0;
  const panelRight = hasTerminal ? terminalWidth : 0;
  const maxAvailable = hasTerminal ? Math.max(MIN_WIDTH, window.innerWidth - terminalWidth - 100) : MAX_WIDTH;
  const panelWidth = Math.min(panelW, maxAvailable);

  const handleResizeStart = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    startXRef.current = e.clientX;
    startWidthRef.current = panelWidth;
    setIsResizing(true);

    const onMove = (ev: MouseEvent) => {
      const delta = startXRef.current - ev.clientX;
      const newWidth = Math.min(MAX_WIDTH, Math.max(MIN_WIDTH, startWidthRef.current + delta));
      setPanelW(newWidth);
    };

    const onUp = () => {
      setIsResizing(false);
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
    };

    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
  }, [panelWidth]);

  // Track pending message to send after session creation
  const pendingMessageRef = useRef<{ content: string; mode: 'talk' | 'do' } | null>(null);
  const roleSession = role ? sessions.find(s => s.roleId === role.id) : null;

  const handleInlineSend = (content: string) => {
    if (!role) return;
    const mode = isWorking ? 'talk' : idleMode;

    if (roleSession) {
      onSendMessage(roleSession.id, content, mode);
      // Focus terminal to show full conversation
      onFocusTerminal(role.id);
    } else {
      pendingMessageRef.current = { content, mode };
      onCreateSessionSilent(role.id);
    }
  };

  // Send pending message when session becomes available, then focus terminal
  useEffect(() => {
    if (roleSession && pendingMessageRef.current) {
      const { content, mode } = pendingMessageRef.current;
      pendingMessageRef.current = null;
      onSendMessage(roleSession.id, content, mode);
      if (role) onFocusTerminal(role.id);
    }
  }, [roleSession?.id]);

  // Compact activity summary: count event types
  const activitySummary = (() => {
    if (!activityEvents.length) return null;
    const tools: string[] = [];
    let thinkCount = 0;
    let textCount = 0;
    let dispatchCount = 0;
    for (const ev of activityEvents) {
      if (ev.type === 'thinking') thinkCount++;
      else if (ev.type === 'text') textCount++;
      else if (ev.type === 'tool:start') {
        const name = String(ev.data.name ?? '');
        if (!tools.includes(name)) tools.push(name);
      }
      else if (ev.type === 'dispatch:start') dispatchCount++;
    }
    return { tools, thinkCount, textCount, dispatchCount, total: activityEvents.length };
  })();

  // Derive task description: from job or from last CEO message in session
  const effectiveTask = activeTask || (() => {
    if (!roleSession) return null;
    const msgs = roleSession.messages;
    for (let i = msgs.length - 1; i >= 0; i--) {
      if (msgs[i].from === 'ceo') return msgs[i].content;
    }
    return null;
  })();

  // Last text message from the current session (for preview)
  const lastRoleMessage = (() => {
    if (!roleSession) return null;
    const msgs = roleSession.messages;
    for (let i = msgs.length - 1; i >= 0; i--) {
      if (msgs[i].from === 'role' && msgs[i].content) return msgs[i].content;
    }
    return null;
  })();

  if (!role) {
    return (
      <>
        <div className="dimmer fixed top-0 left-0 bottom-0 bg-black/30 z-40 open" style={{ right: panelRight }} onClick={onClose} />
        <div className="side-panel open fixed top-0 h-full z-50 flex items-center justify-center border-l-[3px]"
          style={{ right: panelRight, width: panelWidth, background: 'var(--terminal-bg)', borderLeftColor: 'var(--pixel-border)' }}
        >
          <div className="text-sm" style={{ color: 'var(--terminal-text-muted)' }}>Loading role...</div>
        </div>
      </>
    );
  }

  const color = ROLE_COLORS[role.id] ?? '#666';
  const icon = ROLE_ICONS[role.id] ?? '\u{1F464}';
  const reports = allRoles.filter((r) => r.reportsTo === role.id);
  const isStreaming = roleSession && streamingSessionId === roleSession.id;
  const roleName = role.name || ROLE_NAMES[role.id] || role.id;

  return (
    <>
      <div className="dimmer fixed top-0 left-0 bottom-0 bg-black/30 z-40 open" style={{ right: panelRight }} onClick={onClose} />

      <div className={`side-panel open fixed top-0 h-full z-50 flex flex-col border-l-[3px] shadow-[-4px_0_20px_rgba(0,0,0,0.4)] ${isResizing ? 'resizing' : ''}`}
        style={{ borderLeftColor: color, right: panelRight, width: panelWidth, background: 'var(--terminal-bg)' }}
      >
        {/* Resize handle */}
        <div
          className={`absolute top-0 -left-[5px] w-[10px] h-full cursor-col-resize z-[60] transition-colors ${isResizing ? 'bg-white/10' : 'hover:bg-white/5'}`}
          onMouseDown={handleResizeStart}
        />

        {/* Header */}
        <div className="relative shrink-0 overflow-hidden" style={{ background: `linear-gradient(135deg, ${color}ee, ${color}99)` }}>
          {/* Background pattern */}
          <div className="absolute inset-0 opacity-[0.06]" style={{
            backgroundImage: `repeating-linear-gradient(45deg, transparent, transparent 8px, white 8px, white 9px)`,
          }} />

          {/* Top controls */}
          <div className="absolute top-3 right-3 flex items-center gap-1.5 z-10">
            {onCustomize && (
              <button
                onClick={() => onCustomize(role.id)}
                className="w-7 h-7 rounded-full bg-black/20 text-white flex items-center justify-center text-sm hover:bg-black/30 cursor-pointer backdrop-blur-sm"
                title="Customize"
              >
                {'\u{1F3A8}'}
              </button>
            )}
            <button
              onClick={onClose}
              className="w-7 h-7 rounded-full bg-black/20 text-white flex items-center justify-center text-lg hover:bg-black/30 cursor-pointer backdrop-blur-sm"
            >
              ×
            </button>
          </div>

          {/* Main header content */}
          <div className="relative flex items-end gap-4 px-4 pt-4 pb-3">
            {/* Sprite */}
            <div className="shrink-0 relative" style={{ marginBottom: -2 }}>
              <div className="rounded-lg p-1" style={{ background: 'rgba(0,0,0,0.2)' }}>
                <TopDownCharCanvas roleId={role.id} appearance={appearance} scale={8} />
              </div>
            </div>

            {/* Info */}
            <div className="flex-1 min-w-0 text-white pb-1">
              <div className="text-lg font-bold flex items-center gap-2" style={{ fontFamily: 'var(--pixel-font)' }}>
                {icon} {role.id.toUpperCase()}
                {isWorking && (
                  <span className="text-[9px] font-semibold px-2 py-0.5 rounded-full animate-pulse"
                    style={{ background: 'rgba(251,191,36,0.25)', color: '#fde68a' }}>
                    WORKING
                  </span>
                )}
              </div>
              {editingName ? (
                <form className="flex items-center gap-1.5 mt-0.5" onSubmit={async (e) => {
                  e.preventDefault();
                  const trimmed = nameValue.trim();
                  if (!trimmed || trimmed === roleName || !onUpdateRole) { setEditingName(false); return; }
                  setNameSaving(true);
                  try { await onUpdateRole(role.id, { name: trimmed }); } catch { /* handled by parent */ }
                  setNameSaving(false);
                  setEditingName(false);
                }}>
                  <input
                    ref={nameInputRef}
                    value={nameValue}
                    onChange={(e) => setNameValue(e.target.value)}
                    onKeyDown={(e) => { if (e.key === 'Escape') setEditingName(false); }}
                    disabled={nameSaving}
                    autoFocus
                    className="bg-white/20 text-white text-xs rounded px-1.5 py-0.5 outline-none focus:bg-white/30 w-full"
                    style={{ fontFamily: 'inherit' }}
                  />
                  <button type="submit" disabled={nameSaving} className="text-white/80 hover:text-white text-[10px] cursor-pointer shrink-0">✓</button>
                  <button type="button" onClick={() => setEditingName(false)} className="text-white/60 hover:text-white text-[10px] cursor-pointer shrink-0">✕</button>
                </form>
              ) : (
                <div
                  className="text-xs opacity-75 mt-0.5 group/name flex items-center gap-1 cursor-pointer hover:opacity-100 transition-opacity"
                  onClick={() => { if (onUpdateRole) { setNameValue(roleName); setEditingName(true); } }}
                  title={onUpdateRole ? 'Click to edit name' : undefined}
                >
                  {roleName}
                  {onUpdateRole && <span className="opacity-0 group-hover/name:opacity-60 text-[10px]">{'\u270E'}</span>}
                </div>
              )}
            </div>
          </div>

          {/* Stats bar */}
          <div className="relative flex items-center gap-3 px-4 py-2 text-[10px] font-bold text-white/80" style={{ background: 'rgba(0,0,0,0.2)', fontFamily: 'var(--pixel-font)' }}>
            <span>Lv.{roleLevel ?? 1}</span>
            <span style={{ color: 'rgba(255,255,255,0.3)' }}>|</span>
            <span className="flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full" style={{ background: isWorking ? 'var(--idle-amber)' : 'var(--active-green)' }} />
              {isWorking ? 'Working' : 'Idle'}
            </span>
            <span style={{ color: 'rgba(255,255,255,0.3)' }}>|</span>
            <span>{role.level}</span>
            {role.reportsTo && <>
              <span style={{ color: 'rgba(255,255,255,0.3)' }}>|</span>
              <span className="opacity-60">{'\u2192'} {role.reportsTo}</span>
            </>}
          </div>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto flex flex-col min-h-0">

          {/* ─── STATUS (working) ─── */}
          {isWorking && (
            <div className="px-4 py-3 shrink-0" style={{ borderBottom: '1px solid var(--terminal-border)', background: 'var(--hud-bg-alt)' }}>
              <div className="flex items-center justify-between mb-1">
                <div className="flex items-center gap-2">
                  <div className="w-2 h-2 rounded-full animate-pulse" style={{ background: 'var(--idle-amber)' }} />
                  <span className="text-xs font-semibold" style={{ color: 'var(--idle-amber)' }}>
                    Working{elapsed > 0 ? ` · ${fmtElapsed(elapsed)}` : ''}
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => onFocusTerminal(role.id)}
                    className="text-[10px] cursor-pointer hover:underline"
                    style={{ color: 'var(--terminal-text-muted)' }}
                  >
                    Open chat ↗
                  </button>
                  {activeJobId && onStopJob && (
                    <button
                      onClick={() => onStopJob(activeJobId)}
                      className="text-[10px] px-2 py-0.5 rounded cursor-pointer font-semibold transition-colors"
                      style={{ background: 'rgba(239,68,68,0.15)', color: '#ef4444' }}
                    >
                      Stop
                    </button>
                  )}
                </div>
              </div>
              {effectiveTask && (
                <div className="text-xs truncate" style={{ color: 'var(--terminal-text-secondary)' }}>{effectiveTask}</div>
              )}
            </div>
          )}

          {/* ─── ACTIVITY COMPACT (working) ─── */}
          {isWorking && activeJobId && activitySummary && (
            <div className="px-4 py-2.5 shrink-0" style={{ borderBottom: '1px solid var(--terminal-border)' }}>
              <div className="flex items-center justify-between mb-1.5">
                <div className="text-[11px] font-bold uppercase tracking-wider" style={{ color: 'var(--terminal-text-secondary)' }}>Activity</div>
                <button
                  onClick={() => onFocusTerminal(role.id)}
                  className="text-[10px] cursor-pointer hover:underline"
                  style={{ color: 'var(--terminal-text-muted)' }}
                >
                  View details ↗
                </button>
              </div>
              <div className="flex items-center gap-1.5 flex-wrap">
                {activitySummary.thinkCount > 0 && (
                  <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px]" style={{ background: 'rgba(168,85,247,0.15)', color: '#c084fc' }}>
                    <span className="w-1.5 h-1.5 rounded-full" style={{ background: '#a855f7' }} />
                    thinking ×{activitySummary.thinkCount}
                  </span>
                )}
                {activitySummary.tools.map(t => (
                  <span key={t} className="px-1.5 py-0.5 rounded text-[10px]" style={{ background: 'rgba(59,130,246,0.15)', color: '#60a5fa' }}>
                    {t}
                  </span>
                ))}
                {activitySummary.dispatchCount > 0 && (
                  <span className="px-1.5 py-0.5 rounded text-[10px]" style={{ background: 'rgba(249,115,22,0.15)', color: '#fb923c' }}>
                    dispatch ×{activitySummary.dispatchCount}
                  </span>
                )}
                {activitySummary.textCount > 0 && (
                  <span className="px-1.5 py-0.5 rounded text-[10px]" style={{ background: 'rgba(34,197,94,0.15)', color: '#4ade80' }}>
                    output ×{activitySummary.textCount}
                  </span>
                )}
                {(activityStatus === 'streaming' || activityStatus === 'connecting') && (
                  <span className="inline-block w-1.5 h-3 animate-pulse rounded-sm" style={{ background: 'var(--active-green)' }} />
                )}
              </div>
              <div className="text-[10px] mt-1" style={{ color: 'var(--terminal-text-muted)' }}>{activitySummary.total} events</div>
            </div>
          )}

          {/* ─── LAST MESSAGE PREVIEW (working, has session) ─── */}
          {isWorking && lastRoleMessage && (
            <div className="px-4 py-2.5 shrink-0" style={{ borderBottom: '1px solid var(--terminal-border)' }}>
              <div className="flex items-center justify-between mb-1.5">
                <div className="text-[11px] font-bold uppercase tracking-wider" style={{ color: 'var(--terminal-text-secondary)' }}>Last Message</div>
                <button
                  onClick={() => onFocusTerminal(role.id)}
                  className="text-[10px] cursor-pointer hover:underline"
                  style={{ color: 'var(--terminal-text-muted)' }}
                >
                  Open chat ↗
                </button>
              </div>
              <div className="rounded-lg p-2.5 text-xs leading-relaxed line-clamp-3 overflow-hidden" style={{ background: 'var(--hud-bg-alt)', border: '1px solid var(--terminal-border)', color: 'var(--terminal-text-secondary)' }}>
                {lastRoleMessage.slice(0, 200)}
                {lastRoleMessage.length > 200 && '...'}
              </div>
            </div>
          )}

          {/* ─── QUICK INPUT (working) ─── */}
          {isWorking && (
            <div className="px-4 py-2.5 shrink-0" style={{ borderBottom: '1px solid var(--terminal-border)' }}>
              <MiniInputBar
                onSend={handleInlineSend}
                disabled={!!isStreaming}
                placeholder="Ask something..."
                color={color}
              />
            </div>
          )}

          {/* ─── SPEECH BUBBLE (idle) ─── */}
          {!isWorking && (
            <div className="px-4 pt-4 pb-2">
              <div className="text-[11px] font-bold uppercase tracking-wider mb-2" style={{ color: 'var(--terminal-text-secondary)' }}>Latest</div>
              <SpeechBubble
                icon={icon}
                roleId={role.id}
                roleName={roleName}
                color={color}
                text={recentActivity}
              />
            </div>
          )}

          {/* ─── INLINE INPUT (idle) ─── */}
          {!isWorking && (
            <div className="px-4 py-3" style={{ borderBottom: '1px solid var(--terminal-border)' }}>
              <div className="rounded-xl overflow-hidden" style={{ background: 'var(--hud-bg-alt)', border: '1px solid var(--terminal-border)' }}>
                {/* Last message preview (idle, has prior conversation) */}
                {lastRoleMessage && (
                  <div
                    className="px-3 pt-2.5 pb-2 cursor-pointer transition-colors"
                    style={{ borderBottom: '1px solid var(--terminal-border)' }}
                    onClick={() => onFocusTerminal(role.id)}
                  >
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: 'var(--terminal-text-muted)' }}>Last response</span>
                      <span className="text-[10px]" style={{ color: 'var(--terminal-text-muted)' }}>View ↗</span>
                    </div>
                    <div className="text-xs leading-relaxed line-clamp-2 overflow-hidden" style={{ color: 'var(--terminal-text-secondary)' }}>
                      {lastRoleMessage.slice(0, 150)}
                      {lastRoleMessage.length > 150 && '...'}
                    </div>
                  </div>
                )}
                <div className="p-2">
                  <div className="flex items-center gap-2">
                    <div className="flex rounded-lg overflow-hidden shrink-0" style={{ border: '1px solid var(--pixel-border)' }}>
                      <button
                        onClick={() => setIdleMode('talk')}
                        className="px-2 py-1 text-[10px] font-semibold cursor-pointer transition-colors"
                        style={{
                          background: idleMode === 'talk' ? 'var(--accent)' : 'transparent',
                          color: idleMode === 'talk' ? '#fff' : 'var(--terminal-text-secondary)',
                        }}
                      >
                        Talk
                      </button>
                      <button
                        onClick={() => setIdleMode('do')}
                        className="px-2 py-1 text-[10px] font-semibold cursor-pointer transition-colors"
                        style={{
                          background: idleMode === 'do' ? 'var(--idle-amber)' : 'transparent',
                          color: idleMode === 'do' ? '#fff' : 'var(--terminal-text-secondary)',
                        }}
                      >
                        Do
                      </button>
                    </div>
                    <MiniInputBar
                      onSend={handleInlineSend}
                      disabled={!!isStreaming}
                      placeholder={idleMode === 'talk' ? 'Ask something...' : 'Give a directive...'}
                      color={color}
                    />
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* ─── COLLAPSIBLE SECTIONS ─── */}
          <div className="px-4 py-2 space-y-1">
            {/* Profile */}
            <CollapsibleSection title={`Profile${role.persona ? '' : ' (empty)'}`} open={showProfile} onToggle={() => setShowProfile(v => !v)}>
              {editingPersona ? (
                <div className="space-y-2">
                  <textarea
                    value={personaValue}
                    onChange={(e) => setPersonaValue(e.target.value)}
                    onKeyDown={(e) => { if (e.key === 'Escape') setEditingPersona(false); }}
                    disabled={personaSaving}
                    autoFocus
                    rows={5}
                    placeholder="Describe this role's personality and communication style. How do they talk? Are they sarcastic? Cheerful? Blunt?"
                    className="w-full text-xs leading-relaxed rounded-lg p-3 outline-none resize-y"
                    style={{ background: 'var(--hud-bg-alt)', border: '1px solid var(--active-green)', color: 'var(--terminal-text)', fontFamily: 'inherit', minHeight: '80px' }}
                  />
                  <div className="flex gap-1.5 justify-end">
                    <button
                      onClick={() => setEditingPersona(false)}
                      disabled={personaSaving}
                      className="text-[10px] px-2 py-0.5 rounded cursor-pointer"
                      style={{ color: 'var(--terminal-text-muted)', border: '1px solid var(--terminal-border)' }}
                    >Cancel</button>
                    <button
                      onClick={async () => {
                        if (!onUpdateRole) return;
                        setPersonaSaving(true);
                        try { await onUpdateRole(role.id, { persona: personaValue.trim() }); } catch { /* handled by parent */ }
                        setPersonaSaving(false);
                        setEditingPersona(false);
                      }}
                      disabled={personaSaving}
                      className="text-[10px] px-2 py-0.5 rounded cursor-pointer font-semibold"
                      style={{ background: 'var(--active-green)', color: '#000' }}
                    >{personaSaving ? 'Saving...' : 'Save'}</button>
                  </div>
                </div>
              ) : (
                <div
                  className="text-xs leading-relaxed rounded-lg p-3 group/persona cursor-pointer hover:opacity-90 transition-opacity"
                  style={{ background: 'var(--hud-bg-alt)', border: '1px solid var(--terminal-border)', color: 'var(--terminal-text-secondary)' }}
                  onClick={() => { if (onUpdateRole) { setPersonaValue(role.persona || ''); setEditingPersona(true); } }}
                  title={onUpdateRole ? 'Click to edit persona' : undefined}
                >
                  {role.persona || <span style={{ color: 'var(--terminal-text-muted)' }}>No persona set. Click to add one.</span>}
                  {onUpdateRole && <span className="opacity-0 group-hover/persona:opacity-60 text-[10px] ml-1">{'\u270E'}</span>}
                </div>
              )}
              <div className="space-y-0 mt-2">
                <InfoRow label="Level" value={role.level} />
                <InfoRow label="Reports to" value={role.reportsTo} />
                <InfoRow label="Status" value={role.status} />
              </div>
              {reports.length > 0 && (
                <div className="mt-3">
                  <div className="text-[11px] font-semibold mb-1" style={{ color: 'var(--terminal-text-muted)' }}>Direct Reports</div>
                  <div className="space-y-1">
                    {reports.map((r) => (
                      <div key={r.id} className="flex items-center gap-2 p-1.5 rounded-lg" style={{ background: 'var(--hud-bg-alt)' }}>
                        <div
                          className="w-6 h-6 rounded flex items-center justify-center text-white text-[10px] font-bold"
                          style={{ background: ROLE_COLORS[r.id] ?? '#666' }}
                        >
                          {r.id.slice(0, 2).toUpperCase()}
                        </div>
                        <div className="text-xs" style={{ color: 'var(--terminal-text)' }}>{r.name}</div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </CollapsibleSection>

            {/* Authority */}
            {role.authority && (
              <CollapsibleSection title="Authority" open={showAuthority} onToggle={() => setShowAuthority(v => !v)}>
                {role.authority.autonomous?.length > 0 && (
                  <div className="mb-2">
                    <div className="text-xs font-semibold mb-1" style={{ color: 'var(--active-green)' }}>Autonomous</div>
                    {role.authority.autonomous.map((a, i) => (
                      <div key={i} className="text-xs pl-3 py-0.5" style={{ color: 'var(--terminal-text-secondary)' }}>- {a}</div>
                    ))}
                  </div>
                )}
                {role.authority.needsApproval?.length > 0 && (
                  <div>
                    <div className="text-xs font-semibold mb-1" style={{ color: 'var(--idle-amber)' }}>Needs Approval</div>
                    {role.authority.needsApproval.map((a, i) => (
                      <div key={i} className="text-xs pl-3 py-0.5" style={{ color: 'var(--terminal-text-secondary)' }}>- {a}</div>
                    ))}
                  </div>
                )}
              </CollapsibleSection>
            )}

            {/* Relationships */}
            {role && relationships && (() => {
              const roleRels = relationships
                .filter(r => r.roleA === role.id || r.roleB === role.id)
                .filter(r => r.familiarity > 0)
                .sort((a, b) => b.familiarity - a.familiarity);
              if (roleRels.length === 0) return null;
              return (
                <CollapsibleSection title={`Relationships (${roleRels.length})`} open={showRelationships} onToggle={() => setShowRelationships(v => !v)}>
                  <div className="space-y-1.5">
                    {roleRels.map((rel, i) => {
                      const partnerId = rel.roleA === role.id ? rel.roleB : rel.roleA;
                      const partnerRole = allRoles.find(r => r.id === partnerId);
                      const level = rel.familiarity >= 80 ? 'Best Partner'
                        : rel.familiarity >= 50 ? 'Friend'
                        : rel.familiarity >= 20 ? 'Colleague'
                        : 'Acquaintance';
                      const barColor = rel.familiarity >= 80 ? '#4CAF50'
                        : rel.familiarity >= 50 ? '#2196F3'
                        : rel.familiarity >= 20 ? '#FF9800'
                        : '#9E9E9E';
                      return (
                        <div key={i} className="flex items-center gap-2">
                          <span className="text-xs w-20 truncate" style={{ color: ROLE_COLORS[partnerId] ?? 'var(--terminal-text-secondary)' }}>
                            {partnerRole?.name ?? partnerId}
                          </span>
                          <div className="flex-1 h-1.5 rounded-full bg-white/10">
                            <div className="h-full rounded-full transition-all" style={{ width: `${rel.familiarity}%`, background: barColor }} />
                          </div>
                          <span className="text-[10px] w-16 text-right" style={{ color: 'var(--terminal-text-muted)' }}>
                            {level}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                </CollapsibleSection>
              );
            })()}

            {/* Journal */}
            {role.journal && (
              <CollapsibleSection
                title={`Journal (${(role.journal.match(/### /g) ?? []).length})`}
                open={showJournal}
                onToggle={() => setShowJournal(v => !v)}
              >
                <div className="text-xs leading-relaxed rounded-lg p-3 max-h-[300px] overflow-y-auto" style={{ background: 'var(--hud-bg-alt)', border: '1px solid var(--terminal-border)', color: 'var(--terminal-text-secondary)' }}>
                  <OfficeMarkdown content={role.journal.slice(0, 3000)} />
                  {role.journal.length > 3000 && <div className="italic mt-2" style={{ color: 'var(--terminal-text-muted)' }}>... (truncated)</div>}
                </div>
              </CollapsibleSection>
            )}
          </div>

          {/* ─── PUBLISH TO STORE ─── */}
          <PublishToStore role={role} appearance={appearance} />

          {/* ─── FIRE (always at bottom) ─── */}
          {onFireRole && (
            <div className="px-4 pb-4 mt-auto shrink-0">
              <button
                onClick={() => { onFireRole(role.id, role.name); onClose(); }}
                className="w-full p-2 text-center text-xs font-medium border-2 border-dashed rounded-lg cursor-pointer transition-colors"
                style={{ borderColor: 'rgba(239,68,68,0.3)', color: 'rgba(239,68,68,0.5)' }}
              >
                Fire Role
              </button>
            </div>
          )}
        </div>
      </div>
    </>
  );
}

/* ─── Publish To Store ─────────────────── */

function PublishToStore({ role, appearance }: { role: RoleDetail; appearance?: CharacterAppearance }) {
  const [status, setStatus] = useState<'idle' | 'publishing' | 'done' | 'error'>('idle');
  const [message, setMessage] = useState('');
  const [confirm, setConfirm] = useState(false);
  const [publishedVersion, setPublishedVersion] = useState<string | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [publisherId, setPublisherId] = useState<string | null>(null);

  // Check if already published + get publisher token
  useEffect(() => {
    cloudApi.getCharacterVersion(role.id)
      .then(v => setPublishedVersion(v?.version ?? null))
      .catch(() => setPublishedVersion(null));
    api.getPreferences()
      .then(p => setPublisherId((p as { instanceId?: string }).instanceId ?? null))
      .catch(() => {});
  }, [role.id]);

  const handlePublish = async () => {
    if (!confirm) { setConfirm(true); return; }
    setStatus('publishing');
    try {
      let skillExport = null;
      try { skillExport = await api.exportSkills(role.id); } catch { /* no skills */ }

      const data: Record<string, unknown> = {
        roleId: role.id,
        persona: role.persona ?? '',
        authority: role.authority ?? { autonomous: [], needsApproval: [] },
        level: role.level,
        tagline: (role.persona ?? '').split(/[.\n]/)[0]?.trim().slice(0, 80) || role.name,
        chatStyle: 'Professional and focused',
        skills: skillExport ?? [],
        resume: { summary: role.persona?.split('\n')[0] ?? '', strengths: [], specialties: [], experience: '' },
        author: { id: 'tycono', name: 'Tycono' },
        tags: [role.level, role.id],
        price: 'free',
        installs: 0,
        rating: 0,
        featured: false,
        randomActive: true,
        randomPersonality: '',
      };
      if (appearance) data.appearance = appearance;

      let version = '1.0.0';
      try {
        const existing = await cloudApi.getCharacterVersion(role.id);
        if (existing?.version) {
          const parts = existing.version.split('.').map(Number);
          parts[2] = (parts[2] ?? 0) + 1;
          version = parts.join('.');
        }
      } catch { /* not published yet */ }

      await cloudApi.publishCharacter({ id: role.id, name: role.name || role.id, version, data, publisherId: publisherId ?? undefined });
      setStatus('done');
      setMessage(`Published v${version}`);
      setPublishedVersion(version);
      setConfirm(false);
    } catch (err) {
      setStatus('error');
      setMessage(err instanceof Error ? err.message : 'Failed');
      setConfirm(false);
    }
  };

  const handleDelete = async () => {
    setDeleting(true);
    try {
      await cloudApi.deleteCharacter(role.id, publisherId ?? undefined);
      setPublishedVersion(null);
      setStatus('idle');
      setMessage('');
      setDeleteConfirm(false);
    } catch {
      setMessage('Delete failed');
    }
    setDeleting(false);
  };

  return (
    <div className="px-4 pb-2 shrink-0">
      <div className="rounded-lg overflow-hidden" style={{ border: '1px solid var(--terminal-border)' }}>
        <div className="px-3 py-2.5 flex items-center justify-between gap-2" style={{ background: 'var(--hud-bg-alt)' }}>
          <div className="flex items-center gap-2 min-w-0">
            <span className="text-[11px] font-bold uppercase tracking-wider shrink-0" style={{ color: 'var(--terminal-text-secondary)', fontFamily: 'var(--pixel-font)' }}>
              Cloud Store
            </span>
            {publishedVersion && (
              <span className="text-[9px] px-1.5 py-0.5 rounded shrink-0" style={{ background: 'rgba(34,197,94,0.1)', color: 'rgba(34,197,94,0.6)', border: '1px solid rgba(34,197,94,0.2)' }}>
                v{publishedVersion}
              </span>
            )}
          </div>
          <div className="flex items-center gap-1.5 shrink-0">
            {status === 'done' ? (
              <>
                <a
                  href="https://tycono.ai/store.html"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-[10px] hover:underline"
                  style={{ color: 'var(--terminal-text-muted)' }}
                  onClick={e => e.stopPropagation()}
                >View on Store ↗</a>
                <span className="text-[10px] font-semibold" style={{ color: 'var(--active-green)' }}>{message}</span>
              </>
            ) : status === 'error' ? (
              <span className="text-[10px] font-semibold" style={{ color: '#ef4444' }}>{message}</span>
            ) : (
              <button
                onClick={handlePublish}
                disabled={status === 'publishing'}
                className="text-[10px] px-2.5 py-1 rounded font-semibold cursor-pointer transition-colors disabled:opacity-50"
                style={{
                  background: confirm ? 'rgba(59,130,246,0.3)' : 'rgba(59,130,246,0.15)',
                  color: '#60a5fa',
                  border: confirm ? '1px solid rgba(59,130,246,0.5)' : '1px solid transparent',
                }}
              >
                {status === 'publishing' ? 'Publishing...' : confirm ? 'Confirm?' : publishedVersion ? 'Update' : 'Publish'}
              </button>
            )}
            {publishedVersion && !deleteConfirm && (
              <button
                onClick={() => setDeleteConfirm(true)}
                className="text-[10px] px-1.5 py-1 rounded cursor-pointer transition-colors"
                style={{ color: 'rgba(239,68,68,0.4)' }}
                title="Remove from store"
              >
                {'\u2715'}
              </button>
            )}
            {deleteConfirm && (
              <div className="flex items-center gap-1">
                <button
                  onClick={handleDelete}
                  disabled={deleting}
                  className="text-[10px] px-2 py-1 rounded font-semibold cursor-pointer disabled:opacity-50"
                  style={{ background: 'rgba(239,68,68,0.2)', color: '#ef4444', border: '1px solid rgba(239,68,68,0.3)' }}
                >
                  {deleting ? '...' : 'Delete'}
                </button>
                <button
                  onClick={() => setDeleteConfirm(false)}
                  className="text-[10px] px-1.5 py-1 rounded cursor-pointer"
                  style={{ color: 'var(--terminal-text-muted)' }}
                >
                  No
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

/* ─── Speech Bubble (enhanced) ─────────────────── */

function SpeechBubble({ icon, roleId, roleName, color, text }: {
  icon: string;
  roleId: string;
  roleName: string;
  color: string;
  text: string;
}) {
  const hasText = !!text;

  return (
    <div className="relative">
      {/* Character row */}
      <div className="flex items-start gap-3">
        {/* Avatar */}
        <div className="shrink-0">
          <div
            className="w-10 h-10 rounded-xl flex items-center justify-center text-xl shadow-sm"
            style={{ background: `${color}18`, border: `2px solid ${color}44` }}
          >
            {icon}
          </div>
          <div
            className="text-[9px] font-bold text-center mt-0.5 uppercase tracking-wide"
            style={{ color }}
          >
            {roleId}
          </div>
        </div>

        {/* Bubble */}
        <div className="flex-1 min-w-0">
          {/* Tail triangle */}
          <div className="relative">
            <div
              className="absolute top-3 -left-2 w-0 h-0"
              style={{
                borderTop: '6px solid transparent',
                borderBottom: '6px solid transparent',
                borderRight: `8px solid ${color}12`,
              }}
            />
            <div
              className="rounded-xl rounded-tl-sm p-4 border"
              style={{ background: `${color}08`, borderColor: `${color}22` }}
            >
              <div className="text-[10px] font-semibold mb-1.5 uppercase tracking-wider" style={{ color }}>
                {roleName}
              </div>
              {hasText ? (
                <div className="text-sm leading-relaxed" style={{ color: 'var(--terminal-text)' }}>
                  <OfficeMarkdown content={text} />
                </div>
              ) : (
                <div className="text-sm italic" style={{ color: 'var(--terminal-text-muted)' }}>No recent activity.</div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ─── Collapsible Section ─────────────────── */

function CollapsibleSection({ title, open, onToggle, children }: {
  title: string;
  open: boolean;
  onToggle: () => void;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-lg overflow-hidden" style={{ border: '1px solid var(--terminal-border)' }}>
      <button
        onClick={onToggle}
        className="w-full px-3 py-2.5 flex items-center justify-between cursor-pointer transition-colors group"
        style={{ background: 'var(--hud-bg-alt)' }}
      >
        <span className="text-[11px] font-bold uppercase tracking-wider" style={{ color: 'var(--terminal-text-secondary)', fontFamily: 'var(--pixel-font)' }}>{title}</span>
        <span className="text-[10px] transition-transform" style={{ color: 'var(--terminal-text-muted)', transform: open ? 'rotate(0deg)' : 'rotate(-90deg)' }}>{'\u25BC'}</span>
      </button>
      {open && <div className="px-3 pb-3 pt-2" style={{ borderTop: '1px solid var(--terminal-border)' }}>{children}</div>}
    </div>
  );
}

/* ─── Mini Input Bar ─────────────────── */

function MiniInputBar({ onSend, disabled, placeholder, color }: {
  onSend: (content: string) => void;
  disabled: boolean;
  placeholder: string;
  color: string;
}) {
  const [value, setValue] = useState('');

  const handleSubmit = () => {
    const trimmed = value.trim();
    if (!trimmed || disabled) return;
    onSend(trimmed);
    setValue('');
  };

  return (
    <div className="flex items-center gap-1.5 flex-1">
      <input
        type="text"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); handleSubmit(); } }}
        placeholder={disabled ? 'Waiting...' : placeholder}
        disabled={disabled}
        className="flex-1 rounded-lg px-2.5 py-1.5 text-xs focus:outline-none disabled:opacity-40"
        style={{ background: 'var(--hud-bg)', border: '1px solid var(--pixel-border)', color: 'var(--terminal-text)' }}
      />
      <button
        onClick={handleSubmit}
        disabled={disabled || !value.trim()}
        className="w-7 h-7 rounded-lg flex items-center justify-center shrink-0 cursor-pointer text-white disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
        style={{ background: disabled || !value.trim() ? '#666' : color }}
      >
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
          <path d="M22 2L11 13" />
          <path d="M22 2L15 22L11 13L2 9L22 2Z" />
        </svg>
      </button>
    </div>
  );
}

/* ─── Info Row ─────────────────── */

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between py-1.5 text-xs" style={{ borderBottom: '1px solid var(--terminal-border)' }}>
      <span style={{ color: 'var(--terminal-text-muted)' }}>{label}</span>
      <span className="font-semibold" style={{ color: 'var(--terminal-text)' }}>{value}</span>
    </div>
  );
}
