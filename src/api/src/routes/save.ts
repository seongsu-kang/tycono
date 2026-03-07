import { Router, Request, Response, NextFunction } from 'express';
import { COMPANY_ROOT } from '../services/file-reader.js';
import { getGitStatus, gitSave, gitHistory, gitRestore } from '../services/git-save.js';

export const saveRouter = Router();

// GET /api/save/status
saveRouter.get('/status', (_req: Request, res: Response, next: NextFunction) => {
  try {
    res.json(getGitStatus(COMPANY_ROOT));
  } catch (err) {
    next(err);
  }
});

// POST /api/save — commit + push
saveRouter.post('/', (req: Request, res: Response, next: NextFunction) => {
  try {
    const { message } = req.body ?? {};
    const result = gitSave(COMPANY_ROOT, message);
    res.json({ ok: true, ...result });
  } catch (err) {
    if (err instanceof Error && err.message === 'No changes to save') {
      res.status(400).json({ error: err.message });
      return;
    }
    next(err);
  }
});

// GET /api/save/history
saveRouter.get('/history', (req: Request, res: Response, next: NextFunction) => {
  try {
    const limit = Math.min(Number(req.query.limit) || 20, 100);
    res.json(gitHistory(COMPANY_ROOT, limit));
  } catch (err) {
    next(err);
  }
});

// POST /api/save/restore
saveRouter.post('/restore', (req: Request, res: Response, next: NextFunction) => {
  try {
    const { sha, paths } = req.body ?? {};
    if (!sha || typeof sha !== 'string') {
      res.status(400).json({ error: 'sha is required' });
      return;
    }
    const result = gitRestore(COMPANY_ROOT, sha, paths);
    res.json({ ok: true, ...result });
  } catch (err) {
    next(err);
  }
});
