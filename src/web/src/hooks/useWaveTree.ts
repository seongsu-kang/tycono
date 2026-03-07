import { useState, useEffect, useRef, useCallback } from 'react';
import type { ActivityEvent, OrgNode } from '../types';
import type { StreamStatus } from './useActivityStream';

export type WaveNodeStatus = 'waiting' | 'running' | 'done' | 'error' | 'not-dispatched';

export interface WaveNode {
  jobId: string | null;
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
  progress: { done: number; total: number; running: number };
  allDone: boolean;
}

interface StreamState {
  controller: AbortController;
  lastSeq: number;
}

export default function useWaveTree(
  rootJobs: Array<{ jobId: string; roleId: string; roleName?: string }>,
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

    // Add all org nodes under CEO
    const addNode = (roleId: string) => {
      const org = orgNodes[roleId];
      if (!org) return;
      initial.set(roleId, {
        jobId: null,
        roleId,
        roleName: org.name,
        children: org.children,
        status: 'waiting',
        events: [],
        streamStatus: 'idle',
      });
      org.children.forEach(addNode);
    };

    // Start from CEO's direct children (c-level)
    const root = orgNodes[rootRoleId];
    if (root) {
      // Add CEO node itself (dimmed)
      initial.set(rootRoleId, {
        jobId: null,
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
        node.jobId = rj.jobId;
        node.status = 'running';
        node.streamStatus = 'connecting';
      }
    }

    setNodes(initial);
    if (rootJobs.length > 0) {
      setSelectedRoleId(rootJobs[0].roleId);
    }
  }, [rootJobs, orgNodes, rootRoleId]);

  // Connect SSE for a job
  const connectStream = useCallback((jobId: string, roleId: string) => {
    // Cleanup existing stream for this jobId
    const existing = streamsRef.current.get(jobId);
    if (existing) {
      existing.controller.abort();
    }

    const controller = new AbortController();
    const state: StreamState = { controller, lastSeq: -1 };
    streamsRef.current.set(jobId, state);

    const fromSeq = 0;
    const url = `/api/jobs/${jobId}/stream?from=${fromSeq}`;

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
                    // Dedup
                    if (node.events.some(e => e.seq === event.seq)) return prev;

                    const updated = { ...node, events: [...node.events, event] };

                    // Handle dispatch:start — connect child SSE
                    if (event.type === 'dispatch:start' && event.data.childJobId) {
                      const childJobId = event.data.childJobId as string;
                      const targetRoleId = (event.data.targetRoleId as string) ?? (event.data.roleId as string);

                      if (targetRoleId) {
                        const childNode = next.get(targetRoleId);
                        if (childNode) {
                          next.set(targetRoleId, {
                            ...childNode,
                            jobId: childJobId,
                            status: 'running',
                            streamStatus: 'connecting',
                          });
                          // Schedule child stream connection
                          setTimeout(() => connectStream(childJobId, targetRoleId), 0);
                        }
                      }
                    }

                    if (event.type === 'job:done') {
                      updated.status = 'done';
                      updated.streamStatus = 'done';
                    } else if (event.type === 'job:error') {
                      updated.status = 'error';
                      updated.streamStatus = 'error';
                    }

                    next.set(roleId, updated);
                    return next;
                  });
                } else if (currentEvent === 'stream:end') {
                  const reason = data.reason as string;
                  setNodes((prev) => {
                    const next = new Map(prev);
                    const node = next.get(roleId);
                    if (!node) return prev;
                    const finalStatus = reason === 'error' ? 'error' : 'done';
                    next.set(roleId, {
                      ...node,
                      status: node.status === 'running' ? (finalStatus as WaveNodeStatus) : node.status,
                      streamStatus: finalStatus === 'error' ? 'error' : 'done',
                    });
                    return next;
                  });
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
      connectStream(rj.jobId, rj.roleId);
    }

    return () => {
      for (const [, stream] of streamsRef.current) {
        stream.controller.abort();
      }
      streamsRef.current.clear();
    };
  }, [rootJobs, connectStream]);

  // Mark nodes as not-dispatched when all jobs are done
  const progress = (() => {
    let done = 0;
    let running = 0;
    let total = 0;
    for (const [id, node] of nodes) {
      if (id === rootRoleId) continue; // skip CEO
      total++;
      if (node.status === 'done') done++;
      else if (node.status === 'running') running++;
    }
    return { done, total, running };
  })();

  const allDone = progress.total > 0 && progress.running === 0 &&
    Array.from(nodes.values()).every(n => n.status !== 'running' && n.streamStatus !== 'streaming' && n.streamStatus !== 'connecting');

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
  };
}
