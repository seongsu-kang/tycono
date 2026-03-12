/**
 * active-sessions.ts — Active session visibility API
 *
 * Exposes session + port + worktree state for both UI and AI agents.
 * All sessions sharing the same tycono server origin can query this.
 */
import { Router } from 'express';
import { portRegistry } from '../services/port-registry.js';
import { jobManager } from '../services/job-manager.js';

export const activeSessionsRouter = Router();

/**
 * GET /api/active-sessions
 * Returns all active sessions with port + worktree info.
 * Used by both the web UI and AI agents (curl).
 */
activeSessionsRouter.get('/', (_req, res) => {
  const sessions = portRegistry.getAll();

  // Enrich with job info where available
  const enriched = sessions.map(s => {
    const job = jobManager.getJobInfo(s.sessionId);
    return {
      ...s,
      messageStatus: job?.status ?? null,
      jobStatus: job?.status ?? null, // @deprecated D-014: use messageStatus
      roleName: job?.roleId ?? s.roleId,
      alive: s.pid ? isAlive(s.pid) : null,
    };
  });

  res.json({
    sessions: enriched,
    summary: portRegistry.getSummary(),
  });
});

/**
 * GET /api/active-sessions/:id
 * Get detailed info for a specific session.
 */
activeSessionsRouter.get('/:id', (req, res) => {
  const session = portRegistry.get(req.params.id);
  if (!session) {
    res.status(404).json({ error: 'Session not found' });
    return;
  }

  const job = jobManager.getJobInfo(session.sessionId);

  res.json({
    ...session,
    messageStatus: job?.status ?? null,
    jobStatus: job?.status ?? null, // @deprecated D-014: use messageStatus
    roleName: job?.roleId ?? session.roleId,
    alive: session.pid ? isAlive(session.pid) : null,
    job: job ?? null,
  });
});

/**
 * DELETE /api/active-sessions/:id
 * Stop a session — release ports + clean up.
 */
activeSessionsRouter.delete('/:id', (req, res) => {
  const sessionId = req.params.id;
  const session = portRegistry.get(sessionId);

  if (!session) {
    res.status(404).json({ error: 'Session not found' });
    return;
  }

  // Try to abort the job if running
  jobManager.abortJob(sessionId);

  // Release ports
  portRegistry.release(sessionId);

  res.json({ ok: true, released: session.ports });
});

/**
 * POST /api/active-sessions/cleanup
 * Clean up all dead sessions (PID gone).
 */
activeSessionsRouter.post('/cleanup', (_req, res) => {
  const result = portRegistry.cleanup();
  res.json({
    cleaned: result.cleaned.length,
    remaining: result.remaining.length,
    sessions: result.cleaned.map(s => ({
      sessionId: s.sessionId,
      roleId: s.roleId,
      ports: s.ports,
    })),
  });
});

/**
 * POST /api/active-sessions/register
 * Manually register a session (for external Claude Code sessions).
 */
activeSessionsRouter.post('/register', async (req, res) => {
  const { sessionId, roleId, task, pid, worktreePath } = req.body;

  if (!sessionId || !roleId) {
    res.status(400).json({ error: 'sessionId and roleId are required' });
    return;
  }

  // Check if already registered
  const existing = portRegistry.get(sessionId);
  if (existing) {
    res.json({ ok: true, ports: existing.ports, existing: true });
    return;
  }

  const ports = await portRegistry.allocate(
    sessionId,
    roleId,
    task || 'Manual session',
  );

  if (pid || worktreePath) {
    portRegistry.update(sessionId, {
      pid: pid ?? undefined,
      worktreePath: worktreePath ?? undefined,
    });
  }

  res.json({ ok: true, ports, existing: false });
});

/* ─── Helpers ────────────────────────────── */

function isAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}
