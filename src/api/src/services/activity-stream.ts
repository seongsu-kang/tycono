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

function streamPath(jobId: string): string {
  return path.join(streamsDir(), `${jobId}.jsonl`);
}

/* ─── Subscriber type ────────────────────── */

export type ActivitySubscriber = (event: ActivityEvent) => void;

/* ─── ActivityStream ─────────────────────── */

export class ActivityStream {
  readonly jobId: string;
  readonly roleId: string;
  readonly parentSessionId?: string;
  /** @deprecated D-014: use parentSessionId */
  readonly parentJobId?: string;
  /** Trace ID for full chain tracking — top-level jobId propagated to all children */
  readonly traceId?: string;

  private seq = 0;
  private subscribers = new Set<ActivitySubscriber>();
  private filePath: string;
  private closed = false;

  constructor(jobId: string, roleId: string, parentJobId?: string, traceId?: string) {
    this.jobId = jobId;
    this.roleId = roleId;
    this.parentSessionId = parentJobId;
    this.parentJobId = parentJobId; // backward compat
    this.traceId = traceId;

    ensureDir();
    this.filePath = streamPath(jobId);
    // Create empty file
    fs.writeFileSync(this.filePath, '', { flag: 'w' });
  }

  /** Append event to JSONL + push to live subscribers */
  emit(type: ActivityEventType, roleId: string, data: Record<string, unknown>): ActivityEvent {
    const event: ActivityEvent = {
      seq: this.seq++,
      ts: new Date().toISOString(),
      type,
      roleId,
      parentSessionId: this.parentSessionId,
      parentJobId: this.parentJobId, // backward compat
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

  /* ─── Static: read from file ───────────── */

  /** Read events from a JSONL file starting at fromSeq */
  static readFrom(jobId: string, fromSeq = 0): ActivityEvent[] {
    const fp = streamPath(jobId);
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

    return events;
  }

  /** Read all events from a JSONL file */
  static readAll(jobId: string): ActivityEvent[] {
    return ActivityStream.readFrom(jobId, 0);
  }

  /** Check if a stream file exists */
  static exists(jobId: string): boolean {
    return fs.existsSync(streamPath(jobId));
  }

  /** List all stream files (job IDs) */
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
