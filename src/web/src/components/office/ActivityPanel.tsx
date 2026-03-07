import { useState, useEffect, useRef } from 'react';
import useActivityStream from '../../hooks/useActivityStream';
import EventRow from '../common/EventRow';

interface ActivityPanelProps {
  jobId: string;
  title: string;
  color: string;
  variant: 'modal' | 'inline';
  style?: React.CSSProperties;
  onClose: () => void;
  onMinimize?: () => void;
  onDone?: () => void;
  onNavigateToJob?: (childJobId: string) => void;
  onOpenKnowledgeDoc?: (docId: string) => void;
}

export default function ActivityPanel({
  jobId, title, color, variant, style, onClose, onMinimize, onDone, onNavigateToJob, onOpenKnowledgeDoc,
}: ActivityPanelProps) {
  const { events, status, textOutput, childJobIds } = useActivityStream(jobId);
  const [elapsed, setElapsed] = useState(0);
  const [collapsedThinking, setCollapsedThinking] = useState<Set<number>>(new Set());
  const outputRef = useRef<HTMLDivElement>(null);
  const startTime = useRef(Date.now());
  const doneCallbackFired = useRef(false);

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
  }, [events]);

  // Fire onDone callback once
  useEffect(() => {
    if ((status === 'done' || status === 'error') && !doneCallbackFired.current) {
      doneCallbackFired.current = true;
      onDone?.();
    }
  }, [status, onDone]);

  const toggleThinking = (seq: number) => {
    setCollapsedThinking((prev) => {
      const next = new Set(prev);
      if (next.has(seq)) next.delete(seq);
      else next.add(seq);
      return next;
    });
  };

  const statusLabel = {
    idle: 'Waiting',
    connecting: 'Connecting...',
    streaming: 'Working',
    done: 'Complete',
    error: 'Error',
  }[status];

  const statusColor = {
    idle: '#888',
    connecting: '#888',
    streaming: color,
    done: '#2E7D32',
    error: '#C62828',
  }[status];

  const fmtTime = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
  const canClose = status === 'done' || status === 'error';

  const content = (
    <div
      className={variant === 'modal'
        ? 'fixed top-[5%] left-1/2 -translate-x-1/2 w-[720px] max-w-[95vw] h-[85vh] z-[61] bg-[var(--terminal-bg)] rounded-2xl shadow-2xl overflow-hidden flex flex-col'
        : 'bg-[var(--terminal-bg)] rounded-xl border border-[var(--terminal-border)] overflow-hidden flex flex-col max-h-[400px]'
      }
      style={style}
    >
      {/* Header */}
      <div className="flex items-center justify-between px-5 py-3 border-b border-[var(--terminal-border)] shrink-0">
        <div className="flex items-center gap-3">
          <div className="w-3 h-3 rounded-full animate-pulse" style={{ background: statusColor }} />
          <div>
            <span className="text-[var(--terminal-text)] font-bold text-sm">{title}</span>
          </div>
        </div>
        <div className="flex items-center gap-4">
          <span className="text-[var(--terminal-text-muted)] text-xs font-mono">{fmtTime(elapsed)}</span>
          <span className="text-xs px-2 py-0.5 rounded-full font-semibold" style={{ background: `${statusColor}22`, color: statusColor }}>
            {statusLabel}
          </span>
          {onMinimize && variant === 'modal' && (
            <button
              onClick={onMinimize}
              title="Minimize"
              className="text-[var(--terminal-text-muted)] hover:text-[var(--terminal-text)] text-sm cursor-pointer px-1"
            >
              &#x2013;
            </button>
          )}
          {canClose && (
            <button onClick={onClose} className="text-[var(--terminal-text-muted)] hover:text-[var(--terminal-text)] text-lg cursor-pointer">&times;</button>
          )}
        </div>
      </div>

      {/* Events area */}
      <div ref={outputRef} className="flex-1 overflow-y-auto p-4 space-y-1 text-xs font-mono">
        {events.length === 0 && status === 'connecting' && (
          <div className="text-[var(--terminal-text-muted)]">Connecting to activity stream...</div>
        )}
        {events.map((event) => (
          <EventRow
            key={event.seq}
            event={event}
            isThinkingCollapsed={collapsedThinking.has(event.seq)}
            onToggleThinking={() => toggleThinking(event.seq)}
            onNavigateToJob={onNavigateToJob}
            onOpenKnowledgeDoc={onOpenKnowledgeDoc}
          />
        ))}
        {status === 'streaming' && (
          <span className="inline-block w-2 h-4 bg-green-400 animate-pulse ml-0.5" />
        )}
      </div>

      {/* Footer */}
      <div className="px-5 py-3 border-t border-[var(--terminal-border)] flex items-center justify-between shrink-0">
        <div className="text-[10px] text-[var(--terminal-text-muted)]">
          {events.length > 0 && `${events.length} events`}
          {textOutput.length > 0 && ` · ${textOutput.length} chars`}
          {childJobIds.length > 0 && ` · ${childJobIds.length} dispatches`}
        </div>
        {canClose && (
          <button
            onClick={onClose}
            className="px-4 py-1.5 text-xs text-white rounded-lg font-semibold cursor-pointer"
            style={{ background: color }}
          >
            Close
          </button>
        )}
      </div>
    </div>
  );

  if (variant === 'modal') {
    return (
      <>
        <div className="fixed inset-0 bg-black/40 z-[60] backdrop-blur-sm" onClick={canClose ? onClose : undefined} />
        {content}
      </>
    );
  }

  return content;
}

