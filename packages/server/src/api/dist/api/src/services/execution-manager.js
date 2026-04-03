import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';
import { COMPANY_ROOT } from './file-reader.js';
import { ActivityStream } from './activity-stream.js';
import { buildOrgTree } from '../engine/org-tree.js';
import { validateDispatch, validateConsult } from '../engine/authority-validator.js';
import { createRunner } from '../engine/runners/index.js';
import { estimateCost } from './pricing.js';
import { readConfig, getConversationLimits, resolveCodeRoot } from './company-config.js';
import { postKnowledgingCheck } from '../engine/knowledge-gate.js';
import { earnCoinsInternal } from '../routes/coins.js';
import { getSession, createSession, addMessage, updateMessage as updateSessionMessage, updateSession, appendMessageEvent } from './session-store.js';
import { portRegistry } from './port-registry.js';
export { canTransition, messageStatusToRoleStatus } from '../../../shared/types.js';
/* ─── Helpers ────────────────────────────── */
function summarizeInput(input) {
    const summary = {};
    for (const [key, value] of Object.entries(input)) {
        if (typeof value === 'string' && value.length > 200) {
            summary[key] = value.slice(0, 200) + '...';
        }
        else {
            summary[key] = value;
        }
    }
    return summary;
}
function hasQuestion(output) {
    const lastBlock = output.trim().split('\n').slice(-5).join('\n');
    return /\?\s*$/.test(lastBlock) || /할까요|해볼까요|어떨까요|확인.*필요/.test(lastBlock);
}
/* ─── [APPROVAL_NEEDED] Detection ─── */
const APPROVAL_TAGS = /\[APPROVAL_NEEDED\]|\[CEO_DECISION\]|\[DECISION_REQUIRED\]/;
function extractApprovalQuestion(output) {
    const idx = output.search(APPROVAL_TAGS);
    if (idx === -1)
        return null;
    // Extract text after the tag until end or next section marker
    const afterTag = output.slice(idx);
    const lines = afterTag.split('\n');
    // Take up to 10 lines after the tag line for context
    const relevant = lines.slice(0, 10).join('\n').trim();
    return relevant || null;
}
function sendApprovalNotification(roleId, question) {
    try {
        const title = `Tycono: ${roleId} needs approval`;
        const msg = question.replace(/["\\\n]/g, ' ').slice(0, 200);
        execSync(`osascript -e 'display notification "${msg}" with title "${title}" sound name "Ping"'`);
    }
    catch { /* ignore on non-macOS */ }
}
function isExecActive(status) {
    return status === 'running' || status === 'awaiting_input';
}
function resolveTargetRole(sourceRole, parentSessionId, executions) {
    if (sourceRole && sourceRole !== 'ceo')
        return sourceRole;
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
    executions = new Map();
    runner = createRunner();
    nextId = 1;
    executionCreatedListeners = new Set();
    pendingAmendments = new Map(); // sessionId → queued tasks
    setRunner(newRunner) {
        this.runner = newRunner;
    }
    refreshRunner() {
        this.runner = createRunner();
    }
    onExecutionCreated(listener) {
        this.executionCreatedListeners.add(listener);
        return () => { this.executionCreatedListeners.delete(listener); };
    }
    startExecution(params) {
        const execId = `exec-${Date.now()}-${this.nextId++}`;
        // Resolve preset from wave file for org tree building
        let presetId;
        const session = getSession(params.sessionId);
        if (session?.waveId) {
            try {
                const wavePath = path.join(COMPANY_ROOT, '.tycono', 'waves', `${session.waveId}.json`);
                if (fs.existsSync(wavePath)) {
                    const waveData = JSON.parse(fs.readFileSync(wavePath, 'utf-8'));
                    presetId = waveData.preset;
                }
            }
            catch { /* ignore */ }
        }
        const orgTree = buildOrgTree(COMPANY_ROOT, presetId);
        // Authority gate
        if (params.sourceRole && params.sourceRole !== 'ceo') {
            if (params.type === 'consult') {
                const auth = validateConsult(orgTree, params.sourceRole, params.roleId);
                if (!auth.allowed) {
                    throw new Error(`Authority denied: ${auth.reason}`);
                }
            }
            else if (params.type === 'assign' && params.parentSessionId) {
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
        const execution = {
            id: execId,
            sessionId: params.sessionId,
            type: params.type,
            roleId: params.roleId,
            task: params.task,
            status: 'running',
            stream,
            abort: () => { },
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
    async initializeAndRunExecution(execution, params, orgTree, presetId) {
        try {
            const ports = await portRegistry.allocate(execution.sessionId || execution.id, params.roleId, params.task);
            execution.ports = ports;
            console.log(`[ExecMgr] Allocated ports for ${execution.id} (${params.roleId}): API :${ports.api}, Vite :${ports.vite}`);
        }
        catch (err) {
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
                }
                catch { /* ignore */ }
            }
        }
        const config = readConfig(COMPANY_ROOT);
        const limits = getConversationLimits(config);
        let harnessTurnCount = 0;
        let softLimitWarned = false;
        let hardLimitReached = false;
        const outputChunks = [];
        const teamStatus = {};
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
        const priorDispatches = [];
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
        const handle = this.runner.execute({
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
            codeRoot: resolveCodeRoot(COMPANY_ROOT),
            attachments: params.attachments,
            cliSessionId: params.cliSessionId,
            priorDispatches,
            env: {
                ...process.env,
                ...portEnv,
            },
            // SV-6, SV-7: Supervision callbacks (direct-api runner only)
            onAbortSession: (sessionId) => this.abortSession(sessionId),
            onAmendSession: (sessionId, instruction) => {
                const result = this.continueSession(sessionId, `[SUPERVISION AMENDMENT] ${instruction}`, params.roleId);
                return result !== null;
            },
        }, {
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
                        const amended = this.continueSession(decision.prevSessionId, `[FOLLOW-UP from ${params.roleId}] ${subTask}`, params.roleId);
                        if (amended)
                            return;
                        // continueSession failed — fall through to new dispatch
                        console.warn(`[ExecMgr] continueSession failed for ${decision.prevSessionId}, creating new session`);
                    }
                }
                const childSession = createSession(subRoleId, {
                    mode: 'do',
                    source: 'dispatch',
                    parentSessionId: execution.sessionId,
                    ...(parentWaveId && { waveId: parentWaveId }),
                });
                const dispatchMsg = {
                    id: `msg-${Date.now()}-dispatch-${subRoleId}`,
                    from: 'ceo',
                    content: subTask,
                    type: 'directive',
                    status: 'done',
                    timestamp: new Date().toISOString(),
                };
                addMessage(childSession.id, dispatchMsg);
                const childExec = this.startExecution({
                    type: 'assign',
                    roleId: subRoleId,
                    task: subTask,
                    sourceRole: params.roleId,
                    parentSessionId: execution.sessionId,
                    targetRoles: params.targetRoles,
                    sessionId: childSession.id,
                });
                const childRoleMsg = {
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
            onTurnComplete: (turn) => {
                harnessTurnCount++;
                execution.stream.emit('msg:turn-complete', params.roleId, {
                    turn: harnessTurnCount,
                    runnerTurn: turn,
                });
                if (!softLimitWarned && harnessTurnCount >= limits.softLimit) {
                    softLimitWarned = true;
                    console.warn(`[Harness] Exec ${execution.id} (${params.roleId}): turn ${harnessTurnCount} reached softLimit (${limits.softLimit})`);
                    execution.stream.emit('turn:warning', params.roleId, {
                        turn: harnessTurnCount,
                        softLimit: limits.softLimit,
                        hardLimit: limits.hardLimit,
                    });
                }
                if (harnessTurnCount >= limits.hardLimit) {
                    hardLimitReached = true;
                    console.warn(`[Harness] Exec ${execution.id} (${params.roleId}): turn ${harnessTurnCount} reached hardLimit (${limits.hardLimit}). Pausing for approval.`);
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
        });
        execution.abort = handle.abort;
        // Notify listeners
        for (const listener of this.executionCreatedListeners) {
            try {
                listener(execution);
            }
            catch { /* ignore */ }
        }
        handle.promise
            .then((result) => {
            execution.result = result;
            if (result.cliSessionId)
                execution.cliSessionId = result.cliSessionId;
            const costUsd = estimateCost(result.totalTokens.input, result.totalTokens.output, model ?? '');
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
                            const state = supervisorHeartbeat.getState(session.waveId);
                            if (state && state.status !== 'awaiting_approval') {
                                console.log(`[Approval] Direct supervisor notification: wave ${session.waveId} → awaiting_approval`);
                                state.status = 'awaiting_approval';
                            }
                        }).catch(() => { });
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
            }
            else if (!params.isContinuation && hasQuestion(result.output)) {
                // CEO supervisor should auto-continue instead of hanging on awaiting_input
                // (subordinates may have completed while CEO was running — CEO needs to synthesize results)
                const session = getSession(execution.sessionId);
                if (session?.roleId === 'ceo' && session?.source === 'wave') {
                    console.log(`[Harness] CEO supervisor hasQuestion — auto-continuing to synthesize results`);
                    setTimeout(() => {
                        this.continueSession(execution.sessionId, 'All dispatched sessions have completed. Synthesize the results from your team and provide a final briefing.');
                    }, 3_000);
                }
                else {
                    execution.status = 'awaiting_input';
                    execution.targetRole = targetRole;
                    execution.stream.emit('msg:awaiting_input', params.roleId, {
                        ...doneData,
                        question: result.output.trim().split('\n').slice(-5).join('\n'),
                        awaitingInput: true,
                        targetRole,
                    });
                }
            }
            else {
                const changedMdFiles = result.toolCalls
                    .filter(tc => (tc.name === 'write_file' || tc.name === 'edit_file') && tc.input && typeof tc.input.path === 'string')
                    .map(tc => String(tc.input.path))
                    .filter(p => p.endsWith('.md'));
                if (changedMdFiles.length > 0) {
                    try {
                        const pkResult = postKnowledgingCheck(COMPANY_ROOT, changedMdFiles);
                        if (!pkResult.pass) {
                            execution.knowledgeDebt = pkResult.debt;
                            console.log(`[Post-K] Exec ${execution.id} (${params.roleId}): ${pkResult.debt.length} knowledge debt item(s)`);
                            for (const d of pkResult.debt) {
                                console.log(`  [Post-K] ${d.type}: ${d.message}`);
                            }
                            doneData.knowledgeDebt = pkResult.debt.map(d => ({
                                type: d.type,
                                file: d.file,
                                message: d.message,
                            }));
                        }
                    }
                    catch (err) {
                        console.warn('[Post-K] Check failed:', err);
                    }
                }
                execution.status = 'done';
                execution.stream.emit('msg:done', params.roleId, doneData);
                if (execution.sessionId) {
                    this.finalizeSessionMessage(execution, 'done', result);
                }
                // Emit dispatch:done on parent's stream (monni VOC: parent needs completion signal)
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
                    }
                    catch { /* non-critical */ }
                }
                this.cleanupOrphanedChildren(execution.sessionId);
                this.attemptSupervisionRecovery(execution);
            }
        })
            .catch((err) => {
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
                const hasActiveSibling = [...this.executions.values()].some(e => e.sessionId === execution.sessionId && e.id !== execution.id && (e.status === 'running' || e.status === 'awaiting_input'));
                if (!hasActiveSibling) {
                    execution.stream.close();
                }
            }, 300_000).unref(); // 5 min — prevents HTTP 410 on dispatch --check
        });
    }
    /** Debug: return memory stats for monitoring */
    getMemoryStats() {
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
    sessionMsgContent = new Map();
    updateSessionRoleMessage(execution, text) {
        if (!execution.sessionId)
            return;
        const session = getSession(execution.sessionId);
        if (!session)
            return;
        // Find the latest streaming role message
        const roleMsg = [...session.messages].reverse().find(m => m.from === 'role' && m.status === 'streaming');
        if (!roleMsg)
            return;
        const key = `${execution.sessionId}:${roleMsg.id}`;
        const current = (this.sessionMsgContent.get(key) ?? '') + text;
        this.sessionMsgContent.set(key, current);
        updateSessionMessage(execution.sessionId, roleMsg.id, { content: current });
    }
    embedSessionEvent(execution, type, data) {
        if (!execution.sessionId)
            return;
        const session = getSession(execution.sessionId);
        if (!session)
            return;
        const roleMsg = [...session.messages].reverse().find(m => m.from === 'role' && m.status === 'streaming');
        if (!roleMsg)
            return;
        const event = {
            seq: (roleMsg.events?.length ?? 0) + 1,
            ts: new Date().toISOString(),
            type: type,
            roleId: execution.roleId,
            data,
        };
        appendMessageEvent(execution.sessionId, roleMsg.id, event);
    }
    finalizeSessionMessage(execution, status, result) {
        if (!execution.sessionId)
            return;
        const session = getSession(execution.sessionId);
        if (!session)
            return;
        const roleMsg = [...session.messages].reverse().find(m => m.from === 'role');
        if (!roleMsg)
            return;
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
    cleanupOrphanedChildren(parentSessionId) {
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
    getRunningChildren(parentSessionId) {
        const running = [];
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
    attemptSupervisionRecovery(deadExecution) {
        const runningChildren = this.getRunningChildren(deadExecution.sessionId);
        if (runningChildren.length === 0)
            return;
        // Only restart C-Level roles (CTO, CBO etc.)
        // Resolve preset from wave file for correct org tree
        let recoveryPresetId;
        const deadSession = getSession(deadExecution.sessionId);
        if (deadSession?.waveId) {
            try {
                const wp = path.join(COMPANY_ROOT, '.tycono', 'waves', `${deadSession.waveId}.json`);
                if (fs.existsSync(wp)) {
                    recoveryPresetId = JSON.parse(fs.readFileSync(wp, 'utf-8')).preset;
                }
            }
            catch { /* ignore */ }
        }
        const orgTree = buildOrgTree(COMPANY_ROOT, recoveryPresetId);
        const node = orgTree.nodes.get(deadExecution.roleId);
        if (!node || node.level !== 'c-level')
            return;
        const childSummary = runningChildren.map(c => `- [${c.roleId}] Session: ${c.sessionId} | Task: ${c.task.slice(0, 150)}`).join('\n');
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
        }
        catch (err) {
            console.error(`[ExecMgr] Supervision recovery failed for ${deadExecution.roleId}:`, err);
        }
    }
    getExecution(id) {
        return this.executions.get(id);
    }
    getActiveExecution(sessionId) {
        let active;
        let latest;
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
        if (active ?? latest)
            return active ?? latest;
        return this.recoverExecutionFromStream(sessionId);
    }
    /** Find the latest completed execution for a session (for auto-amend lookup) */
    getCompletedExecution(sessionId) {
        let latest;
        for (const exec of this.executions.values()) {
            if (exec.sessionId === sessionId && exec.status === 'done') {
                if (!latest || exec.createdAt > latest.createdAt) {
                    latest = exec;
                }
            }
        }
        return latest ? { task: latest.task, cliSessionId: latest.cliSessionId } : undefined;
    }
    listExecutions(filter) {
        const result = [];
        for (const exec of this.executions.values()) {
            if (filter?.active && !isExecActive(exec.status))
                continue;
            if (filter?.status && exec.status !== filter.status)
                continue;
            if (filter?.roleId && exec.roleId !== filter.roleId)
                continue;
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
    abortSession(sessionId) {
        const exec = this.getActiveExecution(sessionId);
        if (!exec || !isExecActive(exec.status))
            return false;
        if (exec.status === 'running')
            exec.abort();
        exec.status = 'error';
        exec.error = 'Aborted by user';
        exec.stream.emit('msg:error', exec.roleId, { message: 'Aborted by user' });
        return true;
    }
    /** Also support aborting by execution ID for internal use */
    abortExecution(execId) {
        const exec = this.executions.get(execId);
        if (!exec || !isExecActive(exec.status))
            return false;
        if (exec.status === 'running')
            exec.abort();
        exec.status = 'error';
        exec.error = 'Aborted by user';
        exec.stream.emit('msg:error', exec.roleId, { message: 'Aborted by user' });
        return true;
    }
    continueSession(sessionId, response, responderRole) {
        const exec = this.getActiveExecution(sessionId);
        if (!exec || (exec.status !== 'awaiting_input' && exec.status !== 'done'))
            return null;
        const isFollowUp = exec.status === 'done';
        const effectiveResponder = responderRole ?? exec.targetRole ?? 'ceo';
        exec.status = 'done';
        exec.stream.emit('msg:reply', exec.roleId, { response, responderRole: effectiveResponder, isFollowUp });
        const prevOutput = exec.result?.output ?? '';
        const hasCliSession = !!exec.cliSessionId;
        const responderLabel = effectiveResponder === 'ceo' ? 'CEO' : effectiveResponder.toUpperCase();
        let continuationTask;
        if (hasCliSession) {
            // --resume preserves full conversation context — no need to repeat output
            continuationTask = isFollowUp
                ? `[CEO Follow-up Directive]\n${response}`
                : `[${responderLabel} Response — continue where you left off]\n${response}`;
        }
        else {
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
    queueAmendment(sessionId, task) {
        const queue = this.pendingAmendments.get(sessionId) ?? [];
        queue.push(task);
        this.pendingAmendments.set(sessionId, queue);
        console.log(`[Dispatch] Queued amendment for ${sessionId} (${queue.length} pending)`);
    }
    /**
     * Process pending amendments after execution completes.
     * Called from finalization logic.
     */
    processPendingAmendments(sessionId) {
        const queue = this.pendingAmendments.get(sessionId);
        if (!queue || queue.length === 0)
            return;
        const task = queue.shift();
        if (queue.length === 0) {
            this.pendingAmendments.delete(sessionId);
        }
        console.log(`[Dispatch] Processing queued amendment for ${sessionId} (${queue.length} remaining)`);
        // Use setTimeout to avoid recursive call stack during finalization
        setTimeout(() => {
            this.continueSession(sessionId, task);
        }, 100);
    }
    getActiveExecutionForRole(roleId) {
        for (const exec of this.executions.values()) {
            if (exec.roleId === roleId && isExecActive(exec.status)) {
                return exec;
            }
        }
        return undefined;
    }
    recoverExecutionFromStream(sessionId) {
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
            let bestExec;
            for (const streamId of streamIds) {
                if (this.executions.has(streamId))
                    continue;
                const events = ActivityStream.readAll(streamId);
                const startEvent = events.find(e => e.type === 'msg:start');
                if (!startEvent || startEvent.data.sessionId !== sessionId)
                    continue;
                const doneEvent = events.find(e => e.type === 'msg:done');
                const errorEvent = events.find(e => e.type === 'msg:error');
                const awaitingEvent = events.find(e => e.type === 'msg:awaiting_input');
                const status = awaitingEvent && !doneEvent ? 'awaiting_input'
                    : doneEvent ? 'done'
                        : errorEvent ? 'error'
                            : 'running'; // No done/error event = still running
                const candidate = {
                    streamId,
                    roleId: startEvent.roleId,
                    task: startEvent.data.task ?? '',
                    type: (startEvent.data.type ?? 'assign'),
                    status,
                    createdAt: startEvent.ts,
                    output: doneEvent?.data?.output,
                };
                if (!bestExec || candidate.createdAt > bestExec.createdAt) {
                    bestExec = candidate;
                }
            }
            if (!bestExec)
                return undefined;
            const stream = ActivityStream.getOrCreate(sessionId, bestExec.roleId);
            const execution = {
                id: `recovered-${bestExec.streamId}`,
                sessionId,
                type: bestExec.type,
                roleId: bestExec.roleId,
                task: bestExec.task,
                status: bestExec.status,
                stream,
                abort: () => { },
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
        }
        catch (err) {
            console.warn(`[ExecMgr] Failed to recover execution from streams:`, err);
            return undefined;
        }
    }
    reconstructExecution(sessionId, _streamId, events, startEvent) {
        const doneEvent = events.find(e => e.type === 'msg:done');
        const errorEvent = events.find(e => e.type === 'msg:error');
        const awaitingEvent = events.find(e => e.type === 'msg:awaiting_input');
        const status = awaitingEvent && !doneEvent ? 'awaiting_input'
            : doneEvent ? 'done'
                : errorEvent ? 'error'
                    : 'running'; // No done/error event = still running
        const stream = ActivityStream.getOrCreate(sessionId, startEvent.roleId);
        const execution = {
            id: `recovered-${sessionId}`,
            sessionId,
            type: (startEvent.data.type ?? 'assign'),
            roleId: startEvent.roleId,
            task: startEvent.data.task ?? '',
            status,
            stream,
            abort: () => { },
            childSessionIds: [],
            createdAt: startEvent.ts,
            result: doneEvent?.data?.output
                ? { output: doneEvent.data.output, turns: 0, totalTokens: { input: 0, output: 0 }, toolCalls: [], dispatches: [] }
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
