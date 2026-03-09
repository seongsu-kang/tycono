import type { IncomingMessage, ServerResponse } from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { COMPANY_ROOT } from '../services/file-reader.js';
import { getAllActivities, setActivity, updateActivity, completeActivity } from '../services/activity-tracker.js';
import { buildOrgTree, canDispatchTo, getSubordinates } from '../engine/org-tree.js';
import { createRunner, type RunnerResult } from '../engine/runners/index.js';
import {
  getSession,
  addMessage,
  updateMessage,
  type Message,
  type ImageAttachment,
} from '../services/session-store.js';
import { jobManager, type Job } from '../services/job-manager.js';
import { ActivityStream, type ActivityEvent, type ActivitySubscriber } from '../services/activity-stream.js';

/* ─── Runner — lazy, re-created when engine changes ── */

function getRunner() {
  return createRunner();
}

/* ─── Active execution tracking (legacy, kept for /api/exec/status compat) ──── */

const roleStatus = new Map<string, 'idle' | 'working' | 'done'>();

/* ─── Raw HTTP handler (Express 5 SSE 호환 문제 우회) ─── */

export function handleExecRequest(req: IncomingMessage, res: ServerResponse): void {
  const url = req.url ?? '';
  const method = req.method ?? '';

  // ── /api/waves/save ──
  if (method === 'POST' && url === '/api/waves/save') {
    readBody(req).then((body) => handleSaveWave(body, res));
    return;
  }

  // ── /api/jobs/* routes ──
  if (url.startsWith('/api/jobs')) {
    handleJobsRequest(url, method, req, res);
    return;
  }

  // ── Legacy /api/exec/* routes ──
  const sessionMatch = url.match(/\/api\/exec\/session\/([^/]+)\/message$/);

  if (sessionMatch && method === 'POST') {
    readBody(req).then((body) => handleSessionMessage(sessionMatch[1], body, req, res));
  } else if (method === 'POST' && url.endsWith('/assign')) {
    readBody(req).then((body) => handleAssign(body, req, res));
  } else if (method === 'POST' && url.endsWith('/wave')) {
    readBody(req).then((body) => handleWave(body, req, res));
  } else if (method === 'GET' && url.endsWith('/status')) {
    handleStatus(res);
  } else if (method === 'POST' && url.endsWith('/activity')) {
    readBody(req).then((body) => handleActivity(body, res));
  } else {
    res.writeHead(404);
    res.end(JSON.stringify({ error: 'Not found' }));
  }
}

/* ═══════════════════════════════════════════════
   /api/jobs/* — Job-based API
   ═══════════════════════════════════════════════ */

function handleJobsRequest(url: string, method: string, req: IncomingMessage, res: ServerResponse): void {
  // Strip query string for matching
  const [path, queryString] = url.split('?');

  // POST /api/jobs — start a new job
  if (method === 'POST' && path === '/api/jobs') {
    readBody(req).then((body) => handleStartJob(body, res));
    return;
  }

  // GET /api/jobs — list jobs
  if (method === 'GET' && path === '/api/jobs') {
    const params = new URLSearchParams(queryString ?? '');
    handleListJobs(params, res);
    return;
  }

  // Match /api/jobs/:id/stream
  const streamMatch = path.match(/^\/api\/jobs\/([^/]+)\/stream$/);
  if (streamMatch && method === 'GET') {
    const params = new URLSearchParams(queryString ?? '');
    const fromSeq = parseInt(params.get('from') ?? '0', 10);
    handleJobStream(streamMatch[1], fromSeq, req, res);
    return;
  }

  // Match /api/jobs/:id/reply
  const replyMatch = path.match(/^\/api\/jobs\/([^/]+)\/reply$/);
  if (replyMatch && method === 'POST') {
    readBody(req).then((body) => handleReplyToJob(replyMatch[1], body, res));
    return;
  }

  // Match /api/jobs/:id/history
  const historyMatch = path.match(/^\/api\/jobs\/([^/]+)\/history$/);
  if (historyMatch && method === 'GET') {
    handleJobHistory(historyMatch[1], res);
    return;
  }

  // Match /api/jobs/:id
  const idMatch = path.match(/^\/api\/jobs\/([^/]+)$/);
  if (idMatch && method === 'GET') {
    handleGetJob(idMatch[1], res);
    return;
  }
  if (idMatch && method === 'DELETE') {
    handleAbortJob(idMatch[1], res);
    return;
  }

  res.writeHead(404);
  res.end(JSON.stringify({ error: 'Not found' }));
}

/* ─── POST /api/jobs ─────────────────────── */

function handleStartJob(body: Record<string, unknown>, res: ServerResponse): void {
  const type = (body.type as string) ?? 'assign';
  const roleId = body.roleId as string;
  const task = body.task as string;
  const directive = body.directive as string;
  const sourceRole = (body.sourceRole as string) || 'ceo';
  const readOnly = body.readOnly === true;
  const targetRole = (body.targetRole as string) || 'cto';
  const parentJobId = body.parentJobId as string | undefined;

  // Wave shorthand — broadcast to ALL C-level direct reports
  if (type === 'wave') {
    if (!directive) {
      jsonResponse(res, 400, { error: 'directive is required for wave jobs' });
      return;
    }

    const orgTree = buildOrgTree(COMPANY_ROOT);
    const cLevelRoles = getSubordinates(orgTree, 'ceo');

    if (cLevelRoles.length === 0) {
      jsonResponse(res, 400, { error: 'No C-level roles found to dispatch wave.' });
      return;
    }

    const jobIds: string[] = [];
    for (const cRole of cLevelRoles) {
      const job = jobManager.startJob({
        type: 'wave',
        roleId: cRole,
        task: `[CEO Wave] ${directive}`,
        sourceRole: 'ceo',
        parentJobId,
      });
      jobIds.push(job.id);
    }

    jsonResponse(res, 200, { jobIds });
    return;
  }

  // Assign
  if (!roleId || !task) {
    jsonResponse(res, 400, { error: 'roleId and task are required' });
    return;
  }

  const orgTree = buildOrgTree(COMPANY_ROOT);
  if (!canDispatchTo(orgTree, sourceRole, roleId)) {
    jsonResponse(res, 403, { error: `${sourceRole} cannot dispatch to ${roleId}.` });
    return;
  }

  const job = jobManager.startJob({
    type: 'assign',
    roleId,
    task,
    sourceRole,
    readOnly,
    parentJobId,
  });

  jsonResponse(res, 200, { jobId: job.id });
}

/* ─── GET /api/jobs ──────────────────────── */

function handleListJobs(params: URLSearchParams, res: ServerResponse): void {
  const status = params.get('status') as 'running' | 'done' | 'error' | null;
  const roleId = params.get('roleId') ?? undefined;

  const jobs = jobManager.listJobs({
    status: status ?? undefined,
    roleId,
  });

  jsonResponse(res, 200, { jobs });
}

/* ─── GET /api/jobs/:id ──────────────────── */

function handleGetJob(jobId: string, res: ServerResponse): void {
  const info = jobManager.getJobInfo(jobId);
  if (!info) {
    jsonResponse(res, 404, { error: 'Job not found' });
    return;
  }
  jsonResponse(res, 200, info);
}

/* ─── GET /api/jobs/:id/stream ───────────── */

function handleJobStream(jobId: string, fromSeq: number, req: IncomingMessage, res: ServerResponse): void {
  const job = jobManager.getJob(jobId);

  // Start SSE
  startSSE(res);

  // Replay historical events from file
  const pastEvents = ActivityStream.readFrom(jobId, fromSeq);
  for (const event of pastEvents) {
    sendSSE(res, 'activity', event);
  }

  // If the job is finished (not running/awaiting), send end and close
  if (!job || (job.status !== 'running' && job.status !== 'awaiting_input')) {
    sendSSE(res, 'stream:end', { reason: job ? job.status : 'not-found' });
    res.end();
    return;
  }

  // Subscribe for live events
  const subscriber = (event: ActivityEvent) => {
    if (event.seq >= fromSeq) {
      sendSSE(res, 'activity', event);
    }
    // Auto-close SSE when job ends or CEO replies (new stream takes over)
    if (event.type === 'job:done' || event.type === 'job:error') {
      sendSSE(res, 'stream:end', { reason: event.type === 'job:done' ? 'done' : 'error' });
      res.end();
      job.stream.unsubscribe(subscriber);
    } else if (event.type === 'job:reply') {
      // CEO replied → close this stream; frontend will connect to continuation job
      sendSSE(res, 'stream:end', { reason: 'replied' });
      res.end();
      job.stream.unsubscribe(subscriber);
    }
    // awaiting_input keeps SSE open (sends event but doesn't close)
  };

  job.stream.subscribe(subscriber);

  // Client disconnect → just unsubscribe (job keeps running)
  req.on('close', () => {
    job.stream.unsubscribe(subscriber);
  });
}

/* ─── GET /api/jobs/:id/history ──────────── */

function handleJobHistory(jobId: string, res: ServerResponse): void {
  if (!ActivityStream.exists(jobId)) {
    jsonResponse(res, 404, { error: 'Job history not found' });
    return;
  }
  const events = ActivityStream.readAll(jobId);
  jsonResponse(res, 200, { events });
}

/* ─── DELETE /api/jobs/:id ───────────────── */

function handleAbortJob(jobId: string, res: ServerResponse): void {
  const success = jobManager.abortJob(jobId);
  if (!success) {
    jsonResponse(res, 404, { error: 'Job not found or not running' });
    return;
  }
  jsonResponse(res, 200, { ok: true });
}

/* ─── POST /api/jobs/:id/reply ──────────── */

function handleReplyToJob(jobId: string, body: Record<string, unknown>, res: ServerResponse): void {
  const message = body.message as string;
  if (!message) {
    jsonResponse(res, 400, { error: 'message is required' });
    return;
  }

  const responderRole = body.responderRole as string | undefined;

  const newJob = jobManager.replyToJob(jobId, message, responderRole);
  if (!newJob) {
    jsonResponse(res, 400, { error: 'Job not found or not awaiting input' });
    return;
  }

  jsonResponse(res, 200, { jobId: newJob.id, roleId: newJob.roleId });
}

/* ─── POST /api/waves/save ──────────────── */

function handleSaveWave(body: Record<string, unknown>, res: ServerResponse): void {
  const directive = body.directive as string;
  const jobIds = body.jobIds as string[];

  if (!directive || !jobIds || jobIds.length === 0) {
    jsonResponse(res, 400, { error: 'directive and jobIds are required' });
    return;
  }

  // Build wave summary from job streams
  const now = new Date();
  const dateStr = now.toISOString().slice(0, 10);
  const timeStr = now.toTimeString().slice(0, 5);
  const lines: string[] = [
    `# Wave — ${dateStr} ${timeStr}`,
    '',
    `> ${directive}`,
    '',
  ];

  for (const jobId of jobIds) {
    const events = ActivityStream.readAll(jobId);
    const startEvent = events.find(e => e.type === 'job:start');
    const roleId = startEvent?.roleId ?? 'unknown';
    const doneEvent = events.find(e => e.type === 'job:done' || e.type === 'job:awaiting_input');

    lines.push(`## ${roleId.toUpperCase()}`);
    lines.push('');

    // Collect text output
    const textParts: string[] = [];
    for (const e of events) {
      if (e.type === 'text' && typeof e.data.text === 'string') {
        textParts.push(e.data.text);
      }
    }
    const fullText = textParts.join('');
    // Take last 1500 chars as summary
    const summary = fullText.length > 1500
      ? '...' + fullText.slice(-1500)
      : fullText;

    if (summary.trim()) {
      lines.push(summary.trim());
    } else {
      lines.push('(No text output)');
    }

    if (doneEvent) {
      const turns = doneEvent.data.turns as number ?? 0;
      const tools = doneEvent.data.toolCalls as number ?? 0;
      lines.push('');
      lines.push(`*${turns} turns, ${tools} tool calls*`);
    }
    lines.push('');
    lines.push('---');
    lines.push('');
  }

  // Write to operations/waves/
  const wavesDir = path.join(COMPANY_ROOT, 'operations', 'waves');
  if (!fs.existsSync(wavesDir)) {
    fs.mkdirSync(wavesDir, { recursive: true });
  }
  const filename = `wave-${dateStr}-${Date.now()}.md`;
  const filePath = path.join(wavesDir, filename);
  fs.writeFileSync(filePath, lines.join('\n'), 'utf-8');

  jsonResponse(res, 200, { ok: true, path: `operations/waves/${filename}` });
}

/* ═══════════════════════════════════════════════
   Legacy /api/exec/* — kept for backward compat
   Now internally delegates to JobManager where possible
   ═══════════════════════════════════════════════ */

/* ─── Body parser ────────────────────────────── */

function readBody(req: IncomingMessage): Promise<Record<string, unknown>> {
  return new Promise((resolve) => {
    let data = '';
    req.on('data', (chunk) => { data += chunk; });
    req.on('end', () => {
      try { resolve(JSON.parse(data)); }
      catch { resolve({}); }
    });
  });
}

/* ─── SSE helpers ────────────────────────────── */

function sendSSE(res: ServerResponse, event: string, data: unknown): boolean {
  if (res.destroyed || res.writableEnded) return false;
  try {
    res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
    return true;
  } catch {
    return false;
  }
}

function jsonResponse(res: ServerResponse, status: number, body: unknown): void {
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(body));
}

/** SSE timeout: max duration for a single SSE connection (10 minutes) */
const SSE_TIMEOUT_MS = 10 * 60 * 1000;
/** SSE heartbeat interval (15 seconds) */
const SSE_HEARTBEAT_MS = 15 * 1000;

function startSSE(res: ServerResponse): void {
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive',
    'X-Accel-Buffering': 'no',
  });
  res.flushHeaders();
}

/** Start SSE heartbeat + timeout. Returns cleanup function. */
function startSSELifecycle(res: ServerResponse, onTimeout: () => void): () => void {
  const heartbeat = setInterval(() => {
    if (res.destroyed || res.writableEnded) {
      clearInterval(heartbeat);
      return;
    }
    try {
      res.write(': heartbeat\n\n');
    } catch {
      clearInterval(heartbeat);
    }
  }, SSE_HEARTBEAT_MS);

  const timeout = setTimeout(() => {
    console.warn('[SSE] Connection timeout — forcing close');
    onTimeout();
  }, SSE_TIMEOUT_MS);

  return () => {
    clearInterval(heartbeat);
    clearTimeout(timeout);
  };
}

/* ─── POST /api/exec/assign ──────────────────── */
/* Now delegates to JobManager, streams events back via SSE for backward compat */

function handleAssign(body: Record<string, unknown>, req: IncomingMessage, res: ServerResponse): void {
  const roleId = body.roleId as string;
  const task = body.task as string;
  const sourceRole = (body.sourceRole as string) || 'ceo';
  const readOnly = body.readOnly === true;

  if (!roleId || !task) {
    jsonResponse(res, 400, { error: 'roleId and task are required' });
    return;
  }

  const orgTree = buildOrgTree(COMPANY_ROOT);

  if (!canDispatchTo(orgTree, sourceRole, roleId)) {
    jsonResponse(res, 403, {
      error: `${sourceRole} cannot dispatch to ${roleId}. Check organization hierarchy.`,
    });
    return;
  }

  // Start job via JobManager (JobManager is source of truth for job status)
  const job = jobManager.startJob({ type: 'assign', roleId, task, sourceRole, readOnly });

  // Bridge: stream job events as legacy SSE format
  startSSE(res);
  sendSSE(res, 'start', { id: job.id, roleId, task, sourceRole });

  const cleanupLifecycle = startSSELifecycle(res, () => {
    roleStatus.set(roleId, 'idle');
    sendSSE(res, 'error', { message: 'SSE timeout — connection forcibly closed after 10 minutes' });
    if (!res.writableEnded) res.end();
    job.stream.unsubscribe(subscriber);
  });

  const subscriber = (event: ActivityEvent) => {
    switch (event.type) {
      case 'text':
        sendSSE(res, 'output', { text: event.data.text });
        break;
      case 'thinking':
        sendSSE(res, 'thinking', { text: event.data.text });
        break;
      case 'tool:start':
        sendSSE(res, 'tool', { name: event.data.name, input: event.data.input });
        break;
      case 'dispatch:start':
        sendSSE(res, 'dispatch', { roleId: event.data.targetRoleId, task: event.data.task, childJobId: event.data.childJobId });
        break;
      case 'turn:complete':
        sendSSE(res, 'turn', { turn: event.data.turn });
        break;
      case 'stderr':
        sendSSE(res, 'stderr', { message: event.data.message });
        break;
      case 'job:done':
        cleanupLifecycle();
        sendSSE(res, 'done', event.data);
        if (!res.writableEnded) res.end();
        job.stream.unsubscribe(subscriber);
        break;
      case 'job:error':
        cleanupLifecycle();
        sendSSE(res, 'error', { message: event.data.message });
        if (!res.writableEnded) res.end();
        job.stream.unsubscribe(subscriber);
        break;
    }
  };

  job.stream.subscribe(subscriber);

  // Client disconnect → unsubscribe only (job keeps running!)
  req.on('close', () => {
    cleanupLifecycle();
    job.stream.unsubscribe(subscriber);
  });
}

/* ─── POST /api/exec/wave ────────────────────── */

function handleWave(body: Record<string, unknown>, req: IncomingMessage, res: ServerResponse): void {
  const directive = body.directive as string;

  if (!directive) {
    jsonResponse(res, 400, { error: 'directive is required' });
    return;
  }

  const orgTree = buildOrgTree(COMPANY_ROOT);
  const cLevelRoles = getSubordinates(orgTree, 'ceo');

  if (cLevelRoles.length === 0) {
    jsonResponse(res, 400, { error: 'No C-level roles found to dispatch wave.' });
    return;
  }

  // Start a job for EACH C-level role
  const jobs: Job[] = [];
  for (const cRole of cLevelRoles) {
    const job = jobManager.startJob({
      type: 'wave',
      roleId: cRole,
      task: `[CEO Wave] ${directive}`,
      sourceRole: 'ceo',
    });
    jobs.push(job);
  }

  // Bridge: stream ALL job events as SSE, close when all done
  startSSE(res);
  sendSSE(res, 'start', {
    ids: jobs.map((j) => j.id),
    directive,
    targetRoles: cLevelRoles,
  });

  let doneCount = 0;
  const subscribers: Array<{ job: Job; sub: ActivitySubscriber }> = [];

  for (const job of jobs) {
    const subscriber: ActivitySubscriber = (event: ActivityEvent) => {
      const rolePrefix = job.roleId;
      switch (event.type) {
        case 'text':
          sendSSE(res, 'output', { roleId: rolePrefix, text: event.data.text });
          break;
        case 'thinking':
          sendSSE(res, 'thinking', { roleId: rolePrefix, text: event.data.text });
          break;
        case 'tool:start':
          sendSSE(res, 'tool', { roleId: rolePrefix, name: event.data.name, input: event.data.input });
          break;
        case 'dispatch:start':
          sendSSE(res, 'dispatch', { roleId: rolePrefix, targetRoleId: event.data.targetRoleId, task: event.data.task, childJobId: event.data.childJobId });
          break;
        case 'turn:complete':
          sendSSE(res, 'turn', { roleId: rolePrefix, turn: event.data.turn });
          break;
        case 'stderr':
          sendSSE(res, 'stderr', { roleId: rolePrefix, message: event.data.message });
          break;
        case 'job:done':
          sendSSE(res, 'role:done', { roleId: rolePrefix, ...event.data });
          doneCount++;
          if (doneCount >= jobs.length) {
            sendSSE(res, 'done', { directive, completedRoles: cLevelRoles });
            res.end();
          }
          break;
        case 'job:error':
          sendSSE(res, 'role:error', { roleId: rolePrefix, message: event.data.message });
          doneCount++;
          if (doneCount >= jobs.length) {
            sendSSE(res, 'done', { directive, completedRoles: cLevelRoles });
            res.end();
          }
          break;
      }
    };

    job.stream.subscribe(subscriber);
    subscribers.push({ job, sub: subscriber });
  }

  // Client disconnect → unsubscribe all (jobs keep running)
  req.on('close', () => {
    for (const { job, sub } of subscribers) {
      job.stream.unsubscribe(sub);
    }
  });
}

/* ─── GET /api/exec/status ───────────────────── */

function handleStatus(res: ServerResponse): void {
  const statuses: Record<string, string> = {};

  // 1. File-backed activity tracker (baseline)
  const fileActivities = getAllActivities();
  for (const activity of fileActivities) {
    statuses[activity.roleId] = activity.status;
  }

  // 2. JobManager running jobs are the source of truth for "working"
  const runningJobs = jobManager.listJobs({ status: 'running' });
  const runningRoles = new Set(runningJobs.map(j => j.roleId));

  // 2b. In-memory roleStatus (includes chat streaming sessions, not just jobs)
  const memoryWorking = new Set<string>();
  for (const [rid, st] of roleStatus.entries()) {
    if (st === 'working') memoryWorking.add(rid);
  }

  // 3. Any role marked "working" in file but NOT in JobManager AND NOT in memory → done
  for (const roleId of Object.keys(statuses)) {
    if (statuses[roleId] === 'working' && !runningRoles.has(roleId) && !memoryWorking.has(roleId)) {
      statuses[roleId] = 'done';
      completeActivity(roleId);
    }
  }

  // 4. Running jobs override everything
  for (const job of runningJobs) {
    statuses[job.roleId] = 'working';
  }

  // 5. In-memory working (chat streaming) also overrides
  for (const rid of memoryWorking) {
    statuses[rid] = 'working';
  }

  const activeExecs = runningJobs.map((j) => ({
    id: j.id,
    roleId: j.roleId,
    task: j.task,
    startedAt: j.createdAt,
  }));

  jsonResponse(res, 200, { statuses, activeExecutions: activeExecs });
}

/* ─── POST /api/exec/activity ────────────────── */

function handleActivity(body: Record<string, unknown>, res: ServerResponse): void {
  const roleId = body.roleId as string;
  const action = body.action as string;

  if (!roleId || !action) {
    jsonResponse(res, 400, { error: 'roleId and action are required' });
    return;
  }

  switch (action) {
    case 'start':
      setActivity(roleId, (body.task as string) ?? '');
      break;
    case 'update':
      updateActivity(roleId, (body.output as string) ?? '');
      break;
    case 'complete':
      completeActivity(roleId);
      break;
    default:
      jsonResponse(res, 400, { error: `Unknown action: ${action}` });
      return;
  }

  jsonResponse(res, 200, { ok: true });
}

/* ─── POST /api/exec/session/{id}/message ──── */

function handleSessionMessage(
  sessionId: string,
  body: Record<string, unknown>,
  req: IncomingMessage,
  res: ServerResponse,
): void {
  const session = getSession(sessionId);
  if (!session) {
    jsonResponse(res, 404, { error: 'Session not found' });
    return;
  }

  const content = body.content as string;
  const mode = (body.mode as 'talk' | 'do') ?? session.mode;
  const attachments = body.attachments as ImageAttachment[] | undefined;

  // Allow empty content if there are attachments
  if (!content && (!attachments || attachments.length === 0)) {
    jsonResponse(res, 400, { error: 'content or attachments required' });
    return;
  }

  // Validate attachments if present
  const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5MB
  const SUPPORTED_TYPES = ['image/png', 'image/jpeg', 'image/gif', 'image/webp'];
  if (attachments && attachments.length > 0) {
    for (const att of attachments) {
      if (!SUPPORTED_TYPES.includes(att.mediaType)) {
        jsonResponse(res, 400, { error: `Unsupported image type: ${att.mediaType}` });
        return;
      }
      // Approximate size check (base64 is ~33% larger than binary)
      const approximateSize = (att.data.length * 3) / 4;
      if (approximateSize > MAX_FILE_SIZE) {
        jsonResponse(res, 400, { error: `File too large: ${att.name}. Max 5MB.` });
        return;
      }
    }
  }

  const roleId = session.roleId;
  const readOnly = mode === 'talk';

  const orgTree = buildOrgTree(COMPANY_ROOT);
  if (mode === 'do' && !canDispatchTo(orgTree, 'ceo', roleId)) {
    jsonResponse(res, 403, { error: `CEO cannot dispatch to ${roleId}. Use Talk mode or dispatch via their manager.` });
    return;
  }

  const ceoMsg: Message = {
    id: `msg-${Date.now()}-ceo`,
    from: 'ceo',
    content: content || '',
    type: mode === 'do' ? 'directive' : 'conversation',
    status: 'done',
    timestamp: new Date().toISOString(),
    attachments,
  };
  addMessage(sessionId, ceoMsg);

  const contextWindow = buildConversationContext(session.messages, ceoMsg);
  const fullTask = contextWindow
    ? `${contextWindow}\n[Current Message]\nCEO: ${content || '(image attached)'}`
    : content || '(image attached)';

  const roleMsg: Message = {
    id: `msg-${Date.now() + 1}-role`,
    from: 'role',
    content: '',
    type: 'conversation',
    status: 'streaming',
    timestamp: new Date().toISOString(),
  };
  addMessage(sessionId, roleMsg, true);

  startSSE(res);
  sendSSE(res, 'session', { sessionId, ceoMessageId: ceoMsg.id, roleMessageId: roleMsg.id });

  // SSE lifecycle: heartbeat keeps connection alive, timeout prevents stuck connections
  const cleanupSSELifecycle = startSSELifecycle(res, () => {
    // Timeout reached — force close the SSE connection
    cleanupChildSubscriptions();
    updateMessage(sessionId, roleMsg.id, { status: 'error' });
    roleStatus.set(roleId, 'idle');
    completeActivity(roleId);
    sendSSE(res, 'error', { message: 'SSE timeout — connection forcibly closed after 10 minutes' });
    if (!res.writableEnded) res.end();
    handle.abort();
  });

  roleStatus.set(roleId, 'working');
  setActivity(roleId, content.slice(0, 80));

  // Track child job subscriptions for cleanup
  const childSubscriptions: Array<{ job: Job; subscriber: ActivitySubscriber }> = [];
  const pendingDispatches = new Set<string>(); // roleIds we expect child jobs for

  // Watch for child jobs created via dispatch bridge
  const unwatchJobs = jobManager.onJobCreated((childJob) => {
    // Only match jobs for roles we dispatched to from this session
    if (childJob.type !== 'assign') return;
    if (roleMsg.status !== 'streaming') return;
    if (!pendingDispatches.has(childJob.roleId)) return;
    pendingDispatches.delete(childJob.roleId);

    const subscriber: ActivitySubscriber = (event) => {
      switch (event.type) {
        case 'text':
          sendSSE(res, 'dispatch:progress', {
            roleId: event.roleId,
            type: 'text',
            text: event.data.text,
          });
          break;
        case 'thinking':
          sendSSE(res, 'dispatch:progress', {
            roleId: event.roleId,
            type: 'thinking',
            text: event.data.text,
          });
          break;
        case 'tool:start':
          sendSSE(res, 'dispatch:progress', {
            roleId: event.roleId,
            type: 'tool',
            name: event.data.name,
            input: event.data.input,
          });
          break;
        case 'job:done':
          sendSSE(res, 'dispatch:progress', {
            roleId: event.roleId,
            type: 'done',
          });
          childJob.stream.unsubscribe(subscriber);
          break;
        case 'job:error':
          sendSSE(res, 'dispatch:progress', {
            roleId: event.roleId,
            type: 'error',
            message: event.data.message,
          });
          childJob.stream.unsubscribe(subscriber);
          break;
      }
    };
    childJob.stream.subscribe(subscriber);
    childSubscriptions.push({ job: childJob, subscriber });
  });

  // Build team status from running jobs (same as JobManager pattern)
  const teamStatus: Record<string, { status: string; task?: string }> = {};
  for (const j of jobManager.listJobs({ status: 'running' })) {
    teamStatus[j.roleId] = { status: 'working', task: j.task };
  }
  // Also include roleStatus for roles working via session (not tracked as jobs)
  for (const [rid, status] of roleStatus) {
    if (status === 'working' && rid !== roleId && !teamStatus[rid]) {
      teamStatus[rid] = { status: 'working' };
    }
  }

  const handle = getRunner().execute(
    { companyRoot: COMPANY_ROOT, roleId, task: fullTask, sourceRole: 'ceo', orgTree, readOnly, model: orgTree.nodes.get(roleId)?.model, attachments, teamStatus },
    {
      onText: (text) => {
        roleMsg.content += text;
        updateMessage(sessionId, roleMsg.id, { content: roleMsg.content });
        sendSSE(res, 'output', { text });
      },
      onThinking: (text) => {
        sendSSE(res, 'thinking', { text });
      },
      onToolUse: (name, input) => {
        sendSSE(res, 'tool', { name, input: input ? summarizeInput(input) : undefined });
      },
      onDispatch: (subRoleId, subTask) => {
        roleStatus.set(subRoleId, 'working');
        setActivity(subRoleId, subTask);
        pendingDispatches.add(subRoleId);
        sendSSE(res, 'dispatch', { roleId: subRoleId, task: subTask });
      },
      onTurnComplete: (turn) => {
        sendSSE(res, 'turn', { turn });
      },
      onError: (error) => {
        sendSSE(res, 'stderr', { message: error });
      },
    },
  );

  const cleanupChildSubscriptions = () => {
    unwatchJobs();
    for (const { job, subscriber } of childSubscriptions) {
      job.stream.unsubscribe(subscriber);
    }
    childSubscriptions.length = 0;
  };

  handle.promise
    .then((result: RunnerResult) => {
      cleanupSSELifecycle();
      cleanupChildSubscriptions();
      updateMessage(sessionId, roleMsg.id, { content: roleMsg.content, status: 'done' });
      roleStatus.set(roleId, 'idle');
      completeActivity(roleId);
      for (const d of result.dispatches) {
        roleStatus.set(d.roleId, 'idle');
        completeActivity(d.roleId);
      }
      sendSSE(res, 'done', {
        roleMessageId: roleMsg.id,
        output: roleMsg.content.slice(-500),
        turns: result.turns,
        tokens: result.totalTokens,
      });
      if (!res.writableEnded) res.end();
    })
    .catch((err: Error) => {
      cleanupSSELifecycle();
      cleanupChildSubscriptions();
      updateMessage(sessionId, roleMsg.id, { status: 'error' });
      roleStatus.set(roleId, 'idle');
      completeActivity(roleId);
      sendSSE(res, 'error', { message: err.message });
      if (!res.writableEnded) res.end();
    });

  req.on('close', () => {
    cleanupSSELifecycle();
    cleanupChildSubscriptions();
    if (roleMsg.status === 'streaming') {
      handle.abort();
      updateMessage(sessionId, roleMsg.id, { status: 'error' });
      roleStatus.set(roleId, 'idle');
      completeActivity(roleId);
    }
  });
}

/* ─── Conversation context builder ─────────── */

function buildConversationContext(messages: Message[], currentMsg?: Message): string {
  const history = currentMsg
    ? messages.filter((m) => m.id !== currentMsg.id)
    : messages;

  if (history.length === 0) return '';

  const selected: Message[] = [];
  let totalChars = 0;
  for (let i = history.length - 1; i >= 0; i--) {
    const msg = history[i];
    totalChars += msg.content.length;
    if (selected.length >= 10 || totalChars > 8000) break;
    selected.unshift(msg);
  }

  if (selected.length === 0) return '';

  const lines = selected.map((m) => {
    const speaker = m.from === 'ceo' ? 'CEO' : m.from.toUpperCase();
    return `${speaker}: ${m.content}`;
  });

  return `[Conversation History]\n${lines.join('\n')}\n`;
}

/* ─── Helpers ────────────────────────────────── */

function summarizeInput(input: Record<string, unknown>): Record<string, unknown> {
  const summary: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(input)) {
    if (typeof value === 'string' && value.length > 200) {
      summary[key] = value.slice(0, 200) + '...';
    } else {
      summary[key] = value;
    }
  }
  return summary;
}
