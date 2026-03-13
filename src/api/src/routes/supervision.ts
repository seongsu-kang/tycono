/**
 * Supervision API — Long-poll watch + peer session discovery (SV-13)
 *
 * GET  /api/supervision/watch?sessions=ses-001,ses-002&duration=120&alertOn=msg:done
 *   → Long-poll: blocks for duration seconds → returns JSON digest
 *
 * GET  /api/supervision/peers?waveId=xxx&roleId=cto
 *   → Returns peer C-Level sessions in the same wave
 */
import { Router, type Request, type Response } from 'express';
import { ActivityStream } from '../services/activity-stream.js';
import { digest, quietDigest } from '../services/digest-engine.js';
import { executionManager } from '../services/execution-manager.js';
import type { ActivityEvent } from '../../../shared/types.js';

export const supervisionRouter = Router();

/* ─── GET /watch — Long-poll supervision digest ─── */

supervisionRouter.get('/watch', async (req: Request, res: Response) => {
  const sessionsParam = req.query.sessions as string | undefined;
  if (!sessionsParam) {
    res.status(400).json({ error: 'sessions query parameter is required (comma-separated session IDs)' });
    return;
  }

  const sessionIds = sessionsParam.split(',').filter(Boolean);
  if (sessionIds.length === 0) {
    res.status(400).json({ error: 'At least one session ID is required' });
    return;
  }

  const durationSec = Math.min(Math.max(Number(req.query.duration) || 120, 5), 300);
  const alertOnParam = req.query.alertOn as string | undefined;
  const alertOn = alertOnParam ? alertOnParam.split(',') : ['msg:done', 'msg:error'];
  const alertSet = new Set(alertOn);

  // Record start checkpoints
  const startCheckpoints = new Map<string, number>();
  for (const sid of sessionIds) {
    const events = ActivityStream.readAll(sid);
    startCheckpoints.set(sid, events.length > 0 ? events[events.length - 1].seq + 1 : 0);
  }

  // Set up event collection
  const collectedEvents = new Map<string, ActivityEvent[]>();
  for (const sid of sessionIds) {
    collectedEvents.set(sid, []);
  }

  let earlyReturn = false;
  const unsubscribers: Array<() => void> = [];

  for (const sid of sessionIds) {
    const stream = ActivityStream.getOrCreate(sid, 'unknown');
    const handler = (event: ActivityEvent) => {
      const events = collectedEvents.get(sid);
      if (events) events.push(event);
      if (alertSet.has(event.type)) {
        earlyReturn = true;
      }
    };
    stream.subscribe(handler);
    unsubscribers.push(() => stream.unsubscribe(handler));
  }

  // Wait for duration or early return
  await new Promise<void>((resolve) => {
    const timeout = setTimeout(resolve, durationSec * 1000);
    const checkInterval = setInterval(() => {
      if (earlyReturn) {
        clearTimeout(timeout);
        clearInterval(checkInterval);
        resolve();
      }
    }, 500);
    setTimeout(() => { clearInterval(checkInterval); }, durationSec * 1000 + 100);
  });

  // Unsubscribe all
  for (const unsub of unsubscribers) unsub();

  // Fallback: read from JSONL for sessions with no live events
  for (const sid of sessionIds) {
    const fromSeq = startCheckpoints.get(sid) ?? 0;
    const liveEvents = collectedEvents.get(sid) ?? [];
    if (liveEvents.length === 0) {
      const fileEvents = ActivityStream.readFrom(sid, fromSeq);
      collectedEvents.set(sid, fileEvents);
    }
  }

  const result = digest(collectedEvents);

  res.json({
    text: result.text,
    significanceScore: result.significanceScore,
    anomalies: result.anomalies,
    checkpoints: Object.fromEntries(result.checkpoints),
    eventCount: result.eventCount,
    errorCount: result.errorCount,
    earlyReturn,
  });
});

/* ─── GET /peers — Peer C-Level session discovery ─── */

supervisionRouter.get('/peers', (req: Request, res: Response) => {
  const waveId = req.query.waveId as string | undefined;
  const roleId = req.query.roleId as string | undefined;

  if (!waveId || !roleId) {
    res.status(400).json({ error: 'waveId and roleId are required' });
    return;
  }

  // Find all active executions in the same wave that are C-Level
  const allExecs = executionManager.listExecutions({ active: true });
  const peers = allExecs.filter(exec => {
    if (exec.roleId === roleId) return false; // Exclude self
    // Check if this execution belongs to the same wave
    // Wave membership is tracked via session store
    return true; // For now, return all active C-Level sessions
  });

  res.json({
    waveId,
    roleId,
    peers: peers.map(p => ({
      sessionId: p.id,
      roleId: p.roleId,
      task: p.task.slice(0, 200),
      status: p.status,
    })),
  });
});
