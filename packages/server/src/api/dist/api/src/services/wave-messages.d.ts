/**
 * Wave Messages — Conversation history per wave (CEO↔Supervisor)
 *
 * Stores user/assistant/summary message pairs in SQLite.
 * Used by spawnConversation/spawnSupervisor to inject history into prompts.
 *
 * Key principle: inject history DIRECTLY into prompt (not "read this file").
 * AI cannot ignore prompt content, but CAN ignore "read file" instructions.
 */
export interface WaveMessage {
    seq: number;
    waveId: string;
    role: 'user' | 'assistant' | 'summary';
    content: string;
    ts: string;
    executionId?: string;
    metadata?: string;
    summarizesStartSeq?: number;
    summarizesEndSeq?: number;
}
/**
 * Append a message to wave conversation history.
 * Synchronous (better-sqlite3) — no concurrent write issues.
 */
export declare function appendWaveMessage(waveId: string, msg: {
    role: 'user' | 'assistant' | 'summary';
    content: string;
    executionId?: string;
    summarizesStartSeq?: number;
    summarizesEndSeq?: number;
}): WaveMessage;
/**
 * Load all messages for a wave.
 */
export declare function loadWaveMessages(waveId: string): WaveMessage[];
/**
 * Build conversation history for LLM prompt injection.
 *
 * - ≤ maxTurns: full history injected directly
 * - > maxTurns: uses last summary + recent messages
 *
 * Returns formatted string ready for prompt, wrapped in XML tags for injection safety.
 */
export declare function buildHistoryPrompt(waveId: string, maxMessages?: number): string;
/**
 * Summarize old messages when conversation exceeds threshold.
 * Uses Haiku via ClaudeCliProvider or Anthropic SDK.
 * Stores summary as role='summary' with summarizesRange metadata.
 * Does NOT delete original messages — lazy slicing on read.
 */
export declare function summarizeIfNeeded(waveId: string, threshold?: number): Promise<void>;
