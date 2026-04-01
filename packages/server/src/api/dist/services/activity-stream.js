import fs from 'node:fs';
import path from 'node:path';
import { COMPANY_ROOT } from './file-reader.js';
/* ─── Constants ──────────────────────────── */
function streamsDir() {
    return path.join(COMPANY_ROOT, 'operations', 'activity-streams');
}
function ensureDir() {
    const dir = streamsDir();
    if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
    }
}
function streamPath(jobId) {
    return path.join(streamsDir(), `${jobId}.jsonl`);
}
/* ─── ActivityStream ─────────────────────── */
export class ActivityStream {
    jobId;
    roleId;
    parentJobId;
    seq = 0;
    subscribers = new Set();
    filePath;
    closed = false;
    constructor(jobId, roleId, parentJobId) {
        this.jobId = jobId;
        this.roleId = roleId;
        this.parentJobId = parentJobId;
        ensureDir();
        this.filePath = streamPath(jobId);
        // Create empty file
        fs.writeFileSync(this.filePath, '', { flag: 'w' });
    }
    /** Append event to JSONL + push to live subscribers */
    emit(type, roleId, data) {
        const event = {
            seq: this.seq++,
            ts: new Date().toISOString(),
            type,
            roleId,
            parentJobId: this.parentJobId,
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
    }
    get isClosed() {
        return this.closed;
    }
    get lastSeq() {
        return this.seq;
    }
    /* ─── Static: read from file ───────────── */
    /** Read events from a JSONL file starting at fromSeq */
    static readFrom(jobId, fromSeq = 0) {
        const fp = streamPath(jobId);
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
    static readAll(jobId) {
        return ActivityStream.readFrom(jobId, 0);
    }
    /** Check if a stream file exists */
    static exists(jobId) {
        return fs.existsSync(streamPath(jobId));
    }
    /** List all stream files (job IDs) */
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
