export { type ActivityEventType, type ActivityEvent } from '../../../shared/types.js';
import type { ActivityEventType, ActivityEvent } from '../../../shared/types.js';
export type ActivitySubscriber = (event: ActivityEvent) => void;
export declare class ActivityStream {
    readonly sessionId: string;
    readonly roleId: string;
    readonly parentSessionId?: string;
    /** Trace ID for full chain tracking — top-level sessionId propagated to all children */
    readonly traceId?: string;
    private seq;
    private subscribers;
    private filePath;
    private closed;
    constructor(sessionId: string, roleId: string, parentSessionId?: string, traceId?: string);
    /** Append event to JSONL + push to live subscribers */
    emit(type: ActivityEventType, roleId: string, data: Record<string, unknown>): ActivityEvent;
    subscribe(cb: ActivitySubscriber): void;
    unsubscribe(cb: ActivitySubscriber): void;
    get subscriberCount(): number;
    close(): void;
    get isClosed(): boolean;
    get lastSeq(): number;
    /** Cache of active streams by sessionId */
    private static activeStreams;
    /** Get or create an ActivityStream for a session. Reuses existing stream for continuations. */
    static getOrCreate(sessionId: string, roleId: string, parentSessionId?: string, traceId?: string): ActivityStream;
    /** Read events from a JSONL file starting at fromSeq */
    static readFrom(streamId: string, fromSeq?: number): ActivityEvent[];
    /** Read all events from a JSONL file */
    static readAll(streamId: string): ActivityEvent[];
    /** Check if a stream file exists */
    static exists(streamId: string): boolean;
    /** List all stream files (stream IDs) */
    static listAll(): string[];
    /** Get the streams directory path */
    static getStreamDir(): string;
}
