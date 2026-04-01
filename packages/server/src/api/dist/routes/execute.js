import fs from 'node:fs';
import path from 'node:path';
import { COMPANY_ROOT } from '../services/file-reader.js';
import { getAllActivities, setActivity, updateActivity, completeActivity } from '../services/activity-tracker.js';
import { buildOrgTree, canDispatchTo, getSubordinates } from '../engine/org-tree.js';
import { createRunner } from '../engine/runners/index.js';
import { getSession, createSession, addMessage, updateMessage, } from '../services/session-store.js';
import { jobManager } from '../services/job-manager.js';
import { ActivityStream } from '../services/activity-stream.js';
import { earnCoinsInternal } from './coins.js';
import { appendFollowUpToWave } from '../services/wave-tracker.js';
import { waveMultiplexer } from '../services/wave-multiplexer.js';
/* ─── SSE-003: Auto-attach child dispatch jobs to wave multiplexer ── */
jobManager.onJobCreated((job) => {
    waveMultiplexer.onJobCreated(job);
});
/* ─── Runner — lazy, re-created when engine changes ── */
function getRunner() {
    return createRunner();
}
/* ─── Active execution tracking (legacy, kept for /api/exec/status compat) ──── */
const roleStatus = new Map();
/* ─── Raw HTTP handler (Express 5 SSE 호환 문제 우회) ─── */
export function handleExecRequest(req, res) {
    const url = req.url ?? '';
    const method = req.method ?? '';
    // ── /api/waves/:waveId/stream — SSE multiplexed wave stream ──
    const waveStreamMatch = url.match(/^\/api\/waves\/([^/]+)\/stream/);
    if (method === 'GET' && waveStreamMatch) {
        handleWaveStream(waveStreamMatch[1], url, res, req);
        return;
    }
    // ── /api/waves/save ──
    if (method === 'POST' && url === '/api/waves/save') {
        readBody(req).then((body) => handleSaveWave(body, res));
        return;
    }
    // ── /api/jobs/* routes ──
    if (url.startsWith('/api/jobs')) {
        handleJobsRequest(url, method, req, res);
        return;
    }
    // ── Legacy /api/exec/* routes ──
    const sessionMatch = url.match(/\/api\/exec\/session\/([^/]+)\/message$/);
    if (sessionMatch && method === 'POST') {
        readBody(req).then((body) => handleSessionMessage(sessionMatch[1], body, req, res));
    }
    else if (method === 'POST' && url.endsWith('/assign')) {
        readBody(req).then((body) => handleAssign(body, req, res));
    }
    else if (method === 'POST' && url.endsWith('/wave')) {
        readBody(req).then((body) => handleWave(body, req, res));
    }
    else if (method === 'GET' && url.endsWith('/status')) {
        handleStatus(res);
    }
    else if (method === 'POST' && url.endsWith('/activity')) {
        readBody(req).then((body) => handleActivity(body, res));
    }
    else {
        res.writeHead(404);
        res.end(JSON.stringify({ error: 'Not found' }));
    }
}
/* ═══════════════════════════════════════════════
   /api/jobs/* — Job-based API
   ═══════════════════════════════════════════════ */
function handleJobsRequest(url, method, req, res) {
    const [path] = url.split('?');
    // POST /api/jobs — start a new job (creates session + job)
    if (method === 'POST' && path === '/api/jobs') {
        readBody(req).then((body) => handleStartJob(body, res));
        return;
    }
    // GET /api/jobs/:id — internal only (used by dispatch bridge Python script)
    const jobMatch = path.match(/^\/api\/jobs\/([^/]+)$/);
    if (method === 'GET' && jobMatch) {
        const jobId = jobMatch[1];
        const info = jobManager.getJobInfo(jobId);
        if (!info) {
            res.writeHead(404);
            res.end(JSON.stringify({ error: 'Job not found' }));
        }
        else {
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify(info));
        }
        return;
    }
    // GET /api/jobs/:id/history — internal only (used by engine Python sub-processes)
    const historyMatch = path.match(/^\/api\/jobs\/([^/]+)\/history$/);
    if (method === 'GET' && historyMatch) {
        const jobId = historyMatch[1];
        const events = ActivityStream.readAll(jobId);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ events }));
        return;
    }
    // All other /api/jobs/* endpoints → 410
    res.writeHead(410);
    res.end(JSON.stringify({ error: 'Use /api/sessions/* for client-facing operations. /api/jobs/:id and /api/jobs/:id/history are internal only.' }));
}
/* ─── POST /api/jobs ─────────────────────── */
function handleStartJob(body, res) {
    const type = body.type ?? 'assign';
    const roleId = body.roleId;
    const task = body.task;
    const directive = body.directive;
    const sourceRole = body.sourceRole || 'ceo';
    const readOnly = body.readOnly === true;
    const targetRole = body.targetRole || 'cto';
    const parentJobId = body.parentJobId;
    const waveId = body.waveId;
    const attachments = body.attachments;
    // Wave shorthand — broadcast to C-level direct reports (optionally filtered)
    if (type === 'wave') {
        if (!directive) {
            jsonResponse(res, 400, { error: 'directive is required for wave jobs' });
            return;
        }
        const orgTree = buildOrgTree(COMPANY_ROOT);
        let cLevelRoles = getSubordinates(orgTree, 'ceo');
        // Selective dispatch: filter by targetRoles if provided
        const targetRoles = body.targetRoles;
        if (targetRoles && Array.isArray(targetRoles) && targetRoles.length > 0) {
            const allowed = new Set(targetRoles);
            cLevelRoles = cLevelRoles.filter(r => allowed.has(r));
        }
        if (cLevelRoles.length === 0) {
            jsonResponse(res, 400, { error: 'No C-level roles found to dispatch wave.' });
            return;
        }
        // Resolve full targetRoles scope for re-dispatch filtering
        // Include both the C-level roles AND any sub-roles from targetRoles
        const fullTargetScope = targetRoles && targetRoles.length > 0 ? targetRoles : undefined;
        // D-014: Create Wave meta + Sessions for each target role
        const waveId = `wave-${Date.now()}`;
        const jobIds = [];
        const sessionIds = [];
        for (const cRole of cLevelRoles) {
            // Create a Session for this role (D-014: Wave = Session batch creation)
            const session = createSession(cRole, {
                mode: 'do',
                source: 'wave',
                waveId,
            });
            sessionIds.push(session.id);
            // Add CEO directive as the first message in the session
            const ceoMsg = {
                id: `msg-${Date.now()}-ceo-${cRole}`,
                from: 'ceo',
                content: directive,
                type: 'directive',
                status: 'done',
                timestamp: new Date().toISOString(),
                attachments,
            };
            addMessage(session.id, ceoMsg);
            const job = jobManager.startJob({
                type: 'wave',
                roleId: cRole,
                task: `[CEO Wave] ${directive}`,
                sourceRole: 'ceo',
                parentJobId,
                targetRoles: fullTargetScope,
                sessionId: session.id, // D-014: link job to session
                attachments,
            });
            jobIds.push(job.id);
            // SSE-001: Register wave job with multiplexer
            waveMultiplexer.registerJob(waveId, job);
            // Add a role message (will be updated as execution progresses)
            const roleMsg = {
                id: `msg-${Date.now() + 1}-role-${cRole}`,
                from: 'role',
                content: '',
                type: 'conversation',
                status: 'streaming',
                timestamp: new Date().toISOString(),
                jobId: job.id,
            };
            addMessage(session.id, roleMsg, true);
        }
        jsonResponse(res, 200, { jobIds, waveId, sessionIds });
        return;
    }
    // Assign
    if (!roleId || !task) {
        jsonResponse(res, 400, { error: 'roleId and task are required' });
        return;
    }
    const orgTree = buildOrgTree(COMPANY_ROOT);
    if (!canDispatchTo(orgTree, sourceRole, roleId)) {
        jsonResponse(res, 403, { error: `${sourceRole} cannot dispatch to ${roleId}.` });
        return;
    }
    // D-014: Create/find session for CEO assigns (not for dispatch child jobs)
    let sessionId;
    if (sourceRole === 'ceo' && !parentJobId) {
        const session = createSession(roleId, {
            mode: readOnly ? 'talk' : 'do',
            source: waveId ? 'wave' : 'dispatch',
            ...(waveId && { waveId }),
        });
        sessionId = session.id;
        // Add CEO message
        const ceoMsg = {
            id: `msg-${Date.now()}-ceo`,
            from: 'ceo',
            content: task,
            type: readOnly ? 'conversation' : 'directive',
            status: 'done',
            timestamp: new Date().toISOString(),
            attachments,
        };
        addMessage(session.id, ceoMsg);
    }
    const job = jobManager.startJob({
        type: readOnly ? 'consult' : 'assign',
        roleId,
        task,
        sourceRole,
        readOnly,
        parentJobId,
        sessionId,
        attachments,
    });
    // D-014: Add role message linked to job
    if (sessionId) {
        const roleMsg = {
            id: `msg-${Date.now() + 1}-role`,
            from: 'role',
            content: '',
            type: 'conversation',
            status: 'streaming',
            timestamp: new Date().toISOString(),
            jobId: job.id,
            readOnly: readOnly || undefined,
        };
        addMessage(sessionId, roleMsg, true);
    }
    // Follow-up: append this job to the wave JSON so it persists across navigation
    if (waveId) {
        appendFollowUpToWave(waveId, job.id, roleId, task, sessionId);
    }
    jsonResponse(res, 200, { jobId: job.id, ...(sessionId && { sessionId }), ...(waveId && { waveId }) });
}
/* ─── Follow-up: wave tracking (delegated to wave-tracker service) ── */
/* ─── POST /api/waves/save ──────────────── */
function handleSaveWave(body, res) {
    const directive = body.directive;
    const jobIds = body.jobIds;
    const sessionIds = body.sessionIds;
    const waveId = body.waveId;
    if (!directive || !jobIds || jobIds.length === 0) {
        jsonResponse(res, 400, { error: 'directive and jobIds are required' });
        return;
    }
    const now = new Date();
    const dateStr = now.toISOString().slice(0, 10);
    const rolesData = [];
    for (const jobId of jobIds) {
        const events = ActivityStream.readAll(jobId);
        const startEvent = events.find(e => e.type === 'job:start');
        const roleId = startEvent?.roleId ?? 'unknown';
        const roleName = startEvent?.data?.roleName ?? roleId;
        const doneEvent = events.find(e => e.type === 'job:done' || e.type === 'job:awaiting_input' || e.type === 'job:error');
        const status = doneEvent?.type === 'job:done' ? 'done' : doneEvent?.type === 'job:error' ? 'error' : doneEvent?.type === 'job:awaiting_input' ? 'awaiting_input' : 'unknown';
        // Collect child jobs (dispatched sub-roles)
        const childJobs = [];
        for (const e of events) {
            if (e.type === 'dispatch:start' && e.data.childJobId) {
                const childJobId = e.data.childJobId;
                const targetRoleId = e.data.targetRoleId ?? 'unknown';
                const childEvents = ActivityStream.readAll(childJobId);
                const childDone = childEvents.find(ce => ce.type === 'job:done' || ce.type === 'job:error' || ce.type === 'job:awaiting_input');
                const childStatus = childDone?.type === 'job:done' ? 'done' : childDone?.type === 'job:error' ? 'error' : 'unknown';
                childJobs.push({
                    roleId: targetRoleId,
                    roleName: childEvents.find(ce => ce.type === 'job:start')?.data?.roleName ?? targetRoleId,
                    jobId: childJobId,
                    status: childStatus,
                    events: childEvents,
                });
            }
        }
        rolesData.push({ roleId, roleName, jobId, status, events, childJobs });
    }
    // Write to operations/waves/
    const wavesDir = path.join(COMPANY_ROOT, 'operations', 'waves');
    if (!fs.existsSync(wavesDir)) {
        fs.mkdirSync(wavesDir, { recursive: true });
    }
    // Dedup: if waveId matches an existing file, overwrite instead of creating new
    let baseName;
    if (waveId) {
        const existing = fs.readdirSync(wavesDir).find(f => {
            if (!f.endsWith('.json'))
                return false;
            try {
                const data = JSON.parse(fs.readFileSync(path.join(wavesDir, f), 'utf-8'));
                return data.waveId === waveId || data.id === waveId;
            }
            catch {
                return false;
            }
        });
        baseName = existing ? existing.replace('.json', '') : waveId;
    }
    else {
        const hhmmss = now.toTimeString().slice(0, 8).replace(/:/g, '');
        baseName = `${dateStr.replace(/-/g, '')}-${hhmmss}-wave`;
    }
    const jsonPath = path.join(wavesDir, `${baseName}.json`);
    const waveJson = {
        id: baseName,
        directive,
        startedAt: now.toISOString(),
        duration: 0, // Could be computed from events
        roles: rolesData,
        // D-014: Session references for follow-up
        ...(waveId && { waveId }),
        ...(sessionIds && sessionIds.length > 0 && { sessionIds }),
    };
    fs.writeFileSync(jsonPath, JSON.stringify(waveJson, null, 2), 'utf-8');
    // EC-012: Wave completion bonus (participating roles × 500 coins)
    const roleCount = rolesData.length;
    if (roleCount > 0) {
        try {
            earnCoinsInternal(roleCount * 500, `Wave done: ${roleCount} roles`, `wave:${baseName}`);
        }
        catch { /* non-critical */ }
    }
    jsonResponse(res, 200, { ok: true, path: `operations/waves/${baseName}.json` });
}
/* ─── GET /api/waves/:waveId/stream — SSE multiplexed wave stream (SSE-002) ── */
function handleWaveStream(waveId, url, res, req) {
    const fromMatch = url.match(/[?&]from=(\d+)/);
    const fromWaveSeq = fromMatch ? parseInt(fromMatch[1], 10) : 0;
    // Check if wave has any registered jobs
    const jobIds = waveMultiplexer.getWaveJobIds(waveId);
    if (jobIds.length === 0) {
        res.writeHead(404, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: `No jobs found for wave: ${waveId}` }));
        return;
    }
    // Attach client to multiplexed stream
    // Cast to Express-compatible Response for multiplexer (raw ServerResponse works for write/writeHead)
    const client = waveMultiplexer.attach(waveId, res, fromWaveSeq);
    // Now attach live job subscriptions for all registered jobs
    for (const jobId of jobIds) {
        const job = jobManager.getJob(jobId);
        if (job && (job.status === 'running' || job.status === 'awaiting_input')) {
            waveMultiplexer.attachJobToClient(client, job);
        }
    }
    // Handle client disconnect
    req.on('close', () => {
        waveMultiplexer.detach(waveId, client);
    });
}
/* ═══════════════════════════════════════════════
   Legacy /api/exec/* — kept for backward compat
   Now internally delegates to JobManager where possible
   ═══════════════════════════════════════════════ */
/* ─── Body parser ────────────────────────────── */
function readBody(req) {
    return new Promise((resolve) => {
        let data = '';
        req.on('data', (chunk) => { data += chunk; });
        req.on('end', () => {
            try {
                resolve(JSON.parse(data));
            }
            catch {
                resolve({});
            }
        });
    });
}
/* ─── SSE helpers ────────────────────────────── */
function sendSSE(res, event, data) {
    if (res.destroyed || res.writableEnded)
        return false;
    try {
        res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
        return true;
    }
    catch {
        return false;
    }
}
function jsonResponse(res, status, body) {
    res.writeHead(status, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(body));
}
/** SSE timeout: max duration for a single SSE connection (10 minutes) */
const SSE_TIMEOUT_MS = 10 * 60 * 1000;
/** SSE heartbeat interval (15 seconds) */
const SSE_HEARTBEAT_MS = 15 * 1000;
function startSSE(res) {
    res.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
        'X-Accel-Buffering': 'no',
    });
    res.flushHeaders();
}
/** Start SSE heartbeat + timeout. Returns cleanup function. */
function startSSELifecycle(res, onTimeout) {
    const heartbeat = setInterval(() => {
        if (res.destroyed || res.writableEnded) {
            clearInterval(heartbeat);
            return;
        }
        try {
            res.write(': heartbeat\n\n');
        }
        catch {
            clearInterval(heartbeat);
        }
    }, SSE_HEARTBEAT_MS);
    const timeout = setTimeout(() => {
        console.warn('[SSE] Connection timeout — forcing close');
        onTimeout();
    }, SSE_TIMEOUT_MS);
    return () => {
        clearInterval(heartbeat);
        clearTimeout(timeout);
    };
}
/* ─── POST /api/exec/assign ──────────────────── */
/* Now delegates to JobManager, streams events back via SSE for backward compat */
function handleAssign(body, req, res) {
    const roleId = body.roleId;
    const task = body.task;
    const sourceRole = body.sourceRole || 'ceo';
    const readOnly = body.readOnly === true;
    if (!roleId || !task) {
        jsonResponse(res, 400, { error: 'roleId and task are required' });
        return;
    }
    const orgTree = buildOrgTree(COMPANY_ROOT);
    if (!canDispatchTo(orgTree, sourceRole, roleId)) {
        jsonResponse(res, 403, {
            error: `${sourceRole} cannot dispatch to ${roleId}. Check organization hierarchy.`,
        });
        return;
    }
    // Start job via JobManager (JobManager is source of truth for job status)
    const job = jobManager.startJob({ type: 'assign', roleId, task, sourceRole, readOnly });
    // Bridge: stream job events as legacy SSE format
    startSSE(res);
    sendSSE(res, 'start', { id: job.id, roleId, task, sourceRole });
    const cleanupLifecycle = startSSELifecycle(res, () => {
        roleStatus.set(roleId, 'idle');
        sendSSE(res, 'error', { message: 'SSE timeout — connection forcibly closed after 10 minutes' });
        if (!res.writableEnded)
            res.end();
        job.stream.unsubscribe(subscriber);
    });
    const subscriber = (event) => {
        switch (event.type) {
            case 'text':
                sendSSE(res, 'output', { text: event.data.text });
                break;
            case 'thinking':
                sendSSE(res, 'thinking', { text: event.data.text });
                break;
            case 'tool:start':
                sendSSE(res, 'tool', { name: event.data.name, input: event.data.input });
                break;
            case 'dispatch:start':
                sendSSE(res, 'dispatch', { roleId: event.data.targetRoleId, task: event.data.task, childJobId: event.data.childJobId });
                break;
            case 'turn:complete':
                sendSSE(res, 'turn', { turn: event.data.turn });
                break;
            case 'stderr':
                sendSSE(res, 'stderr', { message: event.data.message });
                break;
            case 'job:done':
                cleanupLifecycle();
                sendSSE(res, 'done', event.data);
                if (!res.writableEnded)
                    res.end();
                job.stream.unsubscribe(subscriber);
                break;
            case 'job:error':
                cleanupLifecycle();
                sendSSE(res, 'error', { message: event.data.message });
                if (!res.writableEnded)
                    res.end();
                job.stream.unsubscribe(subscriber);
                break;
        }
    };
    job.stream.subscribe(subscriber);
    // Client disconnect → unsubscribe only (job keeps running!)
    req.on('close', () => {
        cleanupLifecycle();
        job.stream.unsubscribe(subscriber);
    });
}
/* ─── POST /api/exec/wave ────────────────────── */
function handleWave(body, req, res) {
    const directive = body.directive;
    if (!directive) {
        jsonResponse(res, 400, { error: 'directive is required' });
        return;
    }
    const orgTree = buildOrgTree(COMPANY_ROOT);
    let cLevelRoles = getSubordinates(orgTree, 'ceo');
    // Selective dispatch: filter by targetRoles if provided
    const targetRoles = body.targetRoles;
    if (targetRoles && Array.isArray(targetRoles) && targetRoles.length > 0) {
        const allowed = new Set(targetRoles);
        cLevelRoles = cLevelRoles.filter(r => allowed.has(r));
    }
    if (cLevelRoles.length === 0) {
        jsonResponse(res, 400, { error: 'No C-level roles found to dispatch wave.' });
        return;
    }
    // Resolve full targetRoles scope for re-dispatch filtering
    const fullTargetScope = targetRoles && targetRoles.length > 0 ? targetRoles : undefined;
    // Start a job for EACH C-level role
    const jobs = [];
    for (const cRole of cLevelRoles) {
        const job = jobManager.startJob({
            type: 'wave',
            roleId: cRole,
            task: `[CEO Wave] ${directive}`,
            sourceRole: 'ceo',
            targetRoles: fullTargetScope,
        });
        jobs.push(job);
    }
    // Bridge: stream ALL job events as SSE, close when all done
    startSSE(res);
    sendSSE(res, 'start', {
        ids: jobs.map((j) => j.id),
        directive,
        targetRoles: cLevelRoles,
    });
    let doneCount = 0;
    const subscribers = [];
    for (const job of jobs) {
        const subscriber = (event) => {
            const rolePrefix = job.roleId;
            switch (event.type) {
                case 'text':
                    sendSSE(res, 'output', { roleId: rolePrefix, text: event.data.text });
                    break;
                case 'thinking':
                    sendSSE(res, 'thinking', { roleId: rolePrefix, text: event.data.text });
                    break;
                case 'tool:start':
                    sendSSE(res, 'tool', { roleId: rolePrefix, name: event.data.name, input: event.data.input });
                    break;
                case 'dispatch:start':
                    sendSSE(res, 'dispatch', { roleId: rolePrefix, targetRoleId: event.data.targetRoleId, task: event.data.task, childJobId: event.data.childJobId });
                    break;
                case 'turn:complete':
                    sendSSE(res, 'turn', { roleId: rolePrefix, turn: event.data.turn });
                    break;
                case 'stderr':
                    sendSSE(res, 'stderr', { roleId: rolePrefix, message: event.data.message });
                    break;
                case 'job:done':
                    sendSSE(res, 'role:done', { roleId: rolePrefix, ...event.data });
                    doneCount++;
                    if (doneCount >= jobs.length) {
                        sendSSE(res, 'done', { directive, completedRoles: cLevelRoles });
                        res.end();
                    }
                    break;
                case 'job:error':
                    sendSSE(res, 'role:error', { roleId: rolePrefix, message: event.data.message });
                    doneCount++;
                    if (doneCount >= jobs.length) {
                        sendSSE(res, 'done', { directive, completedRoles: cLevelRoles });
                        res.end();
                    }
                    break;
            }
        };
        job.stream.subscribe(subscriber);
        subscribers.push({ job, sub: subscriber });
    }
    // Client disconnect → unsubscribe all (jobs keep running)
    req.on('close', () => {
        for (const { job, sub } of subscribers) {
            job.stream.unsubscribe(sub);
        }
    });
}
/* ─── GET /api/exec/status ───────────────────── */
function handleStatus(res) {
    const statuses = {};
    // 1. File-backed activity tracker (baseline)
    const fileActivities = getAllActivities();
    for (const activity of fileActivities) {
        statuses[activity.roleId] = activity.status;
    }
    // 2. JobManager running jobs are the source of truth for "working"
    const runningJobs = jobManager.listJobs({ status: 'running' });
    const runningRoles = new Set(runningJobs.map(j => j.roleId));
    // 2b. In-memory roleStatus (includes chat streaming sessions, not just jobs)
    const memoryWorking = new Set();
    for (const [rid, st] of roleStatus.entries()) {
        if (st === 'working')
            memoryWorking.add(rid);
    }
    // 3. Any role marked "working" in file but NOT in JobManager AND NOT in memory → done
    for (const roleId of Object.keys(statuses)) {
        if (statuses[roleId] === 'working' && !runningRoles.has(roleId) && !memoryWorking.has(roleId)) {
            statuses[roleId] = 'done';
            completeActivity(roleId);
        }
    }
    // 4. Running jobs override everything
    for (const job of runningJobs) {
        statuses[job.roleId] = 'working';
    }
    // 5. In-memory working (chat streaming) also overrides
    for (const rid of memoryWorking) {
        statuses[rid] = 'working';
    }
    const activeExecs = runningJobs.map((j) => ({
        id: j.id,
        roleId: j.roleId,
        task: j.task,
        startedAt: j.createdAt,
    }));
    jsonResponse(res, 200, { statuses, activeExecutions: activeExecs });
}
/* ─── POST /api/exec/activity ────────────────── */
function handleActivity(body, res) {
    const roleId = body.roleId;
    const action = body.action;
    if (!roleId || !action) {
        jsonResponse(res, 400, { error: 'roleId and action are required' });
        return;
    }
    switch (action) {
        case 'start':
            setActivity(roleId, body.task ?? '');
            break;
        case 'update':
            updateActivity(roleId, body.output ?? '');
            break;
        case 'complete':
            completeActivity(roleId);
            break;
        default:
            jsonResponse(res, 400, { error: `Unknown action: ${action}` });
            return;
    }
    jsonResponse(res, 200, { ok: true });
}
/* ─── POST /api/exec/session/{id}/message ──── */
function handleSessionMessage(sessionId, body, req, res) {
    const session = getSession(sessionId);
    if (!session) {
        jsonResponse(res, 404, { error: 'Session not found' });
        return;
    }
    const content = body.content;
    const mode = body.mode ?? session.mode;
    const attachments = body.attachments;
    // Allow empty content if there are attachments
    if (!content && (!attachments || attachments.length === 0)) {
        jsonResponse(res, 400, { error: 'content or attachments required' });
        return;
    }
    // Validate attachments if present
    const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5MB
    const SUPPORTED_TYPES = ['image/png', 'image/jpeg', 'image/gif', 'image/webp'];
    if (attachments && attachments.length > 0) {
        for (const att of attachments) {
            if (!SUPPORTED_TYPES.includes(att.mediaType)) {
                jsonResponse(res, 400, { error: `Unsupported image type: ${att.mediaType}` });
                return;
            }
            // Approximate size check (base64 is ~33% larger than binary)
            const approximateSize = (att.data.length * 3) / 4;
            if (approximateSize > MAX_FILE_SIZE) {
                jsonResponse(res, 400, { error: `File too large: ${att.name}. Max 5MB.` });
                return;
            }
        }
    }
    const roleId = session.roleId;
    const readOnly = mode === 'talk';
    const orgTree = buildOrgTree(COMPANY_ROOT);
    if (mode === 'do' && !canDispatchTo(orgTree, 'ceo', roleId)) {
        jsonResponse(res, 403, { error: `CEO cannot dispatch to ${roleId}. Use Talk mode or dispatch via their manager.` });
        return;
    }
    const ceoMsg = {
        id: `msg-${Date.now()}-ceo`,
        from: 'ceo',
        content: content || '',
        type: mode === 'do' ? 'directive' : 'conversation',
        status: 'done',
        timestamp: new Date().toISOString(),
        attachments,
    };
    addMessage(sessionId, ceoMsg);
    const contextWindow = buildConversationContext(session.messages, ceoMsg);
    const fullTask = contextWindow
        ? `${contextWindow}\n[Current Message]\nCEO: ${content || '(image attached)'}`
        : content || '(image attached)';
    const roleMsg = {
        id: `msg-${Date.now() + 1}-role`,
        from: 'role',
        content: '',
        type: 'conversation',
        status: 'streaming',
        timestamp: new Date().toISOString(),
    };
    addMessage(sessionId, roleMsg, true);
    startSSE(res);
    sendSSE(res, 'session', { sessionId, ceoMessageId: ceoMsg.id, roleMessageId: roleMsg.id });
    // SSE lifecycle: heartbeat keeps connection alive, timeout prevents stuck connections
    const cleanupSSELifecycle = startSSELifecycle(res, () => {
        // Timeout reached — force close the SSE connection
        cleanupChildSubscriptions();
        updateMessage(sessionId, roleMsg.id, { status: 'error' });
        roleStatus.set(roleId, 'idle');
        completeActivity(roleId);
        sendSSE(res, 'error', { message: 'SSE timeout — connection forcibly closed after 10 minutes' });
        if (!res.writableEnded)
            res.end();
        handle.abort();
    });
    roleStatus.set(roleId, 'working');
    setActivity(roleId, content.slice(0, 80));
    // Track child job subscriptions for cleanup
    const childSubscriptions = [];
    const pendingDispatches = new Set(); // roleIds we expect child jobs for
    // Watch for child jobs created via dispatch bridge
    const unwatchJobs = jobManager.onJobCreated((childJob) => {
        // Only match jobs for roles we dispatched to from this session
        if (childJob.type !== 'assign')
            return;
        if (roleMsg.status !== 'streaming')
            return;
        if (!pendingDispatches.has(childJob.roleId))
            return;
        pendingDispatches.delete(childJob.roleId);
        const subscriber = (event) => {
            switch (event.type) {
                case 'text':
                    sendSSE(res, 'dispatch:progress', {
                        roleId: event.roleId,
                        type: 'text',
                        text: event.data.text,
                    });
                    break;
                case 'thinking':
                    sendSSE(res, 'dispatch:progress', {
                        roleId: event.roleId,
                        type: 'thinking',
                        text: event.data.text,
                    });
                    break;
                case 'tool:start':
                    sendSSE(res, 'dispatch:progress', {
                        roleId: event.roleId,
                        type: 'tool',
                        name: event.data.name,
                        input: event.data.input,
                    });
                    break;
                case 'job:done':
                    sendSSE(res, 'dispatch:progress', {
                        roleId: event.roleId,
                        type: 'done',
                    });
                    childJob.stream.unsubscribe(subscriber);
                    break;
                case 'job:error':
                    sendSSE(res, 'dispatch:progress', {
                        roleId: event.roleId,
                        type: 'error',
                        message: event.data.message,
                    });
                    childJob.stream.unsubscribe(subscriber);
                    break;
            }
        };
        childJob.stream.subscribe(subscriber);
        childSubscriptions.push({ job: childJob, subscriber });
    });
    // Build team status from running jobs (same as JobManager pattern)
    const teamStatus = {};
    for (const j of jobManager.listJobs({ status: 'running' })) {
        teamStatus[j.roleId] = { status: 'working', task: j.task };
    }
    // Also include roleStatus for roles working via session (not tracked as jobs)
    for (const [rid, status] of roleStatus) {
        if (status === 'working' && rid !== roleId && !teamStatus[rid]) {
            teamStatus[rid] = { status: 'working' };
        }
    }
    const handle = getRunner().execute({ companyRoot: COMPANY_ROOT, roleId, task: fullTask, sourceRole: 'ceo', orgTree, readOnly, model: orgTree.nodes.get(roleId)?.model, attachments, teamStatus }, {
        onText: (text) => {
            roleMsg.content += text;
            updateMessage(sessionId, roleMsg.id, { content: roleMsg.content });
            sendSSE(res, 'output', { text });
        },
        onThinking: (text) => {
            sendSSE(res, 'thinking', { text });
        },
        onToolUse: (name, input) => {
            sendSSE(res, 'tool', { name, input: input ? summarizeInput(input) : undefined });
        },
        onDispatch: (subRoleId, subTask) => {
            roleStatus.set(subRoleId, 'working');
            setActivity(subRoleId, subTask);
            pendingDispatches.add(subRoleId);
            sendSSE(res, 'dispatch', { roleId: subRoleId, task: subTask });
        },
        onTurnComplete: (turn) => {
            sendSSE(res, 'turn', { turn });
        },
        onError: (error) => {
            sendSSE(res, 'stderr', { message: error });
        },
    });
    const cleanupChildSubscriptions = () => {
        unwatchJobs();
        for (const { job, subscriber } of childSubscriptions) {
            job.stream.unsubscribe(subscriber);
        }
        childSubscriptions.length = 0;
    };
    handle.promise
        .then((result) => {
        cleanupSSELifecycle();
        cleanupChildSubscriptions();
        updateMessage(sessionId, roleMsg.id, {
            content: roleMsg.content,
            status: 'done',
            turns: result.turns,
            tokens: result.totalTokens,
        });
        roleStatus.set(roleId, 'idle');
        completeActivity(roleId);
        for (const d of result.dispatches) {
            roleStatus.set(d.roleId, 'idle');
            completeActivity(d.roleId);
        }
        sendSSE(res, 'done', {
            roleMessageId: roleMsg.id,
            output: roleMsg.content.slice(-500),
            turns: result.turns,
            tokens: result.totalTokens,
        });
        if (!res.writableEnded)
            res.end();
    })
        .catch((err) => {
        cleanupSSELifecycle();
        cleanupChildSubscriptions();
        updateMessage(sessionId, roleMsg.id, { status: 'error' });
        roleStatus.set(roleId, 'idle');
        completeActivity(roleId);
        sendSSE(res, 'error', { message: err.message });
        if (!res.writableEnded)
            res.end();
    });
    req.on('close', () => {
        cleanupSSELifecycle();
        cleanupChildSubscriptions();
        if (roleMsg.status === 'streaming') {
            handle.abort();
            updateMessage(sessionId, roleMsg.id, { status: 'error' });
            roleStatus.set(roleId, 'idle');
            completeActivity(roleId);
        }
    });
}
/* ─── Conversation context builder ─────────── */
function buildConversationContext(messages, currentMsg) {
    const history = currentMsg
        ? messages.filter((m) => m.id !== currentMsg.id)
        : messages;
    if (history.length === 0)
        return '';
    const selected = [];
    let totalChars = 0;
    for (let i = history.length - 1; i >= 0; i--) {
        const msg = history[i];
        totalChars += msg.content.length;
        if (selected.length >= 10 || totalChars > 8000)
            break;
        selected.unshift(msg);
    }
    if (selected.length === 0)
        return '';
    const lines = selected.map((m) => {
        const speaker = m.from === 'ceo' ? 'CEO' : m.from.toUpperCase();
        return `${speaker}: ${m.content}`;
    });
    return `[Conversation History]\n${lines.join('\n')}\n`;
}
/* ─── Helpers ────────────────────────────────── */
function summarizeInput(input) {
    const summary = {};
    for (const [key, value] of Object.entries(input)) {
        if (typeof value === 'string' && value.length > 200) {
            summary[key] = value.slice(0, 200) + '...';
        }
        else {
            summary[key] = value;
        }
    }
    return summary;
}
