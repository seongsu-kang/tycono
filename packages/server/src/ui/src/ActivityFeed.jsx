import React, { useRef, useEffect, useState } from 'react';

const typeColors = {
  'dispatch:start': '#3b82f6',
  'dispatch:done': '#22c55e',
  'tool:start': '#60a5fa',
  'tool:result': '#60a5fa',
  'msg:done': '#22c55e',
  'msg:error': '#ef4444',
  'msg:start': '#888',
  'text': '#aaa',
};

function formatEvent(e) {
  const type = e.type || '';
  if (type === 'dispatch:start') return `→ dispatch ${e.data?.targetRoleId || '?'}`;
  if (type === 'dispatch:done') return `← ${e.data?.targetRoleId || '?'} done`;
  if (type === 'tool:start') return `tool: ${e.data?.name || '?'}`;
  if (type === 'tool:result') return `result: ${(e.data?.output || '').slice(0, 40)}`;
  if (type === 'msg:done') return 'done';
  if (type === 'msg:error') return `error:`;
  if (type === 'msg:start') return `started (${e.data?.type || ''})`;
  if (type === 'text') return (e.data?.text || '').slice(0, 60);
  if (type === 'msg:turn-complete') return `turn ${e.data?.turn || '?'}`;
  return type;
}

export default function ActivityFeed({ events }) {
  const scrollRef = useRef(null);
  const [roleFilter, setRoleFilter] = useState('all');

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = 0;
    }
  }, [events.length]);

  const filtered = events.filter(e =>
    e.type !== 'thinking' && e.type !== 'prompt:assembled' && e.type !== 'trace:response'
  );

  // Get unique roles
  const roles = [...new Set(filtered.map(e => e.roleId).filter(Boolean))];

  // Apply role filter
  const displayed = roleFilter === 'all'
    ? filtered
    : filtered.filter(e => e.roleId === roleFilter);

  const reversed = [...displayed].reverse();

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <div style={{
        padding: '10px 14px', borderBottom: '1px solid #1a1a1a', background: '#111',
        fontSize: '0.85em', color: '#888', fontWeight: 600,
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
      }}>
        <span>Activity Feed ({displayed.length})</span>
      </div>

      {/* Role filter tabs */}
      {roles.length > 1 && (
        <div style={{
          display: 'flex', flexWrap: 'wrap', gap: 4, padding: '6px 10px',
          borderBottom: '1px solid #1a1a1a', background: '#0e0e0e',
        }}>
          <FilterTab label="All" active={roleFilter === 'all'} onClick={() => setRoleFilter('all')} />
          {roles.map(r => (
            <FilterTab
              key={r}
              label={r}
              active={roleFilter === r}
              onClick={() => setRoleFilter(r)}
              count={filtered.filter(e => e.roleId === r).length}
            />
          ))}
        </div>
      )}

      <div ref={scrollRef} style={{ flex: 1, overflow: 'auto', fontSize: '0.75em', fontFamily: 'monospace' }}>
        {reversed.map((e, i) => {
          const time = e.ts ? new Date(e.ts).toLocaleTimeString() : '';
          const color = typeColors[e.type] || '#666';
          return (
            <div key={i} style={{
              display: 'grid', gridTemplateColumns: '65px 70px 1fr',
              padding: '3px 10px', borderBottom: '1px solid #0e0e0e',
              gap: 6,
            }}>
              <span style={{ color: '#555' }}>{time}</span>
              <span style={{ color: '#a78bfa' }}>{e.roleId || ''}</span>
              <span style={{ color }}>{formatEvent(e)}</span>
            </div>
          );
        })}
        {displayed.length === 0 && (
          <div style={{ padding: 20, textAlign: 'center', color: '#444' }}>
            {roleFilter !== 'all' ? `No events for ${roleFilter}` : 'No events yet'}
          </div>
        )}
      </div>
    </div>
  );
}

function FilterTab({ label, active, onClick, count }) {
  return (
    <button
      onClick={onClick}
      style={{
        padding: '2px 8px',
        fontSize: '0.8em',
        border: active ? '1px solid #a78bfa' : '1px solid #333',
        background: active ? '#a78bfa22' : 'transparent',
        color: active ? '#a78bfa' : '#666',
        borderRadius: 3,
        cursor: 'pointer',
        textTransform: 'uppercase',
      }}
    >
      {label}{count !== undefined ? ` (${count})` : ''}
    </button>
  );
}
