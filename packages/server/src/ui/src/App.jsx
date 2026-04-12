import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  ReactFlow,
  Background,
  Controls,
  MiniMap,
  useNodesState,
  useEdgesState,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import AgentNode from './AgentNode';
import ActivityFeed from './ActivityFeed';
import TaskDetail from './TaskDetail';
import Toolbar from './Toolbar';
import { applyDagreLayout } from './layout';

const API = window.location.origin;
const nodeTypes = { agent: AgentNode };

export class ErrorBoundary extends React.Component {
  constructor(props) { super(props); this.state = { error: null }; }
  static getDerivedStateFromError(error) { return { error }; }
  render() {
    if (this.state.error) {
      return (
        <div style={{ padding: 20, color: '#ef4444', background: '#1a1a1a', minHeight: '100vh' }}>
          <h2>Dashboard Error</h2>
          <pre style={{ color: '#888', fontSize: '0.8em' }}>{this.state.error.message}</pre>
          <button onClick={() => { this.setState({ error: null }); window.location.reload(); }}
            style={{ marginTop: 12, padding: '8px 16px', background: '#333', color: '#fff', border: 'none', borderRadius: 4, cursor: 'pointer' }}>
            Reload
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

const STATUS_COLORS = {
  waiting: '#444',
  running: '#3b82f6',
  done: '#22c55e',
  skipped: '#666',
  blocked: '#ef4444',
};

export default function App() {
  const [waves, setWaves] = useState([]);
  const [currentWaveId, setCurrentWaveId] = useState(null);
  const [board, setBoard] = useState(null);
  const [events, setEvents] = useState([]);
  const [sseStatus, setSseStatus] = useState('--');
  const [selectedTask, setSelectedTask] = useState(null);
  const [nodes, setNodes, onNodesChange] = useNodesState([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState([]);
  const sseRef = useRef(null);
  const boardRef = useRef(null);
  const currentWaveIdRef = useRef(null);

  // Keep refs in sync
  useEffect(() => { boardRef.current = board; }, [board]);
  useEffect(() => { currentWaveIdRef.current = currentWaveId; }, [currentWaveId]);

  // Load waves
  useEffect(() => {
    const load = async () => {
      try {
        const [activeRes, opsRes] = await Promise.all([
          fetch(`${API}/api/waves/active`),
          fetch(`${API}/api/operations/waves`),
        ]);
        const active = await activeRes.json();
        const completed = await opsRes.json();
        const activeWaves = (active.waves || active || []).map(w => ({ ...w, active: true }));
        const doneWaves = (completed || []).slice(0, 15).map(w => ({ ...w, active: false }));
        setWaves([...activeWaves, ...doneWaves]);
        if (!currentWaveId && activeWaves.length > 0) {
          selectWave(activeWaves[0].id);
        }
      } catch {}
    };
    load();
    const interval = setInterval(load, 10000);
    return () => clearInterval(interval);
  }, []);

  // Select wave
  const selectWave = useCallback(async (waveId) => {
    if (!waveId) return;
    setCurrentWaveId(waveId);
    setEvents([]);
    setSelectedTask(null);

    try {
      const boardRes = await fetch(`${API}/api/waves/${waveId}/board`);
      if (boardRes.ok) {
        const b = await boardRes.json();
        setBoard(b);
        buildGraph(b);
      } else {
        setBoard(null);
        const waveRes = await fetch(`${API}/api/operations/waves/${waveId}`);
        if (waveRes.ok) {
          const raw = await waveRes.json();
          const wave = raw.replay || raw;
          buildGraphFromWave(wave);
        }
      }
    } catch {}

    try {
      const evRes = await fetch(`${API}/api/waves/${waveId}/events?limit=150`);
      if (evRes.ok) {
        const data = await evRes.json();
        setEvents(data.events || []);
      }
    } catch {}

    connectSSE(waveId);
  }, []);

  // SSE
  const connectSSE = useCallback((waveId) => {
    if (sseRef.current) sseRef.current.close();
    try {
      const source = new EventSource(`${API}/api/waves/${waveId}/stream`);
      source.onopen = () => setSseStatus('Live');
      source.onmessage = (e) => {
        try {
          const data = JSON.parse(e.data);
          setEvents(prev => [...prev, data].slice(-200));
        } catch {}
        fetch(`${API}/api/waves/${waveId}/board`).then(r => r.ok ? r.json() : null).then(b => {
          if (b) { setBoard(b); buildGraph(b); }
        });
      };
      // BUG-DASHBOARD-LIVE: listen for named wave:done event
      source.addEventListener('wave:done', (e) => {
        setSseStatus('Completed');
        try {
          const data = JSON.parse(e.data);
          setEvents(prev => [...prev, { type: 'wave:done', ...data }].slice(-200));
        } catch {}
        // Final board refresh
        const wid = currentWaveIdRef.current;
        if (wid) {
          fetch(`${API}/api/waves/${wid}/board`).then(r => r.ok ? r.json() : null).then(b => {
            if (b) { setBoard(b); buildGraph(b); }
          });
        }
      });
      source.onerror = () => setSseStatus('Offline');
      sseRef.current = source;
    } catch { setSseStatus('--'); }
  }, []);

  // Task actions
  const skipTask = useCallback(async (taskId) => {
    await fetch(`${API}/api/waves/${currentWaveId}/board/tasks/${taskId}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'skipped' }),
    });
    selectWave(currentWaveId);
  }, [currentWaveId, selectWave]);

  const selectTask = useCallback((taskId) => {
    const b = boardRef.current;
    if (!b?.tasks) return;
    const task = b.tasks.find(t => t.id === taskId);
    setSelectedTask(task || null);
  }, []);

  // Extract latest activity per role from events
  const getRoleActivity = useCallback((roleId) => {
    const evts = events || [];
    for (let i = evts.length - 1; i >= 0; i--) {
      const e = evts[i];
      if (e.roleId !== roleId) continue;
      if (e.type === 'text' && e.data?.text) return e.data.text.slice(0, 60);
      if (e.type === 'tool:start' && e.data?.name) {
        const name = e.data.name;
        const input = e.data.input || {};
        if (name === 'Read' && input.file_path) return `Reading ${input.file_path.split('/').pop()}`;
        if (name === 'Write' && input.file_path) return `Writing ${input.file_path.split('/').pop()}`;
        if (name === 'Edit' && input.file_path) return `Editing ${input.file_path.split('/').pop()}`;
        if (name === 'Bash' && input.command) return `$ ${input.command.slice(0, 50)}`;
        if (name === 'Grep') return `Searching: ${input.pattern || ''}`;
        if (name === 'Glob') return `Finding: ${input.pattern || ''}`;
        return `${name}`;
      }
      if (e.type === 'dispatch:start') return `→ Dispatching ${e.data?.targetRoleId || ''}`;
      if (e.type === 'dispatch:done') return `← ${e.data?.targetRoleId || ''} completed`;
    }
    return null;
  }, [events]);

  // Build React Flow graph from board (dagre layout)
  const buildGraph = useCallback((boardData) => {
    if (!boardData?.tasks?.length) { setNodes([]); setEdges([]); return; }
    const tasks = boardData.tasks;

    const rawNodes = tasks.map(t => ({
      id: t.id,
      type: 'agent',
      position: { x: 0, y: 0 }, // dagre will override
      data: {
        label: t.title,
        lastActivity: getRoleActivity(t.assignee),
        role: t.assignee,
        status: t.status,
        criteria: t.criteria,
        result: t.result,
        resultNote: t.resultNote,
        color: STATUS_COLORS[t.status] || '#444',
        onSkip: (t.status === 'waiting' || t.status === 'running') ? () => skipTask(t.id) : undefined,
        onEdit: (t.status === 'waiting' || t.status === 'running') ? () => selectTask(t.id) : undefined,
        onSelect: () => selectTask(t.id),
      },
    }));

    const newEdges = [];
    tasks.forEach(t => {
      (t.dependsOn || []).forEach(dep => {
        newEdges.push({
          id: `${dep}-${t.id}`,
          source: dep,
          target: t.id,
          animated: t.status === 'running',
          style: { stroke: STATUS_COLORS[t.status] || '#444', strokeWidth: 2 },
          type: 'smoothstep',
        });
      });
    });

    const layoutNodes = applyDagreLayout(rawNodes, newEdges);
    setNodes(layoutNodes);
    setEdges(newEdges);
  }, [skipTask, selectTask, getRoleActivity]);

  // Build graph from wave summary (no board)
  const buildGraphFromWave = useCallback((wave) => {
    const roles = wave.roles || [];
    if (!roles.length) { setNodes([]); setEdges([]); return; }

    const statusMap = { done: 'done', streaming: 'running', running: 'running', error: 'blocked', unknown: 'waiting', awaiting_input: 'running' };

    const rawNodes = [];
    const newEdges = [];

    rawNodes.push({
      id: 'ceo',
      type: 'agent',
      position: { x: 0, y: 0 },
      data: { label: 'CEO Supervisor', role: 'ceo', status: 'done', color: '#22c55e', onSelect: () => {} },
    });

    roles.forEach((r, i) => {
      const st = statusMap[r.status] || 'waiting';
      const nodeId = `role-${r.roleId}-${i}`;
      rawNodes.push({
        id: nodeId,
        type: 'agent',
        position: { x: 0, y: 0 },
        data: {
          label: r.roleName || r.roleId,
          role: r.roleId,
          status: st,
          color: STATUS_COLORS[st] || '#444',
          onSelect: () => {},
        },
      });
      newEdges.push({
        id: `ceo-${nodeId}`,
        source: 'ceo',
        target: nodeId,
        type: 'smoothstep',
        animated: st === 'running',
        style: { stroke: STATUS_COLORS[st] || '#444', strokeWidth: 2 },
      });

      (r.childSessions || []).forEach((c, ci) => {
        const childId = `child-${c.roleId}-${ci}`;
        const cst = statusMap[c.status] || 'waiting';
        rawNodes.push({
          id: childId,
          type: 'agent',
          position: { x: 0, y: 0 },
          data: {
            label: c.roleName || c.roleId,
            role: c.roleId,
            status: cst,
            color: STATUS_COLORS[cst] || '#444',
            onSelect: () => {},
          },
        });
        newEdges.push({
          id: `${nodeId}-${childId}`,
          source: nodeId,
          target: childId,
          type: 'smoothstep',
          animated: cst === 'running',
          style: { stroke: STATUS_COLORS[cst] || '#444', strokeWidth: 2 },
        });
      });
    });

    const layoutNodes = applyDagreLayout(rawNodes, newEdges);
    setNodes(layoutNodes);
    setEdges(newEdges);
  }, []);

  const directive = board?.directive || waves.find(w => w.id === currentWaveId)?.directive || '';

  return (
    <div style={{ width: '100vw', height: '100vh', display: 'flex', flexDirection: 'column', background: '#0a0a0a' }}>
      {/* Top bar */}
      <div style={{ padding: '12px 20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid #1a1a1a' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <span style={{ fontSize: '1.3em', fontWeight: 600, color: '#fff' }}>Tycono Board</span>
          <span style={{ fontFamily: 'monospace', fontSize: '0.8em', color: '#666' }}>{currentWaveId}</span>
          <span style={{ fontSize: '0.8em', color: sseStatus === 'Live' ? '#4ade80' : '#666' }}>{sseStatus}</span>
        </div>
        <select
          value={currentWaveId || ''}
          onChange={e => selectWave(e.target.value)}
          style={{ background: '#1a1a1a', color: '#ccc', border: '1px solid #333', padding: '6px 12px', borderRadius: 4, fontSize: '0.85em', minWidth: 300 }}
        >
          <option value="">Select wave...</option>
          {waves.map(w => (
            <option key={w.id} value={w.id}>
              {w.id} — {(w.directive || '').slice(0, 50)}{w.active ? '' : ' (done)'}
            </option>
          ))}
        </select>
      </div>

      {/* Directive */}
      <div style={{ padding: '8px 20px', color: '#888', fontSize: '0.85em', borderBottom: '1px solid #111' }}>
        {directive.slice(0, 120)}
      </div>

      {/* Toolbar */}
      <Toolbar waveId={currentWaveId} board={board} api={API} onRefresh={() => selectWave(currentWaveId)} />

      {/* Main: graph + feed */}
      <div style={{ flex: 1, display: 'flex', overflow: 'hidden', position: 'relative' }}>
        {/* Graph */}
        <div style={{ flex: 1, position: 'relative' }}>
          <ReactFlow
            nodes={nodes}
            edges={edges}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            nodeTypes={nodeTypes}
            fitView
            proOptions={{ hideAttribution: true }}
            style={{ background: '#0a0a0a' }}
          >
            <Background color="#1a1a1a" gap={20} />
            <Controls style={{ background: '#1a1a1a', border: '1px solid #333' }} />
            <MiniMap
              nodeColor={n => n.data?.color || '#444'}
              style={{ background: '#111' }}
            />
          </ReactFlow>

          {/* Task Detail Panel (overlay on graph) */}
          {selectedTask && (
            <TaskDetail
              task={selectedTask}
              waveId={currentWaveId}
              api={API}
              onClose={() => setSelectedTask(null)}
              onAction={() => selectWave(currentWaveId)}
            />
          )}
        </div>

        {/* Activity Feed */}
        <div style={{ width: 360, borderLeft: '1px solid #1a1a1a', overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
          <ActivityFeed events={events} />
        </div>
      </div>
    </div>
  );
}
