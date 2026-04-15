import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';
import { COMPANY_ROOT } from './file-reader.js';
import { ActivityStream, type ActivityEvent } from './activity-stream.js';
import { buildOrgTree } from '../engine/org-tree.js';
import { validateDispatch, validateConsult } from '../engine/authority-validator.js';
import { createRunner } from '../engine/runners/index.js';
import type { ExecutionRunner } from '../engine/runners/types.js';
// activity-tracker removed — executionManager is Single Source of Truth for role status
import type { RunnerResult } from '../engine/runners/types.js';
import { estimateCost } from './pricing.js';
import { readConfig, getConversationLimits, resolveCodeRoot } from './company-config.js';
import { postKnowledgingCheck, type KnowledgeDebtItem } from '../engine/knowledge-gate.js';
import { earnCoinsInternal } from '../routes/coins.js';
import { getSession, createSession, addMessage, updateMessage as updateSessionMessage, updateSession, appendMessageEvent, type Message, type ImageAttachment } from './session-store.js';
import { portRegistry, type PortAllocation } from './port-registry.js';
import { type MessageStatus, isMessageActive, canTransition, messageStatusToRoleStatus } from '../../../shared/types.js';
import * as boardStore from './board-store.js';

/* ─── CEO Findings Extraction (M2: Memory System) ─── */

/**
 * Extract key findings from a parent session's activity stream.
 * Reads tool:result events for Read/Grep/Glob to summarize what the
 * dispatching role already discovered, so child roles don't re-collect.
 *
 * Returns a compact summary string, or empty string if nothing useful found.
 * Budget: max ~800 chars to avoid bloating child context.
 */
function extractParentFindings(sessionId: string): string {
  const events = ActivityStream.readAll(sessionId);
  if (events.length === 0) return '';

  const findings: string[] = [];
  let budget = 800;

  for (const e of events) {
    if (budget <= 0) break;
    if (e.type !== 'tool:result') continue;

    const toolName = e.data?.toolName as string || e.data?.name as string || '';
    const output = e.data?.output as string || e.data?.result as string || '';
    if (!output || output.length < 20) continue;

    // Only extract from Read, Grep, Glob results (context collection tools)
    if (!['Read', 'Grep', 'Glob', 'Bash'].includes(toolName)) continue;

    // For Bash, only include curl/health checks, not execution commands
    if (toolName === 'Bash') {
      const cmd = e.data?.command as string || '';
      if (!cmd.includes('curl') && !cmd.includes('health') && !cmd.includes('ls') && !cmd.includes('cat')) continue;
    }

    // Extract file path or search pattern
    const filePath = e.data?.file_path as string || e.data?.path as string || '';
    const pattern = e.data?.pattern as string || '';
    const label = filePath ? `[${filePath.split('/').slice(-2).join('/')}]` : pattern ? `[grep: ${pattern}]` : `[${toolName}]`;

    // Truncate output to fit budget
    const maxLen = Math.min(150, budget);
    const summary = output.slice(0, maxLen).replace(/\n/g, ' ').trim();
    if (summary.length < 15) continue;

    const line = `${label}: ${summary}`;
    findings.push(line);
    budget -= line.length;
  }

  if (findings.length === 0) return '';

  return `[Parent Findings — do NOT re-collect this information]\n${findings.join('\n')}`;
}

/**
 * M4 Passive Sibling Awareness: extract completed sibling role results.
 * When a parent dispatches child B, include findings from already-completed child A.
 */
function extractSiblingFindings(parentExec: { childSessionIds: string[]; roleId: string }, currentRoleId: string): string {
  const sections: string[] = [];
  let budget = 1200;

  for (const siblingSessionId of parentExec.childSessionIds) {
    if (budget <= 0) break;

    const events = ActivityStream.readAll(siblingSessionId);
    if (events.length === 0) continue;

    // Find the role ID and completion status from events
    const startEvent = events.find(e => e.type === 'msg:start');
    const siblingRole = startEvent?.roleId || '';
    if (!siblingRole || siblingRole === currentRoleId) continue;

    const doneEvent = events.find(e => e.type === 'msg:done' || e.type === 'trace:response');
    if (!doneEvent) continue; // Only include completed siblings

    // Extract output summary
    const output = doneEvent.data?.fullOutput || doneEvent.data?.output || '';
    if (!output || output.length < 20) continue;

    const summary = String(output).slice(-400).replace(/\n/g, ' ').trim();
    const line = `[${siblingRole} result]: ${summary}`;
    if (line.length > budget) continue;

    sections.push(line);
    budget -= line.length;
  }

  if (sections.length === 0) return '';

  return `[Sibling Results — completed team members' work]\n${sections.join('\n')}`;
}

/* ─── Types ─── */

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
  /** Running token counts (updated per turn, before final ledger write) */
  runningTokens?: { input: number; output: number };
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

function hasQuestion(output: string): boolean {
  const lastBlock = output.trim().split('\n').slice(-5).join('\n');
  return /\?\s*$/.test(lastBlock) || /할까요|해볼까요|어떨까요|확인.*필요/.test(lastBlock);
}

/* ─── [APPROVAL_NEEDED] Detection ─── */

const APPROVAL_TAGS = /\[APPROVAL_NEEDED\]|\[CEO_DECISION\]|\[DECISION_REQUIRED\]/;

function extractApprovalQuestion(output: string): string | null {
  const idx = output.search(APPROVAL_TAGS);
  if (idx === -1) return null;
  // Extract text after the tag until end or next section marker
  const afterTag = output.slice(idx);
  const lines = afterTag.split('\n');
  // Take up to 10 lines after the tag line for context
  const relevant = lines.slice(0, 10).join('\n').trim();
  return relevant || null;
}

function sendApprovalNotification(roleId: string, question: string): void {
  try {
    const title = `Tycono: ${roleId} needs approval`;
    const msg = question.replace(/["\\\n]/g, ' ').slice(0, 200);
    execSync(`osascript -e 'display notification "${msg}" with title "${title}" sound name "Ping"'`);
  } catch { /* ignore on non-macOS */ }
}

function isExecActive(status: ExecStatus): boolean {
  return status === 'running' || status === 'awaiting_input';
}

function resolveTargetRole(sourceRole: string | undefined, parentSessionId: string | undefined, executions: Map<string, Execution>): string {
  if (sourceRole && sourceRole !== 'ceo') return sourceRole;

  if (parentSessionId) {
    for (const exec of executions.values()) {
      if (exec.sessionId === parentSessionId && exec.roleId !== 'ceo') {
        return exec.roleId;
      }
    }
  }

  return 'ceo';
}

/* ─── ExecutionManager Singleton ───────────────── */

class ExecutionManager {
  private executions = new Map<string, Execution>();
  private runner = createRunner();
  private nextId = 1;
  private executionCreatedListeners = new Set<(exec: Execution) => void>();
  private pendingAmendments = new Map<string, string[]>(); // sessionId → queued tasks

  setRunner(newRunner: ExecutionRunner): void {
    this.runner = newRunner;
  }

  refreshRunner(): void {
    this.runner = createRunner();
  }

  onExecutionCreated(listener: (exec: Execution) => void): () => void {
    this.executionCreatedListeners.add(listener);
    return () => { this.executionCreatedListeners.delete(listener); };
  }

  startExecution(params: StartExecutionParams): Execution {
    const execId = `exec-${Date.now()}-${this.nextId++}`;

    // Resolve preset from wave file for org tree building
    let presetId: string | undefined;
    const session = getSession(params.sessionId);
    if (session?.waveId) {
      try {
        const wavePath = path.join(COMPANY_ROOT, '.tycono', 'waves', `${session.waveId}.json`);
        if (fs.existsSync(wavePath)) {
          const waveData = JSON.parse(fs.readFileSync(wavePath, 'utf-8'));
          presetId = waveData.preset;
        }
      } catch { /* ignore */ }
    }
    const orgTree = buildOrgTree(COMPANY_ROOT, presetId);

    // Authority gate
    if (params.sourceRole && params.sourceRole !== 'ceo') {
      if (params.type === 'consult') {
        const auth = validateConsult(orgTree, params.sourceRole, params.roleId);
        if (!auth.allowed) {
          throw new Error(`Authority denied: ${auth.reason}`);
        }
      } else if (params.type === 'assign' && params.parentSessionId) {
        const auth = validateDispatch(orgTree, params.sourceRole, params.roleId);
        if (!auth.allowed) {
          throw new Error(`Authority denied: ${auth.reason}`);
        }
      }
    }

    // Resolve traceId: root sessions use their own sessionId, children inherit from parent
    let traceId = params.sessionId;
    if (params.parentSessionId) {
      // Find the root trace by walking up the parent chain
      for (const exec of this.executions.values()) {
        if (exec.sessionId === params.parentSessionId) {
          traceId = exec.traceId ?? params.parentSessionId;
          break;
        }
      }
    }

    const stream = ActivityStream.getOrCreate(params.sessionId, params.roleId, params.parentSessionId, traceId);

    const execution: Execution = {
      id: execId,
      sessionId: params.sessionId,
      type: params.type,
      roleId: params.roleId,
      task: params.task,
      status: 'running',
      stream,
      abort: () => {},
      parentSessionId: params.parentSessionId,
      childSessionIds: [],
      createdAt: new Date().toISOString(),
      targetRoles: params.targetRoles,
      traceId,
    };

    this.executions.set(execId, execution);

    this.initializeAndRunExecution(execution, params, orgTree, presetId);

    return execution;
  }

  private async initializeAndRunExecution(
    execution: Execution,
    params: StartExecutionParams,
    orgTree: ReturnType<typeof buildOrgTree>,
    presetId?: string,
  ): Promise<void> {
    try {
      const ports = await portRegistry.allocate(execution.sessionId || execution.id, params.roleId, params.task);
      execution.ports = ports;
      console.log(`[ExecMgr] Allocated ports for ${execution.id} (${params.roleId}): API :${ports.api}, Vite :${ports.vite}`);
    } catch (err) {
      console.warn(`[ExecMgr] Port allocation failed for ${execution.id}:`, err);
    }

    // Emit msg:start
    execution.stream.emit('msg:start', params.roleId, {
      traceId: execution.traceId,
      type: params.type,
      task: params.task,
      sourceRole: params.sourceRole ?? 'ceo',
      sessionId: params.sessionId,
      ...(params.parentSessionId && { parentSessionId: params.parentSessionId }),
    });

    // Auto-update board task status → running
    const sessionForBoard = getSession(params.sessionId);
    if (sessionForBoard?.waveId) {
      try {
        const myTasks = boardStore.getTasksForRole(sessionForBoard.waveId, params.roleId);
        const waitingTask = myTasks.find(t => t.status === 'waiting');
        if (waitingTask) {
          boardStore.updateTaskStatus(sessionForBoard.waveId, waitingTask.id, 'running');
        }
      } catch { /* non-fatal */ }
    }

    // If this execution has a parent session, emit dispatch:start on the parent's stream
    if (params.parentSessionId) {
      const parentExec = this.getActiveExecution(params.parentSessionId);
      if (parentExec) {
        parentExec.childSessionIds.push(params.sessionId);
        parentExec.stream.emit('dispatch:start', parentExec.roleId, {
          targetRoleId: params.roleId,
          task: params.task,
          childSessionId: params.sessionId,
          parentSessionId: parentExec.sessionId,
        });

        // BUG-DASHBOARD-NODES: Add dispatched sub-role as board task
        if (sessionForBoard?.waveId) {
          try {
            const existingTasks = boardStore.getTasksForRole(sessionForBoard.waveId, params.roleId);
            if (existingTasks.length === 0) {
              const board = boardStore.getBoard(sessionForBoard.waveId);
              const parentTask = board?.tasks.find(t => t.assignee === parentExec.roleId);
              const taskId = `t${(board?.tasks.length ?? 0) + 1}`;
              const taskSnippet = typeof params.task === 'string'
                ? params.task.slice(0, 80)
                : 'Dispatched task';
              boardStore.addTask(sessionForBoard.waveId, {
                id: taskId,
                title: `${params.roleId.toUpperCase()}: ${taskSnippet}`,
                assignee: params.roleId,
                status: 'running',
                criteria: '',
                dependsOn: parentTask ? [parentTask.id] : [],
              });
            }
          } catch { /* non-fatal */ }
        }
      }
    }

    // Model resolution: params.model > wave modelOverrides > role.yaml
    let model = params.model ?? orgTree.nodes.get(params.roleId)?.model;
    if (!params.model) {
      const session = getSession(params.sessionId);
      if (session?.waveId) {
        try {
          const wavePath = path.join(COMPANY_ROOT, '.tycono', 'waves', `${session.waveId}.json`);
          if (fs.existsSync(wavePath)) {
            const waveData = JSON.parse(fs.readFileSync(wavePath, 'utf-8'));
            const override = waveData.modelOverrides?.[params.roleId];
            if (override) {
              model = override;
              console.log(`[ExecMgr] Model override for ${params.roleId}: ${override} (from wave ${session.waveId})`);
            }
          }
        } catch { /* ignore */ }
      }
    }

    const config = readConfig(COMPANY_ROOT);
    const limits = getConversationLimits(config);
    let harnessTurnCount = 0;
    let softLimitWarned = false;
    let hardLimitReached = false;
    const outputChunks: string[] = [];

    const teamStatus: import('../../../shared/types').TeamStatus = {};
    for (const [, e] of this.executions) {
      if (e.status === 'running' && e.id !== execution.id) {
        teamStatus[e.roleId] = { status: 'working', task: e.task };
      }
    }

    const portEnv = execution.ports ? {
      API_PORT: String(execution.ports.api),
      PORT: String(execution.ports.api),
      VITE_PORT: String(execution.ports.vite),
      ...(execution.ports.hmr && { VITE_HMR_PORT: String(execution.ports.hmr) }),
    } : {};

    // Handoff summary: collect prior dispatch results for this wave
    const priorDispatches: Array<{ roleId: string; task: string; result: string }> = [];
    const execSession = getSession(params.sessionId);
    if (execSession?.waveId) {
      for (const [, exec] of this.executions) {
        if (exec.status === 'done' && exec.result && exec.sessionId !== params.sessionId) {
          const s = getSession(exec.sessionId);
          if (s?.waveId === execSession.waveId) {
            priorDispatches.push({
              roleId: exec.roleId,
              task: exec.task,
              result: exec.result.output?.slice(0, 500) ?? '',
            });
          }
        }
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
        sessionId: params.sessionId,
        teamStatus,
        targetRoles: params.targetRoles,
        presetId,
        waveId: sessionForBoard?.waveId,
        codeRoot: resolveCodeRoot(COMPANY_ROOT),
        attachments: params.attachments,
        cliSessionId: params.cliSessionId,
        priorDispatches,
        env: {
          ...process.env,
          ...portEnv,
        },
        // SV-6, SV-7: Supervision callbacks (direct-api runner only)
        onAbortSession: (sessionId: string) => this.abortSession(sessionId),
        onAmendSession: (sessionId: string, instruction: string) => {
          const result = this.continueSession(sessionId, `[SUPERVISION AMENDMENT] ${instruction}`, params.roleId);
          return result !== null;
        },
      },
      {
        onText: (text) => {
          outputChunks.push(text);
          execution.stream.emit('text', params.roleId, { text });
          if (execution.sessionId) {
            this.updateSessionRoleMessage(execution, text);
          }
        },
        onThinking: (text) => {
          execution.stream.emit('thinking', params.roleId, { text });
          if (execution.sessionId) {
            this.embedSessionEvent(execution, 'thinking', { text: text.slice(0, 200) });
          }
        },
        onToolUse: (name, input) => {
          execution.stream.emit('tool:start', params.roleId, {
            name,
            input: input ? summarizeInput(input) : undefined,
          });
          if (execution.sessionId) {
            this.embedSessionEvent(execution, 'tool:start', {
              name,
              input: input ? summarizeInput(input) : undefined,
            });
          }
        },
        onDispatch: async (subRoleId, subTask) => {
          if (params.targetRoles && params.targetRoles.length > 0) {
            if (!params.targetRoles.includes(subRoleId)) {
              const errorMsg = `Dispatch to ${subRoleId} blocked — not in active target scope for this wave.`;
              console.warn(`[ExecMgr] Dispatch blocked: ${params.roleId} → ${subRoleId} (not in targetRoles)`);
              execution.stream.emit('dispatch:error', params.roleId, {
                sourceRole: params.roleId,
                targetRole: subRoleId,
                error: errorMsg,
                timestamp: Date.now(),
              });
              return;
            }
          }

          // BUG-W02 fix: propagate waveId from parent session to child
          const parentSession = getSession(execution.sessionId);
          const parentWaveId = parentSession?.waveId;

          // BUG-FORKBOMB: Role당 1세션 invariant — active/done 세션 있으면 amend
          if (parentWaveId) {
            const { decideDispatchOrAmend } = await import('./dispatch-classifier.js');
            const decision = await decideDispatchOrAmend(parentWaveId, subRoleId, params.roleId, subTask);

            if (decision.action === 'amend' && decision.prevSessionId) {
              console.log(`[ExecMgr] AMEND instead of dispatch: ${subRoleId} → ${decision.prevSessionId} (${decision.reason})`);

              if (decision.reason === 'role-already-active') {
                // Active session — queue amendment
                this.queueAmendment(decision.prevSessionId, `[FOLLOW-UP from ${params.roleId}] ${subTask}`);
                return;
              }

              // Done session — continue
              const amended = this.continueSession(
                decision.prevSessionId,
                `[FOLLOW-UP from ${params.roleId}] ${subTask}`,
                params.roleId,
              );
              if (amended) return;
              // continueSession failed — fall through to new dispatch
              console.warn(`[ExecMgr] continueSession failed for ${decision.prevSessionId}, creating new session`);
            }
          }

          // M2: Inject parent findings into child task (Memory System)
          // M4: Inject sibling results (completed team members' work)
          // Skip for independent roles (critic, validator) to preserve judgment
          const roleNode = orgTree?.nodes?.get(subRoleId);
          const isIndependent = roleNode?.persona?.toLowerCase().match(/critic|validator|auditor|devil/);
          const parentFindings = !isIndependent ? extractParentFindings(execution.sessionId) : '';
          const siblingFindings = !isIndependent ? extractSiblingFindings(execution, subRoleId) : '';
          const contextPrefix = [parentFindings, siblingFindings].filter(Boolean).join('\n\n');
          const enrichedTask = contextPrefix
            ? `${contextPrefix}\n\n${subTask}`
            : subTask;

          const childSession = createSession(subRoleId, {
            mode: 'do',
            source: 'dispatch',
            parentSessionId: execution.sessionId,
            ...(parentWaveId && { waveId: parentWaveId }),
          });
          const dispatchMsg: Message = {
            id: `msg-${Date.now()}-dispatch-${subRoleId}`,
            from: 'ceo',
            content: enrichedTask,
            type: 'directive',
            status: 'done',
            timestamp: new Date().toISOString(),
          };
          addMessage(childSession.id, dispatchMsg);

          const childExec = this.startExecution({
            type: 'assign',
            roleId: subRoleId,
            task: enrichedTask,
            sourceRole: params.roleId,
            parentSessionId: execution.sessionId,
            targetRoles: params.targetRoles,
            sessionId: childSession.id,
          });

          const childRoleMsg: Message = {
            id: `msg-${Date.now() + 1}-role-${subRoleId}`,
            from: 'role',
            content: '',
            type: 'conversation',
            status: 'streaming',
            timestamp: new Date().toISOString(),
          };
          addMessage(childSession.id, childRoleMsg, true);

          if (execution.sessionId) {
            this.embedSessionEvent(execution, 'dispatch:start', {
              roleId: subRoleId,
              task: subTask,
              childSessionId: childSession.id,
              targetRoleId: subRoleId,
            });
          }
        },
        onConsult: (subRoleId, question) => {
          this.startExecution({
            type: 'consult',
            roleId: subRoleId,
            task: `[Consultation from ${params.roleId}] ${question}\n\nAnswer this question based on your role's expertise and knowledge. Be concise and specific.`,
            sourceRole: params.roleId,
            readOnly: true,
            parentSessionId: execution.sessionId,
            sessionId: `ses-consult-${Date.now()}-${subRoleId}`,
          });
        },
        onTokens: (_input, _output, totalInput, totalOutput) => {
          execution.runningTokens = { input: totalInput, output: totalOutput };
        },
        onTurnComplete: (turn) => {
          harnessTurnCount++;
          execution.stream.emit('msg:turn-complete', params.roleId, {
            turn: harnessTurnCount,
            runnerTurn: turn,
          });

          if (!softLimitWarned && harnessTurnCount >= limits.softLimit) {
            softLimitWarned = true;
            console.warn(
              `[Harness] Exec ${execution.id} (${params.roleId}): turn ${harnessTurnCount} reached softLimit (${limits.softLimit})`,
            );
            execution.stream.emit('turn:warning', params.roleId, {
              turn: harnessTurnCount,
              softLimit: limits.softLimit,
              hardLimit: limits.hardLimit,
            });
          }

          if (harnessTurnCount >= limits.hardLimit) {
            hardLimitReached = true;
            console.warn(
              `[Harness] Exec ${execution.id} (${params.roleId}): turn ${harnessTurnCount} reached hardLimit (${limits.hardLimit}). Pausing for approval.`,
            );
            execution.stream.emit('turn:limit', params.roleId, {
              turn: harnessTurnCount,
              hardLimit: limits.hardLimit,
            });
            handle.abort();
          }
        },
        onPromptAssembled: (systemPrompt, userTask) => {
          execution.stream.emit('prompt:assembled', params.roleId, {
            systemPrompt,
            userTask,
            systemPromptLength: systemPrompt.length,
          });
        },
        onError: (error) => {
          execution.stream.emit('msg:error', params.roleId, { message: error });
        },
      },
    );

    execution.abort = handle.abort;

    // Notify listeners
    for (const listener of this.executionCreatedListeners) {
      try { listener(execution); } catch { /* ignore */ }
    }

    handle.promise
      .then((result: RunnerResult) => {
        execution.result = result;
        if (result.cliSessionId) execution.cliSessionId = result.cliSessionId;

        const costUsd = estimateCost(
          result.totalTokens.input,
          result.totalTokens.output,
          model ?? '',
        );

        execution.stream.emit('trace:response', params.roleId, {
          fullOutput: result.output,
          outputLength: result.output.length,
          turns: result.turns,
          tokens: result.totalTokens,
        });

        const doneData = {
          output: result.output.slice(-1000),
          turns: result.turns,
          tokens: result.totalTokens,
          costUsd,
          toolCalls: result.toolCalls.length,
          dispatches: result.dispatches.map((d) => ({ roleId: d.roleId, task: d.task })),
        };

        const targetRole = resolveTargetRole(params.sourceRole, params.parentSessionId, this.executions);

        // ── [APPROVAL_NEEDED] detection — notify user when agent is blocked ──
        const approvalQuestion = extractApprovalQuestion(result.output);
        if (approvalQuestion) {
          console.log(`[Approval] ${params.roleId} (${execution.sessionId}) output contains approval tag`);
          execution.stream.emit('approval:needed', params.roleId, {
            roleId: params.roleId,
            sessionId: execution.sessionId,
            question: approvalQuestion,
            timestamp: Date.now(),
          });
          sendApprovalNotification(params.roleId, approvalQuestion);

          // BUG-APPROVAL belt-and-suspenders: directly notify supervisor (don't rely solely on stream)
          // This ensures approval state is set even if stream watcher was lost (e.g., stream closed by cleanup)
          if (params.roleId === 'ceo') {
            const session = getSession(execution.sessionId);
            if (session?.waveId) {
              import('./supervisor-heartbeat.js').then(({ supervisorHeartbeat }) => {
                const state = supervisorHeartbeat.getState(session.waveId!);
                if (state && state.status !== 'awaiting_approval') {
                  console.log(`[Approval] Direct supervisor notification: wave ${session.waveId} → awaiting_approval`);
                  state.status = 'awaiting_approval';
                }
              }).catch(() => { /* avoid circular import crash */ });
            }
          }
        }

        if (hardLimitReached) {
          execution.status = 'awaiting_input';
          execution.targetRole = targetRole;
          const question = `[Turn limit] ${harnessTurnCount}턴 도달 (hardLimit: ${limits.hardLimit}). 계속 진행할까요?`;
          execution.stream.emit('msg:awaiting_input', params.roleId, {
            ...doneData,
            question,
            awaitingInput: true,
            targetRole,
            reason: 'turn_limit',
          });

          // Auto-continue on turn limit: resume with --resume for context continuity
          // Delay slightly to allow stream event to propagate
          setTimeout(() => {
            console.log(`[Harness] Auto-continuing ${params.roleId} (${execution.sessionId}) after turn limit`);
            this.continueSession(execution.sessionId, '턴 한도에 도달했습니다. 이전 작업을 이어서 계속 진행하세요.');
          }, 3_000);
        } else if (!params.isContinuation && hasQuestion(result.output)) {
          // CEO supervisor should auto-continue instead of hanging on awaiting_input
          // (subordinates may have completed while CEO was running — CEO needs to synthesize results)
          const session = getSession(execution.sessionId);
          if (session?.roleId === 'ceo' && session?.source === 'wave') {
            console.log(`[Harness] CEO supervisor hasQuestion — auto-continuing to synthesize results`);
            setTimeout(() => {
              this.continueSession(execution.sessionId, 'All dispatched sessions have completed. Synthesize the results from your team and provide a final briefing.');
            }, 3_000);
          } else {
            execution.status = 'awaiting_input';
            execution.targetRole = targetRole;
            execution.stream.emit('msg:awaiting_input', params.roleId, {
              ...doneData,
              question: result.output.trim().split('\n').slice(-5).join('\n'),
              awaitingInput: true,
              targetRole,
            });
          }
        } else {
          const changedMdFiles = result.toolCalls
            .filter(tc => (tc.name === 'write_file' || tc.name === 'edit_file') && tc.input && typeof tc.input.path === 'string')
            .map(tc => String(tc.input!.path))
            .filter(p => p.endsWith('.md'));

          if (changedMdFiles.length > 0) {
            try {
              const pkResult = postKnowledgingCheck(COMPANY_ROOT, changedMdFiles);
              if (!pkResult.pass) {
                execution.knowledgeDebt = pkResult.debt;
                console.log(
                  `[Post-K] Exec ${execution.id} (${params.roleId}): ${pkResult.debt.length} knowledge debt item(s)`,
                );
                for (const d of pkResult.debt) {
                  console.log(`  [Post-K] ${d.type}: ${d.message}`);
                }
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

          execution.status = 'done';
          execution.stream.emit('msg:done', params.roleId, doneData);

          // Post-done cleanup — wrapped in try/catch to prevent msg:error after msg:done
          // (BUG: seongsu-kang/tycono#41 — "session is not defined" error 25ms after done)
          try {
            if (execution.sessionId) {
              this.finalizeSessionMessage(execution, 'done', result);
            }

            // Auto-update board task status → done
            const doneSession = getSession(execution.sessionId);
            if (doneSession?.waveId) {
              try {
                const myTasks = boardStore.getTasksForRole(doneSession.waveId, params.roleId);
                const runningTask = myTasks.find(t => t.status === 'running');
                if (runningTask) {
                  boardStore.completeTask(doneSession.waveId, runningTask.id, 'pass', result.output.slice(-200));
                }
              } catch { /* non-fatal */ }
            }

            // Emit dispatch:done on parent's stream
            if (params.parentSessionId) {
              const parentExec = this.getActiveExecution(params.parentSessionId);
              if (parentExec) {
                parentExec.stream.emit('dispatch:done', parentExec.roleId, {
                  targetRoleId: params.roleId,
                  childSessionId: params.sessionId,
                  output: result.output.slice(-1000),
                  turns: result.turns,
                  tokens: result.totalTokens,
                });
              }
            }

            if (!params.parentSessionId && result) {
              const totalTokens = (result.totalTokens?.input ?? 0) + (result.totalTokens?.output ?? 0);
              const bonus = Math.min(2000, Math.max(500, Math.round(totalTokens / 500)));
              try {
                earnCoinsInternal(bonus, `Execution done: ${params.roleId}`, `exec:${execution.id}`);
              } catch { /* non-critical */ }
            }

            this.cleanupOrphanedChildren(execution.sessionId);
            this.attemptSupervisionRecovery(execution);
          } catch (postDoneErr) {
            // Log but do NOT re-emit msg:error — done is the final state
            console.error(`[ExecMgr] Post-done cleanup error (${params.roleId}): ${postDoneErr}`);
          }
        }
      })
      .catch((err: Error) => {
        if (hardLimitReached) {
          execution.result = {
            output: outputChunks.join(''),
            turns: harnessTurnCount,
            totalTokens: { input: 0, output: 0 },
            toolCalls: [],
            dispatches: [],
          };

          const targetRole = resolveTargetRole(params.sourceRole, params.parentSessionId, this.executions);
          execution.status = 'awaiting_input';
          execution.targetRole = targetRole;
          const question = `[Turn limit] ${harnessTurnCount}턴 도달 (hardLimit: ${limits.hardLimit}). 계속 진행할까요?`;
          execution.stream.emit('msg:awaiting_input', params.roleId, {
            question,
            awaitingInput: true,
            targetRole,
            reason: 'turn_limit',
          });
          return;
        }

        execution.status = 'error';
        execution.error = err.message;

        execution.stream.emit('msg:error', params.roleId, { message: err.message });
        if (execution.sessionId) {
          this.finalizeSessionMessage(execution, 'error');
        }

        // Auto-update board task status → done (even on error)
        const errSession = getSession(execution.sessionId);
        if (errSession?.waveId) {
          try {
            const myTasks = boardStore.getTasksForRole(errSession.waveId, params.roleId);
            const runningTask = myTasks.find(t => t.status === 'running');
            if (runningTask) {
              boardStore.completeTask(errSession.waveId, runningTask.id, 'fail', err.message.slice(0, 200));
            }
          } catch { /* non-fatal */ }
        }

        // SV: If C-Level crashed with running children, restart supervision
        this.attemptSupervisionRecovery(execution);
      })
      .finally(() => {
        if (execution.ports) {
          const released = portRegistry.release(execution.sessionId || execution.id);
          if (released) {
            console.log(`[ExecMgr] Released ports for ${execution.id}: API :${execution.ports.api}, Vite :${execution.ports.vite}`);
          }
        }

        // Clean up sessionMsgContent immediately (no longer needed after finalize)
        if (execution.sessionId) {
          for (const key of this.sessionMsgContent.keys()) {
            if (key.startsWith(execution.sessionId + ':')) {
              this.sessionMsgContent.delete(key);
            }
          }
        }

        // OOM prevention: remove completed execution from memory after delay
        // (delay allows getActiveExecution to find it briefly for multiplexer/recovery)
        // BUG-APPROVAL fix: Don't close stream if a continuation is running on the same session
        // (closing the stream kills watcher subscribers, breaking supervisor event delivery)
        setTimeout(() => {
          this.executions.delete(execution.id);
          // Only close stream if no other active execution shares this session
          const hasActiveSibling = [...this.executions.values()].some(
            e => e.sessionId === execution.sessionId && e.id !== execution.id && (e.status === 'running' || e.status === 'awaiting_input'),
          );
          if (!hasActiveSibling) {
            execution.stream.close();
          }
        }, 300_000).unref(); // 5 min — prevents HTTP 410 on dispatch --check
      });
  }

  /** Debug: return memory stats for monitoring */
  getMemoryStats(): { executions: number; msgContentKeys: number; msgContentSize: number } {
    let msgContentSize = 0;
    for (const v of this.sessionMsgContent.values()) {
      msgContentSize += v.length;
    }
    return {
      executions: this.executions.size,
      msgContentKeys: this.sessionMsgContent.size,
      msgContentSize,
    };
  }

  /* ─── Session ↔ Execution bridge ───────── */

  private sessionMsgContent = new Map<string, string>();

  private updateSessionRoleMessage(execution: Execution, text: string): void {
    if (!execution.sessionId) return;
    const session = getSession(execution.sessionId);
    if (!session) return;

    // Find the latest streaming role message
    const roleMsg = [...session.messages].reverse().find(m => m.from === 'role' && m.status === 'streaming');
    if (!roleMsg) return;

    const key = `${execution.sessionId}:${roleMsg.id}`;
    const current = (this.sessionMsgContent.get(key) ?? '') + text;
    this.sessionMsgContent.set(key, current);

    updateSessionMessage(execution.sessionId, roleMsg.id, { content: current });
  }

  private embedSessionEvent(execution: Execution, type: string, data: Record<string, unknown>): void {
    if (!execution.sessionId) return;
    const session = getSession(execution.sessionId);
    if (!session) return;

    const roleMsg = [...session.messages].reverse().find(m => m.from === 'role' && m.status === 'streaming');
    if (!roleMsg) return;

    const event: ActivityEvent = {
      seq: (roleMsg.events?.length ?? 0) + 1,
      ts: new Date().toISOString(),
      type: type as ActivityEvent['type'],
      roleId: execution.roleId,
      data,
    };
    appendMessageEvent(execution.sessionId, roleMsg.id, event);
  }

  private finalizeSessionMessage(execution: Execution, status: 'done' | 'error', result?: RunnerResult): void {
    if (!execution.sessionId) return;
    const session = getSession(execution.sessionId);
    if (!session) return;

    const roleMsg = [...session.messages].reverse().find(m => m.from === 'role');
    if (!roleMsg) return;

    const key = `${execution.sessionId}:${roleMsg.id}`;
    const finalContent = this.sessionMsgContent.get(key) ?? roleMsg.content;
    this.sessionMsgContent.delete(key);

    updateSessionMessage(execution.sessionId, roleMsg.id, {
      content: finalContent,
      status,
      ...(result && {
        turns: result.turns,
        tokens: result.totalTokens,
      }),
      ...(execution.knowledgeDebt && execution.knowledgeDebt.length > 0 && {
        knowledgeDebt: execution.knowledgeDebt.map(d => ({ type: d.type, file: d.file, message: d.message })),
      }),
    });

    // Mark session as done in session-store (persisted to file)
    // Skip CEO supervisor sessions — they stay active for wave lifecycle
    if (session.roleId !== 'ceo' || session.source !== 'wave') {
      updateSession(execution.sessionId, { status: 'done' });
    }

    // Process queued amendments (BUG-FORKBOMB: role당 1세션 invariant)
    if (status === 'done') {
      this.processPendingAmendments(execution.sessionId);
    }
  }

  private cleanupOrphanedChildren(parentSessionId: string): void {
    for (const exec of this.executions.values()) {
      if (exec.parentSessionId === parentSessionId && exec.status === 'awaiting_input') {
        exec.status = 'done';
        exec.stream.emit('msg:done', exec.roleId, {
          output: '[Auto-closed] Parent session completed',
          turns: 0,
        });
      }
    }
  }

  /**
   * Get children of a parent session that are still running.
   * Public for supervisor heartbeat done-guard (Principle 5).
   */
  getRunningChildren(parentSessionId: string): Execution[] {
    const running: Execution[] = [];
    for (const exec of this.executions.values()) {
      if (exec.parentSessionId === parentSessionId && exec.status === 'running') {
        running.push(exec);
      }
    }
    return running;
  }

  /**
   * SV: Crash Recovery — C-Level이 죽었는데 부하가 아직 실행 중이면 자동 재시작.
   * "죽으면 오히려 이거하라고 다시 깨우는거야" (CEO 결정, 2026-03-14)
   */
  private attemptSupervisionRecovery(deadExecution: Execution): void {
    const runningChildren = this.getRunningChildren(deadExecution.sessionId);
    if (runningChildren.length === 0) return;

    // Only restart C-Level roles (CTO, CBO etc.)
    // Resolve preset from wave file for correct org tree
    let recoveryPresetId: string | undefined;
    const deadSession = getSession(deadExecution.sessionId);
    if (deadSession?.waveId) {
      try {
        const wp = path.join(COMPANY_ROOT, '.tycono', 'waves', `${deadSession.waveId}.json`);
        if (fs.existsSync(wp)) {
          recoveryPresetId = JSON.parse(fs.readFileSync(wp, 'utf-8')).preset;
        }
      } catch { /* ignore */ }
    }
    const orgTree = buildOrgTree(COMPANY_ROOT, recoveryPresetId);
    const node = orgTree.nodes.get(deadExecution.roleId);
    if (!node || node.level !== 'c-level') return;

    const childSummary = runningChildren.map(c =>
      `- [${c.roleId}] Session: ${c.sessionId} | Task: ${c.task.slice(0, 150)}`
    ).join('\n');

    const recoveryTask = `[SUPERVISION RECOVERY] Your previous session ended, but subordinates are still running.

Resume supervision immediately. These sessions are still active:
${childSummary}

Use supervision watch to monitor them:
python3 "$SUPERVISION_CMD" watch ${runningChildren.map(c => c.sessionId).join(',')} --duration 120

Your job: monitor progress, course-correct if needed, wait for completion, then compile results and report.`;

    console.log(`[ExecMgr] Supervision recovery: ${deadExecution.roleId} died with ${runningChildren.length} running children. Restarting.`);

    // Propagate waveId from the dead session
    const deadSes = getSession(deadExecution.sessionId);
    const waveId = deadSes?.waveId;

    // Create new session for recovery
    const newSession = createSession(deadExecution.roleId, {
      mode: 'do',
      source: 'wave',
      ...(waveId && { waveId }),
    });

    // Re-parent running children to the new session
    for (const child of runningChildren) {
      child.parentSessionId = newSession.id;
    }

    // Start new execution
    try {
      this.startExecution({
        type: 'assign',
        roleId: deadExecution.roleId,
        task: recoveryTask,
        sourceRole: 'ceo',
        sessionId: newSession.id,
        targetRoles: deadExecution.targetRoles,
      });
    } catch (err) {
      console.error(`[ExecMgr] Supervision recovery failed for ${deadExecution.roleId}:`, err);
    }
  }

  getExecution(id: string): Execution | undefined {
    return this.executions.get(id);
  }

  getActiveExecution(sessionId: string): Execution | undefined {
    let active: Execution | undefined;
    let latest: Execution | undefined;
    for (const exec of this.executions.values()) {
      if (exec.sessionId === sessionId) {
        if (isExecActive(exec.status)) {
          if (!active || exec.createdAt > active.createdAt) {
            active = exec;
          }
        }
        if (!latest || exec.createdAt > latest.createdAt) {
          latest = exec;
        }
      }
    }
    if (active ?? latest) return active ?? latest;

    return this.recoverExecutionFromStream(sessionId);
  }

  /** Find the latest completed execution for a session (for auto-amend lookup) */
  getCompletedExecution(sessionId: string): { task: string; cliSessionId?: string } | undefined {
    let latest: Execution | undefined;
    for (const exec of this.executions.values()) {
      if (exec.sessionId === sessionId && exec.status === 'done') {
        if (!latest || exec.createdAt > latest.createdAt) {
          latest = exec;
        }
      }
    }
    return latest ? { task: latest.task, cliSessionId: latest.cliSessionId } : undefined;
  }

  listExecutions(filter?: { status?: ExecStatus; roleId?: string; active?: boolean }): Array<{
    id: string;
    type: ExecType;
    roleId: string;
    task: string;
    status: ExecStatus;
    parentSessionId?: string;
    childSessionIds: string[];
    createdAt: string;
    targetRole?: string;
  }> {
    const result: Array<{
      id: string;
      type: ExecType;
      roleId: string;
      task: string;
      status: ExecStatus;
      parentSessionId?: string;
      childSessionIds: string[];
      createdAt: string;
      targetRole?: string;
    }> = [];

    for (const exec of this.executions.values()) {
      if (filter?.active && !isExecActive(exec.status)) continue;
      if (filter?.status && exec.status !== filter.status) continue;
      if (filter?.roleId && exec.roleId !== filter.roleId) continue;
      result.push({
        id: exec.id,
        type: exec.type,
        roleId: exec.roleId,
        task: exec.task,
        status: exec.status,
        parentSessionId: exec.parentSessionId,
        childSessionIds: exec.childSessionIds,
        createdAt: exec.createdAt,
        targetRole: exec.targetRole,
      });
    }

    return result;
  }

  abortSession(sessionId: string): boolean {
    const exec = this.getActiveExecution(sessionId);
    if (!exec || !isExecActive(exec.status)) return false;

    if (exec.status === 'running') exec.abort();
    exec.status = 'error';
    exec.error = 'Aborted by user';
    exec.stream.emit('msg:error', exec.roleId, { message: 'Aborted by user' });
    return true;
  }

  /** Also support aborting by execution ID for internal use */
  abortExecution(execId: string): boolean {
    const exec = this.executions.get(execId);
    if (!exec || !isExecActive(exec.status)) return false;

    if (exec.status === 'running') exec.abort();
    exec.status = 'error';
    exec.error = 'Aborted by user';
    exec.stream.emit('msg:error', exec.roleId, { message: 'Aborted by user' });
    return true;
  }

  continueSession(sessionId: string, response: string, responderRole?: string): Execution | null {
    const exec = this.getActiveExecution(sessionId);
    if (!exec || (exec.status !== 'awaiting_input' && exec.status !== 'done')) return null;

    const isFollowUp = exec.status === 'done';
    const effectiveResponder = responderRole ?? exec.targetRole ?? 'ceo';

    exec.status = 'done';
    exec.stream.emit('msg:reply', exec.roleId, { response, responderRole: effectiveResponder, isFollowUp });

    const prevOutput = exec.result?.output ?? '';
    const hasCliSession = !!exec.cliSessionId;

    const responderLabel = effectiveResponder === 'ceo' ? 'CEO' : effectiveResponder.toUpperCase();
    let continuationTask: string;
    if (hasCliSession) {
      // --resume preserves full conversation context — no need to repeat output
      continuationTask = isFollowUp
        ? `[CEO Follow-up Directive]\n${response}`
        : `[${responderLabel} Response — continue where you left off]\n${response}`;
    } else {
      const contextSummary = prevOutput.length > 2000
        ? prevOutput.slice(-2000)
        : prevOutput;
      continuationTask = isFollowUp
        ? `[CEO Follow-up Directive]\n${response}\n\n[Previous context — your earlier report follows]\n${contextSummary}`
        : `[Continuation — previous output follows]\n${contextSummary}\n\n[${responderLabel} Response]\n${response}`;
    }

    const newExec = this.startExecution({
      type: exec.type,
      roleId: exec.roleId,
      task: continuationTask,
      sourceRole: effectiveResponder,
      parentSessionId: exec.parentSessionId,
      isContinuation: !isFollowUp,
      sessionId: exec.sessionId, // Same session → same stream
      // Pass CLI session ID for --resume (preserves Claude conversation context)
      cliSessionId: exec.cliSessionId,
    });

    return newExec;
  }

  /**
   * Queue an amendment for a running session.
   * Will be processed when the current execution completes.
   */
  queueAmendment(sessionId: string, task: string): void {
    const queue = this.pendingAmendments.get(sessionId) ?? [];
    queue.push(task);
    this.pendingAmendments.set(sessionId, queue);
    console.log(`[Dispatch] Queued amendment for ${sessionId} (${queue.length} pending)`);
  }

  /**
   * Process pending amendments after execution completes.
   * Called from finalization logic.
   */
  processPendingAmendments(sessionId: string): void {
    const queue = this.pendingAmendments.get(sessionId);
    if (!queue || queue.length === 0) return;

    const task = queue.shift()!;
    if (queue.length === 0) {
      this.pendingAmendments.delete(sessionId);
    }

    console.log(`[Dispatch] Processing queued amendment for ${sessionId} (${queue.length} remaining)`);
    // Use setTimeout to avoid recursive call stack during finalization
    setTimeout(() => {
      this.continueSession(sessionId, task);
    }, 100);
  }

  getActiveExecutionForRole(roleId: string): Execution | undefined {
    for (const exec of this.executions.values()) {
      if (exec.roleId === roleId && isExecActive(exec.status)) {
        return exec;
      }
    }
    return undefined;
  }

  private recoverExecutionFromStream(sessionId: string): Execution | undefined {
    try {
      // Try reading directly from session-keyed stream file
      if (ActivityStream.exists(sessionId)) {
        const events = ActivityStream.readAll(sessionId);
        const startEvent = events.find(e => e.type === 'msg:start');
        if (startEvent) {
          return this.reconstructExecution(sessionId, sessionId, events, startEvent);
        }
      }

      // Fallback: scan all stream files
      const streamIds = ActivityStream.listAll();
      let bestExec: { streamId: string; roleId: string; task: string; type: ExecType; status: ExecStatus; createdAt: string; output?: string } | undefined;

      for (const streamId of streamIds) {
        if (this.executions.has(streamId)) continue;

        const events = ActivityStream.readAll(streamId);
        const startEvent = events.find(e => e.type === 'msg:start');
        if (!startEvent || (startEvent.data.sessionId as string) !== sessionId) continue;

        const doneEvent = events.find(e => e.type === 'msg:done');
        const errorEvent = events.find(e => e.type === 'msg:error');
        const awaitingEvent = events.find(e => e.type === 'msg:awaiting_input');
        const status: ExecStatus = awaitingEvent && !doneEvent ? 'awaiting_input'
          : doneEvent ? 'done'
          : errorEvent ? 'error'
          : 'running';  // No done/error event = still running

        const candidate = {
          streamId,
          roleId: startEvent.roleId,
          task: startEvent.data.task as string ?? '',
          type: (startEvent.data.type as string ?? 'assign') as ExecType,
          status,
          createdAt: startEvent.ts,
          output: doneEvent?.data?.output as string | undefined,
        };

        if (!bestExec || candidate.createdAt > bestExec.createdAt) {
          bestExec = candidate;
        }
      }

      if (!bestExec) return undefined;

      const stream = ActivityStream.getOrCreate(sessionId, bestExec.roleId);
      const execution: Execution = {
        id: `recovered-${bestExec.streamId}`,
        sessionId,
        type: bestExec.type,
        roleId: bestExec.roleId,
        task: bestExec.task,
        status: bestExec.status,
        stream,
        abort: () => {},
        childSessionIds: [],
        createdAt: bestExec.createdAt,
        result: bestExec.output ? { output: bestExec.output, turns: 0, totalTokens: { input: 0, output: 0 }, toolCalls: [], dispatches: [] } : undefined,
      };

      this.executions.set(execution.id, execution);
      console.log(`[ExecMgr] Recovered execution for session ${sessionId} (status: ${execution.status})`);

      // OOM prevention: auto-cleanup recovered executions (they're only needed briefly for replay)
      if (execution.status === 'done' || execution.status === 'error') {
        setTimeout(() => {
          this.executions.delete(execution.id);
          execution.stream.close();
        }, 300_000).unref(); // 5 min — prevents HTTP 410 on dispatch --check
      }

      return execution;
    } catch (err) {
      console.warn(`[ExecMgr] Failed to recover execution from streams:`, err);
      return undefined;
    }
  }

  private reconstructExecution(
    sessionId: string,
    _streamId: string,
    events: ActivityEvent[],
    startEvent: ActivityEvent,
  ): Execution {
    const doneEvent = events.find(e => e.type === 'msg:done');
    const errorEvent = events.find(e => e.type === 'msg:error');
    const awaitingEvent = events.find(e => e.type === 'msg:awaiting_input');
    const status: ExecStatus = awaitingEvent && !doneEvent ? 'awaiting_input'
      : doneEvent ? 'done'
      : errorEvent ? 'error'
      : 'running';  // No done/error event = still running

    const stream = ActivityStream.getOrCreate(sessionId, startEvent.roleId);
    const execution: Execution = {
      id: `recovered-${sessionId}`,
      sessionId,
      type: (startEvent.data.type as string ?? 'assign') as ExecType,
      roleId: startEvent.roleId,
      task: startEvent.data.task as string ?? '',
      status,
      stream,
      abort: () => {},
      childSessionIds: [],
      createdAt: startEvent.ts,
      result: doneEvent?.data?.output
        ? { output: doneEvent.data.output as string, turns: 0, totalTokens: { input: 0, output: 0 }, toolCalls: [], dispatches: [] }
        : undefined,
    };

    this.executions.set(execution.id, execution);
    console.log(`[ExecMgr] Recovered execution for session ${sessionId} (status: ${execution.status})`);
    return execution;
  }
}

/* ─── Export singleton ───────────────────── */

export const executionManager = new ExecutionManager();

/** Backward-compat alias for gradual migration */
export const jobManager = executionManager;
