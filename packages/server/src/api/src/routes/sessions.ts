import { Router } from 'express';
import {
  createSession,
  getSession,
  listSessions,
  deleteSession,
  deleteMany,
  deleteEmpty,
  updateSession,
  addMessage,
  type Message,
} from '../services/session-store.js';
import { executionManager } from '../services/execution-manager.js';
import { isMessageActive, type MessageStatus } from '../../../shared/types.js';
import { ActivityStream, type ActivityEvent } from '../services/activity-stream.js';
import { updateFollowUpForReply } from '../services/wave-tracker.js';

export const sessionsRouter = Router();

/* POST /api/sessions — create session */
sessionsRouter.post('/', (req, res) => {
  const { roleId, mode } = req.body;
  if (!roleId) {
    res.status(400).json({ error: 'roleId is required' });
    return;
  }
  const session = createSession(roleId, { mode: mode ?? 'talk' });
  res.status(201).json(session);
});

/* GET /api/sessions — list sessions (meta only) */
sessionsRouter.get('/', (_req, res) => {
  res.json(listSessions());
});

/* GET /api/sessions/:id — session detail with messages */
sessionsRouter.get('/:id', (req, res) => {
  const session = getSession(req.params.id);
  if (!session) {
    res.status(404).json({ error: 'Session not found' });
    return;
  }
  res.json(session);
});

/* PATCH /api/sessions/:id — update title/mode */
sessionsRouter.patch('/:id', (req, res) => {
  const { title, mode } = req.body;
  const session = updateSession(req.params.id, { title, mode });
  if (!session) {
    res.status(404).json({ error: 'Session not found' });
    return;
  }
  res.json(session);
});

/* DELETE /api/sessions — bulk delete (body: { ids }) or ?empty=true */
sessionsRouter.delete('/', (req, res) => {
  console.log(`[Sessions] DELETE / called (empty=${req.query.empty}, origin=${req.headers.origin ?? req.headers.referer ?? 'unknown'})`);
  if (req.query.empty === 'true') {
    const result = deleteEmpty();
    res.json(result);
    return;
  }
  const { ids } = req.body ?? {};
  if (!Array.isArray(ids) || ids.length === 0) {
    res.status(400).json({ error: 'ids array is required' });
    return;
  }
  const deleted = deleteMany(ids);
  res.json({ deleted });
});

/* DELETE /api/sessions/:id — delete session */
sessionsRouter.delete('/:id', (req, res) => {
  console.log(`[Sessions] DELETE /${req.params.id} called (origin=${req.headers.origin ?? req.headers.referer ?? 'unknown'})`);
  const ok = deleteSession(req.params.id);
  if (!ok) {
    res.status(404).json({ error: 'Session not found' });
    return;
  }
  res.json({ ok: true });
});

/* ─── Session-based execution proxying ──── */

/** GET /api/sessions/:id/stream — SSE proxy to linked execution's activity stream */
sessionsRouter.get('/:id/stream', (req, res) => {
  const session = getSession(req.params.id);
  if (!session) {
    res.status(404).json({ error: 'Session not found' });
    return;
  }

  const exec = executionManager.getActiveExecution(req.params.id);
  const fromSeq = parseInt(req.query.from as string ?? '0', 10);

  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive',
    'X-Accel-Buffering': 'no',
  });
  res.flushHeaders();

  const sendEvent = (event: string, data: unknown) => {
    if (res.destroyed || res.writableEnded) return;
    try { res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`); } catch { /* ignore */ }
  };

  // Read from session-keyed stream file
  const streamId = exec?.sessionId ?? req.params.id;
  if (ActivityStream.exists(streamId)) {
    const pastEvents = ActivityStream.readFrom(streamId, fromSeq);
    for (const event of pastEvents) {
      sendEvent('activity', event);
    }
  }

  if (!exec || !isMessageActive(exec.status as MessageStatus)) {
    sendEvent('stream:end', { reason: exec ? exec.status : 'no-execution' });
    res.end();
    return;
  }

  const subscriber = (event: ActivityEvent) => {
    if (event.seq >= fromSeq) {
      sendEvent('activity', event);
    }
    if (event.type === 'msg:done' || event.type === 'msg:error') {
      sendEvent('stream:end', { reason: event.type === 'msg:done' ? 'done' : 'error' });
      res.end();
      exec.stream.unsubscribe(subscriber);
    } else if (event.type === 'msg:awaiting_input') {
      sendEvent('stream:end', { reason: 'awaiting_input' });
      res.end();
      exec.stream.unsubscribe(subscriber);
    } else if (event.type === 'msg:reply') {
      sendEvent('stream:end', { reason: 'replied' });
      res.end();
      exec.stream.unsubscribe(subscriber);
    }
  };

  exec.stream.subscribe(subscriber);

  const heartbeat = setInterval(() => {
    if (res.destroyed || res.writableEnded) {
      clearInterval(heartbeat);
      return;
    }
    try { res.write(': heartbeat\n\n'); } catch { /* ignore */ }
  }, 15_000);

  req.on('close', () => {
    clearInterval(heartbeat);
    exec.stream.unsubscribe(subscriber);
  });
});

/** POST /api/sessions/:id/abort — abort linked execution */
sessionsRouter.post('/:id/abort', (req, res) => {
  const success = executionManager.abortSession(req.params.id);
  if (!success) {
    res.status(404).json({ error: 'No active execution for this session' });
    return;
  }

  res.json({ ok: true, sessionId: req.params.id });
});

/** POST /api/sessions/:id/message — send a new message to the session */
sessionsRouter.post('/:id/message', (req, res) => {
  const session = getSession(req.params.id);
  if (!session) {
    res.status(404).json({ error: 'Session not found' });
    return;
  }

  const { message, sourceRole, attachments } = req.body;
  if (!message && (!attachments || attachments.length === 0)) {
    res.status(400).json({ error: 'message or attachments required' });
    return;
  }

  const ceoMsg: Message = {
    id: `msg-${Date.now()}-ceo-msg`,
    from: 'ceo',
    content: message ?? '',
    type: 'conversation',
    status: 'done',
    timestamp: new Date().toISOString(),
    attachments,
  };
  addMessage(req.params.id, ceoMsg);

  const newExec = executionManager.startExecution({
    type: 'assign',
    roleId: session.roleId,
    task: message ?? '(image attached)',
    sourceRole: sourceRole ?? 'ceo',
    sessionId: req.params.id,
    attachments,
  });

  const roleMsg: Message = {
    id: `msg-${Date.now() + 1}-role-msg`,
    from: 'role',
    content: '',
    type: 'conversation',
    status: 'streaming',
    timestamp: new Date().toISOString(),
  };
  addMessage(req.params.id, roleMsg, true);

  res.json({ ok: true, sessionId: req.params.id });
});

/** POST /api/sessions/:id/reply — reply to awaiting_input execution via session */
sessionsRouter.post('/:id/reply', (req, res) => {
  const session = getSession(req.params.id);
  if (!session) {
    res.status(404).json({ error: 'Session not found' });
    return;
  }

  const { message, responderRole, attachments } = req.body;
  if (!message && (!attachments || attachments.length === 0)) {
    res.status(400).json({ error: 'message or attachments required' });
    return;
  }

  const ceoMsg: Message = {
    id: `msg-${Date.now()}-ceo-reply`,
    from: 'ceo',
    content: message ?? '',
    type: 'conversation',
    status: 'done',
    timestamp: new Date().toISOString(),
    attachments,
  };
  addMessage(req.params.id, ceoMsg);

  const exec = executionManager.getActiveExecution(req.params.id);
  let newExec;

  if (exec) {
    newExec = executionManager.continueSession(req.params.id, message ?? '(image attached)', responderRole);
    if (!newExec) {
      res.status(400).json({ error: 'Execution not in a replyable state' });
      return;
    }
  } else {
    const prevMessages = session.messages
      .filter(m => m.id !== ceoMsg.id)
      .slice(-6)
      .map(m => `${m.from === 'ceo' ? 'CEO' : m.from.toUpperCase()}: ${m.content.slice(0, 500)}`)
      .join('\n');
    const task = prevMessages
      ? `[Conversation History]\n${prevMessages}\n\n[CEO Follow-up]\n${message ?? '(image attached)'}`
      : (message ?? '(image attached)');

    newExec = executionManager.startExecution({
      type: 'assign',
      roleId: session.roleId,
      task,
      sourceRole: responderRole ?? 'ceo',
      sessionId: req.params.id,
      attachments,
    });
  }

  const roleMsg: Message = {
    id: `msg-${Date.now() + 1}-role-reply`,
    from: 'role',
    content: '',
    type: 'conversation',
    status: 'streaming',
    timestamp: new Date().toISOString(),
  };
  addMessage(req.params.id, roleMsg, true);

  if (session.waveId) {
    updateFollowUpForReply(session.waveId, session.roleId, req.params.id);
  }

  res.json({ ok: true, sessionId: req.params.id });
});
