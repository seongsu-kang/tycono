import { type LLMProvider } from '../llm-adapter.js';
import type { ExecutionRunner, RunnerConfig, RunnerCallbacks, RunnerHandle } from './types.js';
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
export declare class DirectApiRunner implements ExecutionRunner {
    private llm;
    constructor(llm?: LLMProvider);
    execute(config: RunnerConfig, callbacks: RunnerCallbacks): RunnerHandle;
}
