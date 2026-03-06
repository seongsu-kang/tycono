import { runAgentLoop } from '../agent-loop.js';
import { AnthropicProvider, type LLMProvider } from '../llm-adapter.js';
import type { ExecutionRunner, RunnerConfig, RunnerCallbacks, RunnerHandle, RunnerResult } from './types.js';

/* ─── Direct API Runner ──────────────────────── */

/**
 * Anthropic API를 직접 호출하는 실행 엔진.
 *
 * - @anthropic-ai/sdk로 Claude API 직접 호출
 * - Agent Loop가 도구 실행, dispatch를 내부 처리
 * - 토큰 사용량 정확히 추적 가능
 * - ANTHROPIC_API_KEY 환경변수 필수
 *
 * 활성화: EXECUTION_ENGINE=direct-api
 */
export class DirectApiRunner implements ExecutionRunner {
  private llm: LLMProvider;

  constructor(llm?: LLMProvider) {
    this.llm = llm ?? new AnthropicProvider();
  }

  execute(config: RunnerConfig, callbacks: RunnerCallbacks): RunnerHandle {
    const abortController = new AbortController();

    const promise = runAgentLoop({
      companyRoot: config.companyRoot,
      roleId: config.roleId,
      task: config.task,
      sourceRole: config.sourceRole,
      orgTree: config.orgTree,
      readOnly: config.readOnly,
      maxTurns: config.maxTurns,
      llm: this.llm,
      abortSignal: abortController.signal,
      onText: (text) => callbacks.onText?.(text),
      onToolExec: (name, input) => callbacks.onToolUse?.(name, input),
      onDispatch: (roleId, task) => callbacks.onDispatch?.(roleId, task),
      onTurnComplete: (turn) => callbacks.onTurnComplete?.(turn),
    }).then((agentResult): RunnerResult => ({
      output: agentResult.output,
      turns: agentResult.turns,
      totalTokens: agentResult.totalTokens,
      toolCalls: agentResult.toolCalls,
      dispatches: agentResult.dispatches,
    }));

    return {
      promise,
      abort: () => abortController.abort(),
    };
  }
}
