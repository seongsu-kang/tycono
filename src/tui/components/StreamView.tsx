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

function eventToLine(event: SSEEvent): string | null {
  const time = formatTime(event.ts);
  const role = event.roleId.padEnd(12);

  switch (event.type) {
    case 'msg:start': {
      const task = ((event.data.task as string) ?? '').replace(/\u26D4[^\u26D4]*\u26D4[^"]*/g, '').trim().slice(0, 80);
      return `${time} ${role} \u25B6 Started: ${task}`;
    }
    case 'msg:done': {
      const turns = event.data.turns as number | undefined;
      return `${time} ${role} \u2713 Done${turns ? ` (${turns} turns)` : ''}`;
    }
    case 'msg:error':
      return `${time} ${role} \u2717 ${((event.data.error ?? event.data.message) as string ?? '').slice(0, 80)}`;
    case 'text': {
      const text = ((event.data.text as string) ?? '').trim();
      if (!text) return null;
      return `${time} ${role} ${text.slice(0, 120)}`;
    }
    case 'thinking': {
      const text = ((event.data.text as string) ?? '').trim().slice(0, 100);
      if (!text) return null;
      return `${time} ${role} \uD83D\uDCAD ${text}`;
    }
    case 'tool:start': {
      const name = (event.data.name as string) ?? 'tool';
      const input = event.data.input as Record<string, unknown> | undefined;
      let detail = '';
      if (input) {
        if (input.file_path) detail = ` ${String(input.file_path).slice(0, 60)}`;
        else if (input.command) detail = ` ${String(input.command).slice(0, 60)}`;
        else if (input.pattern) detail = ` ${String(input.pattern)}`;
      }
      return `${time} ${role} \u2192 ${name}${detail}`;
    }
    case 'dispatch:start':
      return `${time} ${role} \u21D2 dispatch ${event.data.targetRole as string ?? ''}`;
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
