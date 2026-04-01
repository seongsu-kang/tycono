export interface TokenEntry {
    ts: string;
    jobId: string;
    roleId: string;
    model: string;
    inputTokens: number;
    outputTokens: number;
}
export interface TokenSummary {
    totalInput: number;
    totalOutput: number;
    entries: TokenEntry[];
}
export interface QueryFilter {
    from?: string;
    to?: string;
    roleId?: string;
    jobId?: string;
}
export declare class TokenLedger {
    private filePath;
    constructor(companyRoot: string);
    /** Append a token usage entry (one per LLM call) */
    record(entry: TokenEntry): void;
    /** Query entries with optional filters */
    query(filter?: QueryFilter): TokenSummary;
    /** Get the file path (for testing/debugging) */
    getFilePath(): string;
}
export declare function getTokenLedger(companyRoot: string): TokenLedger;
/** Reset singleton (for testing) */
export declare function resetTokenLedger(): void;
