/**
 * Shared Type Contract — Single Source of Truth
 *
 * 이 파일은 API와 Web이 공유하는 모든 상태/이벤트 타입을 정의합니다.
 * 상태 관련 타입을 추가하거나 변경할 때는 반드시 이 파일을 수정하세요.
 *
 * 규칙:
 * 1. 상태 타입은 여기서만 정의 — api/web에서 재정의 금지
 * 2. UI-only 상태(waiting, connecting 등)는 별도 섹션에 명시적 분리
 * 3. 상태 전이는 TRANSITIONS 맵으로 검증 가능
 */

/* ═══════════════════════════════════════════════
 *  Job — 실행 단위의 핵심 상태
 * ═══════════════════════════════════════════════ */

/** Job이 어떻게 시작되었는가 */
export type JobType = 'assign' | 'wave' | 'session-message' | 'consult';

/** Job의 실행 상태 — 시스템 전체에서 유일한 정의 */
export type JobStatus = 'running' | 'done' | 'error' | 'awaiting_input';

/** /api/exec/status 등에서 Role 단위로 집계할 때 사용 */
export type RoleStatus = 'idle' | 'working' | 'awaiting_input' | 'done';

/** JobStatus → RoleStatus 변환 (유일한 매핑 규칙) */
export function jobStatusToRoleStatus(jobStatus: JobStatus): RoleStatus {
  switch (jobStatus) {
    case 'running': return 'working';
    case 'awaiting_input': return 'awaiting_input';
    case 'done': return 'done';
    case 'error': return 'done'; // error도 "더 이상 일하지 않는" 상태
  }
}

/** Role이 "활성 상태"인지 판단 — exec/status, Org Chart 등에서 사용 */
export function isRoleActive(status: RoleStatus): boolean {
  return status === 'working' || status === 'awaiting_input';
}

/** Job이 "활성 상태"인지 판단 */
export function isJobActive(status: JobStatus): boolean {
  return status === 'running' || status === 'awaiting_input';
}

/** 허용된 상태 전이 (from → to[]) */
export const JOB_TRANSITIONS: Record<JobStatus, JobStatus[]> = {
  running:        ['done', 'error', 'awaiting_input'],
  awaiting_input: ['done', 'error'],  // reply → done (old job), 또는 abort → error
  done:           [],                  // terminal state
  error:          [],                  // terminal state
};

/** 상태 전이 유효성 검증 */
export function canTransition(from: JobStatus, to: JobStatus): boolean {
  return JOB_TRANSITIONS[from].includes(to);
}

/* ═══════════════════════════════════════════════
 *  Job Info — API 응답용 (런타임 객체에서 민감 정보 제거)
 * ═══════════════════════════════════════════════ */

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

/** 모든 이벤트 타입 — ActivityStream JSONL에 기록되는 유일한 어휘 */
export type ActivityEventType =
  // Job lifecycle
  | 'job:start' | 'job:done' | 'job:error'
  | 'job:awaiting_input' | 'job:reply'
  // Execution
  | 'text' | 'thinking'
  | 'tool:start' | 'tool:result'
  // Dispatch (child job)
  | 'dispatch:start' | 'dispatch:done'
  // Harness (turn limits)
  | 'turn:complete' | 'turn:warning' | 'turn:limit'
  // Knowledge import
  | 'import:scan' | 'import:process' | 'import:created'
  // Trace (full prompt/response capture for AI debugging)
  | 'trace:prompt' | 'trace:response'
  // Other
  | 'stderr';

export interface ActivityEvent {
  seq: number;
  ts: string;
  type: ActivityEventType;
  roleId: string;
  parentJobId?: string;
  /** Trace ID — top-level jobId, inherited by all child jobs for chain tracking */
  traceId?: string;
  data: Record<string, unknown>;
}

/* ═══════════════════════════════════════════════
 *  Session — D-014 통합 세션
 * ═══════════════════════════════════════════════ */

export type SessionStatus = 'active' | 'closed';
export type SessionSource = 'chat' | 'wave' | 'dispatch';
export type MessageStatus = 'streaming' | 'done' | 'error' | 'awaiting_input';

/* ═══════════════════════════════════════════════
 *  Wave — 조직 전파 단위
 * ═══════════════════════════════════════════════ */

/** Wave JSON에 저장되는 role별 상태 — JobStatus와 동일 어휘 사용 */
export type WaveRoleStatus = JobStatus | 'unknown';

/* ═══════════════════════════════════════════════
 *  Frontend-Only 상태 (UI 전용, 백엔드에는 없음)
 *  명시적으로 분리하여 혼동 방지
 * ═══════════════════════════════════════════════ */

/** Wave 노드의 UI 상태 — JobStatus + UI-only 상태 */
export type WaveNodeStatus =
  | JobStatus                // 'running' | 'done' | 'error' | 'awaiting_input'
  | 'waiting'                // 아직 dispatch 안 됨 (UI 초기 상태)
  | 'not-dispatched';        // wave 완료 후에도 dispatch 안 된 노드

/** WaveNode가 "활성 상태"인지 판단 — UI-only 상태 포함 */
export function isWaveNodeActive(status: WaveNodeStatus): boolean {
  return status === 'running' || status === 'awaiting_input';
}

/** SSE 연결 상태 — 네트워크 레벨, 실행 상태와 무관 */
export type StreamStatus = 'idle' | 'connecting' | 'streaming' | 'done' | 'error';

/** Message가 종료 상태인지 판단 */
export function isMessageTerminal(status: MessageStatus): boolean {
  return status === 'done' || status === 'error';
}

/** ActivityEventType → JobStatus 변환 (wave replay 등에서 사용) */
export function eventTypeToJobStatus(eventType: ActivityEventType): JobStatus | 'unknown' {
  switch (eventType) {
    case 'job:done': return 'done';
    case 'job:error': return 'error';
    case 'job:awaiting_input': return 'awaiting_input';
    default: return 'unknown';
  }
}

/** TeamStatus — Role별 현재 상태 + 작업 내용 (context-assembler, runner에서 공유) */
export type TeamStatus = Record<string, { status: RoleStatus; task?: string }>;
