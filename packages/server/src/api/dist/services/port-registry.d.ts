export interface PortAllocation {
    api: number;
    vite: number;
    hmr?: number;
}
export interface SessionPort {
    sessionId: string;
    roleId: string;
    task: string;
    ports: PortAllocation;
    worktreePath?: string;
    pid?: number;
    startedAt: string;
    status: 'active' | 'idle' | 'dead';
}
declare class PortRegistry {
    /** Allocate ports for a new session */
    allocate(sessionId: string, roleId: string, task: string): Promise<PortAllocation>;
    /** Release ports when a session ends */
    release(sessionId: string): boolean;
    /** Update session info (e.g., set PID, worktree path) */
    update(sessionId: string, patch: Partial<Pick<SessionPort, 'pid' | 'worktreePath' | 'status' | 'task'>>): boolean;
    /** Get all sessions */
    getAll(): SessionPort[];
    /** Get a specific session */
    get(sessionId: string): SessionPort | null;
    /** Detect and clean up dead sessions (PID gone) */
    cleanup(): {
        cleaned: SessionPort[];
        remaining: SessionPort[];
    };
    /** Get summary stats */
    getSummary(): {
        active: number;
        totalPorts: number;
    };
}
export declare const portRegistry: PortRegistry;
export {};
