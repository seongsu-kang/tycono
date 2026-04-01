import type { ToolDefinition } from '../llm-adapter.js';
/**
 * 읽기 전용 도구 — Ask 엔드포인트에서도 사용
 */
export declare const READ_TOOLS: ToolDefinition[];
/**
 * 쓰기 도구 — Assign 엔드포인트에서만 사용
 */
export declare const WRITE_TOOLS: ToolDefinition[];
/**
 * 디스패치 도구 — 매니저 Role에게만 제공
 */
export declare const DISPATCH_TOOL: ToolDefinition;
/**
 * Bash 실행 도구 — 코드 프로젝트에서 시스템 명령 실행 (EG-001)
 */
export declare const BASH_TOOL: ToolDefinition;
/**
 * 상담 도구 — 모든 Role에게 제공 (동료/상관/부하에게 질문)
 */
export declare const CONSULT_TOOL: ToolDefinition;
/**
 * Role에 따른 도구 목록 반환
 */
export declare function getToolsForRole(hasSubordinates: boolean, readOnly: boolean, hasBash?: boolean): ToolDefinition[];
