import { type ActivityEvent } from './activity-stream.js';
import type { Job } from './job-manager.js';
import type { Response } from 'express';
export interface WaveStreamEnvelope {
    /** Wave-level sequence (across all roles) */
    waveSeq: number;
    /** Session this event belongs to */
    sessionId: string;
    /** Original ActivityEvent (unchanged) */
    event: ActivityEvent;
}
interface AttachedJob {
    jobId: string;
    sessionId: string;
    roleId: string;
    unsubscribe: () => void;
}
interface WaveStreamClient {
    res: Response;
    waveSeq: number;
    attachedJobs: Map<string, AttachedJob>;
    heartbeat: ReturnType<typeof setInterval>;
    closed: boolean;
}
declare class WaveMultiplexer {
    /** waveId → set of connected SSE clients */
    private clients;
    /** waveId → set of jobIds belonging to this wave */
    private waveJobs;
    /**
     * Register a job as belonging to a wave.
     * Called when a wave is created or when a child job is dispatched within a wave.
     */
    registerJob(waveId: string, job: Job): void;
    /**
     * Connect a new SSE client to a wave stream.
     * - Replays historical events from all known jobs
     * - Subscribes to live events
     */
    attach(waveId: string, res: Response, fromWaveSeq: number): WaveStreamClient;
    /**
     * Attach a job's activity stream to a client (subscribe to live events)
     */
    attachJobToClient(client: WaveStreamClient, job: Job): void;
    /**
     * Attach a live job to a client (called when new jobs are created during wave execution)
     */
    onJobCreated(job: Job): void;
    /**
     * Disconnect a client from a wave stream
     */
    detach(waveId: string, client: WaveStreamClient): void;
    /**
     * Find waveId for a given jobId
     */
    private findWaveIdForJob;
    /**
     * Check if all jobs in a wave are done, and if so send wave:done
     */
    private checkWaveDone;
    /** Get active client count for a wave */
    getClientCount(waveId: string): number;
    /** Get all registered job IDs for a wave */
    getWaveJobIds(waveId: string): string[];
}
export declare const waveMultiplexer: WaveMultiplexer;
export {};
