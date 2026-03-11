import { useCallback, useRef } from 'react';
import type { ActivityEvent, OrgNode } from '../types';
import type { WaveNode, WaveNodeStatus } from './useWaveTree';

/* ─── SSE Envelope Types ────────────────── */

interface WaveStreamEnvelope {
  waveSeq: number;
  sessionId: string;
  event: ActivityEvent;
}

interface RoleAttachedPayload {
  sessionId: string;
  roleId: string;
  jobId: string;
  parentJobId?: string;
}

interface RoleDetachedPayload {
  sessionId: string;
  roleId: string;
  reason: 'done' | 'error';
}

/* ─── Hook ───────────────────────────────── */

/**
 * SSE-004: Wave-level multiplexed SSE stream consumer.
 *
 * Replaces per-role `connectStream()` from useWaveTree with a single
 * `GET /api/waves/:waveId/stream` connection. Demultiplexes events
 * by roleId and updates WaveNode state.
 */
export function useWaveStream() {
  const controllerRef = useRef<AbortController | null>(null);
  const lastWaveSeqRef = useRef(0);

  /**
   * Connect to the multiplexed wave stream and dispatch events to setNodes.
   * Call this instead of per-role connectStream() calls.
   */
  const connectWaveStream = useCallback((
    waveId: string,
    setNodes: React.Dispatch<React.SetStateAction<Map<string, WaveNode>>>,
    orgNodes: Record<string, OrgNode>,
  ) => {
    // Abort previous connection
    if (controllerRef.current) {
      controllerRef.current.abort();
    }

    const controller = new AbortController();
    controllerRef.current = controller;
    lastWaveSeqRef.current = 0;

    const fromSeq = 0; // Always start from 0 for now

    const url = `/api/waves/${waveId}/stream?from=${fromSeq}`;

    fetch(url, { signal: controller.signal })
      .then(async (response) => {
        if (!response.ok || !response.body) {
          console.error(`[WaveStream] Failed to connect: ${response.status}`);
          return;
        }

        console.log(`[WaveStream] Connected to wave=${waveId}`);

        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = '';
        let currentEvent = '';

        // Stale connection detection (60s timeout)
        let lastDataAt = Date.now();
        const STALE_TIMEOUT_MS = 60_000;
        const staleCheck = setInterval(() => {
          if (Date.now() - lastDataAt > STALE_TIMEOUT_MS) {
            console.warn('[WaveStream] Stale connection — no data for 60s');
            controller.abort();
            clearInterval(staleCheck);
          }
        }, 10_000);

        try {
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;

            lastDataAt = Date.now();
            buffer += decoder.decode(value, { stream: true });
            const lines = buffer.split('\n');
            buffer = lines.pop() ?? '';

            for (const line of lines) {
              if (line.startsWith('event: ')) {
                currentEvent = line.slice(7).trim();
              } else if (line.startsWith('data: ')) {
                try {
                  const data = JSON.parse(line.slice(6));
                  handleSSEEvent(currentEvent, data, setNodes, orgNodes);
                } catch { /* skip malformed */ }
                currentEvent = '';
              }
              // Heartbeat comments (": heartbeat") reset stale timer via lastDataAt
            }
          }
        } finally {
          clearInterval(staleCheck);
        }
      })
      .catch((err) => {
        if (err.name === 'AbortError') return;
        console.error('[WaveStream] Connection error:', err);
      });
  }, []);

  /**
   * Disconnect from the wave stream
   */
  const disconnectWaveStream = useCallback(() => {
    if (controllerRef.current) {
      controllerRef.current.abort();
      controllerRef.current = null;
    }
  }, []);

  return { connectWaveStream, disconnectWaveStream };
}

/* ─── Event Handlers ─────────────────────── */

function handleSSEEvent(
  eventType: string,
  data: unknown,
  setNodes: React.Dispatch<React.SetStateAction<Map<string, WaveNode>>>,
  orgNodes: Record<string, OrgNode>,
): void {
  switch (eventType) {
    case 'wave:event':
      handleWaveEvent(data as WaveStreamEnvelope, setNodes);
      break;
    case 'wave:role-attached':
      handleRoleAttached(data as RoleAttachedPayload, setNodes, orgNodes);
      break;
    case 'wave:role-detached':
      handleRoleDetached(data as RoleDetachedPayload, setNodes);
      break;
    case 'wave:done':
      handleWaveDone(setNodes);
      break;
  }
}

function handleWaveEvent(
  envelope: WaveStreamEnvelope,
  setNodes: React.Dispatch<React.SetStateAction<Map<string, WaveNode>>>,
): void {
  const { event, sessionId } = envelope;
  const { roleId } = event;

  setNodes((prev) => {
    const next = new Map(prev);
    const node = next.get(roleId);
    if (!node) return prev;

    // Skip duplicate events
    if (node.events.some(e => e.seq === event.seq && e.roleId === event.roleId)) return prev;

    const updated: WaveNode = {
      ...node,
      sessionId: sessionId || node.sessionId,
      events: [...node.events, event],
    };

    // Update status based on event type
    if (event.type === 'job:start') {
      updated.status = 'running';
      updated.streamStatus = 'streaming';
    } else if (event.type === 'job:done') {
      updated.status = 'done';
      updated.streamStatus = 'done';
    } else if (event.type === 'job:error') {
      updated.status = 'error';
      updated.streamStatus = 'error';
    } else if (event.type === 'job:awaiting_input') {
      updated.status = 'awaiting_input';
      updated.streamStatus = 'done';
    } else if (event.type === 'job:reply') {
      updated.status = 'running';
      updated.streamStatus = 'streaming';
    }

    next.set(roleId, updated);
    return next;
  });
}

function handleRoleAttached(
  data: RoleAttachedPayload,
  setNodes: React.Dispatch<React.SetStateAction<Map<string, WaveNode>>>,
  orgNodes: Record<string, OrgNode>,
): void {
  const { sessionId, roleId, jobId } = data;

  setNodes((prev) => {
    const next = new Map(prev);
    const existing = next.get(roleId);

    if (existing) {
      // Update existing node with session info
      next.set(roleId, {
        ...existing,
        sessionId,
        jobId: jobId || existing.jobId,
        status: 'running',
        streamStatus: 'streaming',
      });
    } else {
      // Create new node for dynamically discovered role
      const org = orgNodes[roleId];
      next.set(roleId, {
        sessionId,
        jobId,
        roleId,
        roleName: org?.name ?? roleId,
        children: org?.children ?? [],
        status: 'running',
        events: [],
        streamStatus: 'streaming',
      });
    }

    return next;
  });
}

function handleRoleDetached(
  data: RoleDetachedPayload,
  setNodes: React.Dispatch<React.SetStateAction<Map<string, WaveNode>>>,
): void {
  const { roleId, reason } = data;
  const status: WaveNodeStatus = reason === 'error' ? 'error' : 'done';

  setNodes((prev) => {
    const next = new Map(prev);
    const node = next.get(roleId);
    if (!node) return prev;
    // Don't override if already in a terminal state from activity events
    if (node.status === 'done' || node.status === 'error') return prev;
    next.set(roleId, { ...node, status, streamStatus: status === 'error' ? 'error' : 'done' });
    return next;
  });
}

function handleWaveDone(
  setNodes: React.Dispatch<React.SetStateAction<Map<string, WaveNode>>>,
): void {
  // Mark any remaining 'waiting' nodes as 'not-dispatched'
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
}
