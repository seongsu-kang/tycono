import { Router, Request, Response, NextFunction } from 'express';
import { COMPANY_ROOT } from '../services/file-reader.js';
import { readPreferences, writePreferences, mergePreferences } from '../services/preferences.js';

export const preferencesRouter = Router();

// GET /api/preferences
preferencesRouter.get('/', (_req: Request, res: Response, next: NextFunction) => {
  try {
    res.json(readPreferences(COMPANY_ROOT));
  } catch (err) {
    next(err);
  }
});

// PUT /api/preferences — full overwrite
preferencesRouter.put('/', (req: Request, res: Response, next: NextFunction) => {
  try {
    const prefs = req.body;
    if (!prefs || typeof prefs !== 'object') {
      res.status(400).json({ error: 'Invalid preferences body' });
      return;
    }
    writePreferences(COMPANY_ROOT, {
      appearances: prefs.appearances ?? {},
      theme: prefs.theme ?? 'default',
    });
    res.json({ ok: true, ...readPreferences(COMPANY_ROOT) });
  } catch (err) {
    next(err);
  }
});

// PATCH /api/preferences — partial merge
preferencesRouter.patch('/', (req: Request, res: Response, next: NextFunction) => {
  try {
    const partial = req.body;
    if (!partial || typeof partial !== 'object') {
      res.status(400).json({ error: 'Invalid preferences body' });
      return;
    }
    const merged = mergePreferences(COMPANY_ROOT, partial);
    res.json({ ok: true, ...merged });
  } catch (err) {
    next(err);
  }
});
