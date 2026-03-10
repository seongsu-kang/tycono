import { Router } from 'express';
import {
  createSession,
  getSession,
  listSessions,
  deleteSession,
  deleteMany,
  deleteEmpty,
  updateSession,
} from '../services/session-store.js';

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
