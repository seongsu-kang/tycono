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
import type { BoardTask, BoardTaskStatus } from '../../../shared/types.js';

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
