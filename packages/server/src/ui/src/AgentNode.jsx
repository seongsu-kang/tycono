import React from 'react';
import { Handle, Position } from '@xyflow/react';

const statusIcons = {
  waiting: '⏳',
  running: '🔄',
  done: '✅',
  skipped: '⏭',
  blocked: '🚫',
};

/** Strip AKB preamble from task title, show only the actual task */
function cleanTitle(label) {
  if (!label) return '';
  // Remove "⛔ AKB Rule: Read CLAUDE.md before starting work." prefix
  let clean = label.replace(/^⛔\s*AKB Rule:.*?(?:#\s*Task[:\s]*)/i, '');
  // Remove "ROLE: " prefix if present
  clean = clean.replace(/^[A-Z]+:\s*/, '');
  // Remove leading whitespace/newlines
  clean = clean.replace(/^\s+/, '');
  return clean.slice(0, 60) || label.slice(0, 60);
}

export default function AgentNode({ data }) {
  const { label, role, status, criteria, result, resultNote, color, onSkip, onEdit, onSelect, lastActivity } = data;
  const canAct = status === 'waiting' || status === 'running';

  return (
    <div
      onClick={(e) => { e.stopPropagation(); onSelect?.(); }}
      style={{
        background: '#161616',
        border: `2px solid ${color}`,
        borderRadius: 10,
        padding: '12px 16px',
        minWidth: 220,
        maxWidth: 280,
        cursor: 'pointer',
        boxShadow: status === 'running' ? `0 0 12px ${color}44` : 'none',
        transition: 'box-shadow 0.2s, border-color 0.2s',
      }}
    >
      <Handle type="target" position={Position.Top} style={{ background: color }} />

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
        <span style={{ color: '#a78bfa', fontSize: '0.75em', fontWeight: 600, textTransform: 'uppercase' }}>{role}</span>
        <span style={{ fontSize: '0.85em' }}>{statusIcons[status] || ''} {status}</span>
      </div>

      <div style={{ color: '#fff', fontWeight: 500, fontSize: '0.85em', marginBottom: 4, lineHeight: 1.3 }}>
        {cleanTitle(label)}
      </div>

      {/* Live activity indicator */}
      {lastActivity && status === 'running' && (
        <div style={{
          color: '#60a5fa', fontSize: '0.7em', marginTop: 4, padding: '3px 6px',
          background: '#1a2332', borderRadius: 4, overflow: 'hidden',
          textOverflow: 'ellipsis', whiteSpace: 'nowrap',
        }}>
          {lastActivity}
        </div>
      )}

      {result && (
        <div style={{ marginTop: 4, fontSize: '0.75em', color: result === 'pass' ? '#22c55e' : '#ef4444', lineHeight: 1.3 }}>
          {result === 'pass' ? '✅' : '❌'} {resultNote?.slice(0, 80)}
        </div>
      )}

      {/* Inline action buttons */}
      {canAct && (onSkip || onEdit) && (
        <div style={{ display: 'flex', gap: 6, marginTop: 8 }}>
          {onEdit && (
            <button
              onClick={(e) => { e.stopPropagation(); onEdit(); }}
              style={smallBtn('#3b82f6')}
            >
              Edit
            </button>
          )}
          {onSkip && (
            <button
              onClick={(e) => { e.stopPropagation(); onSkip(); }}
              style={smallBtn('#ef4444')}
            >
              Skip
            </button>
          )}
        </div>
      )}

      <Handle type="source" position={Position.Bottom} style={{ background: color }} />
    </div>
  );
}

function smallBtn(color) {
  return {
    padding: '2px 10px',
    fontSize: '0.7em',
    border: `1px solid ${color}`,
    background: 'transparent',
    color,
    borderRadius: 3,
    cursor: 'pointer',
  };
}
