import { useState, useEffect, useRef } from 'react';
import useWaveTree from '../../hooks/useWaveTree';
import OrgTreeLive from './OrgTreeLive';
import EventRow from '../common/EventRow';
import type { OrgNode } from '../../types';

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
  onOpenKnowledgeDoc?: (docId: string) => void;
}

export default function WaveCommandCenter({
  directive, rootJobs, orgNodes, rootRoleId,
  onClose, onMinimize, onDone, onOpenKnowledgeDoc,
}: Props) {
  const { nodes, selectedRoleId, selectNode, progress, allDone } = useWaveTree(rootJobs, orgNodes, rootRoleId);
  const [elapsed, setElapsed] = useState(0);
  const [collapsedThinking, setCollapsedThinking] = useState<Set<number>>(new Set());
  const outputRef = useRef<HTMLDivElement>(null);
  const startTime = useRef(Date.now());
  const doneFired = useRef(false);

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
      {/* Dimmer */}
      <div
        className="fixed inset-0 bg-black/40 z-[60] backdrop-blur-sm"
        onClick={allDone ? onClose : undefined}
      />

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
            <span className="text-xs px-2 py-0.5 rounded-full font-semibold" style={{
              background: allDone ? '#2E7D3222' : '#B71C1C22',
              color: allDone ? '#2E7D32' : '#B71C1C',
            }}>
              {progress.done}/{progress.total} done
            </span>
            <button
              onClick={onMinimize}
              title="Minimize"
              className="text-[var(--terminal-text-muted)] hover:text-[var(--terminal-text)] text-sm cursor-pointer px-1"
            >
              &#x2013;
            </button>
            {allDone && (
              <button
                onClick={onClose}
                className="text-[var(--terminal-text-muted)] hover:text-[var(--terminal-text)] text-lg cursor-pointer"
              >
                &times;
              </button>
            )}
          </div>
        </div>

        {/* Directive */}
        <div className="px-5 py-2 border-b border-[var(--terminal-border)] shrink-0">
          <span className="text-[var(--terminal-text-secondary)] text-xs italic">
            &ldquo;{directive}&rdquo;
          </span>
        </div>

        {/* Body: Left org tree + Right activity feed */}
        <div className="flex flex-1 min-h-0">
          {/* Left: Org Tree */}
          <div className="w-[280px] shrink-0 border-r border-[var(--terminal-border)] flex flex-col">
            <div className="px-3 py-2 border-b border-[var(--terminal-border)]">
              <span className="text-[10px] font-bold text-[var(--terminal-text-secondary)] uppercase tracking-wider">
                Org Propagation
              </span>
            </div>
            <div className="flex-1 overflow-auto p-3">
              <OrgTreeLive
                nodes={nodes}
                rootId={rootRoleId}
                selectedRoleId={selectedRoleId}
                onSelectNode={selectNode}
              />
            </div>

            {/* Legend */}
            <div className="px-3 py-2 border-t border-[var(--terminal-border)] flex flex-wrap gap-x-3 gap-y-1">
              {[
                { label: 'running', color: '#FBBF24', dot: true },
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
                    background: `${selectedColor}22`,
                    color: selectedColor,
                  }}
                >
                  {selectedNode.status === 'running' ? 'Working' :
                   selectedNode.status === 'done' ? 'Complete' :
                   selectedNode.status === 'error' ? 'Error' :
                   selectedNode.status === 'waiting' ? 'Waiting' :
                   'Not dispatched'}
                </span>
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
                <button
                  onClick={onClose}
                  className="px-4 py-1.5 text-xs text-white rounded-lg font-semibold cursor-pointer"
                  style={{ background: '#2E7D32' }}
                >
                  Close
                </button>
              )}
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
