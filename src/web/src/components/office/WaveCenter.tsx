import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import useWaveTree from '../../hooks/useWaveTree';
import OrgTreePreview from './OrgTreePreview';
import OrgTreeLive from './OrgTreeLive';
import EventRow from '../common/EventRow';
import type { OrgNode, Wave, WaveReplay } from '../../types';
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
  rootJobs: Array<{ jobId: string; roleId: string; roleName: string }>;
  startedAt: number;
}

interface Props {
  orgNodes: Record<string, OrgNode>;
  rootRoleId: string;
  cLevelRoles: { id: string; name: string }[];
  pastWaves: Wave[];
  /** Currently active waves passed from parent */
  activeWaves: ActiveWave[];
  onDispatch: (directive: string, targetRoles?: string[]) => void;
  onClose: () => void;
  onDone?: () => void;
  onSave?: (directive: string, jobIds: string[]) => Promise<void>;
  onOpenKnowledgeDoc?: (docId: string) => void;
  terminalWidth?: number;
}

type ViewMode = 'dispatch' | 'monitor';

export default function WaveCenter({
  orgNodes, rootRoleId, cLevelRoles, pastWaves,
  activeWaves, onDispatch, onClose, onDone, onSave, onOpenKnowledgeDoc,
  terminalWidth = 0,
}: Props) {
  const [viewMode, setViewMode] = useState<ViewMode>(activeWaves.length > 0 ? 'monitor' : 'dispatch');
  const [selectedWaveIdx, setSelectedWaveIdx] = useState(0);
  const [directive, setDirective] = useState('');
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const [replayData, setReplayData] = useState<WaveReplay | null>(null);
  const [replayLoading, setReplayLoading] = useState(false);

  // OrgTree role selection (for dispatch mode)
  const [activeRoles, setActiveRoles] = useState<Set<string>>(() => {
    const all = new Set<string>();
    const root = orgNodes[rootRoleId];
    if (root) {
      for (const cId of root.children) {
        all.add(cId);
        const cNode = orgNodes[cId];
        if (cNode) {
          for (const subId of cNode.children) all.add(subId);
        }
      }
    }
    return all;
  });

  const { panelRight, panelWidth, isResizing, handleResizeStart } = usePanelResize(terminalWidth, 720);

  // Auto-switch to monitor when a wave starts
  useEffect(() => {
    if (activeWaves.length > 0 && viewMode === 'dispatch') {
      setViewMode('monitor');
      setSelectedWaveIdx(0);
    }
  }, [activeWaves.length, viewMode]);

  // Focus input on dispatch mode
  useEffect(() => {
    if (viewMode === 'dispatch') {
      setTimeout(() => inputRef.current?.focus(), 100);
    }
  }, [viewMode]);

  const handleToggleRole = useCallback((roleId: string, active: boolean) => {
    setActiveRoles(prev => {
      const next = new Set(prev);
      if (active) next.add(roleId);
      else next.delete(roleId);
      return next;
    });
  }, []);

  const activeCLevelCount = cLevelRoles.filter(r => activeRoles.has(r.id)).length;

  const handleSubmit = () => {
    if (!directive.trim() || activeCLevelCount === 0) return;
    const root = orgNodes[rootRoleId];
    let totalCount = 0;
    if (root) {
      for (const cId of root.children) {
        totalCount++;
        const cNode = orgNodes[cId];
        if (cNode) totalCount += cNode.children.length;
      }
    }
    const allSelected = activeRoles.size >= totalCount;
    const targetRoles = allSelected ? undefined : Array.from(activeRoles);
    onDispatch(directive.trim(), targetRoles);
    setDirective('');
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
      handleSubmit();
    }
    if (e.key === 'Escape' && viewMode === 'dispatch') {
      onClose();
    }
  };

  const handleLoadPastWave = useCallback(async (waveId: string) => {
    setReplayLoading(true);
    setReplayData(null);
    setSelectedWaveIdx(-1); // deselect active waves
    setViewMode('monitor');
    try {
      const detail = await api.getWaveDetail(waveId);
      if (detail.replay) {
        setReplayData(detail.replay);
      }
    } catch (err) {
      console.error('Failed to load wave replay:', err);
    } finally {
      setReplayLoading(false);
    }
  }, []);

  const currentActiveWave = selectedWaveIdx >= 0 ? (activeWaves[selectedWaveIdx] ?? null) : null;
  const hasOrgData = !!rootRoleId && Object.keys(orgNodes).length > 0;

  return (
    <>
      {/* Dimmer */}
      <div className="dimmer fixed top-0 left-0 bottom-0 bg-black/30 z-40 open" style={{ right: panelRight }} onClick={onClose} />

      {/* Main Panel */}
      <div
        className={`side-panel open fixed top-0 h-full z-50 flex flex-col border-l-[3px] shadow-[-4px_0_20px_rgba(0,0,0,0.4)] ${isResizing ? 'resizing' : ''}`}
        style={{ right: panelRight, width: panelWidth, background: 'var(--terminal-bg)', borderLeftColor: '#B71C1C' }}
      >
        {/* Resize handle */}
        <div
          className={`absolute top-0 -left-[5px] w-[10px] h-full cursor-col-resize z-[60] transition-colors ${isResizing ? 'bg-white/10' : 'hover:bg-white/5'}`}
          onMouseDown={handleResizeStart}
        />

        {/* Header */}
        <div className="px-5 py-3 text-white relative shrink-0" style={{ background: 'linear-gradient(135deg, #B71C1C, #D32F2F)' }}>
          <button
            onClick={onClose}
            className="absolute top-3 right-3 w-7 h-7 rounded-full bg-white/20 text-white flex items-center justify-center text-lg hover:bg-white/30 cursor-pointer"
          >
            &times;
          </button>
          <div className="text-lg font-bold">Wave Center</div>
          <div className="text-xs opacity-70 mt-0.5">
            {activeWaves.length > 0
              ? `${activeWaves.length} active wave${activeWaves.length !== 1 ? 's' : ''}`
              : 'Broadcast directives to your organization'}
          </div>
        </div>

        {/* Mode tabs */}
        <div className="flex shrink-0" style={{ borderBottom: '1px solid var(--terminal-border)' }}>
          <button
            onClick={() => setViewMode('dispatch')}
            className="px-4 py-2 text-xs font-semibold cursor-pointer transition-colors"
            style={{
              color: viewMode === 'dispatch' ? '#D32F2F' : 'var(--terminal-text-muted)',
              borderBottom: viewMode === 'dispatch' ? '2px solid #D32F2F' : '2px solid transparent',
            }}
          >
            New Wave
          </button>
          <button
            onClick={() => setViewMode('monitor')}
            className="px-4 py-2 text-xs font-semibold cursor-pointer transition-colors flex items-center gap-1.5"
            style={{
              color: viewMode === 'monitor' ? '#D32F2F' : 'var(--terminal-text-muted)',
              borderBottom: viewMode === 'monitor' ? '2px solid #D32F2F' : '2px solid transparent',
            }}
          >
            Monitor
            {activeWaves.length > 0 && (
              <span className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse" />
            )}
          </button>
          <button
            onClick={() => setViewMode('monitor')}
            className="px-4 py-2 text-xs font-semibold cursor-pointer transition-colors ml-auto"
            style={{
              color: 'var(--terminal-text-muted)',
            }}
          >
            History ({pastWaves.length})
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 flex min-h-0">
          {/* Left: Main content */}
          <div className="flex-1 flex flex-col min-w-0 min-h-0">
            {viewMode === 'dispatch' ? (
              <DispatchView
                orgNodes={orgNodes}
                rootId={rootRoleId}
                hasOrgData={hasOrgData}
                cLevelRoles={cLevelRoles}
                activeRoles={activeRoles}
                onToggleRole={handleToggleRole}
                directive={directive}
                onDirectiveChange={setDirective}
                onSubmit={handleSubmit}
                onKeyDown={handleKeyDown}
                activeCLevelCount={activeCLevelCount}
                inputRef={inputRef}
              />
            ) : currentActiveWave ? (
              <MonitorView
                wave={currentActiveWave}
                orgNodes={orgNodes}
                rootRoleId={rootRoleId}
                onDone={onDone}
                onSave={onSave}
                onOpenKnowledgeDoc={onOpenKnowledgeDoc}
              />
            ) : replayData ? (
              <ReplayView replay={replayData} onOpenKnowledgeDoc={onOpenKnowledgeDoc} />
            ) : replayLoading ? (
              <div className="flex-1 flex items-center justify-center text-[var(--terminal-text-muted)] text-sm">
                Loading wave data...
              </div>
            ) : (
              <div className="flex-1 flex flex-col items-center justify-center text-[var(--terminal-text-muted)] gap-3 p-8">
                <span className="text-3xl">{'🌊'}</span>
                <div className="text-sm">No active waves</div>
                <div className="text-[10px]">Select a past wave from the list, or start a new one</div>
                <button
                  onClick={() => setViewMode('dispatch')}
                  className="px-4 py-2 text-xs font-semibold rounded-lg cursor-pointer"
                  style={{ background: '#B71C1C', color: '#fff' }}
                >
                  Start New Wave
                </button>
              </div>
            )}
          </div>

          {/* Right: Wave list sidebar */}
          <div className="w-[220px] shrink-0 border-l flex flex-col" style={{ borderColor: 'var(--terminal-border)', background: 'var(--hud-bg-alt)' }}>
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
                      onClick={() => { setViewMode('monitor'); setSelectedWaveIdx(i); setReplayData(null); }}
                      className="text-left p-2 rounded-lg cursor-pointer transition-colors"
                      style={{
                        background: viewMode === 'monitor' && selectedWaveIdx === i ? 'var(--terminal-bg)' : 'transparent',
                        border: viewMode === 'monitor' && selectedWaveIdx === i ? '1px solid var(--accent)' : '1px solid transparent',
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
                    onLoad={w.hasReplay ? () => handleLoadPastWave(w.id) : undefined}
                  />
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}

/* ─── Dispatch View ─── */

function DispatchView({
  orgNodes, rootId, hasOrgData, cLevelRoles, activeRoles, onToggleRole,
  directive, onDirectiveChange, onSubmit, onKeyDown, activeCLevelCount,
  inputRef,
}: {
  orgNodes: Record<string, OrgNode>;
  rootId: string;
  hasOrgData: boolean;
  cLevelRoles: { id: string; name: string }[];
  activeRoles: Set<string>;
  onToggleRole: (roleId: string, active: boolean) => void;
  directive: string;
  onDirectiveChange: (v: string) => void;
  onSubmit: () => void;
  onKeyDown: (e: React.KeyboardEvent) => void;
  activeCLevelCount: number;
  inputRef: React.RefObject<HTMLTextAreaElement | null>;
}) {
  return (
    <div className="flex-1 overflow-y-auto p-5 space-y-4">
      {/* Interactive Org Chart */}
      {hasOrgData && (
        <OrgTreePreview
          orgNodes={orgNodes}
          rootId={rootId}
          activeRoles={activeRoles}
          onToggleRole={onToggleRole}
        />
      )}

      {/* Fallback role chips */}
      {!hasOrgData && (
        <div>
          <label className="block text-[11px] font-bold text-[var(--terminal-text-secondary)] uppercase tracking-wider mb-2">
            Dispatching to
          </label>
          <div className="flex gap-2 flex-wrap">
            {cLevelRoles.length > 0 ? cLevelRoles.map((r) => (
              <span
                key={r.id}
                className="px-3 py-1.5 text-xs font-semibold rounded-lg"
                style={{ background: '#B71C1C22', color: '#E57373', border: '1px solid #B71C1C44' }}
              >
                {r.id.toUpperCase()} &middot; {r.name}
              </span>
            )) : (
              <span className="text-xs text-[var(--terminal-text-muted)] italic">No C-Level roles found</span>
            )}
          </div>
        </div>
      )}

      {/* Directive input */}
      <div>
        <label className="block text-[11px] font-bold text-[var(--terminal-text-secondary)] uppercase tracking-wider mb-2">
          Directive
        </label>
        <textarea
          ref={inputRef}
          value={directive}
          onChange={(e) => onDirectiveChange(e.target.value)}
          onKeyDown={onKeyDown}
          placeholder="e.g. Report current status across all departments"
          className="w-full h-28 p-3 rounded-lg border text-sm resize-none focus:outline-none transition-colors"
          style={{
            background: 'var(--hud-bg-alt)',
            border: '1px solid var(--terminal-border)',
            color: 'var(--terminal-text)',
          }}
        />
        <div className="flex items-center justify-between mt-2">
          <span className="text-[10px] text-[var(--terminal-text-muted)]">Cmd+Enter to dispatch</span>
          <button
            onClick={onSubmit}
            disabled={!directive.trim() || activeCLevelCount === 0}
            className="px-5 py-2 text-sm text-white rounded-lg font-semibold cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
            style={{ background: '#B71C1C' }}
          >
            Dispatch to {activeCLevelCount} Role{activeCLevelCount !== 1 ? 's' : ''}
          </button>
        </div>
      </div>
    </div>
  );
}

/* ─── Monitor View ─── */

function MonitorView({
  wave, orgNodes, rootRoleId, onDone, onSave, onOpenKnowledgeDoc,
}: {
  wave: ActiveWave;
  orgNodes: Record<string, OrgNode>;
  rootRoleId: string;
  onDone?: () => void;
  onSave?: (directive: string, jobIds: string[]) => Promise<void>;
  onOpenKnowledgeDoc?: (docId: string) => void;
}) {
  const { nodes, selectedRoleId, selectNode, progress, allDone, connectStream } = useWaveTree(wave.rootJobs, orgNodes, rootRoleId);
  const [elapsed, setElapsed] = useState(0);
  const [collapsedThinking, setCollapsedThinking] = useState<Set<number>>(new Set());
  const [replyText, setReplyText] = useState('');
  const [replying, setReplying] = useState(false);
  const [saving, setSaving] = useState(false);
  const outputRef = useRef<HTMLDivElement>(null);
  const doneFired = useRef(false);

  const handleSave = useCallback(async () => {
    if (!onSave) return;
    setSaving(true);
    try {
      const jobIds = wave.rootJobs.map(j => j.jobId);
      await onSave(wave.directive, jobIds);
    } catch (err) {
      console.error('Save failed:', err);
    } finally {
      setSaving(false);
    }
  }, [onSave, wave]);

  const handleReply = useCallback(async () => {
    if (!selectedRoleId || !replyText.trim()) return;
    const node = nodes.get(selectedRoleId);
    if (!node?.jobId || (node.status !== 'awaiting_input' && node.status !== 'done')) return;

    setReplying(true);
    try {
      const { jobId: newJobId } = await api.replyToJob(node.jobId, replyText.trim());
      setReplyText('');
      connectStream(newJobId, selectedRoleId);
    } catch (err) {
      console.error('Reply failed:', err);
    } finally {
      setReplying(false);
    }
  }, [selectedRoleId, replyText, nodes, connectStream]);

  const handleForceStop = useCallback(async (roleId: string) => {
    const node = nodes.get(roleId);
    if (!node?.jobId) return;
    try { await api.abortJob(node.jobId); } catch { /* ignore */ }
  }, [nodes]);

  const handleStopAll = useCallback(async () => {
    for (const [, node] of nodes) {
      if ((node.status === 'running' || node.status === 'awaiting_input') && node.jobId) {
        try { await api.abortJob(node.jobId); } catch { /* ignore */ }
      }
    }
  }, [nodes]);

  // Timer
  useEffect(() => {
    const timer = setInterval(() => {
      setElapsed(Math.floor((Date.now() - wave.startedAt) / 1000));
    }, 1000);
    return () => clearInterval(timer);
  }, [wave.startedAt]);

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
    userScrolledUp.current = false;
    if (outputRef.current) outputRef.current.scrollTop = outputRef.current.scrollHeight;
  }, [selectedRoleId]);

  useEffect(() => {
    if (outputRef.current && !userScrolledUp.current) {
      outputRef.current.scrollTop = outputRef.current.scrollHeight;
    }
  }, [nodes]);

  // Fire onDone + auto-save
  useEffect(() => {
    if (allDone && !doneFired.current) {
      doneFired.current = true;
      onDone?.();
      // Auto-save wave on completion
      if (onSave) {
        const jobIds = wave.rootJobs.map(j => j.jobId);
        onSave(wave.directive, jobIds).catch(() => {});
      }
    }
    if (!allDone && doneFired.current) {
      doneFired.current = false;
    }
  }, [allDone, onDone, onSave, wave]);

  const fmtTime = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;

  const selectedNode = selectedRoleId ? nodes.get(selectedRoleId) : null;
  const selectedColor = selectedRoleId ? (ROLE_COLORS[selectedRoleId] ?? '#888') : '#888';

  const toggleThinking = (seq: number) => {
    setCollapsedThinking((prev) => {
      const next = new Set(prev);
      if (next.has(seq)) next.delete(seq);
      else next.add(seq);
      return next;
    });
  };

  return (
    <div className="flex flex-col flex-1 min-h-0">
      {/* Wave info bar */}
      <div className="px-4 py-2 border-b flex items-center gap-3 shrink-0" style={{ borderColor: 'var(--terminal-border)' }}>
        <div
          className="w-3 h-3 rounded-full shrink-0"
          style={{
            background: allDone ? '#2E7D32' : '#B71C1C',
            animation: allDone ? undefined : 'wave-pulse 2s ease-in-out infinite',
          }}
        />
        <span className="text-[var(--terminal-text-secondary)] text-xs italic flex-1 min-w-0 truncate">
          &ldquo;{wave.directive}&rdquo;
        </span>
        <span className="text-[var(--terminal-text-muted)] text-xs font-mono shrink-0">{fmtTime(elapsed)}</span>
        {progress.awaitingInput > 0 && (
          <span className="text-[10px] px-2 py-0.5 rounded-full font-semibold shrink-0" style={{ background: '#F59E0B22', color: '#F59E0B' }}>
            {progress.awaitingInput} awaiting
          </span>
        )}
        <span className="text-[10px] px-2 py-0.5 rounded-full font-semibold shrink-0" style={{
          background: allDone ? '#2E7D3222' : '#B71C1C22',
          color: allDone ? '#2E7D32' : '#B71C1C',
        }}>
          {progress.done}/{progress.total}
        </span>
        {!allDone && (progress.running > 0 || progress.awaitingInput > 0) && (
          <button
            onClick={handleStopAll}
            className="text-[10px] px-2 py-0.5 rounded font-semibold cursor-pointer shrink-0"
            style={{ background: '#C6282822', color: '#C62828', border: '1px solid #C6282844' }}
          >
            Stop All
          </button>
        )}
      </div>

      {/* Org Tree */}
      <div className="shrink-0 border-b flex flex-col" style={{ borderColor: 'var(--terminal-border)' }}>
        <div className="flex items-center gap-3 px-4 py-1.5">
          <span className="text-[10px] font-bold text-[var(--terminal-text-secondary)] uppercase tracking-wider">
            Org Propagation
          </span>
          <div className="flex gap-x-3 ml-auto">
            {[
              { label: 'running', color: '#FBBF24', dot: true },
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
        </div>
        <div className="overflow-x-auto overflow-y-auto px-3 pb-2" style={{ maxHeight: '30vh' }}>
          <OrgTreeLive
            nodes={nodes}
            rootId={rootRoleId}
            selectedRoleId={selectedRoleId}
            onSelectNode={selectNode}
          />
        </div>
      </div>

      {/* Activity Feed */}
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
              background: selectedNode.status === 'awaiting_input' ? '#F59E0B22' : `${selectedColor}22`,
              color: selectedNode.status === 'awaiting_input' ? '#F59E0B' : selectedColor,
            }}>
              {selectedNode.status === 'running' ? 'Working' :
               selectedNode.status === 'done' ? 'Complete' :
               selectedNode.status === 'error' ? 'Error' :
               selectedNode.status === 'waiting' ? 'Waiting' :
               selectedNode.status === 'awaiting_input' ? 'Awaiting Reply' :
               'Not dispatched'}
            </span>
            {(selectedNode.status === 'running' || selectedNode.status === 'awaiting_input') && selectedNode.jobId && (
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

        {/* Events */}
        <div ref={outputRef} className="flex-1 min-h-0 overflow-y-auto p-4 space-y-1 text-xs font-mono select-text">
          {selectedNode && selectedNode.events.length === 0 && (
            <div className="text-[var(--terminal-text-muted)]">
              {selectedNode.status === 'waiting' ? 'Waiting for dispatch...' :
               selectedNode.status === 'running' ? 'Connecting to activity stream...' :
               selectedNode.status === 'not-dispatched' ? 'This role was not dispatched in this wave.' : ''}
            </div>
          )}
          {selectedNode?.events.map((event) => (
            <EventRow
              key={event.seq}
              event={event}
              isThinkingCollapsed={collapsedThinking.has(event.seq)}
              onToggleThinking={() => toggleThinking(event.seq)}
              onNavigateToJob={(childJobId) => {
                for (const [, node] of nodes) {
                  if (node.jobId === childJobId) {
                    selectNode(node.roleId);
                    return;
                  }
                }
              }}
              onOpenKnowledgeDoc={onOpenKnowledgeDoc}
            />
          ))}
          {selectedNode?.status === 'running' && (
            <span className="inline-block w-2 h-4 bg-green-400 animate-pulse ml-0.5" />
          )}
          {!selectedNode && (
            <div className="flex-1 flex items-center justify-center text-[var(--terminal-text-muted)] text-xs h-full">
              Click a node in the org tree to view activity
            </div>
          )}
        </div>

        {/* Reply input */}
        {selectedNode?.status === 'awaiting_input' && (
          <div className="px-4 py-3 border-t shrink-0" style={{ borderColor: 'var(--terminal-border)', background: '#F59E0B0A' }}>
            <div className="flex items-center gap-2 mb-2">
              <span className="w-2 h-2 rounded-full inline-block" style={{ background: '#F59E0B', animation: 'wave-pulse 1.5s ease-in-out infinite' }} />
              <span className="text-[11px] font-semibold" style={{ color: '#F59E0B' }}>
                {selectedNode.roleName} is waiting for your response
              </span>
            </div>
            <div className="flex gap-2">
              <input
                type="text"
                value={replyText}
                onChange={(e) => setReplyText(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleReply(); } }}
                placeholder="Type your response..."
                disabled={replying}
                className="flex-1 px-3 py-1.5 text-xs rounded border bg-[var(--terminal-bg)] text-[var(--terminal-text)] outline-none"
                style={{ borderColor: 'var(--terminal-border)' }}
                autoFocus
              />
              <button
                onClick={handleReply}
                disabled={replying || !replyText.trim()}
                className="px-4 py-1.5 text-xs rounded font-semibold cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
                style={{ background: '#F59E0B', color: '#000' }}
              >
                {replying ? '...' : 'Reply'}
              </button>
            </div>
          </div>
        )}

        {/* Follow-up */}
        {selectedNode?.status === 'done' && selectedNode.jobId && (
          <div className="px-4 py-3 border-t shrink-0" style={{ borderColor: 'var(--terminal-border)', background: '#1565C00A' }}>
            <div className="flex items-center gap-2 mb-2">
              <span className="text-[11px] font-semibold" style={{ color: '#64B5F6' }}>
                Follow-up to {selectedNode.roleName}
              </span>
            </div>
            <div className="flex gap-2">
              <input
                type="text"
                value={replyText}
                onChange={(e) => setReplyText(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleReply(); } }}
                placeholder="Send a follow-up directive..."
                disabled={replying}
                className="flex-1 px-3 py-1.5 text-xs rounded border bg-[var(--terminal-bg)] text-[var(--terminal-text)] outline-none"
                style={{ borderColor: 'var(--terminal-border)' }}
              />
              <button
                onClick={handleReply}
                disabled={replying || !replyText.trim()}
                className="px-4 py-1.5 text-xs rounded font-semibold cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
                style={{ background: '#1565C0', color: '#fff' }}
              >
                {replying ? '...' : 'Send'}
              </button>
            </div>
          </div>
        )}

        {/* Footer */}
        <div className="px-4 py-2 border-t flex items-center justify-between shrink-0" style={{ borderColor: 'var(--terminal-border)' }}>
          <div className="text-[10px] text-[var(--terminal-text-muted)]">
            {selectedNode && selectedNode.events.length > 0 && `${selectedNode.events.length} events`}
          </div>
          {allDone && (
            <div className="flex items-center gap-2">
              {onSave && (
                <button
                  onClick={handleSave}
                  disabled={saving}
                  className="px-4 py-1.5 text-xs text-white rounded-lg font-semibold cursor-pointer disabled:opacity-50"
                  style={{ background: '#2E7D32' }}
                >
                  {saving ? 'Saving...' : 'Save Wave'}
                </button>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

/* ─── Replay View (read-only past wave) ─── */

function ReplayView({ replay, onOpenKnowledgeDoc }: { replay: WaveReplay; onOpenKnowledgeDoc?: (docId: string) => void }) {
  const [selectedRoleId, setSelectedRoleId] = useState<string | null>(replay.roles[0]?.roleId ?? null);
  const [collapsedThinking, setCollapsedThinking] = useState<Set<number>>(new Set());
  const outputRef = useRef<HTMLDivElement>(null);

  // Build a flat map of all roles (including children) for display
  const allRoles = useMemo(() => {
    const map = new Map<string, { roleId: string; roleName: string; status: string; events: typeof replay.roles[0]['events'] }>();
    for (const r of replay.roles) {
      map.set(r.roleId, { roleId: r.roleId, roleName: r.roleName, status: r.status, events: r.events });
      for (const c of r.childJobs) {
        map.set(c.roleId, { roleId: c.roleId, roleName: c.roleName, status: c.status, events: c.events });
      }
    }
    return map;
  }, [replay]);

  const selectedRole = selectedRoleId ? allRoles.get(selectedRoleId) : null;
  const selectedColor = selectedRoleId ? (ROLE_COLORS[selectedRoleId] ?? '#888') : '#888';

  // Scroll to top when switching roles
  useEffect(() => {
    if (outputRef.current) outputRef.current.scrollTop = 0;
  }, [selectedRoleId]);

  const toggleThinking = (seq: number) => {
    setCollapsedThinking(prev => {
      const next = new Set(prev);
      if (next.has(seq)) next.delete(seq);
      else next.add(seq);
      return next;
    });
  };

  const startedAt = replay.startedAt ? new Date(replay.startedAt).toLocaleString() : '';

  return (
    <div className="flex flex-col flex-1 min-h-0">
      {/* Wave info bar */}
      <div className="px-4 py-2 border-b flex items-center gap-3 shrink-0" style={{ borderColor: 'var(--terminal-border)' }}>
        <div className="w-3 h-3 rounded-full shrink-0" style={{ background: '#2E7D32' }} />
        <span className="text-[var(--terminal-text-secondary)] text-xs italic flex-1 min-w-0 truncate">
          &ldquo;{replay.directive}&rdquo;
        </span>
        <span className="text-[10px] px-2 py-0.5 rounded-full font-semibold shrink-0" style={{ background: '#2E7D3222', color: '#2E7D32' }}>
          REPLAY
        </span>
        <span className="text-[var(--terminal-text-muted)] text-[10px] shrink-0">{startedAt}</span>
      </div>

      {/* Role selector (horizontal pills) */}
      <div className="px-4 py-2 border-b shrink-0 flex gap-2 flex-wrap" style={{ borderColor: 'var(--terminal-border)' }}>
        {Array.from(allRoles.values()).map(r => {
          const color = ROLE_COLORS[r.roleId] ?? '#888';
          const isSelected = r.roleId === selectedRoleId;
          return (
            <button
              key={r.roleId}
              onClick={() => setSelectedRoleId(r.roleId)}
              className="px-2.5 py-1 text-[10px] font-bold rounded-lg cursor-pointer transition-colors uppercase"
              style={{
                background: isSelected ? `${color}22` : 'transparent',
                color: isSelected ? color : 'var(--terminal-text-muted)',
                border: isSelected ? `1.5px solid ${color}` : '1.5px solid var(--terminal-border)',
              }}
            >
              {r.roleId}
              <span className="ml-1 text-[8px] font-normal opacity-70">
                {r.status === 'done' ? '✓' : r.status === 'error' ? '✗' : '?'}
              </span>
            </button>
          );
        })}
      </div>

      {/* Selected role header */}
      {selectedRole && (
        <div className="px-4 py-2 border-b shrink-0 flex items-center gap-2" style={{ borderColor: 'var(--terminal-border)' }}>
          <div className="w-2 h-2 rounded-full" style={{ background: selectedColor }} />
          <span className="text-[var(--terminal-text)] font-bold text-xs">{selectedRole.roleId.toUpperCase()}</span>
          <span className="text-[var(--terminal-text-muted)] text-xs">{selectedRole.roleName}</span>
          <span className="ml-auto text-[10px] px-2 py-0.5 rounded-full font-semibold" style={{
            background: `${selectedColor}22`, color: selectedColor,
          }}>
            {selectedRole.status === 'done' ? 'Complete' : selectedRole.status === 'error' ? 'Error' : selectedRole.status}
          </span>
          <span className="text-[10px] text-[var(--terminal-text-muted)]">{selectedRole.events.length} events</span>
        </div>
      )}

      {/* Events */}
      <div ref={outputRef} className="flex-1 min-h-0 overflow-y-auto p-4 space-y-1 text-xs font-mono select-text">
        {selectedRole && selectedRole.events.length === 0 && (
          <div className="text-[var(--terminal-text-muted)]">No events recorded for this role.</div>
        )}
        {selectedRole?.events.map((event) => (
          <EventRow
            key={event.seq}
            event={event}
            isThinkingCollapsed={collapsedThinking.has(event.seq)}
            onToggleThinking={() => toggleThinking(event.seq)}
            onOpenKnowledgeDoc={onOpenKnowledgeDoc}
          />
        ))}
        {!selectedRole && (
          <div className="flex items-center justify-center text-[var(--terminal-text-muted)] text-xs h-full">
            Select a role to view its activity
          </div>
        )}
      </div>
    </div>
  );
}

/* ─── Past Wave Card ─── */

function PastWaveCard({ wave, active, onLoad }: { wave: Wave; active?: boolean; onLoad?: () => void }) {
  const preview = (wave.directive ?? wave.content.replace(/^#{1,6}\s+/gm, '').replace(/\n+/g, ' ')).slice(0, 80);
  // Parse date from wave id like "20260310-130400-wave"
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
          <span className="text-[10px]">{onLoad ? '▶' : '📋'}</span>
          <span className="text-[10px] text-[var(--terminal-text-muted)]">{date}</span>
          {wave.rolesCount ? (
            <span className="text-[9px] text-[var(--terminal-text-muted)] ml-auto">{wave.rolesCount}R</span>
          ) : null}
        </div>
        <div className="text-[10px] text-[var(--terminal-text-secondary)] mt-0.5 line-clamp-2 leading-relaxed">
          {preview}
        </div>
      </div>
    </div>
  );
}
