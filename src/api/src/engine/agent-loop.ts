import { AnthropicProvider, type LLMProvider, type LLMMessage, type ToolResult, type MessageContent } from './llm-adapter.js';
import { type OrgTree, getSubordinates } from './org-tree.js';
import { assembleContext, type TeamStatus } from './context-assembler.js';
import { validateDispatch } from './authority-validator.js';
import { getToolsForRole } from './tools/definitions.js';
import { executeTool, type ToolExecutorOptions } from './tools/executor.js';
import { type TokenLedger } from '../services/token-ledger.js';

/* ─── Types ──────────────────────────────────── */

export interface AgentConfig {
  companyRoot: string;
  roleId: string;
  task: string;
  sourceRole: string;
  orgTree: OrgTree;
  readOnly?: boolean;
  maxTurns?: number;
  llm?: LLMProvider;
  depth?: number;             // Current dispatch depth (default 0)
  visitedRoles?: Set<string>; // Circular dispatch detection
  abortSignal?: AbortSignal;  // Abort signal for cancellation
  teamStatus?: TeamStatus;    // Current team member statuses
  jobId?: string;             // Job ID for token tracking
  model?: string;             // LLM model name for cost tracking
  tokenLedger?: TokenLedger;  // Token usage ledger (optional)
  // Callbacks
  onText?: (text: string) => void;
  onToolExec?: (name: string, input: Record<string, unknown>) => void;
  onDispatch?: (roleId: string, task: string) => void;
  onTurnComplete?: (turn: number) => void;
}

export interface AgentResult {
  output: string;
  turns: number;
  totalTokens: { input: number; output: number };
  toolCalls: Array<{ name: string; input: Record<string, unknown> }>;
  dispatches: Array<{ roleId: string; task: string; result: string }>;
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
  const context = assembleContext(companyRoot, roleId, task, sourceRole, orgTree, { teamStatus: config.teamStatus });

  // 2. Determine tools
  const subordinates = getSubordinates(orgTree, roleId);
  const tools = getToolsForRole(subordinates.length > 0, readOnly);

  // 3. Set up tool executor
  const toolExecOptions: ToolExecutorOptions = {
    companyRoot,
    roleId,
    orgTree,
    onToolExec,
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
        llm,
        depth: depth + 1,
        visitedRoles: new Set(visitedRoles), // Copy for parallel dispatch support
        abortSignal,
        jobId: config.jobId,
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
  };

  // 4. Run the loop
  const messages: LLMMessage[] = [
    { role: 'user', content: task },
  ];

  let turns = 0;
  let totalInput = 0;
  let totalOutput = 0;
  const allToolCalls: AgentResult['toolCalls'] = [];
  const dispatches: AgentResult['dispatches'] = [];
  const outputParts: string[] = [];

  while (turns < maxTurns) {
    // Check abort signal before each turn
    if (abortSignal?.aborted) break;

    turns++;

    // Call LLM
    const response = await llm.chat(context.systemPrompt, messages, tools, abortSignal);
    totalInput += response.usage.inputTokens;
    totalOutput += response.usage.outputTokens;

    // Record token usage
    config.tokenLedger?.record({
      ts: new Date().toISOString(),
      jobId: config.jobId ?? 'unknown',
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

    const toolResults: ToolResult[] = [];

    for (const tc of toolCalls) {
      allToolCalls.push({ name: tc.name, input: tc.input });

      const result = await executeTool(
        { id: tc.id, name: tc.name, input: tc.input },
        toolExecOptions,
      );

      toolResults.push(result);

      // Track dispatches
      if (tc.name === 'dispatch' && !result.is_error) {
        dispatches.push({
          roleId: String(tc.input.roleId),
          task: String(tc.input.task),
          result: result.content,
        });
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

  // ── Verification turn: auto-inject for engineer/cto at depth 0 with write access ──
  const verifiableRoles = ['engineer', 'cto'];
  if (verifiableRoles.includes(roleId) && !readOnly && depth === 0 && turns > 0) {
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

      // Run one verification turn
      if (turns < maxTurns) {
        turns++;
        const verifyResponse = await llm.chat(context.systemPrompt, messages, tools, abortSignal);
        totalInput += verifyResponse.usage.inputTokens;
        totalOutput += verifyResponse.usage.outputTokens;
        config.tokenLedger?.record({
          ts: new Date().toISOString(),
          jobId: config.jobId ?? 'unknown',
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

        // If verification needs tool calls, execute them
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
          // Feed results back for final summary
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
              jobId: config.jobId ?? 'unknown',
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
