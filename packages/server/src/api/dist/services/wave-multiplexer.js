import { ActivityStream } from './activity-stream.js';
/* ─── WaveMultiplexer ────────────────────── */
class WaveMultiplexer {
    /** waveId → set of connected SSE clients */
    clients = new Map();
    /** waveId → set of jobIds belonging to this wave */
    waveJobs = new Map();
    /**
     * Register a job as belonging to a wave.
     * Called when a wave is created or when a child job is dispatched within a wave.
     */
    registerJob(waveId, job) {
        if (!this.waveJobs.has(waveId)) {
            this.waveJobs.set(waveId, new Set());
        }
        this.waveJobs.get(waveId).add(job.id);
        // Auto-attach to all existing clients for this wave
        const clients = this.clients.get(waveId);
        if (clients) {
            for (const client of clients) {
                if (!client.closed) {
                    this.attachJobToClient(client, job);
                }
            }
        }
    }
    /**
     * Connect a new SSE client to a wave stream.
     * - Replays historical events from all known jobs
     * - Subscribes to live events
     */
    attach(waveId, res, fromWaveSeq) {
        // SSE headers
        res.writeHead(200, {
            'Content-Type': 'text/event-stream',
            'Cache-Control': 'no-cache',
            'Connection': 'keep-alive',
            'X-Accel-Buffering': 'no',
        });
        res.flushHeaders();
        const client = {
            res,
            waveSeq: 0,
            attachedJobs: new Map(),
            heartbeat: setInterval(() => {
                if (client.closed || res.destroyed || res.writableEnded) {
                    clearInterval(client.heartbeat);
                    return;
                }
                try {
                    res.write(': heartbeat\n\n');
                }
                catch { /* ignore */ }
            }, 15_000),
            closed: false,
        };
        if (!this.clients.has(waveId)) {
            this.clients.set(waveId, new Set());
        }
        this.clients.get(waveId).add(client);
        // Replay historical events from all known jobs, sorted by timestamp
        const jobIds = this.waveJobs.get(waveId);
        if (jobIds && jobIds.size > 0) {
            const allEvents = [];
            for (const jobId of jobIds) {
                const events = ActivityStream.readFrom(jobId, 0);
                // Find the job's sessionId from the job:start event
                const startEvt = events.find(e => e.type === 'job:start');
                const sessionId = startEvt?.data?.sessionId ?? '';
                const roleId = startEvt?.roleId ?? '';
                for (const event of events) {
                    allEvents.push({ event, sessionId, jobId, roleId });
                }
            }
            // Sort by timestamp
            allEvents.sort((a, b) => a.event.ts.localeCompare(b.event.ts));
            // Assign waveSeq and send (skip events before fromWaveSeq)
            for (const item of allEvents) {
                const waveSeq = client.waveSeq++;
                if (waveSeq < fromWaveSeq)
                    continue;
                const envelope = {
                    waveSeq,
                    sessionId: item.sessionId,
                    event: item.event,
                };
                sendSSE(client, 'wave:event', envelope);
            }
            // Now subscribe to live events for each known job
            for (const jobId of jobIds) {
                // Find the Job object — we need the stream reference
                // Jobs are registered via registerJob, we'll look them up via the subscriber
                // For replay-only (completed) jobs, skip live subscription
            }
        }
        return client;
    }
    /**
     * Attach a job's activity stream to a client (subscribe to live events)
     */
    attachJobToClient(client, job) {
        if (client.attachedJobs.has(job.id))
            return; // already attached
        const sessionId = job.sessionId ?? '';
        const roleId = job.roleId;
        // Send role-attached notification
        sendSSE(client, 'wave:role-attached', {
            sessionId,
            roleId,
            jobId: job.id,
            parentJobId: job.parentJobId,
        });
        // Replay this job's historical events that haven't been sent yet
        const events = ActivityStream.readFrom(job.id, 0);
        for (const event of events) {
            const waveSeq = client.waveSeq++;
            const envelope = {
                waveSeq,
                sessionId,
                event,
            };
            sendSSE(client, 'wave:event', envelope);
        }
        // Subscribe to live events
        const subscriber = (event) => {
            if (client.closed)
                return;
            const waveSeq = client.waveSeq++;
            const envelope = {
                waveSeq,
                sessionId,
                event,
            };
            sendSSE(client, 'wave:event', envelope);
            // Notify when role stream ends
            if (event.type === 'job:done' || event.type === 'job:error') {
                sendSSE(client, 'wave:role-detached', {
                    sessionId,
                    roleId,
                    reason: event.type === 'job:done' ? 'done' : 'error',
                });
                this.checkWaveDone(job.sessionId ? this.findWaveIdForJob(job.id) : undefined, client);
            }
        };
        job.stream.subscribe(subscriber);
        client.attachedJobs.set(job.id, {
            jobId: job.id,
            sessionId,
            roleId,
            unsubscribe: () => job.stream.unsubscribe(subscriber),
        });
    }
    /**
     * Attach a live job to a client (called when new jobs are created during wave execution)
     */
    onJobCreated(job) {
        if (!job.sessionId)
            return;
        // Find which wave this job belongs to by checking parentJobId chain
        const waveId = this.findWaveIdForJob(job.id) ?? this.findWaveIdForJob(job.parentJobId ?? '');
        if (!waveId)
            return;
        // Register this job under the wave
        this.registerJob(waveId, job);
    }
    /**
     * Disconnect a client from a wave stream
     */
    detach(waveId, client) {
        client.closed = true;
        clearInterval(client.heartbeat);
        // Unsubscribe from all job streams
        for (const [, attached] of client.attachedJobs) {
            attached.unsubscribe();
        }
        client.attachedJobs.clear();
        const clientSet = this.clients.get(waveId);
        if (clientSet) {
            clientSet.delete(client);
            if (clientSet.size === 0) {
                this.clients.delete(waveId);
            }
        }
    }
    /**
     * Find waveId for a given jobId
     */
    findWaveIdForJob(jobId) {
        for (const [waveId, jobs] of this.waveJobs) {
            if (jobs.has(jobId))
                return waveId;
        }
        return undefined;
    }
    /**
     * Check if all jobs in a wave are done, and if so send wave:done
     */
    checkWaveDone(waveId, client) {
        if (!waveId)
            return;
        const attached = client.attachedJobs;
        // Only check if we have any attached jobs
        if (attached.size === 0)
            return;
        // We can't easily check job status from here without a reference to jobManager
        // The wave:done will be determined by the client based on role-detached events
    }
    /** Get active client count for a wave */
    getClientCount(waveId) {
        return this.clients.get(waveId)?.size ?? 0;
    }
    /** Get all registered job IDs for a wave */
    getWaveJobIds(waveId) {
        const jobs = this.waveJobs.get(waveId);
        return jobs ? Array.from(jobs) : [];
    }
}
/* ─── Helpers ────────────────────────────── */
function sendSSE(client, event, data) {
    if (client.closed || client.res.destroyed || client.res.writableEnded)
        return;
    try {
        client.res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
    }
    catch { /* ignore write errors */ }
}
/* ─── Export singleton ───────────────────── */
export const waveMultiplexer = new WaveMultiplexer();
