/**
 * Wave Tracker — tracks session state in wave JSON files.
 * Persists state so navigating between waves doesn't lose progress.
 */
import fs from 'node:fs';
import path from 'node:path';
import { COMPANY_ROOT } from './file-reader.js';
import { ActivityStream, type ActivityEvent } from './activity-stream.js';
import { executionManager } from './execution-manager.js';
import { type WaveRoleStatus, eventTypeToMessageStatus } from '../../../shared/types.js';

/* ─── Find wave file ──────────────────────── */

export function findWaveFile(waveId: string): string | null {
  const wavesDir = path.join(COMPANY_ROOT, 'operations', 'waves');
  if (!fs.existsSync(wavesDir)) return null;

  const direct = path.join(wavesDir, `${waveId}.json`);
  if (fs.existsSync(direct)) return direct;

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
  waveId: string, sessionId: string, roleId: string, task: string,
): void {
  const waveFile = findWaveFile(waveId);
  if (!waveFile) {
    console.warn(`[WaveTracker] Wave file not found for ${waveId}`);
    return;
  }

  try {
    const data = JSON.parse(fs.readFileSync(waveFile, 'utf-8'));
    if (!data.roles) data.roles = [];

    data.roles.push({
      roleId,
      roleName: roleId,
      sessionId,
      status: 'running',
      events: [],
      childSessions: [],
      isFollowUp: true,
      followUpTask: task,
    });

    fs.writeFileSync(waveFile, JSON.stringify(data, null, 2), 'utf-8');
    console.log(`[WaveTracker] Appended session ${sessionId} to wave ${waveId}`);

    watchExecutionCompletion(waveId, sessionId, roleId);
  } catch (err) {
    console.error(`[WaveTracker] Failed to append to wave:`, err);
  }
}

/* ─── Update follow-up entry on reply (continuation) ── */

export function updateFollowUpForReply(
  waveId: string, roleId: string, sessionId: string,
): void {
  const waveFile = findWaveFile(waveId);
  if (!waveFile) return;

  try {
    const data = JSON.parse(fs.readFileSync(waveFile, 'utf-8'));
    if (!data.roles) return;

    // Find entry by sessionId or roleId
    let idx = data.roles.findIndex((r: { sessionId?: string }) => r.sessionId === sessionId);
    if (idx < 0) {
      for (let i = data.roles.length - 1; i >= 0; i--) {
        if (data.roles[i].roleId === roleId) { idx = i; break; }
      }
    }

    if (idx >= 0) {
      data.roles[idx] = {
        ...data.roles[idx],
        sessionId,
        status: 'running',
      };
    } else {
      data.roles.push({
        roleId,
        roleName: roleId,
        sessionId,
        status: 'running',
        events: [],
        childSessions: [],
        isFollowUp: true,
      });
    }

    fs.writeFileSync(waveFile, JSON.stringify(data, null, 2), 'utf-8');
    console.log(`[WaveTracker] Updated follow-up for reply: ${roleId} session=${sessionId}`);

    watchExecutionCompletion(waveId, sessionId, roleId);
  } catch (err) {
    console.error(`[WaveTracker] Failed to update follow-up for reply:`, err);
  }
}

/* ─── Update follow-up entry on execution completion ── */

export function updateFollowUpInWave(waveId: string, sessionId: string, roleId: string): void {
  const waveFile = findWaveFile(waveId);
  if (!waveFile) return;

  try {
    const data = JSON.parse(fs.readFileSync(waveFile, 'utf-8'));
    if (!data.roles) return;

    const newEvents = ActivityStream.readAll(sessionId);
    const doneEvent = newEvents.find(e =>
      e.type === 'msg:done' || e.type === 'msg:error' || e.type === 'msg:awaiting_input'
    );
    const status: WaveRoleStatus = doneEvent ? eventTypeToMessageStatus(doneEvent.type) as WaveRoleStatus : 'streaming';

    // Collect child sessions
    const childSessions: Array<{ roleId: string; roleName: string; sessionId: string; status: string; events: ReturnType<typeof ActivityStream.readAll> }> = [];
    for (const e of newEvents) {
      const childSessionId = e.data.childSessionId as string | undefined;
      if (e.type === 'dispatch:start' && childSessionId) {
        const targetRoleId = (e.data.targetRoleId as string) ?? 'unknown';
        const childEvents = ActivityStream.readAll(childSessionId);
        const childDone = childEvents.find(ce =>
          ce.type === 'msg:done' || ce.type === 'msg:error' || ce.type === 'msg:awaiting_input'
        );
        const childStatus: WaveRoleStatus = childDone ? eventTypeToMessageStatus(childDone.type) as WaveRoleStatus : 'unknown';
        childSessions.push({ roleId: targetRoleId, roleName: targetRoleId, sessionId: childSessionId, status: childStatus, events: childEvents });
      }
    }

    // Find entry by sessionId
    const idx = data.roles.findIndex((r: { sessionId?: string }) => r.sessionId === sessionId);
    if (idx >= 0) {
      data.roles[idx] = { ...data.roles[idx], status, events: newEvents, childSessions };
    }

    fs.writeFileSync(waveFile, JSON.stringify(data, null, 2), 'utf-8');
    console.log(`[WaveTracker] Updated session ${sessionId} in wave ${waveId} → ${status}`);
  } catch (err) {
    console.error(`[WaveTracker] Failed to update wave:`, err);
  }
}

/* ─── Helpers ─────────────────────────────── */

function watchExecutionCompletion(waveId: string, sessionId: string, roleId: string): void {
  const exec = executionManager.getActiveExecution(sessionId);
  if (!exec) return;

  const subscriber = (event: ActivityEvent) => {
    if (event.type === 'msg:done' || event.type === 'msg:error' || event.type === 'msg:awaiting_input') {
      updateFollowUpInWave(waveId, sessionId, roleId);
      exec.stream.unsubscribe(subscriber);
    }
  };
  exec.stream.subscribe(subscriber);
}
