/**
 * Board API Routes — wave-scoped task board CRUD.
 *
 * POST   /api/waves/:waveId/board           — Create board
 * GET    /api/waves/:waveId/board           — Get board
 * PATCH  /api/waves/:waveId/board/tasks/:id — Update task (status, content)
 * POST   /api/waves/:waveId/board/tasks     — Add task
 * POST   /api/waves/:waveId/board/tasks/:id/complete — Complete task with result
 */
import { Router, Request, Response, NextFunction } from 'express';
import * as boardStore from '../services/board-store.js';
import { ActivityStream } from '../services/activity-stream.js';
import { listSessions } from '../services/session-store.js';
import type { BoardTask, BoardTaskStatus, ActivityEvent } from '../../../shared/types.js';

export const boardRouter = Router();

/** POST /api/waves/:waveId/board — Create board with tasks */
boardRouter.post('/waves/:waveId/board', (req: Request, res: Response, next: NextFunction) => {
  try {
    const { waveId } = req.params;
    const { directive, tasks } = req.body as { directive?: string; tasks?: BoardTask[] };

    if (!directive) {
      res.status(400).json({ error: 'directive is required' });
      return;
    }
    if (!tasks || !Array.isArray(tasks) || tasks.length === 0) {
      res.status(400).json({ error: 'tasks array is required and must not be empty' });
      return;
    }

    if (boardStore.hasBoard(waveId)) {
      res.status(409).json({ error: 'Board already exists for this wave' });
      return;
    }

    const board = boardStore.createBoard(waveId, directive, tasks);
    res.status(201).json(board);
  } catch (err) {
    next(err);
  }
});

/** GET /api/waves/:waveId/board — Get board */
boardRouter.get('/waves/:waveId/board', (req: Request, res: Response, next: NextFunction) => {
  try {
    const { waveId } = req.params;
    const board = boardStore.getBoard(waveId);
    if (!board) {
      res.status(404).json({ error: 'Board not found' });
      return;
    }
    res.json(board);
  } catch (err) {
    next(err);
  }
});

/** PATCH /api/waves/:waveId/board/tasks/:taskId — Update task */
boardRouter.patch('/waves/:waveId/board/tasks/:taskId', (req: Request, res: Response, next: NextFunction) => {
  try {
    const { waveId, taskId } = req.params;
    const { status, title, description, criteria, assignee } = req.body as {
      status?: BoardTaskStatus;
      title?: string;
      description?: string;
      criteria?: string;
      assignee?: string;
    };

    // Status update
    if (status) {
      const result = boardStore.updateTaskStatus(waveId, taskId, status);
      if (!result.ok) {
        res.status(400).json({ error: result.error });
        return;
      }
    }

    // Content update
    const contentUpdates: Record<string, string> = {};
    if (title !== undefined) contentUpdates.title = title;
    if (description !== undefined) contentUpdates.description = description;
    if (criteria !== undefined) contentUpdates.criteria = criteria;
    if (assignee !== undefined) contentUpdates.assignee = assignee;

    if (Object.keys(contentUpdates).length > 0) {
      const result = boardStore.updateTask(waveId, taskId, contentUpdates);
      if (!result.ok) {
        res.status(400).json({ error: result.error });
        return;
      }
    }

    const board = boardStore.getBoard(waveId);
    res.json(board);
  } catch (err) {
    next(err);
  }
});

/** POST /api/waves/:waveId/board/tasks — Add new task */
boardRouter.post('/waves/:waveId/board/tasks', (req: Request, res: Response, next: NextFunction) => {
  try {
    const { waveId } = req.params;
    const task = req.body as BoardTask;

    if (!task.id || !task.title || !task.assignee) {
      res.status(400).json({ error: 'id, title, and assignee are required' });
      return;
    }

    // Set defaults
    if (!task.status) task.status = 'waiting';
    if (!task.dependsOn) task.dependsOn = [];

    const result = boardStore.addTask(waveId, task);
    if (!result.ok) {
      res.status(400).json({ error: result.error });
      return;
    }

    const board = boardStore.getBoard(waveId);
    res.status(201).json(board);
  } catch (err) {
    next(err);
  }
});

/** POST /api/waves/:waveId/board/tasks/:taskId/complete — Complete task */
boardRouter.post('/waves/:waveId/board/tasks/:taskId/complete', (req: Request, res: Response, next: NextFunction) => {
  try {
    const { waveId, taskId } = req.params;
    const { result, note } = req.body as { result?: 'pass' | 'fail'; note?: string };

    if (!result || (result !== 'pass' && result !== 'fail')) {
      res.status(400).json({ error: 'result must be "pass" or "fail"' });
      return;
    }

    const outcome = boardStore.completeTask(waveId, taskId, result, note);
    if (!outcome.ok) {
      res.status(400).json({ error: outcome.error });
      return;
    }

    const board = boardStore.getBoard(waveId);
    res.json(board);
  } catch (err) {
    next(err);
  }
});

/* ─── Template Routes ──────────────────── */

/** POST /api/templates — Save board as template */
boardRouter.post('/templates', (req: Request, res: Response, next: NextFunction) => {
  try {
    const { waveId, name, description } = req.body as { waveId?: string; name?: string; description?: string };
    if (!waveId || !name) {
      res.status(400).json({ error: 'waveId and name are required' });
      return;
    }
    const result = boardStore.saveTemplate(waveId, name, description);
    if (!result.ok) {
      res.status(400).json({ error: result.error });
      return;
    }
    res.status(201).json(result.template);
  } catch (err) {
    next(err);
  }
});

/** GET /api/templates — List templates */
boardRouter.get('/templates', (_req: Request, res: Response, next: NextFunction) => {
  try {
    res.json(boardStore.listTemplates());
  } catch (err) {
    next(err);
  }
});

/** GET /api/waves/:waveId/events — All activity events for a wave (for dashboard feed) */
boardRouter.get('/waves/:waveId/events', (req: Request, res: Response, next: NextFunction) => {
  try {
    const { waveId } = req.params;
    const limit = parseInt(req.query.limit as string) || 200;

    // Find all sessions belonging to this wave
    const sessions = listSessions().filter(s => s.waveId === waveId);

    // Also scan activity-streams for sessions with wave timestamp
    const waveTs = waveId.replace('wave-', '');
    const allStreamIds = ActivityStream.listAll();
    const sessionIds = new Set(sessions.map(s => s.id));
    for (const sid of allStreamIds) {
      if (sid.includes(waveTs)) sessionIds.add(sid);
    }

    // Collect events from all sessions, find child sessions via dispatch:start
    const visited = new Set<string>();
    const queue = [...sessionIds];
    const allEvents: Array<ActivityEvent & { sessionId?: string }> = [];

    while (queue.length > 0) {
      const sid = queue.pop()!;
      if (visited.has(sid)) continue;
      visited.add(sid);

      try {
        const events = ActivityStream.readAll(sid);
        for (const e of events) {
          allEvents.push({ ...e, sessionId: sid });
          // Follow dispatch chains
          const childId = e.data?.childSessionId as string | undefined;
          if (e.type === 'dispatch:start' && childId && !visited.has(childId)) {
            queue.push(childId);
          }
        }
      } catch { /* skip */ }
    }

    // Sort by timestamp, limit
    allEvents.sort((a, b) => a.ts.localeCompare(b.ts));
    const trimmed = allEvents.slice(-limit);

    res.json({
      waveId,
      sessionCount: visited.size,
      totalEvents: allEvents.length,
      events: trimmed,
    });
  } catch (err) {
    next(err);
  }
});

/** GET /api/templates/:id — Get template */
boardRouter.get('/templates/:id', (req: Request, res: Response, next: NextFunction) => {
  try {
    const template = boardStore.getTemplate(req.params.id);
    if (!template) {
      res.status(404).json({ error: 'Template not found' });
      return;
    }
    res.json(template);
  } catch (err) {
    next(err);
  }
});

/* ─── Benchmark API ──────────────────── */

import { loadBenchmarks, listAllBenchmarks, getBenchmark } from '../services/benchmark-store.js';

// GET /api/benchmarks — list all benchmarks (optionally filtered by agencyId)
boardRouter.get('/benchmarks', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const agencyId = req.query.agencyId as string;
    const benchmarks = agencyId ? loadBenchmarks(agencyId) : listAllBenchmarks();
    res.json({ benchmarks });
  } catch (err) {
    next(err);
  }
});

// GET /api/benchmarks/:agencyId/:waveId — get specific benchmark
boardRouter.get('/benchmarks/:agencyId/:waveId', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const benchmark = getBenchmark(req.params.agencyId, req.params.waveId);
    if (!benchmark) {
      res.status(404).json({ error: 'Benchmark not found' });
      return;
    }
    res.json(benchmark);
  } catch (err) {
    next(err);
  }
});

/* ─── Experiment API ──────────────────── */

import {
  listExperiments, loadExperiment, saveExperiment as saveExp,
  runExperiment, cleanupExperiment,
  type Experiment as ExpType,
} from '../services/experiment-runner.js';

// POST /api/experiments — create and start an experiment
boardRouter.post('/experiments', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { directive, agencyId, runs } = req.body;
    if (!directive || !runs || !Array.isArray(runs)) {
      res.status(400).json({ error: 'directive and runs[] required' });
      return;
    }

    const experiment: ExpType = {
      id: `exp-${Date.now()}`,
      ts: new Date().toISOString(),
      directive,
      agencyId: agencyId || 'default',
      status: 'pending',
      runs: runs.map((r: { serverVersion: string; features?: string[]; config?: Record<string, unknown> }, i: number) => ({
        id: `run-${String.fromCharCode(97 + i)}`,
        serverVersion: r.serverVersion,
        features: r.features || [],
        configOverrides: r.config || {},
        sandboxDir: '',
        port: 0,
        waveId: '',
        pid: 0,
        status: 'pending' as const,
      })),
    };

    saveExp(experiment);

    // Start in background
    runExperiment(experiment).catch(err => {
      experiment.status = 'error';
      saveExp(experiment);
      console.error(`[Experiment] ${experiment.id} failed:`, err);
    });

    res.status(201).json({ experimentId: experiment.id, runs: experiment.runs.length });
  } catch (err) {
    next(err);
  }
});

// GET /api/experiments — list all experiments
boardRouter.get('/experiments', async (_req: Request, res: Response, next: NextFunction) => {
  try {
    res.json({ experiments: listExperiments() });
  } catch (err) {
    next(err);
  }
});

// GET /api/experiments/:id — get experiment details
boardRouter.get('/experiments/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const exp = loadExperiment(req.params.id);
    if (!exp) {
      res.status(404).json({ error: 'Experiment not found' });
      return;
    }
    res.json(exp);
  } catch (err) {
    next(err);
  }
});

// DELETE /api/experiments/:id — cleanup experiment (kill servers, remove sandboxes)
boardRouter.delete('/experiments/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    cleanupExperiment(req.params.id);
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});
