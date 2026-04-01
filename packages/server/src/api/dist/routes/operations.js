import { Router } from 'express';
import { readFile, listFiles, fileExists, COMPANY_ROOT } from '../services/file-reader.js';
import { extractBoldKeyValues } from '../services/markdown-parser.js';
import path from 'node:path';
import fs from 'node:fs';
export const operationsRouter = Router();
// --- Standups ---
operationsRouter.get('/standups', (_req, res, next) => {
    try {
        const files = listFiles('operations/standup');
        const standups = files
            .filter(f => f.endsWith('.md'))
            .map(f => {
            const date = path.basename(f, '.md');
            const content = readFile(`operations/standup/${f}`);
            return { date, content };
        })
            .sort((a, b) => b.date.localeCompare(a.date));
        res.json(standups);
    }
    catch (err) {
        next(err);
    }
});
operationsRouter.get('/standups/:date', (req, res, next) => {
    try {
        const { date } = req.params;
        const filePath = `operations/standup/${date}.md`;
        if (!fileExists(filePath)) {
            res.status(404).json({ error: `Standup not found: ${date}` });
            return;
        }
        const content = readFile(filePath);
        res.json({ date, content });
    }
    catch (err) {
        next(err);
    }
});
// --- Waves (JSON-only) ---
operationsRouter.get('/waves', (_req, res, next) => {
    try {
        const files = listFiles('operations/waves', '*.json');
        const waves = files
            .map(f => {
            const id = path.basename(f, '.json');
            try {
                const data = JSON.parse(readFile(`operations/waves/${f}`));
                const roles = data.roles ?? [];
                const hasRunning = roles.some((r) => r.status === 'running' || r.status === 'awaiting_input');
                return {
                    id,
                    timestamp: id,
                    directive: data.directive ?? '',
                    rolesCount: roles.length,
                    startedAt: data.startedAt ?? '',
                    ...(data.commit ? { commit: data.commit } : {}),
                    ...(hasRunning ? { hasRunning: true } : {}),
                };
            }
            catch {
                return { id, timestamp: id, directive: '', rolesCount: 0, startedAt: '' };
            }
        })
            .sort((a, b) => b.timestamp.localeCompare(a.timestamp));
        res.json(waves);
    }
    catch (err) {
        next(err);
    }
});
operationsRouter.get('/waves/:id', (req, res, next) => {
    try {
        const { id } = req.params;
        const jsonPath = `operations/waves/${id}.json`;
        if (!fileExists(jsonPath)) {
            res.status(404).json({ error: `Wave not found: ${id}` });
            return;
        }
        const data = JSON.parse(readFile(jsonPath));
        res.json({ id, timestamp: id, replay: data });
    }
    catch (err) {
        next(err);
    }
});
// PATCH /waves/:id — update wave metadata (e.g. commit info)
operationsRouter.patch('/waves/:id', (req, res, next) => {
    try {
        const { id } = req.params;
        const jsonPath = `operations/waves/${id}.json`;
        if (!fileExists(jsonPath)) {
            res.status(404).json({ error: `Wave not found: ${id}` });
            return;
        }
        const data = JSON.parse(readFile(jsonPath));
        const { commitSha, commitMessage, committedAt } = req.body ?? {};
        if (commitSha) {
            data.commit = { sha: commitSha, message: commitMessage ?? '', committedAt: committedAt ?? new Date().toISOString() };
        }
        const absPath = path.resolve(COMPANY_ROOT, jsonPath);
        fs.writeFileSync(absPath, JSON.stringify(data, null, 2), 'utf-8');
        res.json({ ok: true });
    }
    catch (err) {
        next(err);
    }
});
// --- Decisions ---
operationsRouter.get('/decisions', (_req, res, next) => {
    try {
        const files = listFiles('operations/decisions');
        const decisions = files
            .filter(f => f.endsWith('.md'))
            .map(f => {
            const id = path.basename(f, '.md');
            const content = readFile(`operations/decisions/${f}`);
            const firstLine = content.split('\n').find(l => l.startsWith('# '));
            const title = firstLine ? firstLine.replace(/^#\s+/, '') : id;
            const kv = extractBoldKeyValues(content);
            const date = kv['날짜'] ?? kv['date'] ?? '';
            return { id, title, date, content };
        });
        res.json(decisions);
    }
    catch (err) {
        next(err);
    }
});
operationsRouter.put('/decisions/:id', (req, res, next) => {
    try {
        const { id } = req.params;
        const { content } = req.body ?? {};
        if (typeof content !== 'string') {
            res.status(400).json({ error: 'content (string) is required' });
            return;
        }
        const filePath = `operations/decisions/${id}.md`;
        const absPath = path.resolve(COMPANY_ROOT, filePath);
        // Ensure parent directory exists
        fs.mkdirSync(path.dirname(absPath), { recursive: true });
        fs.writeFileSync(absPath, content, 'utf-8');
        // Re-parse for response
        const firstLine = content.split('\n').find(l => l.startsWith('# '));
        const title = firstLine ? firstLine.replace(/^#\s+/, '') : id;
        const kv = extractBoldKeyValues(content);
        const date = kv['날짜'] ?? kv['date'] ?? '';
        res.json({ id, title, date, content });
    }
    catch (err) {
        next(err);
    }
});
operationsRouter.delete('/decisions/:id', (req, res, next) => {
    try {
        const { id } = req.params;
        const filePath = `operations/decisions/${id}.md`;
        const absPath = path.resolve(COMPANY_ROOT, filePath);
        if (!fs.existsSync(absPath)) {
            res.status(404).json({ error: `Decision not found: ${id}` });
            return;
        }
        fs.unlinkSync(absPath);
        res.json({ ok: true });
    }
    catch (err) {
        next(err);
    }
});
