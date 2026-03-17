/**
 * StreamView — detailed stream panel for Panel Mode (right side)
 * Shows full event details with timestamps for a selected role.
 * No aggressive truncation — shows tools, thinking, dispatch like Claude Code.
 */

import React from 'react';
import { Box, Text } from 'ink';
import type { SSEEvent } from '../api';
import { getRoleColor } from '../theme';

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
  } catch {
    return '--:--:--';
  }
}

function renderEvent(event: SSEEvent): { content: string; contentColor: string } | null {
  switch (event.type) {
    case 'msg:start':
      return {
        content: `\u25B6 Started: ${(event.data.task as string)?.replace(/\u26D4[^\u26D4]*\u26D4[^"]*/g, '').trim().slice(0, 80) ?? ''}`,
        contentColor: 'green',
      };

    case 'msg:done': {
      const turns = event.data.turns as number | undefined;
      return {
        content: `\u2713 Done${turns ? ` (${turns} turns)` : ''}`,
        contentColor: 'green',
      };
    }

    case 'msg:error':
      return {
        content: `\u2717 Error: ${(event.data.error as string ?? event.data.message as string ?? '').slice(0, 120)}`,
        contentColor: 'red',
      };

    case 'text': {
      const text = ((event.data.text as string) ?? '');
      if (!text.trim()) return null;
      // Don't truncate — let terminal wrap
      return { content: text, contentColor: 'white' };
    }

    case 'thinking': {
      const text = ((event.data.text as string) ?? '').slice(0, 150);
      if (!text.trim()) return null;
      return { content: `\uD83D\uDCAD ${text}`, contentColor: 'gray' };
    }

    case 'tool:start': {
      const name = (event.data.name as string) ?? 'tool';
      const input = event.data.input;
      let detail = '';
      if (input && typeof input === 'object') {
        const inp = input as Record<string, unknown>;
        if (inp.file_path) detail = ` ${String(inp.file_path)}`;
        else if (inp.command) detail = ` ${String(inp.command).slice(0, 80)}`;
        else if (inp.pattern) detail = ` ${String(inp.pattern)}`;
        else detail = ` ${JSON.stringify(input).slice(0, 80)}`;
      }
      return {
        content: `\u2192 ${name}${detail}`,
        contentColor: 'gray',
      };
    }

    case 'tool:result':
      return {
        content: `\u2190 ${(event.data.name as string) ?? 'tool'} done`,
        contentColor: 'gray',
      };

    case 'dispatch:start':
      return {
        content: `\u21D2 dispatch ${event.data.targetRole as string ?? ''}: ${(event.data.task as string)?.replace(/\u26D4[^\u26D4]*\u26D4[^"]*/g, '').trim().slice(0, 80) ?? ''}`,
        contentColor: 'yellow',
      };

    case 'dispatch:done':
      return {
        content: `\u21D0 ${event.data.targetRole as string ?? ''} completed`,
        contentColor: 'yellow',
      };

    case 'msg:awaiting_input': {
      const question = (event.data.question as string) ?? '';
      return {
        content: question ? `? ${question.slice(0, 120)}` : '? Awaiting input...',
        contentColor: 'yellow',
      };
    }

    // Hidden (truly internal only)
    case 'heartbeat:tick':
    case 'heartbeat:skip':
    case 'prompt:assembled':
    case 'trace:response':
      return null;

    default:
      return null;
  }
}

export const StreamView: React.FC<StreamViewProps> = ({
  events,
  allRoleIds,
  streamStatus,
  waveId,
  roleLabel,
}) => {
  const maxVisible = 30;
  const visibleEvents = events.slice(-maxVisible);

  const turnCount = events.filter(e => e.type === 'text' || e.type === 'tool:start').length;

  const statusLabel = streamStatus === 'streaming' ? '\u25CF streaming'
    : streamStatus === 'done' ? '\u2713 done'
    : streamStatus === 'error' ? '\u2717 error'
    : 'idle';

  return (
    <Box flexDirection="column" paddingX={1} flexGrow={1}>
      <Box justifyContent="space-between">
        <Text bold color="cyan">
          Stream ({roleLabel})
        </Text>
        <Text color={streamStatus === 'streaming' ? 'green' : 'gray'}>
          {statusLabel} {turnCount > 0 ? `turn ${turnCount}` : ''}
        </Text>
      </Box>

      {visibleEvents.length === 0 && (
        <Box marginTop={1}>
          <Text color="gray" dimColor>
            {waveId
              ? `Streaming... waiting for ${roleLabel !== 'All' ? roleLabel + ' ' : ''}events`
              : 'No active stream. Dispatch a wave to start.'}
          </Text>
        </Box>
      )}

      {visibleEvents.map((event, i) => {
        const rendered = renderEvent(event);
        if (!rendered) return null;
        const roleColor = getRoleColor(event.roleId, allRoleIds);
        return (
          <Box key={`${event.seq}-${i}`}>
            <Text color="gray" dimColor>{formatTime(event.ts)} </Text>
            <Text color={roleColor} bold>{event.roleId.padEnd(12)}</Text>
            <Text color={rendered.contentColor} wrap="wrap">{rendered.content}</Text>
          </Box>
        );
      })}
    </Box>
  );
};
