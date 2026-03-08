import fs from 'node:fs';
import path from 'node:path';
import { COMPANY_ROOT } from './file-reader.js';

/* ─── Types ─────────────────────────────── */

export interface ImageAttachment {
  type: 'image';
  data: string;      // base64 encoded
  name: string;
  mediaType: 'image/png' | 'image/jpeg' | 'image/gif' | 'image/webp';
}

export interface Message {
  id: string;
  from: 'ceo' | 'role';
  content: string;
  type: 'conversation' | 'directive' | 'system';
  status?: 'streaming' | 'done' | 'error';
  timestamp: string;
  attachments?: ImageAttachment[];
}

export interface Session {
  id: string;
  roleId: string;
  title: string;
  mode: 'talk' | 'do';
  messages: Message[];
  status: 'active' | 'closed';
  createdAt: string;
  updatedAt: string;
}

/* ─── Session directory ─────────────────── */

function sessionsDir(): string {
  return path.join(COMPANY_ROOT, 'operations', 'sessions');
}

function ensureDir(): void {
  const dir = sessionsDir();
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

function sessionPath(id: string): string {
  return path.join(sessionsDir(), `${id}.json`);
}

/* ─── Debounced write ───────────────────── */

const writeTimers = new Map<string, ReturnType<typeof setTimeout>>();
const DEBOUNCE_MS = 2000;

function debouncedWrite(session: Session): void {
  const existing = writeTimers.get(session.id);
  if (existing) clearTimeout(existing);

  writeTimers.set(session.id, setTimeout(() => {
    writeTimers.delete(session.id);
    writeImmediate(session);
  }, DEBOUNCE_MS));
}

function writeImmediate(session: Session): void {
  ensureDir();
  const timer = writeTimers.get(session.id);
  if (timer) {
    clearTimeout(timer);
    writeTimers.delete(session.id);
  }
  fs.writeFileSync(sessionPath(session.id), JSON.stringify(session, null, 2));
}

/* ─── In-memory cache ───────────────────── */

const cache = new Map<string, Session>();

function loadAll(): void {
  ensureDir();
  const files = fs.readdirSync(sessionsDir()).filter((f) => f.endsWith('.json'));
  for (const file of files) {
    try {
      const data = JSON.parse(fs.readFileSync(path.join(sessionsDir(), file), 'utf-8')) as Session;
      cache.set(data.id, data);
    } catch { /* skip corrupted */ }
  }
}

// Lazy load: defer until first access (avoids creating dirs in CWD before scaffold)
let loaded = false;
function ensureLoaded(): void {
  if (loaded) return;
  loaded = true;
  loadAll();
}

/* ─── Public API ────────────────────────── */

export function createSession(roleId: string, mode: 'talk' | 'do' = 'talk'): Session {
  ensureLoaded();
  const id = `ses-${roleId}-${Date.now()}`;
  const now = new Date().toISOString();
  const session: Session = {
    id,
    roleId,
    title: `New ${roleId.toUpperCase()} session`,
    mode,
    messages: [],
    status: 'active',
    createdAt: now,
    updatedAt: now,
  };
  cache.set(id, session);
  writeImmediate(session);
  return session;
}

export function getSession(id: string): Session | undefined {
  ensureLoaded();
  return cache.get(id);
}

export function listSessions(): Omit<Session, 'messages'>[] {
  ensureLoaded();
  return Array.from(cache.values())
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
    .map(({ messages: _, ...meta }) => meta);
}

export function addMessage(sessionId: string, msg: Message, streaming = false): Session | undefined {
  const session = cache.get(sessionId);
  if (!session) return undefined;

  session.messages.push(msg);
  session.updatedAt = new Date().toISOString();

  // Auto-generate title from first CEO message
  if (session.messages.length === 1 && msg.from === 'ceo') {
    session.title = msg.content.slice(0, 40).replace(/\n/g, ' ');
  }

  if (streaming) {
    debouncedWrite(session);
  } else {
    writeImmediate(session);
  }
  return session;
}

export function updateMessage(sessionId: string, messageId: string, updates: Partial<Pick<Message, 'content' | 'status'>>): Session | undefined {
  const session = cache.get(sessionId);
  if (!session) return undefined;

  const msg = session.messages.find((m) => m.id === messageId);
  if (!msg) return undefined;

  if (updates.content !== undefined) msg.content = updates.content;
  if (updates.status !== undefined) msg.status = updates.status;
  session.updatedAt = new Date().toISOString();

  if (updates.status === 'done' || updates.status === 'error') {
    writeImmediate(session);
  } else {
    debouncedWrite(session);
  }
  return session;
}

export function updateSession(id: string, updates: Partial<Pick<Session, 'title' | 'mode'>>): Session | undefined {
  const session = cache.get(id);
  if (!session) return undefined;

  if (updates.title !== undefined) session.title = updates.title;
  if (updates.mode !== undefined) session.mode = updates.mode;
  session.updatedAt = new Date().toISOString();
  writeImmediate(session);
  return session;
}

export function deleteSession(id: string): boolean {
  const session = cache.get(id);
  if (!session) return false;

  cache.delete(id);
  const p = sessionPath(id);
  if (fs.existsSync(p)) fs.unlinkSync(p);
  return true;
}

export function deleteMany(ids: string[]): number {
  let count = 0;
  for (const id of ids) {
    if (deleteSession(id)) count++;
  }
  return count;
}

export function deleteEmpty(): { deleted: number; ids: string[] } {
  const ids: string[] = [];
  for (const [id, session] of cache) {
    if (session.messages.length === 0) {
      ids.push(id);
    }
  }
  const deleted = deleteMany(ids);
  return { deleted, ids };
}
