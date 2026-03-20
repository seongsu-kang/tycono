import { ActivityStream, type ActivityEvent, type ActivitySubscriber } from './activity-stream.js';
import type { Execution } from './execution-manager.js';
import { getSession } from './session-store.js';
import type { Response } from 'express';

/* ─── Types ──────────────────────────────── */

export interface WaveStreamEnvelope {
  waveId: string;
  waveSeq: number;
  sessionId: string;
  roleId: string;
  event: ActivityEvent;
}

interface AttachedSession {
  sessionId: string;
  roleId: string;
  executionId: string;
  unsubscribe: () => void;
}

interface WaveStreamClient {
  res: Response;
  waveSeq: number;
  attachedSessions: Map<string, AttachedSession>; // sessionId → attachment
  sentEvents: Set<string>;
  heartbeat: ReturnType<typeof setInterval>;
  closed: boolean;
}

/* ─── WaveMultiplexer ────────────────────── */

class WaveMultiplexer {
  private clients = new Map<string, Set<WaveStreamClient>>();
  private waveSessions = new Map<string, Map<string, Execution>>();

  registerSession(waveId: string, execution: Execution): void {
    if (!this.waveSessions.has(waveId)) {
      this.waveSessions.set(waveId, new Map());
    }
    this.waveSessions.get(waveId)!.set(execution.sessionId, execution);

    console.log(`[WaveMux] registerSession wave=${waveId} session=${execution.sessionId} role=${execution.roleId}`);

    const clients = this.clients.get(waveId);
    if (clients) {
      for (const client of clients) {
        if (!client.closed) {
          this.subscribeSessionToClient(waveId, client, execution, true);
        }
      }
    }
  }

  attach(waveId: string, res: Response, fromWaveSeq: number): WaveStreamClient {
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
      'X-Accel-Buffering': 'no',
    });
    res.flushHeaders();

    const client: WaveStreamClient = {
      res,
      waveSeq: 0,
      attachedSessions: new Map(),
      sentEvents: new Set(),
      heartbeat: setInterval(() => {
        if (client.closed || res.destroyed || res.writableEnded) {
          clearInterval(client.heartbeat);
          return;
        }
        try { res.write(': heartbeat\n\n'); } catch { /* ignore */ }
      }, 15_000),
      closed: false,
    };

    if (!this.clients.has(waveId)) {
      this.clients.set(waveId, new Set());
    }
    this.clients.get(waveId)!.add(client);

    const sessions = this.waveSessions.get(waveId);
    if (sessions) {
      // Phase 1: Replay recent historical events (capped to prevent OOM)
      // Only replay from recent sessions (last 5) to avoid 120-session waves killing memory
      const MAX_REPLAY_SESSIONS = 5;
      const MAX_REPLAY_EVENTS = 200;

      const sessionList = Array.from(sessions.values());
      const recentSessions = sessionList.slice(-MAX_REPLAY_SESSIONS);

      const allEvents: { event: ActivityEvent; sessionId: string }[] = [];
      for (const exec of recentSessions) {
        const events = ActivityStream.readFrom(exec.sessionId, 0);
        // Take last N events per session
        const recent = events.slice(-50);
        for (const event of recent) {
          allEvents.push({ event, sessionId: exec.sessionId });
        }
      }

      allEvents.sort((a, b) => a.event.ts.localeCompare(b.event.ts));

      // Cap total replay events
      const replayEvents = allEvents.slice(-MAX_REPLAY_EVENTS);

      for (const item of replayEvents) {
        const waveSeq = client.waveSeq++;
        if (waveSeq < fromWaveSeq) continue;

        const key = `${item.event.roleId}:${item.event.seq}`;
        client.sentEvents.add(key);

        sendSSE(client, 'wave:event', {
          waveId,
          waveSeq,
          sessionId: item.sessionId,
          roleId: item.event.roleId,
          event: item.event,
        } as WaveStreamEnvelope);
      }

      console.log(`[WaveMux] Replayed ${replayEvents.length} events (${sessionList.length} total sessions, ${recentSessions.length} replayed)`);

      // Phase 2: Subscribe to live events for active sessions
      for (const exec of sessionList) {
        if (exec.status === 'running' || exec.status === 'awaiting_input') {
          this.subscribeSessionToClient(waveId, client, exec, true);
        }
      }
    }

    console.log(`[WaveMux] attach wave=${waveId} sessions=${sessions?.size ?? 0} from=${fromWaveSeq}`);
    return client;
  }

  private subscribeSessionToClient(waveId: string, client: WaveStreamClient, execution: Execution, sendNotification: boolean): void {
    // If already attached to this session with a DIFFERENT execution, re-subscribe
    // This handles the resume case where a new execution reuses the same sessionId
    const existing = client.attachedSessions.get(execution.sessionId);
    if (existing) {
      if (existing.executionId === execution.id) return; // Same execution, skip
      existing.unsubscribe();
      client.attachedSessions.delete(execution.sessionId);
      console.log(`[WaveMux] re-subscribing session=${execution.sessionId} (new exec=${execution.id})`);
    }

    const sessionId = execution.sessionId;
    const roleId = execution.roleId;

    if (sendNotification) {
      sendSSE(client, 'wave:role-attached', {
        sessionId,
        roleId,
        parentSessionId: execution.parentSessionId,
      });

      const events = ActivityStream.readFrom(execution.sessionId, 0);
      const recentEvents = events.slice(-50); // Cap replay per session
      for (const event of recentEvents) {
        const key = `${event.roleId}:${event.seq}`;
        if (client.sentEvents.has(key)) continue;
        client.sentEvents.add(key);

        const waveSeq = client.waveSeq++;
        sendSSE(client, 'wave:event', {
          waveId,
          waveSeq,
          sessionId,
          roleId: event.roleId,
          event,
        } as WaveStreamEnvelope);
      }
    }

    const subscriber: ActivitySubscriber = (event: ActivityEvent) => {
      if (client.closed) return;

      const key = `${event.roleId}:${event.seq}`;
      if (client.sentEvents.has(key)) return;
      client.sentEvents.add(key);
      // OOM prevention: cap sentEvents to prevent unbounded Set growth
      if (client.sentEvents.size > 5000) {
        const entries = Array.from(client.sentEvents);
        client.sentEvents.clear();
        for (const e of entries.slice(-2000)) client.sentEvents.add(e);
      }

      const waveSeq = client.waveSeq++;
      sendSSE(client, 'wave:event', {
        waveId,
        waveSeq,
        sessionId,
        roleId: event.roleId,
        event,
      } as WaveStreamEnvelope);

      if (event.type === 'msg:done' || event.type === 'msg:error') {
        sendSSE(client, 'wave:role-detached', {
          sessionId,
          roleId,
          reason: event.type === 'msg:done' ? 'done' : 'error',
        });
      }
    };

    execution.stream.subscribe(subscriber);

    client.attachedSessions.set(sessionId, {
      sessionId,
      roleId,
      executionId: execution.id,
      unsubscribe: () => execution.stream.unsubscribe(subscriber),
    });

    console.log(`[WaveMux] subscribed session=${sessionId} role=${roleId} notify=${sendNotification}`);
  }

  onExecutionCreated(execution: Execution): void {
    // Check multiplexer's in-memory map first
    let waveId = this.findWaveIdForSession(execution.sessionId) ?? this.findWaveIdForSession(execution.parentSessionId ?? '');

    // BUG-W02 fix: also check session-store for waveId (propagated from parent)
    if (!waveId) {
      const session = getSession(execution.sessionId);
      if (session?.waveId) waveId = session.waveId;
    }
    if (!waveId && execution.parentSessionId) {
      const parentSession = getSession(execution.parentSessionId);
      if (parentSession?.waveId) waveId = parentSession.waveId;
    }

    if (!waveId) return;

    this.registerSession(waveId, execution);
  }

  /** Remove completed wave sessions from memory */
  cleanupWave(waveId: string): void {
    this.waveSessions.delete(waveId);
    this.clients.delete(waveId);
  }

  detach(waveId: string, client: WaveStreamClient): void {
    client.closed = true;
    clearInterval(client.heartbeat);

    for (const [, attached] of client.attachedSessions) {
      attached.unsubscribe();
    }
    client.attachedSessions.clear();
    client.sentEvents.clear();

    const clientSet = this.clients.get(waveId);
    if (clientSet) {
      clientSet.delete(client);
      if (clientSet.size === 0) {
        this.clients.delete(waveId);
      }
    }
  }

  private findWaveIdForSession(sessionId: string): string | undefined {
    for (const [waveId, sessions] of this.waveSessions) {
      if (sessions.has(sessionId)) return waveId;
    }
    return undefined;
  }

  getWaveSessionIds(waveId: string): string[] {
    const sessions = this.waveSessions.get(waveId);
    return sessions ? Array.from(sessions.keys()) : [];
  }

  getActiveWaves(): Array<{
    id: string;
    directive: string;
    dispatches: Array<{ sessionId: string; roleId: string; roleName: string }>;
    startedAt: number;
    sessionIds: string[];
  }> {
    const result: Array<{
      id: string;
      directive: string;
      dispatches: Array<{ sessionId: string; roleId: string; roleName: string }>;
      startedAt: number;
      sessionIds: string[];
    }> = [];

    for (const [waveId, sessions] of this.waveSessions) {
      const hasActive = Array.from(sessions.values()).some(e => e.status === 'running' || e.status === 'awaiting_input');
      if (!hasActive) continue;

      const rootSessions = Array.from(sessions.values())
        .filter(e => !e.parentSessionId || !sessions.has(e.parentSessionId))
        .map(e => ({
          sessionId: e.sessionId,
          roleId: e.roleId,
          roleName: e.roleId.toUpperCase(),
        }));

      const firstExec = rootSessions.length > 0
        ? Array.from(sessions.values()).find(e => e.sessionId === rootSessions[0].sessionId)
        : undefined;
      const directive = firstExec?.task.replace(/^\[CEO Wave\]\s*/, '') ?? '';

      const startedAt = Math.min(
        ...Array.from(sessions.values()).map(e => new Date(e.createdAt).getTime())
      );

      const sessionIds = Array.from(sessions.values()).map(e => e.sessionId);

      result.push({ id: waveId, directive, dispatches: rootSessions, startedAt, sessionIds });
    }

    return result;
  }
}

/* ─── Helpers ────────────────────────────── */

function sendSSE(client: WaveStreamClient, event: string, data: unknown): void {
  if (client.closed || client.res.destroyed || client.res.writableEnded) return;
  try {
    client.res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
  } catch { /* ignore write errors */ }
}

/* ─── Export singleton ───────────────────── */

export const waveMultiplexer = new WaveMultiplexer();
