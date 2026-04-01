import type { ExecutionRunner, RunnerConfig, RunnerCallbacks, RunnerHandle } from './types.js';
/**
 * Claude Code CLI (`claude -p`)를 실행 엔진으로 사용.
 *
 * - Context Assembler가 조립한 시스템 프롬프트를 --system-prompt로 전달
 * - claude -p (print mode)로 실행, stdout의 stream-json을 파싱
 * - Claude Code가 내장 도구(Read, Write, Edit, Bash 등)를 자체적으로 실행
 * - Dispatch Bridge: 하위 Role 할당 시 API를 통해 자식 Job 생성
 * - 구독 기반이므로 API 비용 부담 없음
 */
export declare class ClaudeCliRunner implements ExecutionRunner {
    execute(config: RunnerConfig, callbacks: RunnerCallbacks): RunnerHandle;
}
