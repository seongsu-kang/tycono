import { useState, useEffect, useRef, useCallback } from 'react';
import useWaveTree from '../../hooks/useWaveTree';
import OrgTreeLive from './OrgTreeLive';
import EventRow from '../common/EventRow';
import type { OrgNode } from '../../types';
import { api } from '../../api/client';

const ROLE_COLORS: Record<string, string> = {
  cto: '#1565C0', cbo: '#E65100', pm: '#2E7D32',
  engineer: '#4A148C', designer: '#AD1457', qa: '#00695C',
  'data-analyst': '#0277BD',
};

interface Props {
  directive: string;
  rootJobs: Array<{ jobId: string; roleId: string; roleName: string }>;
  orgNodes: Record<string, OrgNode>;
  rootRoleId: string;
  onClose: () => void;
  onMinimize: () => void;
  onDone?: () => void;
  onSave?: (jobIds: string[]) => Promise<void>;
  onOpenKnowledgeDoc?: (docId: string) => void;
}

export default function WaveCommandCenter({
  directive, rootJobs, orgNodes, rootRoleId,
  onClose, onMinimize, onDone, onOpenKnowledgeDoc, onSave,
}: Props) {
  const { nodes, selectedRoleId, selectNode, progress, allDone, connectStream } = useWaveTree(rootJobs, orgNodes, rootRoleId);
  const [elapsed, setElapsed] = useState(0);
  const [collapsedThinking, setCollapsedThinking] = useState<Set<number>>(new Set());
  const [replyText, setReplyText] = useState('');
  const [replying, setReplying] = useState(false);
  const [saving, setSaving] = useState(false);
  const outputRef = useRef<HTMLDivElement>(null);
  const startTime = useRef(Date.now());
  const doneFired = useRef(false);

  const handleSave = useCallback(async () => {
    if (!onSave) return;
    setSaving(true);
    try {
      const jobIds = rootJobs.map(j => j.jobId);
      await onSave(jobIds);
    } catch (err) {
      console.error('Save failed:', err);
    } finally {
      setSaving(false);
      onClose();
    }
  }, [onSave, rootJobs, onClose]);

  const handleReply = useCallback(async () => {
    if (!selectedRoleId || !replyText.trim()) return;
    const node = nodes.get(selectedRoleId);
    if (!node?.jobId || node.status !== 'awaiting_input') return;

    setReplying(true);
    try {
      const { jobId: newJobId } = await api.replyToJob(node.jobId, replyText.trim());
      setReplyText('');
      // Connect to the new continuation job stream
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
    try {
      await api.abortJob(node.jobId);
    } catch (err) {
      console.error('Abort failed:', err);
    }
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
      setElapsed(Math.floor((Date.now() - startTime.current) / 1000));
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  // Auto-scroll
  useEffect(() => {
    if (outputRef.current) {
      outputRef.current.scrollTop = outputRef.current.scrollHeight;
    }
  }, [selectedRoleId, nodes]);

  // Fire onDone callback once
  useEffect(() => {
    if (allDone && !doneFired.current) {
      doneFired.current = true;
      onDone?.();
    }
  }, [allDone, onDone]);

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
    <>
      {/* Dimmer — no auto-close on backdrop click */}
      <div className="fixed inset-0 bg-black/40 z-[60] backdrop-blur-sm" />

      {/* Main panel */}
      <div className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[960px] max-w-[95vw] h-[85vh] z-[61] bg-[var(--terminal-bg)] rounded-2xl shadow-2xl overflow-hidden flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3 border-b border-[var(--terminal-border)] shrink-0">
          <div className="flex items-center gap-3">
            <div
              className="w-3 h-3 rounded-full"
              style={{
                background: allDone ? '#2E7D32' : '#B71C1C',
                animation: allDone ? undefined : 'wave-pulse 2s ease-in-out infinite',
              }}
            />
            <div>
              <span className="text-[var(--terminal-text)] font-bold text-sm">
                {allDone ? 'WAVE COMPLETE' : 'WAVE COMMAND CENTER'}
              </span>
            </div>
          </div>
          <div className="flex items-center gap-4">
            <span className="text-[var(--terminal-text-muted)] text-xs font-mono">{fmtTime(elapsed)}</span>
            {progress.awaitingInput > 0 && (
              <span className="text-xs px-2 py-0.5 rounded-full font-semibold" style={{
                background: '#F59E0B22',
                color: '#F59E0B',
              }}>
                {progress.awaitingInput} awaiting reply
              </span>
            )}
            <span className="text-xs px-2 py-0.5 rounded-full font-semibold" style={{
              background: allDone ? '#2E7D3222' : '#B71C1C22',
              color: allDone ? '#2E7D32' : '#B71C1C',
            }}>
              {progress.done}/{progress.total} done
            </span>
            {!allDone && (progress.running > 0 || progress.awaitingInput > 0) && (
              <button
                onClick={handleStopAll}
                className="text-xs px-2 py-0.5 rounded font-semibold cursor-pointer"
                style={{ background: '#C6282822', color: '#C62828', border: '1px solid #C6282844' }}
                title="Stop all running jobs"
              >
                Stop All
              </button>
            )}
            <button
              onClick={onMinimize}
              title="Minimize"
              className="text-[var(--terminal-text-muted)] hover:text-[var(--terminal-text)] text-sm cursor-pointer px-1"
            >
              &#x2013;
            </button>
            <button
              onClick={onClose}
              className="text-[var(--terminal-text-muted)] hover:text-[var(--terminal-text)] text-lg cursor-pointer"
              title={allDone ? 'Dismiss wave' : 'Close (jobs keep running)'}
            >
              &times;
            </button>
          </div>
        </div>

        {/* Directive */}
        <div className="px-5 py-2 border-b border-[var(--terminal-border)] shrink-0">
          <span className="text-[var(--terminal-text-secondary)] text-xs italic">
            &ldquo;{directive}&rdquo;
          </span>
        </div>

        {/* Body: Top org tree + Bottom activity feed */}
        <div className="flex flex-col flex-1 min-h-0">
          {/* Top: Org Tree (horizontal banner) */}
          <div className="shrink-0 border-b border-[var(--terminal-border)] flex flex-col">
            <div className="flex items-center gap-3 px-4 py-1.5">
              <span className="text-[10px] font-bold text-[var(--terminal-text-secondary)] uppercase tracking-wider">
                Org Propagation
              </span>
              {/* Legend inline */}
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
            <div className="overflow-x-auto overflow-y-hidden px-3 pb-2" style={{ maxHeight: '180px' }}>
              <OrgTreeLive
                nodes={nodes}
                rootId={rootRoleId}
                selectedRoleId={selectedRoleId}
                onSelectNode={selectNode}
              />
            </div>
          </div>

          {/* Right: Activity Feed */}
          <div className="flex-1 flex flex-col min-w-0">
            {/* Selected role header */}
            {selectedNode && (
              <div
                className="px-4 py-2 border-b border-[var(--terminal-border)] shrink-0 flex items-center gap-2"
              >
                <div className="w-2 h-2 rounded-full" style={{ background: selectedColor }} />
                <span className="text-[var(--terminal-text)] font-bold text-xs">
                  {selectedNode.roleId.toUpperCase()}
                </span>
                <span className="text-[var(--terminal-text-muted)] text-xs">
                  {selectedNode.roleName}
                </span>
                <span
                  className="ml-auto text-[10px] px-2 py-0.5 rounded-full font-semibold"
                  style={{
                    background: selectedNode.status === 'awaiting_input' ? '#F59E0B22' : `${selectedColor}22`,
                    color: selectedNode.status === 'awaiting_input' ? '#F59E0B' : selectedColor,
                  }}
                >
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
                    title="Force stop this job"
                  >
                    Stop
                  </button>
                )}
              </div>
            )}

            {/* Events */}
            <div ref={outputRef} className="flex-1 overflow-y-auto p-4 space-y-1 text-xs font-mono">
              {selectedNode && selectedNode.events.length === 0 && (
                <div className="text-[var(--terminal-text-muted)]">
                  {selectedNode.status === 'waiting'
                    ? 'Waiting for dispatch...'
                    : selectedNode.status === 'running'
                    ? 'Connecting to activity stream...'
                    : selectedNode.status === 'not-dispatched'
                    ? 'This role was not dispatched in this wave.'
                    : ''}
                </div>
              )}
              {selectedNode?.events.map((event) => (
                <EventRow
                  key={event.seq}
                  event={event}
                  isThinkingCollapsed={collapsedThinking.has(event.seq)}
                  onToggleThinking={() => toggleThinking(event.seq)}
                  onNavigateToJob={(childJobId) => {
                    // Find which role this child job belongs to and select it
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
            </div>

            {/* Reply input for awaiting_input */}
            {selectedNode?.status === 'awaiting_input' && (
              <div className="px-4 py-3 border-t border-[var(--terminal-border)] shrink-0"
                   style={{ background: '#F59E0B0A' }}>
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
                    className="flex-1 px-3 py-1.5 text-xs rounded border bg-[var(--terminal-bg)] text-[var(--terminal-text)] border-[var(--terminal-border)] outline-none focus:border-[#F59E0B]"
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

            {/* Footer */}
            {!selectedNode && (
              <div className="flex-1 flex items-center justify-center text-[var(--terminal-text-muted)] text-xs">
                Click a node in the org tree to view activity
              </div>
            )}
            <div className="px-4 py-2 border-t border-[var(--terminal-border)] flex items-center justify-between shrink-0">
              <div className="text-[10px] text-[var(--terminal-text-muted)]">
                {selectedNode && selectedNode.events.length > 0 && `${selectedNode.events.length} events`}
              </div>
              {allDone && (
                <div className="flex items-center gap-2">
                  <button
                    onClick={onClose}
                    className="px-4 py-1.5 text-xs rounded-lg font-semibold cursor-pointer"
                    style={{ background: 'rgba(255,255,255,0.08)', color: 'var(--terminal-text-muted)' }}
                  >
                    Dismiss
                  </button>
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
      </div>
    </>
  );
}
