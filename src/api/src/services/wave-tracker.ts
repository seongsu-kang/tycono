/**
 * Wave Tracker — tracks session state in wave JSON files.
 * Persists state so navigating between waves doesn't lose progress.
 */
import fs from 'node:fs';
import path from 'node:path';
import { COMPANY_ROOT } from './file-reader.js';
import { ActivityStream, type ActivityEvent } from './activity-stream.js';
import { executionManager } from './execution-manager.js';
import { listSessions } from './session-store.js';
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

/* ─── Save completed wave to operations/waves/ ── */

/**
 * Auto-save a completed wave to disk.
 * Called by supervisor-heartbeat when all children are done.
 * Mirrors the logic of handleSaveWave in execute.ts but callable from services.
 */
export function saveCompletedWave(waveId: string, directive: string): { ok: boolean; path?: string } {
  try {
    // Collect all sessionIds for this wave from session-store
    const allSessions = listSessions();
    const sessionIds = allSessions
      .filter(s => s.waveId === waveId)
      .map(s => s.id);

    if (sessionIds.length === 0) {
      console.warn(`[WaveTracker] No sessions found for wave ${waveId}, skipping save`);
      return { ok: false };
    }

    console.log(`[WaveTracker] Auto-saving wave ${waveId} with ${sessionIds.length} sessions`);

    interface WaveRoleData {
      roleId: string;
      roleName: string;
      sessionId: string;
      status: WaveRoleStatus | 'unknown';
      events: ReturnType<typeof ActivityStream.readAll>;
      childSessions: Array<{ roleId: string; roleName: string; sessionId: string; status: WaveRoleStatus | 'unknown'; events: ReturnType<typeof ActivityStream.readAll> }>;
    }
    const rolesData: WaveRoleData[] = [];

    for (const sid of sessionIds) {
      const events = ActivityStream.readAll(sid);
      const startEvent = events.find(e => e.type === 'msg:start');
      const roleId = startEvent?.roleId ?? 'unknown';
      const roleName = (startEvent?.data?.roleName as string) ?? roleId;
      const doneEvent = events.find(e => e.type === 'msg:done' || e.type === 'msg:awaiting_input' || e.type === 'msg:error');
      const status: WaveRoleStatus | 'unknown' = doneEvent ? eventTypeToMessageStatus(doneEvent.type) as WaveRoleStatus : 'unknown';

      const childSessions: WaveRoleData['childSessions'] = [];
      for (const e of events) {
        const childSessionId = e.data.childSessionId as string | undefined;
        if (e.type === 'dispatch:start' && childSessionId) {
          const targetRoleId = (e.data.targetRoleId as string) ?? 'unknown';
          const childEvents = ActivityStream.readAll(childSessionId);
          const childDone = childEvents.find(ce => ce.type === 'msg:done' || ce.type === 'msg:error' || ce.type === 'msg:awaiting_input');
          const childStatus: WaveRoleStatus | 'unknown' = childDone ? eventTypeToMessageStatus(childDone.type) as WaveRoleStatus : 'unknown';
          childSessions.push({
            roleId: targetRoleId,
            roleName: (childEvents.find(ce => ce.type === 'msg:start')?.data?.roleName as string) ?? targetRoleId,
            sessionId: childSessionId,
            status: childStatus,
            events: childEvents,
          });
        }
      }

      rolesData.push({ roleId, roleName, sessionId: sid, status, events, childSessions });
    }

    const wavesDir = path.join(COMPANY_ROOT, 'operations', 'waves');
    if (!fs.existsSync(wavesDir)) {
      fs.mkdirSync(wavesDir, { recursive: true });
    }

    // Check if wave file already exists (e.g. from appendFollowUp)
    const existing = findWaveFile(waveId);
    const baseName = existing
      ? path.basename(existing, '.json')
      : waveId;
    const jsonPath = existing ?? path.join(wavesDir, `${baseName}.json`);

    // BUG-009 fix: calculate actual duration from activity stream timestamps
    const now = new Date();
    let startedAt = now;
    let endedAt = now;
    for (const role of rolesData) {
      if (role.events.length > 0) {
        const firstTs = new Date(role.events[0].ts);
        const lastTs = new Date(role.events[role.events.length - 1].ts);
        if (firstTs < startedAt) startedAt = firstTs;
        if (lastTs > endedAt) endedAt = lastTs;
      }
      for (const child of role.childSessions) {
        if (child.events.length > 0) {
          const firstTs = new Date(child.events[0].ts);
          const lastTs = new Date(child.events[child.events.length - 1].ts);
          if (firstTs < startedAt) startedAt = firstTs;
          if (lastTs > endedAt) endedAt = lastTs;
        }
      }
    }
    const duration = Math.round((endedAt.getTime() - startedAt.getTime()) / 1000);

    // Collect ALL session IDs including child sessions
    const allSessionIds = [...sessionIds];
    for (const role of rolesData) {
      for (const child of role.childSessions) {
        if (!allSessionIds.includes(child.sessionId)) {
          allSessionIds.push(child.sessionId);
        }
      }
    }

    const waveJson = {
      id: baseName,
      directive,
      startedAt: startedAt.toISOString(),
      duration,
      roles: rolesData,
      waveId,
      sessionIds: allSessionIds,
    };
    fs.writeFileSync(jsonPath, JSON.stringify(waveJson, null, 2), 'utf-8');

    const relativePath = `operations/waves/${baseName}.json`;
    console.log(`[WaveTracker] Wave saved: ${relativePath} (${rolesData.length} roles)`);

    // Earn coins for wave completion (non-critical)
    try {
      const { earnCoinsInternal } = require('../routes/coins.js');
      if (rolesData.length > 0) {
        earnCoinsInternal(rolesData.length * 500, `Wave done: ${rolesData.length} roles`, `wave:${baseName}`);
      }
    } catch { /* non-critical */ }

    return { ok: true, path: relativePath };
  } catch (err) {
    console.error(`[WaveTracker] Failed to auto-save wave ${waveId}:`, err);
    return { ok: false };
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
