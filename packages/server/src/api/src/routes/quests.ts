import { Router, Request, Response, NextFunction } from 'express';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { COMPANY_ROOT } from '../services/file-reader.js';

export const questsRouter = Router();

const QUEST_FILE = () => join(COMPANY_ROOT, '.tycono', 'quest-progress.json');

function readProgress(): Record<string, unknown> {
  try {
    return JSON.parse(readFileSync(QUEST_FILE(), 'utf-8'));
  } catch {
    return { completedQuests: [], activeChapter: 1, sideQuestsCompleted: [] };
  }
}

function writeProgress(data: Record<string, unknown>) {
  mkdirSync(join(COMPANY_ROOT, '.tycono'), { recursive: true });
  writeFileSync(QUEST_FILE(), JSON.stringify(data, null, 2));
}

// GET /api/quests/progress
questsRouter.get('/progress', (_req: Request, res: Response, next: NextFunction) => {
  try {
    res.json(readProgress());
  } catch (err) { next(err); }
});

// PUT /api/quests/progress
questsRouter.put('/progress', (req: Request, res: Response, next: NextFunction) => {
  try {
    const body = req.body;
    if (!body || typeof body !== 'object') {
      res.status(400).json({ error: 'Invalid body' });
      return;
    }
    writeProgress(body);
    res.json({ ok: true, ...body });
  } catch (err) { next(err); }
});
