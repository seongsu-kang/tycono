/**
 * useCommand — command parsing + execution for TUI v2 Command Mode
 *
 * Commands:
 *   wave <directive> [--continuous]  — dispatch a wave
 *   directive <text>                 — send directive to active wave
 *   stop                            — abort all active executions
 *   status                          — show current wave + session status
 *   assign <role> <task>            — assign task to specific role
 *   summary                         — show last wave summary
 *   roles                           — show org tree inline
 *   help                            — show help
 *   quit                            — exit
 */

import { useCallback } from 'react';
import { dispatchWave, sendDirective, fetchJson } from '../api';

export interface ParsedCommand {
  cmd: string;
  args: string;
  flags: Record<string, boolean>;
}

export interface CommandResult {
  type: 'success' | 'error' | 'info' | 'wave_started' | 'directive_sent' | 'stopped' | 'quit' | 'help' | 'panel';
  message: string;
  waveId?: string;
}

export function parseCommand(input: string): ParsedCommand {
  const trimmed = input.trim();
  if (!trimmed) return { cmd: '', args: '', flags: {} };

  const parts = trimmed.split(/\s+/);
  const cmd = parts[0].toLowerCase();
  const flags: Record<string, boolean> = {};
  const argParts: string[] = [];

  for (let i = 1; i < parts.length; i++) {
    if (parts[i].startsWith('--')) {
      const flagName = parts[i].slice(2);
      if (flagName) flags[flagName] = true;
    } else {
      argParts.push(parts[i]);
    }
  }

  return { cmd, args: argParts.join(' '), flags };
}

async function postAbortAll(): Promise<void> {
  try {
    const status = await fetchJson<{
      statuses: Record<string, string>;
      activeExecutions: Array<{ id: string }>;
    }>('/api/exec/status');

    const abortPromises = (status.activeExecutions || []).map((exec) =>
      fetchJson(`/api/jobs/${exec.id}/abort`, { method: 'POST' }).catch(() => {})
    );
    await Promise.all(abortPromises);
  } catch {
    // If we can't get status, silently fail
  }
}

async function postAssign(roleId: string, task: string): Promise<{ waveId?: string }> {
  return fetchJson<{ waveId?: string }>('/api/jobs', {
    method: 'POST',
    body: {
      type: 'assign',
      roleId,
      task,
    },
  });
}

export interface UseCommandOptions {
  activeWaveId: string | null;
  onWaveStarted: (waveId: string) => void;
  onStopped: () => void;
  onQuit: () => void;
  onShowPanel: () => void;
}

export function useCommand(options: UseCommandOptions) {
  const { activeWaveId, onWaveStarted, onStopped, onQuit, onShowPanel } = options;

  const execute = useCallback(async (input: string): Promise<CommandResult> => {
    const { cmd, args, flags } = parseCommand(input);

    if (!cmd) return { type: 'info', message: '' };

    switch (cmd) {
      case 'wave': {
        if (!args) {
          return { type: 'error', message: 'Usage: wave <directive> [--continuous]' };
        }
        try {
          const result = await dispatchWave(args, { continuous: flags.continuous });
          onWaveStarted(result.waveId);
          const modeLabel = flags.continuous ? ' (continuous)' : '';
          return {
            type: 'wave_started',
            message: `Wave ${result.waveId.replace('wave-', '#')} started${modeLabel}`,
            waveId: result.waveId,
          };
        } catch (err) {
          return { type: 'error', message: `Wave failed: ${err instanceof Error ? err.message : 'unknown'}` };
        }
      }

      case 'directive': {
        if (!args) {
          return { type: 'error', message: 'Usage: directive <text>' };
        }
        if (!activeWaveId) {
          return { type: 'error', message: 'No active wave. Start one with: wave <directive>' };
        }
        try {
          await sendDirective(activeWaveId, args);
          return { type: 'directive_sent', message: `Directive sent to ${activeWaveId.replace('wave-', 'Wave #')}` };
        } catch (err) {
          return { type: 'error', message: `Directive failed: ${err instanceof Error ? err.message : 'unknown'}` };
        }
      }

      case 'stop': {
        try {
          await postAbortAll();
          onStopped();
          return { type: 'stopped', message: 'All active executions stopped.' };
        } catch (err) {
          return { type: 'error', message: `Stop failed: ${err instanceof Error ? err.message : 'unknown'}` };
        }
      }

      case 'status': {
        return { type: 'info', message: '__status__' };
      }

      case 'assign': {
        const spaceIdx = args.indexOf(' ');
        if (spaceIdx === -1 || !args) {
          return { type: 'error', message: 'Usage: assign <role> <task>' };
        }
        const roleId = args.slice(0, spaceIdx);
        const task = args.slice(spaceIdx + 1);
        try {
          const result = await postAssign(roleId, task);
          if (result.waveId) {
            onWaveStarted(result.waveId);
          }
          return { type: 'success', message: `Task assigned to ${roleId}`, waveId: result.waveId };
        } catch (err) {
          return { type: 'error', message: `Assign failed: ${err instanceof Error ? err.message : 'unknown'}` };
        }
      }

      case 'summary': {
        return { type: 'info', message: '__summary__' };
      }

      case 'roles': {
        onShowPanel();
        return { type: 'panel', message: 'Switching to Panel Mode...' };
      }

      case 'help': {
        return { type: 'help', message: '__help__' };
      }

      case 'quit':
      case 'exit': {
        onQuit();
        return { type: 'quit', message: 'Goodbye!' };
      }

      default: {
        return { type: 'error', message: `Unknown command: ${cmd}. Type "help" for available commands.` };
      }
    }
  }, [activeWaveId, onWaveStarted, onStopped, onQuit, onShowPanel]);

  return { execute };
}
