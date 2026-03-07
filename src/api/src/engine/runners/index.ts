export type { ExecutionRunner, RunnerConfig, RunnerCallbacks, RunnerHandle, RunnerResult } from './types.js';
export { ClaudeCliRunner } from './claude-cli.js';
export { DirectApiRunner } from './direct-api.js';

import { ClaudeCliRunner } from './claude-cli.js';
import { DirectApiRunner } from './direct-api.js';
import type { ExecutionRunner } from './types.js';
import type { LLMProvider } from '../llm-adapter.js';

/* ─── Runner Factory ─────────────────────────── */

/**
 * 환경변수 EXECUTION_ENGINE에 따라 적절한 Runner 생성.
 *
 *   - claude-cli (기본): Claude Code CLI 사용 — 구독 기반, 비용 없음
 *   - direct-api: Anthropic API 직접 호출 — ANTHROPIC_API_KEY 필요
 *
 * @param llm - LLMProvider를 전달하면 direct-api 모드에서 해당 provider 사용
 */
export function createRunner(llm?: LLMProvider): ExecutionRunner {
  const engine = process.env.EXECUTION_ENGINE || 'claude-cli';

  switch (engine) {
    case 'direct-api':
      return new DirectApiRunner(llm);
    case 'claude-cli':
    default:
      return new ClaudeCliRunner();
  }
}
