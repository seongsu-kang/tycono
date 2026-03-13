import type { IncomingMessage, ServerResponse } from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { COMPANY_ROOT } from '../services/file-reader.js';
// activity-tracker removed — executionManager is Single Source of Truth
import { buildOrgTree, canDispatchTo, getSubordinates } from '../engine/org-tree.js';
import { createRunner, type RunnerResult } from '../engine/runners/index.js';
import {
  getSession,
  createSession,
  addMessage,
  updateMessage,
  listSessions,
  type Message,
  type ImageAttachment,
} from '../services/session-store.js';
import { executionManager, type Execution } from '../services/execution-manager.js';
import { type MessageStatus, type WaveRoleStatus, type TeamStatus, messageStatusToRoleStatus, eventTypeToMessageStatus } from '../../../shared/types.js';
import { ActivityStream, type ActivityEvent, type ActivitySubscriber } from '../services/activity-stream.js';
import { earnCoinsInternal } from './coins.js';
import { appendFollowUpToWave } from '../services/wave-tracker.js';
import { waveMultiplexer } from '../services/wave-multiplexer.js';

/* ─── Auto-attach child executions to wave multiplexer ── */
executionManager.onExecutionCreated((exec) => {
  waveMultiplexer.onExecutionCreated(exec);
});

/* ─── Runner — lazy, re-created when engine changes ── */

function getRunner() {
  return createRunner();
}

/* ─── Execution status via executionManager (Single SoT) ──── */

/* ─── Raw HTTP handler (Express 5 SSE 호환 문제 우회) ─── */

export function handleExecRequest(req: IncomingMessage, res: ServerResponse): void {
  const url = req.url ?? '';
  const method = req.method ?? '';

  // ── /api/waves/:waveId/stream — SSE multiplexed wave stream ──
  const waveStreamMatch = url.match(/^\/api\/waves\/([^/]+)\/stream/);
  if (method === 'GET' && waveStreamMatch) {
    handleWaveStream(waveStreamMatch[1], url, res, req);
    return;
  }

  // ── /api/waves/active — restore active waves after refresh ──
  if (method === 'GET' && url === '/api/waves/active') {
    // Recovery: rebuild wave→session mapping from session-store if lost
    const waves = waveMultiplexer.getActiveWaves();
    if (waves.length === 0) {
      const allSessions = listSessions();
      const waveGroups = new Map<string, string[]>();
      for (const ses of allSessions) {
        if (ses.waveId) {
          if (!waveGroups.has(ses.waveId)) waveGroups.set(ses.waveId, []);
          waveGroups.get(ses.waveId)!.push(ses.id);
        }
      }
      for (const [wid, sids] of waveGroups) {
        for (const sid of sids) {
          const exec = executionManager.getActiveExecution(sid);
          if (exec) waveMultiplexer.registerSession(wid, exec);
        }
      }
    }
    jsonResponse(res, 200, { waves: waveMultiplexer.getActiveWaves() });
    return;
  }

  // ── /api/waves/save ──
  if (method === 'POST' && url === '/api/waves/save') {
    readBody(req).then((body) => handleSaveWave(body, res));
    return;
  }

  // ── /api/jobs/* routes (internal) ──
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
  } else {
    res.writeHead(404);
    res.end(JSON.stringify({ error: 'Not found' }));
  }
}

/* ═══════════════════════════════════════════════
   /api/jobs/* — Internal endpoints
   ═══════════════════════════════════════════════ */

function handleJobsRequest(url: string, method: string, req: IncomingMessage, res: ServerResponse): void {
  const [reqPath] = url.split('?');

  // POST /api/jobs — start a new execution (creates session + execution)
  if (method === 'POST' && reqPath === '/api/jobs') {
    readBody(req).then((body) => handleStartJob(body, res));
    return;
  }

  // GET /api/jobs/:id — internal only
  const jobMatch = reqPath.match(/^\/api\/jobs\/([^/]+)$/);
  if (method === 'GET' && jobMatch) {
    const id = jobMatch[1];
    const exec = executionManager.getExecution(id) ?? executionManager.getActiveExecution(id);
    if (!exec) {
      // Try reading from stream file directly
      if (ActivityStream.exists(id)) {
        const events = ActivityStream.readAll(id);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ id, events }));
      } else {
        res.writeHead(404);
        res.end(JSON.stringify({ error: 'Not found' }));
      }
    } else {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        id: exec.id,
        roleId: exec.roleId,
        task: exec.task,
        status: exec.status,
        sessionId: exec.sessionId,
        createdAt: exec.createdAt,
      }));
    }
    return;
  }

  // GET /api/jobs/:id/history — internal only
  const historyMatch = reqPath.match(/^\/api\/jobs\/([^/]+)\/history$/);
  if (method === 'GET' && historyMatch) {
    const id = historyMatch[1];
    const events = ActivityStream.readAll(id);
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ events }));
    return;
  }

  // POST /api/jobs/:id/abort — abort by execution ID or session ID
  const abortMatch = reqPath.match(/^\/api\/jobs\/([^/]+)\/abort$/);
  if (method === 'POST' && abortMatch) {
    const id = abortMatch[1];
    const success = executionManager.abortExecution(id) || executionManager.abortSession(id);
    if (!success) {
      res.writeHead(404);
      res.end(JSON.stringify({ error: 'Not found or not running' }));
    } else {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: true }));
    }
    return;
  }

  res.writeHead(410);
  res.end(JSON.stringify({ error: 'Use /api/sessions/* for client-facing operations.' }));
}

/* ─── POST /api/jobs ─────────────────────── */

function handleStartJob(body: Record<string, unknown>, res: ServerResponse): void {
  const type = (body.type as string) ?? 'assign';
  const roleId = body.roleId as string;
  const task = body.task as string;
  const directive = body.directive as string;
  const sourceRole = (body.sourceRole as string) || 'ceo';
  const readOnly = body.readOnly === true;
  const parentSessionId = body.parentSessionId as string | undefined;
  const waveId = body.waveId as string | undefined;
  const attachments = body.attachments as ImageAttachment[] | undefined;

  if (type === 'wave') {
    if (!directive) {
      jsonResponse(res, 400, { error: 'directive is required for wave jobs' });
      return;
    }

    const orgTree = buildOrgTree(COMPANY_ROOT);
    let cLevelRoles = getSubordinates(orgTree, 'ceo');

    const targetRoles = body.targetRoles as string[] | undefined;
    if (targetRoles && Array.isArray(targetRoles) && targetRoles.length > 0) {
      const allowed = new Set(targetRoles);
      cLevelRoles = cLevelRoles.filter(r => allowed.has(r));
    }

    if (cLevelRoles.length === 0) {
      jsonResponse(res, 400, { error: 'No C-level roles found to dispatch wave.' });
      return;
    }

    const fullTargetScope = targetRoles && targetRoles.length > 0 ? targetRoles : undefined;

    const newWaveId = `wave-${Date.now()}`;
    const sessionIds: string[] = [];

    for (const cRole of cLevelRoles) {
      const session = createSession(cRole, {
        mode: 'do',
        source: 'wave',
        waveId: newWaveId,
      });
      sessionIds.push(session.id);

      const ceoMsg: Message = {
        id: `msg-${Date.now()}-ceo-${cRole}`,
        from: 'ceo',
        content: directive,
        type: 'directive',
        status: 'done',
        timestamp: new Date().toISOString(),
        attachments,
      };
      addMessage(session.id, ceoMsg);

      const exec = executionManager.startExecution({
        type: 'wave',
        roleId: cRole,
        task: `[CEO Wave] ${directive}`,
        sourceRole: 'ceo',
        parentSessionId,
        targetRoles: fullTargetScope,
        sessionId: session.id,
        attachments,
      });

      waveMultiplexer.registerSession(newWaveId, exec);

      const roleMsg: Message = {
        id: `msg-${Date.now() + 1}-role-${cRole}`,
        from: 'role',
        content: '',
        type: 'conversation',
        status: 'streaming',
        timestamp: new Date().toISOString(),
      };
      addMessage(session.id, roleMsg, true);
    }

    jsonResponse(res, 200, { sessionIds, waveId: newWaveId });
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

  const sessionSource: 'wave' | 'dispatch' = waveId ? 'wave' : 'dispatch';
  const session = createSession(roleId, {
    mode: readOnly ? 'talk' : 'do',
    source: parentSessionId ? 'dispatch' : sessionSource,
    ...(waveId && { waveId }),
  });
  const sessionId = session.id;

  const ceoMsg: Message = {
    id: `msg-${Date.now()}-ceo`,
    from: 'ceo',
    content: task,
    type: readOnly ? 'conversation' : 'directive',
    status: 'done',
    timestamp: new Date().toISOString(),
    attachments,
  };
  addMessage(session.id, ceoMsg);

  const exec = executionManager.startExecution({
    type: readOnly ? 'consult' : 'assign',
    roleId,
    task,
    sourceRole,
    readOnly,
    parentSessionId,
    sessionId,
    attachments,
  });

  const roleMsg: Message = {
    id: `msg-${Date.now() + 1}-role`,
    from: 'role',
    content: '',
    type: 'conversation',
    status: 'streaming',
    timestamp: new Date().toISOString(),
    readOnly: readOnly || undefined,
  };
  addMessage(sessionId, roleMsg, true);

  if (waveId) {
    appendFollowUpToWave(waveId, sessionId, roleId, task);
  }

  jsonResponse(res, 200, { sessionId, ...(waveId && { waveId }) });
}

/* ─── POST /api/waves/save ──────────────── */

function handleSaveWave(body: Record<string, unknown>, res: ServerResponse): void {
  const directive = body.directive as string;
  const sessionIds = (body.sessionIds ?? body.jobIds) as string[];
  const waveId = body.waveId as string | undefined;

  if (!directive || !sessionIds || sessionIds.length === 0) {
    jsonResponse(res, 400, { error: 'directive and sessionIds are required' });
    return;
  }

  const now = new Date();
  const dateStr = now.toISOString().slice(0, 10);

  interface WaveRoleData {
    roleId: string;
    roleName: string;
    sessionId: string;
    status: WaveRoleStatus;
    events: ReturnType<typeof ActivityStream.readAll>;
    childSessions: Array<{ roleId: string; roleName: string; sessionId: string; status: WaveRoleStatus; events: ReturnType<typeof ActivityStream.readAll> }>;
  }
  const rolesData: WaveRoleData[] = [];

  for (const sid of sessionIds) {
    const events = ActivityStream.readAll(sid);
    const startEvent = events.find(e => e.type === 'msg:start');
    const roleId = startEvent?.roleId ?? 'unknown';
    const roleName = (startEvent?.data?.roleName as string) ?? roleId;
    const doneEvent = events.find(e => e.type === 'msg:done' || e.type === 'msg:awaiting_input' || e.type === 'msg:error');
    const status: WaveRoleStatus = doneEvent ? eventTypeToMessageStatus(doneEvent.type) as WaveRoleStatus : 'unknown';

    const childSessions: WaveRoleData['childSessions'] = [];
    for (const e of events) {
      const childSessionId = e.data.childSessionId as string | undefined;
      if (e.type === 'dispatch:start' && childSessionId) {
        const targetRoleId = (e.data.targetRoleId as string) ?? 'unknown';
        const childEvents = ActivityStream.readAll(childSessionId);
        const childDone = childEvents.find(ce => ce.type === 'msg:done' || ce.type === 'msg:error' || ce.type === 'msg:awaiting_input');
        const childStatus: WaveRoleStatus = childDone ? eventTypeToMessageStatus(childDone.type) as WaveRoleStatus : 'unknown';
        childSessions.push({
          roleId: targetRoleId,
          roleName: (childEvents.find(ce => ce.type === 'msg:start')?.data?.roleName as string) ?? targetRoleId,
          sessionId: childSessionId,
          status: childStatus,
          events: childEvents,
        });
      }
    }

    rolesData.push({ roleId, roleName, sessionId: sid, status, events, childSessions });
  }

  const wavesDir = path.join(COMPANY_ROOT, 'operations', 'waves');
  if (!fs.existsSync(wavesDir)) {
    fs.mkdirSync(wavesDir, { recursive: true });
  }

  let baseName: string;
  if (waveId) {
    const existing = fs.readdirSync(wavesDir).find(f => {
      if (!f.endsWith('.json')) return false;
      try {
        const data = JSON.parse(fs.readFileSync(path.join(wavesDir, f), 'utf-8'));
        return data.waveId === waveId || data.id === waveId;
      } catch { return false; }
    });
    baseName = existing ? existing.replace('.json', '') : waveId;
  } else {
    const hhmmss = now.toTimeString().slice(0, 8).replace(/:/g, '');
    baseName = `${dateStr.replace(/-/g, '')}-${hhmmss}-wave`;
  }
  const jsonPath = path.join(wavesDir, `${baseName}.json`);

  const waveJson = {
    id: baseName,
    directive,
    startedAt: now.toISOString(),
    duration: 0,
    roles: rolesData,
    ...(waveId && { waveId }),
    ...(sessionIds.length > 0 && { sessionIds }),
  };
  fs.writeFileSync(jsonPath, JSON.stringify(waveJson, null, 2), 'utf-8');

  const roleCount = rolesData.length;
  if (roleCount > 0) {
    try {
      earnCoinsInternal(roleCount * 500, `Wave done: ${roleCount} roles`, `wave:${baseName}`);
    } catch { /* non-critical */ }
  }

  jsonResponse(res, 200, { ok: true, path: `operations/waves/${baseName}.json` });
}

/* ─── GET /api/waves/:waveId/stream ── */

function handleWaveStream(waveId: string, url: string, res: ServerResponse, req: IncomingMessage): void {
  const fromMatch = url.match(/[?&]from=(\d+)/);
  const fromWaveSeq = fromMatch ? parseInt(fromMatch[1], 10) : 0;

  let sessionIds = waveMultiplexer.getWaveSessionIds(waveId);

  // Recovery: if wave→session mapping was lost (e.g. server restart),
  // rebuild from session-store (sessions have waveId) + executionManager
  if (sessionIds.length === 0) {
    const allSessions = listSessions();
    const waveSessions = allSessions.filter(s => s.waveId === waveId);
    for (const ses of waveSessions) {
      const exec = executionManager.getActiveExecution(ses.id);
      if (exec) {
        waveMultiplexer.registerSession(waveId, exec);
      }
    }
    sessionIds = waveMultiplexer.getWaveSessionIds(waveId);
  }

  if (sessionIds.length === 0) {
    res.writeHead(404, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: `No sessions found for wave: ${waveId}` }));
    return;
  }

  const client = waveMultiplexer.attach(waveId, res as any, fromWaveSeq);

  req.on('close', () => {
    waveMultiplexer.detach(waveId, client);
  });
}

/* ═══════════════════════════════════════════════
   Legacy /api/exec/* — kept for backward compat
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

const SSE_TIMEOUT_MS = 10 * 60 * 1000;
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

  const session = createSession(roleId, { mode: readOnly ? 'talk' : 'do' });
  const exec = executionManager.startExecution({
    type: 'assign',
    roleId,
    task,
    sourceRole,
    readOnly,
    sessionId: session.id,
  });

  startSSE(res);
  sendSSE(res, 'start', { id: exec.id, roleId, task, sourceRole });

  const cleanupLifecycle = startSSELifecycle(res, () => {
    sendSSE(res, 'error', { message: 'SSE timeout — connection forcibly closed after 10 minutes' });
    if (!res.writableEnded) res.end();
    exec.stream.unsubscribe(subscriber);
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
        sendSSE(res, 'dispatch', { roleId: event.data.targetRoleId, task: event.data.task, childSessionId: event.data.childSessionId });
        break;
      case 'turn:complete':
        sendSSE(res, 'turn', { turn: event.data.turn });
        break;
      case 'stderr':
        sendSSE(res, 'stderr', { message: event.data.message });
        break;
      case 'msg:awaiting_input':
        sendSSE(res, 'awaiting_input', { question: event.data.question, targetRole: event.data.targetRole, reason: event.data.reason });
        break;
      case 'msg:done':
        cleanupLifecycle();
        sendSSE(res, 'done', event.data);
        if (!res.writableEnded) res.end();
        exec.stream.unsubscribe(subscriber);
        break;
      case 'msg:error':
        cleanupLifecycle();
        sendSSE(res, 'error', { message: event.data.message });
        if (!res.writableEnded) res.end();
        exec.stream.unsubscribe(subscriber);
        break;
    }
  };

  exec.stream.subscribe(subscriber);

  req.on('close', () => {
    cleanupLifecycle();
    exec.stream.unsubscribe(subscriber);
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
  let cLevelRoles = getSubordinates(orgTree, 'ceo');

  const targetRoles = body.targetRoles as string[] | undefined;
  if (targetRoles && Array.isArray(targetRoles) && targetRoles.length > 0) {
    const allowed = new Set(targetRoles);
    cLevelRoles = cLevelRoles.filter(r => allowed.has(r));
  }

  if (cLevelRoles.length === 0) {
    jsonResponse(res, 400, { error: 'No C-level roles found to dispatch wave.' });
    return;
  }

  const fullTargetScope = targetRoles && targetRoles.length > 0 ? targetRoles : undefined;

  const executions: Execution[] = [];
  for (const cRole of cLevelRoles) {
    const session = createSession(cRole, { mode: 'do' });
    const exec = executionManager.startExecution({
      type: 'wave',
      roleId: cRole,
      task: `[CEO Wave] ${directive}`,
      sourceRole: 'ceo',
      targetRoles: fullTargetScope,
      sessionId: session.id,
    });
    executions.push(exec);
  }

  startSSE(res);
  sendSSE(res, 'start', {
    ids: executions.map((e) => e.id),
    directive,
    targetRoles: cLevelRoles,
  });

  let doneCount = 0;
  const subscribers: Array<{ exec: Execution; sub: ActivitySubscriber }> = [];

  for (const exec of executions) {
    const subscriber: ActivitySubscriber = (event: ActivityEvent) => {
      const rolePrefix = exec.roleId;
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
          sendSSE(res, 'dispatch', { roleId: rolePrefix, targetRoleId: event.data.targetRoleId, task: event.data.task, childSessionId: event.data.childSessionId });
          break;
        case 'turn:complete':
          sendSSE(res, 'turn', { roleId: rolePrefix, turn: event.data.turn });
          break;
        case 'stderr':
          sendSSE(res, 'stderr', { roleId: rolePrefix, message: event.data.message });
          break;
        case 'msg:awaiting_input':
          sendSSE(res, 'role:awaiting_input', { roleId: rolePrefix, question: event.data.question, targetRole: event.data.targetRole, reason: event.data.reason });
          break;
        case 'msg:done':
          sendSSE(res, 'role:done', { roleId: rolePrefix, ...event.data });
          doneCount++;
          if (doneCount >= executions.length) {
            sendSSE(res, 'done', { directive, completedRoles: cLevelRoles });
            res.end();
          }
          break;
        case 'msg:error':
          sendSSE(res, 'role:error', { roleId: rolePrefix, message: event.data.message });
          doneCount++;
          if (doneCount >= executions.length) {
            sendSSE(res, 'done', { directive, completedRoles: cLevelRoles });
            res.end();
          }
          break;
      }
    };

    exec.stream.subscribe(subscriber);
    subscribers.push({ exec, sub: subscriber });
  }

  req.on('close', () => {
    for (const { exec, sub } of subscribers) {
      exec.stream.unsubscribe(sub);
    }
  });
}

/* ─── GET /api/exec/status ───────────────────── */

function handleStatus(res: ServerResponse): void {
  const statuses: Record<string, string> = {};

  const activeExecs = executionManager.listExecutions({ active: true });
  for (const exec of activeExecs) {
    // ExecStatus 'running' → RoleStatus 'working' (not MessageStatus 'streaming')
    statuses[exec.roleId] = exec.status === 'running' ? 'working'
      : exec.status === 'awaiting_input' ? 'awaiting_input'
      : 'done';
  }

  const activeExecutions = activeExecs.map((e) => ({
    id: e.id,
    roleId: e.roleId,
    task: e.task,
    startedAt: e.createdAt,
  }));

  jsonResponse(res, 200, { statuses, activeExecutions });
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

  if (!content && (!attachments || attachments.length === 0)) {
    jsonResponse(res, 400, { error: 'content or attachments required' });
    return;
  }

  const MAX_FILE_SIZE = 5 * 1024 * 1024;
  const SUPPORTED_TYPES = ['image/png', 'image/jpeg', 'image/gif', 'image/webp'];
  if (attachments && attachments.length > 0) {
    for (const att of attachments) {
      if (!SUPPORTED_TYPES.includes(att.mediaType)) {
        jsonResponse(res, 400, { error: `Unsupported image type: ${att.mediaType}` });
        return;
      }
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

  const cleanupSSELifecycle = startSSELifecycle(res, () => {
    cleanupChildSubscriptions();
    updateMessage(sessionId, roleMsg.id, { status: 'error' });
    sendSSE(res, 'error', { message: 'SSE timeout — connection forcibly closed after 10 minutes' });
    if (!res.writableEnded) res.end();
    handle.abort();
  });

  const childSubscriptions: Array<{ exec: Execution; subscriber: ActivitySubscriber }> = [];
  const pendingDispatches = new Set<string>();

  const unwatchExecs = executionManager.onExecutionCreated((childExec) => {
    if (childExec.type !== 'assign') return;
    if (roleMsg.status !== 'streaming') return;
    if (!pendingDispatches.has(childExec.roleId)) return;
    pendingDispatches.delete(childExec.roleId);

    const subscriber: ActivitySubscriber = (event) => {
      switch (event.type) {
        case 'text':
          sendSSE(res, 'dispatch:progress', { roleId: event.roleId, type: 'text', text: event.data.text });
          break;
        case 'thinking':
          sendSSE(res, 'dispatch:progress', { roleId: event.roleId, type: 'thinking', text: event.data.text });
          break;
        case 'tool:start':
          sendSSE(res, 'dispatch:progress', { roleId: event.roleId, type: 'tool', name: event.data.name, input: event.data.input });
          break;
        case 'msg:awaiting_input':
          sendSSE(res, 'dispatch:progress', { roleId: event.roleId, type: 'awaiting_input', question: event.data.question, targetRole: event.data.targetRole });
          break;
        case 'msg:done':
          sendSSE(res, 'dispatch:progress', { roleId: event.roleId, type: 'done' });
          childExec.stream.unsubscribe(subscriber);
          break;
        case 'msg:error':
          sendSSE(res, 'dispatch:progress', { roleId: event.roleId, type: 'error', message: event.data.message });
          childExec.stream.unsubscribe(subscriber);
          break;
      }
    };
    childExec.stream.subscribe(subscriber);
    childSubscriptions.push({ exec: childExec, subscriber });
  });

  const teamStatus: TeamStatus = {};
  for (const e of executionManager.listExecutions({ active: true })) {
    const mapped = messageStatusToRoleStatus(e.status as MessageStatus);
    if (teamStatus[e.roleId]?.status === 'working' && mapped === 'awaiting_input') continue;
    teamStatus[e.roleId] = { status: mapped, task: e.task };
  }

  const handle = getRunner().execute(
    { companyRoot: COMPANY_ROOT, roleId, task: fullTask, sourceRole: 'ceo', orgTree, readOnly, model: orgTree.nodes.get(roleId)?.model, attachments, teamStatus, sessionId },
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
    unwatchExecs();
    for (const { exec, subscriber } of childSubscriptions) {
      exec.stream.unsubscribe(subscriber);
    }
    childSubscriptions.length = 0;
  };

  handle.promise
    .then((result: RunnerResult) => {
      cleanupSSELifecycle();
      cleanupChildSubscriptions();
      updateMessage(sessionId, roleMsg.id, {
        content: roleMsg.content,
        status: 'done',
        turns: result.turns,
        tokens: result.totalTokens,
      });
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
      sendSSE(res, 'error', { message: err.message });
      if (!res.writableEnded) res.end();
    });

  req.on('close', () => {
    cleanupSSELifecycle();
    cleanupChildSubscriptions();
    if (roleMsg.status === 'streaming') {
      handle.abort();
      updateMessage(sessionId, roleMsg.id, { status: 'error' });
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
