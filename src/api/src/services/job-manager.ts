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
import { postKnowledgingCheck, type KnowledgeDebtItem } from '../engine/knowledge-gate.js';
import { earnCoinsInternal } from '../routes/coins.js';
import { getSession, createSession, addMessage, updateMessage as updateSessionMessage, appendMessageEvent, type Message } from './session-store.js';

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
  /** Selective dispatch scope — only these roles can be dispatched to */
  targetRoles?: string[];
  /** Knowledge debt items detected by Post-Knowledging check */
  knowledgeDebt?: KnowledgeDebtItem[];
  /** D-014: Session this job belongs to */
  sessionId?: string;
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
      targetRoles: params.targetRoles,
      sessionId: params.sessionId,
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
          childSessionId: params.sessionId,
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
        maxTurns: limits.hardLimit,
        model,
        jobId,
        teamStatus,
        targetRoles: params.targetRoles,
        codeRoot: config.codeRoot,
      },
      {
        onText: (text) => {
          updateActivity(params.roleId, text);
          stream.emit('text', params.roleId, { text });
          // D-014: Update linked session message content
          if (job.sessionId) {
            this.updateSessionRoleMessage(job, text);
          }
        },
        onThinking: (text) => {
          stream.emit('thinking', params.roleId, { text });
          // D-014 SCA-010: Embed thinking event in session message
          if (job.sessionId) {
            this.embedSessionEvent(job, 'thinking', { text: text.slice(0, 200) });
          }
        },
        onToolUse: (name, input) => {
          stream.emit('tool:start', params.roleId, {
            name,
            input: input ? summarizeInput(input) : undefined,
          });
          // D-014 SCA-010: Embed tool event in session message
          if (job.sessionId) {
            this.embedSessionEvent(job, 'tool:start', {
              name,
              input: input ? summarizeInput(input) : undefined,
            });
          }
        },
        onDispatch: (subRoleId, subTask) => {
          // 2-layer defense: block dispatch to roles outside targetRoles scope
          if (params.targetRoles && params.targetRoles.length > 0) {
            if (!params.targetRoles.includes(subRoleId)) {
              console.warn(`[JobManager] Dispatch blocked: ${params.roleId} → ${subRoleId} (not in targetRoles)`);
              stream.emit('stderr', params.roleId, {
                message: `Dispatch to ${subRoleId} blocked — not in active target scope for this wave.`,
              });
              return;
            }
          }
          // Create session for child dispatch
          const childSession = createSession(subRoleId, {
            mode: 'do',
            source: 'dispatch',
          });
          // Add directive as CEO message in child session
          const dispatchMsg: Message = {
            id: `msg-${Date.now()}-dispatch-${subRoleId}`,
            from: 'ceo',
            content: subTask,
            type: 'directive',
            status: 'done',
            timestamp: new Date().toISOString(),
          };
          addMessage(childSession.id, dispatchMsg);

          // Create child job linked to child session
          const childJob = this.startJob({
            type: 'assign',
            roleId: subRoleId,
            task: subTask,
            sourceRole: params.roleId,
            parentJobId: jobId,
            targetRoles: params.targetRoles,
            sessionId: childSession.id,
          });

          // Add role message linked to child job
          const childRoleMsg: Message = {
            id: `msg-${Date.now() + 1}-role-${subRoleId}`,
            from: 'role',
            content: '',
            type: 'conversation',
            status: 'streaming',
            timestamp: new Date().toISOString(),
            jobId: childJob.id,
          };
          addMessage(childSession.id, childRoleMsg, true);

          // Embed dispatch event with childSessionId in parent session
          if (job.sessionId) {
            this.embedSessionEvent(job, 'dispatch:start', {
              roleId: subRoleId,
              task: subTask,
              childJobId: childJob.id,
              childSessionId: childSession.id,
              targetRoleId: subRoleId,
            });
          }
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
          // ─── Post-Knowledging check ───
          // Extract changed .md files from tool calls and check for knowledge debt
          const changedMdFiles = result.toolCalls
            .filter(tc => (tc.name === 'write_file' || tc.name === 'edit_file') && tc.input && typeof tc.input.path === 'string')
            .map(tc => String(tc.input!.path))
            .filter(p => p.endsWith('.md'));

          if (changedMdFiles.length > 0) {
            try {
              const pkResult = postKnowledgingCheck(COMPANY_ROOT, changedMdFiles);
              if (!pkResult.pass) {
                job.knowledgeDebt = pkResult.debt;
                console.log(
                  `[Post-K] Job ${jobId} (${params.roleId}): ${pkResult.debt.length} knowledge debt item(s)`,
                );
                for (const d of pkResult.debt) {
                  console.log(`  [Post-K] ${d.type}: ${d.message}`);
                }
                // Include debt info in done event
                (doneData as Record<string, unknown>).knowledgeDebt = pkResult.debt.map(d => ({
                  type: d.type,
                  file: d.file,
                  message: d.message,
                }));
              }
            } catch (err) {
              console.warn('[Post-K] Check failed:', err);
            }
          }

          job.status = 'done';
          completeActivity(params.roleId);
          stream.emit('job:done', params.roleId, doneData);
          // D-014: Update linked session message with final results
          if (job.sessionId) {
            this.finalizeSessionMessage(job, 'done', result);
          }

          // EC-011: Job completion bonus (only for top-level jobs, not child dispatches)
          if (!params.parentJobId && result) {
            const totalTokens = (result.totalTokens?.input ?? 0) + (result.totalTokens?.output ?? 0);
            const bonus = Math.min(2000, Math.max(500, Math.round(totalTokens / 500)));
            try {
              earnCoinsInternal(bonus, `Job done: ${params.roleId}`, `job:${job.id}`);
            } catch { /* non-critical */ }
          }

          // Cleanup orphaned child jobs (awaiting_input with no parent to respond)
          this.cleanupOrphanedChildren(job.id);
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
        // D-014: Mark linked session message as error
        if (job.sessionId) {
          this.finalizeSessionMessage(job, 'error');
        }
      });

    return job;
  }

  /* ─── D-014: Session ↔ Job bridge ───────── */

  /** Accumulated text content for session messages linked to jobs */
  private sessionMsgContent = new Map<string, string>();

  /** Update session role message content as text streams in */
  private updateSessionRoleMessage(job: Job, text: string): void {
    if (!job.sessionId) return;
    const session = getSession(job.sessionId);
    if (!session) return;

    // Find the role message linked to this job
    const roleMsg = session.messages.find(m => m.jobId === job.id && m.from === 'role');
    if (!roleMsg) return;

    const key = `${job.sessionId}:${roleMsg.id}`;
    const current = (this.sessionMsgContent.get(key) ?? '') + text;
    this.sessionMsgContent.set(key, current);

    updateSessionMessage(job.sessionId, roleMsg.id, { content: current });
  }

  /** Embed an activity event into the session message linked to this job (SCA-010) */
  private embedSessionEvent(job: Job, type: string, data: Record<string, unknown>): void {
    if (!job.sessionId) return;
    const session = getSession(job.sessionId);
    if (!session) return;

    const roleMsg = session.messages.find(m => m.jobId === job.id && m.from === 'role');
    if (!roleMsg) return;

    const event: ActivityEvent = {
      seq: (roleMsg.events?.length ?? 0) + 1,
      ts: new Date().toISOString(),
      type: type as ActivityEvent['type'],
      roleId: job.roleId,
      data,
    };
    appendMessageEvent(job.sessionId, roleMsg.id, event);
  }

  /** Finalize session message when job completes or errors */
  private finalizeSessionMessage(job: Job, status: 'done' | 'error', result?: RunnerResult): void {
    if (!job.sessionId) return;
    const session = getSession(job.sessionId);
    if (!session) return;

    const roleMsg = session.messages.find(m => m.jobId === job.id && m.from === 'role');
    if (!roleMsg) return;

    const key = `${job.sessionId}:${roleMsg.id}`;
    const finalContent = this.sessionMsgContent.get(key) ?? roleMsg.content;
    this.sessionMsgContent.delete(key);

    updateSessionMessage(job.sessionId, roleMsg.id, {
      content: finalContent,
      status,
      ...(result && {
        turns: result.turns,
        tokens: result.totalTokens,
      }),
      // KP-006: Include knowledge debt in session message
      ...(job.knowledgeDebt && job.knowledgeDebt.length > 0 && {
        knowledgeDebt: job.knowledgeDebt.map(d => ({ type: d.type, file: d.file, message: d.message })),
      }),
    });
  }

  /** Cleanup orphaned child jobs when parent completes */
  private cleanupOrphanedChildren(parentJobId: string): void {
    for (const job of this.jobs.values()) {
      if (job.parentJobId === parentJobId && job.status === 'awaiting_input') {
        job.status = 'done';
        completeActivity(job.roleId);
        job.stream.emit('job:done', job.roleId, {
          output: '[Auto-closed] Parent job completed',
          turns: 0,
        });
      }
    }
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
      output: job.result?.output,
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

  /** Reply to an awaiting_input or done job → creates a continuation job */
  replyToJob(id: string, response: string, responderRole?: string): Job | null {
    const job = this.jobs.get(id);
    if (!job || (job.status !== 'awaiting_input' && job.status !== 'done')) return null;

    const isFollowUp = job.status === 'done';
    const effectiveResponder = responderRole ?? job.targetRole ?? 'ceo';

    // Mark previous job as done (don't emit job:done — the stream stays open
    // for the continuation job which will emit its own job:done when finished)
    job.status = 'done';
    if (!isFollowUp) completeActivity(job.roleId);
    job.stream.emit('job:reply', job.roleId, { response, responderRole: effectiveResponder, isFollowUp });

    // Build continuation prompt with previous context
    const prevOutput = job.result?.output ?? '';
    const contextSummary = prevOutput.length > 2000
      ? prevOutput.slice(-2000)
      : prevOutput;

    // Use the actual responder role name in the prompt
    const responderLabel = effectiveResponder === 'ceo' ? 'CEO' : effectiveResponder.toUpperCase();
    const continuationTask = isFollowUp
      ? `[CEO Follow-up Directive]\n${response}\n\n[Previous context — your earlier report follows]\n${contextSummary}`
      : `[Continuation — previous output follows]\n${contextSummary}\n\n[${responderLabel} Response]\n${response}`;

    // Create new job for same role
    // Follow-ups (from done state) should allow question detection since they're fresh directives
    // Continuations (from awaiting_input) skip question detection to avoid infinite loops
    const newJob = this.startJob({
      type: job.type,
      roleId: job.roleId,
      task: continuationTask,
      sourceRole: effectiveResponder,
      parentJobId: job.id,
      isContinuation: !isFollowUp,
      sessionId: job.sessionId,
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

  /** SCA-011: Find the most recent job linked to a session */
  getJobBySessionId(sessionId: string): Job | undefined {
    let active: Job | undefined;
    let latest: Job | undefined;
    for (const job of this.jobs.values()) {
      if (job.sessionId === sessionId) {
        // Prefer running or awaiting_input jobs
        if (job.status === 'running' || job.status === 'awaiting_input') {
          if (!active || job.createdAt > active.createdAt) {
            active = job;
          }
        }
        if (!latest || job.createdAt > latest.createdAt) {
          latest = job;
        }
      }
    }
    return active ?? latest;
  }
}

/* ─── Export singleton ───────────────────── */

export const jobManager = new JobManager();
