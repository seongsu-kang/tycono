/**
 * CommandMode — scrollable terminal mode (like Claude Code)
 *
 * Uses Ink's <Static> to push past output into terminal scrollback.
 * Shows full output: text, tools, thinking, dispatch — no aggressive truncation.
 */

import React, { useState, useCallback, useRef } from 'react';
import { Box, Text, Static, useInput } from 'ink';
import TextInput from 'ink-text-input';
import type { SSEEvent, ActiveSessionInfo } from '../api';
import { getRoleColor } from '../theme';
// Markdown rendering is done inline via regex (no external dependency)

const SUPERVISOR_ROLE = 'ceo';

export interface StreamLine {
  id: number;
  text: string;
  color: string;
  prefix?: string;
  prefixColor?: string;
  indent?: boolean;
  markdown?: boolean;  // render text as markdown
}

interface CommandModeProps {
  events: SSEEvent[];
  allRoleIds: string[];
  systemMessages: StreamLine[];
  onSubmit: (input: string) => void;
  onQuickAction?: (action: string) => void;
  activeSessions?: ActiveSessionInfo[];
  focusedWaveId?: string | null;
}

let lineCounter = 0;

/** Filter out internal system prompt fragments and context leakage */
function isSystemNoise(text: string): boolean {
  const t = text.trim();
  if (!t) return true;
  // Injected supervisor system prompt header
  if (t.startsWith('[CEO Supervisor]') && t.includes('Your Role')) return true;
  if (t.startsWith('\u26D4 AKB Rule:')) return true;
  // System prompt fragments
  if (/^##\s*Your Role/i.test(t)) return true;
  if (t.includes('무엇을 도와드릴까요')) return true;
  // Conversation context leakage
  if (t.startsWith('[Previous execution')) return true;
  if (/^Tools used:/i.test(t)) return true;
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
          markdown: true,
        };
      } else {
        return {
          id: ++lineCounter,
          prefix: event.roleId,
          prefixColor: roleColor,
          text,
          color: 'white',
          indent: true,
          markdown: true,
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
      // Highlight file writes
      const isWrite = ['Write', 'Edit'].includes(toolName);
      return {
        id: ++lineCounter,
        prefix: isSupervisor ? undefined : event.roleId,
        prefixColor: roleColor,
        text: isWrite ? `  \u{1F4C4} ${toolName}${detail}` : `  \u2192 ${toolName}${detail}`,
        color: isWrite ? 'green' : 'gray',
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
        // Show minimal feedback so user knows input was received
        return {
          id: ++lineCounter,
          text: '\u2026 processing',
          color: 'gray',
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
  // Markdown: inline formatting only (no multi-line splitting — too many elements)
  if (line.markdown) {
    // Strip markdown markers for terminal display
    const cleaned = line.text
      .replace(/^#{1,4}\s+/gm, '')           // ## heading → heading
      .replace(/\*\*(.+?)\*\*/g, '$1')        // **bold** → bold
      .replace(/`(.+?)`/g, '$1')              // `code` → code
      .replace(/^---+$/gm, '\u2500'.repeat(40)); // --- → line

    return (
      <Box>
        {line.indent && <Text>  </Text>}
        {line.prefix && (
          <Text color={line.prefixColor} bold>
            {(line.prefix).padEnd(12)}
          </Text>
        )}
        <Text color={line.color} wrap="wrap">{cleaned}</Text>
      </Box>
    );
  }

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

const QUICK_ACTIONS = ['waves', 'agents', 'sessions', 'ports', 'docs'] as const;
type QuickAction = typeof QUICK_ACTIONS[number];

export const CommandMode: React.FC<CommandModeProps> = ({
  events,
  allRoleIds,
  systemMessages,
  onSubmit,
  onQuickAction,
  activeSessions,
  focusedWaveId,
}) => {
  const [input, setInput] = useState('');
  const committedRef = useRef(0);
  const [userInputs, setUserInputs] = useState<StreamLine[]>([]);
  const [quickBarActive, setQuickBarActive] = useState(false);
  const [quickBarIndex, setQuickBarIndex] = useState(0);

  // Convert events to stream lines (collapse consecutive thinking from same role)
  const eventLines: StreamLine[] = [];
  for (let i = 0; i < events.length; i++) {
    const event = events[i];
    // Skip thinking events if next event from same role is also thinking
    if (event.type === 'thinking' && i + 1 < events.length) {
      const next = events[i + 1];
      if (next.type === 'thinking' && next.roleId === event.roleId) continue;
    }
    const line = summarizeEvent(event, allRoleIds);
    if (line) eventLines.push(line);
  }

  // Merge user inputs + system messages + event lines (cap total)
  const allLines = [...userInputs, ...systemMessages, ...eventLines].slice(-60);

  // Reset committedRef if it exceeds allLines (prevents unbounded growth)
  if (committedRef.current > allLines.length) {
    committedRef.current = Math.max(0, allLines.length - 6);
  }

  // Commit older lines to Static scrollback, keep last 6 as live
  const newCount = allLines.length - committedRef.current;
  if (newCount > 6) {
    committedRef.current = allLines.length - 6;
  }

  // Only send last 20 committed items to Static (prevent Ink memory growth)
  const committedLines = allLines.slice(Math.max(0, committedRef.current - 20), committedRef.current);
  const liveLines = allLines.slice(committedRef.current);

  // Quick bar navigation
  useInput((ch, key) => {
    if (quickBarActive) {
      if (key.upArrow || key.escape) {
        setQuickBarActive(false);
        return;
      }
      if (key.leftArrow) {
        setQuickBarIndex(i => Math.max(0, i - 1));
        return;
      }
      if (key.rightArrow) {
        setQuickBarIndex(i => Math.min(QUICK_ACTIONS.length - 1, i + 1));
        return;
      }
      if (key.return) {
        const action = QUICK_ACTIONS[quickBarIndex];
        setQuickBarActive(false);
        onQuickAction?.(action);
        return;
      }
    } else {
      // Arrow down with empty input → activate quick bar
      if (key.downArrow && !input) {
        setQuickBarActive(true);
        setQuickBarIndex(0);
      }
    }
  });

  const handleSubmit = useCallback((value: string) => {
    const trimmed = value.trim();
    if (trimmed) {
      // Show user input immediately in scrollback (before AI responds)
      setUserInputs(prev => [...prev.slice(-10), {
        id: ++lineCounter,
        text: `> ${trimmed}`,
        color: 'green',
      }]);
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

      {/* Live mini-tree — shows active roles during dispatch */}
      {(() => {
        if (!activeSessions || !focusedWaveId) return null;
        const waveRoles = activeSessions
          .filter(s => s.waveId === focusedWaveId && s.status === 'active')
          .map(s => s.roleId);
        const unique = [...new Set(waveRoles)];
        if (unique.length === 0) return null;
        return (
          <Box paddingX={0}>
            <Text color="gray">{unique.map((r, i) => {
              const dot = '\u25CF';
              const arrow = i < unique.length - 1 ? '\u2192' : '';
              return `${dot}${r}${arrow}`;
            }).join('')}</Text>
          </Box>
        );
      })()}

      {/* Input */}
      <Box paddingX={0} marginTop={0}>
        <Text color={quickBarActive ? 'gray' : 'yellow'} bold>&gt; </Text>
        <TextInput
          value={input}
          onChange={setInput}
          onSubmit={handleSubmit}
          placeholder=""
          focus={!quickBarActive}
        />
      </Box>

      {/* Quick action bar — shown when arrow down from input */}
      {quickBarActive && (
        <Box paddingX={0} marginTop={0}>
          {QUICK_ACTIONS.map((action, i) => {
            const selected = i === quickBarIndex;
            return (
              <Box key={action} marginRight={1}>
                <Text color={selected ? 'cyan' : 'gray'} bold={selected}>
                  {selected ? `[ ${action} ]` : `  ${action}  `}
                </Text>
              </Box>
            );
          })}
          <Text color="gray" dimColor> \u2190\u2192  Enter  \u2191back</Text>
        </Box>
      )}
    </Box>
  );
};
