import { AnthropicProvider, type LLMProvider, type LLMMessage, type ToolResult, type MessageContent } from './llm-adapter.js';
import { type OrgTree, getSubordinates } from './org-tree.js';
import { assembleContext, type TeamStatus } from './context-assembler.js';
import { validateDispatch, validateConsult } from './authority-validator.js';
import { getToolsForRole } from './tools/definitions.js';
import { executeTool, type ToolExecutorOptions } from './tools/executor.js';
import { type TokenLedger } from '../services/token-ledger.js';
import { estimateCost } from '../services/pricing.js';
import { type ImageAttachment } from './runners/types.js';

/* ─── Types ──────────────────────────────────── */

export interface AgentConfig {
  companyRoot: string;
  roleId: string;
  task: string;
  sourceRole: string;
  orgTree: OrgTree;
  readOnly?: boolean;
  maxTurns?: number;
  codeRoot?: string;  // EG-001: code project root for bash_execute
  llm?: LLMProvider;
  depth?: number;             // Current dispatch depth (default 0)
  visitedRoles?: Set<string>; // Circular dispatch detection
  abortSignal?: AbortSignal;  // Abort signal for cancellation
  teamStatus?: TeamStatus;    // Current team member statuses
  sessionId: string;          // D-014: Session ID for token tracking (required)
  model?: string;             // LLM model name for cost tracking
  tokenLedger?: TokenLedger;  // Token usage ledger (optional)
  attachments?: ImageAttachment[];  // Image attachments for vision
  targetRoles?: string[];          // Selective dispatch scope
  // Callbacks
  onText?: (text: string) => void;
  onToolExec?: (name: string, input: Record<string, unknown>) => void;
  onDispatch?: (roleId: string, task: string) => void;
  onConsult?: (roleId: string, question: string) => void;
  onTurnComplete?: (turn: number) => void;
  /** Trace: emitted when system prompt is assembled */
  onPromptAssembled?: (systemPrompt: string, userTask: string) => void;
  /** Supervision: abort a running session */
  onAbortSession?: (sessionId: string) => boolean;
  /** Supervision: amend a running session with new instructions */
  onAmendSession?: (sessionId: string, instruction: string) => boolean;
}

export interface AgentResult {
  output: string;
  turns: number;
  totalTokens: { input: number; output: number };
  toolCalls: Array<{ name: string; input: Record<string, unknown> }>;
  dispatches: Array<{ roleId: string; task: string; result: string }>;
}

/* ─── EG-006: Context Compression ────────────── */

/**
 * Compress older messages to reduce token usage.
 *
 * SV-9 Enhancement: Zone-based compression for supervision sessions.
 * - Zone A (pinned): first 2 messages (system prompt + original task + plan) — never compress
 * - Zone B (rolling): middle messages — heartbeat ticks get aggressive compression
 * - Zone C (recent): last 4 messages — preserve for LLM context
 *
 * Heartbeat-specific: consecutive quiet ticks are merged into a single line.
 */
function compressMessages(messages: LLMMessage[]): void {
  if (messages.length <= 6) return;

  // Zone A: first 2, Zone C: last 4
  const keepHead = 2;
  const keepTail = 4;
  const compressRange = messages.slice(keepHead, messages.length - keepTail);

  // Track consecutive quiet heartbeat ticks for merging
  let quietTickStart = -1;
  let quietTickCount = 0;

  for (let idx = 0; idx < compressRange.length; idx++) {
    const msg = compressRange[idx];

    if (typeof msg.content === 'string') {
      // Check if this is a heartbeat quiet tick result
      const isQuietTick = msg.content.includes('sessions progressing normally') && msg.content.includes('No anomalies');

      if (isQuietTick) {
        quietTickCount++;
        if (quietTickStart === -1) quietTickStart = idx;

        // Merge consecutive quiet ticks
        if (quietTickCount > 1) {
          msg.content = `[Quiet ticks merged: ${quietTickCount} ticks, no anomalies]`;
        }
        continue;
      }

      // Reset quiet tick counter on non-quiet content
      quietTickStart = -1;
      quietTickCount = 0;

      // Truncate long text content
      if (msg.content.length > 500) {
        msg.content = msg.content.slice(0, 300) + '\n\n[... compressed ...]';
      }
    } else if (Array.isArray(msg.content)) {
      for (let i = 0; i < msg.content.length; i++) {
        const block = msg.content[i] as Record<string, unknown>;
        if (block.type === 'tool_result') {
          const content = typeof block.content === 'string' ? block.content : '';

          // Heartbeat digest results: compress more aggressively
          const isDigest = content.includes('Supervision Digest') || content.includes('sessions progressing normally');
          const maxLen = isDigest ? 150 : 300;

          if (content.length > maxLen) {
            block.content = content.slice(0, maxLen - 50) + '\n[... compressed, was ' + content.length + ' chars]';
          }
        } else if (block.type === 'text' && typeof block.text === 'string' && block.text.length > 500) {
          block.text = (block.text as string).slice(0, 300) + '\n[... compressed ...]';
        }
      }
    }
  }
}

/* ─── Agent Loop ─────────────────────────────── */

export async function runAgentLoop(config: AgentConfig): Promise<AgentResult> {
  const {
    companyRoot,
    roleId,
    task,
    sourceRole,
    orgTree,
    readOnly = false,
    maxTurns = 20,
    abortSignal,
    onText,
    onToolExec,
    onDispatch: onDispatchCallback,
    onConsult: onConsultCallback,
    onTurnComplete,
  } = config;

  // Depth and circular dispatch guard
  const depth = config.depth ?? 0;
  const visitedRoles = config.visitedRoles ?? new Set<string>();

  // Depth limit check
  if (depth >= 3) {
    return {
      output: `[DISPATCH BLOCKED] Max dispatch depth (3) exceeded. Role: ${roleId}`,
      turns: 0,
      totalTokens: { input: 0, output: 0 },
      toolCalls: [],
      dispatches: [],
    };
  }

  // Mark current role as visited
  visitedRoles.add(roleId);

  const llm = config.llm ?? new AnthropicProvider();

  // 1. Assemble context
  const context = assembleContext(companyRoot, roleId, task, sourceRole, orgTree, { teamStatus: config.teamStatus, targetRoles: config.targetRoles });

  // Trace: capture assembled prompt for debugging
  config.onPromptAssembled?.(context.systemPrompt, task);

  // 2. Determine tools
  const subordinates = getSubordinates(orgTree, roleId);
  const hasBash = !readOnly && !!config.codeRoot;
  const node = orgTree.nodes.get(roleId);
  const heartbeatEnabled = node?.heartbeat?.enabled === true && subordinates.length > 0;
  const tools = getToolsForRole(subordinates.length > 0, readOnly, hasBash, heartbeatEnabled);

  // 3. Set up tool executor
  const toolExecOptions: ToolExecutorOptions = {
    companyRoot,
    roleId,
    orgTree,
    codeRoot: config.codeRoot,
    sessionId: config.sessionId,
    onToolExec,
    onAbortSession: config.onAbortSession,
    onAmendSession: config.onAmendSession,
    onDispatch: async (targetRoleId: string, subTask: string) => {
      // Recursive dispatch — validate, then run sub-agent
      const authResult = validateDispatch(orgTree, roleId, targetRoleId);
      if (!authResult.allowed) {
        return `Dispatch rejected: ${authResult.reason}`;
      }

      // Circular dispatch detection
      if (visitedRoles.has(targetRoleId)) {
        return `[DISPATCH BLOCKED] Circular dispatch detected: ${roleId} → ${targetRoleId}. Chain: ${[...visitedRoles].join(' → ')}`;
      }

      onDispatchCallback?.(targetRoleId, subTask);

      // Run sub-agent (recursive) — pass depth+1 and a copy of visitedRoles
      const subResult = await runAgentLoop({
        companyRoot,
        roleId: targetRoleId,
        task: subTask,
        sourceRole: roleId,
        orgTree,
        readOnly: false,
        maxTurns: Math.min(maxTurns, 15), // Limit sub-agent turns
        codeRoot: config.codeRoot,
        llm,
        depth: depth + 1,
        visitedRoles: new Set(visitedRoles), // Copy for parallel dispatch support
        abortSignal,
        sessionId: config.sessionId,
        model: config.model,
        tokenLedger: config.tokenLedger,
        onText: (text) => onText?.(`[${targetRoleId}] ${text}`),
        onToolExec,
      });

      // Aggregate sub-agent tokens into parent totals
      totalInput += subResult.totalTokens.input;
      totalOutput += subResult.totalTokens.output;

      return subResult.output;
    },
    onConsult: async (targetRoleId: string, question: string) => {
      // Authority check
      const authResult = validateConsult(orgTree, roleId, targetRoleId);
      if (!authResult.allowed) {
        return `Consult rejected: ${authResult.reason}`;
      }

      // Circular consult detection
      if (visitedRoles.has(targetRoleId)) {
        return `[CONSULT BLOCKED] Circular consult detected: ${roleId} → ${targetRoleId}. Chain: ${[...visitedRoles].join(' → ')}`;
      }

      onConsultCallback?.(targetRoleId, question);

      // Run sub-agent in read-only mode for the consulted role
      const consultTask = `[Consultation from ${roleId}] ${question}\n\nAnswer this question based on your role's expertise and knowledge. Be concise and specific.`;
      const subResult = await runAgentLoop({
        companyRoot,
        roleId: targetRoleId,
        task: consultTask,
        sourceRole: roleId,
        orgTree,
        readOnly: true, // Consult is always read-only
        maxTurns: Math.min(maxTurns, 10), // Limit consult turns
        llm,
        depth: depth + 1,
        visitedRoles: new Set(visitedRoles),
        abortSignal,
        sessionId: config.sessionId,
        model: config.model,
        tokenLedger: config.tokenLedger,
        onText: (text) => onText?.(`[consult:${targetRoleId}] ${text}`),
        onToolExec,
      });

      // Aggregate sub-agent tokens
      totalInput += subResult.totalTokens.input;
      totalOutput += subResult.totalTokens.output;

      return subResult.output;
    },
  };

  // 4. Run the loop
  // Build initial user message with optional image attachments
  const userContent: MessageContent[] = [];

  // Add image attachments first (if any)
  if (config.attachments && config.attachments.length > 0) {
    for (const att of config.attachments) {
      userContent.push({
        type: 'image',
        source: {
          type: 'base64',
          media_type: att.mediaType,
          data: att.data,
        },
      } as unknown as MessageContent);
    }
  }

  // Add text content
  userContent.push({ type: 'text', text: task });

  const messages: LLMMessage[] = [
    { role: 'user', content: userContent.length === 1 ? task : userContent },
  ];

  let turns = 0;
  let totalInput = 0;
  let totalOutput = 0;
  const allToolCalls: AgentResult['toolCalls'] = [];
  const dispatches: AgentResult['dispatches'] = [];
  const outputParts: string[] = [];

  // EG-006/007: Context compression + token budget
  const COMPRESS_THRESHOLD = 100_000;
  const TOKEN_WARN_THRESHOLD = 200_000; // Warn at 200K total tokens
  let tokenWarningEmitted = false;

  while (turns < maxTurns) {
    // Check abort signal before each turn
    if (abortSignal?.aborted) break;

    turns++;

    // EG-006: Compress old messages when token budget exceeded
    if (totalInput > COMPRESS_THRESHOLD && messages.length > 4) {
      compressMessages(messages);
    }

    // Call LLM
    const response = await llm.chat(context.systemPrompt, messages, tools, abortSignal);
    totalInput += response.usage.inputTokens;
    totalOutput += response.usage.outputTokens;

    // EG-007: Token budget warning
    if (!tokenWarningEmitted && (totalInput + totalOutput) > TOKEN_WARN_THRESHOLD) {
      tokenWarningEmitted = true;
      const cost = estimateCost(totalInput, totalOutput, config.model ?? 'unknown');
      onText?.(`\n\n⚠️ [Token Budget Warning] This task has used ${totalInput.toLocaleString()} input + ${totalOutput.toLocaleString()} output tokens (~$${cost.toFixed(3)}). Consider wrapping up.\n\n`);
    }

    // Record token usage
    config.tokenLedger?.record({
      ts: new Date().toISOString(),
      sessionId: config.sessionId,
      roleId,
      model: config.model ?? 'unknown',
      inputTokens: response.usage.inputTokens,
      outputTokens: response.usage.outputTokens,
    });

    // Process response content
    const assistantContent: MessageContent[] = response.content;
    messages.push({ role: 'assistant', content: assistantContent });

    // Extract text parts
    for (const block of response.content) {
      if (block.type === 'text' && block.text) {
        outputParts.push(block.text);
        onText?.(block.text);
      }
    }

    // If no tool use, we're done
    if (response.stopReason === 'end_turn' || response.stopReason !== 'tool_use') {
      break;
    }

    // Process tool calls
    const toolCalls = response.content.filter(
      (b): b is MessageContent & { type: 'tool_use' } => b.type === 'tool_use'
    );

    // EG-004: Parallel tool execution for independent tools
    // dispatch/consult/heartbeat run sequentially (recursive agent calls / blocking)
    // All other tools run in parallel via Promise.all()
    const sequentialTools = new Set(['dispatch', 'consult', 'heartbeat_watch']);
    const parallelCalls = toolCalls.filter(tc => !sequentialTools.has(tc.name));
    const sequentialCalls = toolCalls.filter(tc => sequentialTools.has(tc.name));

    // Record all tool calls
    for (const tc of toolCalls) {
      allToolCalls.push({ name: tc.name, input: tc.input });
    }

    // Run parallel tools concurrently
    const parallelResults = await Promise.all(
      parallelCalls.map(tc =>
        executeTool({ id: tc.id, name: tc.name, input: tc.input }, toolExecOptions)
      )
    );

    // Run sequential tools one by one
    const sequentialResults: ToolResult[] = [];
    for (const tc of sequentialCalls) {
      const result = await executeTool(
        { id: tc.id, name: tc.name, input: tc.input },
        toolExecOptions,
      );
      sequentialResults.push(result);

      // Track dispatches
      if (tc.name === 'dispatch' && !result.is_error) {
        dispatches.push({
          roleId: String(tc.input.roleId),
          task: String(tc.input.task),
          result: result.content,
        });
      }
    }

    // EG-005: Merge results in original tool_use_id order
    const resultMap = new Map<string, ToolResult>();
    for (const r of [...parallelResults, ...sequentialResults]) {
      resultMap.set(r.tool_use_id, r);
    }
    const toolResults = toolCalls.map(tc => resultMap.get(tc.id)!);

    // Track dispatches from parallel results too
    for (const tc of parallelCalls) {
      if (tc.name === 'dispatch') {
        const r = resultMap.get(tc.id)!;
        if (!r.is_error) {
          dispatches.push({
            roleId: String(tc.input.roleId),
            task: String(tc.input.task),
            result: r.content,
          });
        }
      }
    }

    // Send tool results back
    messages.push({
      role: 'user',
      content: toolResults.map((r) => ({
        type: 'tool_result' as const,
        tool_use_id: r.tool_use_id,
        content: r.content,
        is_error: r.is_error,
      })) as unknown as MessageContent[],
    });

    onTurnComplete?.(turns);
  }

  // ── Post-execution phases (depth 0 only) ──
  if (!readOnly && depth === 0 && turns > 0) {
    const node = orgTree.nodes.get(roleId);
    const isCLevel = node?.level === 'c-level';

    // Phase A: C-Level Supervision Loop — review dispatches, update knowledge, dispatch next
    if (isCLevel && dispatches.length > 0) {
      const dispatchSummary = dispatches.map((d, i) =>
        `${i + 1}. **${d.roleId}**: "${d.task.slice(0, 80)}"\n   Result: ${d.result.slice(0, 300)}`,
      ).join('\n\n');

      // Build list of already-dispatched tasks to prevent re-dispatch
      const dispatchedList = dispatches.map(d => `- ${d.roleId}: "${d.task.slice(0, 100)}"`).join('\n');

      const supervisionPrompt = [
        '[SUPERVISION LOOP] Your subordinates have completed their tasks. Follow the C-Level Protocol:',
        '',
        '## Subordinate Results',
        dispatchSummary,
        '',
        '## Already Dispatched (DO NOT re-dispatch these)',
        dispatchedList,
        '',
        '⛔ **Do NOT re-dispatch the same or similar task to the same role.** If a subordinate already completed a task, accept the result and move on.',
        '⛔ **If the result is satisfactory, do NOT dispatch again.** Only re-dispatch if the result clearly fails acceptance criteria with SPECIFIC feedback on what to fix.',
        '',
        '## Required Actions (do ALL of these):',
        '',
        '### 1. Review',
        'Does each result meet the acceptance criteria? If clearly unsatisfactory, re-dispatch with SPECIFIC fix instructions (not the same task again).',
        '',
        '### 2. Knowledge Update (The Loop Step ④)',
        'Record any new decisions, findings, or analysis in appropriate AKB documents:',
        '- Update your journal (`roles/' + roleId + '/journal/`)',
        '- Update relevant project docs if needed',
        '- Update knowledge/ if there are reusable insights',
        '',
        '### 3. Task Update (The Loop Step ⑤)',
        'Update task status in the relevant tasks.md or project documents.',
        'Mark completed items as DONE. Identify the NEXT task to dispatch.',
        '',
        '### 4. Next Dispatch (ONLY if there is genuinely NEW work)',
        'If there are DIFFERENT remaining tasks (e.g., QA after Engineer, or a DIFFERENT backlog item):',
        '- Dispatch the NEXT DIFFERENT task to the appropriate subordinate',
        '- If all work from the directive is done, synthesize a final report for your superior',
        '- **If the subordinate already completed the requested work, report success — do NOT re-dispatch**',
        '',
        'Execute these actions now using your tools (Read, Edit, Bash, dispatch).',
      ].join('\n');

      // Run supervision loop (up to 3 additional rounds of tool use)
      messages.push({ role: 'user', content: supervisionPrompt });
      const maxSupervisionRounds = 3;
      for (let round = 0; round < maxSupervisionRounds && turns < maxTurns; round++) {
        if (abortSignal?.aborted) break;
        turns++;

        const supResponse = await llm.chat(context.systemPrompt, messages, tools, abortSignal);
        totalInput += supResponse.usage.inputTokens;
        totalOutput += supResponse.usage.outputTokens;
        config.tokenLedger?.record({
          ts: new Date().toISOString(),
          sessionId: config.sessionId,
          roleId,
          model: config.model ?? 'unknown',
          inputTokens: supResponse.usage.inputTokens,
          outputTokens: supResponse.usage.outputTokens,
        });

        messages.push({ role: 'assistant', content: supResponse.content });
        for (const block of supResponse.content) {
          if (block.type === 'text' && block.text) {
            outputParts.push(block.text);
            onText?.(block.text);
          }
        }

        // If no tool calls, supervision is done
        if (supResponse.stopReason !== 'tool_use') break;

        // Execute tool calls
        const supToolCalls = supResponse.content.filter(
          (b): b is MessageContent & { type: 'tool_use' } => b.type === 'tool_use',
        );
        const supResults: ToolResult[] = [];
        for (const tc of supToolCalls) {
          allToolCalls.push({ name: tc.name, input: tc.input });
          const result = await executeTool(
            { id: tc.id, name: tc.name, input: tc.input },
            toolExecOptions,
          );
          supResults.push(result);

          // Track additional dispatches from supervision
          if (tc.name === 'dispatch' && !result.is_error) {
            dispatches.push({
              roleId: String(tc.input.roleId),
              task: String(tc.input.task),
              result: result.content,
            });
          }
        }

        messages.push({
          role: 'user',
          content: supResults.map((r) => ({
            type: 'tool_result' as const,
            tool_use_id: r.tool_use_id,
            content: r.content,
            is_error: r.is_error,
          })) as unknown as MessageContent[],
        });

        onTurnComplete?.(turns);
      }
    }

    // Phase B: Engineer/CTO Verification — type checking + visual verification
    const verifiableRoles = ['engineer', 'cto'];
    if (verifiableRoles.includes(roleId)) {
      const hasFileChanges = allToolCalls.some((tc) =>
        ['write', 'edit', 'bash'].includes(tc.name.toLowerCase()),
      );

      if (hasFileChanges) {
        const verifyPrompt = [
          '[AUTO-VERIFICATION] 작업이 완료되었습니다. 아래 검증을 수행하세요:',
          '1. `cd src/api && npx tsc --noEmit` — 타입 에러 확인',
          '2. `cd src/web && npx tsc --noEmit` — 프론트엔드 타입 에러 확인',
          '3. UI/CSS 변경이 있었다면 Playwright MCP로 스크린샷을 촬영하여 시각 검증',
          '검증 결과를 간단히 보고하세요.',
        ].join('\n');

        messages.push({ role: 'user', content: verifyPrompt });

        if (turns < maxTurns) {
          turns++;
          const verifyResponse = await llm.chat(context.systemPrompt, messages, tools, abortSignal);
          totalInput += verifyResponse.usage.inputTokens;
          totalOutput += verifyResponse.usage.outputTokens;
          config.tokenLedger?.record({
            ts: new Date().toISOString(),
            sessionId: config.sessionId,
            roleId,
            model: config.model ?? 'unknown',
            inputTokens: verifyResponse.usage.inputTokens,
            outputTokens: verifyResponse.usage.outputTokens,
          });

          messages.push({ role: 'assistant', content: verifyResponse.content });
          for (const block of verifyResponse.content) {
            if (block.type === 'text' && block.text) {
              outputParts.push(block.text);
              onText?.(block.text);
            }
          }

          // Execute verification tool calls if needed
          if (verifyResponse.stopReason === 'tool_use') {
            const verifyToolCalls = verifyResponse.content.filter(
              (b): b is MessageContent & { type: 'tool_use' } => b.type === 'tool_use',
            );
            const verifyResults: ToolResult[] = [];
            for (const tc of verifyToolCalls) {
              allToolCalls.push({ name: tc.name, input: tc.input });
              const result = await executeTool(
                { id: tc.id, name: tc.name, input: tc.input },
                toolExecOptions,
              );
              verifyResults.push(result);
            }
            messages.push({
              role: 'user',
              content: verifyResults.map((r) => ({
                type: 'tool_result' as const,
                tool_use_id: r.tool_use_id,
                content: r.content,
                is_error: r.is_error,
              })) as unknown as MessageContent[],
            });

            if (turns < maxTurns) {
              turns++;
              const summaryResponse = await llm.chat(context.systemPrompt, messages, tools, abortSignal);
              totalInput += summaryResponse.usage.inputTokens;
              totalOutput += summaryResponse.usage.outputTokens;
              config.tokenLedger?.record({
                ts: new Date().toISOString(),
                sessionId: config.sessionId,
                roleId,
                model: config.model ?? 'unknown',
                inputTokens: summaryResponse.usage.inputTokens,
                outputTokens: summaryResponse.usage.outputTokens,
              });
              for (const block of summaryResponse.content) {
                if (block.type === 'text' && block.text) {
                  outputParts.push(block.text);
                  onText?.(block.text);
                }
              }
            }
          }

          onTurnComplete?.(turns);
        }

        // ── Post-Knowledging: ④⑤ 수행 프롬프트 (KP-008) ──
        // Engineer/CTO가 구현 완료 후 The Loop 마무리 (Knowledge 업데이트 + Task 상태 갱신)를 수행하도록 유도
        const postKPrompt = [
          '[POST-KNOWLEDGING] 구현이 완료되었습니다. The Loop 마무리를 수행하세요:',
          '',
          '## ④ Knowledge 업데이트 (The Loop Step 4)',
          '다음 중 해당하는 항목을 수행하세요:',
          '- 본인 journal 업데이트 (`roles/' + roleId + '/journal/YYYY-MM-DD.md` — 오늘 날짜 파일)',
          '- 구현 중 새로 발견한 패턴/아키텍처 결정이 있다면 관련 문서 업데이트',
          '  (예: architecture/web-app-ia.md, architecture/session-worktree-isolation.md 등)',
          '- 중요한 기술 결정은 operations/decisions/ 또는 architecture/ 반영',
          '',
          '## ⑤ Task 상태 갱신 (The Loop Step 5)',
          '- `projects/tycono-platform/tasks.md` (또는 관련 tasks 파일)에서 완료한 태스크 상태를 DONE으로 변경',
          '- 다음 작업이 있다면 식별하여 메모',
          '',
          '⛔ **필수**: ④와 ⑤를 모두 수행해야 The Loop이 완료됩니다.',
          '이제 ④⑤를 수행하세요 (Read, Edit 도구 사용).',
        ].join('\n');

        messages.push({ role: 'user', content: postKPrompt });

        // Run Post-K loop (최대 2턴 — C-Level의 3턴보다 짧게)
        const maxPostKRounds = 2;
        for (let round = 0; round < maxPostKRounds && turns < maxTurns; round++) {
          if (abortSignal?.aborted) break;
          turns++;

          const postKResponse = await llm.chat(context.systemPrompt, messages, tools, abortSignal);
          totalInput += postKResponse.usage.inputTokens;
          totalOutput += postKResponse.usage.outputTokens;
          config.tokenLedger?.record({
            ts: new Date().toISOString(),
            sessionId: config.sessionId,
            roleId,
            model: config.model ?? 'unknown',
            inputTokens: postKResponse.usage.inputTokens,
            outputTokens: postKResponse.usage.outputTokens,
          });

          messages.push({ role: 'assistant', content: postKResponse.content });
          for (const block of postKResponse.content) {
            if (block.type === 'text' && block.text) {
              outputParts.push(block.text);
              onText?.(block.text);
            }
          }

          // If no tool calls, Post-K is done
          if (postKResponse.stopReason !== 'tool_use') break;

          // Execute Post-K tool calls
          const postKToolCalls = postKResponse.content.filter(
            (b): b is MessageContent & { type: 'tool_use' } => b.type === 'tool_use',
          );
          const postKResults: ToolResult[] = [];
          for (const tc of postKToolCalls) {
            allToolCalls.push({ name: tc.name, input: tc.input });
            const result = await executeTool(
              { id: tc.id, name: tc.name, input: tc.input },
              toolExecOptions,
            );
            postKResults.push(result);
          }

          messages.push({
            role: 'user',
            content: postKResults.map((r) => ({
              type: 'tool_result' as const,
              tool_use_id: r.tool_use_id,
              content: r.content,
              is_error: r.is_error,
            })) as unknown as MessageContent[],
          });

          onTurnComplete?.(turns);
        }
      }
    }
  }

  return {
    output: outputParts.join('\n'),
    turns,
    totalTokens: { input: totalInput, output: totalOutput },
    toolCalls: allToolCalls,
    dispatches,
  };
}
