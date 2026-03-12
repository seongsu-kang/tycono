/**
 * Wave Tracker — tracks follow-up jobs in wave JSON files.
 * Persists follow-up state so navigating between waves doesn't lose progress.
 */
import fs from 'node:fs';
import path from 'node:path';
import { COMPANY_ROOT } from './file-reader.js';
import { ActivityStream, type ActivityEvent } from './activity-stream.js';
import { jobManager } from './job-manager.js';
import { type WaveRoleStatus, eventTypeToMessageStatus } from '../../../shared/types.js';

/* ─── Find wave file ──────────────────────── */

export function findWaveFile(waveId: string): string | null {
  const wavesDir = path.join(COMPANY_ROOT, 'operations', 'waves');
  if (!fs.existsSync(wavesDir)) return null;

  // Direct match
  const direct = path.join(wavesDir, `${waveId}.json`);
  if (fs.existsSync(direct)) return direct;

  // Search by waveId/id field
  try {
    for (const f of fs.readdirSync(wavesDir)) {
      if (!f.endsWith('.json')) continue;
      try {
        const data = JSON.parse(fs.readFileSync(path.join(wavesDir, f), 'utf-8'));
        if (data.waveId === waveId || data.id === waveId) {
          return path.join(wavesDir, f);
        }
      } catch { /* skip */ }
    }
  } catch { /* skip */ }
  return null;
}

/* ─── Append follow-up to wave ────────────── */

export function appendFollowUpToWave(
  waveId: string, jobId: string, roleId: string, task: string, sessionId?: string,
): void {
  const waveFile = findWaveFile(waveId);
  if (!waveFile) {
    console.warn(`[WaveTracker] Wave file not found for ${waveId}`);
    return;
  }

  try {
    const data = JSON.parse(fs.readFileSync(waveFile, 'utf-8'));
    if (!data.roles) data.roles = [];

    // Add follow-up entry with running status
    data.roles.push({
      roleId,
      roleName: roleId,
      jobId,
      sessionId,
      status: 'running',
      events: [],
      childSessions: [],
      isFollowUp: true,
      followUpTask: task,
    });

    fs.writeFileSync(waveFile, JSON.stringify(data, null, 2), 'utf-8');
    console.log(`[WaveTracker] Appended job ${jobId} to wave ${waveId}`);

    watchJobCompletion(waveId, jobId, roleId);
  } catch (err) {
    console.error(`[WaveTracker] Failed to append to wave:`, err);
  }
}

/* ─── Update follow-up entry on reply (continuation) ── */

export function updateFollowUpForReply(
  waveId: string, roleId: string, oldJobId: string | undefined, newJobId: string, sessionId?: string,
): void {
  const waveFile = findWaveFile(waveId);
  if (!waveFile) return;

  try {
    const data = JSON.parse(fs.readFileSync(waveFile, 'utf-8'));
    if (!data.roles) return;

    // Find the latest follow-up entry for this roleId
    let idx = -1;
    if (oldJobId) {
      idx = data.roles.findIndex((r: { jobId?: string }) => r.jobId === oldJobId);
    }
    if (idx < 0) {
      // Find latest entry for this roleId
      for (let i = data.roles.length - 1; i >= 0; i--) {
        if (data.roles[i].roleId === roleId) { idx = i; break; }
      }
    }

    if (idx >= 0) {
      const entry = data.roles[idx];
      // Preserve existing events, add old jobId to chain for event replay
      const jobChain: string[] = entry.jobChain ?? [];
      if (entry.jobId && entry.jobId !== newJobId) {
        jobChain.push(entry.jobId);
      }

      // Read events from old job(s) to preserve history
      const existingEvents = collectChainEvents(jobChain, entry.events);

      data.roles[idx] = {
        ...entry,
        jobId: newJobId,
        sessionId: sessionId ?? entry.sessionId,
        status: 'running',
        events: existingEvents,
        jobChain,
      };
    } else {
      // No existing entry — create new
      data.roles.push({
        roleId,
        roleName: roleId,
        jobId: newJobId,
        sessionId,
        status: 'running',
        events: [],
        childSessions: [],
        isFollowUp: true,
      });
    }

    fs.writeFileSync(waveFile, JSON.stringify(data, null, 2), 'utf-8');
    console.log(`[WaveTracker] Updated follow-up for reply: ${roleId} → ${newJobId}`);

    watchJobCompletion(waveId, newJobId, roleId);
  } catch (err) {
    console.error(`[WaveTracker] Failed to update follow-up for reply:`, err);
  }
}

/* ─── Update follow-up entry on job completion ── */

export function updateFollowUpInWave(waveId: string, jobId: string, roleId: string): void {
  const waveFile = findWaveFile(waveId);
  if (!waveFile) return;

  try {
    const data = JSON.parse(fs.readFileSync(waveFile, 'utf-8'));
    if (!data.roles) return;

    const newEvents = ActivityStream.readAll(jobId);
    const doneEvent = newEvents.find(e =>
      e.type === 'msg:done' || e.type === 'msg:error' || e.type === 'msg:awaiting_input' ||
      e.type === 'job:done' || e.type === 'job:error' || e.type === 'job:awaiting_input'
    );
    const status: WaveRoleStatus = doneEvent ? eventTypeToMessageStatus(doneEvent.type) as WaveRoleStatus : 'streaming';

    // Collect child sessions
    const childSessions: Array<{ roleId: string; roleName: string; sessionId: string; status: string; events: ReturnType<typeof ActivityStream.readAll> }> = [];
    for (const e of newEvents) {
      const childJobId = (e.data.childSessionId ?? e.data.childJobId) as string | undefined;
      if (e.type === 'dispatch:start' && childJobId) {
        const targetRoleId = (e.data.targetRoleId as string) ?? 'unknown';
        const childEvents = ActivityStream.readAll(childJobId);
        const childDone = childEvents.find(ce =>
          ce.type === 'msg:done' || ce.type === 'msg:error' || ce.type === 'msg:awaiting_input' ||
          ce.type === 'job:done' || ce.type === 'job:error' || ce.type === 'job:awaiting_input'
        );
        const childStatus: WaveRoleStatus = childDone ? eventTypeToMessageStatus(childDone.type) as WaveRoleStatus : 'unknown';
        childSessions.push({ roleId: targetRoleId, roleName: targetRoleId, sessionId: childJobId, status: childStatus, events: childEvents });
      }
    }

    // Find entry by jobId
    const idx = data.roles.findIndex((r: { jobId?: string }) => r.jobId === jobId);
    if (idx >= 0) {
      const entry = data.roles[idx];
      // Merge: keep preserved chain events + append new events
      const chainEvents = entry.events ?? [];
      const mergedEvents = [...chainEvents, ...newEvents];

      data.roles[idx] = { ...entry, status, events: mergedEvents, childSessions };
    }

    fs.writeFileSync(waveFile, JSON.stringify(data, null, 2), 'utf-8');
    console.log(`[WaveTracker] Updated job ${jobId} in wave ${waveId} → ${status}`);
  } catch (err) {
    console.error(`[WaveTracker] Failed to update wave:`, err);
  }
}

/* ─── Helpers ─────────────────────────────── */

function watchJobCompletion(waveId: string, jobId: string, roleId: string): void {
  const job = jobManager.getJob(jobId);
  if (!job) return;

  const subscriber = (event: ActivityEvent) => {
    if (event.type === 'msg:done' || event.type === 'msg:error' || event.type === 'msg:awaiting_input' ||
        event.type === 'job:done' || event.type === 'job:error' || event.type === 'job:awaiting_input') {
      updateFollowUpInWave(waveId, jobId, roleId);
      job.stream.unsubscribe(subscriber);
    }
  };
  job.stream.subscribe(subscriber);
}

/** Collect events from a chain of previous job IDs */
function collectChainEvents(
  jobChain: string[],
  existingEvents: ActivityEvent[],
): ActivityEvent[] {
  // existingEvents already contains merged events from previous iterations
  if (existingEvents && existingEvents.length > 0) {
    return existingEvents;
  }

  // Fallback: read from activity stream files
  const events: ActivityEvent[] = [];
  for (const jid of jobChain) {
    events.push(...ActivityStream.readAll(jid));
  }
  return events;
}
