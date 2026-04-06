import React, { useState, useEffect } from 'react';

export default function TaskDetail({ task, waveId, api, onClose, onAction }) {
  const [events, setEvents] = useState([]);
  const [loading, setLoading] = useState(false);
  const [editMode, setEditMode] = useState(false);
  const [editTitle, setEditTitle] = useState('');
  const [editCriteria, setEditCriteria] = useState('');

  useEffect(() => {
    if (!task || !waveId) return;
    setLoading(true);
    fetch(`${api}/api/waves/${waveId}/events?limit=200`)
      .then(r => r.ok ? r.json() : { events: [] })
      .then(data => {
        const roleEvents = (data.events || []).filter(e => e.roleId === task.assignee);
        setEvents(roleEvents);
      })
      .catch(() => setEvents([]))
      .finally(() => setLoading(false));
  }, [task?.id, waveId]);

  if (!task) return null;

  const toolCalls = events.filter(e => e.type === 'tool:start');
  const errors = events.filter(e => e.type === 'msg:error');
  const dispatches = events.filter(e => e.type === 'dispatch:start' || e.type === 'dispatch:done');

  const handleSave = async () => {
    const body = {};
    if (editTitle && editTitle !== task.title) body.title = editTitle;
    if (editCriteria !== undefined && editCriteria !== task.criteria) body.criteria = editCriteria;
    if (Object.keys(body).length === 0) { setEditMode(false); return; }

    await fetch(`${api}/api/waves/${waveId}/board/tasks/${task.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    setEditMode(false);
    onAction?.();
  };

  const handleSkip = async () => {
    await fetch(`${api}/api/waves/${waveId}/board/tasks/${task.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'skipped' }),
    });
    onAction?.();
  };

  const startEdit = () => {
    setEditTitle(task.title);
    setEditCriteria(task.criteria || '');
    setEditMode(true);
  };

  return (
    <div style={{
      position: 'absolute', top: 0, right: 0, bottom: 0, width: 400,
      background: '#111', borderLeft: '1px solid #333', zIndex: 10,
      display: 'flex', flexDirection: 'column', overflow: 'hidden',
    }}>
      {/* Header */}
      <div style={{
        padding: '14px 16px', borderBottom: '1px solid #222',
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
      }}>
        <span style={{ color: '#a78bfa', fontWeight: 600, fontSize: '0.85em', textTransform: 'uppercase' }}>
          {task.assignee}
        </span>
        <button onClick={onClose} style={{
          background: 'none', border: 'none', color: '#666', fontSize: '1.2em', cursor: 'pointer',
        }}>✕</button>
      </div>

      {/* Content */}
      <div style={{ flex: 1, overflow: 'auto', padding: '14px 16px' }}>
        {/* Title + Status */}
        {editMode ? (
          <div style={{ marginBottom: 12 }}>
            <input
              value={editTitle}
              onChange={e => setEditTitle(e.target.value)}
              style={{
                width: '100%', background: '#1a1a1a', color: '#fff', border: '1px solid #444',
                padding: '8px 10px', borderRadius: 4, fontSize: '0.9em', marginBottom: 8,
              }}
            />
            <textarea
              value={editCriteria}
              onChange={e => setEditCriteria(e.target.value)}
              placeholder="Criteria..."
              rows={3}
              style={{
                width: '100%', background: '#1a1a1a', color: '#ccc', border: '1px solid #444',
                padding: '8px 10px', borderRadius: 4, fontSize: '0.8em', resize: 'vertical',
              }}
            />
            <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
              <button onClick={handleSave} style={actionBtn('#3b82f6')}>Save</button>
              <button onClick={() => setEditMode(false)} style={actionBtn('#666')}>Cancel</button>
            </div>
          </div>
        ) : (
          <div style={{ marginBottom: 12 }}>
            <div style={{ color: '#fff', fontWeight: 600, fontSize: '1em', marginBottom: 4 }}>
              {task.title}
            </div>
            <div style={{ color: '#888', fontSize: '0.8em' }}>
              Status: <span style={{ color: statusColor(task.status) }}>{task.status}</span>
              {task.dependsOn?.length > 0 && ` · Depends: ${task.dependsOn.join(', ')}`}
            </div>
            {task.criteria && (
              <div style={{ color: '#666', fontSize: '0.8em', marginTop: 4 }}>{task.criteria}</div>
            )}
            {task.result && (
              <div style={{ marginTop: 6, fontSize: '0.8em', color: task.result === 'pass' ? '#22c55e' : '#ef4444' }}>
                Result: {task.result} {task.resultNote && `— ${task.resultNote}`}
              </div>
            )}
          </div>
        )}

        {/* Actions */}
        {!editMode && (task.status === 'waiting' || task.status === 'running') && (
          <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
            <button onClick={startEdit} style={actionBtn('#3b82f6')}>Edit</button>
            <button onClick={handleSkip} style={actionBtn('#ef4444')}>Skip</button>
          </div>
        )}

        {/* Stats */}
        <Section title="Activity Summary">
          {loading ? (
            <div style={{ color: '#555' }}>Loading...</div>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
              <StatBox label="Events" value={events.length} />
              <StatBox label="Tool Calls" value={toolCalls.length} />
              <StatBox label="Dispatches" value={dispatches.length} />
              <StatBox label="Errors" value={errors.length} color={errors.length > 0 ? '#ef4444' : undefined} />
            </div>
          )}
        </Section>

        {/* Tool Calls */}
        {toolCalls.length > 0 && (
          <Section title={`Tool Calls (${toolCalls.length})`}>
            {toolCalls.slice(0, 20).map((e, i) => (
              <div key={i} style={{ padding: '3px 0', fontSize: '0.75em', color: '#888', fontFamily: 'monospace' }}>
                <span style={{ color: '#60a5fa' }}>{e.data?.name}</span>
                {e.data?.input && <span style={{ color: '#555' }}> {JSON.stringify(e.data.input).slice(0, 60)}</span>}
              </div>
            ))}
            {toolCalls.length > 20 && (
              <div style={{ color: '#555', fontSize: '0.75em' }}>+{toolCalls.length - 20} more</div>
            )}
          </Section>
        )}

        {/* Recent Events */}
        <Section title={`Recent Events (${events.length})`}>
          {events.slice(-15).reverse().map((e, i) => (
            <div key={i} style={{
              padding: '2px 0', fontSize: '0.72em', fontFamily: 'monospace',
              display: 'flex', gap: 8,
            }}>
              <span style={{ color: '#555', minWidth: 55 }}>
                {e.ts ? new Date(e.ts).toLocaleTimeString() : ''}
              </span>
              <span style={{ color: typeColor(e.type) }}>{e.type}</span>
            </div>
          ))}
          {events.length === 0 && !loading && (
            <div style={{ color: '#444', fontSize: '0.8em' }}>No events for this role</div>
          )}
        </Section>
      </div>
    </div>
  );
}

function Section({ title, children }) {
  return (
    <div style={{ marginBottom: 16 }}>
      <div style={{ color: '#888', fontSize: '0.75em', fontWeight: 600, marginBottom: 6, textTransform: 'uppercase' }}>
        {title}
      </div>
      {children}
    </div>
  );
}

function StatBox({ label, value, color }) {
  return (
    <div style={{ background: '#1a1a1a', borderRadius: 6, padding: '8px 10px', textAlign: 'center' }}>
      <div style={{ color: color || '#fff', fontSize: '1.2em', fontWeight: 600 }}>{value}</div>
      <div style={{ color: '#666', fontSize: '0.7em' }}>{label}</div>
    </div>
  );
}

function actionBtn(color) {
  return {
    padding: '5px 14px', fontSize: '0.8em', border: `1px solid ${color}`,
    background: 'transparent', color, borderRadius: 4, cursor: 'pointer',
  };
}

function statusColor(status) {
  return { waiting: '#888', running: '#3b82f6', done: '#22c55e', skipped: '#666', blocked: '#ef4444' }[status] || '#888';
}

function typeColor(type) {
  return {
    'dispatch:start': '#3b82f6', 'dispatch:done': '#22c55e',
    'tool:start': '#60a5fa', 'tool:result': '#60a5fa',
    'msg:done': '#22c55e', 'msg:error': '#ef4444',
  }[type] || '#666';
}
