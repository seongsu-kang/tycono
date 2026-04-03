import { ActivityStream } from './activity-stream.js';
import type { ExecutionRunner } from '../engine/runners/types.js';
import type { RunnerResult } from '../engine/runners/types.js';
import { type KnowledgeDebtItem } from '../engine/knowledge-gate.js';
import { type ImageAttachment } from './session-store.js';
import { type PortAllocation } from './port-registry.js';
export type ExecStatus = 'idle' | 'running' | 'done' | 'error' | 'awaiting_input' | 'interrupted';
export type ExecType = 'assign' | 'wave' | 'consult';
export { canTransition, messageStatusToRoleStatus } from '../../../shared/types.js';
export interface Execution {
    id: string;
    sessionId: string;
    type: ExecType;
    roleId: string;
    task: string;
    status: ExecStatus;
    stream: ActivityStream;
    abort: () => void;
    parentSessionId?: string;
    childSessionIds: string[];
    createdAt: string;
    result?: RunnerResult;
    error?: string;
    targetRole?: string;
    targetRoles?: string[];
    knowledgeDebt?: KnowledgeDebtItem[];
    ports?: PortAllocation;
    traceId?: string;
    /** CLI session ID for --resume (captured from Claude CLI result event) */
    cliSessionId?: string;
}
export interface StartExecutionParams {
    type: ExecType;
    roleId: string;
    task: string;
    sourceRole?: string;
    readOnly?: boolean;
    parentSessionId?: string;
    model?: string;
    isContinuation?: boolean;
    targetRoles?: string[];
    sessionId: string;
    attachments?: ImageAttachment[];
    /** CLI session ID for --resume (context continuity across turn limits) */
    cliSessionId?: string;
}
declare class ExecutionManager {
    private executions;
    private runner;
    private nextId;
    private executionCreatedListeners;
    private pendingAmendments;
    setRunner(newRunner: ExecutionRunner): void;
    refreshRunner(): void;
    onExecutionCreated(listener: (exec: Execution) => void): () => void;
    startExecution(params: StartExecutionParams): Execution;
    private initializeAndRunExecution;
    /** Debug: return memory stats for monitoring */
    getMemoryStats(): {
        executions: number;
        msgContentKeys: number;
        msgContentSize: number;
    };
    private sessionMsgContent;
    private updateSessionRoleMessage;
    private embedSessionEvent;
    private finalizeSessionMessage;
    private cleanupOrphanedChildren;
    /**
     * Get children of a parent session that are still running.
     * Public for supervisor heartbeat done-guard (Principle 5).
     */
    getRunningChildren(parentSessionId: string): Execution[];
    /**
     * SV: Crash Recovery — C-Level이 죽었는데 부하가 아직 실행 중이면 자동 재시작.
     * "죽으면 오히려 이거하라고 다시 깨우는거야" (CEO 결정, 2026-03-14)
     */
    private attemptSupervisionRecovery;
    getExecution(id: string): Execution | undefined;
    getActiveExecution(sessionId: string): Execution | undefined;
    /** Find the latest completed execution for a session (for auto-amend lookup) */
    getCompletedExecution(sessionId: string): {
        task: string;
        cliSessionId?: string;
    } | undefined;
    listExecutions(filter?: {
        status?: ExecStatus;
        roleId?: string;
        active?: boolean;
    }): Array<{
        id: string;
        type: ExecType;
        roleId: string;
        task: string;
        status: ExecStatus;
        parentSessionId?: string;
        childSessionIds: string[];
        createdAt: string;
        targetRole?: string;
    }>;
    abortSession(sessionId: string): boolean;
    /** Also support aborting by execution ID for internal use */
    abortExecution(execId: string): boolean;
    continueSession(sessionId: string, response: string, responderRole?: string): Execution | null;
    /**
     * Queue an amendment for a running session.
     * Will be processed when the current execution completes.
     */
    queueAmendment(sessionId: string, task: string): void;
    /**
     * Process pending amendments after execution completes.
     * Called from finalization logic.
     */
    processPendingAmendments(sessionId: string): void;
    getActiveExecutionForRole(roleId: string): Execution | undefined;
    private recoverExecutionFromStream;
    private reconstructExecution;
}
export declare const executionManager: ExecutionManager;
/** Backward-compat alias for gradual migration */
export declare const jobManager: ExecutionManager;
