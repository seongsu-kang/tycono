export declare function findWaveFile(waveId: string): string | null;
export declare function appendFollowUpToWave(waveId: string, sessionId: string, roleId: string, task: string): void;
export declare function updateFollowUpForReply(waveId: string, roleId: string, sessionId: string): void;
export declare function updateFollowUpInWave(waveId: string, sessionId: string, roleId: string): void;
/**
 * Auto-save a completed wave to disk.
 * Called by supervisor-heartbeat when all children are done.
 * Mirrors the logic of handleSaveWave in execute.ts but callable from services.
 */
export declare function saveCompletedWave(waveId: string, directive: string): {
    ok: boolean;
    path?: string;
};
