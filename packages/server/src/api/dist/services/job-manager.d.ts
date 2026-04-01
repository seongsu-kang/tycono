import { ActivityStream } from './activity-stream.js';
import type { ExecutionRunner } from '../engine/runners/types.js';
import type { RunnerResult } from '../engine/runners/types.js';
import { type KnowledgeDebtItem } from '../engine/knowledge-gate.js';
import { type ImageAttachment } from './session-store.js';
import { type PortAllocation } from './port-registry.js';
export type JobType = 'assign' | 'wave' | 'session-message' | 'consult';
export type JobStatus = 'running' | 'done' | 'error' | 'awaiting_input';
export interface Job {
    id: string;
    type: JobType;
    roleId: string;
    task: string;
    status: JobStatus;
    stream: ActivityStream;
    abort: () => void;
    parentJobId?: string;
    childJobIds: string[];
    createdAt: string;
    result?: RunnerResult;
    error?: string;
    /** Which role should respond when status is awaiting_input */
    targetRole?: string;
    /** Selective dispatch scope — only these roles can be dispatched to */
    targetRoles?: string[];
    /** Knowledge debt items detected by Post-Knowledging check */
    knowledgeDebt?: KnowledgeDebtItem[];
    /** D-014: Session this job belongs to */
    sessionId?: string;
    /** PSM-003: Allocated ports for this job's dev servers */
    ports?: PortAllocation;
}
export interface JobInfo {
    id: string;
    type: JobType;
    roleId: string;
    task: string;
    status: JobStatus;
    parentJobId?: string;
    childJobIds: string[];
    createdAt: string;
    /** Which role should respond when status is awaiting_input */
    targetRole?: string;
    /** Final output text (available when status is done) */
    output?: string;
}
export interface StartJobParams {
    type: JobType;
    roleId: string;
    task: string;
    sourceRole?: string;
    readOnly?: boolean;
    parentJobId?: string;
    model?: string;
    /** If true, this is a continuation from CEO reply — skip question detection */
    isContinuation?: boolean;
    /** Selective dispatch: only these roles are allowed as dispatch targets */
    targetRoles?: string[];
    /** D-014: Link this job to a session (internal tracking) */
    sessionId?: string;
    /** Image attachments (base64 encoded) */
    attachments?: ImageAttachment[];
}
declare class JobManager {
    private jobs;
    private runner;
    private nextId;
    private jobCreatedListeners;
    /** Replace the execution runner (e.g. after BYOK setup switches engine). */
    setRunner(newRunner: ExecutionRunner): void;
    /** Recreate runner from current env (call after EXECUTION_ENGINE changes). */
    refreshRunner(): void;
    /** Register a listener for new job creation. Returns unsubscribe function. */
    onJobCreated(listener: (job: Job) => void): () => void;
    /** Start a new execution job. Returns the Job immediately (fire-and-forget).
     *  Throws if sourceRole lacks authority to dispatch/consult the target role. */
    startJob(params: StartJobParams): Job;
    /** PSM-003: Initialize job with port allocation, then start runner */
    private initializeAndRunJob;
    /** Accumulated text content for session messages linked to jobs */
    private sessionMsgContent;
    /** Update session role message content as text streams in */
    private updateSessionRoleMessage;
    /** Embed an activity event into the session message linked to this job (SCA-010) */
    private embedSessionEvent;
    /** Finalize session message when job completes or errors */
    private finalizeSessionMessage;
    /** Cleanup orphaned child jobs when parent completes */
    private cleanupOrphanedChildren;
    /** Get a job by ID (in-memory or reconstruct from file) */
    getJob(id: string): Job | undefined;
    /** Get job info (safe to serialize) */
    getJobInfo(id: string): JobInfo | undefined;
    /** List jobs with optional filter */
    listJobs(filter?: {
        status?: JobStatus;
        roleId?: string;
    }): JobInfo[];
    /** Abort a running or awaiting_input job */
    abortJob(id: string): boolean;
    /** Reply to an awaiting_input or done job → creates a continuation job */
    replyToJob(id: string, response: string, responderRole?: string): Job | null;
    /** Get the active (running) job for a given role */
    getActiveJobForRole(roleId: string): Job | undefined;
    /** SCA-011: Find the most recent job linked to a session */
    getJobBySessionId(sessionId: string): Job | undefined;
    /** Recover a minimal Job object from activity stream files (after server restart) */
    private recoverJobFromStreams;
}
export declare const jobManager: JobManager;
export {};
