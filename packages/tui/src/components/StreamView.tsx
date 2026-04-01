/**
 * StreamView — stream panel for Panel Mode
 * Simplified to single Text render to prevent yoga OOM on wide terminals.
 * Previous: 30 events × 3 React elements = 90 yoga nodes → OOM on 245+ columns
 * Now: 1 Text element with pre-formatted string
 */

import React from 'react';
import { Box, Text } from 'ink';
import type { SSEEvent } from '../api';

interface StreamViewProps {
  events: SSEEvent[];
  allRoleIds: string[];
  streamStatus: 'idle' | 'streaming' | 'done' | 'error';
  waveId: string | null;
  roleLabel: string;
}

function formatTime(ts: string): string {
  try {
    const d = new Date(ts);
    return d.toLocaleTimeString('en-US', { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' });
  } catch { return '--:--:--'; }
}

/** Filter noise from text events — supervision internals, meta-commentary */
function isStreamNoise(text: string): boolean {
  const t = text.trim();
  if (!t) return true;
  // Supervision loop noise
  if (t.includes('$SUPERVISION_CMD') || t.includes('$DISPATCH_CMD')) return true;
  if (t.includes('supervision loop') || t.includes('supervision watch')) return true;
  // Meta-commentary (AI thinking out loud)
  if (/^(Let me |I'll |I need to |Now let me |Now I |Good[,.]|Alright|OK[,.]|Got it)/i.test(t)) return true;
  if (/^(Both dispatched|Both completed|All done|Session result)/i.test(t)) return true;
  // System prompt leakage
  if (t.startsWith('[CEO') || t.startsWith('⛔')) return true;
  if (t.startsWith('[Previous')) return true;
  return false;
}

function eventToLine(event: SSEEvent): string | null {
  const time = formatTime(event.ts);
  const role = event.roleId.padEnd(12);

  switch (event.type) {
    case 'msg:start': {
      const task = ((event.data.task as string) ?? '').replace(/\u26D4[^\u26D4]*\u26D4[^"]*/g, '').trim().slice(0, 80);
      return `${time} ${role} \u25B6 ${task || 'Started'}`;
    }
    case 'msg:done': {
      const turns = event.data.turns as number | undefined;
      return `${time} ${role} \u2713 Done${turns ? ` (${turns} turns)` : ''}`;
    }
    case 'msg:error':
      return `${time} ${role} \u2717 ${((event.data.error ?? event.data.message) as string ?? '').slice(0, 80)}`;
    case 'text': {
      const text = ((event.data.text as string) ?? '').trim();
      if (isStreamNoise(text)) return null;
      return `${time} ${role} ${text.slice(0, 120)}`;
    }
    case 'thinking':
      return null; // Hide thinking — internal noise
    case 'tool:start': {
      const name = (event.data.name as string) ?? 'tool';
      // Only show file writes — hide Read/Grep/Glob/Bash noise
      if (['Write', 'Edit', 'NotebookEdit'].includes(name)) {
        const input = event.data.input as Record<string, unknown> | undefined;
        const detail = input?.file_path ? ` ${String(input.file_path).split('/').slice(-2).join('/')}` : '';
        return `${time} ${role}   \uD83D\uDCC4 ${name}${detail}`;
      }
      return null; // Hide Read, Grep, Glob, Bash
    }
    case 'dispatch:start': {
      const target = (event.data.targetRole as string) ?? '';
      const task = ((event.data.task as string) ?? '').replace(/\u26D4[^\u26D4]*\u26D4[^"]*/g, '').trim().slice(0, 60);
      return `${time} ${role} \u21D2 dispatch ${target}${task ? ': ' + task : ''}`;
    }
    default:
      return null;
  }
}

const StreamViewInner: React.FC<StreamViewProps> = ({
  events, allRoleIds, streamStatus, waveId, roleLabel,
}) => {
  const termRows = process.stdout.rows || 40;
  const maxVisible = Math.min(Math.max(5, termRows - 15), 20);
  const visibleEvents = events.slice(-maxVisible);
  const turnCount = events.filter(e => e.type === 'text' || e.type === 'tool:start').length;

  const statusLabel = streamStatus === 'streaming' ? '\u25CF streaming'
    : streamStatus === 'done' ? '\u2713 done'
    : streamStatus === 'error' ? '\u2717 error'
    : 'idle';

  // Build single text block (1 yoga node instead of 90+)
  const lines = visibleEvents
    .map(e => eventToLine(e))
    .filter(Boolean) as string[];

  const content = lines.length > 0
    ? lines.join('\n')
    : (waveId ? `Streaming... waiting for ${roleLabel !== 'All' ? roleLabel + ' ' : ''}events` : 'No active stream. Dispatch a wave to start.');

  return (
    <Box flexDirection="column" paddingX={1}>
      <Text bold color="cyan">
        Stream ({roleLabel}){'  '}
        <Text color={streamStatus === 'streaming' ? 'green' : 'gray'}>
          {statusLabel} {turnCount > 0 ? `turn ${turnCount}` : ''}
        </Text>
      </Text>
      <Text color="white" wrap="truncate">{content}</Text>
    </Box>
  );
};

export const StreamView = React.memo(StreamViewInner);
