/**
 * CommandMode — chat-first mode
 *
 * User = CEO. Supervisor (ceo role) = user's AI proxy.
 * - Supervisor responses: shown directly (no prefix), like a conversation
 * - Team activity: indented with roleId, concise
 * - System prompts, internal noise: filtered out
 */

import React, { useState, useCallback } from 'react';
import { Box, Text } from 'ink';
import TextInput from 'ink-text-input';
import type { SSEEvent } from '../api';
import { getRoleColor } from '../theme';

const MAX_STREAM_LINES = 30;
const SUPERVISOR_ROLE = 'ceo';

export interface StreamLine {
  id: number;
  text: string;
  color: string;
  prefix?: string;
  prefixColor?: string;
  indent?: boolean;
}

interface CommandModeProps {
  events: SSEEvent[];
  allRoleIds: string[];
  systemMessages: StreamLine[];
  onSubmit: (input: string) => void;
}

let lineCounter = 0;

/** Filter out system prompt noise from text */
function isSystemNoise(text: string): boolean {
  const t = text.trim();
  if (!t) return true;
  // System prompt fragments
  if (t.startsWith('## Your Role')) return true;
  if (t.startsWith('You are')) return true;
  if (t.startsWith('[CEO Supervisor]')) return true;
  if (t.startsWith('[Question from')) return true;
  if (t.includes('⛔ AKB Rule')) return true;
  if (t.includes('⛔  Read the')) return true;
  if (t.startsWith('⛔')) return true;
  return false;
}

/** Convert SSE event to stream lines */
export function summarizeEvent(event: SSEEvent, allRoleIds: string[]): StreamLine | null {
  const isSupervisor = event.roleId === SUPERVISOR_ROLE;
  const roleColor = getRoleColor(event.roleId, allRoleIds);

  switch (event.type) {
    case 'text': {
      const text = ((event.data.text as string) ?? '');
      if (isSystemNoise(text)) return null;

      if (isSupervisor) {
        // Supervisor text → direct response (no prefix, generous length)
        return {
          id: ++lineCounter,
          text: text.slice(0, 200),
          color: 'white',
        };
      } else {
        // Team text → indented with role prefix, concise
        return {
          id: ++lineCounter,
          prefix: event.roleId,
          prefixColor: roleColor,
          text: text.slice(0, 80),
          color: 'white',
          indent: true,
        };
      }
    }

    case 'dispatch:start': {
      const target = (event.data.targetRole as string) ?? '';
      const task = ((event.data.task as string) ?? '');
      // Filter out system prompt from task display
      const cleanTask = task.replace(/⛔[^⛔]*⛔[^"]*/g, '').trim().slice(0, 50);
      if (isSupervisor) {
        return {
          id: ++lineCounter,
          text: `→ ${target} 배정${cleanTask ? ': ' + cleanTask : ''}`,
          color: 'yellow',
        };
      }
      return {
        id: ++lineCounter,
        prefix: event.roleId,
        prefixColor: roleColor,
        text: `→ ${target} 배정`,
        color: 'yellow',
        indent: true,
      };
    }

    case 'dispatch:done': {
      const target = (event.data.targetRole as string) ?? '';
      return {
        id: ++lineCounter,
        prefix: event.roleId,
        prefixColor: roleColor,
        text: `← ${target} 완료`,
        color: 'yellow',
        indent: !isSupervisor,
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

      if (isSupervisor) {
        // Supervisor tool use → subtle
        return {
          id: ++lineCounter,
          text: `  → ${toolName}${detail}`,
          color: 'gray',
        };
      }
      return {
        id: ++lineCounter,
        prefix: event.roleId,
        prefixColor: roleColor,
        text: `→ ${toolName}${detail}`,
        color: 'gray',
        indent: true,
      };
    }

    case 'msg:start': {
      if (isSupervisor) return null; // Hide supervisor start (noise)
      const task = ((event.data.task as string) ?? '');
      const cleanTask = task.replace(/⛔[^⛔]*⛔[^"]*/g, '').trim().slice(0, 40);
      return {
        id: ++lineCounter,
        prefix: event.roleId,
        prefixColor: roleColor,
        text: `▶ ${cleanTask || 'started'}`,
        color: 'green',
        indent: true,
      };
    }

    case 'msg:done': {
      const turns = event.data.turns as number | undefined;
      if (isSupervisor) return null; // Hide supervisor done
      return {
        id: ++lineCounter,
        prefix: event.roleId,
        prefixColor: roleColor,
        text: `✓ done${turns ? ` (${turns} turns)` : ''}`,
        color: 'green',
        indent: true,
      };
    }

    case 'msg:error': {
      const error = ((event.data.error as string) ?? '').slice(0, 60);
      return {
        id: ++lineCounter,
        prefix: event.roleId,
        prefixColor: roleColor,
        text: `✗ ${error}`,
        color: 'red',
        indent: !isSupervisor,
      };
    }

    case 'msg:awaiting_input':
      return {
        id: ++lineCounter,
        text: isSupervisor ? '...' : `  ${event.roleId}: waiting`,
        color: 'yellow',
      };

    // Hidden
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
              Type a message to your AI team, or /help for commands.
            </Text>
          </Box>
        )}
        {allLines.map((line) => (
          <Box key={line.id}>
            {line.indent && <Text>  </Text>}
            {line.prefix && (
              <Text color={line.prefixColor} bold>
                {(line.prefix).padEnd(12)}
              </Text>
            )}
            <Text color={line.color}>{line.text}</Text>
          </Box>
        ))}
      </Box>

      {/* Separator */}
      <Box width="100%">
        <Text color="gray">{'─'.repeat(process.stdout.columns || 70)}</Text>
      </Box>

      {/* Input */}
      <Box paddingX={1} justifyContent="space-between">
        <Box>
          <Text color="yellow" bold>&gt; </Text>
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
