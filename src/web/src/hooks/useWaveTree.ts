import { useState, useEffect, useRef, useCallback } from 'react';
import type { ActivityEvent, OrgNode } from '../types';
import type { StreamStatus } from './useActivityStream';

export type WaveNodeStatus = 'waiting' | 'running' | 'done' | 'error' | 'not-dispatched' | 'awaiting_input';

export interface WaveNode {
  sessionId: string;
  roleId: string;
  roleName: string;
  children: string[];
  status: WaveNodeStatus;
  events: ActivityEvent[];
  streamStatus: StreamStatus;
}

interface UseWaveTreeResult {
  nodes: Map<string, WaveNode>;
  selectedRoleId: string | null;
  selectNode: (roleId: string) => void;
  progress: { done: number; total: number; running: number; awaitingInput: number };
  allDone: boolean;
  connectStream: (sessionId: string, roleId: string) => void;
}

interface StreamState {
  controller: AbortController;
  lastSeq: number;
}

export default function useWaveTree(
  rootJobs: Array<{ sessionId: string; roleId: string; roleName?: string }>,
  orgNodes: Record<string, OrgNode>,
  rootRoleId: string,
): UseWaveTreeResult {
  const [nodes, setNodes] = useState<Map<string, WaveNode>>(new Map());
  const [selectedRoleId, setSelectedRoleId] = useState<string | null>(null);
  const streamsRef = useRef<Map<string, StreamState>>(new Map());
  const nodesRef = useRef<Map<string, WaveNode>>(nodes);
  nodesRef.current = nodes;

  // Build initial tree from org nodes
  useEffect(() => {
    if (!rootRoleId || Object.keys(orgNodes).length === 0) return;

    const initial = new Map<string, WaveNode>();

    const addNode = (roleId: string) => {
      const org = orgNodes[roleId];
      if (!org) return;
      initial.set(roleId, {
        sessionId: '',
        roleId,
        roleName: org.name,
        children: org.children,
        status: 'waiting',
        events: [],
        streamStatus: 'idle',
      });
      org.children.forEach(addNode);
    };

    const root = orgNodes[rootRoleId];
    if (root) {
      initial.set(rootRoleId, {
        sessionId: '',
        roleId: rootRoleId,
        roleName: 'CEO',
        children: root.children,
        status: 'not-dispatched',
        events: [],
        streamStatus: 'idle',
      });
      root.children.forEach(addNode);
    }

    // Map root jobs to their role nodes
    for (const rj of rootJobs) {
      const node = initial.get(rj.roleId);
      if (node) {
        node.sessionId = rj.sessionId;
        node.status = 'running';
        node.streamStatus = 'connecting';
      }
    }

    setNodes(initial);
    if (rootJobs.length > 0) {
      setSelectedRoleId(rootJobs[0].roleId);
    }
  }, [rootJobs, orgNodes, rootRoleId]);

  // Connect SSE for a session
  const connectStream = useCallback((sessionId: string, roleId: string) => {
    console.log(`[WaveTree] connectStream → role=${roleId} session=${sessionId}`);
    const existing = streamsRef.current.get(sessionId);
    if (existing) {
      existing.controller.abort();
    }

    const controller = new AbortController();
    const state: StreamState = { controller, lastSeq: -1 };
    streamsRef.current.set(sessionId, state);

    const url = `/api/sessions/${sessionId}/stream?from=0`;

    fetch(url, { signal: controller.signal })
      .then(async (response) => {
        if (!response.ok || !response.body) {
          setNodes((prev) => {
            const next = new Map(prev);
            const node = next.get(roleId);
            if (node) next.set(roleId, { ...node, streamStatus: 'error' });
            return next;
          });
          return;
        }

        setNodes((prev) => {
          const next = new Map(prev);
          const node = next.get(roleId);
          if (node) next.set(roleId, { ...node, streamStatus: 'streaming', status: 'running' });
          return next;
        });

        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = '';

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split('\n');
          buffer = lines.pop() ?? '';

          let currentEvent = '';
          for (const line of lines) {
            if (line.startsWith('event: ')) {
              currentEvent = line.slice(7).trim();
            } else if (line.startsWith('data: ')) {
              try {
                const data = JSON.parse(line.slice(6));

                if (currentEvent === 'activity') {
                  const event = data as ActivityEvent;
                  if (event.seq > state.lastSeq) {
                    state.lastSeq = event.seq;
                  }

                  setNodes((prev) => {
                    const next = new Map(prev);
                    const node = next.get(roleId);
                    if (!node) return prev;
                    if (node.events.some(e => e.seq === event.seq)) return prev;

                    const updated = { ...node, events: [...node.events, event] };

                    // Handle dispatch:start — child dispatches create their own sessions
                    // The session-based stream will emit dispatch events with session info
                    if (event.type === 'dispatch:start' && event.data.childJobId) {
                      const targetRoleId = (event.data.targetRoleId as string) ?? (event.data.roleId as string);
                      // Child dispatches: use the child's sessionId if available, or jobId as fallback lookup
                      const childSessionId = event.data.childSessionId as string | undefined;

                      console.log(`[WaveTree] dispatch:start → target=${targetRoleId} childSession=${childSessionId ?? 'none'} from=${roleId}`);

                      if (targetRoleId && childSessionId) {
                        const childNode = next.get(targetRoleId);
                        if (childNode) {
                          next.set(targetRoleId, {
                            ...childNode,
                            sessionId: childSessionId,
                            status: 'running',
                            streamStatus: 'connecting',
                          });
                          setTimeout(() => connectStream(childSessionId, targetRoleId), 0);
                        } else {
                          console.warn(`[WaveTree] dispatch:start — no node found for role "${targetRoleId}"`);
                        }
                      }
                    }

                    if (event.type === 'job:done') {
                      console.log(`[WaveTree] job:done → role=${roleId}`);
                      updated.status = 'done';
                      updated.streamStatus = 'done';
                    } else if (event.type === 'job:error') {
                      console.log(`[WaveTree] job:error → role=${roleId}`);
                      updated.status = 'error';
                      updated.streamStatus = 'error';
                    } else if (event.type === 'job:awaiting_input') {
                      console.log(`[WaveTree] job:awaiting_input → role=${roleId}`);
                      updated.status = 'awaiting_input';
                      updated.streamStatus = 'done';
                    } else if (event.type === 'job:reply') {
                      console.log(`[WaveTree] job:reply → role=${roleId}`);
                      updated.status = 'running';
                      updated.streamStatus = 'streaming';
                    }

                    next.set(roleId, updated);
                    return next;
                  });
                } else if (currentEvent === 'stream:end') {
                  const reason = data.reason as string;
                  console.log(`[WaveTree] stream:end → role=${roleId} reason=${reason}`);
                  if (reason !== 'replied') {
                    setNodes((prev) => {
                      const next = new Map(prev);
                      const node = next.get(roleId);
                      if (!node) return prev;
                      const finalStatus = reason === 'error' ? 'error'
                        : reason === 'awaiting_input' ? 'awaiting_input'
                        : 'done';
                      next.set(roleId, {
                        ...node,
                        status: node.status === 'running' ? (finalStatus as WaveNodeStatus) : node.status,
                        streamStatus: finalStatus === 'error' ? 'error' : 'done',
                      });
                      return next;
                    });
                  }
                }
              } catch { /* skip malformed */ }
              currentEvent = '';
            }
          }
        }
      })
      .catch((err) => {
        if (err.name === 'AbortError') return;
        setNodes((prev) => {
          const next = new Map(prev);
          const node = next.get(roleId);
          if (node) next.set(roleId, { ...node, streamStatus: 'error' });
          return next;
        });
      });
  }, []);

  // Start SSE streams for root jobs
  useEffect(() => {
    if (rootJobs.length === 0) return;

    for (const rj of rootJobs) {
      connectStream(rj.sessionId, rj.roleId);
    }

    return () => {
      for (const [, stream] of streamsRef.current) {
        stream.controller.abort();
      }
      streamsRef.current.clear();
    };
  }, [rootJobs, connectStream]);

  // Progress
  const progress = (() => {
    let done = 0;
    let running = 0;
    let awaitingInput = 0;
    let total = 0;
    for (const [id, node] of nodes) {
      if (id === rootRoleId) continue;
      total++;
      if (node.status === 'done') done++;
      else if (node.status === 'running') running++;
      else if (node.status === 'awaiting_input') awaitingInput++;
    }
    return { done, total, running, awaitingInput };
  })();

  const allDone = progress.total > 0 && progress.running === 0 && progress.awaitingInput === 0 &&
    Array.from(nodes.values()).every(n => n.status !== 'running' && n.status !== 'awaiting_input' && n.streamStatus !== 'streaming' && n.streamStatus !== 'connecting');

  // When all done, mark remaining 'waiting' as 'not-dispatched'
  useEffect(() => {
    if (!allDone) return;
    setNodes((prev) => {
      const next = new Map(prev);
      let changed = false;
      for (const [id, node] of next) {
        if (node.status === 'waiting') {
          next.set(id, { ...node, status: 'not-dispatched' });
          changed = true;
        }
      }
      return changed ? next : prev;
    });
  }, [allDone]);

  return {
    nodes,
    selectedRoleId,
    selectNode: setSelectedRoleId,
    progress,
    allDone,
    connectStream,
  };
}
