/**
 * CommandMode — scrollable terminal mode (like Claude Code)
 *
 * Uses Ink's <Static> to push past output into terminal scrollback.
 * Shows full output: text, tools, thinking, dispatch — no aggressive truncation.
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

/** Filter out only truly internal system prompt fragments */
function isSystemNoise(text: string): boolean {
  const t = text.trim();
  if (!t) return true;
  // Only filter the injected supervisor system prompt header
  if (t.startsWith('[CEO Supervisor]') && t.includes('Your Role')) return true;
  if (t.startsWith('\u26D4 AKB Rule:')) return true;
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
          text,
          color: 'white',
        };
      } else {
        return {
          id: ++lineCounter,
          prefix: event.roleId,
          prefixColor: roleColor,
          text,
          color: 'white',
          indent: true,
        };
      }
    }

    case 'thinking': {
      const text = ((event.data.text as string) ?? '').slice(0, 120);
      if (!text.trim()) return null;
      return {
        id: ++lineCounter,
        prefix: isSupervisor ? undefined : event.roleId,
        prefixColor: roleColor,
        text: `\uD83D\uDCAD ${text}`,
        color: 'gray',
        indent: !isSupervisor,
      };
    }

    case 'dispatch:start': {
      const target = (event.data.targetRole as string) ?? '';
      const task = ((event.data.task as string) ?? '');
      const cleanTask = task.replace(/\u26D4[^\u26D4]*\u26D4[^"]*/g, '').trim().slice(0, 80);
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
        text: `\u2192 ${target} \uBC30\uC815${cleanTask ? ': ' + cleanTask : ''}`,
        color: 'yellow',
        indent: true,
      };
    }

    case 'dispatch:done': {
      const target = (event.data.targetRole as string) ?? '';
      return {
        id: ++lineCounter,
        prefix: isSupervisor ? undefined : event.roleId,
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
        if (inp.file_path) detail = ` ${String(inp.file_path)}`;
        else if (inp.command) detail = ` ${String(inp.command).slice(0, 80)}`;
        else if (inp.pattern) detail = ` ${String(inp.pattern)}`;
        else if (inp.description) detail = ` ${String(inp.description).slice(0, 60)}`;
      }
      return {
        id: ++lineCounter,
        prefix: isSupervisor ? undefined : event.roleId,
        prefixColor: roleColor,
        text: `  \u2192 ${toolName}${detail}`,
        color: 'gray',
        indent: !isSupervisor,
      };
    }

    case 'tool:result': {
      const toolName = (event.data.name as string) ?? 'tool';
      return {
        id: ++lineCounter,
        prefix: isSupervisor ? undefined : event.roleId,
        prefixColor: roleColor,
        text: `  \u2190 ${toolName} done`,
        color: 'gray',
        indent: !isSupervisor,
      };
    }

    case 'msg:start': {
      const task = ((event.data.task as string) ?? '');
      const cleanTask = task.replace(/\u26D4[^\u26D4]*\u26D4[^"]*/g, '').trim().slice(0, 60);
      if (isSupervisor) {
        return {
          id: ++lineCounter,
          text: `\u25B6 Supervisor started${cleanTask ? ': ' + cleanTask : ''}`,
          color: 'cyan',
        };
      }
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
      if (isSupervisor) {
        return {
          id: ++lineCounter,
          text: `\u2713 Supervisor done${turns ? ` (${turns} turns)` : ''}`,
          color: 'cyan',
        };
      }
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
      const error = ((event.data.error as string) ?? (event.data.message as string) ?? '').slice(0, 120);
      if (isSupervisor) {
        return {
          id: ++lineCounter,
          text: `\u2717 Supervisor error: ${error}`,
          color: 'red',
        };
      }
      return {
        id: ++lineCounter,
        prefix: event.roleId,
        prefixColor: roleColor,
        text: `\u2717 ${error}`,
        color: 'red',
        indent: true,
      };
    }

    case 'msg:awaiting_input': {
      const question = (event.data.question as string) ?? '';
      return {
        id: ++lineCounter,
        prefix: isSupervisor ? undefined : event.roleId,
        prefixColor: roleColor,
        text: question ? `? ${question.slice(0, 100)}` : '? Awaiting input...',
        color: 'yellow',
        indent: !isSupervisor,
      };
    }

    // Hidden (truly internal)
    case 'heartbeat:tick':
    case 'heartbeat:skip':
    case 'prompt:assembled':
    case 'trace:response':
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
      <Text color={line.color} wrap="wrap">{line.text}</Text>
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
  const newCommitted = allLines.slice(committedRef.current);
  if (newCommitted.length > 8) {
    const toCommit = newCommitted.slice(0, -8);
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
      {/* Committed lines → pushed to terminal scrollback */}
      <Static items={committedLines}>
        {(line) => <StreamLineRow key={line.id} line={line} />}
      </Static>

      {/* Live lines → re-rendered */}
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
