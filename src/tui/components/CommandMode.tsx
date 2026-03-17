/**
 * CommandMode — scrollable terminal mode (like Claude Code)
 *
 * Uses Ink's <Static> to push past output into terminal scrollback.
 * Only the input prompt + status remain in the re-rendered area.
 * User can scroll up with mouse wheel to see history.
 */

import React, { useState, useCallback, useRef } from 'react';
import { Box, Text, Static } from 'ink';
import TextInput from 'ink-text-input';
import type { SSEEvent } from '../api';
import { getRoleColor } from '../theme';

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
  if (t.startsWith('## Your Role')) return true;
  if (t.startsWith('You are')) return true;
  if (t.startsWith('[CEO Supervisor]')) return true;
  if (t.startsWith('[Question from')) return true;
  if (t.includes('\u26D4 AKB Rule')) return true;
  if (t.includes('\u26D4  Read the')) return true;
  if (t.startsWith('\u26D4')) return true;
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
        return {
          id: ++lineCounter,
          text: text.slice(0, 200),
          color: 'white',
        };
      } else {
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
      const cleanTask = task.replace(/\u26D4[^\u26D4]*\u26D4[^"]*/g, '').trim().slice(0, 50);
      if (isSupervisor) {
        return {
          id: ++lineCounter,
          text: `\u2192 ${target} \uBC30\uC815${cleanTask ? ': ' + cleanTask : ''}`,
          color: 'yellow',
        };
      }
      return {
        id: ++lineCounter,
        prefix: event.roleId,
        prefixColor: roleColor,
        text: `\u2192 ${target} \uBC30\uC815`,
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
        text: `\u2190 ${target} \uC644\uB8CC`,
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
        return {
          id: ++lineCounter,
          text: `  \u2192 ${toolName}${detail}`,
          color: 'gray',
        };
      }
      return {
        id: ++lineCounter,
        prefix: event.roleId,
        prefixColor: roleColor,
        text: `\u2192 ${toolName}${detail}`,
        color: 'gray',
        indent: true,
      };
    }

    case 'msg:start': {
      if (isSupervisor) return null;
      const task = ((event.data.task as string) ?? '');
      const cleanTask = task.replace(/\u26D4[^\u26D4]*\u26D4[^"]*/g, '').trim().slice(0, 40);
      return {
        id: ++lineCounter,
        prefix: event.roleId,
        prefixColor: roleColor,
        text: `\u25B6 ${cleanTask || 'started'}`,
        color: 'green',
        indent: true,
      };
    }

    case 'msg:done': {
      const turns = event.data.turns as number | undefined;
      if (isSupervisor) return null;
      return {
        id: ++lineCounter,
        prefix: event.roleId,
        prefixColor: roleColor,
        text: `\u2713 done${turns ? ` (${turns} turns)` : ''}`,
        color: 'green',
        indent: true,
      };
    }

    case 'msg:error': {
      if (isSupervisor) return null;
      const error = ((event.data.error as string) ?? '').slice(0, 60);
      return {
        id: ++lineCounter,
        prefix: event.roleId,
        prefixColor: roleColor,
        text: `\u2717 ${error}`,
        color: 'red',
        indent: true,
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

/** Render a single StreamLine */
function StreamLineRow({ line }: { line: StreamLine }) {
  return (
    <Box>
      {line.indent && <Text>  </Text>}
      {line.prefix && (
        <Text color={line.prefixColor} bold>
          {(line.prefix).padEnd(12)}
        </Text>
      )}
      <Text color={line.color}>{line.text}</Text>
    </Box>
  );
}

export const CommandMode: React.FC<CommandModeProps> = ({
  events,
  allRoleIds,
  systemMessages,
  onSubmit,
}) => {
  const [input, setInput] = useState('');
  const committedRef = useRef(0);

  // Convert events to stream lines
  const eventLines: StreamLine[] = [];
  for (const event of events) {
    const line = summarizeEvent(event, allRoleIds);
    if (line) eventLines.push(line);
  }

  // Merge system messages and event lines
  const allLines = [...systemMessages, ...eventLines];

  // Split into committed (scrollback) and live (re-rendered)
  // Lines up to committedRef are frozen in scrollback
  const newCommitted = allLines.slice(committedRef.current);
  if (newCommitted.length > 5) {
    // Keep last 5 lines live, push rest to scrollback
    const toCommit = newCommitted.slice(0, -5);
    committedRef.current += toCommit.length;
  }

  const committedLines = allLines.slice(0, committedRef.current);
  const liveLines = allLines.slice(committedRef.current);

  const handleSubmit = useCallback((value: string) => {
    const trimmed = value.trim();
    if (trimmed) {
      onSubmit(trimmed);
    }
    setInput('');
  }, [onSubmit]);

  return (
    <Box flexDirection="column">
      {/* Committed lines → pushed to terminal scrollback (scrollable with mouse wheel) */}
      <Static items={committedLines}>
        {(line) => <StreamLineRow key={line.id} line={line} />}
      </Static>

      {/* Live lines → re-rendered on each update */}
      {liveLines.map((line) => (
        <StreamLineRow key={line.id} line={line} />
      ))}

      {/* Empty state */}
      {allLines.length === 0 && (
        <Box>
          <Text color="gray" dimColor>
            Type a message to your AI team, or /help for commands.
          </Text>
        </Box>
      )}

      {/* Input */}
      <Box paddingX={0} marginTop={0}>
        <Text color="yellow" bold>&gt; </Text>
        <TextInput
          value={input}
          onChange={setInput}
          onSubmit={handleSubmit}
          placeholder=""
        />
      </Box>
    </Box>
  );
};
