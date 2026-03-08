import { useState } from 'react';
import type { Message, StreamEvent, ImageAttachment } from '../../types';
import MarkdownRenderer from './MarkdownRenderer';

interface Props {
  message: Message;
  roleId: string;
  roleColor: string;
}

const ROLE_ICONS: Record<string, string> = {
  cto: '\u{1F3D7}\u{FE0F}', cbo: '\u{1F4CA}', pm: '\u{1F4CB}',
  engineer: '\u{2699}\u{FE0F}', designer: '\u{1F3A8}', qa: '\u{1F50D}',
};

/* ─── Image attachment preview ───────── */

function AttachmentPreview({ attachments }: { attachments: ImageAttachment[] }) {
  const [enlargedIndex, setEnlargedIndex] = useState<number | null>(null);

  if (attachments.length === 0) return null;

  return (
    <>
      <div className="flex flex-wrap gap-2 mb-2">
        {attachments.map((att, idx) => (
          <button
            key={idx}
            onClick={() => setEnlargedIndex(idx)}
            className="relative w-20 h-20 rounded-lg overflow-hidden border border-[var(--terminal-border)] bg-[var(--terminal-inline-bg)] cursor-pointer hover:border-[var(--terminal-border-hover)] transition-colors"
          >
            <img
              src={`data:${att.mediaType};base64,${att.data}`}
              alt={att.name}
              className="w-full h-full object-cover"
            />
            <div className="absolute bottom-0 left-0 right-0 bg-black/60 text-[8px] text-white truncate px-1 py-0.5">
              {att.name}
            </div>
          </button>
        ))}
      </div>

      {/* Enlarged view modal */}
      {enlargedIndex !== null && (
        <div
          className="fixed inset-0 z-[100] bg-black/80 flex items-center justify-center"
          onClick={() => setEnlargedIndex(null)}
        >
          <div className="relative max-w-[90vw] max-h-[90vh]">
            <img
              src={`data:${attachments[enlargedIndex].mediaType};base64,${attachments[enlargedIndex].data}`}
              alt={attachments[enlargedIndex].name}
              className="max-w-full max-h-[90vh] object-contain rounded-lg"
            />
            <button
              onClick={() => setEnlargedIndex(null)}
              className="absolute top-2 right-2 w-8 h-8 rounded-full bg-black/70 text-white flex items-center justify-center cursor-pointer hover:bg-black/90"
            >
              x
            </button>
            <div className="absolute bottom-2 left-1/2 -translate-x-1/2 bg-black/70 text-white text-sm px-3 py-1 rounded">
              {attachments[enlargedIndex].name}
            </div>
          </div>
        </div>
      )}
    </>
  );
}

/* ─── Tool input summary ───────────────── */

function summarizeToolInput(_name: string, input?: Record<string, unknown>): string {
  if (!input) return '';
  // Show file path or command inline
  if (input.file_path) return String(input.file_path).replace(/^.*\/(?=[^/]+\/)/, '');
  if (input.path) return String(input.path).replace(/^.*\/(?=[^/]+\/)/, '');
  if (input.pattern) return String(input.pattern);
  if (input.command) return String(input.command).slice(0, 60);
  if (input.query) return String(input.query).slice(0, 60);
  if (input.url) return String(input.url).slice(0, 60);
  return '';
}

/* ─── Deduplicated events for display ──── */

interface DisplayEvent {
  type: 'thinking' | 'tool' | 'dispatch' | 'dispatch:progress';
  text?: string;
  toolName?: string;
  toolSummary?: string;
  toolInput?: Record<string, unknown>;
  roleId?: string;
  task?: string;
  progressType?: string;
}

function buildDisplayEvents(events: StreamEvent[]): DisplayEvent[] {
  const result: DisplayEvent[] = [];
  let lastThinkingText = '';

  for (const e of events) {
    if (e.type === 'thinking') {
      // Merge consecutive thinking into one — keep latest text
      if (e.text) lastThinkingText = e.text;
      if (result.length === 0 || result[result.length - 1].type !== 'thinking') {
        result.push({ type: 'thinking', text: e.text });
      } else {
        result[result.length - 1].text = e.text;
      }
    } else if (e.type === 'tool') {
      result.push({
        type: 'tool',
        toolName: e.toolName,
        toolSummary: summarizeToolInput(e.toolName ?? '', e.toolInput),
        toolInput: e.toolInput,
      });
    } else if (e.type === 'dispatch') {
      result.push({
        type: 'dispatch',
        roleId: e.roleId,
        task: e.task,
      });
    } else if (e.type === 'dispatch:progress') {
      // Merge consecutive dispatch progress from same role
      const lastDP = result.length > 0 ? result[result.length - 1] : null;
      if (lastDP?.type === 'dispatch:progress' && lastDP.roleId === e.roleId) {
        // Update existing
        if (e.progressType === 'tool') {
          lastDP.toolName = e.toolName;
          lastDP.toolSummary = summarizeToolInput(e.toolName ?? '', e.toolInput);
          lastDP.progressType = 'tool';
        } else if (e.progressType === 'thinking') {
          lastDP.text = e.text;
          lastDP.progressType = 'thinking';
        } else if (e.progressType === 'text') {
          lastDP.text = e.text;
          lastDP.progressType = 'text';
        } else if (e.progressType === 'done' || e.progressType === 'error') {
          lastDP.progressType = e.progressType;
        }
      } else {
        result.push({
          type: 'dispatch:progress',
          roleId: e.roleId,
          progressType: e.progressType,
          text: e.text,
          toolName: e.toolName,
          toolSummary: e.toolName ? summarizeToolInput(e.toolName, e.toolInput) : undefined,
        });
      }
    }
    // Skip 'turn' — shown only in summary count
  }

  // Update merged thinking with latest text
  if (lastThinkingText) {
    const thinkingEvents = result.filter((e) => e.type === 'thinking');
    if (thinkingEvents.length > 0) {
      thinkingEvents[thinkingEvents.length - 1].text = lastThinkingText;
    }
  }

  return result;
}

/* ─── Display Event Row ────────────────── */

function DisplayEventRow({ event, isStreaming }: { event: DisplayEvent; isStreaming: boolean }) {
  const [expanded, setExpanded] = useState(false);

  switch (event.type) {
    case 'thinking':
      return (
        <div className="stream-event-thinking">
          <div className="stream-event-thinking-header" onClick={() => setExpanded(!expanded)}>
            <span className="stream-event-thinking-icon" />
            <span className="stream-event-thinking-label">
              thinking{isStreaming ? '...' : ''}
            </span>
            {event.text && !isStreaming && (
              <span className="stream-event-thinking-toggle">
                {expanded ? '\u25BE' : '\u25B8'}
              </span>
            )}
          </div>
          {(isStreaming || expanded) && event.text && (
            <div className="stream-event-thinking-content">
              {event.text.slice(-500)}
            </div>
          )}
        </div>
      );

    case 'tool':
      return (
        <div className="stream-event-tool">
          <span className="stream-event-tool-badge">{event.toolName}</span>
          {event.toolSummary && (
            <span className="stream-event-tool-path">{event.toolSummary}</span>
          )}
          {event.toolInput && (
            <span
              className="stream-event-tool-toggle"
              onClick={() => setExpanded(!expanded)}
            >
              {expanded ? '\u25BE' : '\u25B8'}
            </span>
          )}
          {expanded && event.toolInput && (
            <div className="stream-event-tool-detail">
              {JSON.stringify(event.toolInput, null, 1).slice(0, 300)}
            </div>
          )}
        </div>
      );

    case 'dispatch':
      return (
        <div className="stream-event-dispatch">
          <span className="stream-event-dispatch-badge">
            {'\u2192'} {event.roleId?.toUpperCase()}
          </span>
          <span className="stream-event-dispatch-task">
            {event.task?.slice(0, 80)}
          </span>
        </div>
      );

    case 'dispatch:progress':
      return (
        <div className="stream-event-dispatch-progress">
          <span className="stream-event-dispatch-progress-role">
            {event.roleId?.toUpperCase()}
          </span>
          {event.progressType === 'thinking' && (
            <span className="stream-event-dispatch-progress-status">
              thinking{isStreaming ? '...' : ''}
            </span>
          )}
          {event.progressType === 'tool' && (
            <>
              <span className="stream-event-tool-badge">{event.toolName}</span>
              {event.toolSummary && (
                <span className="stream-event-tool-path">{event.toolSummary}</span>
              )}
            </>
          )}
          {event.progressType === 'text' && event.text && (
            <span className="stream-event-dispatch-progress-status">
              responding...
            </span>
          )}
          {event.progressType === 'done' && (
            <span className="stream-event-dispatch-progress-done">done</span>
          )}
          {event.progressType === 'error' && (
            <span className="stream-event-dispatch-progress-error">error</span>
          )}
        </div>
      );

    default:
      return null;
  }
}

/* ─── Activity Log ─────────────────────── */

function ActivityLog({ events, isStreaming }: { events: StreamEvent[]; isStreaming: boolean }) {
  const [collapsed, setCollapsed] = useState(false);

  if (events.length === 0) return null;

  const displayEvents = buildDisplayEvents(events);
  if (displayEvents.length === 0) return null;

  // Build summary
  const thinkingCount = events.filter((e) => e.type === 'thinking').length;
  const toolEvents = events.filter((e) => e.type === 'tool');
  const dispatchEvents = events.filter((e) => e.type === 'dispatch' || e.type === 'dispatch:progress');
  const maxTurn = events.filter((e) => e.type === 'turn').reduce((max, e) => Math.max(max, e.turn ?? 0), 0);

  const parts: string[] = [];
  if (thinkingCount > 0) parts.push('thinking');
  if (toolEvents.length > 0) {
    const unique = [...new Set(toolEvents.map((e) => e.toolName))];
    if (unique.length <= 3) {
      parts.push(unique.join(', '));
    } else {
      parts.push(`${toolEvents.length} tool calls`);
    }
  }
  if (dispatchEvents.length > 0) parts.push(`${dispatchEvents.length} dispatch`);
  if (maxTurn > 1) parts.push(`${maxTurn} turns`);

  const summary = parts.join(' \u00B7 ');

  // Default: open when streaming, stays open after done
  // User can collapse manually
  const showEvents = !collapsed;

  return (
    <div className="stream-activity-log">
      <div
        className="stream-activity-header"
        onClick={() => setCollapsed(!collapsed)}
      >
        {isStreaming && (
          <span className="stream-activity-pulse" />
        )}
        <span className="stream-activity-summary">
          {collapsed ? '\u25B8' : '\u25BE'} {summary}{isStreaming ? '...' : ''}
        </span>
      </div>
      {showEvents && (
        <div className="stream-activity-events">
          {displayEvents.map((event, idx) => (
            <DisplayEventRow key={idx} event={event} isStreaming={isStreaming && idx === displayEvents.length - 1} />
          ))}
        </div>
      )}
    </div>
  );
}

/* ─── MessageBubble ────────────────────── */

export default function MessageBubble({ message, roleId, roleColor }: Props) {
  const isCeo = message.from === 'ceo';
  const isSystem = message.type === 'system';
  const isStreaming = message.status === 'streaming';

  if (isSystem) {
    return (
      <div className="flex justify-center my-2">
        <div className="text-[10px] text-[var(--terminal-text-muted)] bg-[var(--terminal-inline-bg)] px-3 py-1 rounded-full">
          {message.content}
        </div>
      </div>
    );
  }

  if (isCeo) {
    return (
      <div className="flex justify-end mb-3">
        <div className="max-w-[85%]">
          <div className="text-[10px] text-[var(--terminal-text-muted)] text-right mb-1">CEO</div>
          {message.attachments && message.attachments.length > 0 && (
            <div className="flex justify-end mb-1">
              <AttachmentPreview attachments={message.attachments} />
            </div>
          )}
          <div className="bg-[var(--terminal-surface-light)] rounded-xl rounded-tr-sm px-4 py-2.5 text-sm text-[var(--terminal-text)] leading-relaxed">
            {message.type === 'directive' && (
              <span className="text-amber-400 text-[10px] font-bold mr-1.5">DO</span>
            )}
            {message.content}
          </div>
        </div>
      </div>
    );
  }

  // Role message
  const hasEvents = (message.streamEvents?.length ?? 0) > 0;
  const hasThinking = !!message.thinking;
  const thinkingOnly = hasThinking && !message.content && isStreaming && !hasEvents;

  return (
    <div className="flex gap-2.5 mb-3">
      <div
        className="w-7 h-7 rounded-lg flex items-center justify-center text-sm shrink-0 mt-5"
        style={{ background: `${roleColor}33` }}
      >
        {ROLE_ICONS[roleId] ?? '\u{1F464}'}
      </div>
      <div className="max-w-[85%] min-w-0">
        <div className="text-[10px] text-[var(--terminal-text-muted)] mb-1">{roleId.toUpperCase()}</div>

        {/* Activity log — stream events */}
        {hasEvents && (
          <ActivityLog events={message.streamEvents!} isStreaming={isStreaming} />
        )}

        {/* Legacy thinking indicator (when no stream events) */}
        {hasThinking && !hasEvents && (
          <details open={thinkingOnly} className="mb-1">
            <summary className="text-[10px] text-purple-400/70 cursor-pointer select-none flex items-center gap-1">
              {thinkingOnly && <span className="inline-block w-1.5 h-1.5 rounded-full bg-purple-400 animate-pulse" />}
              thinking{thinkingOnly ? '...' : ` (${message.thinking!.length} chars)`}
            </summary>
            <div className="text-[11px] text-[var(--terminal-text-muted)] leading-relaxed mt-1 pl-2 border-l border-purple-400/20 max-h-32 overflow-y-auto">
              {message.thinking!.slice(-500)}
            </div>
          </details>
        )}

        <div
          className="rounded-xl rounded-tl-sm px-4 py-2.5 text-sm text-[var(--terminal-text)] leading-relaxed"
          style={{ borderLeft: `3px solid ${roleColor}`, background: 'var(--terminal-surface)' }}
        >
          {message.content ? (
            <MarkdownRenderer content={message.content} streaming={isStreaming} />
          ) : isStreaming && !hasThinking ? (
            <span className="inline-block w-2 h-4 bg-[var(--terminal-text-secondary)] animate-pulse" />
          ) : isStreaming && hasThinking ? (
            <span className="text-[11px] text-purple-400/50 italic">analyzing...</span>
          ) : null}
          {isStreaming && message.content && (
            <span className="inline-block w-1.5 h-3.5 bg-[var(--terminal-text-secondary)] animate-pulse ml-0.5 align-middle" />
          )}
        </div>
        {message.status === 'error' && (
          <div className="text-[10px] text-red-400 mt-1">Error occurred</div>
        )}
      </div>
    </div>
  );
}
