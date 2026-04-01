import type { ActivityEvent } from './activity-stream.js';
export interface ImageAttachment {
    type: 'image';
    data: string;
    name: string;
    mediaType: 'image/png' | 'image/jpeg' | 'image/gif' | 'image/webp';
}
/** Dispatch link — reference to a child session created via dispatch */
export interface DispatchLink {
    sessionId: string;
    roleId: string;
}
export interface Message {
    id: string;
    from: 'ceo' | 'role';
    content: string;
    type: 'conversation' | 'directive' | 'system';
    status?: 'streaming' | 'done' | 'error' | 'awaiting_input';
    timestamp: string;
    attachments?: ImageAttachment[];
    /** Execution events embedded in this message (replaces separate JSONL) */
    events?: ActivityEvent[];
    /** Child sessions spawned by dispatch during this message's execution */
    dispatches?: DispatchLink[];
    /** Internal job ID for runtime tracking (not exposed to UI) */
    jobId?: string;
    /** True for consult/ask messages (read-only execution) */
    readOnly?: boolean;
    /** Execution stats */
    turns?: number;
    tokens?: {
        input: number;
        output: number;
    };
    /** KP-006: Knowledge debt warnings from Post-K check */
    knowledgeDebt?: Array<{
        type: string;
        file?: string;
        message: string;
    }>;
}
/** How this session was created */
export type SessionSource = 'chat' | 'wave' | 'dispatch';
export interface Session {
    id: string;
    roleId: string;
    title: string;
    mode: 'talk' | 'do';
    messages: Message[];
    status: 'active' | 'closed';
    createdAt: string;
    updatedAt: string;
    /** How this session was created */
    source?: SessionSource;
    /** Parent session ID (when created via dispatch) */
    parentSessionId?: string;
    /** Wave ID (when created via wave) */
    waveId?: string;
}
/** Options for creating a session with D-014 extensions */
export interface CreateSessionOptions {
    mode?: 'talk' | 'do';
    source?: SessionSource;
    parentSessionId?: string;
    waveId?: string;
}
export declare function createSession(roleId: string, opts?: CreateSessionOptions): Session;
export declare function getSession(id: string): Session | undefined;
export declare function listSessions(): Omit<Session, 'messages'>[];
export declare function addMessage(sessionId: string, msg: Message, streaming?: boolean): Session | undefined;
/** Fields that can be updated on a message */
export type MessageUpdate = Partial<Pick<Message, 'content' | 'status' | 'turns' | 'tokens' | 'dispatches' | 'readOnly' | 'knowledgeDebt'>>;
export declare function updateMessage(sessionId: string, messageId: string, updates: MessageUpdate): Session | undefined;
/** Append an execution event to a message (D-014: events embedded in message) */
export declare function appendMessageEvent(sessionId: string, messageId: string, event: ActivityEvent): boolean;
export declare function updateSession(id: string, updates: Partial<Pick<Session, 'title' | 'mode' | 'status' | 'source' | 'parentSessionId' | 'waveId'>>): Session | undefined;
export declare function deleteSession(id: string): boolean;
export declare function deleteMany(ids: string[]): number;
export declare function deleteEmpty(): {
    deleted: number;
    ids: string[];
};
