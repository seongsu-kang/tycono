import React from 'react';
import { Handle, Position } from '@xyflow/react';

const statusIcons = {
  waiting: '⏳',
  running: '🔄',
  done: '✅',
  skipped: '⏭',
  blocked: '🚫',
};

export default function AgentNode({ data }) {
  const { label, role, status, criteria, result, resultNote, color, onSkip, onEdit, onSelect } = data;
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
        maxWidth: 260,
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

      <div style={{ color: '#fff', fontWeight: 500, fontSize: '0.9em', marginBottom: 4 }}>
        {label}
      </div>

      {criteria && (
        <div style={{ color: '#666', fontSize: '0.75em', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {criteria.slice(0, 50)}
        </div>
      )}

      {result && (
        <div style={{ marginTop: 4, fontSize: '0.75em', color: result === 'pass' ? '#22c55e' : '#ef4444' }}>
          {result === 'pass' ? '✅' : '❌'} {resultNote?.slice(0, 40)}
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
