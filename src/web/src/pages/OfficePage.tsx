import { useState, useEffect, useRef } from 'react';
import { api } from '../api/client';
import type { Role, RoleDetail, Project, Standup, Wave, Decision, Session, Message, StreamEvent, CreateRoleInput, ImportJob } from '../types';
import SidePanel from '../components/office/SidePanel';
import OperationsPanel from '../components/office/OperationsPanel';
import ProjectPanel from '../components/office/ProjectPanel';
import AssignTaskModal from '../components/office/AssignTaskModal';
import ActivityPanel from '../components/office/ActivityPanel';
import WaveModal from '../components/office/WaveModal';
import HireRoleModal from '../components/office/HireRoleModal';
import FireRoleModal from '../components/office/FireRoleModal';
import TerminalPanel from '../components/terminal/TerminalPanel';
import useSessionStream from '../hooks/useSessionStream';
import SpriteCanvas from '../components/office/SpriteCanvas';
import FacilityCanvas from '../components/office/FacilityCanvas';
import IsometricOfficeView from '../components/office/IsometricOfficeView';

/* ─── Role metadata ─────────────────────── */

const ROLE_ICONS: Record<string, string> = {
  cto: '\u{1F3D7}\u{FE0F}', cbo: '\u{1F4CA}', pm: '\u{1F4CB}',
  engineer: '\u{2699}\u{FE0F}', designer: '\u{1F3A8}', qa: '\u{1F50D}',
};
const ROLE_COLORS: Record<string, string> = {
  cto: '#1565C0', cbo: '#E65100', pm: '#2E7D32',
  engineer: '#4A148C', designer: '#AD1457', qa: '#00695C',
};
const ROLE_FLOAT: Record<string, string> = {
  cto: '\u{1F4A1}', cbo: '\u{1F4CA}', pm: '\u{1F4CB}',
  engineer: '\u{2699}\u{FE0F}', designer: '\u{1F3A8}', qa: '\u2615',
};
const ROLE_STATS: Record<string, { stats: { label: string; pct: number }[] }> = {
  cto: { stats: [{ label: 'COD', pct: 92 }, { label: 'ARC', pct: 88 }] },
  cbo: { stats: [{ label: 'BIZ', pct: 88 }, { label: 'MKT', pct: 82 }] },
  pm: { stats: [{ label: 'PLN', pct: 90 }, { label: 'COM', pct: 82 }] },
  engineer: { stats: [{ label: 'COD', pct: 80 }, { label: 'DBG', pct: 70 }] },
  designer: { stats: [{ label: 'DES', pct: 85 }, { label: 'UX', pct: 78 }] },
  qa: { stats: [{ label: 'TST', pct: 72 }, { label: 'AUT', pct: 60 }] },
};
const ROLE_LEVELS: Record<string, number> = {
  cto: 8, cbo: 7, pm: 6, engineer: 5, designer: 5, qa: 4,
};
const DESK_ACTIVITY: Record<string, string> = {
  cto: '\uC544\uD0A4\uD14D\uCC98', cbo: '\uC2DC\uC7A5 \uBD84\uC11D',
  pm: 'PRD \uC791\uC131', engineer: '\uCF54\uB529', designer: '\uC2DC\uC548 \uC81C\uC791',
  qa: '\uD488\uC9C8 \uAC80\uC99D',
};

/* ─── Helpers ─────────────────────────────── */

function hashColor(id: string): string {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = id.charCodeAt(i) + ((h << 5) - h);
  const hue = ((h % 360) + 360) % 360;
  return `hsl(${hue}, 50%, 40%)`;
}

/* ─── Types ──────────────────────────────── */

type PanelState =
  | { type: 'none' }
  | { type: 'role'; roleId: string }
  | { type: 'project'; projectId: string }
  | { type: 'bulletin' }
  | { type: 'decisions' };

/* ─── Page ───────────────────────────────── */

export default function OfficePage({ importJob, onImportDone }: { importJob?: ImportJob | null; onImportDone?: () => void }) {
  const [roles, setRoles] = useState<Role[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [standups, setStandups] = useState<Standup[]>([]);
  const [waves, setWaves] = useState<Wave[]>([]);
  const [decisions, setDecisions] = useState<Decision[]>([]);
  const [companyName, setCompanyName] = useState('THE COMPANY INC');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [panel, setPanel] = useState<PanelState>({ type: 'none' });
  const [selectedRole, setSelectedRole] = useState<RoleDetail | null>(null);

  /* Phase 2: Execution state — now job-based */
  const [assignModal, setAssignModal] = useState<{ roleId: string; roleName: string; mode: 'assign' | 'ask' } | null>(null);
  const [jobStack, setJobStack] = useState<Array<{ jobId: string; title: string; color: string }>>([]);
  const [showWaveModal, setShowWaveModal] = useState(false);
  const [showHireModal, setShowHireModal] = useState(false);
  const [fireTarget, setFireTarget] = useState<{ roleId: string; roleName: string } | null>(null);

  /* Phase 3: Live status */
  const [roleStatuses, setRoleStatuses] = useState<Record<string, string>>({});
  const [activeExecs, setActiveExecs] = useState<{ roleId: string; task: string }[]>([]);
  const [toasts, setToasts] = useState<{ id: number; message: string; color: string }[]>([]);

  /* Knowledge import state */
  interface ImportLogEntry {
    id: number;
    type: 'scan' | 'process' | 'created' | 'done' | 'error';
    text: string;
    detail?: string;
  }
  const [importProgress, setImportProgress] = useState<{ index: number; total: number } | null>(null);
  const [importBanner, setImportBanner] = useState<string | null>(null);
  const [importLogs, setImportLogs] = useState<ImportLogEntry[]>([]);
  const [importPanelOpen, setImportPanelOpen] = useState(false);
  const importStarted = useRef(false);
  const importLogEnd = useRef<HTMLDivElement>(null);
  let logId = useRef(0);

  const addImportLog = (type: ImportLogEntry['type'], text: string, detail?: string) => {
    const entry: ImportLogEntry = { id: logId.current++, type, text, detail };
    setImportLogs(prev => [...prev, entry]);
  };

  // Auto-scroll import log
  useEffect(() => {
    if (importPanelOpen) importLogEnd.current?.scrollIntoView({ behavior: 'smooth' });
  }, [importLogs, importPanelOpen]);

  /* Knowledge import SSE */
  useEffect(() => {
    if (!importJob || importStarted.current) return;
    importStarted.current = true;

    setImportBanner('Scanning knowledge sources...');
    addImportLog('scan', 'Starting knowledge import...');

    const controller = new AbortController();

    fetch('/api/setup/import-knowledge', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ paths: importJob.paths, companyRoot: importJob.companyRoot }),
      signal: controller.signal,
    }).then(async (res) => {
      const reader = res.body?.getReader();
      if (!reader) return;

      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });

        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        let eventName = '';
        for (const line of lines) {
          if (line.startsWith('event: ')) {
            eventName = line.slice(7).trim();
          } else if (line.startsWith('data: ') && eventName) {
            try {
              const data = JSON.parse(line.slice(6));
              switch (eventName) {
                case 'scanning':
                  setImportBanner(`Scanning: ${data.path} (${data.fileCount} files)`);
                  addImportLog('scan', `Found ${data.fileCount} files`, data.path);
                  break;
                case 'processing':
                  setImportProgress({ index: data.index, total: data.total });
                  setImportBanner(`Importing knowledge... (${data.index}/${data.total})`);
                  addImportLog('process', `Processing: ${data.file}`, `${data.index} / ${data.total}`);
                  break;
                case 'created':
                  addImportLog('created', data.title, data.summary);
                  break;
                case 'skipped':
                  addImportLog('process', `Skipped: ${data.file}`, data.reason);
                  break;
                case 'done':
                  setImportBanner(null);
                  setImportProgress(null);
                  addImportLog('done', `Import complete! ${data.created} created, ${data.skipped} skipped.`);
                  addToast(`Knowledge import complete! ${data.created} documents imported.`, '#2E7D32');
                  onImportDone?.();
                  break;
                case 'error':
                  setImportBanner(null);
                  setImportProgress(null);
                  addImportLog('error', data.message);
                  addToast(`Import failed: ${data.message}`, '#B71C1C');
                  onImportDone?.();
                  break;
              }
            } catch { /* ignore parse errors */ }
            eventName = '';
          }
        }
      }
    }).catch((err) => {
      if (err.name !== 'AbortError') {
        setImportBanner(null);
        addImportLog('error', err.message);
        addToast(`Import error: ${err.message}`, '#B71C1C');
        onImportDone?.();
      }
    });

    return () => controller.abort();
  }, [importJob]);

  /* View mode: card grid vs isometric */
  const [viewMode, setViewMode] = useState<'card' | 'iso'>('card');

  /* Window width for mobile responsive */
  const [windowWidth, setWindowWidth] = useState(typeof window !== 'undefined' ? window.innerWidth : 1200);
  useEffect(() => {
    const onResize = () => setWindowWidth(window.innerWidth);
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);
  const isMobile = windowWidth < 1024;

  /* Terminal state */
  const [terminalOpen, setTerminalOpen] = useState(false);
  const [terminalWidth, setTerminalWidth] = useState(560);
  const [sessions, setSessions] = useState<Session[]>([]);
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);
  const [streamingSessionId, setStreamingSessionId] = useState<string | null>(null);
  const { sendMessage: streamSend } = useSessionStream();

  /* Fetch all data on mount */
  useEffect(() => {
    Promise.all([
      api.getCompany().then((c) => { setCompanyName(c.name); setRoles(c.roles); }),
      api.getProjects().then(setProjects),
      api.getStandups().then(setStandups),
      api.getWaves().then(setWaves),
      api.getDecisions().then(setDecisions),
    ])
      .catch((err) => setError(`Failed to load: ${err.message}`))
      .finally(() => setLoading(false));
  }, []);

  /* Load sessions on mount */
  useEffect(() => {
    api.getSessions().then((metas) => {
      if (metas.length > 0) {
        Promise.all(metas.map((m) => api.getSession(m.id))).then((full) => {
          setSessions(full);
          setActiveSessionId(full[0].id);
          setTerminalOpen(true);
        }).catch((err) => {
          console.error('Failed to load session details', err);
        });
      }
    }).catch((err) => {
      console.error('Failed to load sessions', err);
    });
  }, []);

  /* Phase 3: Poll execution status every 3s */
  useEffect(() => {
    const poll = () => {
      fetch('/api/exec/status')
        .then((r) => r.json())
        .then((data) => {
          setRoleStatuses(data.statuses ?? {});
          setActiveExecs(data.activeExecutions ?? []);
        })
        .catch(() => {});
    };
    poll();
    const interval = setInterval(poll, 3000);
    return () => clearInterval(interval);
  }, []);

  /* Load role detail when panel opens */
  useEffect(() => {
    if (panel.type === 'role') {
      api.getRole(panel.roleId).then(setSelectedRole).catch(console.error);
    } else {
      setSelectedRole(null);
    }
  }, [panel]);

  const closePanel = () => setPanel({ type: 'none' });

  /* Phase 2 handlers */
  const handleAssignTask = (roleId: string, roleName: string) => {
    setAssignModal({ roleId, roleName, mode: 'assign' });
  };

  const handleAskRole = (roleId: string, roleName: string) => {
    setAssignModal({ roleId, roleName, mode: 'ask' });
  };

  const handleExecutionStart = async (roleId: string, task: string) => {
    const role = roles.find((r) => r.id === roleId);
    const isAsk = assignModal?.mode === 'ask';
    setAssignModal(null);

    try {
      const { jobId } = await api.startJob({ type: 'assign', roleId, task, readOnly: isAsk });
      const color = ROLE_COLORS[roleId] ?? '#666';
      const title = `${roleId.toUpperCase()} · ${role?.name ?? roleId}`;
      setJobStack([{ jobId, title, color }]);
    } catch (err) {
      addToast(`Failed to start job: ${err instanceof Error ? err.message : 'unknown'}`, '#C62828');
    }
  };

  const addToast = (message: string, color: string) => {
    const id = Date.now();
    setToasts((prev) => [...prev, { id, message, color }]);
    setTimeout(() => setToasts((prev) => prev.filter((t) => t.id !== id)), 4000);
  };

  const handleExecutionDone = () => {
    const current = jobStack[jobStack.length - 1];
    if (current) {
      addToast(`${current.title} completed`, current.color);
    }
    api.getStandups().then(setStandups).catch(console.error);
    api.getCompany().then((c) => setRoles(c.roles)).catch(console.error);
  };

  const handleWaveDispatch = async (directive: string) => {
    setShowWaveModal(false);
    try {
      const { jobId } = await api.startJob({ type: 'wave', directive });
      setJobStack([{ jobId, title: 'CEO WAVE', color: '#B71C1C' }]);
    } catch (err) {
      addToast(`Failed to start wave: ${err instanceof Error ? err.message : 'unknown'}`, '#C62828');
    }
  };

  const handleJobDone = () => {
    api.getWaves().then(setWaves).catch(console.error);
    api.getStandups().then(setStandups).catch(console.error);
  };

  /* Hire/Fire handlers */
  const refreshRoles = () => {
    api.getCompany().then((c) => setRoles(c.roles)).catch(console.error);
  };

  const handleHireRole = async (input: CreateRoleInput) => {
    await api.createRole(input);
    refreshRoles();
    addToast(`${input.name} hired!`, '#2E7D32');
  };

  const handleFireRole = async (roleId: string) => {
    await api.deleteRole(roleId);
    refreshRoles();
    setFireTarget(null);
    addToast(`${roleId.toUpperCase()} removed`, '#B71C1C');
  };

  /* Terminal handlers */
  const handleOpenTerminal = (roleId?: string) => {
    setTerminalOpen(true);
    if (roleId) {
      handleCreateSession(roleId);
    }
  };

  const handleCreateSession = async (roleId: string) => {
    try {
      const session = await api.createSession(roleId, 'talk');
      setSessions((prev) => [session, ...prev]);
      setActiveSessionId(session.id);
      setTerminalOpen(true);
    } catch (err) {
      console.error('Failed to create session', err);
      addToast(`Failed to create session: ${err instanceof Error ? err.message : 'API unreachable'}`, '#B71C1C');
    }
  };

  const handleCloseSession = async (sessionId: string) => {
    try {
      await api.deleteSession(sessionId);
      setSessions((prev) => {
        const remaining = prev.filter((s) => s.id !== sessionId);
        if (activeSessionId === sessionId) {
          setActiveSessionId(remaining[0]?.id ?? null);
        }
        return remaining;
      });
    } catch (err) {
      console.error('Failed to delete session', err);
      setSessions((prev) => {
        const remaining = prev.filter((s) => s.id !== sessionId);
        if (activeSessionId === sessionId) {
          setActiveSessionId(remaining[0]?.id ?? null);
        }
        return remaining;
      });
    }
  };

  const pushStreamEvent = (sessionId: string, event: StreamEvent) => {
    setSessions((prev) => prev.map((s) => {
      if (s.id !== sessionId) return s;
      const msgs = [...s.messages];
      const lastMsg = msgs[msgs.length - 1];
      if (lastMsg && lastMsg.from === 'role' && lastMsg.status === 'streaming') {
        const events = [...(lastMsg.streamEvents ?? []), event];
        msgs[msgs.length - 1] = { ...lastMsg, streamEvents: events };
      }
      return { ...s, messages: msgs };
    }));
  };

  const handleSendMessage = (sessionId: string, content: string, mode: 'talk' | 'do') => {
    const ceoMsg: Message = {
      id: `msg-${Date.now()}-ceo`,
      from: 'ceo',
      content,
      type: mode === 'do' ? 'directive' : 'conversation',
      status: 'done',
      timestamp: new Date().toISOString(),
    };
    const roleMsg: Message = {
      id: `msg-${Date.now() + 1}-role`,
      from: 'role',
      content: '',
      type: 'conversation',
      status: 'streaming',
      timestamp: new Date().toISOString(),
      streamEvents: [],
    };

    setSessions((prev) => prev.map((s) =>
      s.id === sessionId
        ? { ...s, messages: [...s.messages, ceoMsg, roleMsg], updatedAt: new Date().toISOString() }
        : s,
    ));

    setStreamingSessionId(sessionId);

    streamSend(sessionId, content, mode, {
      onThinking: (text) => {
        setSessions((prev) => prev.map((s) => {
          if (s.id !== sessionId) return s;
          const msgs = [...s.messages];
          const lastMsg = msgs[msgs.length - 1];
          if (lastMsg && lastMsg.from === 'role' && lastMsg.status === 'streaming') {
            msgs[msgs.length - 1] = { ...lastMsg, thinking: (lastMsg.thinking ?? '') + text };
          }
          return { ...s, messages: msgs };
        }));
        pushStreamEvent(sessionId, { type: 'thinking', timestamp: Date.now(), text });
      },
      onText: (text) => {
        setSessions((prev) => prev.map((s) => {
          if (s.id !== sessionId) return s;
          const msgs = [...s.messages];
          const lastMsg = msgs[msgs.length - 1];
          if (lastMsg && lastMsg.from === 'role' && lastMsg.status === 'streaming') {
            msgs[msgs.length - 1] = { ...lastMsg, content: lastMsg.content + text };
          }
          return { ...s, messages: msgs };
        }));
      },
      onToolUse: (name, input) => {
        pushStreamEvent(sessionId, { type: 'tool', timestamp: Date.now(), toolName: name, toolInput: input });
      },
      onDispatch: (roleId, task) => {
        pushStreamEvent(sessionId, { type: 'dispatch', timestamp: Date.now(), roleId, task });
      },
      onTurn: (turn) => {
        pushStreamEvent(sessionId, { type: 'turn', timestamp: Date.now(), turn });
      },
      onDone: () => {
        setSessions((prev) => prev.map((s) => {
          if (s.id !== sessionId) return s;
          const msgs = s.messages.map((m) =>
            m.status === 'streaming' ? { ...m, status: 'done' as const } : m,
          );
          const title = s.messages.length <= 2 ? content.slice(0, 40).replace(/\n/g, ' ') : s.title;
          return { ...s, messages: msgs, title };
        }));
        setStreamingSessionId(null);
      },
      onError: (message) => {
        setSessions((prev) => prev.map((s) => {
          if (s.id !== sessionId) return s;
          const msgs = s.messages.map((m) =>
            m.status === 'streaming' ? { ...m, status: 'error' as const, content: m.content || message } : m,
          );
          return { ...s, messages: msgs };
        }));
        setStreamingSessionId(null);
      },
    });
  };

  const handleModeChange = (sessionId: string, mode: 'talk' | 'do') => {
    setSessions((prev) => prev.map((s) =>
      s.id === sessionId ? { ...s, mode } : s,
    ));
    api.updateSession(sessionId, { mode }).catch(console.error);
  };

  const today = new Date().toISOString().slice(0, 10);
  const mainProject = projects[0];

  /* Find recent speech for a role from standups */
  const getRoleSpeech = (roleId: string): string => {
    const ROLE_SECTION: Record<string, string> = {
      cto: 'Chief Technology Officer',
      cbo: 'Chief Business Officer',
      pm: 'Product Manager',
      engineer: 'Software Engineer',
      designer: 'UI/UX Designer',
      qa: 'QA Engineer',
    };
    const sectionName = ROLE_SECTION[roleId];
    if (!sectionName) return '';

    for (const s of standups) {
      const content = s.content;
      const sectionStart = content.indexOf(`## ${sectionName}`);
      if (sectionStart === -1) continue;

      const nextSection = content.indexOf('\n## ', sectionStart + 10);
      const section = nextSection === -1
        ? content.slice(sectionStart)
        : content.slice(sectionStart, nextSection);

      const lines = section.split('\n').filter((l) => l.trim().length > 0);
      for (const line of lines) {
        const trimmed = line.replace(/^#+\s*/, '').replace(/\*\*/g, '').replace(/^[-*]\s+/, '').trim();
        if (trimmed.startsWith('|') || trimmed.startsWith('{') || trimmed.startsWith('[')
          || trimmed.startsWith('```') || trimmed.startsWith('---')
          || trimmed.includes('Journal') || trimmed.includes('(c-level)')
          || trimmed.includes('(team-lead)') || trimmed.includes('(member)')
          || /^(CEO |작업 결과|생성\/수정|APPROVAL|비고|상황 보고|태스크$)/.test(trimmed)) continue;
        if (trimmed.length > 15 && trimmed.length < 120) {
          return trimmed.slice(0, 80);
        }
      }
    }
    return '';
  };

  if (loading) {
    return (
      <div className="h-screen flex items-center justify-center bg-[var(--floor-light)]">
        <div className="text-center" style={{ fontFamily: 'var(--pixel-font)' }}>
          <div className="text-4xl mb-3">{'\u{1F3E2}'}</div>
          <div className="text-gray-600 font-semibold text-xs">LOADING OFFICE...</div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="h-screen flex items-center justify-center bg-[var(--floor-light)]">
        <div className="text-center max-w-md" style={{ fontFamily: 'var(--pixel-font)' }}>
          <div className="text-4xl mb-3">{'\u{26A0}\u{FE0F}'}</div>
          <div className="text-gray-800 font-semibold mb-2 text-xs">CONNECTION ERROR</div>
          <div className="text-gray-500 text-xs mb-4">{error}</div>
          <button
            onClick={() => window.location.reload()}
            className="px-4 py-2 bg-gray-800 text-white text-xs font-bold cursor-pointer border-2 border-gray-600"
            style={{ fontFamily: 'var(--pixel-font)' }}
          >
            RETRY
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col" style={{ height: '100dvh', fontFamily: 'var(--pixel-font)' }}>
      {/* ─── HUD (Top Bar) ─── */}
      <div
        className="flex items-center justify-between px-5 py-2 bg-[var(--hud-bg)] text-white text-sm shrink-0 z-[45]"
        style={{ borderBottom: '3px solid var(--pixel-border)' }}
      >
        <div className="font-black text-[13px] tracking-tight" style={{ color: 'var(--idle-amber)', textShadow: '2px 2px 0 rgba(0,0,0,0.5)' }}>
          {'\u{1F3E2}'} <span style={{ color: 'var(--terminal-text)' }}>{companyName}</span>
        </div>
        <div className="flex gap-4 text-[var(--terminal-text-secondary)] text-[11px] items-center">
          {/* Resource bars — hidden on narrow screens */}
          <div className="hidden md:flex items-center gap-1">
            {'\u{1F4B0}'}
            <div className="w-[50px] h-2 bg-[#111] overflow-hidden" style={{ border: '2px solid var(--pixel-border)' }}>
              <div className="h-full" style={{ width: '72%', background: 'linear-gradient(90deg,#22c55e,#34D399)' }} />
            </div>
            <strong className="text-[var(--active-green)]">$72K</strong>
          </div>
          <div className="hidden md:flex items-center gap-1">
            {'\u26A1'}
            <div className="w-[50px] h-2 bg-[#111] overflow-hidden" style={{ border: '2px solid var(--pixel-border)' }}>
              <div className="h-full" style={{ width: '85%', background: 'linear-gradient(90deg,#3b82f6,#60A5FA)' }} />
            </div>
            <strong className="text-[var(--terminal-text)]">85</strong>
          </div>
          <span className="hidden sm:inline">Roles: <strong className="text-[var(--terminal-text)]">{roles.length}</strong></span>
          <span className="hidden sm:inline">Projects: <strong className="text-[var(--terminal-text)]">{projects.length}</strong></span>
          {activeExecs.length > 0 && (
            <span className="text-amber-400">
              Working: <strong>{activeExecs.length}</strong>
            </span>
          )}
          <span>{today}</span>
        </div>
      </div>

      {/* ─── Knowledge Import Banner + Log Panel ─── */}
      {(importBanner || importLogs.length > 0) && (
        <div className="shrink-0 z-[44]">
          {/* Banner bar — clickable */}
          <div
            className="flex items-center gap-3 px-5 py-2 text-xs cursor-pointer select-none"
            style={{ background: 'var(--accent)', color: '#fff', fontFamily: 'var(--pixel-font)' }}
            onClick={() => setImportPanelOpen(prev => !prev)}
          >
            {importBanner ? (
              <div className="w-3 h-3 border-2 border-white/40 border-t-white rounded-full animate-spin shrink-0" />
            ) : (
              <span className="shrink-0">{'\u2705'}</span>
            )}
            <span className="flex-1">{importBanner || 'Knowledge import finished'}</span>
            {importProgress && (
              <div className="w-24 h-1.5 rounded-full overflow-hidden shrink-0" style={{ background: 'rgba(255,255,255,0.3)' }}>
                <div
                  className="h-full rounded-full transition-all"
                  style={{ width: `${(importProgress.index / importProgress.total) * 100}%`, background: '#fff' }}
                />
              </div>
            )}
            <span className="text-[10px] opacity-70 shrink-0">{importPanelOpen ? '\u25B2' : '\u25BC'}</span>
          </div>

          {/* Expandable log panel */}
          {importPanelOpen && (
            <div
              className="overflow-y-auto text-xs"
              style={{
                background: 'var(--terminal-bg)',
                borderBottom: '2px solid var(--accent)',
                maxHeight: 240,
                fontFamily: 'var(--pixel-font)',
              }}
            >
              {importLogs.map(log => (
                <div
                  key={log.id}
                  className="flex items-start gap-2 px-5 py-1.5"
                  style={{ borderBottom: '1px solid var(--terminal-border)' }}
                >
                  <span className="shrink-0 mt-0.5" style={{ width: 14, textAlign: 'center' }}>
                    {log.type === 'scan' && '\uD83D\uDD0D'}
                    {log.type === 'process' && '\u2699\uFE0F'}
                    {log.type === 'created' && '\u2705'}
                    {log.type === 'done' && '\uD83C\uDF89'}
                    {log.type === 'error' && '\u274C'}
                  </span>
                  <div className="flex-1 min-w-0">
                    <div style={{ color: log.type === 'error' ? '#EF4444' : log.type === 'done' ? 'var(--active-green)' : 'var(--terminal-text)' }}>
                      {log.text}
                    </div>
                    {log.detail && (
                      <div className="text-[10px] truncate" style={{ color: 'var(--terminal-text-muted)' }}>
                        {log.detail}
                      </div>
                    )}
                  </div>
                </div>
              ))}
              <div ref={importLogEnd} />
              {importLogs.length === 0 && (
                <div className="px-5 py-4 text-center" style={{ color: 'var(--terminal-text-muted)' }}>
                  Waiting for events...
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* ─── Main content: Office Floor + Terminal ─── */}
      <div className="flex-1 overflow-hidden flex relative">
        {/* ─── Office Floor ─── */}
        <div className="flex-1 overflow-y-auto relative floor-grid" style={{
          background: `var(--floor-light)`,
        }}>
          {viewMode === 'iso' ? (
            <IsometricOfficeView
              roles={roles}
              projects={projects}
              waves={waves}
              standups={standups}
              decisions={decisions}
              roleStatuses={roleStatuses}
              activeExecs={activeExecs}
              onRoleClick={(id) => setPanel({ type: 'role', roleId: id })}
              onProjectClick={(id) => setPanel({ type: 'project', projectId: id })}
              onBulletinClick={() => setPanel({ type: 'bulletin' })}
              onDecisionsClick={() => setPanel({ type: 'decisions' })}
              getRoleSpeech={getRoleSpeech}
            />
          ) : (
          <div className={`${terminalOpen ? 'max-w-full' : 'max-w-[1100px]'} mx-auto h-full p-4 flex flex-col gap-3 relative z-[1]`}>
            {/* ── Section: TEAM ── */}
            <div className="pixel-section-label">TEAM</div>
            <div className={`grid gap-2 ${terminalOpen ? 'grid-cols-3' : 'grid-cols-3'}`}>
              {roles.map((role) => (
                <PixelCard
                  key={role.id}
                  role={role}
                  speech={getRoleSpeech(role.id)}
                  onClick={() => setPanel({ type: 'role', roleId: role.id })}
                  liveStatus={roleStatuses[role.id]}
                  activeTask={activeExecs.find((e) => e.roleId === role.id)?.task}
                />
              ))}
              {/* + HIRE card */}
              <div
                className="pixel-card cursor-pointer hover:opacity-80 transition-opacity"
                onClick={() => setShowHireModal(true)}
                style={{ borderStyle: 'dashed', borderColor: '#9E9E9E' }}
              >
                <div className="pixel-card-hdr" style={{ background: '#9E9E9E' }}>
                  <span>+ HIRE NEW ROLE</span>
                  <span className="lvl">---</span>
                </div>
                <div className="pixel-card-body flex items-center justify-center">
                  <div className="text-3xl text-gray-400">+</div>
                </div>
                <div className="pixel-card-stats" />
                <div className="pixel-card-task text-gray-400">Click to hire a new role</div>
              </div>
            </div>

            {/* ── Section: OFFICE ── */}
            <div className="pixel-section-label mt-1">OFFICE</div>
            <div className="grid grid-cols-3 gap-2">
              {/* Meeting Room */}
              {mainProject ? (
                <div
                  className="facility-card"
                  onClick={() => setPanel({ type: 'project', projectId: mainProject.id })}
                >
                  <div className="pixel-card-hdr" style={{ background: '#3B82F6' }}>
                    <span>MEETING ROOM</span>
                    <span className="lvl">&mdash;</span>
                  </div>
                  <div className="facility-card-body">
                    <div className="text-[10px] font-black uppercase tracking-wider" style={{ color: 'rgba(59,130,246,0.7)' }}>Meeting Room</div>
                    <div className="text-[9px]" style={{ color: '#60A5FA' }}>"{mainProject.name}"</div>
                    <FacilityCanvas type="meeting" />
                    <div className="text-[8px]" style={{ color: 'var(--terminal-text-secondary)' }}>
                      Status: <strong style={{ color: 'var(--active-green)' }}>{mainProject.status}</strong>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="facility-card" style={{ borderStyle: 'dashed', opacity: 0.5 }}>
                  <div className="pixel-card-hdr" style={{ background: '#3B82F6' }}>
                    <span>MEETING ROOM</span>
                    <span className="lvl">&mdash;</span>
                  </div>
                  <div className="facility-card-body">
                    <div className="text-[8px]" style={{ color: 'var(--terminal-text-secondary)' }}>No active projects</div>
                  </div>
                </div>
              )}

              {/* Bulletin Board */}
              <div
                className="facility-card"
                onClick={() => setPanel({ type: 'bulletin' })}
              >
                <div className="pixel-card-hdr" style={{ background: '#64748b' }}>
                  <span>{'\u{1F4CB}'} BULLETIN BOARD</span>
                  <span className="lvl">&mdash;</span>
                </div>
                <div style={{ background: 'var(--terminal-surface)', borderTop: '2px solid var(--pixel-border)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '4px 0' }}>
                  <FacilityCanvas type="bulletin" />
                </div>
                <div className="facility-board-body">
                  <div className="facility-board-title">Latest</div>
                  {waves.slice(0, 1).map((w) => (
                    <div key={w.id} className="facility-board-item">{'\u{1F4CC}'} Wave {w.id}</div>
                  ))}
                  {standups.slice(0, 2).map((s) => (
                    <div key={s.date} className="facility-board-item">{'\u{1F4CC}'} Standup {s.date}</div>
                  ))}
                  {waves.length === 0 && standups.length === 0 && (
                    <div className="facility-board-item" style={{ fontStyle: 'italic' }}>No entries yet</div>
                  )}
                </div>
              </div>

              {/* Decision Log */}
              <div
                className="facility-card"
                onClick={() => setPanel({ type: 'decisions' })}
              >
                <div className="pixel-card-hdr" style={{ background: '#64748b' }}>
                  <span>{'\u{1F4DC}'} DECISION LOG</span>
                  <span className="lvl">&mdash;</span>
                </div>
                <div style={{ background: 'var(--terminal-surface)', borderTop: '2px solid var(--pixel-border)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '4px 0' }}>
                  <FacilityCanvas type="decision" />
                </div>
                <div className="facility-board-body">
                  <div className="facility-board-title">CEO Decisions</div>
                  {decisions.slice(0, 4).map((d) => (
                    <div key={d.id} className="facility-board-item">{'\u{1F4CC}'} #{d.id} {d.title}</div>
                  ))}
                  {decisions.length === 0 && (
                    <div className="facility-board-item" style={{ fontStyle: 'italic' }}>No decisions yet</div>
                  )}
                </div>
              </div>
            </div>
          </div>
          )}
        </div>

        {/* ─── Terminal Panel ─── */}
        {terminalOpen && (
          <div className={isMobile ? 'absolute inset-0 z-50' : 'contents'}>
            <TerminalPanel
              sessions={sessions}
              activeSessionId={activeSessionId}
              roles={roles}
              streamingSessionId={streamingSessionId}
              width={isMobile ? windowWidth : terminalWidth}
              onWidthChange={isMobile ? undefined : setTerminalWidth}
              onSwitchSession={setActiveSessionId}
              onCloseSession={handleCloseSession}
              onCreateSession={handleCreateSession}
              onSendMessage={handleSendMessage}
              onModeChange={handleModeChange}
              onCloseTerminal={() => setTerminalOpen(false)}
            />
          </div>
        )}
      </div>

      {/* ─── Bottom Bar ─── */}
      <div
        className="flex items-center justify-between px-5 py-2 bg-[var(--hud-bg)] text-[var(--terminal-text-secondary)] text-[10px] shrink-0 z-[45]"
        style={{ borderTop: '3px solid var(--pixel-border)' }}
      >
        <div className="flex items-center gap-2">
          <button
            onClick={() => setViewMode('card')}
            className={`view-toggle-btn ${viewMode === 'card' ? 'active' : ''}`}
          >
            CARD
          </button>
          <button
            onClick={() => setViewMode('iso')}
            className={`view-toggle-btn ${viewMode === 'iso' ? 'active' : ''}`}
          >
            ISO
          </button>
          <span className="ml-1">Floor 1/1</span>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowWaveModal(true)}
            className="wave-btn px-3 py-1 font-black text-white cursor-pointer"
            style={{ background: '#B71C1C', border: '2px solid #7f1212', fontFamily: 'var(--pixel-font)' }}
          >
            {'\u{1F534}'} CEO WAVE
          </button>
          <button
            onClick={() => terminalOpen ? setTerminalOpen(false) : handleOpenTerminal()}
            className="px-3 py-1 font-black cursor-pointer"
            style={{
              background: terminalOpen ? 'var(--terminal-bg)' : 'var(--hud-bg-alt)',
              color: 'var(--terminal-text)',
              border: `2px solid ${terminalOpen ? 'var(--terminal-border-hover)' : 'var(--pixel-border)'}`,
              fontFamily: 'var(--pixel-font)',
            }}
          >
            TERMINAL
          </button>
        </div>
        <span>Expand: +{Math.max(0, 10 - roles.length)} desks available</span>
      </div>

      {/* ─── Side Panels ─── */}
      {panel.type === 'role' && selectedRole && (
        <SidePanel
          role={selectedRole}
          allRoles={roles}
          recentActivity={getRoleSpeech(selectedRole.id)}
          onClose={closePanel}
          onAssignTask={handleAssignTask}
          onAskRole={handleAskRole}
          onOpenTerminal={handleOpenTerminal}
          onFireRole={(id, name) => { setFireTarget({ roleId: id, roleName: name }); closePanel(); }}
          terminalWidth={terminalOpen ? terminalWidth : 0}
        />
      )}
      {panel.type === 'project' && mainProject && (
        <ProjectPanel projectId={mainProject.id} onClose={closePanel} terminalWidth={terminalOpen ? terminalWidth : 0} />
      )}
      {(panel.type === 'bulletin' || panel.type === 'decisions') && (
        <OperationsPanel
          standups={standups}
          waves={waves}
          decisions={decisions}
          mode={panel.type === 'bulletin' ? 'bulletin' : 'decisions'}
          onClose={closePanel}
          terminalWidth={terminalOpen ? terminalWidth : 0}
        />
      )}

      {/* Phase 2: Assign Task Modal */}
      {assignModal && (
        <AssignTaskModal
          roleId={assignModal.roleId}
          roleName={assignModal.roleName}
          mode={assignModal.mode}
          onClose={() => setAssignModal(null)}
          onExecutionStart={handleExecutionStart}
        />
      )}

      {/* Phase 2: Activity Panel (replaces ExecutionPanel + WaveExecutionPanel) */}
      {jobStack.length > 0 && (() => {
        const current = jobStack[jobStack.length - 1];
        return (
          <ActivityPanel
            key={current.jobId}
            jobId={current.jobId}
            title={jobStack.length > 1
              ? `${'< '.repeat(0)}${current.title}`
              : current.title
            }
            color={current.color}
            variant="modal"
            onClose={() => setJobStack([])}
            onDone={() => { handleExecutionDone(); handleJobDone(); }}
            onNavigateToJob={(childJobId) => {
              // Navigate deeper into dispatch chain
              api.getJob(childJobId).then((info) => {
                const childColor = ROLE_COLORS[info.roleId] ?? '#888';
                setJobStack((prev) => [...prev, {
                  jobId: childJobId,
                  title: `${info.roleId.toUpperCase()} · ${info.task.slice(0, 40)}`,
                  color: childColor,
                }]);
              }).catch(console.error);
            }}
          />
        );
      })()}

      {/* Back button overlay for drill-down navigation */}
      {jobStack.length > 1 && (
        <div className="fixed top-[5%] left-1/2 -translate-x-1/2 w-[720px] max-w-[95vw] z-[62] pointer-events-none">
          <div className="pointer-events-auto">
            <button
              onClick={() => setJobStack((prev) => prev.slice(0, -1))}
              className="mt-2 ml-2 px-3 py-1 text-xs font-bold text-[var(--terminal-text)] bg-[var(--terminal-bg)] border border-[var(--terminal-border)] rounded-lg cursor-pointer hover:bg-[var(--terminal-inline-bg)]"
            >
              {'\u2190'} Back to {jobStack[jobStack.length - 2]?.title}
            </button>
          </div>
        </div>
      )}

      {/* Phase 2: Wave Modal */}
      {showWaveModal && (
        <WaveModal
          onClose={() => setShowWaveModal(false)}
          onDispatch={handleWaveDispatch}
        />
      )}

      {/* Hire Role Modal */}
      {showHireModal && (
        <HireRoleModal
          existingRoles={roles}
          onClose={() => setShowHireModal(false)}
          onHire={handleHireRole}
        />
      )}

      {/* Fire Role Modal */}
      {fireTarget && (
        <FireRoleModal
          roleId={fireTarget.roleId}
          roleName={fireTarget.roleName}
          onClose={() => setFireTarget(null)}
          onConfirm={handleFireRole}
        />
      )}

      {/* Phase 3: Toast Notifications */}
      <div className="fixed top-16 right-4 z-[70] flex flex-col gap-2">
        {toasts.map((toast) => (
          <div
            key={toast.id}
            className="toast-enter flex items-center gap-2 px-4 py-2.5 shadow-lg text-white text-xs font-black"
            style={{ background: toast.color, border: '2px solid rgba(0,0,0,0.3)', fontFamily: 'var(--pixel-font)' }}
          >
            <div className="w-2 h-2 bg-white/60" />
            {toast.message}
          </div>
        ))}
      </div>
    </div>
  );
}

/* ─── Pixel Card Component (Team) ─────────── */

function PixelCard({ role, speech, onClick, liveStatus, activeTask }: {
  role: Role; speech: string; onClick: () => void;
  liveStatus?: string; activeTask?: string;
}) {
  const color = ROLE_COLORS[role.id] ?? hashColor(role.id);
  const floatIcon = ROLE_FLOAT[role.id] ?? '';
  const stats = ROLE_STATS[role.id]?.stats ?? [{ label: 'SKL', pct: 50 }];
  const level = ROLE_LEVELS[role.id] ?? 1;
  const activity = DESK_ACTIVITY[role.id] ?? role.name;
  const isWorking = liveStatus === 'working';

  const taskText = isWorking && activeTask
    ? activeTask.slice(0, 60)
    : speech
      ? speech.slice(0, 60)
      : activity;

  return (
    <div
      className={`pixel-card ${isWorking ? 'working' : ''}`}
      onClick={onClick}
    >
      {/* Header */}
      <div className="pixel-card-hdr" style={{ background: color }}>
        <span>{role.id.toUpperCase()} {'\u00B7'} {role.name.toUpperCase()}</span>
        <span className="lvl">Lv.{level}</span>
      </div>

      {/* Sprite area */}
      <div className="pixel-card-body">
        <div className="pixel-desk" />
        <SpriteCanvas roleId={role.id} />
        {floatIcon && <div className="pixel-float-icon">{floatIcon}</div>}
        {/* Status dot */}
        <div
          className="absolute bottom-2 left-2 w-[7px] h-[7px]"
          style={{
            background: isWorking ? 'var(--idle-amber)' : 'var(--active-green)',
            border: '2px solid white',
          }}
        />
      </div>

      {/* Stat bars */}
      <div className="pixel-card-stats">
        {stats.map((s) => (
          <div key={s.label} className="stat-row">
            <span className="stat-label">{s.label}</span>
            <div className="stat-bar-wrap">
              <div
                className="stat-bar-fill"
                style={{
                  width: `${s.pct}%`,
                  background: s.pct >= 80 ? 'var(--active-green)' : 'var(--monitor-glow)',
                }}
              />
            </div>
          </div>
        ))}
      </div>

      {/* Task line */}
      <div className="pixel-card-task">
        {isWorking ? '\u{1F6E0}\u{FE0F}' : ROLE_ICONS[role.id] ?? ''} {taskText || activity}
      </div>
    </div>
  );
}
