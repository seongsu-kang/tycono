/**
 * TUI Theme — color constants for Ink components
 */

export const theme = {
  // Status Bar
  statusBar: {
    bg: 'blue',
    fg: 'white',
  },

  // Org Tree
  org: {
    working: 'green',
    done: 'gray',
    idle: 'gray',
    error: 'red',
    awaitingInput: 'yellow',
    selected: 'cyan',
  },

  // Stream Panel
  stream: {
    // Role-specific colors
    roleColors: [
      'blue',     // CTO
      'green',    // CBO
      'yellow',   // Engineer
      'magenta',  // Designer
      'cyan',     // QA
      'red',      // PO
      'white',    // fallback
    ] as const,
    toolCall: 'gray',
    text: 'white',
    error: 'red',
    directive: 'yellow',
    thinking: 'gray',
  },

  // Command
  command: {
    prompt: 'green',
    hint: 'gray',
  },

  // Borders
  border: {
    active: 'cyan',
    inactive: 'gray',
  },
} as const;

/** Get a consistent color for a role by index */
export function getRoleColor(roleId: string, allRoleIds: string[]): string {
  const idx = allRoleIds.indexOf(roleId);
  const colors = theme.stream.roleColors;
  return colors[idx >= 0 ? idx % colors.length : colors.length - 1];
}

/** Status indicator character */
export function statusIcon(status: string): string {
  switch (status) {
    case 'working':
    case 'streaming':
      return '\u25CF'; // ●
    case 'done':
      return '\u2713'; // ✓
    case 'idle':
      return '\u25CB'; // ○
    case 'error':
      return '\u2717'; // ✗
    case 'awaiting_input':
      return '?';
    default:
      return '\u25CB'; // ○
  }
}
