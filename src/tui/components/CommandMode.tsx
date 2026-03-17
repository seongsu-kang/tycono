/**
 * CommandMode — default mode: stream summary flowing above, command input below
 *
 * SSE events are compressed into one-line summaries:
 *   dispatch:start → "CEO -> CTO Su (supervising...)"
 *   text           → "FE: Canvas game loop implementation..."
 *   tool:start     → "FE: -> edit index.html +87 lines"
 *   msg:done       → "QA: done (12 turns)"
 *   msg:error      → "FE: TypeError at line 42"
 *   thinking, heartbeat, trace → hidden
 */

import React, { useState, useCallback } from 'react';
import { Box, Text } from 'ink';
import TextInput from 'ink-text-input';
import type { SSEEvent } from '../api';
import { getRoleColor } from '../theme';

const MAX_STREAM_LINES = 20;

export interface StreamLine {
  id: number;
  text: string;
  color: string;
  prefix?: string;
  prefixColor?: string;
}

interface CommandModeProps {
  events: SSEEvent[];
  allRoleIds: string[];
  systemMessages: StreamLine[];
  onSubmit: (input: string) => void;
}

let lineCounter = 0;

/** Convert SSE event to a one-line summary. Returns null if event should be hidden. */
export function summarizeEvent(event: SSEEvent, allRoleIds: string[]): StreamLine | null {
  const roleColor = getRoleColor(event.roleId, allRoleIds);
  const roleName = event.roleId;

  switch (event.type) {
    case 'dispatch:start': {
      const target = (event.data.targetRole as string) ?? '';
      const task = ((event.data.task as string) ?? '').slice(0, 50);
      return {
        id: ++lineCounter,
        prefix: roleName,
        prefixColor: roleColor,
        text: `\u2192 ${target} (${task || 'dispatching...'})`,
        color: 'yellow',
      };
    }

    case 'dispatch:done': {
      const target = (event.data.targetRole as string) ?? '';
      return {
        id: ++lineCounter,
        prefix: roleName,
        prefixColor: roleColor,
        text: `\u2190 ${target} completed`,
        color: 'yellow',
      };
    }

    case 'text': {
      const text = ((event.data.text as string) ?? '').slice(0, 60);
      if (!text.trim()) return null;
      return {
        id: ++lineCounter,
        prefix: roleName,
        prefixColor: roleColor,
        text,
        color: 'white',
      };
    }

    case 'tool:start': {
      const toolName = (event.data.name as string) ?? 'tool';
      const input = event.data.input;
      let detail = '';
      if (input && typeof input === 'object') {
        const inp = input as Record<string, unknown>;
        if (inp.file_path) detail = ` ${String(inp.file_path).split('/').pop()}`;
        else if (inp.command) detail = ` ${String(inp.command).slice(0, 40)}`;
      }
      return {
        id: ++lineCounter,
        prefix: roleName,
        prefixColor: roleColor,
        text: `\u2192 ${toolName}${detail}`,
        color: 'gray',
      };
    }

    case 'msg:start': {
      const task = ((event.data.task as string) ?? '').slice(0, 50);
      return {
        id: ++lineCounter,
        prefix: roleName,
        prefixColor: roleColor,
        text: `\u25B6 ${task || 'started'}`,
        color: 'green',
      };
    }

    case 'msg:done': {
      const turns = event.data.turns as number | undefined;
      const turnLabel = turns ? ` (${turns} turns)` : '';
      return {
        id: ++lineCounter,
        prefix: roleName,
        prefixColor: roleColor,
        text: `\u2713 done${turnLabel}`,
        color: 'green',
      };
    }

    case 'msg:error': {
      const error = ((event.data.error as string) ?? '').slice(0, 60);
      return {
        id: ++lineCounter,
        prefix: roleName,
        prefixColor: roleColor,
        text: `\u2717 ${error}`,
        color: 'red',
      };
    }

    case 'msg:awaiting_input': {
      return {
        id: ++lineCounter,
        prefix: roleName,
        prefixColor: roleColor,
        text: '? Awaiting input...',
        color: 'yellow',
      };
    }

    // Hidden events
    case 'thinking':
    case 'heartbeat:tick':
    case 'heartbeat:skip':
    case 'prompt:assembled':
    case 'trace:response':
    case 'tool:result':
      return null;

    default:
      return null;
  }
}

export const CommandMode: React.FC<CommandModeProps> = ({
  events,
  allRoleIds,
  systemMessages,
  onSubmit,
}) => {
  const [input, setInput] = useState('');

  // Convert events to stream lines
  const eventLines: StreamLine[] = [];
  for (const event of events) {
    const line = summarizeEvent(event, allRoleIds);
    if (line) eventLines.push(line);
  }

  // Merge system messages and event lines, show last MAX_STREAM_LINES
  const allLines = [...systemMessages, ...eventLines].slice(-MAX_STREAM_LINES);

  const handleSubmit = useCallback((value: string) => {
    const trimmed = value.trim();
    if (trimmed) {
      onSubmit(trimmed);
    }
    setInput('');
  }, [onSubmit]);

  return (
    <Box flexDirection="column" flexGrow={1}>
      {/* Stream area */}
      <Box flexDirection="column" flexGrow={1} paddingX={1} overflow="hidden">
        {allLines.length === 0 && (
          <Box marginTop={1}>
            <Text color="gray" dimColor>
              Ready. Type "wave &lt;directive&gt;" to start, or "help" for commands.
            </Text>
          </Box>
        )}
        {allLines.map((line) => (
          <Box key={line.id}>
            {line.prefix && (
              <>
                <Text color={line.prefixColor} bold>
                  {(line.prefix + ':').padEnd(14)}
                </Text>
              </>
            )}
            <Text color={line.color}>{line.text}</Text>
          </Box>
        ))}
      </Box>

      {/* Separator */}
      <Box width="100%">
        <Text color="gray">{'─'.repeat(process.stdout.columns || 70)}</Text>
      </Box>

      {/* Command input */}
      <Box paddingX={1} justifyContent="space-between">
        <Box>
          <Text color="green" bold>&gt; </Text>
          <TextInput
            value={input}
            onChange={setInput}
            onSubmit={handleSubmit}
            placeholder=""
          />
        </Box>
        <Box>
          <Text color="gray" dimColor>[Tab] panel</Text>
        </Box>
      </Box>
    </Box>
  );
};
