import fs from 'node:fs';
import path from 'node:path';
import { COMPANY_ROOT } from './file-reader.js';
import { type ActivityEvent, type SessionSource, type SessionStatus, type MessageStatus, isMessageTerminal } from '../../../shared/types.js';

/* ─── Types ─────────────────────────────── */

export interface ImageAttachment {
  type: 'image';
  data: string;      // base64 encoded
  name: string;
  mediaType: 'image/png' | 'image/jpeg' | 'image/gif' | 'image/webp';
}

/** Dispatch link — reference to a child session created via dispatch */
export interface DispatchLink {
  sessionId: string;
  roleId: string;
}

export interface Message {
  id: string;
  from: 'ceo' | 'role';
  content: string;
  type: 'conversation' | 'directive' | 'system';
  status?: MessageStatus;
  timestamp: string;
  attachments?: ImageAttachment[];

  /* ─── D-014: Session-Centric extensions ─── */
  /** Execution events embedded in this message (replaces separate JSONL) */
  events?: ActivityEvent[];
  /** Child sessions spawned by dispatch during this message's execution */
  dispatches?: DispatchLink[];
  /** @deprecated D-014: Internal job ID for runtime tracking. Use sessionId for external references. */
  jobId?: string;
  /** True for consult/ask messages (read-only execution) */
  readOnly?: boolean;
  /** Execution stats */
  turns?: number;
  tokens?: { input: number; output: number };
  /** KP-006: Knowledge debt warnings from Post-K check */
  knowledgeDebt?: Array<{ type: string; file?: string; message: string }>;
}

export interface Session {
  id: string;
  roleId: string;
  title: string;
  mode: 'talk' | 'do';
  messages: Message[];
  status: SessionStatus;
  createdAt: string;
  updatedAt: string;

  /* ─── D-014: Session-Centric extensions ─── */
  /** How this session was created */
  source?: SessionSource;
  /** Parent session ID (when created via dispatch) */
  parentSessionId?: string;
  /** Wave ID (when created via wave) */
  waveId?: string;
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

/** Options for creating a session with D-014 extensions */
export interface CreateSessionOptions {
  mode?: 'talk' | 'do';
  source?: SessionSource;
  parentSessionId?: string;
  waveId?: string;
}

export function createSession(roleId: string, opts: CreateSessionOptions = {}): Session {
  ensureLoaded();
  const id = `ses-${roleId}-${Date.now()}`;
  const now = new Date().toISOString();
  const session: Session = {
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

/** Fields that can be updated on a message */
export type MessageUpdate = Partial<Pick<Message, 'content' | 'status' | 'turns' | 'tokens' | 'dispatches' | 'readOnly' | 'knowledgeDebt'>>;

export function updateMessage(sessionId: string, messageId: string, updates: MessageUpdate): Session | undefined {
  const session = cache.get(sessionId);
  if (!session) return undefined;

  const msg = session.messages.find((m) => m.id === messageId);
  if (!msg) return undefined;

  if (updates.content !== undefined) msg.content = updates.content;
  if (updates.status !== undefined) msg.status = updates.status;
  if (updates.turns !== undefined) msg.turns = updates.turns;
  if (updates.tokens !== undefined) msg.tokens = updates.tokens;
  if (updates.dispatches !== undefined) msg.dispatches = updates.dispatches;
  if (updates.readOnly !== undefined) msg.readOnly = updates.readOnly;
  if (updates.knowledgeDebt !== undefined) msg.knowledgeDebt = updates.knowledgeDebt;
  session.updatedAt = new Date().toISOString();

  if (updates.status && isMessageTerminal(updates.status)) {
    writeImmediate(session);
  } else {
    debouncedWrite(session);
  }
  return session;
}

/** Append an execution event to a message (D-014: events embedded in message) */
export function appendMessageEvent(sessionId: string, messageId: string, event: ActivityEvent): boolean {
  const session = cache.get(sessionId);
  if (!session) return false;

  const msg = session.messages.find((m) => m.id === messageId);
  if (!msg) return false;

  if (!msg.events) msg.events = [];
  msg.events.push(event);
  session.updatedAt = new Date().toISOString();

  // Debounce during streaming — events come in fast
  debouncedWrite(session);
  return true;
}

export function updateSession(id: string, updates: Partial<Pick<Session, 'title' | 'mode' | 'status' | 'source' | 'parentSessionId' | 'waveId'>>): Session | undefined {
  const session = cache.get(id);
  if (!session) return undefined;

  if (updates.title !== undefined) session.title = updates.title;
  if (updates.mode !== undefined) session.mode = updates.mode;
  if (updates.status !== undefined) session.status = updates.status;
  if (updates.source !== undefined) session.source = updates.source;
  if (updates.parentSessionId !== undefined) session.parentSessionId = updates.parentSessionId;
  if (updates.waveId !== undefined) session.waveId = updates.waveId;
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
