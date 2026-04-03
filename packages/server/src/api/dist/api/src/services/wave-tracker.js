/**
 * Wave Tracker — tracks session state in wave JSON files.
 * Persists state so navigating between waves doesn't lose progress.
 */
import fs from 'node:fs';
import path from 'node:path';
import { COMPANY_ROOT } from './file-reader.js';
import { ActivityStream } from './activity-stream.js';
import { executionManager } from './execution-manager.js';
import { listSessions } from './session-store.js';
import { eventTypeToMessageStatus } from '../../../shared/types.js';
/* ─── Find wave file ──────────────────────── */
export function findWaveFile(waveId) {
    const wavesDir = path.join(COMPANY_ROOT, '.tycono', 'waves');
    if (!fs.existsSync(wavesDir))
        return null;
    const direct = path.join(wavesDir, `${waveId}.json`);
    if (fs.existsSync(direct))
        return direct;
    try {
        for (const f of fs.readdirSync(wavesDir)) {
            if (!f.endsWith('.json'))
                continue;
            try {
                const data = JSON.parse(fs.readFileSync(path.join(wavesDir, f), 'utf-8'));
                if (data.waveId === waveId || data.id === waveId) {
                    return path.join(wavesDir, f);
                }
            }
            catch { /* skip */ }
        }
    }
    catch { /* skip */ }
    return null;
}
/* ─── Append follow-up to wave ────────────── */
export function appendFollowUpToWave(waveId, sessionId, roleId, task) {
    const waveFile = findWaveFile(waveId);
    if (!waveFile) {
        console.warn(`[WaveTracker] Wave file not found for ${waveId}`);
        return;
    }
    try {
        const data = JSON.parse(fs.readFileSync(waveFile, 'utf-8'));
        if (!data.roles)
            data.roles = [];
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
    }
    catch (err) {
        console.error(`[WaveTracker] Failed to append to wave:`, err);
    }
}
/* ─── Update follow-up entry on reply (continuation) ── */
export function updateFollowUpForReply(waveId, roleId, sessionId) {
    const waveFile = findWaveFile(waveId);
    if (!waveFile)
        return;
    try {
        const data = JSON.parse(fs.readFileSync(waveFile, 'utf-8'));
        if (!data.roles)
            return;
        // Find entry by sessionId or roleId
        let idx = data.roles.findIndex((r) => r.sessionId === sessionId);
        if (idx < 0) {
            for (let i = data.roles.length - 1; i >= 0; i--) {
                if (data.roles[i].roleId === roleId) {
                    idx = i;
                    break;
                }
            }
        }
        if (idx >= 0) {
            data.roles[idx] = {
                ...data.roles[idx],
                sessionId,
                status: 'running',
            };
        }
        else {
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
    }
    catch (err) {
        console.error(`[WaveTracker] Failed to update follow-up for reply:`, err);
    }
}
/* ─── Update follow-up entry on execution completion ── */
export function updateFollowUpInWave(waveId, sessionId, roleId) {
    const waveFile = findWaveFile(waveId);
    if (!waveFile)
        return;
    try {
        const data = JSON.parse(fs.readFileSync(waveFile, 'utf-8'));
        if (!data.roles)
            return;
        const newEvents = ActivityStream.readAll(sessionId);
        const doneEvent = newEvents.find(e => e.type === 'msg:done' || e.type === 'msg:error' || e.type === 'msg:awaiting_input');
        const status = doneEvent ? eventTypeToMessageStatus(doneEvent.type) : 'streaming';
        // Collect child sessions
        const childSessions = [];
        for (const e of newEvents) {
            const childSessionId = e.data.childSessionId;
            if (e.type === 'dispatch:start' && childSessionId) {
                const targetRoleId = e.data.targetRoleId ?? 'unknown';
                const childEvents = ActivityStream.readAll(childSessionId);
                const childDone = childEvents.find(ce => ce.type === 'msg:done' || ce.type === 'msg:error' || ce.type === 'msg:awaiting_input');
                const childStatus = childDone ? eventTypeToMessageStatus(childDone.type) : 'unknown';
                childSessions.push({ roleId: targetRoleId, roleName: targetRoleId, sessionId: childSessionId, status: childStatus, events: childEvents });
            }
        }
        // Find entry by sessionId
        const idx = data.roles.findIndex((r) => r.sessionId === sessionId);
        if (idx >= 0) {
            data.roles[idx] = { ...data.roles[idx], status, events: newEvents, childSessions };
        }
        fs.writeFileSync(waveFile, JSON.stringify(data, null, 2), 'utf-8');
        console.log(`[WaveTracker] Updated session ${sessionId} in wave ${waveId} → ${status}`);
    }
    catch (err) {
        console.error(`[WaveTracker] Failed to update wave:`, err);
    }
}
/* ─── Save completed wave to .tycono/waves/ ── */
/**
 * Auto-save a completed wave to disk.
 * Called by supervisor-heartbeat when all children are done.
 * Mirrors the logic of handleSaveWave in execute.ts but callable from services.
 */
export function saveCompletedWave(waveId, directive) {
    try {
        // BUG-009 fix: collect sessions from BOTH session-store AND activity-streams.
        // Session-store cache may miss the CEO supervisor session (BUG-008).
        // Activity-streams on disk are the source of truth for what actually ran.
        const sessionIdSet = new Set(listSessions().filter(s => s.waveId === waveId).map(s => s.id));
        // Scan activity-streams for ALL sessions belonging to this wave.
        // Wave sessions share a traceId chain: CEO → C-Level → subordinates.
        // We find the CEO session (waveId timestamp embedded in its ID), then follow dispatch:start events.
        const streamsDir = path.join(COMPANY_ROOT, '.tycono', 'activity-streams');
        if (fs.existsSync(streamsDir)) {
            // Find all activity stream files and check if they belong to this wave
            const waveTimestamp = waveId.replace('wave-', '');
            for (const file of fs.readdirSync(streamsDir)) {
                if (!file.endsWith('.jsonl'))
                    continue;
                const sid = file.replace('.jsonl', '');
                if (sessionIdSet.has(sid))
                    continue;
                // Check if session ID contains the wave timestamp (CEO session)
                // or if the session was dispatched from a known wave session
                if (sid.includes(waveTimestamp)) {
                    sessionIdSet.add(sid);
                }
            }
            // Now recursively find all child sessions via dispatch:start events
            let foundNew = true;
            while (foundNew) {
                foundNew = false;
                for (const sid of Array.from(sessionIdSet)) {
                    try {
                        const events = ActivityStream.readAll(sid);
                        for (const e of events) {
                            const childSessionId = e.data.childSessionId;
                            if (e.type === 'dispatch:start' && childSessionId && !sessionIdSet.has(childSessionId)) {
                                sessionIdSet.add(childSessionId);
                                foundNew = true;
                            }
                        }
                    }
                    catch { /* skip */ }
                }
            }
        }
        const sessionIds = Array.from(sessionIdSet);
        if (sessionIds.length === 0) {
            console.warn(`[WaveTracker] No sessions found for wave ${waveId}, skipping save`);
            return { ok: false };
        }
        console.log(`[WaveTracker] Auto-saving wave ${waveId} with ${sessionIds.length} sessions`);
        const rolesData = [];
        for (const sid of sessionIds) {
            const events = ActivityStream.readAll(sid);
            const startEvent = events.find(e => e.type === 'msg:start');
            const roleId = startEvent?.roleId ?? 'unknown';
            const roleName = startEvent?.data?.roleName ?? roleId;
            const doneEvent = events.find(e => e.type === 'msg:done' || e.type === 'msg:awaiting_input' || e.type === 'msg:error');
            const status = doneEvent ? eventTypeToMessageStatus(doneEvent.type) : 'unknown';
            const childSessions = [];
            for (const e of events) {
                const childSessionId = e.data.childSessionId;
                if (e.type === 'dispatch:start' && childSessionId) {
                    const targetRoleId = e.data.targetRoleId ?? 'unknown';
                    const childEvents = ActivityStream.readAll(childSessionId);
                    const childDone = childEvents.find(ce => ce.type === 'msg:done' || ce.type === 'msg:error' || ce.type === 'msg:awaiting_input');
                    const childStatus = childDone ? eventTypeToMessageStatus(childDone.type) : 'unknown';
                    childSessions.push({
                        roleId: targetRoleId,
                        roleName: childEvents.find(ce => ce.type === 'msg:start')?.data?.roleName ?? targetRoleId,
                        sessionId: childSessionId,
                        status: childStatus,
                        events: childEvents,
                    });
                }
            }
            rolesData.push({ roleId, roleName, sessionId: sid, status, events, childSessions });
        }
        const wavesDir = path.join(COMPANY_ROOT, '.tycono', 'waves');
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
                if (firstTs < startedAt)
                    startedAt = firstTs;
                if (lastTs > endedAt)
                    endedAt = lastTs;
            }
            for (const child of role.childSessions) {
                if (child.events.length > 0) {
                    const firstTs = new Date(child.events[0].ts);
                    const lastTs = new Date(child.events[child.events.length - 1].ts);
                    if (firstTs < startedAt)
                        startedAt = firstTs;
                    if (lastTs > endedAt)
                        endedAt = lastTs;
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
        // Preserve preset field from existing wave file
        let existingPreset;
        if (existing) {
            try {
                const existingData = JSON.parse(fs.readFileSync(existing, 'utf-8'));
                existingPreset = existingData.preset;
            }
            catch { /* ignore */ }
        }
        // Collect dispatch statistics across all sessions
        const dispatchStats = {
            attempted: 0,
            succeeded: 0,
            failed: 0,
            errors: [],
        };
        for (const role of rolesData) {
            for (const e of role.events) {
                if (e.type === 'dispatch:start') {
                    dispatchStats.attempted++;
                    dispatchStats.succeeded++;
                }
                else if (e.type === 'dispatch:error') {
                    dispatchStats.attempted++;
                    dispatchStats.failed++;
                    dispatchStats.errors.push({
                        sourceRole: e.data.sourceRole ?? 'unknown',
                        targetRole: e.data.targetRole ?? 'unknown',
                        error: e.data.error ?? 'unknown',
                    });
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
        if (existingPreset)
            waveJson.preset = existingPreset;
        if (dispatchStats.attempted > 0)
            waveJson.dispatch = dispatchStats;
        fs.writeFileSync(jsonPath, JSON.stringify(waveJson, null, 2), 'utf-8');
        const relativePath = `.tycono/waves/${baseName}.json`;
        console.log(`[WaveTracker] Wave saved: ${relativePath} (${rolesData.length} roles)`);
        // Earn coins for wave completion (non-critical)
        try {
            const { earnCoinsInternal } = require('../routes/coins.js');
            if (rolesData.length > 0) {
                earnCoinsInternal(rolesData.length * 500, `Wave done: ${rolesData.length} roles`, `wave:${baseName}`);
            }
        }
        catch { /* non-critical */ }
        return { ok: true, path: relativePath };
    }
    catch (err) {
        console.error(`[WaveTracker] Failed to auto-save wave ${waveId}:`, err);
        return { ok: false };
    }
}
/* ─── Helpers ─────────────────────────────── */
function watchExecutionCompletion(waveId, sessionId, roleId) {
    const exec = executionManager.getActiveExecution(sessionId);
    if (!exec)
        return;
    const subscriber = (event) => {
        if (event.type === 'msg:done' || event.type === 'msg:error' || event.type === 'msg:awaiting_input') {
            updateFollowUpInWave(waveId, sessionId, roleId);
            exec.stream.unsubscribe(subscriber);
        }
    };
    exec.stream.subscribe(subscriber);
}
