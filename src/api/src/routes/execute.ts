import type { IncomingMessage, ServerResponse } from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { COMPANY_ROOT } from '../services/file-reader.js';
import { autoSelectPreset } from '../services/preset-loader.js';
import { readConfig } from '../services/company-config.js';
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
import { supervisorHeartbeat } from '../services/supervisor-heartbeat.js';
import { decideDispatchOrAmend } from '../services/dispatch-classifier.js';

/* ─── Auto-attach child executions to wave multiplexer ── */
executionManager.onExecutionCreated((exec) => {
  waveMultiplexer.onExecutionCreated(exec);
});

// OOM fix: wave recovery runs once, not on every 5s poll
let waveRecoveryDone = false;

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
    // Recovery: rebuild wave→session mapping from session-store (ONE TIME ONLY)
    // Previous bug: recovery ran on EVERY poll (5s) because getActiveWaves()
    // returns empty for done executions → recovery loop → OOM
    if (!waveRecoveryDone) {
      waveRecoveryDone = true;
      const allSessions = listSessions();
      let recovered = 0;
      for (const ses of allSessions) {
        if (!ses.waveId) continue;
        if (ses.roleId !== 'ceo') continue;
        const exec = executionManager.getActiveExecution(ses.id);
        if (exec) {
          waveMultiplexer.registerSession(ses.waveId, exec);
          recovered++;
        }
      }
      if (recovered > 0) {
        console.log(`[WaveRecovery] Recovered ${recovered} sessions (one-time)`);
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

  // ── /api/waves/:waveId/stop — Interrupt supervisor (like Claude Code Esc) ──
  const stopMatch = url.match(/^\/api\/waves\/([^/]+)\/stop$/);
  if (method === 'POST' && stopMatch) {
    const waveId = stopMatch[1];
    // Interrupt CEO supervisor only — children keep running naturally
    // Wave stays alive for new directives (interrupt + redirect)
    const state = supervisorHeartbeat.getState(waveId);
    if (state?.supervisorSessionId) {
      executionManager.abortSession(state.supervisorSessionId);
    }
    supervisorHeartbeat.stop(waveId);
    jsonResponse(res, 200, { ok: true, waveId, interrupted: true });
    return;
  }

  // ── /api/waves/:waveId/directive — CEO adds directive mid-execution ──
  const directiveMatch = url.match(/^\/api\/waves\/([^/]+)\/directive$/);
  if (method === 'POST' && directiveMatch) {
    readBody(req).then((body) => handleWaveDirective(directiveMatch[1], body, res));
    return;
  }

  // ── /api/waves/:waveId/question — Supervisor asks CEO, CEO answers ──
  const questionMatch = url.match(/^\/api\/waves\/([^/]+)\/question$/);
  if (method === 'POST' && questionMatch) {
    readBody(req).then((body) => handleWaveQuestion(questionMatch[1], body, res));
    return;
  }

  // ── /api/waves/:waveId/questions — Get pending questions ──
  const questionsMatch = url.match(/^\/api\/waves\/([^/]+)\/questions$/);
  if (method === 'GET' && questionsMatch) {
    const questions = supervisorHeartbeat.getUnansweredQuestions(questionsMatch[1]);
    jsonResponse(res, 200, { questions });
    return;
  }

  // ── GET /api/waves/:waveId — Single wave status ──
  const waveDetailMatch = url.match(/^\/api\/waves\/([^/]+)$/);
  if (method === 'GET' && waveDetailMatch) {
    const waveId = waveDetailMatch[1];
    // Try active waves first
    const activeWaves = waveMultiplexer.getActiveWaves();
    const active = activeWaves.find((w: { waveId: string }) => w.waveId === waveId);
    if (active) {
      jsonResponse(res, 200, active);
      return;
    }
    // Fallback: read wave file from disk
    const wavePath = path.join(COMPANY_ROOT, '.tycono', 'waves', `${waveId}.json`);
    if (fs.existsSync(wavePath)) {
      try {
        const waveData = JSON.parse(fs.readFileSync(wavePath, 'utf-8'));
        jsonResponse(res, 200, waveData);
      } catch {
        jsonResponse(res, 500, { error: 'Failed to read wave file' });
      }
      return;
    }
    jsonResponse(res, 404, { error: 'Wave not found' });
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

  // GET /api/jobs/:id — internal only (dispatch bridge --check)
  const jobMatch = reqPath.match(/^\/api\/jobs\/([^/]+)$/);
  if (method === 'GET' && jobMatch) {
    const id = jobMatch[1];
    const exec = executionManager.getExecution(id) ?? executionManager.getActiveExecution(id);
    if (!exec) {
      // Fallback: read from activity-stream file on disk
      if (ActivityStream.exists(id)) {
        const events = ActivityStream.readAll(id);
        const doneEvent = [...events].reverse().find(e => e.type === 'msg:done' || e.type === 'msg:error');
        const output = doneEvent?.data?.output as string ?? '';
        const status = doneEvent?.type === 'msg:done' ? 'done' : doneEvent?.type === 'msg:error' ? 'error' : 'unknown';
        jsonResponse(res, 200, { id, status, output, fromStream: true });
      } else {
        jsonResponse(res, 404, { error: 'Not found' });
      }
    } else {
      // Include output from result if available
      const output = exec.result?.output?.slice(-2000) ?? '';
      jsonResponse(res, 200, {
        id: exec.id,
        roleId: exec.roleId,
        task: exec.task,
        status: exec.status,
        sessionId: exec.sessionId,
        createdAt: exec.createdAt,
        output,
      });
    }
    return;
  }

  // GET /api/jobs/:id/history — activity-stream events (dispatch bridge get_result)
  const historyMatch = reqPath.match(/^\/api\/jobs\/([^/]+)\/history$/);
  if (method === 'GET' && historyMatch) {
    const id = historyMatch[1];
    if (ActivityStream.exists(id)) {
      const events = ActivityStream.readAll(id);
      jsonResponse(res, 200, { id, events });
    } else {
      jsonResponse(res, 404, { error: 'Stream not found' });
    }
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

async function handleStartJob(body: Record<string, unknown>, res: ServerResponse): Promise<void> {
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
    // directive가 없으면 idle 상태로 시작 (empty wave)
    const actualDirective = directive || '';

    const targetRoles = body.targetRoles as string[] | undefined;
    const continuous = body.continuous === true;
    const preset = body.preset as string | undefined;
    const permissionMode = body.permissionMode as string | undefined;

    // Set permission mode for agent runners (auto = model-based safety, bypassPermissions = full access)
    if (permissionMode) {
      process.env.TYCONO_PERMISSION_MODE = permissionMode;
    }

    // Always use supervisor mode — CEO supervises C-Levels who supervise members
    {
      const state = supervisorHeartbeat.start(
        `wave-${Date.now()}`,
        actualDirective,
        targetRoles && targetRoles.length > 0 ? targetRoles : undefined,
        continuous,
        preset,
      );

      if (state.status === 'error') {
        jsonResponse(res, 500, { error: 'Failed to start supervisor' });
        return;
      }

      jsonResponse(res, 200, {
        waveId: state.waveId,
        supervisorSessionId: state.supervisorSessionId,
        mode: 'supervisor',
        directive: actualDirective,
      });
      return;
    }
  }

  // Assign
  if (!roleId || !task) {
    jsonResponse(res, 400, { error: 'roleId and task are required' });
    return;
  }

  // Resolve preset from wave for correct org tree (includes agency roles)
  let presetId: string | undefined;
  if (waveId) {
    try {
      const wavePath = path.join(COMPANY_ROOT, '.tycono', 'waves', `${waveId}.json`);
      if (fs.existsSync(wavePath)) {
        presetId = JSON.parse(fs.readFileSync(wavePath, 'utf-8')).preset;
      }
    } catch { /* ignore */ }
  }
  const orgTree = buildOrgTree(COMPANY_ROOT, presetId);
  if (!canDispatchTo(orgTree, sourceRole, roleId)) {
    const errorMsg = `${sourceRole} cannot dispatch to ${roleId}`;
    // Emit dispatch:error on parent's activity stream so it surfaces in SSE
    if (parentSessionId) {
      const parentStream = ActivityStream.getOrCreate(parentSessionId, sourceRole);
      parentStream.emit('dispatch:error', sourceRole, {
        sourceRole,
        targetRole: roleId,
        error: errorMsg,
        timestamp: Date.now(),
      });
    }
    console.warn(`[Dispatch:Error] ${errorMsg} (parent=${parentSessionId ?? 'none'}, wave=${waveId ?? 'none'})`);
    jsonResponse(res, 403, { error: `${errorMsg}.` });
    return;
  }

  // Auto-amend: check if we should amend an existing session instead of creating a new one
  if (!readOnly && waveId) {
    try {
      const decision = await decideDispatchOrAmend(waveId, roleId, sourceRole, task);
      if (decision.action === 'amend' && decision.prevSessionId) {
        console.log(`[AutoAmend] Converting dispatch to amend: ${roleId} → ${decision.prevSessionId} (${decision.reason})`);
        const amendedExec = executionManager.continueSession(
          decision.prevSessionId,
          `[FOLLOW-UP from ${sourceRole}] ${task}`,
          sourceRole,
        );
        if (amendedExec) {
          jsonResponse(res, 200, {
            sessionId: decision.prevSessionId,
            executionId: amendedExec.id,
            status: 'running',
            autoAmend: true,
            reason: decision.reason,
          });
          return;
        }
        // continueSession failed — fall through to new dispatch
        console.warn(`[AutoAmend] continueSession failed for ${decision.prevSessionId}, falling back to new dispatch`);
      }
    } catch (err) {
      console.warn('[AutoAmend] Decision failed, proceeding with new dispatch:', err);
    }
  }

  const sessionSource: 'wave' | 'dispatch' = waveId ? 'wave' : 'dispatch';
  const session = createSession(roleId, {
    mode: readOnly ? 'talk' : 'do',
    source: parentSessionId ? 'dispatch' : sessionSource,
    ...(parentSessionId && { parentSessionId }),
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
  let sessionIds = (body.sessionIds ?? body.jobIds) as string[] | undefined;
  const waveId = body.waveId as string | undefined;

  // BUG-W01 + BUG-009 fix: auto-collect sessionIds from session-store AND activity-streams
  if (waveId && (!sessionIds || sessionIds.length === 0)) {
    const sessionIdSet = new Set(
      listSessions().filter(s => s.waveId === waveId).map(s => s.id)
    );

    // Scan activity-streams for sessions belonging to this wave
    const streamsDir = path.join(COMPANY_ROOT, '.tycono', 'activity-streams');
    if (fs.existsSync(streamsDir)) {
      const waveTimestamp = waveId.replace('wave-', '');
      for (const file of fs.readdirSync(streamsDir)) {
        if (!file.endsWith('.jsonl')) continue;
        const sid = file.replace('.jsonl', '');
        if (sessionIdSet.has(sid)) continue;
        if (sid.includes(waveTimestamp)) {
          sessionIdSet.add(sid);
        }
      }

      // Recursively find all child sessions via dispatch:start events
      let foundNew = true;
      while (foundNew) {
        foundNew = false;
        for (const sid of Array.from(sessionIdSet)) {
          try {
            const events = ActivityStream.readAll(sid);
            for (const e of events) {
              const childSessionId = e.data.childSessionId as string | undefined;
              if (e.type === 'dispatch:start' && childSessionId && !sessionIdSet.has(childSessionId)) {
                sessionIdSet.add(childSessionId);
                foundNew = true;
              }
            }
          } catch { /* skip */ }
        }
      }
    }

    sessionIds = Array.from(sessionIdSet);
    console.log(`[WaveSave] Auto-collected ${sessionIds.length} sessionIds for wave ${waveId}`);
  }

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

  const wavesDir = path.join(COMPANY_ROOT, '.tycono', 'waves');
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

  // Calculate actual duration from activity stream timestamps
  let startedAt = now;
  let endedAt = now;
  for (const role of rolesData) {
    if (role.events.length > 0) {
      const firstTs = new Date(role.events[0].ts);
      const lastTs = new Date(role.events[role.events.length - 1].ts);
      if (firstTs < startedAt) startedAt = firstTs;
      if (lastTs > endedAt) endedAt = lastTs;
    }
    for (const child of role.childSessions) {
      if (child.events.length > 0) {
        const firstTs = new Date(child.events[0].ts);
        const lastTs = new Date(child.events[child.events.length - 1].ts);
        if (firstTs < startedAt) startedAt = firstTs;
        if (lastTs > endedAt) endedAt = lastTs;
      }
    }
  }
  const duration = Math.round((endedAt.getTime() - startedAt.getTime()) / 1000);

  // Collect ALL session IDs including child sessions
  const allSessionIds = [...sessionIds];
  for (const role of rolesData) {
    for (const child of role.childSessions) {
      if (!allSessionIds.includes(child.sessionId)) {
        allSessionIds.push(child.sessionId);
      }
    }
  }

  // Collect dispatch statistics
  const dispatchStats = {
    attempted: 0,
    succeeded: 0,
    failed: 0,
    errors: [] as Array<{ sourceRole: string; targetRole: string; error: string }>,
  };
  for (const role of rolesData) {
    for (const e of role.events) {
      if (e.type === 'dispatch:start') {
        dispatchStats.attempted++;
        dispatchStats.succeeded++;
      } else if (e.type === 'dispatch:error') {
        dispatchStats.attempted++;
        dispatchStats.failed++;
        dispatchStats.errors.push({
          sourceRole: (e.data.sourceRole as string) ?? 'unknown',
          targetRole: (e.data.targetRole as string) ?? 'unknown',
          error: (e.data.error as string) ?? 'unknown',
        });
      }
    }
  }

  const waveJson: Record<string, unknown> = {
    id: baseName,
    directive,
    startedAt: startedAt.toISOString(),
    duration,
    roles: rolesData,
    ...(waveId && { waveId }),
    sessionIds: allSessionIds,
  };
  if (dispatchStats.attempted > 0) waveJson.dispatch = dispatchStats;
  fs.writeFileSync(jsonPath, JSON.stringify(waveJson, null, 2), 'utf-8');

  const roleCount = rolesData.length;
  if (roleCount > 0) {
    try {
      earnCoinsInternal(roleCount * 500, `Wave done: ${roleCount} roles`, `wave:${baseName}`);
    } catch { /* non-critical */ }
  }

  jsonResponse(res, 200, { ok: true, path: `.tycono/waves/${baseName}.json` });
}

/* ─── GET /api/waves/:waveId/stream ── */

function handleWaveStream(waveId: string, url: string, res: ServerResponse, req: IncomingMessage): void {
  const fromMatch = url.match(/[?&]from=(\d+)/);
  const fromWaveSeq = fromMatch ? parseInt(fromMatch[1], 10) : 0;

  let sessionIds = waveMultiplexer.getWaveSessionIds(waveId);

  // Recovery: recover sessions for this wave (active + done = persistent channel)
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

  // Don't 404 on empty waves — keep SSE alive, sessions will appear later
  // (e.g. idle wave waiting for first directive, or supervisor restarting)
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
      case 'dispatch:error':
        sendSSE(res, 'dispatch:error', { sourceRole: event.data.sourceRole, targetRole: event.data.targetRole, error: event.data.error, timestamp: event.data.timestamp });
        break;
      case 'msg:turn-complete':
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

  const targetRoles = body.targetRoles as string[] | undefined;
  const continuous = body.continuous === true;
  let preset = body.preset as string | undefined;

  // Agency resolution priority: --agency flag > config.defaultAgency > auto-select
  if (!preset) {
    const config = readConfig(COMPANY_ROOT);
    if (config.defaultAgency) {
      preset = config.defaultAgency;
      console.log(`[Wave] Using default agency: ${preset} (from .tycono/config.json)`);
    } else {
      preset = autoSelectPreset(COMPANY_ROOT, directive);
      if (preset) {
        console.log(`[Wave] Auto-selected agency: ${preset} (from directive keywords)`);
      }
    }
  }

  // Always supervisor mode — CEO supervises C-Levels
  handleWaveSupervisor(directive, targetRoles, continuous, req, res, preset);
}

/**
 * Supervisor mode: Start a single CEO Supervisor session that dispatches C-Levels.
 * The supervisor uses dispatch/watch/amend tools — same pattern as any supervisor node.
 */
function handleWaveSupervisor(directive: string, targetRoles: string[] | undefined, continuous: boolean, req: IncomingMessage, res: ServerResponse, preset?: string): void {
  const state = supervisorHeartbeat.start(
    `wave-${Date.now()}`,
    directive,
    targetRoles && targetRoles.length > 0 ? targetRoles : undefined,
    continuous,
    preset,
  );

  if (state.status === 'error') {
    jsonResponse(res, 500, { error: 'Failed to start supervisor' });
    return;
  }

  // Return immediately with wave info — supervisor runs in background
  // Frontend subscribes to /api/waves/:waveId/stream for SSE
  jsonResponse(res, 200, {
    waveId: state.waveId,
    supervisorSessionId: state.supervisorSessionId,
    mode: 'supervisor',
    directive,
  });
}

/* ─── POST /api/waves/:waveId/directive ──────── */

function handleWaveDirective(waveId: string, body: Record<string, unknown>, res: ServerResponse): void {
  const text = body.text as string ?? body.directive as string;
  if (!text) {
    jsonResponse(res, 400, { error: 'text is required' });
    return;
  }

  let directive = supervisorHeartbeat.addDirective(waveId, text);
  if (!directive) {
    // Fallback: wave exists but addDirective couldn't restore.
    // Use start() with the SAME waveId to keep it in the same wave context.
    console.log(`[WaveDirective] No supervisor found for wave ${waveId}, creating supervisor in-place`);
    const state = supervisorHeartbeat.start(waveId, text);
    if (state.status !== 'error') {
      directive = { id: `dir-fallback-${Date.now()}`, text, createdAt: new Date().toISOString(), delivered: false };
    }
  }

  if (!directive) {
    jsonResponse(res, 404, { error: `No active supervisor for wave ${waveId}. The wave may have been cleaned up.` });
    return;
  }

  // Provide status context so caller knows what's happening
  const state = supervisorHeartbeat.getState(waveId);
  const status = state?.status ?? 'unknown';
  jsonResponse(res, 200, { directive, supervisorStatus: status });
}

/* ─── POST /api/waves/:waveId/question ──────── */

function handleWaveQuestion(waveId: string, body: Record<string, unknown>, res: ServerResponse): void {
  const questionId = body.questionId as string;
  const answer = body.answer as string;

  if (!questionId || !answer) {
    jsonResponse(res, 400, { error: 'questionId and answer are required' });
    return;
  }

  const success = supervisorHeartbeat.answerQuestion(waveId, questionId, answer);
  if (!success) {
    jsonResponse(res, 404, { error: 'Question not found' });
    return;
  }

  // Deliver answer as a directive so supervisor picks it up at next tick
  supervisorHeartbeat.addDirective(waveId, `[CEO Answer to Q:${questionId}] ${answer}`);
  jsonResponse(res, 200, { success: true });
}

/* ─── GET /api/exec/status ───────────────────── */

function handleStatus(res: ServerResponse): void {
  const statuses: Record<string, string> = {};

  let activeExecs = executionManager.listExecutions({ active: true });

  // Recovery: if in-memory map is empty (e.g. after server restart),
  // rebuild active executions from persisted session-store + activity-streams
  if (activeExecs.length === 0) {
    const allSessions = listSessions();
    const activeSessions = allSessions.filter(s =>
      s.status === 'active' &&
      (s.source === 'wave' || s.source === 'dispatch' || s.source === 'chat')
    );

    const recovered: typeof activeExecs = [];
    // Limit recovery scan to prevent OOM on large session stores
    const MAX_RECOVERY_SCAN = 20;
    const recentActive = activeSessions.slice(-MAX_RECOVERY_SCAN);

    for (const ses of recentActive) {
      if (!ActivityStream.exists(ses.id)) continue;
      // Only read last few events to check done/error (not entire stream)
      const events = ActivityStream.readFrom(ses.id, 0);
      if (events.length === 0) continue;

      // Check last 5 events for done/error (optimization: don't scan entire file)
      const tail = events.slice(-5);
      const isDone = tail.some(e => e.type === 'msg:done' || e.type === 'msg:error');
      if (isDone) continue;

      const startEvent = events.find(e => e.type === 'msg:start');
      const task = (startEvent?.data?.task as string) ?? ses.title ?? '';
      recovered.push({
        id: `recovered-${ses.id}`,
        type: (startEvent?.data?.type as string ?? 'assign') as 'assign' | 'wave' | 'consult',
        roleId: ses.roleId,
        task,
        status: 'running',
        childSessionIds: [],
        createdAt: ses.createdAt,
      });
    }

    if (recovered.length > 0) {
      activeExecs = recovered;
      console.log(`[ExecStatus] Recovered ${recovered.length} active executions from session-store`);
    }
  }

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
