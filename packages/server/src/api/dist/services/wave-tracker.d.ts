export declare function findWaveFile(waveId: string): string | null;
export declare function appendFollowUpToWave(waveId: string, jobId: string, roleId: string, task: string, sessionId?: string): void;
export declare function updateFollowUpForReply(waveId: string, roleId: string, oldJobId: string | undefined, newJobId: string, sessionId?: string): void;
export declare function updateFollowUpInWave(waveId: string, jobId: string, roleId: string): void;
