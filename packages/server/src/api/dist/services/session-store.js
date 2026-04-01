import fs from 'node:fs';
import path from 'node:path';
import { COMPANY_ROOT } from './file-reader.js';
/* ─── Session directory ─────────────────── */
function sessionsDir() {
    return path.join(COMPANY_ROOT, 'operations', 'sessions');
}
function ensureDir() {
    const dir = sessionsDir();
    if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
    }
}
function sessionPath(id) {
    return path.join(sessionsDir(), `${id}.json`);
}
/* ─── Debounced write ───────────────────── */
const writeTimers = new Map();
const DEBOUNCE_MS = 2000;
function debouncedWrite(session) {
    const existing = writeTimers.get(session.id);
    if (existing)
        clearTimeout(existing);
    writeTimers.set(session.id, setTimeout(() => {
        writeTimers.delete(session.id);
        writeImmediate(session);
    }, DEBOUNCE_MS));
}
function writeImmediate(session) {
    ensureDir();
    const timer = writeTimers.get(session.id);
    if (timer) {
        clearTimeout(timer);
        writeTimers.delete(session.id);
    }
    fs.writeFileSync(sessionPath(session.id), JSON.stringify(session, null, 2));
}
/* ─── In-memory cache ───────────────────── */
const cache = new Map();
function loadAll() {
    ensureDir();
    const files = fs.readdirSync(sessionsDir()).filter((f) => f.endsWith('.json'));
    for (const file of files) {
        try {
            const data = JSON.parse(fs.readFileSync(path.join(sessionsDir(), file), 'utf-8'));
            cache.set(data.id, data);
        }
        catch { /* skip corrupted */ }
    }
}
// Lazy load: defer until first access (avoids creating dirs in CWD before scaffold)
let loaded = false;
function ensureLoaded() {
    if (loaded)
        return;
    loaded = true;
    loadAll();
}
export function createSession(roleId, opts = {}) {
    ensureLoaded();
    const id = `ses-${roleId}-${Date.now()}`;
    const now = new Date().toISOString();
    const session = {
        id,
        roleId,
        title: `New ${roleId.toUpperCase()} session`,
        mode: opts.mode ?? 'talk',
        messages: [],
        status: 'active',
        createdAt: now,
        updatedAt: now,
        ...(opts.source && { source: opts.source }),
        ...(opts.parentSessionId && { parentSessionId: opts.parentSessionId }),
        ...(opts.waveId && { waveId: opts.waveId }),
    };
    cache.set(id, session);
    writeImmediate(session);
    return session;
}
export function getSession(id) {
    ensureLoaded();
    return cache.get(id);
}
export function listSessions() {
    ensureLoaded();
    return Array.from(cache.values())
        .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
        .map(({ messages: _, ...meta }) => meta);
}
export function addMessage(sessionId, msg, streaming = false) {
    const session = cache.get(sessionId);
    if (!session)
        return undefined;
    session.messages.push(msg);
    session.updatedAt = new Date().toISOString();
    // Auto-generate title from first CEO message
    if (session.messages.length === 1 && msg.from === 'ceo') {
        session.title = msg.content.slice(0, 40).replace(/\n/g, ' ');
    }
    if (streaming) {
        debouncedWrite(session);
    }
    else {
        writeImmediate(session);
    }
    return session;
}
export function updateMessage(sessionId, messageId, updates) {
    const session = cache.get(sessionId);
    if (!session)
        return undefined;
    const msg = session.messages.find((m) => m.id === messageId);
    if (!msg)
        return undefined;
    if (updates.content !== undefined)
        msg.content = updates.content;
    if (updates.status !== undefined)
        msg.status = updates.status;
    if (updates.turns !== undefined)
        msg.turns = updates.turns;
    if (updates.tokens !== undefined)
        msg.tokens = updates.tokens;
    if (updates.dispatches !== undefined)
        msg.dispatches = updates.dispatches;
    if (updates.readOnly !== undefined)
        msg.readOnly = updates.readOnly;
    if (updates.knowledgeDebt !== undefined)
        msg.knowledgeDebt = updates.knowledgeDebt;
    session.updatedAt = new Date().toISOString();
    if (updates.status === 'done' || updates.status === 'error') {
        writeImmediate(session);
    }
    else {
        debouncedWrite(session);
    }
    return session;
}
/** Append an execution event to a message (D-014: events embedded in message) */
export function appendMessageEvent(sessionId, messageId, event) {
    const session = cache.get(sessionId);
    if (!session)
        return false;
    const msg = session.messages.find((m) => m.id === messageId);
    if (!msg)
        return false;
    if (!msg.events)
        msg.events = [];
    msg.events.push(event);
    session.updatedAt = new Date().toISOString();
    // Debounce during streaming — events come in fast
    debouncedWrite(session);
    return true;
}
export function updateSession(id, updates) {
    const session = cache.get(id);
    if (!session)
        return undefined;
    if (updates.title !== undefined)
        session.title = updates.title;
    if (updates.mode !== undefined)
        session.mode = updates.mode;
    if (updates.status !== undefined)
        session.status = updates.status;
    if (updates.source !== undefined)
        session.source = updates.source;
    if (updates.parentSessionId !== undefined)
        session.parentSessionId = updates.parentSessionId;
    if (updates.waveId !== undefined)
        session.waveId = updates.waveId;
    session.updatedAt = new Date().toISOString();
    writeImmediate(session);
    return session;
}
export function deleteSession(id) {
    const session = cache.get(id);
    if (!session)
        return false;
    cache.delete(id);
    const p = sessionPath(id);
    if (fs.existsSync(p))
        fs.unlinkSync(p);
    return true;
}
export function deleteMany(ids) {
    let count = 0;
    for (const id of ids) {
        if (deleteSession(id))
            count++;
    }
    return count;
}
export function deleteEmpty() {
    const ids = [];
    for (const [id, session] of cache) {
        if (session.messages.length === 0) {
            ids.push(id);
        }
    }
    const deleted = deleteMany(ids);
    return { deleted, ids };
}
