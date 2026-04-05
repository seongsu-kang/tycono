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
import Toolbar from './Toolbar';

const API = window.location.origin;
const nodeTypes = { agent: AgentNode };

export default function App() {
  const [waves, setWaves] = useState([]);
  const [currentWaveId, setCurrentWaveId] = useState(null);
  const [board, setBoard] = useState(null);
  const [events, setEvents] = useState([]);
  const [sseStatus, setSseStatus] = useState('--');
  const [nodes, setNodes, onNodesChange] = useNodesState([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState([]);
  const sseRef = useRef(null);

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

    // Load board
    try {
      const boardRes = await fetch(`${API}/api/waves/${waveId}/board`);
      if (boardRes.ok) {
        const b = await boardRes.json();
        setBoard(b);
        buildGraph(b, null);
      } else {
        setBoard(null);
        // Load wave summary
        const waveRes = await fetch(`${API}/api/operations/waves/${waveId}`);
        if (waveRes.ok) {
          const raw = await waveRes.json();
          const wave = raw.replay || raw;
          buildGraphFromWave(wave);
        }
      }
    } catch {}

    // Load historical events
    try {
      const evRes = await fetch(`${API}/api/waves/${waveId}/events?limit=150`);
      if (evRes.ok) {
        const data = await evRes.json();
        setEvents(data.events || []);
      }
    } catch {}

    // Connect SSE
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
        // Refresh board
        fetch(`${API}/api/waves/${waveId}/board`).then(r => r.ok ? r.json() : null).then(b => {
          if (b) { setBoard(b); buildGraph(b, null); }
        });
      };
      source.onerror = () => setSseStatus('Offline');
      sseRef.current = source;
    } catch { setSseStatus('--'); }
  }, []);

  // Build React Flow graph from board
  const buildGraph = useCallback((boardData, waveData) => {
    if (!boardData?.tasks?.length) return;
    const tasks = boardData.tasks;

    const statusColors = {
      waiting: '#444',
      running: '#3b82f6',
      done: '#22c55e',
      skipped: '#666',
      blocked: '#ef4444',
    };

    const newNodes = tasks.map((t, i) => ({
      id: t.id,
      type: 'agent',
      position: { x: 100 + (i % 3) * 280, y: 80 + Math.floor(i / 3) * 160 },
      data: {
        label: t.title,
        role: t.assignee,
        status: t.status,
        criteria: t.criteria,
        result: t.result,
        resultNote: t.resultNote,
        color: statusColors[t.status] || '#444',
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
          style: { stroke: statusColors[t.status] || '#444', strokeWidth: 2 },
          type: 'smoothstep',
        });
      });
    });

    setNodes(newNodes);
    setEdges(newEdges);
  }, []);

  // Build graph from wave summary (no board)
  const buildGraphFromWave = useCallback((wave) => {
    const roles = wave.roles || [];
    if (!roles.length) { setNodes([]); setEdges([]); return; }

    const statusMap = { done: 'done', streaming: 'running', running: 'running', error: 'blocked', unknown: 'waiting', awaiting_input: 'running' };
    const statusColors = { waiting: '#444', running: '#3b82f6', done: '#22c55e', blocked: '#ef4444' };

    const newNodes = [];
    const newEdges = [];

    // CEO node
    newNodes.push({
      id: 'ceo',
      type: 'agent',
      position: { x: 300, y: 20 },
      data: { label: 'CEO Supervisor', role: 'ceo', status: 'done', color: '#22c55e' },
    });

    roles.forEach((r, i) => {
      const st = statusMap[r.status] || 'waiting';
      const nodeId = `role-${r.roleId}-${i}`;
      newNodes.push({
        id: nodeId,
        type: 'agent',
        position: { x: 100 + i * 280, y: 180 },
        data: {
          label: r.roleName || r.roleId,
          role: r.roleId,
          status: st,
          color: statusColors[st] || '#444',
        },
      });
      newEdges.push({
        id: `ceo-${nodeId}`,
        source: 'ceo',
        target: nodeId,
        type: 'smoothstep',
        animated: st === 'running',
        style: { stroke: statusColors[st] || '#444', strokeWidth: 2 },
      });

      // Child sessions
      (r.childSessions || []).forEach((c, ci) => {
        const childId = `child-${c.roleId}-${ci}`;
        const cst = statusMap[c.status] || 'waiting';
        newNodes.push({
          id: childId,
          type: 'agent',
          position: { x: 50 + i * 280 + ci * 150, y: 340 },
          data: {
            label: c.roleName || c.roleId,
            role: c.roleId,
            status: cst,
            color: statusColors[cst] || '#444',
          },
        });
        newEdges.push({
          id: `${nodeId}-${childId}`,
          source: nodeId,
          target: childId,
          type: 'smoothstep',
          animated: cst === 'running',
          style: { stroke: statusColors[cst] || '#444', strokeWidth: 2 },
        });
      });
    });

    setNodes(newNodes);
    setEdges(newEdges);
  }, []);

  // Actions
  const skipTask = async (taskId) => {
    await fetch(`${API}/api/waves/${currentWaveId}/board/tasks/${taskId}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'skipped' }),
    });
    selectWave(currentWaveId);
  };

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
      <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>
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
        </div>

        {/* Activity Feed */}
        <div style={{ width: 360, borderLeft: '1px solid #1a1a1a', overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
          <ActivityFeed events={events} />
        </div>
      </div>
    </div>
  );
}
