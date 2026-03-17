/**
 * useCommand — input handler for TUI v2
 *
 * Default: natural language → wave dispatch or directive (if wave active)
 * Commands (/ prefix):
 *   /stop                — abort all active executions
 *   /status              — show current wave + session status
 *   /assign <role> <task> — assign task to specific role
 *   /roles               — show org tree (Panel Mode)
 *   /help                — show help
 *   /quit                — exit
 */

import { useCallback } from 'react';
import { dispatchWave, sendDirective, fetchJson } from '../api';

export interface CommandResult {
  type: 'success' | 'error' | 'info' | 'wave_started' | 'directive_sent' | 'stopped' | 'quit' | 'help' | 'panel';
  message: string;
  waveId?: string;
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
    const trimmed = input.trim();
    if (!trimmed) return { type: 'info', message: '' };

    // Slash commands: /stop, /status, /help, /quit, /roles, /assign
    if (trimmed.startsWith('/')) {
      const parts = trimmed.slice(1).split(/\s+/);
      const cmd = parts[0].toLowerCase();
      const args = parts.slice(1).join(' ');

      switch (cmd) {
        case 'stop': {
          try {
            await postAbortAll();
            onStopped();
            return { type: 'stopped', message: 'All active executions stopped.' };
          } catch (err) {
            return { type: 'error', message: `Stop failed: ${err instanceof Error ? err.message : 'unknown'}` };
          }
        }

        case 'status':
          return { type: 'info', message: '__status__' };

        case 'assign': {
          const spaceIdx = args.indexOf(' ');
          if (spaceIdx === -1 || !args) {
            return { type: 'error', message: 'Usage: /assign <role> <task>' };
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

        case 'roles':
          onShowPanel();
          return { type: 'panel', message: '' };

        case 'help':
          return { type: 'help', message: '__help__' };

        case 'quit':
        case 'exit':
          onQuit();
          return { type: 'quit', message: 'Goodbye!' };

        default:
          return { type: 'error', message: `Unknown command: /${cmd}. Type /help for commands.` };
      }
    }

    // Default: natural language → directive (if wave active) or new wave
    if (activeWaveId) {
      try {
        await sendDirective(activeWaveId, trimmed);
        return { type: 'directive_sent', message: `Directive sent` };
      } catch (err) {
        return { type: 'error', message: `Failed: ${err instanceof Error ? err.message : 'unknown'}` };
      }
    } else {
      try {
        const result = await dispatchWave(trimmed);
        onWaveStarted(result.waveId);
        return {
          type: 'wave_started',
          message: `Wave ${result.waveId.replace('wave-', '#')} started`,
          waveId: result.waveId,
        };
      } catch (err) {
        return { type: 'error', message: `Wave failed: ${err instanceof Error ? err.message : 'unknown'}` };
      }
    }
  }, [activeWaveId, onWaveStarted, onStopped, onQuit, onShowPanel]);

  return { execute };
}
