/**
 * StreamView — detailed stream panel for Panel Mode (right side)
 * Shows full event details with timestamps for a selected role.
 * Reuses the rendering logic from StreamPanel v1 but with the v2 layout.
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

function renderEvent(event: SSEEvent, allRoleIds: string[]): { content: string; contentColor: string } | null {
  switch (event.type) {
    case 'msg:start':
      return {
        content: `\u25B6 Started: ${(event.data.task as string)?.slice(0, 60) ?? ''}`,
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
        content: `\u2717 Error: ${(event.data.error as string)?.slice(0, 60) ?? ''}`,
        contentColor: 'red',
      };

    case 'text': {
      const text = ((event.data.text as string) ?? '').slice(0, 120);
      if (!text.trim()) return null;
      return { content: text, contentColor: 'white' };
    }

    case 'tool:start': {
      const name = (event.data.name as string) ?? 'tool';
      const input = event.data.input;
      let detail = '';
      if (input && typeof input === 'object') {
        const inp = input as Record<string, unknown>;
        if (inp.file_path) detail = ` ${String(inp.file_path)}`;
        else if (inp.command) detail = ` ${String(inp.command).slice(0, 60)}`;
        else detail = ` ${JSON.stringify(input).slice(0, 60)}`;
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
        content: `\u21D2 dispatch ${event.data.targetRole as string ?? ''}: ${(event.data.task as string)?.slice(0, 50) ?? ''}`,
        contentColor: 'yellow',
      };

    case 'dispatch:done':
      return {
        content: `\u21D0 ${event.data.targetRole as string ?? ''} completed`,
        contentColor: 'yellow',
      };

    case 'msg:awaiting_input':
      return {
        content: '? Awaiting input...',
        contentColor: 'yellow',
      };

    // Hidden events
    case 'thinking':
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
  const maxVisible = 20;
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
            {waveId ? 'Waiting for events...' : 'No active stream.'}
          </Text>
        </Box>
      )}

      {visibleEvents.map((event, i) => {
        const rendered = renderEvent(event, allRoleIds);
        if (!rendered) return null;
        const roleColor = getRoleColor(event.roleId, allRoleIds);
        return (
          <Box key={`${event.seq}-${i}`}>
            <Text color="gray" dimColor>{formatTime(event.ts)} </Text>
            <Text color={roleColor} bold>{event.roleId.padEnd(12)}</Text>
            <Text color={rendered.contentColor}>{rendered.content}</Text>
          </Box>
        );
      })}
    </Box>
  );
};
