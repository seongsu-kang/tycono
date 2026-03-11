import { useState } from 'react';
import type { ActivityEvent, JobStatus } from '../../types';
import EventRow from '../common/EventRow';

const ROLE_COLORS: Record<string, string> = {
  cto: '#1565C0', cbo: '#E65100', pm: '#2E7D32',
  engineer: '#4A148C', designer: '#AD1457', qa: '#00695C',
  'data-analyst': '#0277BD',
};

/** @deprecated Use JobStatus from shared/types instead */
export type ReportCardStatus = JobStatus;

export interface WaveReportCardProps {
  roleId: string;
  roleName: string;
  status: ReportCardStatus;
  events: ActivityEvent[];
  sessionId?: string;
  onFollowUp?: (roleId: string, sessionId: string) => void;
  onViewReport?: (roleId: string) => void;
  onNavigateToJob?: (jobId: string) => void;
  onOpenKnowledgeDoc?: (docId: string) => void;
}

export default function WaveReportCard({
  roleId,
  roleName,
  status,
  events,
  sessionId,
  onFollowUp,
  onViewReport,
  onNavigateToJob,
  onOpenKnowledgeDoc,
}: WaveReportCardProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const [thinkingCollapsed, setThinkingCollapsed] = useState<Record<number, boolean>>({});

  const color = ROLE_COLORS[roleId] ?? '#888';

  // Get summary text from last text event
  const lastTextEvent = [...events].reverse().find(e => e.type === 'text');
  const summaryText = lastTextEvent?.data?.text as string | undefined;
  const displaySummary = summaryText?.slice(0, 120) ?? '';

  // Filter visible events (exclude thinking by default)
  const visibleEvents = events.filter(e =>
    e.type === 'text' ||
    e.type === 'tool:start' ||
    e.type === 'tool:result' ||
    e.type === 'dispatch:start' ||
    e.type === 'dispatch:done' ||
    e.type === 'job:awaiting_input' ||
    e.type === 'thinking'
  );

  const statusIcon = status === 'done' ? '✅'
    : status === 'error' ? '❌'
    : status === 'awaiting_input' ? '⚠️'
    : '🔄';

  const statusLabel = status === 'done' ? 'Complete'
    : status === 'error' ? 'Error'
    : status === 'awaiting_input' ? 'Awaiting Input'
    : 'In Progress';

  const statusColor = status === 'done' ? '#4CAF50'
    : status === 'error' ? '#EF4444'
    : status === 'awaiting_input' ? '#FFC107'
    : color;

  return (
    <div
      className="rounded-lg overflow-hidden mb-3"
      style={{
        background: 'var(--terminal-surface, #241E19)',
        border: `1px solid ${color}30`,
      }}
    >
      {/* Header */}
      <div
        className="px-4 py-3 flex items-center gap-3"
        style={{
          borderBottom: isExpanded ? `1px solid ${color}20` : 'none',
          background: `${color}08`,
        }}
      >
        <span className="text-xl">{statusIcon}</span>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-[13px] font-semibold" style={{ color }}>
              {roleName}
            </span>
            <span
              className="text-[9px] px-1.5 py-0.5 rounded-full font-bold"
              style={{
                background: statusColor,
                color: '#fff',
              }}
            >
              {statusLabel}
            </span>
          </div>
          {displaySummary && !isExpanded && (
            <div
              className="text-[11px] mt-1 truncate"
              style={{ color: 'var(--terminal-text-muted, #887766)' }}
            >
              {displaySummary}
              {summaryText && summaryText.length > 120 && '...'}
            </div>
          )}
        </div>

        {/* Actions */}
        <div className="flex items-center gap-2 shrink-0">
          {status === 'awaiting_input' && sessionId && onFollowUp && (
            <button
              onClick={() => onFollowUp(roleId, sessionId)}
              className="text-[10px] px-2 py-1 rounded hover:opacity-80 transition-opacity"
              style={{
                background: '#FFC107',
                color: '#000',
                fontWeight: 500,
              }}
            >
              Reply ▸
            </button>
          )}
          {onViewReport && (
            <button
              onClick={() => onViewReport(roleId)}
              className="text-[10px] px-2 py-1 rounded hover:opacity-80 transition-opacity"
              style={{
                border: `1px solid ${color}50`,
                color,
              }}
            >
              View Full
            </button>
          )}
          <button
            onClick={() => setIsExpanded(v => !v)}
            className="text-[11px] px-2 py-1 rounded hover:opacity-80 transition-opacity"
            style={{ color: 'var(--terminal-text-muted)' }}
          >
            {isExpanded ? '▲' : '▼'}
          </button>
        </div>
      </div>

      {/* Expanded Event Log */}
      {isExpanded && (
        <div
          className="px-4 py-3 space-y-2 max-h-[400px] overflow-y-auto"
          style={{ fontSize: '11px' }}
        >
          {visibleEvents.length === 0 ? (
            <div
              className="text-center py-4"
              style={{ color: 'var(--terminal-text-muted)' }}
            >
              No events yet
            </div>
          ) : (
            visibleEvents.map((event, idx) => (
              <div key={idx} className="border-l-2 pl-3 py-1" style={{ borderColor: `${color}30` }}>
                <EventRow
                  event={event}
                  isThinkingCollapsed={thinkingCollapsed[idx] ?? true}
                  onToggleThinking={() => setThinkingCollapsed(prev => ({ ...prev, [idx]: !prev[idx] }))}
                  onNavigateToJob={onNavigateToJob}
                  onOpenKnowledgeDoc={onOpenKnowledgeDoc}
                  compact={true}
                />
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}
