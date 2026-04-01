/**
 * DigestEngine — Server-side JSONL event summarizer for C-Level supervision.
 *
 * Pure TypeScript, zero LLM calls ($0 cost).
 * Classifies activity events by significance tier, detects anomalies,
 * and produces a concise digest for C-Level consumption.
 *
 * SV-2: Core supervision service
 */
import type { ActivityEvent, ActivityEventType } from '../../../shared/types.js';

/* ─── Types ──────────────────────────────────── */

export interface Anomaly {
  type: 'error' | 'stall' | 'scope_creep' | 'awaiting_input' | 'budget_warning' | 'ceo_directive' | 'dispatch_error';
  sessionId: string;
  message: string;
  severity: number; // 0-10
}

export interface DigestResult {
  text: string;                      // C-Level readable summary (<500 tokens quiet, <2000 active)
  significanceScore: number;         // 0-10
  anomalies: Anomaly[];
  checkpoints: Map<string, number>;  // sessionId → lastSeq
  peerActivity?: string;             // peer C-Level activity summary
  eventCount: number;
  errorCount: number;
}

/* ─── Event Classification ───────────────────── */

type EventTier = 'critical' | 'high' | 'medium' | 'low';

const EVENT_TIER_MAP: Partial<Record<ActivityEventType, EventTier>> = {
  'msg:error': 'critical',
  'msg:awaiting_input': 'critical',
  'dispatch:start': 'high',
  'dispatch:done': 'high',
  'dispatch:error': 'critical',
  'msg:done': 'high',
  'msg:start': 'high',
  'thinking': 'medium',
  'text': 'low',
  'stderr': 'medium',
  'msg:turn-complete': 'low',
  'turn:warning': 'high',
  'turn:limit': 'critical',
};

const TIER_WEIGHT: Record<EventTier, number> = {
  critical: 10,
  high: 5,
  medium: 2,
  low: 0,
};

function classifyEvent(event: ActivityEvent): EventTier {
  // tool:start classification depends on tool name
  if (event.type === 'tool:start') {
    const toolName = (event.data?.name as string) ?? '';
    const highTools = ['write_file', 'edit_file', 'bash_execute', 'dispatch', 'consult'];
    if (highTools.includes(toolName)) return 'high';
    return 'medium';
  }

  if (event.type === 'tool:result') {
    const isError = event.data?.is_error === true;
    return isError ? 'high' : 'low';
  }

  return EVENT_TIER_MAP[event.type] ?? 'low';
}

/* ─── Anomaly Detection ──────────────────────── */

interface SessionState {
  sessionId: string;
  roleId: string;
  lastEventTs: number;
  eventCount: number;
  errorCount: number;
  isDone: boolean;
  isError: boolean;
  isAwaitingInput: boolean;
  toolCalls: string[];       // tool names used
  filesModified: string[];   // file paths modified
}

function detectAnomalies(
  sessionStates: Map<string, SessionState>,
  now: number,
): Anomaly[] {
  const anomalies: Anomaly[] = [];

  for (const [sessionId, state] of sessionStates) {
    // Stall detection: 3+ minutes without events
    if (!state.isDone && !state.isError && !state.isAwaitingInput) {
      const silenceMs = now - state.lastEventTs;
      if (silenceMs > 3 * 60 * 1000) {
        anomalies.push({
          type: 'stall',
          sessionId,
          message: `Session ${sessionId} (${state.roleId}): No events for ${Math.round(silenceMs / 60000)}min`,
          severity: 7,
        });
      }
    }

    // Error detection
    if (state.isError) {
      anomalies.push({
        type: 'error',
        sessionId,
        message: `Session ${sessionId} (${state.roleId}): Ended with error`,
        severity: 10,
      });
    }

    // Awaiting input
    if (state.isAwaitingInput) {
      anomalies.push({
        type: 'awaiting_input',
        sessionId,
        message: `Session ${sessionId} (${state.roleId}): Awaiting input`,
        severity: 8,
      });
    }
  }

  return anomalies;
}

/* ─── Digest Builder ─────────────────────────── */

function buildDigestText(
  sessionStates: Map<string, SessionState>,
  eventsBySession: Map<string, ActivityEvent[]>,
  anomalies: Anomaly[],
  significanceScore: number,
): string {
  const parts: string[] = [];

  // Header
  const totalEvents = Array.from(eventsBySession.values()).reduce((sum, evts) => sum + evts.length, 0);
  const totalErrors = Array.from(sessionStates.values()).reduce((sum, s) => sum + s.errorCount, 0);
  const activeSessions = Array.from(sessionStates.values()).filter(s => !s.isDone && !s.isError).length;
  const doneSessions = Array.from(sessionStates.values()).filter(s => s.isDone).length;

  parts.push(`## Supervision Digest [score: ${significanceScore}/10]`);
  parts.push(`Sessions: ${activeSessions} active, ${doneSessions} done | Events: ${totalEvents} | Errors: ${totalErrors}`);
  parts.push('');

  // Anomalies first (most important)
  if (anomalies.length > 0) {
    parts.push('### ⚠️ Anomalies');
    for (const a of anomalies) {
      const icon = a.type === 'error' ? '🔴' : a.type === 'stall' ? '🟡' : a.type === 'awaiting_input' ? '🟠' : '⚪';
      parts.push(`- ${icon} **${a.type}**: ${a.message}`);
    }
    parts.push('');
  }

  // Per-session summary
  parts.push('### Session Activity');
  for (const [sessionId, state] of sessionStates) {
    const events = eventsBySession.get(sessionId) ?? [];
    const status = state.isDone ? '✅ Done' : state.isError ? '❌ Error' : state.isAwaitingInput ? '🟠 Awaiting' : '🔵 Active';

    parts.push(`**[${state.roleId}]** ${sessionId} — ${status} (${events.length} events)`);

    // Highlight significant events
    const significant = events.filter(e => {
      const tier = classifyEvent(e);
      return tier === 'critical' || tier === 'high';
    });

    for (const evt of significant.slice(-5)) { // Last 5 significant events
      const summary = summarizeEvent(evt);
      if (summary) parts.push(`  - ${summary}`);
    }
  }

  return parts.join('\n');
}

function summarizeEvent(event: ActivityEvent): string | null {
  switch (event.type) {
    case 'msg:start':
      return `Started: ${(event.data?.task as string ?? '').slice(0, 80)}`;
    case 'msg:done':
      return `Completed (${event.data?.turns ?? '?'} turns)`;
    case 'msg:error':
      return `Error: ${(event.data?.message as string ?? 'unknown').slice(0, 100)}`;
    case 'msg:awaiting_input':
      return `Awaiting input: ${(event.data?.question as string ?? '').slice(0, 80)}`;
    case 'dispatch:start':
      return `Dispatched → ${event.data?.targetRoleId}: ${(event.data?.task as string ?? '').slice(0, 60)}`;
    case 'dispatch:done':
      return `Dispatch completed: ${event.data?.targetRoleId}`;
    case 'dispatch:error':
      return `❌ Dispatch FAILED: ${event.data?.sourceRole} → ${event.data?.targetRole}: ${(event.data?.error as string ?? 'unknown').slice(0, 80)}`;
    case 'tool:start': {
      const toolName = event.data?.name as string ?? 'unknown';
      const input = event.data?.input as Record<string, unknown> | undefined;
      if (toolName === 'write_file' || toolName === 'edit_file') {
        return `${toolName}: ${(input?.path as string ?? '').slice(0, 60)}`;
      }
      if (toolName === 'bash_execute') {
        return `bash: ${(input?.command as string ?? '').slice(0, 60)}`;
      }
      return null; // Skip read-only tools in summary
    }
    case 'turn:warning':
      return `⚠️ Turn limit warning (${event.data?.turn}/${event.data?.hardLimit})`;
    case 'turn:limit':
      return `🔴 Turn limit reached (${event.data?.turn})`;
    default:
      return null;
  }
}

/* ─── Public API ─────────────────────────────── */

/**
 * Digest a set of events from multiple sessions.
 *
 * @param eventsBySession - Map of sessionId → events collected during the watch period
 * @param peerEvents - Optional events from peer C-Level sessions
 */
export function digest(
  eventsBySession: Map<string, ActivityEvent[]>,
  peerEvents?: Map<string, ActivityEvent[]>,
): DigestResult {
  const now = Date.now();
  const sessionStates = new Map<string, SessionState>();
  const checkpoints = new Map<string, number>();

  // Build session states
  for (const [sessionId, events] of eventsBySession) {
    if (events.length === 0) continue;

    const state: SessionState = {
      sessionId,
      roleId: events[0].roleId,
      lastEventTs: new Date(events[events.length - 1].ts).getTime(),
      eventCount: events.length,
      errorCount: events.filter(e => e.type === 'msg:error' || (e.type === 'tool:result' && e.data?.is_error)).length,
      isDone: events.some(e => e.type === 'msg:done'),
      isError: events.some(e => e.type === 'msg:error'),
      isAwaitingInput: events.some(e => e.type === 'msg:awaiting_input') && !events.some(e => e.type === 'msg:done'),
      toolCalls: events.filter(e => e.type === 'tool:start').map(e => e.data?.name as string).filter(Boolean),
      filesModified: events
        .filter(e => e.type === 'tool:start' && ['write_file', 'edit_file'].includes(e.data?.name as string))
        .map(e => (e.data?.input as Record<string, unknown>)?.path as string)
        .filter(Boolean),
    };
    sessionStates.set(sessionId, state);
    checkpoints.set(sessionId, events[events.length - 1].seq);
  }

  // Calculate significance score
  let maxWeight = 0;
  for (const events of eventsBySession.values()) {
    for (const event of events) {
      const tier = classifyEvent(event);
      const weight = TIER_WEIGHT[tier];
      if (weight > maxWeight) maxWeight = weight;
    }
  }

  const anomalies = detectAnomalies(sessionStates, now);
  const anomalyBoost = anomalies.length > 0 ? Math.min(anomalies.reduce((sum, a) => sum + a.severity, 0), 10) : 0;
  const significanceScore = Math.min(10, Math.max(maxWeight, anomalyBoost));

  // Build digest text
  const text = buildDigestText(sessionStates, eventsBySession, anomalies, significanceScore);

  // Peer activity digest
  let peerActivity: string | undefined;
  if (peerEvents && peerEvents.size > 0) {
    const peerLines: string[] = ['## Peer Activity'];
    for (const [sessionId, events] of peerEvents) {
      if (events.length === 0) continue;
      const roleId = events[0].roleId;
      const significant = events.filter(e => {
        const tier = classifyEvent(e);
        return tier === 'critical' || tier === 'high';
      });
      for (const evt of significant.slice(-3)) {
        const summary = summarizeEvent(evt);
        if (summary) peerLines.push(`[${roleId}] ${summary}`);
      }
    }
    if (peerLines.length > 1) {
      peerActivity = peerLines.join('\n');
    }
  }

  return {
    text: peerActivity ? `${text}\n\n${peerActivity}` : text,
    significanceScore,
    anomalies,
    checkpoints,
    peerActivity,
    eventCount: Array.from(eventsBySession.values()).reduce((sum, evts) => sum + evts.length, 0),
    errorCount: Array.from(sessionStates.values()).reduce((sum, s) => sum + s.errorCount, 0),
  };
}

/**
 * Generate a quiet tick summary (for significanceScore < 2 && no anomalies)
 */
export function quietDigest(sessionCount: number, eventCount: number, errorCount: number): string {
  return `All ${sessionCount} sessions progressing normally. No anomalies. [${eventCount} events, ${errorCount} errors]`;
}
