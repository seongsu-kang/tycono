import { useState, useEffect, useRef, useCallback } from 'react';
import type { ActivityEvent, OrgNode, StreamStatus } from '../types';
export type { WaveNodeStatus } from '../types';
import type { WaveNodeStatus } from '../types';
import { isWaveNodeActive } from '../types';
import { useWaveStream } from './useWaveStream';

export interface WaveNode {
  sessionId: string;
  roleId: string;
  roleName: string;
  children: string[];
  status: WaveNodeStatus;
  events: ActivityEvent[];
  streamStatus: StreamStatus;
}

export interface UseWaveTreeResult {
  nodes: Map<string, WaveNode>;
  selectedRoleId: string | null;
  selectNode: (roleId: string) => void;
  checkedRoles: Set<string>;
  toggleCheck: (roleId: string) => void;
  setCheckedRoles: (roles: Set<string>) => void;
  progress: { done: number; total: number; running: number; awaitingInput: number };
  allDone: boolean;
  connectStream: (sessionId: string, roleId: string) => void;
  injectStaticNodes: (staticNodes: Map<string, WaveNode>) => void;
  /** Reset to fresh org tree (clears replay state) */
  reset: () => void;
}

interface StreamState {
  controller: AbortController;
  lastSeq: number;
}

export default function useWaveTree(
  rootDispatches: Array<{ sessionId: string; roleId: string; roleName?: string }>,
  orgNodes: Record<string, OrgNode>,
  rootRoleId: string,
  /** SSE-005: When provided, use multiplexed wave stream instead of per-role SSE */
  waveId?: string | null,
): UseWaveTreeResult {
  const [nodes, setNodes] = useState<Map<string, WaveNode>>(new Map());
  const [selectedRoleId, setSelectedRoleId] = useState<string | null>(null);
  const [checkedRoles, setCheckedRoles] = useState<Set<string>>(new Set());
  const streamsRef = useRef<Map<string, StreamState>>(new Map());
  const nodesRef = useRef<Map<string, WaveNode>>(nodes);
  nodesRef.current = nodes;
  const injectedRef = useRef(false);

  // SSE-005: Multiplexed wave stream hook
  const { connectWaveStream, disconnectWaveStream } = useWaveStream();

  // Build org tree helper
  const buildOrgTree = useCallback(() => {
    if (!rootRoleId || Object.keys(orgNodes).length === 0) return null;

    const initial = new Map<string, WaveNode>();
    const allRoles = new Set<string>();

    const addNode = (roleId: string) => {
      const org = orgNodes[roleId];
      if (!org) return;
      allRoles.add(roleId);
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

    return { initial, allRoles };
  }, [orgNodes, rootRoleId]);

  // Build initial tree from org nodes
  const hadDispatchesRef = useRef(false);
  useEffect(() => {
    // Skip rebuild if static nodes were injected (replay mode)
    // Clear flag when active wave starts (rootDispatches non-empty)
    if (injectedRef.current) {
      if (rootDispatches.length > 0) {
        injectedRef.current = false;
      } else {
        return;
      }
    }

    // BUG-010: Don't rebuild tree to "waiting" when dispatches go from non-empty to empty
    // (wave completed → active wave removed). Preserve the final statuses.
    if (rootDispatches.length === 0 && hadDispatchesRef.current && nodesRef.current.size > 0) {
      return;
    }
    hadDispatchesRef.current = rootDispatches.length > 0;

    const result = buildOrgTree();
    if (!result) return;
    const { initial, allRoles } = result;

    // Map root dispatches to their role nodes
    for (const rj of rootDispatches) {
      const node = initial.get(rj.roleId);
      if (node) {
        node.sessionId = rj.sessionId;
        node.status = 'streaming';
        node.streamStatus = 'connecting';
      }
    }

    setNodes(initial);

    // Initialize checkedRoles to all non-CEO roles
    setCheckedRoles(prev => {
      if (prev.size === 0) {
        const nonCeo = new Set(allRoles);
        nonCeo.delete(rootRoleId);
        return nonCeo;
      }
      return prev;
    });

    if (rootDispatches.length > 0) {
      setSelectedRoleId(prev => prev ?? rootDispatches[0].roleId);
    }
  }, [rootDispatches, orgNodes, rootRoleId, buildOrgTree]);

  const toggleCheck = useCallback((roleId: string) => {
    setCheckedRoles(prev => {
      const next = new Set(prev);
      if (next.has(roleId)) next.delete(roleId);
      else next.add(roleId);
      return next;
    });
  }, []);

  // Inject static replay nodes (aborts existing streams)
  const injectStaticNodes = useCallback((staticNodes: Map<string, WaveNode>) => {
    // Abort all existing streams
    for (const [, stream] of streamsRef.current) {
      stream.controller.abort();
    }
    streamsRef.current.clear();
    injectedRef.current = true;
    setNodes(staticNodes);
    // Select first non-CEO role that has events
    for (const [id, node] of staticNodes) {
      if (id !== rootRoleId && node.events.length > 0) {
        setSelectedRoleId(id);
        break;
      }
    }
  }, [rootRoleId]);

  // Connect SSE for a session
  const connectStream = useCallback((sessionId: string, roleId: string) => {
    // Skip if already connected to this session and stream is active
    const existing = streamsRef.current.get(sessionId);
    if (existing && !existing.controller.signal.aborted) {
      console.log(`[WaveTree] connectStream SKIP (already connected) → role=${roleId} session=${sessionId}`);
      return;
    }
    if (existing) {
      existing.controller.abort();
    }

    console.log(`[WaveTree] connectStream → role=${roleId} session=${sessionId}`);

    // Mark node as running (preserve events if reconnecting)
    setNodes((prev) => {
      const next = new Map(prev);
      const node = next.get(roleId);
      if (node) next.set(roleId, { ...node, sessionId, status: 'streaming', streamStatus: 'connecting', events: [] });
      return next;
    });

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

        console.log(`[WaveTree SSE] connected → role=${roleId} status=${response.status}`);
        setNodes((prev) => {
          const next = new Map(prev);
          const node = next.get(roleId);
          if (node) next.set(roleId, { ...node, streamStatus: 'streaming', status: 'streaming' });
          return next;
        });

        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = '';
        let currentEvent = ''; // persist across chunks

        while (true) {
          const { done, value } = await reader.read();
          if (done) {
            // Mark stream as ended so connectStream can reconnect to this sessionId
            controller.abort();
            break;
          }

          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split('\n');
          buffer = lines.pop() ?? '';

          for (const line of lines) {
            if (line.startsWith('event: ')) {
              currentEvent = line.slice(7).trim();
            } else if (line.startsWith('data: ')) {
              try {
                const data = JSON.parse(line.slice(6));
                console.log(`[WaveTree SSE] role=${roleId} event=${currentEvent} type=${data?.type ?? '?'} seq=${data?.seq ?? '?'}`);

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

                    if (event.type === 'dispatch:start' && event.data.childSessionId) {
                      const targetRoleId = (event.data.targetRoleId as string) ?? (event.data.roleId as string);
                      const childSessionId = event.data.childSessionId as string | undefined;

                      console.log(`[WaveTree] dispatch:start → target=${targetRoleId} childSession=${childSessionId ?? 'none'} from=${roleId}`);

                      if (targetRoleId && childSessionId) {
                        const childNode = next.get(targetRoleId);
                        if (childNode) {
                          next.set(targetRoleId, {
                            ...childNode,
                            sessionId: childSessionId,
                            status: 'streaming',
                            streamStatus: 'connecting',
                          });
                          setTimeout(() => connectStream(childSessionId, targetRoleId), 0);
                        }
                      }
                    }

                    if (event.type === 'dispatch:error') {
                      const targetRole = event.data.targetRole as string | undefined;
                      if (targetRole) {
                        const targetNode = next.get(targetRole);
                        if (targetNode && targetNode.status === 'waiting') {
                          next.set(targetRole, {
                            ...targetNode,
                            status: 'error',
                            streamStatus: 'error',
                          });
                        }
                        console.warn(`[WaveTree] dispatch:error → ${event.data.sourceRole} → ${targetRole}: ${event.data.error}`);
                      }
                    }

                    if (event.type === 'msg:done') {
                      updated.status = 'done';
                      updated.streamStatus = 'done';
                    } else if (event.type === 'msg:error') {
                      updated.status = 'error';
                      updated.streamStatus = 'error';
                    } else if (event.type === 'msg:awaiting_input') {
                      updated.status = 'awaiting_input';
                      updated.streamStatus = 'done';
                    } else if (event.type === 'msg:reply') {
                      updated.status = 'streaming';
                      updated.streamStatus = 'streaming';
                    }

                    next.set(roleId, updated);
                    return next;
                  });
                } else if (currentEvent === 'stream:end') {
                  const reason = data.reason as string;
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
                        status: node.status === 'streaming' ? (finalStatus as WaveNodeStatus) : node.status,
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
  // SSE-005: Use multiplexed wave stream when waveId is available
  const startedSessionsRef = useRef<Set<string>>(new Set());
  const usingMultiplexRef = useRef(false);
  const orgNodesRef = useRef(orgNodes);
  orgNodesRef.current = orgNodes;
  const rootDispatchesRef = useRef(rootDispatches);
  rootDispatchesRef.current = rootDispatches;

  // Multiplexed wave stream effect — depends only on waveId
  useEffect(() => {
    if (!waveId || rootDispatchesRef.current.length === 0) return;

    usingMultiplexRef.current = true;
    connectWaveStream(waveId, setNodes, orgNodesRef.current);

    return () => {
      disconnectWaveStream();
      usingMultiplexRef.current = false;
    };
  }, [waveId, connectWaveStream, disconnectWaveStream]);

  // Fallback: per-role SSE (for cases without waveId, e.g. legacy)
  useEffect(() => {
    if (waveId || rootDispatches.length === 0) return;

    usingMultiplexRef.current = false;
    const sessionIds = new Set<string>();
    for (const rj of rootDispatches) {
      sessionIds.add(rj.sessionId);
      connectStream(rj.sessionId, rj.roleId);
    }
    startedSessionsRef.current = sessionIds;

    return () => {
      for (const sid of startedSessionsRef.current) {
        const stream = streamsRef.current.get(sid);
        if (stream) {
          stream.controller.abort();
          streamsRef.current.delete(sid);
        }
      }
      startedSessionsRef.current.clear();
    };
  }, [rootDispatches, connectStream, waveId]);

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
      else if (node.status === 'streaming') running++;
      else if (node.status === 'awaiting_input') awaitingInput++;
    }
    return { done, total, running, awaitingInput };
  })();

  // allDone requires at least one node to have actually been dispatched (done/error),
  // not just a fresh tree of 'waiting' nodes which would falsely trigger allDone.
  const allDone = progress.total > 0 && progress.done > 0 && progress.running === 0 && progress.awaitingInput === 0 &&
    Array.from(nodes.values()).every(n => !isWaveNodeActive(n.status) && n.streamStatus !== 'streaming' && n.streamStatus !== 'connecting');

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

  const reset = useCallback(() => {
    // Abort all streams
    for (const [, stream] of streamsRef.current) {
      stream.controller.abort();
    }
    streamsRef.current.clear();
    injectedRef.current = false;
    // Rebuild fresh org tree
    const result = buildOrgTree();
    if (result) {
      setNodes(result.initial);
      const nonCeo = new Set(result.allRoles);
      nonCeo.delete(rootRoleId);
      setCheckedRoles(nonCeo);
    }
    setSelectedRoleId(rootRoleId);
  }, [buildOrgTree, rootRoleId]);

  return {
    nodes,
    selectedRoleId,
    selectNode: setSelectedRoleId,
    checkedRoles,
    toggleCheck,
    setCheckedRoles,
    progress,
    allDone,
    connectStream,
    injectStaticNodes,
    reset,
  };
}
