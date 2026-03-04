import { useState, useEffect, useRef } from 'react';
import useActivityStream from '../../hooks/useActivityStream';
import type { ActivityEvent } from '../../types';

const ROLE_COLORS: Record<string, string> = {
  cto: '#1565C0', cbo: '#E65100', pm: '#2E7D32',
  engineer: '#4A148C', designer: '#AD1457', qa: '#00695C',
};

interface ActivityPanelProps {
  jobId: string;
  title: string;
  color: string;
  variant: 'modal' | 'inline';
  onClose: () => void;
  onDone?: () => void;
  onNavigateToJob?: (childJobId: string) => void;
}

export default function ActivityPanel({
  jobId, title, color, variant, onClose, onDone, onNavigateToJob,
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
    <div className={variant === 'modal'
      ? 'fixed top-[5%] left-1/2 -translate-x-1/2 w-[720px] max-w-[95vw] h-[85vh] z-[61] bg-[var(--terminal-bg)] rounded-2xl shadow-2xl overflow-hidden flex flex-col'
      : 'bg-[var(--terminal-bg)] rounded-xl border border-[var(--terminal-border)] overflow-hidden flex flex-col max-h-[400px]'
    }>
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

/* ─── Event Row renderer ─────────────────── */

function EventRow({ event, isThinkingCollapsed, onToggleThinking, onNavigateToJob }: {
  event: ActivityEvent;
  isThinkingCollapsed: boolean;
  onToggleThinking: () => void;
  onNavigateToJob?: (childJobId: string) => void;
}) {
  const roleColor = ROLE_COLORS[event.roleId] ?? '#888';

  switch (event.type) {
    case 'text':
      return (
        <div className="text-green-300/90 whitespace-pre-wrap leading-relaxed">
          {event.data.text as string}
        </div>
      );

    case 'thinking': {
      const text = event.data.text as string ?? '';
      return (
        <div className="group">
          <button
            onClick={onToggleThinking}
            className="text-[var(--terminal-text-muted)] hover:text-[var(--terminal-text-secondary)] text-[10px] cursor-pointer flex items-center gap-1"
          >
            <span>{isThinkingCollapsed ? '\u25B6' : '\u25BC'}</span>
            <span className="italic">thinking...</span>
          </button>
          {!isThinkingCollapsed && (
            <div className="ml-3 text-[var(--terminal-text-muted)] italic whitespace-pre-wrap opacity-60 text-[11px] max-h-[120px] overflow-y-auto">
              {text.slice(0, 500)}{text.length > 500 ? '...' : ''}
            </div>
          )}
        </div>
      );
    }

    case 'tool:start': {
      const toolName = String(event.data.name ?? '');
      const toolInput = event.data.input as Record<string, unknown> | undefined;
      const cmdStr = typeof toolInput?.command === 'string' ? toolInput.command.slice(0, 80) : '';
      const fileStr = typeof toolInput?.file_path === 'string' ? String(toolInput.file_path).split('/').pop() : '';
      return (
        <div className="flex items-center gap-2 py-0.5">
          <span className="text-blue-400/80 bg-blue-400/10 px-1.5 py-0.5 rounded text-[10px]">
            {toolName}
          </span>
          {cmdStr && (
            <span className="text-[var(--terminal-text-muted)] text-[10px] truncate max-w-[400px]">
              {cmdStr}
            </span>
          )}
          {fileStr && (
            <span className="text-[var(--terminal-text-muted)] text-[10px] truncate max-w-[400px]">
              {fileStr}
            </span>
          )}
        </div>
      );
    }

    case 'dispatch:start': {
      const targetRoleId = event.data.targetRoleId as string ?? event.data.roleId as string ?? '';
      const task = event.data.task as string ?? '';
      const childJobId = event.data.childJobId as string;
      const targetColor = ROLE_COLORS[targetRoleId] ?? '#888';
      return (
        <div
          className="my-1 p-2 rounded-lg border cursor-pointer hover:opacity-90 transition-opacity"
          style={{
            borderColor: `${targetColor}44`,
            background: `${targetColor}11`,
          }}
          onClick={() => childJobId && onNavigateToJob?.(childJobId)}
        >
          <div className="flex items-center gap-2">
            <span style={{ color: targetColor }} className="font-bold text-[11px]">
              {'\u2192'} {targetRoleId.toUpperCase()}
            </span>
            <span className="text-[var(--terminal-text-secondary)] text-[10px] truncate flex-1">
              {task.slice(0, 100)}
            </span>
            {childJobId && onNavigateToJob && (
              <span className="text-[10px] px-1.5 py-0.5 rounded bg-white/10 text-[var(--terminal-text-muted)]">
                View {'\u2192'}
              </span>
            )}
          </div>
        </div>
      );
    }

    case 'dispatch:done':
      return (
        <div className="text-[var(--terminal-text-muted)] text-[10px] pl-3 border-l-2 border-[var(--terminal-border)] my-0.5">
          Dispatch completed
        </div>
      );

    case 'turn:complete':
      return (
        <div className="border-t border-[var(--terminal-border)] my-2 relative">
          <span className="absolute -top-2 left-2 bg-[var(--terminal-bg)] px-2 text-[9px] text-[var(--terminal-text-muted)]">
            Turn {event.data.turn as number}
          </span>
        </div>
      );

    case 'stderr':
      return (
        <div className="text-red-400/80 text-[11px]">
          {'\u26A0'} {event.data.message as string}
        </div>
      );

    case 'job:start':
      return (
        <div className="text-[var(--terminal-text-muted)] text-[10px] pb-1">
          <span style={{ color: roleColor }} className="font-bold">{event.roleId.toUpperCase()}</span>
          {' '}started: {(event.data.task as string ?? '').slice(0, 80)}
        </div>
      );

    case 'job:done': {
      const turns = event.data.turns as number ?? 0;
      const toolCalls = event.data.toolCalls as number ?? 0;
      return (
        <div className="mt-2 p-2 rounded-lg bg-green-900/20 border border-green-800/30">
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-green-400" />
            <span className="text-green-300 font-bold text-[11px]">Complete</span>
            <span className="text-[var(--terminal-text-muted)] text-[10px]">
              {turns} turns · {toolCalls} tools
            </span>
          </div>
        </div>
      );
    }

    case 'job:error':
      return (
        <div className="mt-2 p-2 rounded-lg bg-red-900/20 border border-red-800/30">
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-red-400" />
            <span className="text-red-300 font-bold text-[11px]">Error</span>
            <span className="text-red-200/70 text-[10px]">{event.data.message as string}</span>
          </div>
        </div>
      );

    case 'import:scan':
    case 'import:process':
    case 'import:created':
      return (
        <div className="text-cyan-300/70 text-[11px]">
          [{event.type}] {JSON.stringify(event.data)}
        </div>
      );

    default:
      return null;
  }
}
