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
  const textEvents = events.filter(e => e.type === 'text' || e.type === 'trace:response');
  const lastText = textEvents.length > 0 ? textEvents[textEvents.length - 1] : null;

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

  // Format result safely (can be string or object)
  const resultText = task.result
    ? (typeof task.result === 'string' ? task.result : task.result.verdict || JSON.stringify(task.result))
    : null;
  const resultNote = task.resultNote
    || (typeof task.result === 'object' && task.result?.note)
    || null;

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
            {resultText && (
              <div style={{ marginTop: 6, fontSize: '0.8em', color: resultText === 'pass' ? '#22c55e' : '#ef4444' }}>
                Result: {resultText} {resultNote && `— ${resultNote}`}
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

        {/* Latest Output */}
        {lastText && (
          <Section title="Latest Output">
            <div style={{
              background: '#1a1a1a', borderRadius: 6, padding: '10px 12px',
              fontSize: '0.8em', color: '#ccc', lineHeight: 1.5, maxHeight: 120, overflow: 'auto',
              whiteSpace: 'pre-wrap', wordBreak: 'break-word',
            }}>
              {extractText(lastText)}
            </div>
          </Section>
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

        {/* Dispatches */}
        {dispatches.length > 0 && (
          <Section title={`Dispatches (${dispatches.length})`}>
            {dispatches.map((e, i) => (
              <div key={i} style={{ padding: '4px 0', fontSize: '0.8em', color: '#ccc' }}>
                <span style={{ color: e.type === 'dispatch:start' ? '#3b82f6' : '#22c55e' }}>
                  {e.type === 'dispatch:start' ? '→' : '✓'}
                </span>
                {' '}
                <span style={{ color: '#a78bfa', fontWeight: 600 }}>
                  {e.data?.targetRoleId || e.data?.roleId || 'unknown'}
                </span>
                {e.data?.task && (
                  <span style={{ color: '#666', marginLeft: 6 }}>
                    {String(e.data.task).slice(0, 80)}
                  </span>
                )}
              </div>
            ))}
          </Section>
        )}

        {/* Tool Calls - human readable */}
        {toolCalls.length > 0 && (
          <Section title={`Tool Calls (${toolCalls.length})`}>
            {toolCalls.slice(-20).map((e, i) => (
              <div key={i} style={{ padding: '3px 0', fontSize: '0.8em', display: 'flex', gap: 6 }}>
                <span style={{ color: '#60a5fa', fontWeight: 600, minWidth: 50 }}>
                  {e.data?.name || 'tool'}
                </span>
                <span style={{ color: '#888' }}>
                  {formatToolCall(e.data)}
                </span>
              </div>
            ))}
            {toolCalls.length > 20 && (
              <div style={{ color: '#555', fontSize: '0.75em', marginTop: 4 }}>
                ... {toolCalls.length - 20} earlier calls
              </div>
            )}
          </Section>
        )}

        {/* Errors */}
        {errors.length > 0 && (
          <Section title={`Errors (${errors.length})`}>
            {errors.map((e, i) => (
              <div key={i} style={{
                padding: '6px 8px', fontSize: '0.8em', color: '#ef4444',
                background: '#1a1a1a', borderRadius: 4, marginBottom: 4,
              }}>
                {e.data?.error || e.data?.message || 'Unknown error'}
              </div>
            ))}
          </Section>
        )}
      </div>
    </div>
  );
}

/** Extract human-readable text from a text/trace event */
function extractText(event) {
  if (!event?.data) return '';
  if (typeof event.data === 'string') return event.data.slice(0, 500);
  if (event.data.fullOutput) return event.data.fullOutput.slice(0, 500);
  if (event.data.text) return event.data.text.slice(0, 500);
  if (event.data.content) return String(event.data.content).slice(0, 500);
  if (event.data.output) return String(event.data.output).slice(0, 500);
  if (event.data.message) return String(event.data.message).slice(0, 500);
  return '';
}

/** Format a tool call into human-readable description */
function formatToolCall(data) {
  if (!data) return '';
  const name = data.name || '';
  const input = data.input || {};

  if (name === 'Read' && input.file_path) {
    return input.file_path.split('/').slice(-2).join('/');
  }
  if (name === 'Write' && input.file_path) {
    return `→ ${input.file_path.split('/').slice(-2).join('/')}`;
  }
  if (name === 'Edit' && input.file_path) {
    return `${input.file_path.split('/').slice(-2).join('/')}`;
  }
  if (name === 'Bash' && input.command) {
    return input.command.length > 80 ? input.command.slice(0, 77) + '...' : input.command;
  }
  if (name === 'Grep' && input.pattern) {
    return `/${input.pattern}/ ${input.path ? 'in ' + input.path.split('/').pop() : ''}`;
  }
  if (name === 'Glob' && input.pattern) {
    return input.pattern;
  }
  if (input.file_path) {
    return input.file_path.split('/').slice(-2).join('/');
  }
  if (typeof input === 'string') return input.slice(0, 80);
  const str = JSON.stringify(input);
  return str.length > 80 ? str.slice(0, 77) + '...' : str;
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
