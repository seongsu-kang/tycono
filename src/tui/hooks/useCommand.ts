/**
 * useCommand — input handler for TUI v2 (Multi-Wave)
 *
 * Default: natural language → sendDirective to focused wave
 * Commands (/ prefix):
 *   /waves               — list all waves
 *   /focus <n>           — switch to nth wave
 *   /new [text]          — create new wave (optionally with directive)
 *   /agents              — show wave→agent tree with resources
 *   /ports               — show port allocations
 *   /status              — show current wave + session status
 *   /assign <role> <task> — assign task to specific role
 *   /roles               — show org tree (Panel Mode)
 *   /help                — show help
 *   /quit                — exit
 */

import { useCallback } from 'react';
import { dispatchWave, sendDirective, fetchJson } from '../api';

export interface WaveInfo {
  waveId: string;
  directive: string;
  startedAt: number;
}

export interface CommandResult {
  type: 'success' | 'error' | 'info' | 'wave_started' | 'directive_sent' | 'stopped' | 'quit' | 'help' | 'panel' | 'waves_list' | 'focus_changed' | 'agents' | 'ports';
  message: string;
  waveId?: string;
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
  focusedWaveId: string | null;
  waves: WaveInfo[];
  onWaveCreated: (waveId: string, directive: string) => void;
  onFocusWave: (waveId: string) => void;
  onQuit: () => void;
  onShowPanel: () => void;
}

export function useCommand(options: UseCommandOptions) {
  const { focusedWaveId, waves, onWaveCreated, onFocusWave, onQuit, onShowPanel } = options;

  const execute = useCallback(async (input: string): Promise<CommandResult> => {
    const trimmed = input.trim();
    if (!trimmed) return { type: 'info', message: '' };

    // Slash commands
    if (trimmed.startsWith('/')) {
      const parts = trimmed.slice(1).split(/\s+/);
      const cmd = parts[0].toLowerCase();
      const args = parts.slice(1).join(' ');

      switch (cmd) {
        case 'waves': {
          return { type: 'waves_list', message: '__waves__' };
        }

        case 'focus': {
          const idx = parseInt(args, 10);
          if (isNaN(idx) || idx < 1 || idx > waves.length) {
            return { type: 'error', message: `Usage: /focus <1-${waves.length}>` };
          }
          const target = waves[idx - 1];
          onFocusWave(target.waveId);
          return { type: 'focus_changed', message: `Focused on Wave ${idx}`, waveId: target.waveId };
        }

        case 'new': {
          const directive = args || undefined;
          try {
            const result = await dispatchWave(directive);
            onWaveCreated(result.waveId, directive ?? '');
            return {
              type: 'wave_started',
              message: `Wave created`,
              waveId: result.waveId,
            };
          } catch (err) {
            return { type: 'error', message: `New wave failed: ${err instanceof Error ? err.message : 'unknown'}` };
          }
        }

        case 'agents':
          return { type: 'agents', message: '__agents__' };

        case 'ports':
          return { type: 'ports', message: '__ports__' };

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

    // Default: natural language → directive to focused wave
    if (focusedWaveId) {
      try {
        await sendDirective(focusedWaveId, trimmed);
        return { type: 'directive_sent', message: `Directive sent` };
      } catch (err) {
        return { type: 'error', message: `Failed: ${err instanceof Error ? err.message : 'unknown'}` };
      }
    } else {
      // No focused wave — create one with the directive
      try {
        const result = await dispatchWave(trimmed);
        onWaveCreated(result.waveId, trimmed);
        return {
          type: 'wave_started',
          message: `Wave created`,
          waveId: result.waveId,
        };
      } catch (err) {
        return { type: 'error', message: `Wave failed: ${err instanceof Error ? err.message : 'unknown'}` };
      }
    }
  }, [focusedWaveId, waves, onWaveCreated, onFocusWave, onQuit, onShowPanel]);

  return { execute };
}
