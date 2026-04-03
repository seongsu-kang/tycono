import { type ActivityEvent } from './activity-stream.js';
import type { Execution } from './execution-manager.js';
import type { Response } from 'express';
export interface WaveStreamEnvelope {
    waveId: string;
    waveSeq: number;
    sessionId: string;
    roleId: string;
    event: ActivityEvent;
}
interface AttachedSession {
    sessionId: string;
    roleId: string;
    executionId: string;
    unsubscribe: () => void;
}
interface WaveStreamClient {
    res: Response;
    waveSeq: number;
    attachedSessions: Map<string, AttachedSession>;
    sentEvents: Set<string>;
    heartbeat: ReturnType<typeof setInterval>;
    closed: boolean;
}
declare class WaveMultiplexer {
    private clients;
    private waveSessions;
    registerSession(waveId: string, execution: Execution): void;
    attach(waveId: string, res: Response, fromWaveSeq: number): WaveStreamClient;
    private subscribeSessionToClient;
    onExecutionCreated(execution: Execution): void;
    /** Remove completed wave sessions from memory.
     *  Keep SSE clients registered — they persist until connection closes.
     *  When the wave restarts (new directive), registerSession will resubscribe them. */
    cleanupWave(waveId: string): void;
    detach(waveId: string, client: WaveStreamClient): void;
    private findWaveIdForSession;
    getWaveSessionIds(waveId: string): string[];
    getActiveWaves(): Array<{
        id: string;
        directive: string;
        dispatches: Array<{
            sessionId: string;
            roleId: string;
            roleName: string;
            status: string;
            approvalNeeded?: boolean;
            approvalQuestion?: string;
        }>;
        startedAt: number;
        sessionIds: string[];
    }>;
}
export declare const waveMultiplexer: WaveMultiplexer;
export {};
