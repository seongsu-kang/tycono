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
import { jobManager } from '../services/job-manager.js';
import { ActivityStream, type ActivityEvent } from '../services/activity-stream.js';

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
  const ok = deleteSession(req.params.id);
  if (!ok) {
    res.status(404).json({ error: 'Session not found' });
    return;
  }
  res.json({ ok: true });
});

/* ─── SCA-011: Session-based Job proxying ──── */

/** GET /api/sessions/:id/stream — SSE proxy to linked job's activity stream */
sessionsRouter.get('/:id/stream', (req, res) => {
  const session = getSession(req.params.id);
  if (!session) {
    res.status(404).json({ error: 'Session not found' });
    return;
  }

  const job = jobManager.getJobBySessionId(req.params.id);
  const fromSeq = parseInt(req.query.from as string ?? '0', 10);

  // Start SSE
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

  // If no job found, try to replay from the session's latest jobId in messages
  const jobId = job?.id ?? session.messages.filter(m => m.jobId).pop()?.jobId;

  if (jobId) {
    // Replay historical events
    const pastEvents = ActivityStream.readFrom(jobId, fromSeq);
    for (const event of pastEvents) {
      sendEvent('activity', event);
    }
  }

  // If the job is finished or doesn't exist, end
  if (!job || (job.status !== 'running' && job.status !== 'awaiting_input')) {
    sendEvent('stream:end', { reason: job ? job.status : 'no-job' });
    res.end();
    return;
  }

  // Subscribe for live events
  const subscriber = (event: ActivityEvent) => {
    if (event.seq >= fromSeq) {
      sendEvent('activity', event);
    }
    if (event.type === 'job:done' || event.type === 'job:error') {
      sendEvent('stream:end', { reason: event.type === 'job:done' ? 'done' : 'error' });
      res.end();
      job.stream.unsubscribe(subscriber);
    } else if (event.type === 'job:reply') {
      sendEvent('stream:end', { reason: 'replied' });
      res.end();
      job.stream.unsubscribe(subscriber);
    }
  };

  job.stream.subscribe(subscriber);

  // Heartbeat
  const heartbeat = setInterval(() => {
    if (res.destroyed || res.writableEnded) {
      clearInterval(heartbeat);
      return;
    }
    try { res.write(': heartbeat\n\n'); } catch { /* ignore */ }
  }, 15_000);

  req.on('close', () => {
    clearInterval(heartbeat);
    job.stream.unsubscribe(subscriber);
  });
});

/** POST /api/sessions/:id/abort — abort linked job */
sessionsRouter.post('/:id/abort', (req, res) => {
  const session = getSession(req.params.id);
  if (!session) {
    res.status(404).json({ error: 'Session not found' });
    return;
  }

  const job = jobManager.getJobBySessionId(req.params.id);
  if (!job) {
    res.status(404).json({ error: 'No active job for this session' });
    return;
  }

  const success = jobManager.abortJob(job.id);
  if (!success) {
    res.status(400).json({ error: 'Job not running or already finished' });
    return;
  }

  res.json({ ok: true, jobId: job.id });
});

/** POST /api/sessions/:id/reply — reply to awaiting_input job via session */
sessionsRouter.post('/:id/reply', (req, res) => {
  const session = getSession(req.params.id);
  if (!session) {
    res.status(404).json({ error: 'Session not found' });
    return;
  }

  const { message, responderRole } = req.body;
  if (!message) {
    res.status(400).json({ error: 'message is required' });
    return;
  }

  const job = jobManager.getJobBySessionId(req.params.id);
  if (!job) {
    res.status(404).json({ error: 'No active job for this session' });
    return;
  }

  // Add CEO reply message to session
  const ceoMsg: Message = {
    id: `msg-${Date.now()}-ceo-reply`,
    from: 'ceo',
    content: message,
    type: 'conversation',
    status: 'done',
    timestamp: new Date().toISOString(),
  };
  addMessage(req.params.id, ceoMsg);

  const newJob = jobManager.replyToJob(job.id, message, responderRole);
  if (!newJob) {
    res.status(400).json({ error: 'Job not in a replyable state' });
    return;
  }

  // Add role message for the continuation job
  const roleMsg: Message = {
    id: `msg-${Date.now() + 1}-role-reply`,
    from: 'role',
    content: '',
    type: 'conversation',
    status: 'streaming',
    timestamp: new Date().toISOString(),
    jobId: newJob.id,
  };
  addMessage(req.params.id, roleMsg, true);

  res.json({ ok: true, jobId: newJob.id, sessionId: req.params.id });
});
