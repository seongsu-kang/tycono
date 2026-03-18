import fs from 'node:fs';
import path from 'node:path';
import { COMPANY_ROOT } from './file-reader.js';

/* ─── Types (re-export from shared contract) ── */

export { type ActivityEventType, type ActivityEvent } from '../../../shared/types.js';
import type { ActivityEventType, ActivityEvent } from '../../../shared/types.js';

/* ─── Constants ──────────────────────────── */

function streamsDir(): string {
  return path.join(COMPANY_ROOT, 'operations', 'activity-streams');
}

function ensureDir(): void {
  const dir = streamsDir();
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

function streamPath(streamId: string): string {
  return path.join(streamsDir(), `${streamId}.jsonl`);
}

/* ─── Subscriber type ────────────────────── */

export type ActivitySubscriber = (event: ActivityEvent) => void;

/* ─── ActivityStream ─────────────────────── */

export class ActivityStream {
  readonly sessionId: string;
  readonly roleId: string;
  readonly parentSessionId?: string;
  /** Trace ID for full chain tracking — top-level sessionId propagated to all children */
  readonly traceId?: string;

  private seq = 0;
  private subscribers = new Set<ActivitySubscriber>();
  private filePath: string;
  private closed = false;
  private lastActivityTs = Date.now();

  constructor(sessionId: string, roleId: string, parentSessionId?: string, traceId?: string) {
    this.sessionId = sessionId;
    this.roleId = roleId;
    this.parentSessionId = parentSessionId;
    this.traceId = traceId;

    ensureDir();
    this.filePath = streamPath(sessionId);

    // Resume mode: if file already exists, read last seq and continue
    if (fs.existsSync(this.filePath)) {
      const content = fs.readFileSync(this.filePath, 'utf-8');
      const lines = content.split('\n').filter(Boolean);
      if (lines.length > 0) {
        try {
          const lastEvent = JSON.parse(lines[lines.length - 1]) as ActivityEvent;
          this.seq = lastEvent.seq + 1;
        } catch { /* start from 0 if parse fails */ }
      }
    } else {
      // Create empty file
      fs.writeFileSync(this.filePath, '', { flag: 'w' });
    }
  }

  /** Append event to JSONL + push to live subscribers */
  emit(type: ActivityEventType, roleId: string, data: Record<string, unknown>): ActivityEvent {
    this.lastActivityTs = Date.now();

    const event: ActivityEvent = {
      seq: this.seq++,
      ts: new Date().toISOString(),
      type,
      roleId,
      parentSessionId: this.parentSessionId,
      ...(this.traceId && { traceId: this.traceId }),
      data,
    };

    // Append to file
    try {
      fs.appendFileSync(this.filePath, JSON.stringify(event) + '\n');
    } catch {
      // File write failure shouldn't crash the stream
    }

    // Push to subscribers
    for (const cb of this.subscribers) {
      try { cb(event); } catch { /* subscriber errors don't affect others */ }
    }

    return event;
  }

  subscribe(cb: ActivitySubscriber): void {
    this.subscribers.add(cb);
  }

  unsubscribe(cb: ActivitySubscriber): void {
    this.subscribers.delete(cb);
  }

  get subscriberCount(): number {
    return this.subscribers.size;
  }

  close(): void {
    this.closed = true;
    this.subscribers.clear();
  }

  get isClosed(): boolean {
    return this.closed;
  }

  get lastSeq(): number {
    return this.seq;
  }

  /* ─── Static factory ─────────────────── */

  /** Cache of active streams by sessionId */
  private static activeStreams = new Map<string, ActivityStream>();

  /** Prune inactive streams (closed + no activity for 5 minutes) */
  private static pruneInactiveStreams(): void {
    const INACTIVE_THRESHOLD_MS = 5 * 60 * 1000; // 5 minutes
    const now = Date.now();

    for (const [sessionId, stream] of ActivityStream.activeStreams.entries()) {
      if (stream.isClosed && (now - stream.lastActivityTs) > INACTIVE_THRESHOLD_MS) {
        ActivityStream.activeStreams.delete(sessionId);
        console.log(`[ActivityStream] Pruned inactive stream: ${sessionId}`);
      }
    }
  }

  /** Get or create an ActivityStream for a session. Reuses existing stream for continuations. */
  static getOrCreate(sessionId: string, roleId: string, parentSessionId?: string, traceId?: string): ActivityStream {
    // Prune inactive streams before creating new ones
    ActivityStream.pruneInactiveStreams();

    const existing = ActivityStream.activeStreams.get(sessionId);
    if (existing && !existing.isClosed) {
      return existing;
    }
    const stream = new ActivityStream(sessionId, roleId, parentSessionId, traceId);
    ActivityStream.activeStreams.set(sessionId, stream);
    return stream;
  }

  /* ─── Static: read from file ───────────── */

  /**
   * Read events from a JSONL file starting at fromSeq
   * @param streamId - Session ID to read
   * @param fromSeq - Starting sequence number (default: 0)
   * @param maxEvents - Maximum events to return (default: 500, 0 = unlimited)
   */
  static readFrom(streamId: string, fromSeq = 0, maxEvents = 500): ActivityEvent[] {
    const fp = streamPath(streamId);
    if (!fs.existsSync(fp)) return [];

    const lines = fs.readFileSync(fp, 'utf-8').split('\n').filter(Boolean);
    const events: ActivityEvent[] = [];

    for (const line of lines) {
      try {
        const event = JSON.parse(line) as ActivityEvent;
        if (event.seq >= fromSeq) {
          events.push(event);
        }
      } catch { /* skip malformed lines */ }
    }

    // Memory pruning: return only recent N events (0 = unlimited)
    // File retains full history, but in-memory operations are capped
    if (maxEvents > 0 && events.length > maxEvents) {
      return events.slice(-maxEvents);
    }

    return events;
  }

  /**
   * Read all events from a JSONL file (subject to default maxEvents limit)
   * @param maxEvents - Maximum events to return (default: 500, 0 = unlimited)
   */
  static readAll(streamId: string, maxEvents = 500): ActivityEvent[] {
    return ActivityStream.readFrom(streamId, 0, maxEvents);
  }

  /** Check if a stream file exists */
  static exists(streamId: string): boolean {
    return fs.existsSync(streamPath(streamId));
  }

  /** List all stream files (stream IDs) */
  static listAll(): string[] {
    ensureDir();
    return fs.readdirSync(streamsDir())
      .filter(f => f.endsWith('.jsonl'))
      .map(f => f.replace('.jsonl', ''));
  }

  /** Get the streams directory path */
  static getStreamDir(): string {
    return streamsDir();
  }
}
