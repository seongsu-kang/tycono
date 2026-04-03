import fs from 'node:fs';
import path from 'node:path';
import { COMPANY_ROOT } from './file-reader.js';
/* ─── Constants ──────────────────────────── */
function streamsDir() {
    return path.join(COMPANY_ROOT, '.tycono', 'activity-streams');
}
function ensureDir() {
    const dir = streamsDir();
    if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
    }
}
function streamPath(streamId) {
    return path.join(streamsDir(), `${streamId}.jsonl`);
}
/* ─── ActivityStream ─────────────────────── */
export class ActivityStream {
    sessionId;
    roleId;
    parentSessionId;
    /** Trace ID for full chain tracking — top-level sessionId propagated to all children */
    traceId;
    seq = 0;
    subscribers = new Set();
    filePath;
    closed = false;
    constructor(sessionId, roleId, parentSessionId, traceId) {
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
                    const lastEvent = JSON.parse(lines[lines.length - 1]);
                    this.seq = lastEvent.seq + 1;
                }
                catch { /* start from 0 if parse fails */ }
            }
        }
        else {
            // Create empty file
            fs.writeFileSync(this.filePath, '', { flag: 'w' });
        }
    }
    /** Append event to JSONL + push to live subscribers */
    emit(type, roleId, data) {
        const event = {
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
        }
        catch {
            // File write failure shouldn't crash the stream
        }
        // Push to subscribers
        for (const cb of this.subscribers) {
            try {
                cb(event);
            }
            catch { /* subscriber errors don't affect others */ }
        }
        return event;
    }
    subscribe(cb) {
        this.subscribers.add(cb);
    }
    unsubscribe(cb) {
        this.subscribers.delete(cb);
    }
    get subscriberCount() {
        return this.subscribers.size;
    }
    close() {
        this.closed = true;
        this.subscribers.clear();
        // Memory: remove from activeStreams cache
        ActivityStream.activeStreams.delete(this.sessionId);
    }
    get isClosed() {
        return this.closed;
    }
    get lastSeq() {
        return this.seq;
    }
    /* ─── Static factory ─────────────────── */
    /** Cache of active streams by sessionId */
    static activeStreams = new Map();
    /** Get or create an ActivityStream for a session. Reuses existing stream for continuations. */
    static getOrCreate(sessionId, roleId, parentSessionId, traceId) {
        const existing = ActivityStream.activeStreams.get(sessionId);
        if (existing && !existing.isClosed) {
            return existing;
        }
        const stream = new ActivityStream(sessionId, roleId, parentSessionId, traceId);
        ActivityStream.activeStreams.set(sessionId, stream);
        return stream;
    }
    /* ─── Static: read from file ───────────── */
    /** Read events from a JSONL file starting at fromSeq */
    static readFrom(streamId, fromSeq = 0) {
        const fp = streamPath(streamId);
        if (!fs.existsSync(fp))
            return [];
        const lines = fs.readFileSync(fp, 'utf-8').split('\n').filter(Boolean);
        const events = [];
        for (const line of lines) {
            try {
                const event = JSON.parse(line);
                if (event.seq >= fromSeq) {
                    events.push(event);
                }
            }
            catch { /* skip malformed lines */ }
        }
        return events;
    }
    /** Read all events from a JSONL file */
    static readAll(streamId) {
        return ActivityStream.readFrom(streamId, 0);
    }
    /** Check if a stream file exists */
    static exists(streamId) {
        return fs.existsSync(streamPath(streamId));
    }
    /** List all stream files (stream IDs) */
    static listAll() {
        ensureDir();
        return fs.readdirSync(streamsDir())
            .filter(f => f.endsWith('.jsonl'))
            .map(f => f.replace('.jsonl', ''));
    }
    /** Get the streams directory path */
    static getStreamDir() {
        return streamsDir();
    }
}
