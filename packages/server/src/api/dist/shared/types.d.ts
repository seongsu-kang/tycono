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
/** Message의 실행 상태 — 시스템 전체에서 유일한 정의 */
export type MessageStatus = 'streaming' | 'done' | 'error' | 'awaiting_input' | 'interrupted';
/** /api/exec/status 등에서 Role 단위로 집계할 때 사용 */
export type RoleStatus = 'idle' | 'working' | 'awaiting_input' | 'done';
/** MessageStatus → RoleStatus 변환 (유일한 매핑 규칙) */
export declare function messageStatusToRoleStatus(status: MessageStatus): RoleStatus;
/** Role이 "활성 상태"인지 판단 — exec/status, Org Chart 등에서 사용 */
export declare function isRoleActive(status: RoleStatus): boolean;
/** Message가 "활성 상태"인지 판단 */
export declare function isMessageActive(status: MessageStatus): boolean;
/** Message가 종료 상태인지 판단 */
export declare function isMessageTerminal(status: MessageStatus): boolean;
/** 허용된 상태 전이 (from → to[]) */
export declare const MESSAGE_TRANSITIONS: Record<MessageStatus, MessageStatus[]>;
/** 상태 전이 유효성 검증 */
export declare function canTransition(from: MessageStatus, to: MessageStatus): boolean;
/** 모든 이벤트 타입 — Message.events[]에 기록되는 유일한 어휘 */
export type ActivityEventType = 'msg:start' | 'msg:done' | 'msg:error' | 'msg:awaiting_input' | 'msg:reply' | 'msg:turn-complete' | 'text' | 'thinking' | 'tool:start' | 'tool:result' | 'dispatch:start' | 'dispatch:done' | 'dispatch:error' | 'turn:warning' | 'turn:limit' | 'import:scan' | 'import:process' | 'import:created' | 'prompt:assembled' | 'trace:response' | 'heartbeat:tick' | 'heartbeat:skip' | 'approval:needed' | 'stderr';
export interface ActivityEvent {
    seq: number;
    ts: string;
    type: ActivityEventType;
    roleId: string;
    parentSessionId?: string;
    /** Trace ID — top-level sessionId, inherited by child sessions */
    traceId?: string;
    data: Record<string, unknown>;
}
export type SessionStatus = 'active' | 'closed';
export type SessionSource = 'chat' | 'wave' | 'dispatch' | 'consult';
/** Wave JSON에 저장되는 role별 상태 */
export type WaveRoleStatus = MessageStatus | 'unknown';
/** Wave 노드의 UI 상태 — MessageStatus + UI-only 상태 */
export type WaveNodeStatus = MessageStatus | 'waiting' | 'not-dispatched';
/** WaveNode가 "활성 상태"인지 판단 — UI-only 상태 포함 */
export declare function isWaveNodeActive(status: WaveNodeStatus): boolean;
/** SSE 연결 상태 — 네트워크 레벨, 실행 상태와 무관 */
export type StreamStatus = 'idle' | 'connecting' | 'streaming' | 'done' | 'error';
/** ActivityEventType → MessageStatus 변환 (wave replay 등에서 사용) */
export declare function eventTypeToMessageStatus(eventType: ActivityEventType): MessageStatus | 'unknown';
/** TeamStatus — Role별 현재 상태 + 작업 내용 (context-assembler, runner에서 공유) */
export type TeamStatus = Record<string, {
    status: RoleStatus;
    task?: string;
}>;
/** preset.yaml 스키마 */
export interface PresetDefinition {
    /** Spec version (e.g. "preset/v1") */
    spec: string;
    /** Unique identifier (directory name) */
    id: string;
    /** Display name */
    name: string;
    /** Short tagline */
    tagline?: string;
    /** Version string */
    version: string;
    /** Full description */
    description?: string;
    /** Author info */
    author?: {
        id: string;
        name: string;
        verified?: boolean;
    };
    /** Category / classification */
    category?: string;
    industry?: string;
    stage?: string;
    use_case?: string[];
    /** Role IDs included in this preset */
    roles: string[];
    /** Counts */
    knowledge_docs?: number;
    skills_count?: number;
    /** Pricing */
    pricing?: {
        type: 'one-time' | 'subscription';
        price: number;
        wave_scoped_tier?: string;
    };
    /** Tags for search */
    tags?: string[];
    languages?: string[];
    /** Stats (marketplace) */
    stats?: {
        installs: number;
        rating: number;
        reviews: number;
        waves_used: number;
    };
    /** Wave-scoped recommendations */
    wave_scoped?: {
        recommended_tasks?: string[];
        task_keywords?: string[];
        avg_wave_duration?: string;
        complexity?: string;
    };
}
/** Loaded preset with resolved path info */
export interface LoadedPreset {
    definition: PresetDefinition;
    /** Absolute path to preset directory (or null for _default) */
    path: string | null;
    /** Whether this is the _default preset */
    isDefault: boolean;
}
/** Preset summary for TUI display */
export interface PresetSummary {
    id: string;
    name: string;
    description?: string;
    rolesCount: number;
    roles: string[];
    isDefault: boolean;
}
