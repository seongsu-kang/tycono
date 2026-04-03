export interface DispatchDecision {
    ts: string;
    waveId: string;
    roleId: string;
    sourceRole: string;
    newTask: string;
    prevSessionId: string;
    decision: 'amend' | 'new';
    reason: string;
}
export interface PrevSessionInfo {
    sessionId: string;
    task: string;
    status: string;
    cliSessionId?: string;
}
/**
 * 같은 wave 내에서 같은 role의 active 세션을 찾는다.
 */
export declare function findActiveSession(waveId: string, roleId: string): PrevSessionInfo | null;
/**
 * 같은 wave 내에서 같은 role의 가장 최근 done 세션을 찾는다.
 */
export declare function findPrevDoneSession(waveId: string, roleId: string): PrevSessionInfo | null;
export interface AutoAmendResult {
    action: 'amend' | 'new';
    prevSessionId?: string;
    reason: string;
}
/**
 * dispatch 요청 시 기존 세션 reuse 여부를 deterministic하게 판단.
 *
 * Role당 1세션 Invariant:
 * 1. active 세션 있음 → amend (대기 후 추가 지시)
 * 2. done 세션 있음 → amend (이어서)
 * 3. error N회 초과 → new (fresh start)
 * 4. 세션 없음 → new (첫 생성)
 */
export declare function decideDispatchOrAmend(waveId: string | undefined, roleId: string, sourceRole: string, newTask: string): Promise<AutoAmendResult>;
