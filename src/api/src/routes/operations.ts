import { Router, Request, Response, NextFunction } from 'express';
import { readFile, listFiles, fileExists } from '../services/file-reader.js';
import { extractBoldKeyValues } from '../services/markdown-parser.js';
import path from 'node:path';

export const operationsRouter = Router();

// --- Standups ---
operationsRouter.get('/standups', (_req: Request, res: Response, next: NextFunction) => {
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
  } catch (err) {
    next(err);
  }
});

operationsRouter.get('/standups/:date', (req: Request, res: Response, next: NextFunction) => {
  try {
    const { date } = req.params;
    const filePath = `operations/standup/${date}.md`;
    if (!fileExists(filePath)) {
      res.status(404).json({ error: `Standup not found: ${date}` });
      return;
    }
    const content = readFile(filePath);
    res.json({ date, content });
  } catch (err) {
    next(err);
  }
});

// --- Waves ---
operationsRouter.get('/waves', (_req: Request, res: Response, next: NextFunction) => {
  try {
    const files = listFiles('operations/waves');
    const waves = files
      .filter(f => f.endsWith('.md'))
      .map(f => {
        const id = path.basename(f, '.md');
        const content = readFile(`operations/waves/${f}`);
        // Check if structured JSON exists
        const jsonFile = `operations/waves/${id}.json`;
        const hasJson = fileExists(jsonFile);
        let directive = '';
        let rolesCount = 0;
        let startedAt = '';
        if (hasJson) {
          try {
            const jsonData = JSON.parse(readFile(jsonFile));
            directive = jsonData.directive ?? '';
            rolesCount = jsonData.roles?.length ?? 0;
            startedAt = jsonData.startedAt ?? '';
          } catch { /* ignore parse errors */ }
        } else {
          // Extract directive from markdown (> line)
          const quoteLine = content.split('\n').find(l => l.startsWith('> '));
          directive = quoteLine?.replace(/^>\s*/, '') ?? '';
        }
        return { id, timestamp: id, content, hasReplay: hasJson, directive, rolesCount, startedAt };
      })
      .sort((a, b) => b.timestamp.localeCompare(a.timestamp));

    res.json(waves);
  } catch (err) {
    next(err);
  }
});

operationsRouter.get('/waves/:id', (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;
    const mdPath = `operations/waves/${id}.md`;
    const jsonPath = `operations/waves/${id}.json`;

    if (!fileExists(mdPath) && !fileExists(jsonPath)) {
      res.status(404).json({ error: `Wave not found: ${id}` });
      return;
    }

    const content = fileExists(mdPath) ? readFile(mdPath) : '';

    // Return structured data if JSON exists
    if (fileExists(jsonPath)) {
      try {
        const jsonData = JSON.parse(readFile(jsonPath));
        res.json({ id, timestamp: id, content, replay: jsonData });
        return;
      } catch { /* fall through to md-only response */ }
    }

    res.json({ id, timestamp: id, content });
  } catch (err) {
    next(err);
  }
});

// --- Decisions ---
operationsRouter.get('/decisions', (_req: Request, res: Response, next: NextFunction) => {
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
  } catch (err) {
    next(err);
  }
});
