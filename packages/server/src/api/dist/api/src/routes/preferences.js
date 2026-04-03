import crypto from 'node:crypto';
import { Router } from 'express';
import { COMPANY_ROOT } from '../services/file-reader.js';
import { readPreferences, writePreferences, mergePreferences } from '../services/preferences.js';
export const preferencesRouter = Router();
// GET /api/preferences
preferencesRouter.get('/', (_req, res, next) => {
    try {
        res.json(readPreferences(COMPANY_ROOT));
    }
    catch (err) {
        next(err);
    }
});
// PUT /api/preferences — full overwrite
preferencesRouter.put('/', (req, res, next) => {
    try {
        const prefs = req.body;
        if (!prefs || typeof prefs !== 'object') {
            res.status(400).json({ error: 'Invalid preferences body' });
            return;
        }
        const existing = readPreferences(COMPANY_ROOT);
        writePreferences(COMPANY_ROOT, {
            instanceId: existing.instanceId, // preserve — never overwrite from client
            appearances: prefs.appearances ?? {},
            theme: prefs.theme ?? 'default',
        });
        res.json({ ok: true, ...readPreferences(COMPANY_ROOT) });
    }
    catch (err) {
        next(err);
    }
});
// POST /api/preferences/regenerate-token — regenerate instanceId
preferencesRouter.post('/regenerate-token', (_req, res, next) => {
    try {
        const current = readPreferences(COMPANY_ROOT);
        const oldId = current.instanceId;
        current.instanceId = crypto.randomUUID();
        writePreferences(COMPANY_ROOT, current);
        res.json({ ok: true, oldInstanceId: oldId, newInstanceId: current.instanceId });
    }
    catch (err) {
        next(err);
    }
});
// PATCH /api/preferences — partial merge
preferencesRouter.patch('/', (req, res, next) => {
    try {
        const partial = req.body;
        if (!partial || typeof partial !== 'object') {
            res.status(400).json({ error: 'Invalid preferences body' });
            return;
        }
        const merged = mergePreferences(COMPANY_ROOT, partial);
        res.json({ ok: true, ...merged });
    }
    catch (err) {
        next(err);
    }
});
