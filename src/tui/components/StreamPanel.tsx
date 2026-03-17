/**
 * StreamPanel — right panel showing real-time SSE event stream
 */

import React from 'react';
import { Box, Text } from 'ink';
import type { SSEEvent } from '../api';
import { getRoleColor } from '../theme';

interface StreamPanelProps {
  events: SSEEvent[];
  allRoleIds: string[];
  focused: boolean;
  streamStatus: 'idle' | 'streaming' | 'done' | 'error';
  waveId: string | null;
}

function formatTime(ts: string): string {
  try {
    const d = new Date(ts);
    return d.toLocaleTimeString('en-US', { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' });
  } catch {
    return '--:--:--';
  }
}

function renderEvent(event: SSEEvent, allRoleIds: string[]): { rolePart: string; roleColor: string; content: string; contentColor: string } {
  const roleColor = getRoleColor(event.roleId, allRoleIds);
  const rolePart = event.roleId;

  switch (event.type) {
    case 'msg:start':
      return {
        rolePart,
        roleColor,
        content: `\u25B6 Started: ${(event.data.task as string)?.slice(0, 60) ?? ''}`,
        contentColor: 'green',
      };

    case 'msg:done':
      return {
        rolePart,
        roleColor,
        content: '\u2713 Done',
        contentColor: 'gray',
      };

    case 'msg:error':
      return {
        rolePart,
        roleColor,
        content: `\u2717 Error: ${(event.data.error as string)?.slice(0, 60) ?? ''}`,
        contentColor: 'red',
      };

    case 'text':
      return {
        rolePart,
        roleColor,
        content: ((event.data.text as string) ?? '').slice(0, 120),
        contentColor: 'white',
      };

    case 'thinking':
      return {
        rolePart,
        roleColor,
        content: `(thinking) ${((event.data.text as string) ?? '').slice(0, 80)}`,
        contentColor: 'gray',
      };

    case 'tool:start':
      return {
        rolePart,
        roleColor,
        content: `\u2192 ${event.data.name as string ?? 'tool'}${event.data.input ? ` ${JSON.stringify(event.data.input).slice(0, 60)}` : ''}`,
        contentColor: 'gray',
      };

    case 'tool:result':
      return {
        rolePart,
        roleColor,
        content: `\u2190 ${(event.data.name as string) ?? 'tool'} done`,
        contentColor: 'gray',
      };

    case 'dispatch:start':
      return {
        rolePart,
        roleColor,
        content: `\u21D2 dispatch ${event.data.targetRole as string ?? ''}: ${(event.data.task as string)?.slice(0, 50) ?? ''}`,
        contentColor: 'yellow',
      };

    case 'dispatch:done':
      return {
        rolePart,
        roleColor,
        content: `\u21D0 ${event.data.targetRole as string ?? ''} completed`,
        contentColor: 'yellow',
      };

    case 'msg:awaiting_input':
      return {
        rolePart,
        roleColor,
        content: '? Awaiting input...',
        contentColor: 'yellow',
      };

    case 'heartbeat:tick':
    case 'heartbeat:skip':
      return {
        rolePart,
        roleColor,
        content: `\u2665 ${event.type === 'heartbeat:tick' ? 'tick' : 'skip'}`,
        contentColor: 'gray',
      };

    default:
      return {
        rolePart,
        roleColor,
        content: event.type,
        contentColor: 'gray',
      };
  }
}

export const StreamPanel: React.FC<StreamPanelProps> = ({
  events,
  allRoleIds,
  focused,
  streamStatus,
  waveId,
}) => {
  // Show last N events that fit
  const maxVisible = 20;
  const visibleEvents = events.slice(-maxVisible);

  // Filter out heartbeat noise for display
  const displayEvents = visibleEvents.filter(
    e => e.type !== 'heartbeat:tick' && e.type !== 'heartbeat:skip'
      && e.type !== 'prompt:assembled' && e.type !== 'trace:response'
  );

  const statusLabel = streamStatus === 'streaming' ? '\u25CF streaming'
    : streamStatus === 'done' ? '\u2713 done'
    : streamStatus === 'error' ? '\u2717 error'
    : 'idle';

  return (
    <Box flexDirection="column" paddingX={1} flexGrow={1}>
      <Box justifyContent="space-between">
        <Text bold color={focused ? 'cyan' : 'gray'}>
          {'\u2500\u2500'} Stream {waveId ? `(${waveId})` : ''} {'\u2500\u2500'}
        </Text>
        <Text color={streamStatus === 'streaming' ? 'green' : 'gray'}>{statusLabel}</Text>
      </Box>

      {displayEvents.length === 0 && (
        <Box marginTop={1}>
          <Text color="gray" dimColor>
            {waveId ? 'Waiting for events...' : 'No active stream. Press [w] to start a wave.'}
          </Text>
        </Box>
      )}

      {displayEvents.map((event, i) => {
        const { rolePart, roleColor, content, contentColor } = renderEvent(event, allRoleIds);
        return (
          <Box key={`${event.seq}-${i}`}>
            <Text color="gray" dimColor>{formatTime(event.ts)} </Text>
            <Text color={roleColor} bold>{rolePart.padEnd(12)}</Text>
            <Text color={contentColor}>{content}</Text>
          </Box>
        );
      })}
    </Box>
  );
};
