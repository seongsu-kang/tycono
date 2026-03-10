import { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { api } from '../api/client';
import type { Role, RoleDetail, Project, Standup, Wave, Decision, Session, Message, StreamEvent, CreateRoleInput, ImportJob, KnowledgeDoc, OrgNode, GitStatus, ImageAttachment, ActivityEvent } from '../types';
import SidePanel from '../components/office/SidePanel';
import OperationsPanel from '../components/office/OperationsPanel';
import QuestBoard from '../components/office/QuestBoard';
import ProjectPanel from '../components/office/ProjectPanel';
import AssignTaskModal from '../components/office/AssignTaskModal';
import ActivityPanel from '../components/office/ActivityPanel';
import WaveModal from '../components/office/WaveModal';
import WaveCommandCenter from '../components/office/WaveCommandCenter';
import WaveCenter from '../components/office/WaveCenter';
import HireRoleModal from '../components/office/HireRoleModal';
import FireRoleModal from '../components/office/FireRoleModal';
import TerminalPanel from '../components/terminal/TerminalPanel';
import useSessionStream from '../hooks/useSessionStream';
import { useCustomization } from '../hooks/useCustomization';
import { useSave } from '../hooks/useSave';
import { useAmbientSpeech } from '../hooks/useAmbientSpeech';
import { useOfficeChat } from '../hooks/useOfficeChat';
import { useChatScheduler } from '../hooks/useChatScheduler';
import TopDownCharCanvas from '../components/office/TopDownCharCanvas';
import FacilityCanvas from '../components/office/FacilityCanvas';
import TopDownOfficeView from '../components/office/TopDownOfficeView';
import KnowledgePanel from '../components/office/KnowledgePanel';
import CustomizeModal from '../components/office/CustomizeModal';
import SaveModal from '../components/office/SaveModal';
import CompanyStatsPanel from '../components/office/CompanyStatsPanel';
import SyncPanel from '../components/office/SyncPanel';
import GitStatusPanel from '../components/office/GitStatusPanel';
import SessionPanel from '../components/office/SessionPanel';
import SettingsPanel from '../components/office/SettingsPanel';
import ThemeDropup from '../components/office/ThemeDropup';
import ProView, { ProDashboard, ProRoleChat, ProRoleChatEmpty, type ProChannel } from '../components/pro/ProView';
import { OFFICE_THEMES } from '../types/appearance';
import type { CharacterAppearance, OfficeTheme } from '../types/appearance';
import { computeRoleLevels, type RoleLevelData } from '../utils/role-level';
import { computeBadges, type BadgeContext } from '../utils/badges';
import { QUESTS, getActiveQuest, getActiveQuests, getDefaultProgress, completeQuest, checkTrigger, recalcActiveChapter } from '../utils/quests';
import type { QuestProgress, QuestTrigger } from '../utils/quests';

/* ─── Role metadata ─────────────────────── */

const ROLE_ICONS: Record<string, string> = {
  cto: '\u{1F3D7}\u{FE0F}', cbo: '\u{1F4CA}', pm: '\u{1F4CB}',
  engineer: '\u{2699}\u{FE0F}', designer: '\u{1F3A8}', qa: '\u{1F50D}',
  'data-analyst': '\u{1F4CA}',
};
const ROLE_COLORS: Record<string, string> = {
  cto: '#1565C0', cbo: '#E65100', pm: '#2E7D32',
  engineer: '#4A148C', designer: '#AD1457', qa: '#00695C',
  'data-analyst': '#0277BD',
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
  | { type: 'knowledge'; docId?: string }
  | { type: 'quest' };

/* ─── Page ───────────────────────────────── */

export default function OfficePage({ importJob, onImportDone }: { importJob?: ImportJob | null; onImportDone?: () => void }) {
  const [roles, setRoles] = useState<Role[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [standups, setStandups] = useState<Standup[]>([]);
  const [waves, setWaves] = useState<Wave[]>([]);
  const [decisions, setDecisions] = useState<Decision[]>([]);
  const [knowledgeDocs, setKnowledgeDocs] = useState<KnowledgeDoc[]>([]);
  const [companyName, setCompanyName] = useState('TYCONO');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [panel, setPanel] = useState<PanelState>({ type: 'none' });
  const [selectedRole, setSelectedRole] = useState<RoleDetail | null>(null);

  /* Phase 2: Execution state — now job-based */
  const [assignModal, setAssignModal] = useState<{ roleId: string; roleName: string; mode: 'assign' | 'ask' } | null>(null);
  const [jobStack, setJobStack] = useState<Array<{ jobId: string; title: string; color: string }>>([]);
  const [showWaveModal, setShowWaveModal] = useState(false);
  const [showWaveCenter, setShowWaveCenter] = useState(false);
  const [waveCenterWaves, setWaveCenterWaves] = useState<Array<{ id: string; directive: string; rootJobs: Array<{ jobId: string; roleId: string; roleName: string }>; startedAt: number }>>([]);
  const [waveJobs, setWaveJobs] = useState<Array<{ jobId: string; roleId: string; roleName: string }>>([]);
  const [waveActiveIdx, setWaveActiveIdx] = useState(0);
  const [jobMinimized, setJobMinimized] = useState(false);

  /* Wave Command Center state */
  const [orgNodes, setOrgNodes] = useState<Record<string, OrgNode>>({});
  const [orgRootId, setOrgRootId] = useState('ceo');
  const [waveState, setWaveState] = useState<{
    directive: string;
    rootJobs: Array<{ jobId: string; roleId: string; roleName: string }>;
  } | null>(null);
  const [waveMinimized, setWaveMinimized] = useState(false);
  const [waveDone, setWaveDone] = useState(false);

  /* Role levels from token usage */
  const [roleLevels, setRoleLevels] = useState<RoleLevelData>({});
  const prevRoleLevelsRef = useRef<RoleLevelData>({});
  const [showHireModal, setShowHireModal] = useState(false);
  const [fireTarget, setFireTarget] = useState<{ roleId: string; roleName: string } | null>(null);

  /* Phase 3: Live status */
  const [roleStatuses, setRoleStatuses] = useState<Record<string, string>>({});
  const [activeExecs, setActiveExecs] = useState<{ roleId: string; task: string; id?: string; jobId?: string; startedAt?: string }[]>([]);
  /** O(1) lookup by roleId — avoids O(n) find() per card render */
  const activeExecsByRole = useMemo(() => {
    const map: Record<string, { task: string; id?: string; jobId?: string; startedAt?: string }> = {};
    for (const e of activeExecs) map[e.roleId] = e;
    return map;
  }, [activeExecs]);
  const [toasts, setToasts] = useState<{ id: number; message: string; color: string }[]>([]);

  /* Coins (Virtual Economy) */
  const [coinBalance, setCoinBalance] = useState(0);

  /* Quest Board */
  const [questProgress, setQuestProgress] = useState<QuestProgress>(getDefaultProgress());
  const questProgressRef = useRef<QuestProgress>(getDefaultProgress());
  const questLoadedRef = useRef(false);
  const prevProjectCountRef = useRef(-1);
  const [questSpotlight, setQuestSpotlight] = useState<string | null>(null);
  const spotlightTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  /* Engine type (for chat pipeline auto-detection) */
  const [engineType, setEngineType] = useState<string | undefined>(undefined);
  const [hasApiKey, setHasApiKey] = useState(false);
  useEffect(() => {
    api.getStatus().then(s => {
      setEngineType(s.engine);
      setHasApiKey(!!s.hasApiKey);
    }).catch(() => {});
  }, []);

  /* Customization */
  const { getAppearance, setAppearance, resetAppearance, theme, setTheme, speechSettings, setSpeechSettings, language, setLanguage } = useCustomization();
  const [customizeTarget, setCustomizeTarget] = useState<Role | null>(null);
  const [, setCustomizeInitialTab] = useState<'character' | 'office' | 'settings'>('character');

  /* Save system */
  const saveHook = useSave();
  const [showSaveModal, setShowSaveModal] = useState(false);
  const [showStatsPanel, setShowStatsPanel] = useState(false);
  const [showSyncPanel, setShowSyncPanel] = useState(false);
  const [showGitPanel, setShowGitPanel] = useState(false);
  const [showSessionPanel, setShowSessionPanel] = useState(false);
  const [showSettingsPanel, setShowSettingsPanel] = useState(false);
  const [showThemeDropup, setShowThemeDropup] = useState(false);
  const [gitStatus, setGitStatus] = useState<GitStatus | null>(null);

  // Start save polling on mount
  useEffect(() => {
    saveHook.refresh();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Cmd+S / Ctrl+S → open save modal
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 's') {
        e.preventDefault();
        setShowSaveModal(true);
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);

  // Git status polling — lazy, only when git panel is open
  useEffect(() => {
    if (!showGitPanel) return;
    let cancelled = false;
    const fetchGitStatus = async () => {
      try {
        const data = await api.getGitStatus();
        if (!cancelled) setGitStatus(data);
      } catch {
        // API may not exist yet — silently ignore
      }
    };
    fetchGitStatus();
    const interval = setInterval(fetchGitStatus, 10000);
    return () => { cancelled = true; clearInterval(interval); };
  }, [showGitPanel]);

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
  const prevBadgeIdsRef = useRef<Set<string>>(new Set());
  const badgeMountTimeRef = useRef(Date.now());

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

  /* View mode: card grid vs topdown vs pro */
  const [viewMode, setViewMode] = useState<'card' | 'iso' | 'pro'>('iso');
  const prevViewModeRef = useRef<'card' | 'iso'>('iso');
  const [proChannel, setProChannel] = useState<ProChannel>({ type: 'dashboard' });

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
  const waveStreamsRef = useRef<Map<string, AbortController>>(new Map());

  /* Fetch essential data on mount — lazy-load the rest when needed */
  useEffect(() => {
    Promise.all([
      api.getCompany().then((c) => { setCompanyName(c.name); setRoles(c.roles); }),
      api.getOrgTree().then((tree) => { setOrgNodes(tree.nodes); setOrgRootId(tree.root); }).catch(() => {}),
      api.getCostSummary().then((s) => updateRoleLevels(computeRoleLevels(s.byRole))).catch(() => {}),
    ])
      .catch((err) => setError(`Failed to load: ${err.message}`))
      .finally(() => setLoading(false));
    // Non-blocking: load secondary data after render
    api.getProjects().then(setProjects).catch(() => {});
    api.getStandups().then(setStandups).catch(() => {});
    api.getWaves().then(setWaves).catch(() => {});
    api.getDecisions().then(setDecisions).catch(() => {});
    api.getKnowledge().then(setKnowledgeDocs).catch(() => {});
    api.getQuestProgress().then(raw => {
      const p = recalcActiveChapter(raw);
      if (p.activeChapter !== raw.activeChapter) api.saveQuestProgress(p).catch(() => {});
      setQuestProgress(p); questProgressRef.current = p; questLoadedRef.current = true;
      // Coins: load + auto-migrate for existing users
      api.getCoins().then(c => {
        if (c.totalEarned === 0) {
          api.migrateCoins(p.completedQuests?.length ?? 0).then(m => setCoinBalance(m.balance)).catch(() => {});
        } else {
          setCoinBalance(c.balance);
        }
      }).catch(() => {});
    }).catch(() => { questLoadedRef.current = true; });
  }, []);

  // Detect new project creation for quest trigger
  useEffect(() => {
    if (prevProjectCountRef.current === -1) { prevProjectCountRef.current = projects.length; return; }
    if (projects.length > prevProjectCountRef.current) {
      fireQuestTrigger({ type: 'project_created' });
    }
    prevProjectCountRef.current = projects.length;
  }, [projects.length]);

  // Retroactive quest completion — auto-complete role_hired quests already satisfied
  useEffect(() => {
    if (!questLoadedRef.current || roles.length === 0) return;
    // Fire synthetic role_hired for each existing role so all matching quests complete
    for (const r of roles) {
      fireQuestTrigger({ type: 'role_hired', condition: { roleId: r.id, roleCount: roles.length } });
    }
  }, [roles.length, questProgress.activeChapter, questProgress.completedQuests.length]);

  /* Load sessions on mount — restore existing sessions (metadata only) */
  useEffect(() => {
    api.getSessions().then((metas) => {
      if (metas.length > 0) {
        const restored: Session[] = metas.map((m) => ({ ...m, messages: [] }));
        setSessions(restored);
        const active = restored.find((s) => s.status === 'active') ?? restored[0];
        setActiveSessionId(active.id);
        openTerminal();
      }
    }).catch((err) => {
      console.error('Failed to load sessions', err);
    });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

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

  /* Merge streaming chat status into roleStatuses so cards show yellow border */
  const effectiveRoleStatuses = useMemo(() => {
    const result = { ...roleStatuses };
    if (streamingSessionId) {
      const streamingSession = sessions.find(s => s.id === streamingSessionId);
      if (streamingSession) {
        result[streamingSession.roleId] = 'working';
      }
    }
    return result;
  }, [roleStatuses, streamingSessionId, sessions]);

  /* Load role detail when panel opens */
  useEffect(() => {
    if (panel.type === 'role') {
      api.getRole(panel.roleId).then(setSelectedRole).catch(console.error);
    } else {
      setSelectedRole(null);
    }
  }, [panel]);

  const closePanel = () => setPanel({ type: 'none' });

  // Mutual exclusion: right-side area is shared by Terminal, SidePanel, and WaveCenter
  const openPanel = (p: PanelState) => {
    setPanel(p);
    setTerminalOpen(false);
    setShowWaveCenter(false);
  };
  const openTerminal = () => {
    setTerminalOpen(true);
    setPanel({ type: 'none' });
    setShowWaveCenter(false);
  };
  const openWaveCenter = () => {
    setShowWaveCenter(true);
    setTerminalOpen(false);
    setPanel({ type: 'none' });
  };

  /* Phase 2 handlers */
  const handleExecutionStart = async (roleId: string, task: string) => {
    const role = roles.find((r) => r.id === roleId);
    const isAsk = assignModal?.mode === 'ask';
    setAssignModal(null);

    try {
      const { jobId } = await api.startJob({ type: 'assign', roleId, task, readOnly: isAsk });
      const color = ROLE_COLORS[roleId] ?? '#666';
      const title = `${roleId.toUpperCase()} · ${role?.name ?? roleId}`;
      setJobMinimized(false);
      setJobStack([{ jobId, title, color }]);
      fireQuestTrigger({ type: 'task_executed', condition: { roleId } });
      // Log to #office
      officeChat.pushMessage({
        ts: Date.now(),
        roleId: 'ceo',
        text: `[CEO → ${role?.name ?? roleId}] ${isAsk ? 'Ask' : 'Assign'}: ${task}`,
        type: 'dispatch',
        targetRoleId: roleId,
      });
    } catch (err) {
      addToast(`Failed to start job: ${err instanceof Error ? err.message : 'unknown'}`, '#C62828');
    }
  };

  const toastIdRef = useRef(0);
  const addToast = (message: string, color: string) => {
    const id = ++toastIdRef.current;
    setToasts((prev) => [...prev, { id, message, color }]);
    setTimeout(() => setToasts((prev) => prev.filter((t) => t.id !== id)), 4000);
  };

  /** Activate spotlight pulse on a UI element, auto-clear after 8s */
  const activateSpotlight = (target: string) => {
    if (spotlightTimerRef.current) clearTimeout(spotlightTimerRef.current);
    setQuestSpotlight(target);
    spotlightTimerRef.current = setTimeout(() => setQuestSpotlight(null), 8000);
  };

  /** Fire a quest trigger event and complete ALL matching active quests */
  const fireQuestTrigger = (event: QuestTrigger) => {
    if (!questLoadedRef.current) return;
    let progress = questProgressRef.current;
    const actives = getActiveQuests(progress);
    let totalCoins = 0;
    const completed: string[] = [];
    for (const active of actives) {
      if (!checkTrigger(active, event)) continue;
      const { progress: next, quest } = completeQuest(progress, active.id);
      if (!quest) continue;
      progress = next;
      totalCoins += quest.rewards.coins ?? 0;
      completed.push(quest.title);
    }
    if (completed.length === 0) return;
    questProgressRef.current = progress;
    setQuestProgress(progress);
    const coinMsg = totalCoins > 0 ? ` 💰 +${totalCoins.toLocaleString()}` : '';
    if (completed.length === 1) {
      addToast(`📋 Quest complete: ${completed[0]}${coinMsg}`, '#7C3AED');
    } else {
      addToast(`📋 ${completed.length} quests complete!${coinMsg}`, '#7C3AED');
    }
    setQuestSpotlight(null);
    api.saveQuestProgress(progress).catch(() => {});
    if (totalCoins > 0) {
      api.earnCoins(totalCoins, `quests: ${completed.length}`, completed.join(','))
        .then(r => setCoinBalance(r.balance))
        .catch(() => {});
    }
  };

  /* Apply/remove quest-spotlight CSS class on target element */
  useEffect(() => {
    if (!questSpotlight) return;
    const el = document.querySelector(`[data-quest-target="${questSpotlight}"]`) as HTMLElement | null;
    if (!el) return;
    el.classList.add('quest-spotlight');
    const handleClick = () => {
      el.classList.remove('quest-spotlight');
      setQuestSpotlight(null);
      if (spotlightTimerRef.current) clearTimeout(spotlightTimerRef.current);
    };
    el.addEventListener('click', handleClick, { once: true });
    return () => {
      el.classList.remove('quest-spotlight');
      el.removeEventListener('click', handleClick);
    };
  }, [questSpotlight]);

  /** Update role levels and detect level-ups */
  const updateRoleLevels = (newLevels: RoleLevelData) => {
    const prev = prevRoleLevelsRef.current;
    for (const [roleId, data] of Object.entries(newLevels)) {
      const prevLevel = prev[roleId]?.level ?? 0;
      if (prevLevel > 0 && data.level > prevLevel) {
        const roleName = roles.find(r => r.id === roleId)?.name ?? roleId.toUpperCase();
        addToast(`${roleName} leveled up to Lv.${data.level}!`, '#7C3AED');
      }
    }
    prevRoleLevelsRef.current = newLevels;
    setRoleLevels(newLevels);
  };

  /* Badge detection — notify on newly earned badges */
  useEffect(() => {
    const badgeCtx: BadgeContext = {
      roles: Object.entries(roleLevels).map(([id, d]) => ({ id, level: d.level, totalTokens: d.totalTokens })),
      totalTokens: Object.values(roleLevels).reduce((s, r) => s + r.totalTokens, 0),
      roleCount: roles.length,
      completedQuests: questProgress.completedQuests,
    };
    const earned = computeBadges(badgeCtx);
    const earnedIds = new Set(earned.map(b => b.id));
    // Suppress toasts for first 5s after mount (data still loading/stabilizing)
    const elapsed = Date.now() - badgeMountTimeRef.current;
    if (elapsed > 5000) {
      const prevIds = prevBadgeIdsRef.current;
      for (const badge of earned) {
        if (!prevIds.has(badge.id)) {
          addToast(`${badge.icon} Badge earned: ${badge.name}!`, '#D4A017');
        }
      }
    }
    prevBadgeIdsRef.current = earnedIds;
  }, [roleLevels, roles.length, questProgress.completedQuests]);

  /* Active quest — derived from progress */
  const activeQuest = useMemo(() => getActiveQuest(questProgress), [questProgress]);

  const handleExecutionDone = () => {
    const current = jobStack[jobStack.length - 1];
    if (current) {
      addToast(`${current.title} completed`, current.color);
      // Log completion to #office
      officeChat.pushMessage({
        ts: Date.now(),
        roleId: current.title.split(' · ')[0]?.toLowerCase() ?? 'unknown',
        text: `[${current.title}] Job completed`,
        type: 'dispatch',
      });
    }
    api.getStandups().then(setStandups).catch(console.error);
    api.getCompany().then((c) => setRoles(c.roles)).catch(console.error);
    api.getCostSummary().then((s) => updateRoleLevels(computeRoleLevels(s.byRole))).catch(() => {});
  };

  /** Connect SSE stream for a wave job → update virtual terminal session */
  const connectWaveStream = (jobId: string, _roleId: string) => {
    const sessionId = `wave-${jobId}`;
    const controller = new AbortController();
    waveStreamsRef.current.set(jobId, controller);

    // Create initial role message (streaming)
    const roleMsg: Message = {
      id: `msg-wave-${jobId}-role`,
      from: 'role',
      content: '',
      type: 'conversation',
      status: 'streaming',
      timestamp: new Date().toISOString(),
      streamEvents: [],
    };
    setSessions((prev) => prev.map((s) =>
      s.id === sessionId ? { ...s, messages: [...s.messages, roleMsg] } : s,
    ));

    fetch(`/api/jobs/${jobId}/stream?from=0`, { signal: controller.signal })
      .then(async (response) => {
        if (!response.ok || !response.body) return;
        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = '';

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split('\n');
          buffer = lines.pop() ?? '';

          let currentEvent = '';
          for (const line of lines) {
            if (line.startsWith('event: ')) {
              currentEvent = line.slice(7).trim();
            } else if (line.startsWith('data: ')) {
              try {
                const data = JSON.parse(line.slice(6));
                if (currentEvent === 'activity') {
                  const evt = data as ActivityEvent;
                  setSessions((prev) => prev.map((s) => {
                    if (s.id !== sessionId) return s;
                    const msgs = [...s.messages];
                    const lastMsg = msgs[msgs.length - 1];
                    if (!lastMsg || lastMsg.from !== 'role') return s;

                    const updated = { ...lastMsg };

                    if (evt.type === 'text') {
                      updated.content = (updated.content ?? '') + ((evt.data.text as string) ?? '');
                    } else if (evt.type === 'thinking') {
                      updated.thinking = (updated.thinking ?? '') + ((evt.data.text as string) ?? '');
                      updated.streamEvents = [...(updated.streamEvents ?? []), { type: 'thinking', timestamp: Date.now(), text: evt.data.text as string }];
                    } else if (evt.type === 'tool:start') {
                      updated.streamEvents = [...(updated.streamEvents ?? []), { type: 'tool', timestamp: Date.now(), toolName: evt.data.name as string, toolInput: evt.data.input as Record<string, unknown> }];
                    } else if (evt.type === 'dispatch:start') {
                      updated.streamEvents = [...(updated.streamEvents ?? []), { type: 'dispatch', timestamp: Date.now(), roleId: evt.data.targetRoleId as string, task: evt.data.task as string }];
                    } else if (evt.type === 'turn:complete') {
                      updated.streamEvents = [...(updated.streamEvents ?? []), { type: 'turn', timestamp: Date.now(), turn: evt.data.turn as number }];
                    } else if (evt.type === 'job:done') {
                      updated.status = 'done';
                      msgs[msgs.length - 1] = updated;
                      return { ...s, messages: msgs, status: 'closed' as const };
                    } else if (evt.type === 'job:error') {
                      updated.status = 'error';
                      if (evt.data.message) updated.content = updated.content || (evt.data.message as string);
                      msgs[msgs.length - 1] = updated;
                      return { ...s, messages: msgs, status: 'closed' as const };
                    }

                    msgs[msgs.length - 1] = updated;
                    return { ...s, messages: msgs };
                  }));
                } else if (currentEvent === 'stream:end') {
                  setSessions((prev) => prev.map((s) => {
                    if (s.id !== sessionId) return s;
                    const msgs = s.messages.map((m) =>
                      m.status === 'streaming' ? { ...m, status: 'done' as const } : m,
                    );
                    return { ...s, messages: msgs, status: 'closed' as const };
                  }));
                }
              } catch { /* skip malformed */ }
              currentEvent = '';
            }
          }
        }
      })
      .catch((err) => {
        if (err.name === 'AbortError') return;
        setSessions((prev) => prev.map((s) => {
          if (s.id !== sessionId) return s;
          const msgs = s.messages.map((m) =>
            m.status === 'streaming' ? { ...m, status: 'error' as const } : m,
          );
          return { ...s, messages: msgs, status: 'closed' as const };
        }));
      });
  };

  const handleWaveDispatch = async (directive: string, targetRoles?: string[]) => {
    setShowWaveModal(false);
    try {
      const resp = await api.startJob({ type: 'wave', directive, targetRoles });
      fireQuestTrigger({ type: 'wave_dispatched' });
      // Wave returns { jobIds: string[] } — one per C-Level role
      const jobIds: string[] = resp.jobIds ?? (resp.jobId ? [resp.jobId] : []);
      // Use CEO's direct reports from org tree (not just c-level filter)
      const ceoDirectReports = orgRootId && orgNodes[orgRootId]
        ? orgNodes[orgRootId].children.map(id => roles.find(r => r.id === id)).filter((r): r is typeof roles[number] => !!r)
        : roles.filter(r => r.level === 'c-level');
      const cLevels = targetRoles
        ? ceoDirectReports.filter(r => targetRoles.includes(r.id))
        : ceoDirectReports;

      const wj = jobIds.map((jid, i) => ({
        jobId: jid,
        roleId: cLevels[i]?.id ?? `role-${i}`,
        roleName: cLevels[i]?.name ?? `C-Level ${i + 1}`,
      }));

      // Log wave to #office
      officeChat.pushMessage({
        ts: Date.now(),
        roleId: 'ceo',
        text: `[CEO WAVE] "${directive}" → ${wj.map(w => w.roleName).join(', ')}`,
        type: 'dispatch',
      });

      // Add to WaveCenter active waves
      // D-014: Use server-generated waveId and sessionIds
      const serverWaveId = resp.waveId ?? `wave-${Date.now()}`;
      const serverSessionIds = resp.sessionIds ?? [];

      const newActiveWave = {
        id: serverWaveId,
        directive,
        rootJobs: wj,
        startedAt: Date.now(),
        sessionIds: serverSessionIds,
      };
      setWaveCenterWaves(prev => [newActiveWave, ...prev]);
      openWaveCenter();

      // D-014: Use server-created sessions (backend creates them with wave source)
      // If server provided sessionIds, fetch them; otherwise create virtual sessions as fallback
      const now = new Date().toISOString();
      const waveSessions: Session[] = serverSessionIds.length > 0
        ? wj.map((w, i) => ({
            id: serverSessionIds[i] ?? `wave-${w.jobId}`,
            roleId: w.roleId,
            title: `WAVE: ${w.roleName}`,
            mode: 'do' as const,
            source: 'wave' as const,
            jobId: w.jobId,
            messages: [{
              id: `msg-wave-${w.jobId}-ceo`,
              from: 'ceo' as const,
              content: directive,
              type: 'directive' as const,
              status: 'done' as const,
              timestamp: now,
            }],
            status: 'active' as const,
            createdAt: now,
            updatedAt: now,
          }))
        : wj.map((w) => ({
            id: `wave-${w.jobId}`,
            roleId: w.roleId,
            title: `WAVE: ${w.roleName}`,
            mode: 'do' as const,
            source: 'wave' as const,
            jobId: w.jobId,
            messages: [{
              id: `msg-wave-${w.jobId}-ceo`,
              from: 'ceo' as const,
              content: directive,
              type: 'directive' as const,
              status: 'done' as const,
              timestamp: now,
            }],
            status: 'active' as const,
            createdAt: now,
            updatedAt: now,
          }));

      setSessions((prev) => [...waveSessions, ...prev]);
      if (waveSessions.length > 0) {
        setActiveSessionId(waveSessions[0].id);
        openTerminal();
      }

      // Connect SSE streams for each wave job
      for (const w of wj) {
        connectWaveStream(w.jobId, w.roleId);
      }
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
    api.getOrgTree().then((tree) => { setOrgNodes(tree.nodes); setOrgRootId(tree.root); }).catch(console.error);
    api.getCostSummary().then((s) => updateRoleLevels(computeRoleLevels(s.byRole))).catch(() => {});
  };

  const handleHireRole = async (input: CreateRoleInput, appearance: CharacterAppearance) => {
    await api.createRole(input);
    setAppearance(input.id, appearance);
    refreshRoles();
    addToast(`${input.name} hired!`, '#2E7D32');
    fireQuestTrigger({ type: 'role_hired', condition: { roleId: input.id, roleCount: roles.length + 1 } });
  };

  const handleFireRole = async (roleId: string) => {
    await api.deleteRole(roleId);
    refreshRoles();
    // Clean up orphaned sessions for fired role
    setSessions((prev) => prev.filter((s) => s.roleId !== roleId));
    if (activeSessionId && sessions.find(s => s.id === activeSessionId)?.roleId === roleId) {
      setActiveSessionId(null);
    }
    setFireTarget(null);
    addToast(`${roleId.toUpperCase()} removed`, '#B71C1C');
  };

  const handleUpdateRole = async (roleId: string, changes: { name?: string; persona?: string }) => {
    await api.updateRole(roleId, changes);
    refreshRoles();
    // Refresh selectedRole detail so SidePanel shows updated data
    if (panel.type === 'role' && panel.roleId === roleId) {
      api.getRole(roleId).then(setSelectedRole).catch(console.error);
    }
    if (changes.name) addToast(`${roleId.toUpperCase()} renamed to "${changes.name}"`, '#1565C0');
    if (changes.persona !== undefined) {
      addToast(`${roleId.toUpperCase()} persona updated`, '#2E7D32');
      fireQuestTrigger({ type: 'persona_updated' });
    }
  };

  /* Terminal handlers */
  const handleOpenTerminal = (roleId?: string) => {
    openTerminal();
    fireQuestTrigger({ type: 'terminal_opened' });
    if (roleId) {
      handleCreateSession(roleId);
    }
  };

  const handleCreateSession = async (roleId: string) => {
    try {
      const session = await api.createSession(roleId, 'talk');
      setSessions((prev) => [session, ...prev]);
      setActiveSessionId(session.id);
      openTerminal();
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
  // If the role is currently working, open its ActivityPanel instead.
  // Creates a new session if none exists for this role.
  const handleFocusTerminal = async (roleId: string) => {
    // If role is working, open the ActivityPanel for its active job
    const exec = activeExecsByRole[roleId];
    const jobId = exec?.jobId ?? exec?.id;
    if (jobId && effectiveRoleStatuses[roleId] === 'working') {
      const role = roles.find(r => r.id === roleId);
      const color = ROLE_COLORS[roleId] ?? '#666';
      const title = `${roleId.toUpperCase()} · ${role?.name ?? roleId}`;
      setJobStack([{ jobId, title, color }]);
      setJobMinimized(false);
      return;
    }

    const session = sessions.find(s => s.roleId === roleId);
    if (session) {
      setActiveSessionId(session.id);
      // Switch to session view (not chat channel)
      officeChat.setActiveChannelId(null);
    } else {
      try {
        const newSession = await api.createSession(roleId, 'talk');
        setSessions((prev) => [newSession, ...prev]);
        setActiveSessionId(newSession.id);
        officeChat.setActiveChannelId(null);
      } catch (err) {
        console.error('Failed to create session', err);
      }
    }
    openTerminal();
  };

  const handleCloseSession = async (sessionId: string) => {
    // Wave sessions are virtual — no API call needed
    const session = sessions.find((s) => s.id === sessionId);
    if (session?.source === 'wave') {
      // Abort SSE stream if still running
      if (session.jobId) {
        const ctrl = waveStreamsRef.current.get(session.jobId);
        if (ctrl) { ctrl.abort(); waveStreamsRef.current.delete(session.jobId); }
      }
      setSessions((prev) => {
        const remaining = prev.filter((s) => s.id !== sessionId);
        if (activeSessionId === sessionId) {
          setActiveSessionId(remaining[0]?.id ?? null);
        }
        return remaining;
      });
      return;
    }
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
    // Only send API delete for non-wave sessions
    const apiIds = sessions.filter((s) => s.source !== 'wave').map((s) => s.id);
    // Abort all wave SSE streams
    for (const s of sessions) {
      if (s.source === 'wave' && s.jobId) {
        const ctrl = waveStreamsRef.current.get(s.jobId);
        if (ctrl) { ctrl.abort(); waveStreamsRef.current.delete(s.jobId); }
      }
    }
    try {
      if (apiIds.length > 0) await api.deleteSessions(apiIds);
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

  const handleSendMessage = (sessionId: string, content: string, mode: 'talk' | 'do', attachments?: ImageAttachment[]) => {
    const ceoMsg: Message = {
      id: `msg-${Date.now()}-ceo`,
      from: 'ceo',
      content,
      type: mode === 'do' ? 'directive' : 'conversation',
      status: 'done',
      timestamp: new Date().toISOString(),
      attachments,
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

    // Quest triggers: talk/do mode + task executed
    const session = sessions.find(s => s.id === sessionId);
    if (mode === 'talk') {
      fireQuestTrigger({ type: 'talk_mode_used' });
    } else if (mode === 'do') {
      fireQuestTrigger({ type: 'do_mode_used' });
      if (session) fireQuestTrigger({ type: 'task_executed', condition: { roleId: session.roleId } });
    }

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
    }, attachments);
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

  /** Short one-liner from standup (used as Layer 1 input for ambient speech) */
  const getStandupSpeech = (roleId: string): string => {
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
          return trimmed;
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

  /* ─── Ambient Speech System ─── */
  /* ─── Office Chat ─── */
  const officeChat = useOfficeChat();

  // Sync default channel members when roles load/change
  useEffect(() => {
    if (roles.length > 0) {
      officeChat.syncDefaultMembers(roles);
    }
  }, [roles]); // eslint-disable-line react-hooks/exhaustive-deps

  const ambient = useAmbientSpeech({
    roles,
    roleStatuses,
    activeExecs,
    getStandupSpeech,
  });

  // Chat Pipeline — LLM-powered channel conversations (independent from Speech Pipeline)
  const chatScheduler = useChatScheduler({
    roles,
    roleStatuses,
    activeExecs,
    channels: officeChat.channels,
    relationships: ambient.relationships,
    pushMessage: officeChat.pushMessage,
    speechSettings,
    engineType,
    hasApiKey,
  });

  /** CEO sends a message in a chat channel */
  const handleCeoChat = useCallback((channelId: string, text: string) => {
    officeChat.pushMessage({
      ts: Date.now(),
      roleId: 'ceo',
      text,
      type: 'chat',
      channelId,
    });
    // Trigger AI reactions after a short delay
    chatScheduler.triggerCeoReaction(channelId);
  }, [officeChat, chatScheduler]);

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
        className="flex items-center justify-between px-5 py-2 text-white text-sm shrink-0 z-[45]"
        style={{ background: 'var(--bar-bg, var(--hud-bg))', borderBottom: '3px solid var(--bar-border, var(--pixel-border))' }}
      >
        <div className="font-black text-[13px] tracking-tight" style={{ color: 'var(--idle-amber)', textShadow: '2px 2px 0 rgba(0,0,0,0.5)' }}>
          {'\u{1F3E2}'} <span style={{ color: 'var(--bar-text, var(--terminal-text))' }}>{companyName}</span>
        </div>
        <div className="flex gap-4 text-[11px] items-center" style={{ color: 'var(--bar-text, var(--terminal-text-secondary))' }}>
          {/* Resource bars — hidden on narrow screens */}
          {(() => {
            const coinK = coinBalance >= 1_000_000 ? `${(coinBalance / 1_000_000).toFixed(1)}M` : coinBalance >= 1_000 ? `${(coinBalance / 1_000).toFixed(1)}K` : String(coinBalance);
            const activeCount = activeExecs.length;
            const energy = roles.length > 0 ? Math.round((activeCount / roles.length) * 100) : 0;
            return (<>
              <div className="hidden md:flex items-center gap-1">
                {'\u{1F4B0}'}
                <strong className="text-[var(--active-green)]">{coinK}</strong>
              </div>
              <div className="hidden md:flex items-center gap-1">
                {'\u26A1'}
                <div className="w-[50px] h-2 bg-[#111] overflow-hidden" style={{ border: '2px solid var(--pixel-border)' }}>
                  <div className="h-full" style={{ width: `${energy}%`, background: 'linear-gradient(90deg,#3b82f6,#60A5FA)' }} />
                </div>
                <strong style={{ color: 'var(--bar-text, var(--terminal-text))' }}>{energy}</strong>
              </div>
            </>);
          })()}
          <span className="hidden sm:inline">Roles: <strong style={{ color: 'var(--bar-text, var(--terminal-text))' }}>{roles.length}</strong></span>
          <span className="hidden sm:inline">Projects: <strong style={{ color: 'var(--bar-text, var(--terminal-text))' }}>{projects.length}</strong></span>
          {activeExecs.length > 0 && (
            <span className="text-amber-400">
              Working: <strong>{activeExecs.length}</strong>
            </span>
          )}
          {(() => {
            const badgeCtx: BadgeContext = {
              roles: Object.entries(roleLevels).map(([id, d]) => ({ id, level: d.level, totalTokens: d.totalTokens })),
              totalTokens: Object.values(roleLevels).reduce((s, r) => s + r.totalTokens, 0),
              roleCount: roles.length,
            };
            const earnedBadges = computeBadges(badgeCtx);
            return earnedBadges.length > 0 ? (
              <div className="hidden sm:flex" style={{ gap: 2, alignItems: 'center', marginLeft: 8, paddingLeft: 8, borderLeft: '1px solid rgba(255,255,255,0.1)' }}>
                {earnedBadges.map(b => (
                  <span key={b.id} title={`${b.name}: ${b.description}`} style={{ fontSize: 12, cursor: 'default' }}>
                    {b.icon}
                  </span>
                ))}
              </div>
            ) : null;
          })()}
          <span className="px-1.5 py-0.5" style={{
              background: 'var(--bar-border, var(--hud-bg-alt))', border: '1px solid var(--bar-border, var(--pixel-border))',
              color: 'var(--bar-text, var(--terminal-text))',
            }}>
            {today}
          </span>
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
            <TopDownOfficeView
              roles={roles}
              projects={projects}
              waves={waves}
              standups={standups}
              decisions={decisions}
              roleStatuses={effectiveRoleStatuses}
              activeExecs={activeExecs}
              onRoleClick={(id) => openPanel({ type: 'role', roleId: id })}
              onProjectClick={(id) => openPanel({ type: 'project', projectId: id })}
              onBulletinClick={() => { openPanel({ type: 'bulletin' }); fireQuestTrigger({ type: 'bulletin_visited' }); }}
              onDecisionsClick={() => openPanel({ type: 'decisions' })}
              onKnowledgeClick={() => { openPanel({ type: 'knowledge' }); fireQuestTrigger({ type: 'knowledge_visited' }); }}
              onSettingsClick={() => { setShowSettingsPanel(true); fireQuestTrigger({ type: 'settings_visited' }); }}
              onThemeClick={() => setShowThemeDropup(v => !v)}
              onStatsClick={() => { setShowStatsPanel(true); fireQuestTrigger({ type: 'stats_visited' }); }}
              knowledgeDocsCount={knowledgeDocs.length}
              getRoleSpeech={ambient.getSpeech}
              getAppearance={getAppearance}
              onHireClick={() => setShowHireModal(true)}
              onMascotClick={() => openPanel({ type: 'quest' })}
              roleLevels={roleLevels}
              coinBalance={coinBalance}
              onCoinsSpent={(b) => setCoinBalance(b)}
              onFurniturePlaced={(_type, price) => {
                fireQuestTrigger({ type: 'furniture_placed' });
                if (price > 0) fireQuestTrigger({ type: 'furniture_purchased' });
              }}
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
                        speech={ambient.getSpeech(role.id)}
                        onClick={() => openPanel({ type: 'role', roleId: role.id })}
                        liveStatus={effectiveRoleStatuses[role.id]}
                        activeTask={activeExecsByRole[role.id]?.task}
                        featured
                        appearance={getAppearance(role.id)}
                        xpLevel={roleLevels[role.id]?.level}
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
                      speech={ambient.getSpeech(role.id)}
                      onClick={() => openPanel({ type: 'role', roleId: role.id })}
                      liveStatus={effectiveRoleStatuses[role.id]}
                      activeTask={activeExecsByRole[role.id]?.task}
                      appearance={getAppearance(role.id)}
                      xpLevel={roleLevels[role.id]?.level}
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
              {/* Meeting Room — Project Hub */}
              <div
                className="facility-card-compact"
                onClick={mainProject ? () => openPanel({ type: 'project', projectId: mainProject.id }) : undefined}
                style={mainProject ? undefined : { borderStyle: 'dashed', opacity: 0.5 }}
              >
                <div className="fcc-hdr" style={{ background: '#3B82F6' }}>{'\u{1F3E2}'} MEETING ROOM</div>
                <div className="fcc-canvas"><FacilityCanvas type="meeting" /></div>
                <div className="fcc-body">
                  <div className="fcc-desc">Projects, PRDs, and task boards</div>
                  {mainProject ? (<>
                    <div className="fcc-title">"{mainProject.name}"</div>
                    <div className="fcc-meta">Status: <strong style={{ color: 'var(--active-green)' }}>{mainProject.status}</strong></div>
                  </>) : (
                    <div className="fcc-meta" style={{ fontStyle: 'italic' }}>No active projects</div>
                  )}
                </div>
              </div>

              {/* Bulletin Board — Operations Log */}
              <div className="facility-card-compact" onClick={() => openPanel({ type: 'bulletin' })}>
                <div className="fcc-hdr" style={{ background: '#64748b' }}>{'\u{1F4CB}'} BULLETIN</div>
                <div className="fcc-canvas"><FacilityCanvas type="bulletin" /></div>
                <div className="fcc-body">
                  <div className="fcc-desc">Waves and daily standups</div>
                  {waves.slice(0, 1).map((w) => (
                    <div key={w.id} className="fcc-item">Wave {w.id}</div>
                  ))}
                  {standups.slice(0, 1).map((s) => (
                    <div key={s.date} className="fcc-item">Standup {s.date}</div>
                  ))}
                  {waves.length === 0 && standups.length === 0 && (
                    <div className="fcc-meta" style={{ fontStyle: 'italic' }}>No entries yet</div>
                  )}
                </div>
              </div>

              {/* Decision Log — Strategic Decisions */}
              <div className="facility-card-compact" onClick={() => openPanel({ type: 'decisions' })}>
                <div className="fcc-hdr" style={{ background: '#EF4444' }}>{'\u{1F4DC}'} DECISIONS</div>
                <div className="fcc-canvas"><FacilityCanvas type="decision" /></div>
                <div className="fcc-body">
                  <div className="fcc-desc">CEO strategic decision log</div>
                  <div className="fcc-title">{decisions.length} decisions</div>
                  {decisions.slice(0, 2).map((d) => (
                    <div key={d.id} className="fcc-item">#{d.id} {d.title}</div>
                  ))}
                </div>
              </div>

              {/* Knowledge Base — Research & Docs */}
              <div className="facility-card-compact" onClick={() => openPanel({ type: 'knowledge' })}>
                <div className="fcc-hdr" style={{ background: '#0D9488' }}>{'\u{1F4DA}'} KNOWLEDGE</div>
                <div className="fcc-canvas"><FacilityCanvas type="knowledge" /></div>
                <div className="fcc-body">
                  <div className="fcc-desc">Research, analysis, and references</div>
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

        {/* ─── Terminal Panel (non-Pro modes only; Pro renders it inline) ─── */}
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
              onMaximize={() => { prevViewModeRef.current = viewMode === 'pro' ? 'iso' : viewMode as 'card' | 'iso'; setProChannel({ type: 'terminal' }); setViewMode('pro'); }}
              chatChannels={officeChat.channels}
              activeChatChannelId={officeChat.activeChannelId}
              onSwitchChatChannel={officeChat.setActiveChannelId}
              onCreateChatChannel={(...args: Parameters<typeof officeChat.createChannel>) => { const r = officeChat.createChannel(...args); fireQuestTrigger({ type: 'chat_channel_created' }); return r; }}
              onDeleteChatChannel={officeChat.deleteChannel}
              onUpdateChatMembers={officeChat.updateMembers}
              onUpdateChatTopic={officeChat.updateTopic}
              onSendChatMessage={handleCeoChat}
              unreadChannels={officeChat.unreadChannels}
            />
          </div>
        )}
      </div>

      {/* ─── Bottom Bar ─── */}
      <div
        className="flex items-center justify-between px-5 py-2 text-[10px] shrink-0 z-[45]"
        style={{ background: 'var(--bar-bg, var(--hud-bg))', color: 'var(--bar-text, var(--terminal-text-secondary))', borderTop: '3px solid var(--bar-border, var(--pixel-border))' }}
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
            OFFICE
          </button>
          <button
            onClick={() => { prevViewModeRef.current = viewMode === 'pro' ? 'iso' : viewMode as 'card' | 'iso'; setViewMode('pro'); }}
            className={`view-toggle-btn ${viewMode === 'pro' ? 'active' : ''}`}
          >
            PRO
          </button>
          <span className="mx-1">|</span>
          <div style={{ position: 'relative' }}>
            <button
              className={`theme-btn${showThemeDropup ? ' active' : ''}`}
              data-quest-target="theme-btn"
              onClick={() => setShowThemeDropup(v => !v)}
              title="Office Theme"
            >
              {OFFICE_THEMES[theme]?.icon ?? ''}{'\u25BE'}
            </button>
            {showThemeDropup && (
              <ThemeDropup
                theme={theme}
                onThemeChange={(t: OfficeTheme) => { setTheme(t); fireQuestTrigger({ type: 'theme_changed' }); }}
                onClose={() => setShowThemeDropup(false)}
              />
            )}
          </div>
          <button
            className="theme-btn"
            data-quest-target="settings-btn"
            onClick={() => setShowSettingsPanel(true)}
            title="Settings"
          >
            {'\u2699'}
          </button>
          <span className="mx-1">|</span>
          {/* Git + Save unified indicator */}
          <button
            data-quest-target="save-btn"
            onClick={() => {
              if (saveHook.state === 'no-git') {
                setShowSaveModal(true);
              } else if (saveHook.state === 'dirty') {
                setShowSaveModal(true);
              } else {
                setShowGitPanel(true);
              }
            }}
            title={saveHook.state === 'dirty' ? `${saveHook.dirtyCount} unsaved — click to save` : 'Git Status'}
            style={{
              background: 'none', border: 'none', cursor: 'pointer', fontSize: 10,
              fontFamily: 'var(--pixel-font)',
              color: 'var(--bar-text, var(--terminal-text-muted))',
              display: 'flex', alignItems: 'center', gap: 4,
            }}
          >
            {/* Save status dot */}
            <span style={{
              display: 'inline-block', width: 6, height: 6, borderRadius: '50%',
              background: saveHook.state === 'no-git' ? 'var(--terminal-text-muted)'
                : saveHook.state === 'saving' ? 'var(--idle-amber)'
                : saveHook.state === 'dirty' ? 'var(--idle-amber)'
                : saveHook.state === 'error' ? '#EF5350'
                : 'var(--active-green)',
              animation: saveHook.state === 'saving' ? 'pulse 1s infinite' : undefined,
            }} />
            {/* Save text */}
            <span style={{ color: saveHook.state === 'dirty' ? 'var(--idle-amber)' : 'var(--bar-text, var(--terminal-text-muted))' }}>
              {saveHook.state === 'no-git' ? 'No git'
                : saveHook.state === 'saving' ? 'Saving...'
                : saveHook.state === 'dirty' ? `${saveHook.dirtyCount} unsaved`
                : 'Saved'}
            </span>
            {/* Git info (only when git exists and has worktrees/branches) */}
            {gitStatus && (gitStatus.worktrees.length > 0 || gitStatus.staleBranches.length > 0) && (
              <span style={{
                color: gitStatus.worktrees.some(w => w.status === 'stale') ? '#ff6b6b'
                  : gitStatus.worktrees.some(w => w.status === 'pending-merge') ? '#FFB74D'
                  : '#4FC3F7',
              }}>
                {'\u00B7'} {'\uD83D\uDCC2'} {gitStatus.worktrees.length} worktree{gitStatus.worktrees.length !== 1 ? 's' : ''}
                {gitStatus.staleBranches.length > 0 && ` \u00B7 \u26A0 ${gitStatus.staleBranches.length} branch${gitStatus.staleBranches.length !== 1 ? 'es' : ''}`}
              </span>
            )}
          </button>
        </div>
        <div className="flex items-center gap-2">
          {/* Active wave indicator */}
          {waveCenterWaves.length > 0 && !showWaveCenter && (
            <button
              onClick={() => openWaveCenter()}
              className={`px-3 py-1 font-black text-white cursor-pointer ${waveDone ? '' : 'animate-pulse'}`}
              style={{
                background: waveDone ? '#2E7D32' : '#B71C1C',
                border: `2px solid ${waveDone ? '#1b5e2088' : '#7f121288'}`,
                fontFamily: 'var(--pixel-font)',
                borderRadius: 4,
              }}
            >
              {waveDone ? 'WAVE DONE' : `WAVE (${waveCenterWaves.length})`}
            </button>
          )}
          {/* Legacy minimized wave command center indicator */}
          {waveState && waveMinimized && waveCenterWaves.length === 0 && (
            <button
              onClick={() => setWaveMinimized(false)}
              className={`px-3 py-1 font-black text-white cursor-pointer ${waveDone ? '' : 'animate-pulse'}`}
              style={{
                background: waveDone ? '#2E7D32' : '#B71C1C',
                border: `2px solid ${waveDone ? '#1b5e2088' : '#7f121288'}`,
                fontFamily: 'var(--pixel-font)',
                borderRadius: 4,
              }}
            >
              {waveDone ? 'WAVE DONE' : 'WAVE'}
            </button>
          )}
          {/* Minimized job indicator */}
          {jobStack.length > 0 && jobMinimized && (
            <button
              onClick={() => setJobMinimized(false)}
              className="px-3 py-1 font-black text-white cursor-pointer animate-pulse"
              style={{
                background: jobStack[jobStack.length - 1].color,
                border: `2px solid ${jobStack[jobStack.length - 1].color}88`,
                fontFamily: 'var(--pixel-font)',
                borderRadius: 4,
              }}
            >
              {jobStack[jobStack.length - 1].title.slice(0, 20)}
              {jobStack[jobStack.length - 1].title.length > 20 ? '..' : ''}
            </button>
          )}
          <button
            onClick={() => openWaveCenter()}
            className="wave-btn px-3 py-1 font-black text-white cursor-pointer"
            data-quest-target="wave-btn"
            style={{ background: '#B71C1C', border: '2px solid #7f1212', fontFamily: 'var(--pixel-font)' }}
          >
            {'\u{1F534}'} CEO WAVE
          </button>
          <button
            onClick={() => terminalOpen ? setTerminalOpen(false) : handleOpenTerminal()}
            className="px-3 py-1 font-black cursor-pointer"
            data-quest-target="terminal-btn"
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
      </div>

      {/* ─── Side Panels (hidden in Pro mode — rendered inline via panelNode) ─── */}
      {viewMode !== 'pro' && panel.type === 'role' && selectedRole && (() => {
        const roleExec = activeExecsByRole[selectedRole.id];
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
          isWorking={effectiveRoleStatuses[selectedRole.id] === 'working'}
          jobStartedAt={roleExec?.startedAt}
          onStopJob={(jobId) => api.abortJob(jobId)}
          sessions={sessions}
          streamingSessionId={streamingSessionId}
          onCreateSessionSilent={handleCreateSessionSilent}
          onSendMessage={handleSendMessage}
          onFocusTerminal={handleFocusTerminal}
          onCustomize={(roleId) => {
            const r = roles.find(x => x.id === roleId);
            if (r) { setCustomizeInitialTab('character'); setCustomizeTarget(r); }
          }}
          onUpdateRole={handleUpdateRole}
          appearance={getAppearance(selectedRole.id)}
          relationships={ambient.relationships}
          roleLevel={roleLevels[selectedRole.id]?.level}
          onMaximize={() => { prevViewModeRef.current = viewMode as 'card' | 'iso'; setProChannel({ type: 'role', roleId: selectedRole.id }); setViewMode('pro'); }}
        />
        );
      })()}
      {viewMode !== 'pro' && panel.type === 'project' && mainProject && (
        <ProjectPanel projectId={mainProject.id} onClose={closePanel} terminalWidth={terminalOpen ? terminalWidth : 0} />
      )}
      {viewMode !== 'pro' && (panel.type === 'bulletin' || panel.type === 'decisions') && (
        <OperationsPanel
          standups={standups}
          waves={waves}
          decisions={decisions}
          mode={panel.type === 'bulletin' ? 'bulletin' : 'decisions'}
          onClose={closePanel}
          onOpenWaveCenter={() => openWaveCenter()}
          terminalWidth={terminalOpen ? terminalWidth : 0}
          onMaximize={() => { prevViewModeRef.current = viewMode as 'card' | 'iso'; setProChannel({ type: 'operations' }); setViewMode('pro'); }}
        />
      )}
      {viewMode !== 'pro' && panel.type === 'quest' && (
        <QuestBoard
          progress={questProgress}
          onClose={closePanel}
          terminalWidth={terminalOpen ? terminalWidth : 0}
          onQuestAction={(questId) => {
            closePanel();
            const quest = QUESTS.find(q => q.id === questId);
            if (quest?.hint?.target) activateSpotlight(quest.hint.target);
          }}
        />
      )}
      {viewMode !== 'pro' && panel.type === 'knowledge' && (
        <KnowledgePanel
          docs={knowledgeDocs}
          onClose={closePanel}
          onRefresh={() => api.getKnowledge().then(setKnowledgeDocs).catch(() => {})}
          terminalWidth={terminalOpen ? terminalWidth : 0}
          initialDocId={panel.docId}
          onMaximize={() => { prevViewModeRef.current = viewMode as 'card' | 'iso'; setProChannel({ type: 'knowledge' }); setViewMode('pro'); }}
        />
      )}

      {/* ─── Pro View (full-screen overlay) ─── */}
      {viewMode === 'pro' && (
        <ProView
          roles={roles}
          roleStatuses={effectiveRoleStatuses}
          activeExecs={activeExecs}
          waves={waves}
          knowledgeDocs={knowledgeDocs}
          sessions={sessions}
          roleLevels={roleLevels}
          companyName={companyName}
          getAppearance={getAppearance}
          waveCenterWaves={waveCenterWaves}
          renderProfile={proChannel.type === 'role' && selectedRole ? (closeProfile) => {
            const roleExec = activeExecsByRole[selectedRole.id];
            return (
              <SidePanel
                role={selectedRole}
                allRoles={roles}
                recentActivity={getRoleSpeechFull(selectedRole.id)}
                onClose={closeProfile}
                onFireRole={(id, name) => { setFireTarget({ roleId: id, roleName: name }); }}
                terminalWidth={0}
                activeJobId={roleExec?.id}
                activeTask={roleExec?.task}
                isWorking={effectiveRoleStatuses[selectedRole.id] === 'working'}
                jobStartedAt={roleExec?.startedAt}
                onStopJob={(jobId) => api.abortJob(jobId)}
                sessions={sessions}
                streamingSessionId={streamingSessionId}
                onCreateSessionSilent={handleCreateSessionSilent}
                onSendMessage={handleSendMessage}
                onFocusTerminal={() => {/* already viewing chat */}}
                onCustomize={(roleId) => {
                  const r = roles.find(x => x.id === roleId);
                  if (r) { setCustomizeInitialTab('character'); setCustomizeTarget(r); }
                }}
                onUpdateRole={handleUpdateRole}
                appearance={getAppearance(selectedRole.id)}
                relationships={ambient.relationships}
                roleLevel={roleLevels[selectedRole.id]?.level}
              />
            );
          } : undefined}
          channel={proChannel}
          onChannelChange={(ch) => {
            setProChannel(ch);
            // Sync internal state based on channel
            if (ch.type === 'role') {
              openPanel({ type: 'role', roleId: ch.roleId });
            } else if (ch.type === 'knowledge') {
              openPanel({ type: 'knowledge' });
            } else if (ch.type === 'operations') {
              openPanel({ type: 'bulletin' });
            } else if (ch.type === 'wave') {
              setShowWaveCenter(true);
            } else if (ch.type === 'terminal') {
              setTerminalOpen(true);
            } else {
              setPanel({ type: 'none' });
              setShowWaveCenter(false);
            }
          }}
          onClose={() => {
            setViewMode(prevViewModeRef.current);
            // Clean up pro state
            setPanel({ type: 'none' });
            setShowWaveCenter(false);
          }}
        >
          {/* Dashboard */}
          {proChannel.type === 'dashboard' && (
            <ProDashboard
              roles={roles}
              roleStatuses={effectiveRoleStatuses}
              activeExecs={activeExecs}
              waves={waves}
              knowledgeDocs={knowledgeDocs}
              roleLevels={roleLevels}
              getAppearance={getAppearance}
              onRoleClick={(id) => setProChannel({ type: 'role', roleId: id })}
              onWaveClick={() => setProChannel({ type: 'wave' })}
              onKnowledgeClick={() => setProChannel({ type: 'knowledge' })}
            />
          )}

          {/* Terminal (full-width) */}
          {proChannel.type === 'terminal' && (
            <TerminalPanel
              sessions={sessions}
              activeSessionId={activeSessionId}
              roles={roles}
              streamingSessionId={streamingSessionId}
              width={typeof window !== 'undefined' ? window.innerWidth - 240 : 1000}
              onSwitchSession={setActiveSessionId}
              onCloseSession={handleCloseSession}
              onCreateSession={handleCreateSession}
              onClearEmpty={handleClearEmptySessions}
              onCloseAll={handleCloseAllSessions}
              onSendMessage={handleSendMessage}
              onModeChange={handleModeChange}
              onCloseTerminal={() => setProChannel({ type: 'dashboard' })}
              chatChannels={officeChat.channels}
              activeChatChannelId={officeChat.activeChannelId}
              onSwitchChatChannel={officeChat.setActiveChannelId}
              onCreateChatChannel={(...args: Parameters<typeof officeChat.createChannel>) => { const r = officeChat.createChannel(...args); fireQuestTrigger({ type: 'chat_channel_created' }); return r; }}
              onDeleteChatChannel={officeChat.deleteChannel}
              onUpdateChatMembers={officeChat.updateMembers}
              onUpdateChatTopic={officeChat.updateTopic}
              onSendChatMessage={handleCeoChat}
              unreadChannels={officeChat.unreadChannels}
            />
          )}

          {/* Wave Center (full-width) */}
          {proChannel.type === 'wave' && (
            <WaveCenter
              orgNodes={orgNodes}
              rootRoleId={orgRootId}
              cLevelRoles={orgRootId && orgNodes[orgRootId]
                ? orgNodes[orgRootId].children.map(id => roles.find(r => r.id === id)).filter((r): r is typeof roles[number] => !!r)
                : roles.filter(r => r.level === 'c-level')}
              pastWaves={waves}
              activeWaves={waveCenterWaves}
              onDispatch={(d, t) => handleWaveDispatch(d, t)}
              onClose={() => setProChannel({ type: 'dashboard' })}
              onDone={() => {
                handleJobDone();
                setWaveDone(true);
                addToast('Wave complete', '#2E7D32');
              }}
              onSave={async (dir, jobIds, extra) => {
                try {
                  await api.saveWave({ directive: dir, jobIds, waveId: extra?.waveId, sessionIds: extra?.sessionIds });
                  handleJobDone();
                  addToast('Wave saved', '#2E7D32');
                } catch (err) {
                  addToast(`Save failed: ${err instanceof Error ? err.message : 'unknown'}`, '#C62828');
                }
              }}
              onOpenKnowledgeDoc={(docId) => {
                setProChannel({ type: 'knowledge' });
                openPanel({ type: 'knowledge', docId });
                api.getKnowledge().then(setKnowledgeDocs).catch(() => {});
              }}
              onRefreshWaves={() => api.getWaves().then(setWaves).catch(() => {})}
              terminalWidth={0}
            />
          )}

          {/* Knowledge (full-width) */}
          {proChannel.type === 'knowledge' && (
            <KnowledgePanel
              docs={knowledgeDocs}
              onClose={() => setProChannel({ type: 'dashboard' })}
              onRefresh={() => api.getKnowledge().then(setKnowledgeDocs).catch(() => {})}
              terminalWidth={0}
            />
          )}

          {/* Operations (full-width) */}
          {proChannel.type === 'operations' && (
            <OperationsPanel
              standups={standups}
              waves={waves}
              decisions={decisions}
              mode="bulletin"
              onClose={() => setProChannel({ type: 'dashboard' })}
              onOpenWaveCenter={() => setProChannel({ type: 'wave' })}
              terminalWidth={0}
            />
          )}

          {/* Role Chat (DM-style) */}
          {proChannel.type === 'role' && (() => {
            const roleId = proChannel.roleId;
            const role = roles.find(r => r.id === roleId);
            if (!role) return null;
            const roleSession = sessions.find(s => s.roleId === roleId);
            if (roleSession) {
              return (
                <ProRoleChat
                  role={role}
                  messages={roleSession.messages}
                  isStreaming={streamingSessionId === roleSession.id}
                  mode={roleSession.mode}
                  onModeChange={(mode) => handleModeChange(roleSession.id, mode)}
                  onSend={(content, mode, attachments) => handleSendMessage(roleSession.id, content, mode, attachments)}
                  isWave={roleSession.source === 'wave'}
                />
              );
            }
            return (
              <ProRoleChatEmpty
                role={role}
                getAppearance={getAppearance}
                onSend={(content, mode) => {
                  handleCreateSessionSilent(roleId);
                  // Message will be sent after session is created via effect
                  setTimeout(() => {
                    const newSession = sessions.find(s => s.roleId === roleId);
                    if (newSession) handleSendMessage(newSession.id, content, mode);
                  }, 100);
                }}
              />
            );
          })()}
        </ProView>
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

      {/* Wave Command Center */}
      {waveState && !waveMinimized && (
        <WaveCommandCenter
          directive={waveState.directive}
          rootJobs={waveState.rootJobs}
          orgNodes={orgNodes}
          rootRoleId={orgRootId}
          onClose={() => { setWaveState(null); setWaveMinimized(false); setWaveDone(false); }}
          onMinimize={() => setWaveMinimized(true)}
          onDone={() => {
            handleJobDone();
            setWaveDone(true);
            addToast('Wave complete', '#2E7D32');
            // Note: auto-save is handled inside WaveCenter's own useEffect (doneFired)
          }}
          onSave={async (jobIds) => {
            try {
              await api.saveWave({ directive: waveState.directive, jobIds });
              handleJobDone();
              addToast('Wave saved to bulletin', '#2E7D32');
            } catch (err) {
              addToast(`Save failed: ${err instanceof Error ? err.message : 'unknown'}`, '#C62828');
            }
          }}
          onOpenKnowledgeDoc={(docId) => {
            setWaveState(null);
            setWaveMinimized(false);
            setWaveDone(false);
            openPanel({ type: 'knowledge', docId });
            api.getKnowledge().then(setKnowledgeDocs).catch(() => {});
          }}
        />
      )}

      {/* Unified Wave Center */}
      {showWaveCenter && (
        <WaveCenter
          orgNodes={orgNodes}
          rootRoleId={orgRootId}
          cLevelRoles={orgRootId && orgNodes[orgRootId]
            ? orgNodes[orgRootId].children.map(id => roles.find(r => r.id === id)).filter((r): r is typeof roles[number] => !!r)
            : roles.filter(r => r.level === 'c-level')}
          pastWaves={waves}
          activeWaves={waveCenterWaves}
          onDispatch={(d, t) => handleWaveDispatch(d, t)}
          onClose={() => setShowWaveCenter(false)}
          onMaximize={() => { prevViewModeRef.current = viewMode as 'card' | 'iso'; setProChannel({ type: 'wave' }); setViewMode('pro'); }}
          onDone={() => {
            handleJobDone();
            setWaveDone(true);
            addToast('Wave complete', '#2E7D32');
          }}
          onSave={async (dir, jobIds, extra) => {
            try {
              await api.saveWave({ directive: dir, jobIds, waveId: extra?.waveId, sessionIds: extra?.sessionIds });
              handleJobDone();
              addToast('Wave saved', '#2E7D32');
            } catch (err) {
              addToast(`Save failed: ${err instanceof Error ? err.message : 'unknown'}`, '#C62828');
            }
          }}
          onOpenKnowledgeDoc={(docId) => {
            setShowWaveCenter(false);
            openPanel({ type: 'knowledge', docId });
            api.getKnowledge().then(setKnowledgeDocs).catch(() => {});
          }}
          onRefreshWaves={() => api.getWaves().then(setWaves).catch(() => {})}
          terminalWidth={terminalOpen ? terminalWidth : 0}
        />
      )}

      {/* Phase 2: Activity Panel (replaces ExecutionPanel + WaveExecutionPanel) */}
      {jobStack.length > 0 && !jobMinimized && (() => {
        const current = jobStack[jobStack.length - 1];
        const isWave = waveJobs.length > 1;
        return (
          <>
            {/* Wave role tabs — show when multiple C-Level jobs */}
            {isWave && jobStack.length === 1 && (
              <div className="fixed top-[5%] left-1/2 -translate-x-1/2 w-[720px] max-w-[95vw] z-[63] flex gap-1 px-2 pt-2">
                {waveJobs.map((wj, i) => (
                  <button
                    key={wj.jobId}
                    onClick={() => {
                      setWaveActiveIdx(i);
                      setJobStack([{ jobId: wj.jobId, title: `CEO WAVE · ${wj.roleId.toUpperCase()}`, color: '#B71C1C' }]);
                    }}
                    className="px-3 py-1.5 text-xs font-bold rounded-t-lg cursor-pointer transition-colors"
                    style={{
                      background: waveActiveIdx === i ? '#B71C1C' : 'var(--terminal-bg)',
                      color: waveActiveIdx === i ? '#fff' : 'var(--terminal-text-secondary)',
                      border: `1px solid ${waveActiveIdx === i ? '#B71C1C' : 'var(--terminal-border)'}`,
                      borderBottom: 'none',
                    }}
                  >
                    {wj.roleId.toUpperCase()}
                  </button>
                ))}
              </div>
            )}
            <ActivityPanel
              key={current.jobId}
              jobId={current.jobId}
              title={jobStack.length > 1
                ? current.title
                : isWave
                  ? `CEO WAVE · ${waveJobs[waveActiveIdx]?.roleName ?? ''}`
                  : current.title
              }
              color={current.color}
              variant="modal"
              style={isWave && jobStack.length === 1 ? { marginTop: 28 } : undefined}
              onClose={() => { setJobStack([]); setWaveJobs([]); setWaveActiveIdx(0); setJobMinimized(false); }}
              onMinimize={() => setJobMinimized(true)}
              onDone={() => { handleExecutionDone(); handleJobDone(); }}
              onNavigateToJob={(childJobId) => {
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
                setJobStack([]); setWaveJobs([]); setWaveActiveIdx(0); setJobMinimized(false);
                openPanel({ type: 'knowledge', docId });
                api.getKnowledge().then(setKnowledgeDocs).catch(() => {});
              }}
            />
          </>
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
          cLevelRoles={orgRootId && orgNodes[orgRootId]
            ? orgNodes[orgRootId].children.map(id => roles.find(r => r.id === id)).filter((r): r is typeof roles[number] => !!r)
            : roles.filter(r => r.level === 'c-level')}
          orgNodes={orgNodes}
          rootId={orgRootId}
          onClose={() => setShowWaveModal(false)}
          onDispatch={(d, t) => handleWaveDispatch(d, t)}
        />
      )}

      {/* Hire Role Modal */}
      {showHireModal && (
        <HireRoleModal
          existingRoles={roles}
          onClose={() => setShowHireModal(false)}
          onHire={handleHireRole}
          onStoreVisit={() => fireQuestTrigger({ type: 'store_visited' })}
          questHint={activeQuest?.hint?.target === 'hire-btn' ? {
            message: activeQuest.description,
            roleId: (activeQuest.trigger.condition?.roleId as string) ?? undefined,
          } : undefined}
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

      {/* Customize Modal — CHARACTER only */}
      {customizeTarget && (
        <CustomizeModal
          role={customizeTarget}
          appearance={getAppearance(customizeTarget.id)}
          onSave={(ap) => { setAppearance(customizeTarget.id, ap); fireQuestTrigger({ type: 'accessory_changed' }); }}
          onReset={() => resetAppearance(customizeTarget.id)}
          onClose={() => { setCustomizeTarget(null); setCustomizeInitialTab('character'); }}
          theme={theme}
          onThemeChange={(t: OfficeTheme) => { setTheme(t); fireQuestTrigger({ type: 'theme_changed' }); }}
          onUpdateName={async (roleId, name) => { await handleUpdateRole(roleId, { name }); }}
          initialTab={'character'}
          characterOnly
          speechSettings={speechSettings}
          onSpeechSettingsChange={setSpeechSettings}
          language={language}
          onLanguageChange={setLanguage}
          roleLevel={roleLevels[customizeTarget.id]?.level}
        />
      )}

      {/* Save Modal */}
      {showSaveModal && (() => {
        // Pick best delegate: CTO > any C-level > any role
        const delegateRole = roles.find(r => r.id === 'cto')
          ?? roles.find(r => r.level === 'c-level')
          ?? roles[0];
        return (
          <SaveModal
            status={saveHook.status}
            history={saveHook.history}
            onClose={() => setShowSaveModal(false)}
            onSave={async (msg) => {
              const result = await saveHook.save(msg);
              if (result?.ok) fireQuestTrigger({ type: 'save_committed' });
              return result;
            }}
            onLoadHistory={saveHook.loadHistory}
            onRestore={saveHook.restore}
            saving={saveHook.state === 'saving'}
            repo={saveHook.repo}
            onRepoChange={saveHook.setRepo}
            syncInfo={saveHook.syncInfo}
            onPull={saveHook.pull}
            pulling={saveHook.pulling}
            onRefresh={saveHook.refresh}
            onInitGit={saveHook.initGit}
            delegateRoleName={delegateRole?.name ?? delegateRole?.id}
            onDelegate={delegateRole ? async (filesSummary) => {
              setShowSaveModal(false);
              // Create session and send "do" message
              try {
                const session = await api.createSession(delegateRole.id, 'do');
                setSessions((prev) => [session, ...prev]);
                setActiveSessionId(session.id);
                openTerminal();
                const prompt = `Review the following unsaved changes, write a proper commit message, save (git add + commit), and push. If the current branch is not the main branch, create a PR and merge it.\n\nChanged files:\n${filesSummary}`;
                handleSendMessage(session.id, prompt, 'do');
              } catch (err) {
                addToast(`Failed to delegate: ${err instanceof Error ? err.message : 'error'}`, '#B71C1C');
              }
            } : undefined}
          />
        );
      })()}

      {/* Stats Panel */}
      {showStatsPanel && (
        <div className="fixed inset-0 z-[80] flex items-center justify-center" style={{ background: 'rgba(0,0,0,0.5)' }} onClick={() => setShowStatsPanel(false)}>
          <div style={{ width: 420, maxHeight: '80vh', background: 'var(--terminal-bg)', border: '2px solid var(--pixel-border)', borderRadius: 8 }} onClick={e => e.stopPropagation()}>
            <CompanyStatsPanel onClose={() => setShowStatsPanel(false)} />
          </div>
        </div>
      )}

      {/* Sync Panel */}
      {showSyncPanel && (
        <div className="fixed inset-0 z-[80] flex items-center justify-center" style={{ background: 'rgba(0,0,0,0.5)' }} onClick={() => setShowSyncPanel(false)}>
          <div style={{ width: 480, maxHeight: '80vh', background: 'var(--terminal-bg)', border: '2px solid var(--pixel-border)', borderRadius: 8, overflowY: 'auto' }} onClick={e => e.stopPropagation()}>
            <SyncPanel onClose={() => setShowSyncPanel(false)} onSyncComplete={() => { /* refresh roles if needed */ }} />
          </div>
        </div>
      )}

      {/* Settings Panel */}
      {showSettingsPanel && (
        <SettingsPanel
          onClose={() => setShowSettingsPanel(false)}
          speechSettings={speechSettings}
          onSpeechSettingsChange={setSpeechSettings}
          language={language}
          onLanguageChange={setLanguage}
          onOpenSync={() => setShowSyncPanel(true)}
          onOpenGitStatus={() => setShowGitPanel(true)}
          onOpenSessions={() => setShowSessionPanel(true)}
          onOpenStats={() => setShowStatsPanel(true)}
        />
      )}

      {/* Git Status Panel */}
      {showGitPanel && (
        <div className="fixed inset-0 z-[80] flex items-center justify-center" style={{ background: 'rgba(0,0,0,0.5)' }} onClick={() => setShowGitPanel(false)}>
          <div style={{ width: 520, maxHeight: '80vh', background: 'var(--terminal-bg)', border: '2px solid var(--pixel-border)', borderRadius: 8, overflowY: 'auto' }} onClick={e => e.stopPropagation()}>
            <GitStatusPanel onClose={() => setShowGitPanel(false)} />
          </div>
        </div>
      )}

      {/* Session Panel */}
      {showSessionPanel && (
        <div className="fixed inset-0 z-[80] flex items-center justify-center" style={{ background: 'rgba(0,0,0,0.5)' }} onClick={() => setShowSessionPanel(false)}>
          <div style={{ width: 520, maxHeight: '80vh', background: 'var(--terminal-bg)', border: '2px solid var(--pixel-border)', borderRadius: 8, overflowY: 'auto' }} onClick={e => e.stopPropagation()}>
            <SessionPanel onClose={() => setShowSessionPanel(false)} />
          </div>
        </div>
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

function PixelCard({ role, speech, onClick, liveStatus, activeTask, featured, appearance, xpLevel }: {
  role: Role; speech: string; onClick: () => void;
  liveStatus?: string; activeTask?: string; featured?: boolean;
  appearance?: CharacterAppearance;
  xpLevel?: number;
}) {
  const color = ROLE_COLORS[role.id] ?? hashColor(role.id);
  const level = xpLevel ?? 1;
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
      {/* Header */}
      <div className="pixel-card-hdr" style={{ background: color }}>
        <span>{role.id.toUpperCase()} {'\u00B7'} {role.name.toUpperCase()}</span>
        <span className="lvl">Lv.{level}</span>
      </div>

      {/* Sprite area */}
      <div className="pixel-card-body">
        <div className="pixel-desk" />
        <TopDownCharCanvas roleId={role.id} appearance={appearance} />
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
        <span className="pixel-card-task-icon">{isWorking ? '\u{1F6E0}\u{FE0F}' : ROLE_ICONS[role.id] ?? '\u{1F464}'}</span>
        <span className="pixel-card-task-text">{taskText || activity}</span>
      </div>
    </div>
  );
}
