/**
 * Shared Type Contract — Single Source of Truth (D-014 Session-Centric)
 *
 * 이 파일은 API와 Web이 공유하는 모든 상태/이벤트 타입을 정의합니다.
 * 상태 관련 타입을 추가하거나 변경할 때는 반드시 이 파일을 수정하세요.
 *
 * 규칙:
 * 1. 상태 타입은 여기서만 정의 — api/web에서 재정의 금지
 * 2. UI-only 상태(waiting, connecting 등)는 별도 섹션에 명시적 분리
 * 3. 상태 전이는 TRANSITIONS 맵으로 검증 가능
 *
 * D-014: Session이 모든 대화의 일급 단위. Job은 내부 런타임 핸들.
 */

/* ═══════════════════════════════════════════════
 *  Message — 실행 단위의 핵심 상태 (D-014: 구 Job 대체)
 * ═══════════════════════════════════════════════ */

/** Message의 실행 상태 — 시스템 전체에서 유일한 정의 */
export type MessageStatus = 'streaming' | 'done' | 'error' | 'awaiting_input' | 'interrupted';

/** /api/exec/status 등에서 Role 단위로 집계할 때 사용 */
export type RoleStatus = 'idle' | 'working' | 'awaiting_input' | 'done';

/** MessageStatus → RoleStatus 변환 (유일한 매핑 규칙) */
export function messageStatusToRoleStatus(status: MessageStatus): RoleStatus {
  switch (status) {
    case 'streaming': return 'working';
    case 'awaiting_input': return 'awaiting_input';
    case 'done': return 'done';
    case 'error': return 'done';
    case 'interrupted': return 'done';
  }
}

/** Role이 "활성 상태"인지 판단 — exec/status, Org Chart 등에서 사용 */
export function isRoleActive(status: RoleStatus): boolean {
  return status === 'working' || status === 'awaiting_input';
}

/** Message가 "활성 상태"인지 판단 */
export function isMessageActive(status: MessageStatus): boolean {
  return status === 'streaming' || status === 'awaiting_input';
}

/** Message가 종료 상태인지 판단 */
export function isMessageTerminal(status: MessageStatus): boolean {
  return status === 'done' || status === 'error' || status === 'interrupted';
}

/** 허용된 상태 전이 (from → to[]) */
export const MESSAGE_TRANSITIONS: Record<MessageStatus, MessageStatus[]> = {
  streaming:      ['done', 'error', 'awaiting_input', 'interrupted'],
  awaiting_input: ['streaming', 'done', 'error'],
  interrupted:    ['streaming', 'done'],  // re-dispatch 또는 CEO dismiss
  done:           [],
  error:          [],
};

/** 상태 전이 유효성 검증 */
export function canTransition(from: MessageStatus, to: MessageStatus): boolean {
  return MESSAGE_TRANSITIONS[from].includes(to);
}

/* ═══════════════════════════════════════════════
 *  Backward Compatibility — 내부 런타임 핸들 (D-014 전환기)
 *  job-manager.ts 등 내부 서비스에서만 사용. API/UI에 노출 금지.
 * ═══════════════════════════════════════════════ */

/** @deprecated D-014: MessageStatus 사용. 내부 런타임 핸들 전용 */
export type JobStatus = 'running' | 'done' | 'error' | 'awaiting_input';

/** @deprecated D-014: SessionSource 사용 */
export type JobType = 'assign' | 'wave' | 'session-message' | 'consult';

/** @deprecated D-014: isMessageActive 사용 */
export function isJobActive(status: JobStatus): boolean {
  return status === 'running' || status === 'awaiting_input';
}

/** @deprecated D-014: messageStatusToRoleStatus 사용 */
export function jobStatusToRoleStatus(jobStatus: JobStatus): RoleStatus {
  switch (jobStatus) {
    case 'running': return 'working';
    case 'awaiting_input': return 'awaiting_input';
    case 'done': return 'done';
    case 'error': return 'done';
  }
}

/** @deprecated D-014: 제거 예정. 내부 런타임 핸들 전용 */
export interface JobInfo {
  id: string;
  type: JobType;
  roleId: string;
  task: string;
  status: JobStatus;
  parentJobId?: string;
  childJobIds: string[];
  createdAt: string;
  targetRole?: string;
  output?: string;
}

/* ═══════════════════════════════════════════════
 *  Activity Events — 실행 이벤트 로그
 * ═══════════════════════════════════════════════ */

/** 모든 이벤트 타입 — Message.events[]에 기록되는 유일한 어휘 */
export type ActivityEventType =
  // Message lifecycle (D-014: 구 job:* → msg:*)
  | 'msg:start' | 'msg:done' | 'msg:error'
  | 'msg:awaiting_input' | 'msg:reply'
  // Execution
  | 'text' | 'thinking'
  | 'tool:start' | 'tool:result'
  // Dispatch (child session)
  | 'dispatch:start' | 'dispatch:done'
  // Harness (turn limits)
  | 'turn:complete' | 'turn:warning' | 'turn:limit'
  // Knowledge import
  | 'import:scan' | 'import:process' | 'import:created'
  // Trace (full prompt/response capture for AI debugging)
  | 'trace:prompt' | 'trace:response'
  // Legacy event types (backward compat for existing JSONL files)
  | 'job:start' | 'job:done' | 'job:error'
  | 'job:awaiting_input' | 'job:reply'
  // Other
  | 'stderr';

export interface ActivityEvent {
  seq: number;
  ts: string;
  type: ActivityEventType;
  roleId: string;
  parentSessionId?: string;
  /** @deprecated D-014: parentSessionId 사용 */
  parentJobId?: string;
  /** Trace ID — top-level sessionId, inherited by child sessions */
  traceId?: string;
  data: Record<string, unknown>;
}

/* ═══════════════════════════════════════════════
 *  Session — D-014 통합 세션
 * ═══════════════════════════════════════════════ */

export type SessionStatus = 'active' | 'closed';
export type SessionSource = 'chat' | 'wave' | 'dispatch' | 'consult';

/* ═══════════════════════════════════════════════
 *  Wave — 조직 전파 단위
 * ═══════════════════════════════════════════════ */

/** Wave JSON에 저장되는 role별 상태 */
export type WaveRoleStatus = MessageStatus | 'unknown';

/* ═══════════════════════════════════════════════
 *  Frontend-Only 상태 (UI 전용, 백엔드에는 없음)
 *  명시적으로 분리하여 혼동 방지
 * ═══════════════════════════════════════════════ */

/** Wave 노드의 UI 상태 — MessageStatus + UI-only 상태 */
export type WaveNodeStatus =
  | MessageStatus              // 'streaming' | 'done' | 'error' | 'awaiting_input' | 'interrupted'
  | 'waiting'                  // 아직 dispatch 안 됨 (UI 초기 상태)
  | 'not-dispatched';          // wave 완료 후에도 dispatch 안 된 노드

/** WaveNode가 "활성 상태"인지 판단 — UI-only 상태 포함 */
export function isWaveNodeActive(status: WaveNodeStatus): boolean {
  return status === 'streaming' || status === 'awaiting_input';
}

/** SSE 연결 상태 — 네트워크 레벨, 실행 상태와 무관 */
export type StreamStatus = 'idle' | 'connecting' | 'streaming' | 'done' | 'error';

/** ActivityEventType → MessageStatus 변환 (wave replay 등에서 사용) */
export function eventTypeToMessageStatus(eventType: ActivityEventType): MessageStatus | 'unknown' {
  switch (eventType) {
    case 'msg:done': case 'job:done': return 'done';
    case 'msg:error': case 'job:error': return 'error';
    case 'msg:awaiting_input': case 'job:awaiting_input': return 'awaiting_input';
    default: return 'unknown';
  }
}

/** @deprecated D-014: eventTypeToMessageStatus 사용 */
export const eventTypeToJobStatus = eventTypeToMessageStatus;

/** TeamStatus — Role별 현재 상태 + 작업 내용 (context-assembler, runner에서 공유) */
export type TeamStatus = Record<string, { status: RoleStatus; task?: string }>;
