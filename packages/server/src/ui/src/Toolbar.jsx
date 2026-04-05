import React from 'react';

const btnStyle = {
  padding: '5px 12px', fontSize: '0.8em', border: '1px solid #333',
  background: '#1a1a1a', color: '#ccc', borderRadius: 4, cursor: 'pointer',
};

export default function Toolbar({ waveId, board, api, onRefresh }) {
  const showReport = async () => {
    try {
      const res = await fetch(`${api}/api/waves/${waveId}/report`);
      const text = res.ok ? await res.text() : 'No report available';
      const w = window.open('', '_blank', 'width=700,height=500');
      w.document.write(`<pre style="background:#0a0a0a;color:#ccc;padding:20px;font-family:monospace;white-space:pre-wrap">${text}</pre>`);
    } catch {}
  };

  const stopWave = async () => {
    if (!confirm(`Stop wave ${waveId}?`)) return;
    await fetch(`${api}/api/waves/${waveId}/stop`, { method: 'POST' });
    onRefresh?.();
  };

  const saveTemplate = async () => {
    const name = prompt('Template name:');
    if (!name) return;
    await fetch(`${api}/api/templates`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ waveId, name }),
    });
    alert(`Template "${name}" saved`);
  };

  const addTask = async () => {
    const title = prompt('Task title:');
    if (!title) return;
    const assignee = prompt('Assignee (role ID, e.g. cto):');
    if (!assignee) return;
    const count = board?.tasks?.length || 0;
    await fetch(`${api}/api/waves/${waveId}/board/tasks`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: `t${count + 1}`, title, assignee, status: 'waiting', dependsOn: [] }),
    });
    onRefresh?.();
  };

  return (
    <div style={{ padding: '8px 20px', display: 'flex', gap: 8, borderBottom: '1px solid #111' }}>
      <button style={{ ...btnStyle, borderColor: '#1e40af', color: '#60a5fa' }} onClick={showReport}>Report</button>
      <button style={btnStyle} onClick={addTask}>+ Add Task</button>
      <button style={btnStyle} onClick={saveTemplate}>Save Template</button>
      <button style={{ ...btnStyle, borderColor: '#7f1d1d', color: '#ef4444' }} onClick={stopWave}>Stop Wave</button>
    </div>
  );
}
