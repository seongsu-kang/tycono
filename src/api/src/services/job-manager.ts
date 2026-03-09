import { COMPANY_ROOT } from './file-reader.js';
import { ActivityStream, type ActivityEvent } from './activity-stream.js';
import { buildOrgTree } from '../engine/org-tree.js';
import { validateDispatch, validateConsult } from '../engine/authority-validator.js';
import { createRunner } from '../engine/runners/index.js';
import type { ExecutionRunner } from '../engine/runners/types.js';
import { setActivity, updateActivity, completeActivity } from './activity-tracker.js';
import type { RunnerResult } from '../engine/runners/types.js';
import { estimateCost } from './pricing.js';
import { readConfig, getConversationLimits } from './company-config.js';

/* ─── Types ──────────────────────────────── */

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
}

/* ─── Helpers ────────────────────────────── */

function summarizeInput(input: Record<string, unknown>): Record<string, unknown> {
  const summary: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(input)) {
    if (typeof value === 'string' && value.length > 200) {
      summary[key] = value.slice(0, 200) + '...';
    } else {
      summary[key] = value;
    }
  }
  return summary;
}

/** Detect if output ends with a question (needs CEO response) */
function hasQuestion(output: string): boolean {
  const lastBlock = output.trim().split('\n').slice(-5).join('\n');
  return /\?\s*$/.test(lastBlock) || /할까요|해볼까요|어떨까요|확인.*필요/.test(lastBlock);
}

/**
 * Determine who should respond to a question from this job.
 * Priority: sourceRole (who dispatched) → parentJob's roleId → 'ceo'
 */
function resolveTargetRole(sourceRole: string | undefined, parentJobId: string | undefined, jobs: Map<string, Job>): string {
  // If dispatched by a specific role, that role should answer
  if (sourceRole && sourceRole !== 'ceo') return sourceRole;

  // If there's a parent job, the parent's role is the "senior"
  if (parentJobId) {
    const parentJob = jobs.get(parentJobId);
    if (parentJob && parentJob.roleId !== 'ceo') return parentJob.roleId;
  }

  // Default: CEO
  return 'ceo';
}

/* ─── JobManager Singleton ───────────────── */

class JobManager {
  private jobs = new Map<string, Job>();
  private runner = createRunner();
  private nextId = 1;
  private jobCreatedListeners = new Set<(job: Job) => void>();

  /** Replace the execution runner (e.g. after BYOK setup switches engine). */
  setRunner(newRunner: ExecutionRunner): void {
    this.runner = newRunner;
  }

  /** Recreate runner from current env (call after EXECUTION_ENGINE changes). */
  refreshRunner(): void {
    this.runner = createRunner();
  }

  /** Register a listener for new job creation. Returns unsubscribe function. */
  onJobCreated(listener: (job: Job) => void): () => void {
    this.jobCreatedListeners.add(listener);
    return () => { this.jobCreatedListeners.delete(listener); };
  }

  /** Start a new execution job. Returns the Job immediately (fire-and-forget).
   *  Throws if sourceRole lacks authority to dispatch/consult the target role. */
  startJob(params: StartJobParams): Job {
    const jobId = `job-${Date.now()}-${this.nextId++}`;
    const orgTree = buildOrgTree(COMPANY_ROOT);

    // Authority gate: validate dispatch/consult authority at job creation
    if (params.sourceRole && params.sourceRole !== 'ceo') {
      if (params.type === 'consult') {
        const auth = validateConsult(orgTree, params.sourceRole, params.roleId);
        if (!auth.allowed) {
          console.warn(`[JobManager] Authority denied: ${params.sourceRole} → ${params.roleId} (consult): ${auth.reason}`);
          throw new Error(`Authority denied: ${auth.reason}`);
        }
      } else if (params.type === 'assign' && params.parentJobId) {
        // Only validate dispatch authority for child jobs (not CEO waves)
        const auth = validateDispatch(orgTree, params.sourceRole, params.roleId);
        if (!auth.allowed) {
          console.warn(`[JobManager] Authority denied: ${params.sourceRole} → ${params.roleId} (dispatch): ${auth.reason}`);
          throw new Error(`Authority denied: ${auth.reason}`);
        }
      }
    }

    const stream = new ActivityStream(jobId, params.roleId, params.parentJobId);

    const job: Job = {
      id: jobId,
      type: params.type,
      roleId: params.roleId,
      task: params.task,
      status: 'running',
      stream,
      abort: () => {},
      parentJobId: params.parentJobId,
      childJobIds: [],
      createdAt: new Date().toISOString(),
    };

    this.jobs.set(jobId, job);

    // Emit job:start
    stream.emit('job:start', params.roleId, {
      jobId,
      type: params.type,
      task: params.task,
      sourceRole: params.sourceRole ?? 'ceo',
    });

    // If this job has a parent, emit dispatch:start on the parent's stream
    // so the Wave Command Center can track this child job.
    if (params.parentJobId) {
      const parentJob = this.jobs.get(params.parentJobId);
      if (parentJob) {
        parentJob.childJobIds.push(jobId);
        parentJob.stream.emit('dispatch:start', parentJob.roleId, {
          targetRoleId: params.roleId,
          task: params.task,
          childJobId: jobId,
        });
      }
    }

    // Set activity tracker
    setActivity(params.roleId, params.task);

    const model = params.model ?? orgTree.nodes.get(params.roleId)?.model;

    // ─── Harness-level conversation limits ───
    const config = readConfig(COMPANY_ROOT);
    const limits = getConversationLimits(config);
    let harnessTurnCount = 0;
    let softLimitWarned = false;
    let hardLimitReached = false;

    // Build team status snapshot: which roles are currently busy
    const teamStatus: Record<string, { status: string; task?: string }> = {};
    for (const [, j] of this.jobs) {
      if (j.status === 'running' && j.id !== jobId) {
        teamStatus[j.roleId] = { status: 'working', task: j.task };
      }
    }

    const handle = this.runner.execute(
      {
        companyRoot: COMPANY_ROOT,
        roleId: params.roleId,
        task: params.task,
        sourceRole: params.sourceRole ?? 'ceo',
        orgTree,
        readOnly: params.readOnly,
        maxTurns: limits.hardLimit,  // Runner backup safety net = Harness hardLimit
        model,
        jobId,
        teamStatus,
      },
      {
        onText: (text) => {
          updateActivity(params.roleId, text);
          stream.emit('text', params.roleId, { text });
        },
        onThinking: (text) => {
          stream.emit('thinking', params.roleId, { text });
        },
        onToolUse: (name, input) => {
          stream.emit('tool:start', params.roleId, {
            name,
            input: input ? summarizeInput(input) : undefined,
          });
        },
        onDispatch: (subRoleId, subTask) => {
          // Create child job — startJob() auto-emits dispatch:start
          // on parent stream when parentJobId is set.
          this.startJob({
            type: 'assign',
            roleId: subRoleId,
            task: subTask,
            sourceRole: params.roleId,
            parentJobId: jobId,
          });
        },
        onConsult: (subRoleId, question) => {
          // Create child job in read-only mode for consultation
          this.startJob({
            type: 'consult',
            roleId: subRoleId,
            task: `[Consultation from ${params.roleId}] ${question}\n\nAnswer this question based on your role's expertise and knowledge. Be concise and specific.`,
            sourceRole: params.roleId,
            readOnly: true,
            parentJobId: jobId,
          });
        },
        onTurnComplete: (turn) => {
          // ─── Harness-level turn policy ───
          // Runner reports its internal turn count; Harness tracks independently.
          harnessTurnCount++;
          stream.emit('turn:complete', params.roleId, {
            turn: harnessTurnCount,
            runnerTurn: turn,
          });

          // softLimit: 경고 이벤트 (향후 "계속?" UX)
          if (!softLimitWarned && harnessTurnCount >= limits.softLimit) {
            softLimitWarned = true;
            console.warn(
              `[Harness] Job ${jobId} (${params.roleId}): turn ${harnessTurnCount} reached softLimit (${limits.softLimit})`,
            );
            stream.emit('turn:warning', params.roleId, {
              turn: harnessTurnCount,
              softLimit: limits.softLimit,
              hardLimit: limits.hardLimit,
            });
          }

          // hardLimit: 중단 후 선임에게 계속 여부 확인
          if (harnessTurnCount >= limits.hardLimit) {
            hardLimitReached = true;
            console.warn(
              `[Harness] Job ${jobId} (${params.roleId}): turn ${harnessTurnCount} reached hardLimit (${limits.hardLimit}). Pausing for approval.`,
            );
            stream.emit('turn:limit', params.roleId, {
              turn: harnessTurnCount,
              hardLimit: limits.hardLimit,
            });
            handle.abort();
          }
        },
        onError: (error) => {
          stream.emit('stderr', params.roleId, { message: error });
        },
      },
    );

    job.abort = handle.abort;

    // Notify listeners
    for (const listener of this.jobCreatedListeners) {
      try { listener(job); } catch { /* ignore */ }
    }

    handle.promise
      .then((result: RunnerResult) => {
        job.result = result;

        for (const d of result.dispatches) {
          completeActivity(d.roleId);
        }

        const costUsd = estimateCost(
          result.totalTokens.input,
          result.totalTokens.output,
          model ?? '',
        );

        const doneData = {
          output: result.output.slice(-1000),
          turns: result.turns,
          tokens: result.totalTokens,
          costUsd,
          toolCalls: result.toolCalls.length,
          dispatches: result.dispatches.map((d) => ({ roleId: d.roleId, task: d.task })),
        };

        const targetRole = resolveTargetRole(params.sourceRole, params.parentJobId, this.jobs);

        // hardLimit reached → ask senior/CEO for approval to continue
        if (hardLimitReached) {
          job.status = 'awaiting_input';
          job.targetRole = targetRole;
          const question = `[Turn limit] ${harnessTurnCount}턴 도달 (hardLimit: ${limits.hardLimit}). 계속 진행할까요?`;
          stream.emit('job:awaiting_input', params.roleId, {
            ...doneData,
            question,
            awaitingInput: true,
            targetRole,
            reason: 'turn_limit',
          });
        }
        // Check if output ends with a question → awaiting_input
        // Skip for continuation jobs (already replied once — avoid infinite loop)
        else if (!params.isContinuation && hasQuestion(result.output)) {
          job.status = 'awaiting_input';
          job.targetRole = targetRole;
          stream.emit('job:awaiting_input', params.roleId, {
            ...doneData,
            question: result.output.trim().split('\n').slice(-5).join('\n'),
            awaitingInput: true,
            targetRole,
          });
        } else {
          job.status = 'done';
          completeActivity(params.roleId);
          stream.emit('job:done', params.roleId, doneData);
        }
      })
      .catch((err: Error) => {
        // hardLimit abort → awaiting_input instead of error
        if (hardLimitReached) {
          const targetRole = resolveTargetRole(params.sourceRole, params.parentJobId, this.jobs);
          job.status = 'awaiting_input';
          job.targetRole = targetRole;
          const question = `[Turn limit] ${harnessTurnCount}턴 도달 (hardLimit: ${limits.hardLimit}). 계속 진행할까요?`;
          stream.emit('job:awaiting_input', params.roleId, {
            question,
            awaitingInput: true,
            targetRole,
            reason: 'turn_limit',
          });
          return;
        }

        job.status = 'error';
        job.error = err.message;
        completeActivity(params.roleId);

        stream.emit('job:error', params.roleId, { message: err.message });
      });

    return job;
  }

  /** Get a job by ID (in-memory or reconstruct from file) */
  getJob(id: string): Job | undefined {
    return this.jobs.get(id);
  }

  /** Get job info (safe to serialize) */
  getJobInfo(id: string): JobInfo | undefined {
    const job = this.jobs.get(id);
    if (!job) {
      // Check if we have a JSONL file for it (historical)
      if (ActivityStream.exists(id)) {
        const events = ActivityStream.readAll(id);
        const startEvent = events.find(e => e.type === 'job:start');
        const doneEvent = events.find(e => e.type === 'job:done');
        const errorEvent = events.find(e => e.type === 'job:error');
        const awaitingEvent = events.find(e => e.type === 'job:awaiting_input');
        const dispatchEvents = events.filter(e => e.type === 'dispatch:start');

        if (startEvent) {
          const status: JobStatus = awaitingEvent && !doneEvent ? 'awaiting_input'
            : doneEvent ? 'done'
            : errorEvent ? 'error'
            : 'done';
          return {
            id,
            type: (startEvent.data.type as string ?? 'assign') as JobType,
            roleId: startEvent.roleId,
            task: startEvent.data.task as string ?? '',
            status,
            parentJobId: startEvent.data.parentJobId as string | undefined,
            childJobIds: dispatchEvents.map(e => e.data.childJobId as string).filter(Boolean),
            createdAt: startEvent.ts,
          };
        }
      }
      return undefined;
    }
    return {
      id: job.id,
      type: job.type,
      roleId: job.roleId,
      task: job.task,
      status: job.status,
      parentJobId: job.parentJobId,
      childJobIds: job.childJobIds,
      createdAt: job.createdAt,
      targetRole: job.targetRole,
    };
  }

  /** List jobs with optional filter */
  listJobs(filter?: { status?: JobStatus; roleId?: string }): JobInfo[] {
    const result: JobInfo[] = [];

    for (const job of this.jobs.values()) {
      if (filter?.status && job.status !== filter.status) continue;
      if (filter?.roleId && job.roleId !== filter.roleId) continue;
      result.push({
        id: job.id,
        type: job.type,
        roleId: job.roleId,
        task: job.task,
        status: job.status,
        parentJobId: job.parentJobId,
        childJobIds: job.childJobIds,
        createdAt: job.createdAt,
        targetRole: job.targetRole,
      });
    }

    return result;
  }

  /** Abort a running or awaiting_input job */
  abortJob(id: string): boolean {
    const job = this.jobs.get(id);
    if (!job || (job.status !== 'running' && job.status !== 'awaiting_input')) return false;

    if (job.status === 'running') job.abort();
    job.status = 'error';
    job.error = 'Aborted by user';
    completeActivity(job.roleId);
    job.stream.emit('job:error', job.roleId, { message: 'Aborted by user' });
    return true;
  }

  /** Reply to an awaiting_input job → creates a continuation job */
  replyToJob(id: string, response: string, responderRole?: string): Job | null {
    const job = this.jobs.get(id);
    if (!job || job.status !== 'awaiting_input') return null;

    const effectiveResponder = responderRole ?? job.targetRole ?? 'ceo';

    // Mark previous job as done (don't emit job:done — the stream stays open
    // for the continuation job which will emit its own job:done when finished)
    job.status = 'done';
    completeActivity(job.roleId);
    job.stream.emit('job:reply', job.roleId, { response, responderRole: effectiveResponder });

    // Build continuation prompt with previous context
    const prevOutput = job.result?.output ?? '';
    const contextSummary = prevOutput.length > 2000
      ? prevOutput.slice(-2000)
      : prevOutput;

    // Use the actual responder role name in the prompt
    const responderLabel = effectiveResponder === 'ceo' ? 'CEO' : effectiveResponder.toUpperCase();
    const continuationTask = `[Continuation — previous output follows]\n${contextSummary}\n\n[${responderLabel} Response]\n${response}`;

    // Create new job for same role (mark as continuation to skip question detection)
    const newJob = this.startJob({
      type: job.type,
      roleId: job.roleId,
      task: continuationTask,
      sourceRole: effectiveResponder,
      parentJobId: job.id,
      isContinuation: true,
    });

    job.childJobIds.push(newJob.id);
    return newJob;
  }

  /** Get the active (running) job for a given role */
  getActiveJobForRole(roleId: string): Job | undefined {
    for (const job of this.jobs.values()) {
      if (job.roleId === roleId && job.status === 'running') {
        return job;
      }
    }
    return undefined;
  }
}

/* ─── Export singleton ───────────────────── */

export const jobManager = new JobManager();
