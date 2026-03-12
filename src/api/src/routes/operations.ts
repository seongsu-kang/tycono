import { Router, Request, Response, NextFunction } from 'express';
import { readFile, listFiles, fileExists, COMPANY_ROOT } from '../services/file-reader.js';
import { extractBoldKeyValues } from '../services/markdown-parser.js';
import { ActivityStream } from '../services/activity-stream.js';
import path from 'node:path';
import fs from 'node:fs';
import { type MessageStatus, isMessageActive } from '../../../shared/types.js';

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

// --- Waves (JSON-only) ---
operationsRouter.get('/waves', (_req: Request, res: Response, next: NextFunction) => {
  try {
    const files = listFiles('operations/waves', '*.json');
    const waves = files
      .map(f => {
        const id = path.basename(f, '.json');
        try {
          const data = JSON.parse(readFile(`operations/waves/${f}`));
          const roles = data.roles ?? [];
          const hasRunning = roles.some((r: { status?: string }) => r.status && isMessageActive(r.status as MessageStatus));
          return {
            id,
            timestamp: id,
            directive: data.directive ?? '',
            rolesCount: roles.length,
            startedAt: data.startedAt ?? '',
            ...(data.commit ? { commit: data.commit } : {}),
            ...(hasRunning ? { hasRunning: true } : {}),
          };
        } catch {
          return { id, timestamp: id, directive: '', rolesCount: 0, startedAt: '' };
        }
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
    const jsonPath = `operations/waves/${id}.json`;

    if (!fileExists(jsonPath)) {
      res.status(404).json({ error: `Wave not found: ${id}` });
      return;
    }

    const data = JSON.parse(readFile(jsonPath));
    res.json({ id, timestamp: id, replay: data });
  } catch (err) {
    next(err);
  }
});

// PATCH /waves/:id — update wave metadata (e.g. commit info)
operationsRouter.patch('/waves/:id', (req: Request, res: Response, next: NextFunction) => {
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

operationsRouter.put('/decisions/:id', (req: Request, res: Response, next: NextFunction) => {
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
  } catch (err) {
    next(err);
  }
});

operationsRouter.delete('/decisions/:id', (req: Request, res: Response, next: NextFunction) => {
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
  } catch (err) {
    next(err);
  }
});

// --- Traces (AI-readable agent conversation debugging) ---

/**
 * GET /api/ops/traces/:jobId — Dump full trace for a job
 * Returns all events including full prompt/response for the job
 * and all child jobs in the trace chain.
 *
 * Query params:
 *   ?chain=true  — include all jobs in the same trace (default: true)
 *   ?type=trace  — filter to trace:prompt and trace:response events only
 */
operationsRouter.get('/traces/:jobId', (req: Request, res: Response, next: NextFunction) => {
  try {
    const jobId = String(req.params.jobId);
    const includeChain = String(req.query.chain ?? 'true') !== 'false';
    const typeFilter = String(req.query.type ?? '') || undefined;

    // Read the target job's events
    const events = ActivityStream.readAll(jobId);
    if (events.length === 0) {
      res.status(404).json({ error: `No activity stream found for job: ${jobId}` });
      return;
    }

    // Extract traceId from the first event
    const traceId = events[0]?.traceId ?? events.find(e => e.data?.traceId)?.data?.traceId as string ?? jobId;

    if (!includeChain) {
      const filtered = typeFilter
        ? events.filter(e => e.type.startsWith(typeFilter))
        : events;
      res.json({ traceId, jobs: [{ jobId, events: filtered }] });
      return;
    }

    // Find all jobs in the same trace
    const allJobIds = ActivityStream.listAll();
    const traceJobs: Array<{ jobId: string; roleId: string; events: typeof events }> = [];

    for (const jid of allJobIds) {
      const jobEvents = ActivityStream.readAll(jid);
      const startEvent = jobEvents.find(e => e.type === 'msg:start' || e.type === 'job:start');
      const jobTraceId = jobEvents[0]?.traceId ?? startEvent?.data?.traceId;

      if (jobTraceId === traceId || jid === jobId) {
        const filtered = typeFilter
          ? jobEvents.filter(e => e.type.startsWith(typeFilter))
          : jobEvents;
        traceJobs.push({
          jobId: jid,
          roleId: startEvent?.roleId ?? 'unknown',
          events: filtered,
        });
      }
    }

    // Sort by timestamp of first event
    traceJobs.sort((a, b) => {
      const aTs = a.events[0]?.ts ?? '';
      const bTs = b.events[0]?.ts ?? '';
      return aTs.localeCompare(bTs);
    });

    res.json({ traceId, jobCount: traceJobs.length, jobs: traceJobs });
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/ops/traces — List recent traces (grouped by traceId)
 * Query params:
 *   ?limit=20    — max traces to return
 *   ?roleId=cto  — filter by role
 */
operationsRouter.get('/traces', (req: Request, res: Response, next: NextFunction) => {
  try {
    const limit = parseInt(String(req.query.limit ?? '20')) || 20;
    const roleFilter = req.query.roleId ? String(req.query.roleId) : undefined;

    const allJobIds = ActivityStream.listAll();
    const traces = new Map<string, {
      traceId: string;
      startedAt: string;
      rootRole: string;
      rootTask: string;
      jobCount: number;
      status: string;
    }>();

    for (const jid of allJobIds) {
      const events = ActivityStream.readAll(jid);
      const startEvent = events.find(e => e.type === 'msg:start' || e.type === 'job:start');
      if (!startEvent) continue;

      const traceId = events[0]?.traceId ?? startEvent?.data?.traceId as string ?? jid;
      if (roleFilter && startEvent.roleId !== roleFilter) continue;

      if (!traces.has(traceId)) {
        const doneEvent = events.find(e => e.type === 'msg:done' || e.type === 'job:done');
        const errorEvent = events.find(e => e.type === 'msg:error' || e.type === 'job:error');
        const awaitingEvent = events.find(e => e.type === 'msg:awaiting_input' || e.type === 'job:awaiting_input');
        const status = awaitingEvent ? 'awaiting_input'
          : doneEvent ? 'done'
          : errorEvent ? 'error'
          : 'running';

        traces.set(traceId, {
          traceId,
          startedAt: startEvent.ts,
          rootRole: startEvent.roleId,
          rootTask: (startEvent.data.task as string ?? '').slice(0, 200),
          jobCount: 1,
          status,
        });
      } else {
        traces.get(traceId)!.jobCount++;
      }
    }

    const sorted = [...traces.values()]
      .sort((a, b) => b.startedAt.localeCompare(a.startedAt))
      .slice(0, limit);

    res.json(sorted);
  } catch (err) {
    next(err);
  }
});
