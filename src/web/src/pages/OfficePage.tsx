import { useState, useEffect, useRef } from 'react';
import { api } from '../api/client';
import type { Role, RoleDetail, Project, Standup, Wave, Decision, Session, Message, StreamEvent, CreateRoleInput, ImportJob, KnowledgeDoc } from '../types';
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
import { useCustomization } from '../hooks/useCustomization';
import SpriteCanvas from '../components/office/SpriteCanvas';
import FacilityCanvas from '../components/office/FacilityCanvas';
import IsometricOfficeView from '../components/office/IsometricOfficeView';
import KnowledgePanel from '../components/office/KnowledgePanel';
import CustomizeModal from '../components/office/CustomizeModal';
import { OFFICE_THEMES } from '../types/appearance';

/* ─── Role metadata ─────────────────────── */

const ROLE_ICONS: Record<string, string> = {
  cto: '\u{1F3D7}\u{FE0F}', cbo: '\u{1F4CA}', pm: '\u{1F4CB}',
  engineer: '\u{2699}\u{FE0F}', designer: '\u{1F3A8}', qa: '\u{1F50D}',
};
const ROLE_COLORS: Record<string, string> = {
  cto: '#1565C0', cbo: '#E65100', pm: '#2E7D32',
  engineer: '#4A148C', designer: '#AD1457', qa: '#00695C',
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
  | { type: 'decisions' }
  | { type: 'knowledge'; docId?: string };

/* ─── Page ───────────────────────────────── */

export default function OfficePage({ importJob, onImportDone }: { importJob?: ImportJob | null; onImportDone?: () => void }) {
  const [roles, setRoles] = useState<Role[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [standups, setStandups] = useState<Standup[]>([]);
  const [waves, setWaves] = useState<Wave[]>([]);
  const [decisions, setDecisions] = useState<Decision[]>([]);
  const [knowledgeDocs, setKnowledgeDocs] = useState<KnowledgeDoc[]>([]);
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
  const [activeExecs, setActiveExecs] = useState<{ roleId: string; task: string; id?: string; jobId?: string; startedAt?: string }[]>([]);
  const [toasts, setToasts] = useState<{ id: number; message: string; color: string }[]>([]);

  /* Customization */
  const { getAppearance, setAppearance, resetAppearance, theme, setTheme } = useCustomization();
  const [customizeTarget, setCustomizeTarget] = useState<Role | null>(null);

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

  /* Knowledge import SSE — fire-and-forget, no abort on unmount */
  useEffect(() => {
    if (!importJob) return;
    if (importStarted.current) return;
    importStarted.current = true;

    setImportBanner('Scanning knowledge sources...');
    setImportLogs([{ id: 0, type: 'scan', text: 'Starting knowledge import...' }]);
    logId.current = 1;

    fetch('/api/setup/import-knowledge', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ paths: importJob.paths, companyRoot: importJob.companyRoot }),
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
      setImportBanner(null);
      addImportLog('error', err.message);
      addToast(`Import error: ${err.message}`, '#B71C1C');
      onImportDone?.();
    });

    // No cleanup abort — import runs in background on server
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
      api.getKnowledge().then(setKnowledgeDocs).catch(() => {}),
    ])
      .catch((err) => setError(`Failed to load: ${err.message}`))
      .finally(() => setLoading(false));
  }, []);

  /* Load sessions on mount — auto-clean empty sessions */
  useEffect(() => {
    api.deleteEmptySessions().catch(() => {});
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

  // Silent version: creates session without opening terminal (used by SidePanel inline input)
  const handleCreateSessionSilent = async (roleId: string) => {
    try {
      const session = await api.createSession(roleId, 'talk');
      setSessions((prev) => [session, ...prev]);
      setActiveSessionId(session.id);
    } catch (err) {
      console.error('Failed to create session', err);
      addToast(`Failed to create session: ${err instanceof Error ? err.message : 'API unreachable'}`, '#B71C1C');
    }
  };

  // Focus terminal on a specific role's session (open terminal + switch to session)
  const handleFocusTerminal = (roleId: string) => {
    const session = sessions.find(s => s.roleId === roleId);
    if (session) {
      setActiveSessionId(session.id);
    }
    setTerminalOpen(true);
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
      addToast(`Failed to close session: ${err instanceof Error ? err.message : 'API error'}`, '#B71C1C');
    }
  };

  const handleClearEmptySessions = async () => {
    try {
      const { ids } = await api.deleteEmptySessions();
      if (ids.length === 0) return;
      setSessions((prev) => {
        const remaining = prev.filter((s) => !ids.includes(s.id));
        if (activeSessionId && ids.includes(activeSessionId)) {
          setActiveSessionId(remaining[0]?.id ?? null);
        }
        return remaining;
      });
      addToast(`Cleared ${ids.length} empty session${ids.length !== 1 ? 's' : ''}`, '#2E7D32');
    } catch (err) {
      addToast(`Failed to clear empty sessions: ${err instanceof Error ? err.message : 'API error'}`, '#B71C1C');
    }
  };

  const handleCloseAllSessions = async () => {
    if (!confirm('Close all sessions? This cannot be undone.')) return;
    const ids = sessions.map((s) => s.id);
    try {
      await api.deleteSessions(ids);
      setSessions([]);
      setActiveSessionId(null);
      addToast('All sessions closed', '#2E7D32');
    } catch (err) {
      addToast(`Failed to close sessions: ${err instanceof Error ? err.message : 'API error'}`, '#B71C1C');
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
      onDispatchProgress: (roleId, progressType, data) => {
        if (progressType === 'tool') {
          pushStreamEvent(sessionId, {
            type: 'dispatch:progress',
            timestamp: Date.now(),
            roleId,
            progressType: 'tool',
            toolName: data.name as string,
            toolInput: data.input as Record<string, unknown>,
          });
        } else if (progressType === 'thinking') {
          pushStreamEvent(sessionId, {
            type: 'dispatch:progress',
            timestamp: Date.now(),
            roleId,
            progressType: 'thinking',
            text: data.text as string,
          });
        } else if (progressType === 'text') {
          pushStreamEvent(sessionId, {
            type: 'dispatch:progress',
            timestamp: Date.now(),
            roleId,
            progressType: 'text',
            text: (data.text as string)?.slice(-200),
          });
        } else if (progressType === 'done' || progressType === 'error') {
          pushStreamEvent(sessionId, {
            type: 'dispatch:progress',
            timestamp: Date.now(),
            roleId,
            progressType,
          });
        }
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
  const ROLE_SECTION: Record<string, string> = {
    cto: 'Chief Technology Officer',
    cbo: 'Chief Business Officer',
    pm: 'Product Manager',
    engineer: 'Software Engineer',
    designer: 'UI/UX Designer',
    qa: 'QA Engineer',
  };

  /** Short one-liner for desk sprite speech */
  const getRoleSpeech = (roleId: string): string => {
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

  /** Full standup section for SidePanel speech bubble */
  const getRoleSpeechFull = (roleId: string): string => {
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

      // Strip the ## heading line itself, return the body
      const body = section.replace(/^## .+\n/, '').trim();
      if (body) return body.slice(0, 1500);
    }
    return '';
  };

  if (loading) {
    return (
      <div className="h-screen flex flex-col bg-[var(--floor-light)]" style={{ fontFamily: 'var(--pixel-font)' }}>
        {/* Import banner even during loading */}
        {(importBanner || importLogs.length > 0) && (
          <div className="shrink-0 z-[44]">
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
                  <div className="h-full rounded-full transition-all" style={{ width: `${(importProgress.index / importProgress.total) * 100}%`, background: '#fff' }} />
                </div>
              )}
              <span className="text-[10px] opacity-70 shrink-0">{importPanelOpen ? '\u25B2' : '\u25BC'}</span>
            </div>
            {importPanelOpen && (
              <div className="overflow-y-auto text-xs" style={{ background: 'var(--terminal-bg)', borderBottom: '2px solid var(--accent)', maxHeight: 240, fontFamily: 'var(--pixel-font)' }}>
                {importLogs.map(log => (
                  <div key={log.id} className="flex items-start gap-2 px-5 py-1.5" style={{ borderBottom: '1px solid var(--terminal-border)' }}>
                    <span className="shrink-0 mt-0.5" style={{ width: 14, textAlign: 'center' }}>
                      {log.type === 'scan' && '\uD83D\uDD0D'}
                      {log.type === 'process' && '\u2699\uFE0F'}
                      {log.type === 'created' && '\u2705'}
                      {log.type === 'done' && '\uD83C\uDF89'}
                      {log.type === 'error' && '\u274C'}
                    </span>
                    <div className="flex-1 min-w-0">
                      <div style={{ color: log.type === 'error' ? '#EF4444' : log.type === 'done' ? 'var(--active-green)' : 'var(--terminal-text)' }}>{log.text}</div>
                      {log.detail && <div className="text-[10px] truncate" style={{ color: 'var(--terminal-text-muted)' }}>{log.detail}</div>}
                    </div>
                  </div>
                ))}
                <div ref={importLogEnd} />
              </div>
            )}
          </div>
        )}
        <div className="flex-1 flex items-center justify-center">
          <div className="text-center">
            <div className="text-4xl mb-3">{'\u{1F3E2}'}</div>
            <div className="text-gray-600 font-semibold text-xs">LOADING OFFICE...</div>
          </div>
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
              onKnowledgeClick={() => setPanel({ type: 'knowledge' })}
              knowledgeDocsCount={knowledgeDocs.length}
              getRoleSpeech={getRoleSpeech}
              getAppearance={getAppearance}
            />
          ) : (
          <div className={`${terminalOpen ? 'max-w-full' : 'max-w-[1100px]'} mx-auto h-full p-4 flex flex-col gap-3 relative z-[1]`}>
            {/* ── Section: LEADERSHIP ── */}
            {(() => {
              const cLevel = roles.filter(r => r.level === 'c-level');
              const members = roles.filter(r => r.level !== 'c-level');
              return (<>
                {cLevel.length > 0 && (<>
                  <div className="pixel-section-label">LEADERSHIP</div>
                  <div className={`grid gap-2 ${cLevel.length === 1 ? 'grid-cols-1' : 'grid-cols-2'}`}>
                    {cLevel.map((role) => (
                      <PixelCard
                        key={role.id}
                        role={role}
                        speech={getRoleSpeech(role.id)}
                        onClick={() => setPanel({ type: 'role', roleId: role.id })}
                        liveStatus={roleStatuses[role.id]}
                        activeTask={activeExecs.find((e) => e.roleId === role.id)?.task}
                        featured
                        appearance={getAppearance(role.id)}
                        onCustomize={() => setCustomizeTarget(role)}
                      />
                    ))}
                  </div>
                </>)}

                {/* ── Section: TEAM ── */}
                <div className="pixel-section-label">TEAM</div>
                <div className={`grid gap-2 ${terminalOpen ? 'grid-cols-3' : 'grid-cols-4'}`}>
                  {members.map((role) => (
                    <PixelCard
                      key={role.id}
                      role={role}
                      speech={getRoleSpeech(role.id)}
                      onClick={() => setPanel({ type: 'role', roleId: role.id })}
                      liveStatus={roleStatuses[role.id]}
                      activeTask={activeExecs.find((e) => e.roleId === role.id)?.task}
                      appearance={getAppearance(role.id)}
                      onCustomize={() => setCustomizeTarget(role)}
                    />
                  ))}
                  {/* + HIRE card */}
                  <div
                    className="pixel-card pixel-card--hire"
                    onClick={() => setShowHireModal(true)}
                  >
                    <div className="pixel-card--hire-inner">
                      <span className="pixel-card--hire-icon">+</span>
                      <span className="pixel-card--hire-label">HIRE NEW ROLE</span>
                    </div>
                  </div>
                </div>
              </>);
            })()}

            {/* ── Section: OFFICE ── */}
            <div className="pixel-section-label mt-1">OFFICE</div>
            <div className="grid grid-cols-4 gap-2">
              {/* Meeting Room */}
              <div
                className="facility-card-compact"
                onClick={mainProject ? () => setPanel({ type: 'project', projectId: mainProject.id }) : undefined}
                style={mainProject ? undefined : { borderStyle: 'dashed', opacity: 0.5 }}
              >
                <div className="fcc-hdr" style={{ background: '#3B82F6' }}>{'\u{1F3E2}'} PROJECT</div>
                <div className="fcc-canvas"><FacilityCanvas type="meeting" /></div>
                <div className="fcc-body">
                  {mainProject ? (<>
                    <div className="fcc-title">"{mainProject.name}"</div>
                    <div className="fcc-meta">Status: <strong style={{ color: 'var(--active-green)' }}>{mainProject.status}</strong></div>
                  </>) : (
                    <div className="fcc-meta" style={{ fontStyle: 'italic' }}>No active projects</div>
                  )}
                </div>
              </div>

              {/* Bulletin Board */}
              <div className="facility-card-compact" onClick={() => setPanel({ type: 'bulletin' })}>
                <div className="fcc-hdr" style={{ background: '#64748b' }}>{'\u{1F4CB}'} BULLETIN</div>
                <div className="fcc-canvas"><FacilityCanvas type="bulletin" /></div>
                <div className="fcc-body">
                  {waves.slice(0, 1).map((w) => (
                    <div key={w.id} className="fcc-item">Wave {w.id}</div>
                  ))}
                  {standups.slice(0, 1).map((s) => (
                    <div key={s.date} className="fcc-item">Standup {s.date}</div>
                  ))}
                  {waves.length === 0 && standups.length === 0 && (
                    <div className="fcc-meta" style={{ fontStyle: 'italic' }}>No entries</div>
                  )}
                </div>
              </div>

              {/* Decision Log */}
              <div className="facility-card-compact" onClick={() => setPanel({ type: 'decisions' })}>
                <div className="fcc-hdr" style={{ background: '#EF4444' }}>{'\u{1F4DC}'} DECISIONS</div>
                <div className="fcc-canvas"><FacilityCanvas type="decision" /></div>
                <div className="fcc-body">
                  <div className="fcc-title">{decisions.length} decisions</div>
                  {decisions.slice(0, 2).map((d) => (
                    <div key={d.id} className="fcc-item">#{d.id} {d.title}</div>
                  ))}
                </div>
              </div>

              {/* Knowledge Base */}
              <div className="facility-card-compact" onClick={() => setPanel({ type: 'knowledge' })}>
                <div className="fcc-hdr" style={{ background: '#0D9488' }}>{'\u{1F4DA}'} KNOWLEDGE</div>
                <div className="fcc-canvas"><FacilityCanvas type="knowledge" /></div>
                <div className="fcc-body">
                  <div className="fcc-title">{knowledgeDocs.length} docs</div>
                  {knowledgeDocs.slice(0, 2).map((d) => (
                    <div key={d.id} className="fcc-item">{d.title}</div>
                  ))}
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
              onClearEmpty={handleClearEmptySessions}
              onCloseAll={handleCloseAllSessions}
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
          <span className="mx-1">|</span>
          <button
            className="theme-btn"
            onClick={() => setCustomizeTarget(roles[0] ?? null)}
            title="Customize"
          >
            {OFFICE_THEMES[theme]?.icon ?? ''} {OFFICE_THEMES[theme]?.name ?? 'THEME'}
          </button>
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
      {panel.type === 'role' && selectedRole && (() => {
        const roleExec = activeExecs.find(e => e.roleId === selectedRole.id);
        return (
        <SidePanel
          role={selectedRole}
          allRoles={roles}
          recentActivity={getRoleSpeechFull(selectedRole.id)}
          onClose={closePanel}
          onFireRole={(id, name) => { setFireTarget({ roleId: id, roleName: name }); closePanel(); }}
          terminalWidth={terminalOpen ? terminalWidth : 0}
          activeJobId={roleExec?.id}
          activeTask={roleExec?.task}
          isWorking={roleStatuses[selectedRole.id] === 'working'}
          jobStartedAt={roleExec?.startedAt}
          onStopJob={(jobId) => api.abortJob(jobId)}
          sessions={sessions}
          streamingSessionId={streamingSessionId}
          onCreateSessionSilent={handleCreateSessionSilent}
          onSendMessage={handleSendMessage}
          onFocusTerminal={handleFocusTerminal}
        />
        );
      })()}
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
      {panel.type === 'knowledge' && (
        <KnowledgePanel
          docs={knowledgeDocs}
          onClose={closePanel}
          onRefresh={() => api.getKnowledge().then(setKnowledgeDocs).catch(() => {})}
          terminalWidth={terminalOpen ? terminalWidth : 0}
          initialDocId={panel.docId}
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
            onOpenKnowledgeDoc={(docId) => {
              setJobStack([]);
              setPanel({ type: 'knowledge', docId });
              api.getKnowledge().then(setKnowledgeDocs).catch(() => {});
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

      {/* Customize Modal */}
      {customizeTarget && (
        <CustomizeModal
          role={customizeTarget}
          appearance={getAppearance(customizeTarget.id)}
          onSave={(ap) => setAppearance(customizeTarget.id, ap)}
          onReset={() => resetAppearance(customizeTarget.id)}
          onClose={() => setCustomizeTarget(null)}
          theme={theme}
          onThemeChange={setTheme}
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

function PixelCard({ role, speech, onClick, liveStatus, activeTask, featured, appearance, onCustomize }: {
  role: Role; speech: string; onClick: () => void;
  liveStatus?: string; activeTask?: string; featured?: boolean;
  appearance?: import('../types/appearance').CharacterAppearance;
  onCustomize?: () => void;
}) {
  const color = ROLE_COLORS[role.id] ?? hashColor(role.id);
  const level = ROLE_LEVELS[role.id] ?? 1;
  const activity = DESK_ACTIVITY[role.id] ?? role.name;
  const isWorking = liveStatus === 'working';

  const taskText = isWorking && activeTask
    ? activeTask
    : speech || activity;

  return (
    <div
      className={`pixel-card ${isWorking ? 'working' : ''} ${featured ? 'pixel-card--featured' : ''}`}
      onClick={onClick}
    >
      {/* Customize button */}
      {onCustomize && (
        <button
          className="pixel-card-customize"
          onClick={(e) => { e.stopPropagation(); onCustomize(); }}
          title="Customize"
        >
          {'\u{1F3A8}'}
        </button>
      )}

      {/* Header */}
      <div className="pixel-card-hdr" style={{ background: color }}>
        <span>{role.id.toUpperCase()} {'\u00B7'} {role.name.toUpperCase()}</span>
        <span className="lvl">Lv.{level}</span>
      </div>

      {/* Sprite area */}
      <div className="pixel-card-body">
        <div className="pixel-desk" />
        <SpriteCanvas roleId={role.id} appearance={appearance} />
        {/* Status dot */}
        <div
          className="pixel-status-dot"
          style={{
            background: isWorking ? 'var(--idle-amber)' : 'var(--active-green)',
          }}
        />
      </div>

      {/* Task line */}
      <div className="pixel-card-task">
        <span className="pixel-card-task-icon">{isWorking ? '\u{1F6E0}\u{FE0F}' : ROLE_ICONS[role.id] ?? ''}</span>
        <span className="pixel-card-task-text">{taskText || activity}</span>
      </div>
    </div>
  );
}
