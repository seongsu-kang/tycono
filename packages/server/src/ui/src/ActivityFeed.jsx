import React, { useRef, useEffect } from 'react';

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
  if (type === 'msg:error') return `error: ${e.data?.error || ''}`;
  if (type === 'msg:start') return `started (${e.data?.type || ''})`;
  if (type === 'text') return (e.data?.text || '').slice(0, 60);
  if (type === 'msg:turn-complete') return `turn ${e.data?.turn || '?'}`;
  return type;
}

export default function ActivityFeed({ events }) {
  const scrollRef = useRef(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = 0;
    }
  }, [events.length]);

  const filtered = events.filter(e =>
    e.type !== 'thinking' && e.type !== 'prompt:assembled' && e.type !== 'trace:response'
  );

  const reversed = [...filtered].reverse();

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <div style={{
        padding: '10px 14px', borderBottom: '1px solid #1a1a1a', background: '#111',
        fontSize: '0.85em', color: '#888', fontWeight: 600,
      }}>
        Activity Feed ({filtered.length})
      </div>
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
        {filtered.length === 0 && (
          <div style={{ padding: 20, textAlign: 'center', color: '#444' }}>
            No events yet
          </div>
        )}
      </div>
    </div>
  );
}
