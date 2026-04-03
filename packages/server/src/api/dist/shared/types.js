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
/** MessageStatus → RoleStatus 변환 (유일한 매핑 규칙) */
export function messageStatusToRoleStatus(status) {
    switch (status) {
        case 'streaming': return 'working';
        case 'awaiting_input': return 'awaiting_input';
        case 'done': return 'done';
        case 'error': return 'done';
        case 'interrupted': return 'done';
    }
}
/** Role이 "활성 상태"인지 판단 — exec/status, Org Chart 등에서 사용 */
export function isRoleActive(status) {
    return status === 'working' || status === 'awaiting_input';
}
/** Message가 "활성 상태"인지 판단 */
export function isMessageActive(status) {
    return status === 'streaming' || status === 'awaiting_input';
}
/** Message가 종료 상태인지 판단 */
export function isMessageTerminal(status) {
    return status === 'done' || status === 'error' || status === 'interrupted';
}
/** 허용된 상태 전이 (from → to[]) */
export const MESSAGE_TRANSITIONS = {
    streaming: ['done', 'error', 'awaiting_input', 'interrupted'],
    awaiting_input: ['streaming', 'done', 'error', 'interrupted'],
    interrupted: ['streaming', 'done'], // re-dispatch 또는 CEO dismiss
    done: [],
    error: [],
};
/** 상태 전이 유효성 검증 */
export function canTransition(from, to) {
    return MESSAGE_TRANSITIONS[from].includes(to);
}
/** WaveNode가 "활성 상태"인지 판단 — UI-only 상태 포함 */
export function isWaveNodeActive(status) {
    return status === 'streaming' || status === 'awaiting_input';
}
/** ActivityEventType → MessageStatus 변환 (wave replay 등에서 사용) */
export function eventTypeToMessageStatus(eventType) {
    switch (eventType) {
        case 'msg:done': return 'done';
        case 'msg:error': return 'error';
        case 'msg:awaiting_input': return 'awaiting_input';
        default: return 'unknown';
    }
}
