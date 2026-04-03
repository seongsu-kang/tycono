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
import { dispatchWave, sendDirective, stopWave, fetchJson, killSession, cleanupSessions, fetchActiveSessions, fetchPresets, previewWave } from '../api';
import type { PresetSummary, WavePreview } from '../api';

export interface WaveInfo {
  waveId: string;
  directive: string;
  startedAt: number;
}

export interface CommandResult {
  type: 'success' | 'error' | 'info' | 'wave_started' | 'directive_sent' | 'stopped' | 'quit' | 'help' | 'panel' | 'waves_list' | 'focus_changed' | 'agents' | 'ports' | 'sessions' | 'cleanup' | 'docs' | 'read_file' | 'open_file' | 'preset_list' | 'preset_select' | 'wave_preview';
  message: string;
  waveId?: string;
  presets?: PresetSummary[];
  preview?: WavePreview;
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
          if (!directive) {
            // No args → show preset selection UI
            try {
              const presets = await fetchPresets();
              return { type: 'preset_select', message: '', presets };
            } catch (err) {
              return { type: 'error', message: `Failed to load presets: ${err instanceof Error ? err.message : 'unknown'}` };
            }
          }
          try {
            const preview = await previewWave(directive);
            return {
              type: 'wave_preview',
              message: '',
              preview,
            };
          } catch (err) {
            return { type: 'error', message: `Preview failed: ${err instanceof Error ? err.message : 'unknown'}` };
          }
        }

        case 'agents':
          return { type: 'agents', message: '__agents__' };

        case 'ports':
          return { type: 'ports', message: '__ports__' };

        case 'sessions':
          return { type: 'sessions', message: '__sessions__' };

        case 'stop': {
          // Interrupt supervisor (like Esc) — wave stays alive for new directives
          const targetWaveId = args?.trim() || focusedWaveId;
          if (!targetWaveId) {
            return { type: 'error', message: 'No wave focused. Use /stop or focus a wave first.' };
          }
          try {
            await stopWave(targetWaveId);
            return { type: 'success', message: '\u23F9 Interrupted. Type to continue.' };
          } catch (err) {
            return { type: 'error', message: `Interrupt failed: ${err instanceof Error ? err.message : 'unknown'}` };
          }
        }

        case 'kill': {
          if (!args) {
            return { type: 'error', message: 'Usage: /kill <sessionId>' };
          }
          try {
            await killSession(args);
            return { type: 'success', message: `Session ${args} killed` };
          } catch (err) {
            return { type: 'error', message: `Kill failed: ${err instanceof Error ? err.message : 'unknown'}` };
          }
        }

        case 'cleanup': {
          try {
            const result = await cleanupSessions();
            return { type: 'cleanup', message: `Cleaned ${result.cleaned} dead sessions. ${result.remaining} remaining.` };
          } catch (err) {
            return { type: 'error', message: `Cleanup failed: ${err instanceof Error ? err.message : 'unknown'}` };
          }
        }

        case 'docs':
          return { type: 'docs', message: '__docs__' };

        case 'read': {
          if (!args) return { type: 'error', message: 'Usage: /read <file_path>' };
          return { type: 'read_file', message: args.trim() };
        }

        case 'open': {
          if (!args) return { type: 'error', message: 'Usage: /open <file_path>' };
          return { type: 'open_file', message: args.trim() };
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
            return { type: 'success', message: `Task assigned to ${roleId}`, waveId: result.waveId };
          } catch (err) {
            return { type: 'error', message: `Assign failed: ${err instanceof Error ? err.message : 'unknown'}` };
          }
        }

        case 'preset': {
          const subCmd = args.split(/\s+/)[0]?.toLowerCase() || 'list';
          if (subCmd === 'list' || !subCmd) {
            try {
              const presets = await fetchPresets();
              return { type: 'preset_list', message: '', presets };
            } catch (err) {
              return { type: 'error', message: `Failed to load presets: ${err instanceof Error ? err.message : 'unknown'}` };
            }
          }
          return { type: 'error', message: `Unknown preset command: ${subCmd}. Try: /preset list` };
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
      // No focused wave — preview before creating
      // Check for "continuous:" prefix
      const isContinuous = /^continuous:\s*/i.test(trimmed);
      const directiveText = isContinuous ? trimmed.replace(/^continuous:\s*/i, '') : trimmed;
      try {
        const preview = await previewWave(directiveText, { continuous: isContinuous });
        return {
          type: 'wave_preview',
          message: '',
          preview,
        };
      } catch (err) {
        return { type: 'error', message: `Preview failed: ${err instanceof Error ? err.message : 'unknown'}` };
      }
    }
  }, [focusedWaveId, waves, onWaveCreated, onFocusWave, onQuit, onShowPanel]);

  return { execute };
}
