import { useState, useEffect, useRef, useCallback, useMemo, Fragment } from 'react';
import useWaveTree, { type WaveNode } from '../../hooks/useWaveTree';
import OrgTreeLive from './OrgTreeLive';
import EventRow from '../common/EventRow';
import type { OrgNode, Wave, WaveReplay, ImageAttachment } from '../../types';
import { isMessageActive, isWaveNodeActive } from '../../types';
import { api } from '../../api/client';
import { usePanelResize } from './KnowledgePanel';

const ROLE_COLORS: Record<string, string> = {
  cto: '#1565C0', cbo: '#E65100', pm: '#2E7D32',
  engineer: '#4A148C', designer: '#AD1457', qa: '#00695C',
  'data-analyst': '#0277BD',
};

interface ActiveWave {
  id: string;
  directive: string;
  rootJobs: Array<{ sessionId: string; roleId: string; roleName: string; jobId?: string }>;
  startedAt: number;
  sessionIds?: string[];
}

interface GitInfo {
  dirty: boolean;
  modified: string[];
  untracked: string[];
  lastCommit: { sha: string; message: string; date: string } | null;
  branch: string;
}

interface Props {
  orgNodes: Record<string, OrgNode>;
  rootRoleId: string;
  cLevelRoles: { id: string; name: string }[];
  pastWaves: Wave[];
  activeWaves: ActiveWave[];
  onDispatch: (directive: string, targetRoles?: string[], attachments?: ImageAttachment[]) => void;
  onClose: () => void;
  onDone?: () => void;
  onSave?: (directive: string, jobIds: string[], extra?: { waveId?: string; sessionIds?: string[] }) => Promise<void>;
  onOpenKnowledgeDoc?: (docId: string) => void;
  onRefreshWaves?: () => void;
  terminalWidth?: number;
  onMaximize?: () => void;
  /** When true, renders inline (no dimmer/fixed positioning) for Pro view */
  inline?: boolean;
  /** Open the SAVE COMPANY modal (reuses Office's SaveModal) */
  onOpenSaveModal?: () => void;
}

export default function WaveCenter({
  orgNodes, rootRoleId, cLevelRoles: _cLevelRoles, pastWaves,
  activeWaves, onDispatch, onClose, onDone, onSave, onOpenKnowledgeDoc,
  onRefreshWaves: _onRefreshWaves,
  terminalWidth = 0,
  onMaximize,
  inline = false,
  onOpenSaveModal,
}: Props) {
  const [directive, setDirective] = useState('');
  const [replayData, setReplayData] = useState<WaveReplay | null>(null);
  const [replayLoading, setReplayLoading] = useState(false);
  const [selectedWaveIdx, setSelectedWaveIdx] = useState(activeWaves.length > 0 ? 0 : -1);
  const [, setComposingNew] = useState(false); // true when user clicked "+ New Wave"
  const inputRef = useRef<HTMLTextAreaElement>(null);

  // Active wave tracking
  const currentActiveWave = selectedWaveIdx >= 0 ? (activeWaves[selectedWaveIdx] ?? null) : null;

  // Stable empty array to avoid re-renders when no active wave
  const emptyRootJobs = useMemo<Array<{ sessionId: string; roleId: string; roleName?: string }>>(() => [], []);
  const rootJobs = currentActiveWave?.rootJobs ?? emptyRootJobs;

  // Unified wave tree — works for active waves and as base for replay
  // SSE-005: Pass waveId to enable multiplexed SSE (1 connection per wave)
  const waveTree = useWaveTree(
    rootJobs,
    orgNodes,
    rootRoleId,
    currentActiveWave?.id ?? null,
  );

  // When replay loads, inject static data + reconnect running follow-ups
  useEffect(() => {
    if (replayData) {
      const staticNodes = buildReplayNodes(orgNodes, rootRoleId, replayData.roles);
      waveTree.injectStaticNodes(staticNodes);

      // If any follow-up roles are still running, reconnect their streams
      for (const r of replayData.roles ?? []) {
        if (isMessageActive(r.status as any) && r.sessionId) {
          const node = staticNodes.get(r.roleId);
          if (node?.sessionId) {
            setTimeout(() => waveTree.connectStream(node.sessionId, r.roleId), 100);
          }
        }
      }
    }
  }, [replayData, orgNodes, rootRoleId]); // eslint-disable-line react-hooks/exhaustive-deps

  // Default select CEO node
  useEffect(() => {
    if (!waveTree.selectedRoleId && rootRoleId) {
      waveTree.selectNode(rootRoleId);
    }
  }, [rootRoleId]); // eslint-disable-line react-hooks/exhaustive-deps

  // When new active wave starts, select it (but not if user is composing or viewing replay)
  const prevActiveCount = useRef(activeWaves.length);
  useEffect(() => {
    const grew = activeWaves.length > prevActiveCount.current;
    prevActiveCount.current = activeWaves.length;
    if (grew) {
      // A new wave just started — select it and exit composing/replay mode
      setSelectedWaveIdx(0);
      setReplayData(null);
      setComposingNew(false);
    }
    // Removed auto-snap: don't force back to active wave when user is viewing
    // replay (replayData/replayLoading) or composing a new wave.
  }, [activeWaves.length]);

  // Code git status
  const [codeGit, setCodeGit] = useState<GitInfo | null>(null);
  const codeGitBrief = useMemo(() => {
    if (!codeGit) return null;
    const count = codeGit.modified.length + codeGit.untracked.length;
    return { branch: codeGit.branch, dirty: count > 0, count };
  }, [codeGit]);

  const fetchCodeGit = useCallback(() => {
    api.getSaveStatus('code').then(r => {
      setCodeGit({
        dirty: r.modified.length + r.untracked.length > 0,
        modified: r.modified,
        untracked: r.untracked,
        lastCommit: r.lastCommit,
        branch: r.branch,
      });
    }).catch(() => {});
  }, []);

  useEffect(() => { fetchCodeGit(); }, [fetchCodeGit]);


  // Timer for active wave
  const [elapsed, setElapsed] = useState(0);
  useEffect(() => {
    if (!currentActiveWave) return;
    const timer = setInterval(() => {
      setElapsed(Math.floor((Date.now() - currentActiveWave.startedAt) / 1000));
    }, 1000);
    return () => clearInterval(timer);
  }, [currentActiveWave]);

  // Reply state
  const [replyText, setReplyText] = useState('');
  const [replying, setReplying] = useState(false);

  // File attachment state
  const [attachments, setAttachments] = useState<ImageAttachment[]>([]);
  const [isDragging, setIsDragging] = useState(false);
  const [attachError, setAttachError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (attachError) {
      const t = setTimeout(() => setAttachError(null), 3000);
      return () => clearTimeout(t);
    }
  }, [attachError]);

  const processFile = useCallback(async (file: File): Promise<ImageAttachment | null> => {
    const SUPPORTED = ['image/png', 'image/jpeg', 'image/gif', 'image/webp'];
    if (!SUPPORTED.includes(file.type)) {
      setAttachError(`Unsupported: ${file.type}. Use PNG, JPG, GIF, or WebP.`);
      return null;
    }
    if (file.size > 5 * 1024 * 1024) {
      setAttachError(`Too large: ${(file.size / 1024 / 1024).toFixed(1)}MB. Max 5MB.`);
      return null;
    }
    return new Promise((resolve) => {
      const reader = new FileReader();
      reader.onload = () => {
        const base64Data = (reader.result as string).split(',')[1];
        resolve({ type: 'image', data: base64Data, name: file.name, mediaType: file.type as ImageAttachment['mediaType'] });
      };
      reader.onerror = () => { setAttachError('Failed to read file'); resolve(null); };
      reader.readAsDataURL(file);
    });
  }, []);

  const handleFiles = useCallback(async (files: FileList | File[]) => {
    const processed: ImageAttachment[] = [];
    for (const file of Array.from(files)) {
      const att = await processFile(file);
      if (att) processed.push(att);
    }
    if (processed.length > 0) setAttachments(prev => [...prev, ...processed]);
  }, [processFile]);

  const handleDragOver = useCallback((e: React.DragEvent) => { e.preventDefault(); e.stopPropagation(); setIsDragging(true); }, []);
  const handleDragLeave = useCallback((e: React.DragEvent) => { e.preventDefault(); e.stopPropagation(); setIsDragging(false); }, []);
  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault(); e.stopPropagation(); setIsDragging(false);
    if (e.dataTransfer.files.length > 0) handleFiles(e.dataTransfer.files);
  }, [handleFiles]);
  const handlePaste = useCallback((e: React.ClipboardEvent) => {
    const imageFiles: File[] = [];
    for (let i = 0; i < e.clipboardData.items.length; i++) {
      const item = e.clipboardData.items[i];
      if (item.type.startsWith('image/')) { const f = item.getAsFile(); if (f) imageFiles.push(f); }
    }
    if (imageFiles.length > 0) { e.preventDefault(); handleFiles(imageFiles); }
  }, [handleFiles]);

  // History sidebar resize
  const [sidebarW, setSidebarW] = useState(320);
  const sidebarResizing = useRef(false);
  const sidebarStartX = useRef(0);
  const sidebarStartW = useRef(0);
  const handleSidebarResizeStart = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    sidebarResizing.current = true;
    sidebarStartX.current = e.clientX;
    sidebarStartW.current = sidebarW;
    const onMove = (ev: MouseEvent) => {
      if (!sidebarResizing.current) return;
      const delta = sidebarStartX.current - ev.clientX; // dragging left = wider
      setSidebarW(Math.max(200, Math.min(500, sidebarStartW.current + delta)));
    };
    const onUp = () => {
      sidebarResizing.current = false;
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  }, [sidebarW]);
  const [collapsedThinking, setCollapsedThinking] = useState<Set<number>>(new Set());
  const outputRef = useRef<HTMLDivElement>(null);

  // Smart auto-scroll
  const userScrolledUp = useRef(false);
  useEffect(() => {
    const el = outputRef.current;
    if (!el) return;
    const handleScroll = () => {
      const atBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 60;
      userScrolledUp.current = !atBottom;
    };
    el.addEventListener('scroll', handleScroll);
    return () => el.removeEventListener('scroll', handleScroll);
  }, []);

  useEffect(() => {
    if (!userScrolledUp.current && outputRef.current) {
      outputRef.current.scrollTop = outputRef.current.scrollHeight;
    }
  }, [waveTree.nodes, waveTree.selectedRoleId]);

  // Derived state
  const selectedNode = waveTree.selectedRoleId ? waveTree.nodes.get(waveTree.selectedRoleId) ?? null : null;
  const selectedColor = selectedNode ? (ROLE_COLORS[selectedNode.roleId] ?? '#888') : '#888';
  const hasRunning = waveTree.progress.running > 0 || waveTree.progress.awaitingInput > 0;
  const isCeoSelected = waveTree.selectedRoleId === rootRoleId;
  const isReplay = !!replayData && !currentActiveWave;
  const currentDirective = currentActiveWave?.directive ?? replayData?.directive ?? '';

  // Get subtree of a node from orgNodes (stable — org structure doesn't change)
  const getSubtree = useCallback((roleId: string): Set<string> => {
    const result = new Set<string>();
    const queue = [roleId];
    while (queue.length > 0) {
      const id = queue.shift()!;
      if (result.has(id)) continue;
      result.add(id);
      const org = orgNodes[id];
      if (org) queue.push(...org.children);
    }
    return result;
  }, [orgNodes]);

  // Eligible roles for checkboxes (subtree of selected node, excluding CEO)
  const eligibleRoles = useMemo(() => {
    if (!waveTree.selectedRoleId) return new Set<string>();
    const subtree = getSubtree(waveTree.selectedRoleId);
    subtree.delete(rootRoleId);
    return subtree;
  }, [waveTree.selectedRoleId, getSubtree, rootRoleId]);

  // When selected node changes, update checked roles to match subtree
  const prevSelectedRef = useRef<string | null>(null);
  useEffect(() => {
    if (waveTree.selectedRoleId === prevSelectedRef.current) return;
    prevSelectedRef.current = waveTree.selectedRoleId;
    if (!waveTree.selectedRoleId) return;

    const subtree = getSubtree(waveTree.selectedRoleId);
    subtree.delete(rootRoleId);
    waveTree.setCheckedRoles(subtree);
  }, [waveTree.selectedRoleId, getSubtree, rootRoleId]); // eslint-disable-line react-hooks/exhaustive-deps

  // Count dispatch targets in checked set
  const checkedTargetCount = waveTree.checkedRoles.size;

  // ── Handlers ──

  const handleDispatch = () => {
    if ((!directive.trim() && attachments.length === 0) || checkedTargetCount === 0) return;
    const allNonCeo = Array.from(waveTree.nodes.keys()).filter(id => id !== rootRoleId);
    const allChecked = allNonCeo.every(id => waveTree.checkedRoles.has(id));
    const atts = attachments.length > 0 ? attachments : undefined;
    onDispatch(directive.trim(), allChecked ? undefined : Array.from(waveTree.checkedRoles), atts);
    setDirective('');
    setAttachments([]);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      handleDispatch();
    }
    if (e.key === 'Escape') {
      onClose();
    }
  };

  const handleReply = useCallback(async () => {
    if (!waveTree.selectedRoleId || (!replyText.trim() && attachments.length === 0)) return;
    const node = waveTree.nodes.get(waveTree.selectedRoleId);
    if (!node) return;

    const atts = attachments.length > 0 ? attachments : undefined;
    setReplying(true);
    try {
      if (node.status === 'awaiting_input' && node.sessionId) {
        // Reply to active awaiting_input session
        const resp = await api.replyToSession(node.sessionId, replyText.trim(), atts);
        setReplyText('');
        setAttachments([]);
        // Use the returned sessionId (may be a new continuation session)
        waveTree.connectStream(resp.sessionId || node.sessionId, waveTree.selectedRoleId);
      } else {
        // Start new job (follow-up for done, replay, or not-dispatched)
        const waveId = currentActiveWave?.id ?? replayData?.waveId ?? replayData?.id;
        const resp = await api.startJob({ type: 'assign', roleId: waveTree.selectedRoleId, task: replyText.trim(), ...(waveId && { waveId }), ...(atts && { attachments: atts }) });
        setReplyText('');
        setAttachments([]);
        if (resp.sessionId) {
          waveTree.connectStream(resp.sessionId, waveTree.selectedRoleId);
        }
      }
    } catch (err) {
      console.error('Reply failed:', err);
    } finally {
      setReplying(false);
    }
  }, [waveTree, replyText, attachments, currentActiveWave, replayData]);

  const handleForceStop = useCallback(async (roleId: string) => {
    const node = waveTree.nodes.get(roleId);
    if (!node) return;
    try {
      if (node.sessionId) await api.abortSession(node.sessionId);
      else if (node.jobId) await api.abortJob(node.jobId);
    } catch {
      // Fallback: try jobId if session abort failed
      if (node.jobId) try { await api.abortJob(node.jobId); } catch { /* ignore */ }
    }
  }, [waveTree.nodes]);

  const handleStopAll = useCallback(async () => {
    for (const [, node] of waveTree.nodes) {
      if (!isWaveNodeActive(node.status)) continue;
      try {
        if (node.sessionId) await api.abortSession(node.sessionId);
        else if (node.jobId) await api.abortJob(node.jobId);
      } catch {
        if (node.jobId) try { await api.abortJob(node.jobId); } catch { /* ignore */ }
      }
    }
  }, [waveTree.nodes]);

  const handleLoadPastWave = useCallback(async (waveId: string) => {
    setReplayLoading(true);
    setReplayData(null);
    setSelectedWaveIdx(-1);
    try {
      const detail = await api.getWaveDetail(waveId);
      if (detail.replay) {
        setReplayData(detail.replay);
      }
    } catch (err) {
      console.error('Failed to load wave:', err);
    } finally {
      setReplayLoading(false);
    }
  }, []);


  // Notify when done + auto-save to disk so completed waves appear in PAST WAVES
  const doneFired = useRef(false);
  const doneFiredWaveId = useRef<string | null>(null);
  useEffect(() => {
    // Skip when viewing replay or loading — only fire for actual active wave completion
    if (replayData || replayLoading) return;

    // Reset doneFired when switching to a different wave
    if (currentActiveWave?.id !== doneFiredWaveId.current) {
      doneFired.current = false;
      doneFiredWaveId.current = currentActiveWave?.id ?? null;
    }
    if (waveTree.allDone && !doneFired.current && currentActiveWave) {
      doneFired.current = true;
      fetchCodeGit();
      onDone?.();
      // Auto-save wave to disk (prevents disappearing waves)
      if (onSave) {
        const jobIds = currentActiveWave.rootJobs.map(r => r.jobId).filter((id): id is string => !!id);
        onSave(currentActiveWave.directive, jobIds, { waveId: currentActiveWave.id, sessionIds: currentActiveWave.sessionIds }).catch(() => {});
      }
    }
  }, [waveTree.allDone, currentActiveWave, onDone, onSave, fetchCodeGit, replayData, replayLoading]);

  const handleSave = useCallback(async () => {
    if (!onSave || !currentActiveWave) return;
    const jobIds = currentActiveWave.rootJobs.map(r => r.jobId).filter((id): id is string => !!id);
    await onSave(currentActiveWave.directive, jobIds, { waveId: currentActiveWave.id, sessionIds: currentActiveWave.sessionIds });
  }, [onSave, currentActiveWave]);

  const toggleThinking = (seq: number) => {
    setCollapsedThinking(prev => {
      const next = new Set(prev);
      if (next.has(seq)) next.delete(seq);
      else next.add(seq);
      return next;
    });
  };

  const fmtTime = (s: number) => {
    const m = Math.floor(s / 60);
    const sec = s % 60;
    return `${m}:${sec.toString().padStart(2, '0')}`;
  };

  // Panel resize — side panel style (only used in overlay mode)
  const { panelRight, panelWidth, isResizing, handleResizeStart } = usePanelResize(terminalWidth, 700, onMaximize);

  /* ─── Inner content (shared by inline & overlay) ─── */
  const innerContent = (
    <>
      {/* Header — only in overlay mode (Pro view already has its own header) */}
      {!inline && (
        <div className="shrink-0 px-4 py-3" style={{ background: 'linear-gradient(180deg, #B71C1C 0%, #7f1d1d 100%)' }}>
          <div className="flex items-center gap-3">
            <span className="text-white font-bold text-lg tracking-wide" style={{ fontFamily: 'var(--pixel-font)' }}>
              Wave Center
            </span>
            {hasRunning && (
              <span className="text-white/60 text-xs">
                {waveTree.progress.running + waveTree.progress.awaitingInput} active
                {waveTree.progress.awaitingInput > 0 && ` (${waveTree.progress.awaitingInput} awaiting)`}
              </span>
            )}
            <div className="ml-auto flex items-center gap-2">
              {onMaximize && (
                <button onClick={onMaximize} className="text-white/50 hover:text-white text-xs cursor-pointer">Maximize</button>
              )}
              <button onClick={onClose} className="text-white/50 hover:text-white text-xl leading-none cursor-pointer px-2">&#x2715;</button>
            </div>
          </div>
          <div className="text-white/60 text-xs mt-0.5">
            {currentActiveWave
              ? `${activeWaves.length} active wave${activeWaves.length !== 1 ? 's' : ''}`
              : isReplay
                ? 'Reviewing past wave'
                : 'Broadcast directives to your organization'}
          </div>
        </div>
      )}

        {/* Main content */}
        <div className="flex-1 flex min-h-0">
          {/* Left: Unified view */}
          <div className="flex-1 flex flex-col min-w-0 min-h-0">

            {/* Wave info bar (when active or replay) */}
            {(currentActiveWave || isReplay) && (
              <div className="px-4 py-2 border-b flex items-center gap-3 shrink-0" style={{ borderColor: 'var(--terminal-border)' }}>
                <div
                  className="w-3 h-3 rounded-full shrink-0"
                  style={{
                    background: hasRunning ? '#FBBF24' : waveTree.allDone || isReplay ? '#2E7D32' : '#B71C1C',
                    animation: hasRunning ? 'wave-pulse 2s ease-in-out infinite' : undefined,
                  }}
                />
                <span className="text-[var(--terminal-text-secondary)] text-xs italic flex-1 min-w-0 truncate">
                  &ldquo;{currentDirective}&rdquo;
                </span>
                {currentActiveWave && (
                  <span className="text-[var(--terminal-text-muted)] text-xs font-mono shrink-0">{fmtTime(elapsed)}</span>
                )}
                {isReplay && (
                  <span className="text-[10px] px-2 py-0.5 rounded-full font-semibold shrink-0" style={{
                    background: hasRunning ? '#FBBF2422' : '#2E7D3222',
                    color: hasRunning ? '#FBBF24' : '#2E7D32',
                  }}>
                    {hasRunning ? 'LIVE' : 'REPLAY'}
                  </span>
                )}
                {isReplay && replayData?.startedAt && (
                  <span className="text-[var(--terminal-text-muted)] text-[10px] shrink-0">
                    {new Date(replayData.startedAt).toLocaleString()}
                  </span>
                )}
                {waveTree.progress.awaitingInput > 0 && (
                  <span className="text-[10px] px-2 py-0.5 rounded-full font-semibold shrink-0" style={{ background: '#F59E0B22', color: '#F59E0B' }}>
                    {waveTree.progress.awaitingInput} awaiting
                  </span>
                )}
                <span className="text-[10px] px-2 py-0.5 rounded-full font-semibold shrink-0" style={{
                  background: waveTree.allDone || (isReplay && !hasRunning) ? '#2E7D3222' : '#B71C1C22',
                  color: waveTree.allDone || (isReplay && !hasRunning) ? '#2E7D32' : '#B71C1C',
                }}>
                  {waveTree.progress.done}/{waveTree.progress.total}
                </span>
                {hasRunning && (
                  <button
                    onClick={handleStopAll}
                    className="text-[10px] px-2 py-0.5 rounded font-semibold cursor-pointer shrink-0"
                    style={{ background: '#C6282822', color: '#C62828', border: '1px solid #C6282844' }}
                  >
                    Stop All
                  </button>
                )}
              </div>
            )}

            {/* Org Tree with checkboxes */}
            <div className="shrink-0 border-b flex flex-col" style={{ borderColor: 'var(--terminal-border)' }}>
              <div className="flex items-center gap-3 px-4 py-1.5">
                <span className="text-[10px] font-bold text-[var(--terminal-text-secondary)] uppercase tracking-wider">
                  {currentActiveWave || isReplay ? 'Org Propagation' : 'Select Target Roles'}
                </span>
                <span className="ml-auto text-[10px] text-[var(--terminal-text-muted)]">
                  {waveTree.checkedRoles.size}/{waveTree.progress.total} selected
                </span>
                {(currentActiveWave || isReplay) && (
                  <div className="flex gap-x-3">
                    {[
                      { label: 'streaming', color: '#FBBF24', dot: true },
                      { label: 'awaiting', color: '#F59E0B', dot: true },
                      { label: 'done', color: '#2E7D32', dot: false },
                      { label: 'waiting', color: '#888', dot: false },
                      { label: 'error', color: '#C62828', dot: false },
                    ].map((item) => (
                      <div key={item.label} className="flex items-center gap-1">
                        <span
                          className="w-2 h-2 rounded-full inline-block"
                          style={{
                            background: item.color,
                            animation: item.dot ? 'wave-pulse 1.5s ease-in-out infinite' : undefined,
                          }}
                        />
                        <span className="text-[8px] text-[var(--terminal-text-muted)]">{item.label}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
              <div className="overflow-x-auto overflow-y-auto px-3 pb-2" style={{ maxHeight: '30vh' }}>
                <OrgTreeLive
                  nodes={waveTree.nodes}
                  rootId={rootRoleId}
                  selectedRoleId={waveTree.selectedRoleId}
                  onSelectNode={waveTree.selectNode}
                  checkedRoles={waveTree.checkedRoles}
                  onToggleCheck={waveTree.toggleCheck}
                  eligibleRoles={eligibleRoles}
                />
              </div>
            </div>

            {/* Activity Feed */}
            {replayLoading ? (
              <div className="flex-1 flex items-center justify-center text-[var(--terminal-text-muted)] text-sm">
                Loading wave data...
              </div>
            ) : isCeoSelected ? (
              /* ─── CEO selected: Directive UI ─── */
              <div className="flex-1 flex flex-col min-w-0 min-h-0">
                {/* CEO header */}
                <div className="px-4 py-2 border-b shrink-0 flex items-center gap-2" style={{ borderColor: 'var(--terminal-border)' }}>
                  <div className="w-2 h-2 rounded-full" style={{ background: '#B71C1C' }} />
                  <span className="text-[var(--terminal-text)] font-bold text-xs">CEO</span>
                  <span className="text-[var(--terminal-text-muted)] text-xs">Directive Control</span>
                  <span className="ml-auto text-[10px] text-[var(--terminal-text-muted)]">
                    {checkedTargetCount} target role{checkedTargetCount !== 1 ? 's' : ''} selected
                  </span>
                </div>

                {/* Past directives log */}
                <div ref={outputRef} className="flex-1 min-h-0 overflow-y-auto p-4 space-y-2 text-xs font-mono select-text">
                  {currentDirective && (
                    <div className="flex items-start gap-2 pb-3 border-b" style={{ borderColor: 'var(--terminal-border)' }}>
                      <span className="text-[10px] font-bold px-1.5 py-0.5 rounded shrink-0" style={{ background: '#B71C1C33', color: '#EF5350' }}>CEO</span>
                      <div>
                        <span className="text-[var(--terminal-text-secondary)] whitespace-pre-wrap">{currentDirective}</span>
                        {currentActiveWave && (
                          <div className="text-[9px] text-[var(--terminal-text-muted)] mt-1">
                            dispatched {fmtTime(elapsed)} ago to {currentActiveWave.rootJobs.length} role{currentActiveWave.rootJobs.length !== 1 ? 's' : ''}
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                  {!currentDirective && !currentActiveWave && (
                    <div className="text-[var(--terminal-text-muted)] text-center py-8">
                      Select target roles using checkboxes, then dispatch a directive below.
                    </div>
                  )}
                </div>

                {/* Directive input */}
                <div className="px-4 py-3 border-t shrink-0" style={{ borderColor: 'var(--terminal-border)', background: 'var(--hud-bg-alt)' }}>
                  {/* Attachment previews for directive */}
                  {attachments.length > 0 && (
                    <div className="flex flex-wrap gap-2 mb-2">
                      {attachments.map((att, idx) => (
                        <div key={idx} className="relative group w-14 h-14 rounded-lg overflow-hidden border border-[var(--terminal-border)] bg-[var(--terminal-inline-bg)]">
                          <img src={`data:${att.mediaType};base64,${att.data}`} alt={att.name} className="w-full h-full object-cover" />
                          <button onClick={() => setAttachments(prev => prev.filter((_, i) => i !== idx))} className="absolute top-0.5 right-0.5 w-4 h-4 rounded-full bg-black/70 text-white text-[9px] flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer">x</button>
                          <div className="absolute bottom-0 left-0 right-0 bg-black/60 text-[7px] text-white truncate px-1">{att.name}</div>
                        </div>
                      ))}
                    </div>
                  )}
                  {attachError && <div className="text-[10px] text-red-400 mb-1">{attachError}</div>}
                  <div className="flex gap-2 items-end">
                    <button onClick={() => fileInputRef.current?.click()} className="w-8 h-8 rounded-lg bg-[var(--terminal-inline-bg)] border border-[var(--terminal-border)] text-[var(--terminal-text-muted)] flex items-center justify-center shrink-0 cursor-pointer hover:text-[var(--terminal-text-secondary)] transition-colors" title="Attach image">
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48" /></svg>
                    </button>
                    <textarea
                      ref={inputRef}
                      value={directive}
                      onChange={(e) => setDirective(e.target.value)}
                      onKeyDown={handleKeyDown}
                      onPaste={handlePaste}
                      placeholder="e.g. Report current status across all departments"
                      rows={2}
                      className="flex-1 px-3 py-2 text-sm rounded-lg border bg-[var(--terminal-bg)] text-[var(--terminal-text)] outline-none resize-none"
                      style={{ borderColor: 'var(--terminal-border)' }}
                    />
                    <button
                      onClick={handleDispatch}
                      disabled={(!directive.trim() && attachments.length === 0) || checkedTargetCount === 0}
                      className="px-4 py-2 text-xs font-bold rounded-lg cursor-pointer disabled:opacity-30 disabled:cursor-not-allowed shrink-0"
                      style={{
                        background: directive.trim() && checkedTargetCount > 0 ? '#B71C1C' : '#333',
                        color: '#fff',
                        minWidth: 140,
                      }}
                    >
                      Dispatch to {checkedTargetCount} Role{checkedTargetCount !== 1 ? 's' : ''}
                    </button>
                  </div>
                  <div className="text-[9px] text-[var(--terminal-text-muted)] mt-1">
                    Cmd+Enter to dispatch
                  </div>
                </div>
              </div>
            ) : (
              /* ─── Non-CEO selected: Activity Feed ─── */
              <div className="flex-1 flex flex-col min-w-0 min-h-0">
                {/* Selected role header */}
                {selectedNode && (
                  <div className="px-4 py-2 border-b shrink-0 flex items-center gap-2" style={{ borderColor: 'var(--terminal-border)' }}>
                    <div className="w-2 h-2 rounded-full" style={{ background: selectedColor }} />
                    <span className="text-[var(--terminal-text)] font-bold text-xs">
                      {selectedNode.roleId.toUpperCase()}
                    </span>
                    <span className="text-[var(--terminal-text-muted)] text-xs">
                      {selectedNode.roleName}
                    </span>
                    <span className="ml-auto text-[10px] px-2 py-0.5 rounded-full font-semibold" style={{
                      background: selectedNode.status === 'awaiting_input' ? '#F59E0B22'
                        : selectedNode.status === 'streaming' ? '#FBBF2422'
                        : `${selectedColor}22`,
                      color: selectedNode.status === 'awaiting_input' ? '#F59E0B'
                        : selectedNode.status === 'streaming' ? '#FBBF24'
                        : selectedColor,
                    }}>
                      {selectedNode.status === 'streaming' ? 'Working...' :
                       selectedNode.status === 'done' ? (
                         selectedNode.children.some(cid => {
                           const child = waveTree.nodes.get(cid);
                           return child && isWaveNodeActive(child.status);
                         }) ? 'Supervising...' : 'Complete'
                       ) :
                       selectedNode.status === 'error' ? 'Error' :
                       selectedNode.status === 'waiting' ? 'Waiting' :
                       selectedNode.status === 'awaiting_input' ? 'Awaiting Reply' :
                       'Not dispatched'}
                    </span>
                    <span className="text-[10px] text-[var(--terminal-text-muted)]">{selectedNode.events.length} events</span>
                    {isWaveNodeActive(selectedNode.status) && selectedNode.sessionId && (
                      <button
                        onClick={() => handleForceStop(selectedNode.roleId)}
                        className="text-[10px] px-2 py-0.5 rounded font-semibold cursor-pointer ml-1"
                        style={{ background: '#C6282822', color: '#C62828', border: '1px solid #C6282844' }}
                      >
                        Stop
                      </button>
                    )}
                  </div>
                )}

                {/* Hidden file input (shared) */}
                <input ref={fileInputRef} type="file" accept="image/png,image/jpeg,image/gif,image/webp" multiple onChange={(e) => { if (e.target.files?.length) handleFiles(e.target.files); e.target.value = ''; }} className="hidden" />

                {/* Events (drag-drop zone) */}
                <div
                  ref={outputRef}
                  className={`flex-1 min-h-0 overflow-y-auto p-4 space-y-1 text-xs font-mono select-text transition-colors ${isDragging ? 'bg-amber-500/5 ring-1 ring-inset ring-amber-500/30' : ''}`}
                  onDragOver={handleDragOver}
                  onDragLeave={handleDragLeave}
                  onDrop={handleDrop}
                >
                  {/* CEO directive message */}
                  {selectedNode && currentDirective && selectedNode.status !== 'waiting' && selectedNode.status !== 'not-dispatched' && (
                    <div className="flex items-start gap-2 mb-3 pb-2 border-b" style={{ borderColor: 'var(--terminal-border)' }}>
                      <span className="text-[10px] font-bold px-1.5 py-0.5 rounded shrink-0" style={{ background: '#B71C1C33', color: '#EF5350' }}>CEO</span>
                      <span className="text-[var(--terminal-text-secondary)] whitespace-pre-wrap">{currentDirective}</span>
                    </div>
                  )}
                  {selectedNode && selectedNode.events.length === 0 && (
                    <div className="text-[var(--terminal-text-muted)]">
                      {selectedNode.status === 'waiting' ? 'Waiting for dispatch...' :
                       selectedNode.status === 'streaming' ? 'Connecting to activity stream...' :
                       selectedNode.status === 'not-dispatched' ? 'This role was not dispatched. Send a follow-up to activate.' : ''}
                    </div>
                  )}
                  {selectedNode?.events.map((event, idx) => {
                    const events = selectedNode.events;
                    // Detect follow-up boundary: job:start that's not the first in the list
                    const isFollowUpStart = event.type === 'msg:start' && idx > 0;
                    // Hide terminal events (msg:done/error/awaiting_input) right before a follow-up start
                    const nextEvent = events[idx + 1];
                    const isTerminalBeforeFollowUp = (event.type === 'msg:done' || event.type === 'msg:error' || event.type === 'msg:awaiting_input')
                      && nextEvent?.type === 'msg:start';

                    if (isTerminalBeforeFollowUp) return null;

                    if (isFollowUpStart) {
                      // Extract CEO follow-up text from the task
                      const task = (event.data.task as string) ?? '';
                      const ceoMatch = task.match(/\[CEO Follow-up\]\n([\s\S]+)$/);
                      const ceoText = ceoMatch ? ceoMatch[1].trim() : task;
                      return (
                        <Fragment key={`followup-${event.seq}`}>
                          <div className="flex items-start gap-2 my-3 pt-2 pb-2 border-t border-b" style={{ borderColor: 'var(--terminal-border)' }}>
                            <span className="text-[10px] font-bold px-1.5 py-0.5 rounded shrink-0" style={{ background: '#B71C1C33', color: '#EF5350' }}>CEO</span>
                            <span className="text-[var(--terminal-text-secondary)] whitespace-pre-wrap">{ceoText}</span>
                          </div>
                        </Fragment>
                      );
                    }

                    return (
                      <EventRow
                        key={event.seq}
                        event={event}
                        isThinkingCollapsed={collapsedThinking.has(event.seq)}
                        onToggleThinking={() => toggleThinking(event.seq)}
                        onNavigateToSession={(childSessionId) => {
                          for (const [, node] of waveTree.nodes) {
                            if (node.events.some(e => (e.data.childSessionId ?? e.data.childJobId) === childSessionId)) {
                              waveTree.selectNode(node.roleId);
                              return;
                            }
                          }
                        }}
                        onOpenKnowledgeDoc={onOpenKnowledgeDoc}
                      />
                    );
                  })}
                  {selectedNode?.status === 'streaming' && (
                    <span className="inline-block w-2 h-4 bg-green-400 animate-pulse ml-0.5" />
                  )}
                  {!selectedNode && (
                    <div className="flex-1 flex items-center justify-center text-[var(--terminal-text-muted)] text-xs h-full">
                      Click a node in the org tree to view activity
                    </div>
                  )}
                </div>

                {/* Shared attachment previews + error (shown above any input) */}
                {(selectedNode?.status === 'awaiting_input' || selectedNode?.status === 'done' || selectedNode?.status === 'not-dispatched') && (attachments.length > 0 || attachError || isDragging) && (
                  <div className="px-4 pt-2 border-t shrink-0" style={{ borderColor: 'var(--terminal-border)' }}>
                    {attachError && <div className="text-[10px] text-red-400 mb-1">{attachError}</div>}
                    {isDragging && <div className="text-[11px] text-amber-400 text-center mb-1">Drop image here</div>}
                    {attachments.length > 0 && (
                      <div className="flex flex-wrap gap-2 mb-1">
                        {attachments.map((att, idx) => (
                          <div key={idx} className="relative group w-14 h-14 rounded-lg overflow-hidden border border-[var(--terminal-border)] bg-[var(--terminal-inline-bg)]">
                            <img src={`data:${att.mediaType};base64,${att.data}`} alt={att.name} className="w-full h-full object-cover" />
                            <button onClick={() => setAttachments(prev => prev.filter((_, i) => i !== idx))} className="absolute top-0.5 right-0.5 w-4 h-4 rounded-full bg-black/70 text-white text-[9px] flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer">x</button>
                            <div className="absolute bottom-0 left-0 right-0 bg-black/60 text-[7px] text-white truncate px-1">{att.name}</div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}

                {/* Reply / Follow-up input for selected role */}
                {selectedNode?.status === 'awaiting_input' && (
                  <div className="px-4 py-3 border-t shrink-0" style={{ borderColor: 'var(--terminal-border)', background: '#F59E0B0A' }}>
                    <div className="flex items-center gap-2 mb-2">
                      <span className="w-2 h-2 rounded-full inline-block" style={{ background: '#F59E0B', animation: 'wave-pulse 1.5s ease-in-out infinite' }} />
                      <span className="text-[11px] font-semibold" style={{ color: '#F59E0B' }}>
                        {selectedNode.roleName} is waiting for your response
                      </span>
                    </div>
                    <div className="flex gap-2">
                      <button onClick={() => fileInputRef.current?.click()} disabled={replying} className="w-7 h-7 rounded bg-[var(--terminal-inline-bg)] border border-[var(--terminal-border)] text-[var(--terminal-text-muted)] flex items-center justify-center shrink-0 cursor-pointer hover:text-[var(--terminal-text-secondary)] disabled:opacity-30 transition-colors" title="Attach image">
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48" /></svg>
                      </button>
                      <input
                        type="text"
                        value={replyText}
                        onChange={(e) => setReplyText(e.target.value)}
                        onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleReply(); } }}
                        onPaste={handlePaste}
                        placeholder="Type your response..."
                        disabled={replying}
                        className="flex-1 px-3 py-1.5 text-xs rounded border bg-[var(--terminal-bg)] text-[var(--terminal-text)] outline-none"
                        style={{ borderColor: 'var(--terminal-border)' }}
                        autoFocus
                      />
                      <button
                        onClick={handleReply}
                        disabled={replying || (!replyText.trim() && attachments.length === 0)}
                        className="px-4 py-1.5 text-xs rounded font-semibold cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
                        style={{ background: '#F59E0B', color: '#000' }}
                      >
                        {replying ? '...' : 'Reply'}
                      </button>
                    </div>
                  </div>
                )}

                {/* Follow-up for done/not-dispatched roles */}
                {selectedNode && (selectedNode.status === 'done' || selectedNode.status === 'not-dispatched') && (
                  <div className="px-4 py-3 border-t shrink-0" style={{ borderColor: 'var(--terminal-border)', background: '#1565C00A' }}>
                    <div className="flex items-center gap-2 mb-2">
                      <span className="text-[11px] font-semibold" style={{ color: '#64B5F6' }}>
                        Follow-up to {selectedNode.roleName}
                      </span>
                    </div>
                    <div className="flex gap-2">
                      <button onClick={() => fileInputRef.current?.click()} disabled={replying} className="w-7 h-7 rounded bg-[var(--terminal-inline-bg)] border border-[var(--terminal-border)] text-[var(--terminal-text-muted)] flex items-center justify-center shrink-0 cursor-pointer hover:text-[var(--terminal-text-secondary)] disabled:opacity-30 transition-colors" title="Attach image">
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48" /></svg>
                      </button>
                      <input
                        type="text"
                        value={replyText}
                        onChange={(e) => setReplyText(e.target.value)}
                        onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleReply(); } }}
                        onPaste={handlePaste}
                        placeholder="Send a follow-up directive..."
                        disabled={replying}
                        className="flex-1 px-3 py-1.5 text-xs rounded border bg-[var(--terminal-bg)] text-[var(--terminal-text)] outline-none"
                        style={{ borderColor: 'var(--terminal-border)' }}
                      />
                      <button
                        onClick={handleReply}
                        disabled={replying || (!replyText.trim() && attachments.length === 0)}
                        className="px-4 py-1.5 text-xs rounded font-semibold cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
                        style={{ background: '#1565C0', color: '#fff' }}
                      >
                        {replying ? '...' : 'Send'}
                      </button>
                    </div>
                  </div>
                )}

                {/* Save wave button */}
                {waveTree.allDone && currentActiveWave && onSave && (
                  <div className="px-4 py-2 border-t shrink-0 flex justify-end" style={{ borderColor: 'var(--terminal-border)' }}>
                    <button
                      onClick={handleSave}
                      className="px-4 py-1.5 text-xs rounded font-semibold cursor-pointer"
                      style={{ background: '#1565C022', color: '#64B5F6', border: '1px solid #1565C044' }}
                    >
                      Save Wave
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Right: History sidebar (resizable) */}
          <div className="shrink-0 border-l flex flex-col relative" style={{ width: sidebarW, borderColor: 'var(--terminal-border)', background: 'var(--hud-bg-alt)' }}>
            {/* Resize handle */}
            <div
              className="absolute top-0 bottom-0 w-1.5 cursor-col-resize hover:bg-[var(--accent)] z-10"
              style={{ left: -2 }}
              onMouseDown={handleSidebarResizeStart}
            />
            {/* New Wave button */}
            <div className="p-3 pb-0">
              <button
                onClick={() => { setReplayData(null); setSelectedWaveIdx(-1); setComposingNew(true); waveTree.reset(); }}
                className="w-full px-3 py-1.5 text-[11px] font-bold rounded-lg cursor-pointer transition-colors"
                style={{
                  background: !replayData && selectedWaveIdx < 0 ? '#B71C1C' : 'var(--terminal-inline-bg)',
                  color: !replayData && selectedWaveIdx < 0 ? '#fff' : 'var(--terminal-text-secondary)',
                  border: '1px solid',
                  borderColor: !replayData && selectedWaveIdx < 0 ? '#B71C1C' : 'var(--terminal-border)',
                }}
              >
                + New Wave
              </button>
            </div>

            {/* Active waves */}
            {activeWaves.length > 0 && (
              <div className="p-3">
                <div className="text-[10px] font-bold text-[var(--terminal-text-muted)] uppercase tracking-wider mb-2">
                  Active
                </div>
                <div className="flex flex-col gap-1.5">
                  {activeWaves.map((w, i) => (
                    <button
                      key={w.id}
                      onClick={() => { setSelectedWaveIdx(i); setReplayData(null); setComposingNew(false); waveTree.reset(); }}
                      className="text-left p-2 rounded-lg cursor-pointer transition-colors"
                      style={{
                        background: selectedWaveIdx === i && !replayData ? 'var(--terminal-bg)' : 'transparent',
                        border: selectedWaveIdx === i && !replayData ? '1px solid var(--accent)' : '1px solid transparent',
                      }}
                    >
                      <div className="flex items-center gap-1.5">
                        <span className="w-2 h-2 rounded-full bg-red-500 shrink-0 animate-pulse" />
                        <span className="text-[11px] text-[var(--terminal-text)] truncate font-medium">
                          {w.directive.slice(0, 40)}{w.directive.length > 40 ? '...' : ''}
                        </span>
                      </div>
                      <div className="text-[9px] text-[var(--terminal-text-muted)] mt-0.5 pl-3.5">
                        {w.rootJobs.length} role{w.rootJobs.length !== 1 ? 's' : ''}
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Past waves */}
            <div className="flex-1 overflow-y-auto p-3">
              <div className="text-[10px] font-bold text-[var(--terminal-text-muted)] uppercase tracking-wider mb-2">
                Past Waves ({pastWaves.length})
              </div>
              {pastWaves.length === 0 && (
                <div className="text-[10px] text-[var(--terminal-text-muted)] italic">
                  No past waves yet
                </div>
              )}
              <div className="flex flex-col gap-1.5">
                {pastWaves.map((w) => (
                  <PastWaveCard
                    key={w.id}
                    wave={w}
                    active={replayData?.id === w.id}
                    onLoad={() => handleLoadPastWave(w.id)}
                  />
                ))}
              </div>
            </div>

            {/* Git status — bottom of sidebar */}
            {codeGitBrief && (
              <button
                onClick={onOpenSaveModal}
                disabled={!onOpenSaveModal}
                className="px-3 py-2.5 border-t shrink-0 flex items-center gap-1.5 w-full text-left hover:bg-white/5 transition-colors cursor-pointer disabled:cursor-default"
                style={{ borderColor: 'var(--terminal-border)' }}
              >
                <span className="w-2 h-2 rounded-full shrink-0" style={{ background: codeGitBrief.dirty ? 'var(--idle-amber)' : '#2E7D32' }} />
                <span className="text-[10px] font-mono text-[var(--terminal-text-muted)] truncate">{codeGitBrief.branch}</span>
                {codeGitBrief.dirty && (
                  <span className="text-[9px] ml-auto shrink-0" style={{ color: 'var(--idle-amber)' }}>
                    {codeGitBrief.count} unsaved
                  </span>
                )}
                {!codeGitBrief.dirty && (
                  <span className="text-[9px] text-green-400 ml-auto shrink-0">clean</span>
                )}
              </button>
            )}
          </div>
        </div>
      </>
  );

  /* ─── Inline mode (Pro view): render content directly ─── */
  if (inline) {
    return (
      <div className="flex flex-col h-full w-full" style={{ background: 'var(--terminal-bg)' }}>
        {innerContent}
      </div>
    );
  }

  /* ─── Overlay mode (normal view): side panel with dimmer ─── */
  return (
    <>
      <div
        className="dimmer fixed top-0 left-0 bottom-0 bg-black/30 z-40 open"
        style={{ right: panelRight }}
        onClick={onClose}
      />
      <div
        className="fixed top-0 bottom-0 z-50 flex flex-col"
        style={{
          right: panelRight,
          width: panelWidth,
          background: 'var(--terminal-bg)',
          borderLeft: '1px solid var(--terminal-border)',
          transition: isResizing ? 'none' : 'width 0.2s ease',
        }}
      >
        <div
          className="absolute top-0 bottom-0 w-1 cursor-col-resize hover:bg-[var(--accent)] z-50"
          style={{ left: 0 }}
          onMouseDown={handleResizeStart}
        />
        {innerContent}
      </div>
    </>
  );
}

/* ─── Build replay nodes (converts JSON replay → WaveNode map) ─── */

function buildReplayNodes(
  orgNodes: Record<string, OrgNode>,
  rootRoleId: string,
  replayRoles: WaveReplay['roles'],
): Map<string, WaveNode> {
  const nodes = new Map<string, WaveNode>();

  const addNode = (roleId: string) => {
    const org = orgNodes[roleId];
    if (!org || nodes.has(roleId)) return;
    nodes.set(roleId, {
      sessionId: '', roleId, roleName: org.name,
      children: org.children, status: 'not-dispatched',
      events: [], streamStatus: 'idle',
    });
    org.children.forEach(addNode);
  };

  const root = orgNodes[rootRoleId];
  if (root) {
    nodes.set(rootRoleId, {
      sessionId: '', roleId: rootRoleId, roleName: 'CEO',
      children: root.children, status: 'not-dispatched',
      events: [], streamStatus: 'idle',
    });
    root.children.forEach(addNode);
  }

  for (const r of replayRoles) {
    const existing = nodes.get(r.roleId);
    if (existing) {
      const isRunning = isMessageActive(r.status as any);
      nodes.set(r.roleId, {
        ...existing,
        sessionId: r.sessionId ?? r.jobId ?? '',
        status: (r.status as WaveNode['status']) || 'done',
        events: r.events,
        streamStatus: isRunning ? 'connecting' : 'done',
      });
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const children = r.childSessions ?? (r as any).childJobs ?? [];
    for (const c of children) {
      const child = nodes.get(c.roleId);
      if (child) {
        nodes.set(c.roleId, {
          ...child,
          sessionId: c.sessionId ?? (c as any).jobId ?? '', status: (c.status as WaveNode['status']) || 'done',
          events: c.events, streamStatus: 'done',
        });
      }
    }
  }

  return nodes;
}

/* ─── Past Wave Card ─── */

function PastWaveCard({ wave, active, onLoad }: { wave: Wave; active?: boolean; onLoad?: () => void }) {
  const m = wave.id.match(/^(\d{4})(\d{2})(\d{2})-(\d{2})(\d{2})/);
  const date = m ? `${m[1]}-${m[2]}-${m[3]} ${m[4]}:${m[5]}` : wave.id;

  return (
    <div
      className="rounded-lg cursor-pointer transition-colors hover:bg-[var(--terminal-bg)]"
      style={{
        border: active ? '1px solid var(--accent)' : '1px solid var(--terminal-border)',
        background: active ? 'var(--terminal-bg)' : undefined,
      }}
      onClick={onLoad}
    >
      <div className="p-2">
        <div className="flex items-center gap-1.5">
          {wave.hasRunning ? (
            <span className="w-1.5 h-1.5 rounded-full animate-pulse shrink-0" style={{ background: '#4CAF50' }} />
          ) : (
            <span className="text-[10px]">{'▶'}</span>
          )}
          <span className="text-[10px] text-[var(--terminal-text-muted)]">{date}</span>
          {wave.hasRunning ? (
            <span className="text-[9px] ml-auto animate-pulse" style={{ color: '#4CAF50' }}>
              running
            </span>
          ) : wave.commit ? (
            <span className="text-[9px] text-green-400 ml-auto font-mono" title={`Committed: ${wave.commit.sha}`}>
              {wave.commit.sha.slice(0, 7)}
            </span>
          ) : wave.rolesCount ? (
            <span className="text-[9px] ml-auto" style={{ color: 'var(--idle-amber)' }} title="No commit recorded">
              uncommitted
            </span>
          ) : null}
        </div>
        <div className="text-[10px] text-[var(--terminal-text-secondary)] mt-0.5 line-clamp-2 leading-relaxed">
          {wave.directive.slice(0, 80)}
        </div>
        {wave.rolesCount ? (
          <div className="text-[9px] text-[var(--terminal-text-muted)] mt-0.5">{wave.rolesCount} role{wave.rolesCount !== 1 ? 's' : ''}</div>
        ) : null}
      </div>
    </div>
  );
}
