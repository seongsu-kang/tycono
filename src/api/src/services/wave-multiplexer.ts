import { ActivityStream, type ActivityEvent, type ActivitySubscriber } from './activity-stream.js';
import type { Job } from './job-manager.js';
import { isJobActive } from '../../../shared/types.js';
import type { Response } from 'express';

/* ─── Types ──────────────────────────────── */

export interface WaveStreamEnvelope {
  /** Wave-level sequence (across all roles) */
  waveSeq: number;
  /** Session this event belongs to */
  sessionId: string;
  /** Original ActivityEvent (unchanged) */
  event: ActivityEvent;
}

interface AttachedJob {
  jobId: string;
  sessionId: string;
  roleId: string;
  unsubscribe: () => void;
}

interface WaveStreamClient {
  res: Response;
  waveSeq: number;
  attachedJobs: Map<string, AttachedJob>; // jobId → attachment
  /** Set of event keys already sent (to avoid duplicates) */
  sentEvents: Set<string>;
  heartbeat: ReturnType<typeof setInterval>;
  closed: boolean;
}

/* ─── WaveMultiplexer ────────────────────── */

class WaveMultiplexer {
  /** waveId → set of connected SSE clients */
  private clients = new Map<string, Set<WaveStreamClient>>();
  /** waveId → Map<jobId, Job> for live jobs */
  private waveJobs = new Map<string, Map<string, Job>>();

  /**
   * Register a job as belonging to a wave + auto-attach to existing clients.
   */
  registerJob(waveId: string, job: Job): void {
    if (!this.waveJobs.has(waveId)) {
      this.waveJobs.set(waveId, new Map());
    }
    this.waveJobs.get(waveId)!.set(job.id, job);

    console.log(`[WaveMux] registerJob wave=${waveId} job=${job.id} role=${job.roleId}`);

    // Auto-attach to all existing clients for this wave
    const clients = this.clients.get(waveId);
    if (clients) {
      for (const client of clients) {
        if (!client.closed) {
          this.subscribeJobToClient(client, job, true);
        }
      }
    }
  }

  /**
   * Connect a new SSE client to a wave stream.
   * Replays all historical events + subscribes to live events.
   */
  attach(waveId: string, res: Response, fromWaveSeq: number): WaveStreamClient {
    // SSE headers
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
      attachedJobs: new Map(),
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

    // Replay + subscribe for all known jobs
    const jobs = this.waveJobs.get(waveId);
    if (jobs) {
      // Phase 1: Replay all historical events sorted by timestamp
      const allEvents: { event: ActivityEvent; sessionId: string }[] = [];

      for (const [, job] of jobs) {
        const events = ActivityStream.readFrom(job.id, 0);
        const sessionId = job.sessionId ?? '';
        for (const event of events) {
          allEvents.push({ event, sessionId });
        }
      }

      allEvents.sort((a, b) => a.event.ts.localeCompare(b.event.ts));

      for (const item of allEvents) {
        const waveSeq = client.waveSeq++;
        if (waveSeq < fromWaveSeq) continue;

        const key = `${item.event.roleId}:${item.event.seq}`;
        client.sentEvents.add(key);

        sendSSE(client, 'wave:event', {
          waveSeq,
          sessionId: item.sessionId,
          event: item.event,
        } as WaveStreamEnvelope);
      }

      // Phase 2: Subscribe to live events for running jobs
      // sendNotification=true ensures wave:role-attached is sent for each active job,
      // so the client knows which roles are running. History replay is deduped by sentEvents.
      for (const [, job] of jobs) {
        if (isJobActive(job.status)) {
          this.subscribeJobToClient(client, job, true);
        }
      }
    }

    console.log(`[WaveMux] attach wave=${waveId} jobs=${jobs?.size ?? 0} from=${fromWaveSeq}`);
    return client;
  }

  /**
   * Subscribe to a job's live events on a client.
   * @param sendNotification - if true, send wave:role-attached + replay history (for late-joining jobs)
   */
  private subscribeJobToClient(client: WaveStreamClient, job: Job, sendNotification: boolean): void {
    if (client.attachedJobs.has(job.id)) return;

    const sessionId = job.sessionId ?? '';
    const roleId = job.roleId;

    if (sendNotification) {
      // Notify client about new role joining
      sendSSE(client, 'wave:role-attached', {
        sessionId,
        roleId,
        jobId: job.id,
        parentJobId: job.parentJobId,
      });

      // Replay this job's history (for late-joining child jobs)
      const events = ActivityStream.readFrom(job.id, 0);
      for (const event of events) {
        const key = `${event.roleId}:${event.seq}`;
        if (client.sentEvents.has(key)) continue;
        client.sentEvents.add(key);

        const waveSeq = client.waveSeq++;
        sendSSE(client, 'wave:event', {
          waveSeq,
          sessionId,
          event,
        } as WaveStreamEnvelope);
      }
    }

    // Subscribe to live events
    const subscriber: ActivitySubscriber = (event: ActivityEvent) => {
      if (client.closed) return;

      const key = `${event.roleId}:${event.seq}`;
      if (client.sentEvents.has(key)) return; // skip duplicate
      client.sentEvents.add(key);

      const waveSeq = client.waveSeq++;
      sendSSE(client, 'wave:event', {
        waveSeq,
        sessionId,
        event,
      } as WaveStreamEnvelope);

      if (event.type === 'job:done' || event.type === 'job:error') {
        sendSSE(client, 'wave:role-detached', {
          sessionId,
          roleId,
          reason: event.type === 'job:done' ? 'done' : 'error',
        });
      }
    };

    job.stream.subscribe(subscriber);

    client.attachedJobs.set(job.id, {
      jobId: job.id,
      sessionId,
      roleId,
      unsubscribe: () => job.stream.unsubscribe(subscriber),
    });

    console.log(`[WaveMux] subscribed job=${job.id} role=${roleId} notify=${sendNotification}`);
  }

  /**
   * Called when any new job is created — check if it belongs to a wave.
   */
  onJobCreated(job: Job): void {
    // Find wave by tracing parentJobId chain
    const waveId = this.findWaveIdForJob(job.id) ?? this.findWaveIdForJob(job.parentJobId ?? '');
    if (!waveId) return;

    // Register + auto-attach to clients
    this.registerJob(waveId, job);
  }

  /**
   * Disconnect a client from a wave stream
   */
  detach(waveId: string, client: WaveStreamClient): void {
    client.closed = true;
    clearInterval(client.heartbeat);

    for (const [, attached] of client.attachedJobs) {
      attached.unsubscribe();
    }
    client.attachedJobs.clear();
    client.sentEvents.clear();

    const clientSet = this.clients.get(waveId);
    if (clientSet) {
      clientSet.delete(client);
      if (clientSet.size === 0) {
        this.clients.delete(waveId);
      }
    }
  }

  private findWaveIdForJob(jobId: string): string | undefined {
    for (const [waveId, jobs] of this.waveJobs) {
      if (jobs.has(jobId)) return waveId;
    }
    return undefined;
  }

  getWaveJobIds(waveId: string): string[] {
    const jobs = this.waveJobs.get(waveId);
    return jobs ? Array.from(jobs.keys()) : [];
  }

  /**
   * Return all waves that have at least one active (running/awaiting_input) job.
   * Used to restore waveCenterWaves after page refresh.
   */
  getActiveWaves(): Array<{
    id: string;
    directive: string;
    rootJobs: Array<{ sessionId: string; roleId: string; roleName: string; jobId: string }>;
    startedAt: number;
    sessionIds: string[];
  }> {
    const result: Array<{
      id: string;
      directive: string;
      rootJobs: Array<{ sessionId: string; roleId: string; roleName: string; jobId: string }>;
      startedAt: number;
      sessionIds: string[];
    }> = [];

    for (const [waveId, jobs] of this.waveJobs) {
      const hasActive = Array.from(jobs.values()).some(j => isJobActive(j.status));
      if (!hasActive) continue;

      // Extract wave info from root jobs (jobs without parentJobId in this wave)
      const rootJobs = Array.from(jobs.values())
        .filter(j => !j.parentJobId || !jobs.has(j.parentJobId))
        .map(j => ({
          sessionId: j.sessionId ?? '',
          roleId: j.roleId,
          roleName: j.roleId.toUpperCase(),
          jobId: j.id,
        }));

      // Directive from first root job's task (strip "[CEO Wave] " prefix)
      const firstJob = rootJobs.length > 0
        ? Array.from(jobs.values()).find(j => j.id === rootJobs[0].jobId)
        : undefined;
      const directive = firstJob?.task.replace(/^\[CEO Wave\]\s*/, '') ?? '';

      // StartedAt from earliest job
      const startedAt = Math.min(
        ...Array.from(jobs.values()).map(j => new Date(j.createdAt).getTime())
      );

      const sessionIds = Array.from(jobs.values())
        .map(j => j.sessionId)
        .filter((s): s is string => !!s);

      result.push({ id: waveId, directive, rootJobs, startedAt, sessionIds });
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
