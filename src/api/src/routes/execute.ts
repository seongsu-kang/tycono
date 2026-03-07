import type { IncomingMessage, ServerResponse } from 'node:http';
import { COMPANY_ROOT } from '../services/file-reader.js';
import { getAllActivities, setActivity, updateActivity, completeActivity } from '../services/activity-tracker.js';
import { buildOrgTree, canDispatchTo, getSubordinates } from '../engine/org-tree.js';
import { createRunner, type RunnerResult } from '../engine/runners/index.js';
import {
  getSession,
  addMessage,
  updateMessage,
  type Message,
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
      roleStatus.set(cRole, 'working');
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

  roleStatus.set(roleId, 'working');
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

  // If the job is not running (or doesn't exist in memory), send end and close
  if (!job || job.status !== 'running') {
    sendSSE(res, 'stream:end', { reason: job ? job.status : 'not-found' });
    res.end();
    return;
  }

  // Subscribe for live events
  const subscriber = (event: ActivityEvent) => {
    if (event.seq >= fromSeq) {
      sendSSE(res, 'activity', event);
    }
    // Auto-close SSE when job ends
    if (event.type === 'job:done' || event.type === 'job:error') {
      sendSSE(res, 'stream:end', { reason: event.type === 'job:done' ? 'done' : 'error' });
      res.end();
      job.stream.unsubscribe(subscriber);
    }
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

function sendSSE(res: ServerResponse, event: string, data: unknown): void {
  res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
}

function jsonResponse(res: ServerResponse, status: number, body: unknown): void {
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(body));
}

function startSSE(res: ServerResponse): void {
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive',
    'X-Accel-Buffering': 'no',
  });
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

  // Start job via JobManager
  const job = jobManager.startJob({ type: 'assign', roleId, task, sourceRole, readOnly });
  roleStatus.set(roleId, 'working');

  // Bridge: stream job events as legacy SSE format
  startSSE(res);
  sendSSE(res, 'start', { id: job.id, roleId, task, sourceRole });

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
        roleStatus.set(roleId, 'idle');
        sendSSE(res, 'done', event.data);
        res.end();
        job.stream.unsubscribe(subscriber);
        break;
      case 'job:error':
        roleStatus.set(roleId, 'idle');
        sendSSE(res, 'error', { message: event.data.message });
        res.end();
        job.stream.unsubscribe(subscriber);
        break;
    }
  };

  job.stream.subscribe(subscriber);

  // Client disconnect → unsubscribe only (job keeps running!)
  req.on('close', () => {
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
    roleStatus.set(cRole, 'working');
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
          roleStatus.set(rolePrefix, 'idle');
          sendSSE(res, 'role:done', { roleId: rolePrefix, ...event.data });
          doneCount++;
          if (doneCount >= jobs.length) {
            sendSSE(res, 'done', { directive, completedRoles: cLevelRoles });
            res.end();
          }
          break;
        case 'job:error':
          roleStatus.set(rolePrefix, 'idle');
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

  for (const [roleId, status] of roleStatus) {
    statuses[roleId] = status;
  }

  // Merge with file-backed activity tracker
  const fileActivities = getAllActivities();
  for (const activity of fileActivities) {
    if (!statuses[activity.roleId] || statuses[activity.roleId] === 'idle') {
      statuses[activity.roleId] = activity.status;
    }
  }

  // Merge JobManager running jobs
  const runningJobs = jobManager.listJobs({ status: 'running' });
  for (const job of runningJobs) {
    statuses[job.roleId] = 'working';
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
  if (!content) {
    jsonResponse(res, 400, { error: 'content is required' });
    return;
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
    content,
    type: mode === 'do' ? 'directive' : 'conversation',
    status: 'done',
    timestamp: new Date().toISOString(),
  };
  addMessage(sessionId, ceoMsg);

  const contextWindow = buildConversationContext(session.messages, ceoMsg);
  const fullTask = contextWindow
    ? `${contextWindow}\n[Current Message]\nCEO: ${content}`
    : content;

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

  const handle = getRunner().execute(
    { companyRoot: COMPANY_ROOT, roleId, task: fullTask, sourceRole: 'ceo', orgTree, readOnly, model: orgTree.nodes.get(roleId)?.model },
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
      res.end();
    })
    .catch((err: Error) => {
      cleanupChildSubscriptions();
      updateMessage(sessionId, roleMsg.id, { status: 'error' });
      roleStatus.set(roleId, 'idle');
      completeActivity(roleId);
      sendSSE(res, 'error', { message: err.message });
      res.end();
    });

  req.on('close', () => {
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
