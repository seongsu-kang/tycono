export type ActivityEventType = 'job:start' | 'job:done' | 'job:error' | 'job:awaiting_input' | 'job:reply' | 'text' | 'thinking' | 'tool:start' | 'tool:result' | 'dispatch:start' | 'dispatch:done' | 'turn:complete' | 'turn:warning' | 'turn:limit' | 'import:scan' | 'import:process' | 'import:created' | 'stderr';
export interface ActivityEvent {
    seq: number;
    ts: string;
    type: ActivityEventType;
    roleId: string;
    parentJobId?: string;
    data: Record<string, unknown>;
}
export type ActivitySubscriber = (event: ActivityEvent) => void;
export declare class ActivityStream {
    readonly jobId: string;
    readonly roleId: string;
    readonly parentJobId?: string;
    private seq;
    private subscribers;
    private filePath;
    private closed;
    constructor(jobId: string, roleId: string, parentJobId?: string);
    /** Append event to JSONL + push to live subscribers */
    emit(type: ActivityEventType, roleId: string, data: Record<string, unknown>): ActivityEvent;
    subscribe(cb: ActivitySubscriber): void;
    unsubscribe(cb: ActivitySubscriber): void;
    get subscriberCount(): number;
    close(): void;
    get isClosed(): boolean;
    get lastSeq(): number;
    /** Read events from a JSONL file starting at fromSeq */
    static readFrom(jobId: string, fromSeq?: number): ActivityEvent[];
    /** Read all events from a JSONL file */
    static readAll(jobId: string): ActivityEvent[];
    /** Check if a stream file exists */
    static exists(jobId: string): boolean;
    /** List all stream files (job IDs) */
    static listAll(): string[];
    /** Get the streams directory path */
    static getStreamDir(): string;
}
