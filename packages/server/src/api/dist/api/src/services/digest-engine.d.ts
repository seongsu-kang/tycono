/**
 * DigestEngine — Server-side JSONL event summarizer for C-Level supervision.
 *
 * Pure TypeScript, zero LLM calls ($0 cost).
 * Classifies activity events by significance tier, detects anomalies,
 * and produces a concise digest for C-Level consumption.
 *
 * SV-2: Core supervision service
 */
import type { ActivityEvent } from '../../../shared/types.js';
export interface Anomaly {
    type: 'error' | 'stall' | 'scope_creep' | 'awaiting_input' | 'budget_warning' | 'ceo_directive' | 'dispatch_error';
    sessionId: string;
    message: string;
    severity: number;
}
export interface DigestResult {
    text: string;
    significanceScore: number;
    anomalies: Anomaly[];
    checkpoints: Map<string, number>;
    peerActivity?: string;
    eventCount: number;
    errorCount: number;
}
/**
 * Digest a set of events from multiple sessions.
 *
 * @param eventsBySession - Map of sessionId → events collected during the watch period
 * @param peerEvents - Optional events from peer C-Level sessions
 */
export declare function digest(eventsBySession: Map<string, ActivityEvent[]>, peerEvents?: Map<string, ActivityEvent[]>): DigestResult;
/**
 * Generate a quiet tick summary (for significanceScore < 2 && no anomalies)
 */
export declare function quietDigest(sessionCount: number, eventCount: number, errorCount: number): string;
