/**
 * TUI App v2 — Multi-Wave Hybrid Mode (Command + Panel)
 *
 * Wave = Claude Code session. Persistent, resumable.
 * Multiple waves can be open; user switches with /focus.
 *
 * Two modes:
 *   Command Mode (default) — stream summary + command input (> prompt)
 *   Panel Mode (Tab)       — Org Tree left + Role stream right
 *
 * Tab toggles between modes, Esc returns to Command Mode.
 */

import React, { useState, useCallback, useMemo, useEffect, useRef } from 'react';
import { Box, Text, useApp, useInput } from 'ink';
import { StatusBar } from './components/StatusBar';
import { OrgTree } from './components/OrgTree';
import { StreamView } from './components/StreamView';
import { CommandMode, type StreamLine } from './components/CommandMode';
import { PanelMode } from './components/PanelMode';
import { SetupWizard } from './components/SetupWizard';
import { useApi } from './hooks/useApi';
import { useSSE } from './hooks/useSSE';
import { useCommand, type WaveInfo } from './hooks/useCommand';
import { dispatchWave } from './api';
import type { ActiveSessionInfo, PresetSummary } from './api';
import { buildOrgTree, flattenOrgRoleIds } from './store';

type Mode = 'command' | 'panel';
type View = 'loading' | 'setup' | 'dashboard';

let sysLineId = 100000;

/** Format agent tree: Wave → Role → Session + resources */
function formatAgentsTree(
  waves: WaveInfo[],
  allSessions: import('./api').SessionInfo[],
  activeSessions: ActiveSessionInfo[],
  focusedWaveId: string | null,
): StreamLine[] {
  const lines: StreamLine[] = [];

  // Build port lookup: sessionId → ActiveSessionInfo
  const portMap = new Map<string, ActiveSessionInfo>();
  for (const s of activeSessions) {
    portMap.set(s.sessionId, s);
  }

  // Group sessions by waveId
  const sessionsByWave = new Map<string, import('./api').SessionInfo[]>();
  const unlinked: import('./api').SessionInfo[] = [];

  for (const s of allSessions) {
    if (s.waveId) {
      if (!sessionsByWave.has(s.waveId)) sessionsByWave.set(s.waveId, []);
      sessionsByWave.get(s.waveId)!.push(s);
    } else if (s.status === 'active') {
      unlinked.push(s);
    }
  }

  if (waves.length === 0 && unlinked.length === 0) {
    lines.push({ id: ++sysLineId, text: 'No active agents.', color: 'gray' });
    return lines;
  }

  // Display each wave as tree
  for (let i = 0; i < waves.length; i++) {
    const w = waves[i];
    const isFocused = w.waveId === focusedWaveId;
    const marker = isFocused ? '\u25B8' : ' ';
    const label = w.directive ? w.directive.slice(0, 50) : '(idle)';
    const waveSessions = sessionsByWave.get(w.waveId) ?? [];

    lines.push({
      id: ++sysLineId,
      text: `${marker}Wave ${i + 1}: ${label}  (${waveSessions.length} sessions)`,
      color: isFocused ? 'green' : 'cyan',
    });

    if (waveSessions.length === 0) {
      lines.push({ id: ++sysLineId, text: '  (empty)', color: 'gray' });
      continue;
    }

    // Group wave sessions by role
    const roleGroups = new Map<string, import('./api').SessionInfo[]>();
    for (const s of waveSessions) {
      if (!roleGroups.has(s.roleId)) roleGroups.set(s.roleId, []);
      roleGroups.get(s.roleId)!.push(s);
    }

    const roleEntries = Array.from(roleGroups.entries());
    for (let ri = 0; ri < roleEntries.length; ri++) {
      const [roleId, roleSessions] = roleEntries[ri];
      const isLastRole = ri === roleEntries.length - 1;
      const branch = isLastRole ? '\u2514\u2500' : '\u251C\u2500';

      // Role status
      const hasActive = roleSessions.some(s => s.status === 'active');
      const statusIcon = hasActive ? '\u25CF' : '\u25CB';
      const statusColor = hasActive ? 'green' : 'gray';

      lines.push({
        id: ++sysLineId,
        text: `  ${branch} ${statusIcon} ${roleId}  (${roleSessions.length})`,
        color: statusColor,
      });

      // Sessions under this role
      const indent = isLastRole ? '     ' : '  \u2502  ';
      for (const sess of roleSessions.slice(-3)) { // Show last 3 sessions per role
        const port = portMap.get(sess.id);
        const portStr = port ? `API:${port.ports.api} Vite:${port.ports.vite}` : '';
        const worktree = port?.worktreePath ? `\u{1F33F}${port.worktreePath.split('/').pop()}` : '';
        const statusStr = sess.status === 'active' ? '\u25CF' : '\u25CB';
        const sesColor = sess.status === 'active' ? 'white' : 'gray';

        lines.push({
          id: ++sysLineId,
          text: `${indent}${statusStr} ${sess.id.slice(0, 22)}  ${portStr} ${worktree}`,
          color: sesColor,
        });
      }
      if (roleSessions.length > 3) {
        lines.push({
          id: ++sysLineId,
          text: `${indent}  ... +${roleSessions.length - 3} more`,
          color: 'gray',
        });
      }
    }
  }

  // Unlinked active sessions
  if (unlinked.length > 0) {
    lines.push({ id: ++sysLineId, text: '', color: 'white' });
    lines.push({ id: ++sysLineId, text: `Unlinked (${unlinked.length}):`, color: 'yellow' });
    for (const s of unlinked.slice(-5)) {
      const port = portMap.get(s.id);
      const portStr = port ? `API:${port.ports.api}` : '';
      lines.push({
        id: ++sysLineId,
        text: `  ${s.roleId.padEnd(12)} ${s.id.slice(0, 22)}  ${portStr}`,
        color: 'gray',
      });
    }
  }

  return lines;
}

/** Format port allocations for /ports command */
function formatPortsList(activeSessions: ActiveSessionInfo[], portSummary: { active: number; totalPorts: number }): StreamLine[] {
  const lines: StreamLine[] = [];

  if (activeSessions.length === 0) {
    lines.push({ id: ++sysLineId, text: 'No port allocations.', color: 'gray' });
    return lines;
  }

  lines.push({
    id: ++sysLineId,
    text: `Port Allocations (${portSummary.active} active, ${portSummary.totalPorts} ports):`,
    color: 'cyan',
  });

  for (const s of activeSessions) {
    const alive = s.alive === false ? ' DEAD' : s.pid ? ` PID:${s.pid}` : '';
    const waveLabel = s.waveId ? ` (${s.waveId.replace('wave-', 'W')})` : '';
    lines.push({
      id: ++sysLineId,
      text: `  :${s.ports.api}/:${s.ports.vite} \u2192 ${s.roleId}${waveLabel}${alive}`,
      color: s.alive === false ? 'red' : 'white',
    });
  }

  // Available range hint
  const usedApi = activeSessions.map(s => s.ports.api).filter(Boolean);
  const maxApi = usedApi.length > 0 ? Math.max(...usedApi) + 1 : 3001;
  lines.push({
    id: ++sysLineId,
    text: `  Available: :${maxApi}+ API, :${5173 + activeSessions.length}+ Vite`,
    color: 'gray',
  });

  return lines;
}

export const App: React.FC = () => {
  const { exit } = useApp();
  const api = useApi();

  // View state: loading -> setup (no company) -> dashboard
  const [view, setView] = useState<View>('loading');

  // Loading → setup/dashboard transition
  React.useEffect(() => {
    if (!api.loaded) return;
    if (view === 'loading') {
      setView(api.company ? 'dashboard' : 'setup');
    }
  }, [api.loaded, api.company, view]);

  // Fallback: if loading for more than 8 seconds, force to setup
  React.useEffect(() => {
    if (view !== 'loading') return;
    const timer = setTimeout(() => {
      if (view === 'loading') {
        setView('setup');
      }
    }, 8000);
    return () => clearTimeout(timer);
  }, [view]);

  const handleSetupComplete = useCallback(() => {
    api.refresh();
    setView('dashboard');
  }, [api]);

  // Mode state
  const [mode, setMode] = useState<Mode>('command');

  // Multi-Wave state
  const [waves, setWaves] = useState<WaveInfo[]>([]);
  const [focusedWaveId, setFocusedWaveId] = useState<string | null>(null);
  const autoWaveCreated = useRef(false);

  // Panel mode state
  const [selectedRoleIndex, setSelectedRoleIndex] = useState(0);
  const [selectedRoleId, setSelectedRoleId] = useState<string | null>(null);

  // System messages (command feedback displayed in stream area)
  const [systemMessages, setSystemMessages] = useState<StreamLine[]>([]);

  // Preset selection state (for /new without args)
  const [pendingPresetSelect, setPendingPresetSelect] = useState<PresetSummary[] | null>(null);
  const selectedPresetRef = useRef<string | null>(null);

  // Terminal full height with resize tracking (minus 1 for wide-char overflow safety)
  const [termHeight, setTermHeight] = useState((process.stdout.rows || 30) - 1);

  useEffect(() => {
    const onResize = () => {
      setTermHeight((process.stdout.rows || 30) - 1);
    };
    process.stdout.on('resize', onResize);
    return () => {
      process.stdout.off('resize', onResize);
    };
  }, []);

  const addSystemMessage = useCallback((text: string, color: string = 'yellow') => {
    setSystemMessages(prev => {
      const next = [...prev, { id: ++sysLineId, text, color }];
      return next.length > 30 ? next.slice(-30) : next;
    });
  }, []);

  const addSystemLines = useCallback((lines: StreamLine[]) => {
    setSystemMessages(prev => {
      const next = [...prev, ...lines];
      return next.length > 40 ? next.slice(-40) : next;
    });
  }, []);

  // Auto-wave: on dashboard entry, create an empty wave or attach to existing
  useEffect(() => {
    if (view !== 'dashboard' || autoWaveCreated.current) return;

    if (api.activeWaves.length > 0 || api.pastWaves.length > 0) {
      // Attach to existing active waves from API
      const apiWaves: WaveInfo[] = api.activeWaves.map(w => ({
        waveId: w.waveId,
        directive: w.directive ?? '',
        startedAt: w.startedAt ?? Date.now(),
      }));

      // Also append past waves (completed) that aren't already in active list
      const activeIds = new Set(apiWaves.map(w => w.waveId));
      const pastEntries: WaveInfo[] = api.pastWaves
        .filter(pw => !activeIds.has(pw.id))
        .slice(0, 10)
        .map(pw => ({
          waveId: pw.id,
          directive: pw.directive || '',
          startedAt: pw.startedAt ? new Date(pw.startedAt).getTime() : 0,
        }));

      const allWaves = [...pastEntries, ...apiWaves];
      allWaves.sort((a, b) => a.startedAt - b.startedAt);
      setWaves(allWaves);
      // Focus most recent wave
      setFocusedWaveId(allWaves[allWaves.length - 1]?.waveId ?? null);
      autoWaveCreated.current = true;
    } else if (api.loaded) {
      // No active waves, no past waves — fresh start
      autoWaveCreated.current = true;
      dispatchWave().then(result => {
        const newWave: WaveInfo = {
          waveId: result.waveId,
          directive: '',
          startedAt: Date.now(),
        };
        setWaves([newWave]);
        setFocusedWaveId(result.waveId);
      }).catch(() => {
        autoWaveCreated.current = true;
      });
    }
  }, [view, api.activeWaves, api.pastWaves, api.loaded]);

  // SSE subscription to focused wave
  const sse = useSSE(focusedWaveId);

  // Build org tree — flatRoleIds follows visual top-to-bottom order
  const roles = api.company?.roles ?? [];
  const statuses = api.execStatus?.statuses ?? {};
  const orgTree = useMemo(() => buildOrgTree(roles, statuses), [roles, statuses]);
  const flatRoleIds = useMemo(() => ['ceo', ...flattenOrgRoleIds(orgTree)], [orgTree]);

  // Active count
  const activeCount = Object.values(statuses).filter(
    s => s === 'working' || s === 'streaming'
  ).length;

  // Derived wave status
  const derivedWaveStatus = useMemo(() => {
    if (sse.streamStatus === 'streaming') return 'running' as const;
    if (sse.streamStatus === 'done') return 'done' as const;
    if (activeCount > 0) return 'running' as const;
    return 'idle' as const;
  }, [sse.streamStatus, activeCount]);

  // Focused wave index (1-based) + startedAt
  const focusedWaveIndex = useMemo(() => {
    if (!focusedWaveId) return 0;
    return waves.findIndex(w => w.waveId === focusedWaveId) + 1;
  }, [focusedWaveId, waves]);

  const focusedWaveStartedAt = useMemo(() => {
    if (!focusedWaveId) return 0;
    return waves.find(w => w.waveId === focusedWaveId)?.startedAt ?? 0;
  }, [focusedWaveId, waves]);

  // Wave creation callback — shared by useCommand and preset selection flow
  const onWaveCreated = useCallback((newWaveId: string, directive: string) => {
    const newWave: WaveInfo = {
      waveId: newWaveId,
      directive,
      startedAt: Date.now(),
    };
    setWaves(prev => [...prev, newWave]);
    setFocusedWaveId(newWaveId);
    sse.clearEvents();
    api.refresh();
  }, [sse, api]);

  // Command handler
  const { execute } = useCommand({
    focusedWaveId,
    waves,
    onWaveCreated,
    onFocusWave: (waveId) => {
      setFocusedWaveId(waveId);
      sse.clearEvents();
      setSystemMessages([]);
      // SSE reconnect handles history replay automatically
    },
    onQuit: () => exit(),
    onShowPanel: () => setMode('panel'),
  });

  // Handle command submission from CommandMode
  const handleCommandSubmit = useCallback(async (input: string) => {
    // User input is already shown by CommandMode (immediate commit to Static)

    // Preset selection mode: user types a number to pick preset
    if (pendingPresetSelect) {
      const trimmed = input.trim();
      const idx = parseInt(trimmed, 10);
      if (!isNaN(idx) && idx >= 1 && idx <= pendingPresetSelect.length) {
        const selected = pendingPresetSelect[idx - 1];
        setPendingPresetSelect(null);
        addSystemMessage(`Selected: ${selected.name}. Type your directive:`, 'cyan');
        // Store selected preset for next input
        selectedPresetRef.current = selected.id;
        return;
      }
      // If user typed text instead of number, treat as directive with selected/default preset
      const presetId = selectedPresetRef.current || 'default';
      setPendingPresetSelect(null);
      selectedPresetRef.current = null;
      try {
        const waveResult = await dispatchWave(trimmed || undefined, { preset: presetId });
        onWaveCreated(waveResult.waveId, trimmed);
      } catch (err) {
        addSystemMessage(`Wave failed: ${err instanceof Error ? err.message : 'unknown'}`, 'red');
      }
      return;
    }

    // If a preset was selected previously, this input is the directive
    if (selectedPresetRef.current) {
      const presetId = selectedPresetRef.current;
      selectedPresetRef.current = null;
      try {
        const waveResult = await dispatchWave(input.trim() || undefined, { preset: presetId });
        onWaveCreated(waveResult.waveId, input.trim());
      } catch (err) {
        addSystemMessage(`Wave failed: ${err instanceof Error ? err.message : 'unknown'}`, 'red');
      }
      return;
    }

    const result = await execute(input);

    switch (result.type) {
      case 'wave_started':
        break;
      case 'directive_sent':
        break;
      case 'focus_changed':
        addSystemMessage(`\u2192 ${result.message}`, 'cyan');
        break;
      case 'waves_list': {
        if (waves.length === 0) {
          addSystemMessage('No waves.', 'gray');
        } else {
          // Show recent 8 waves max to prevent scrollback overflow
          const MAX_SHOW = 8;
          const showWaves = waves.length > MAX_SHOW ? waves.slice(-MAX_SHOW) : waves;
          const skipped = waves.length - showWaves.length;
          if (skipped > 0) addSystemMessage(`(+${skipped} older waves)`, 'gray');
          addSystemMessage('Waves:', 'cyan');
          showWaves.forEach((w) => {
            const idx = waves.indexOf(w);
            const isFocused = w.waveId === focusedWaveId;
            const prefix = isFocused ? '*' : ' ';
            const label = w.directive ? w.directive.slice(0, 60) : '(idle)';
            addSystemMessage(`${prefix}${idx + 1}. Wave ${idx + 1} \u2014 ${label}`, isFocused ? 'green' : 'white');
          });
        }
        break;
      }
      case 'agents': {
        const lines = formatAgentsTree(waves, api.sessions, api.activeSessions, focusedWaveId);
        addSystemLines(lines);
        break;
      }
      case 'ports': {
        const lines = formatPortsList(api.activeSessions, api.portSummary);
        addSystemLines(lines);
        break;
      }
      case 'sessions': {
        if (api.activeSessions.length === 0) {
          addSystemMessage('No active sessions.', 'gray');
        } else {
          addSystemMessage(`Sessions (${api.activeSessions.length}):`, 'cyan');
          for (const s of api.activeSessions) {
            const alive = s.alive === false ? ' DEAD' : s.pid ? ` PID:${s.pid}` : '';
            // Find wave index
            let waveLabel = '';
            if (s.waveId) {
              const wi = waves.findIndex(w => w.waveId === s.waveId);
              waveLabel = wi >= 0 ? ` W${wi + 1}` : ` ${String(s.waveId).replace('wave-', 'W')}`;
            }
            const worktree = s.worktreePath ? ` \u{1F33F}${s.worktreePath.split('/').pop()}` : '';
            addSystemMessage(
              `  ${s.sessionId.slice(0, 22).padEnd(23)} ${s.roleId.padEnd(10)} :${s.ports.api}/:${s.ports.vite} ${s.status}${alive}${waveLabel}${worktree}`,
              s.alive === false ? 'red' : s.status === 'active' ? 'green' : 'gray'
            );
          }
          addSystemMessage('  /kill <sessionId> to stop  |  /cleanup to remove dead', 'gray');
        }
        break;
      }
      case 'cleanup': {
        addSystemMessage(result.message, 'yellow');
        api.refresh();
        break;
      }
      case 'docs': {
        // Extract written/edited files from SSE events in current wave
        const writtenFiles = new Set<string>();
        for (const event of sse.events) {
          if (event.type === 'tool:start') {
            const name = (event.data.name as string) ?? '';
            const input = event.data.input as Record<string, unknown> | undefined;
            if (['Write', 'Edit', 'NotebookEdit'].includes(name) && input?.file_path) {
              writtenFiles.add(String(input.file_path));
            }
          }
        }
        if (writtenFiles.size === 0) {
          addSystemMessage('No files created/modified in this wave.', 'gray');
        } else {
          addSystemMessage(`Files in this wave (${writtenFiles.size}):`, 'cyan');
          for (const f of writtenFiles) {
            const short = f.split('/').slice(-3).join('/');
            addSystemMessage(`  ${short}`, 'white');
          }
          addSystemMessage('  /read <path> to preview  |  /open <path> to edit', 'gray');
        }
        break;
      }
      case 'read_file': {
        const filePath = result.message;
        try {
          const content = await import('node:fs').then(fs =>
            fs.readFileSync(filePath, 'utf-8')
          );
          const lines = content.split('\n');
          const preview = lines.slice(0, 30);
          addSystemMessage(`\u2500\u2500 ${filePath.split('/').slice(-2).join('/')} \u2500\u2500`, 'cyan');
          for (const line of preview) {
            addSystemMessage(line, 'white');
          }
          if (lines.length > 30) {
            addSystemMessage(`  ... +${lines.length - 30} more lines (/open to see full)`, 'gray');
          }
          addSystemMessage('\u2500'.repeat(40), 'gray');
        } catch (err) {
          addSystemMessage(`Cannot read: ${err instanceof Error ? err.message : 'unknown'}`, 'red');
        }
        break;
      }
      case 'open_file': {
        const filePath = result.message;
        const editor = process.env.EDITOR || process.env.VISUAL || 'less';
        try {
          const { execSync } = await import('node:child_process');
          execSync(`${editor} "${filePath}"`, { stdio: 'inherit' });
          addSystemMessage(`Opened: ${filePath}`, 'green');
        } catch {
          // Fallback to /read
          addSystemMessage(`Cannot open with ${editor}. Use /read instead.`, 'yellow');
        }
        break;
      }
      case 'success':
        addSystemMessage(result.message, 'green');
        api.refresh();
        break;
      case 'error':
        addSystemMessage(result.message, 'red');
        break;
      case 'help':
        addSystemMessage('Type naturally to talk to your AI team.', 'cyan');
        addSystemMessage('Commands:', 'cyan');
        addSystemMessage('  /new [text]          Create new wave', 'white');
        addSystemMessage('  /waves               List all waves', 'white');
        addSystemMessage('  /focus <n>           Switch to wave n', 'white');
        addSystemMessage('  /stop                Stop current wave execution', 'white');
        addSystemMessage('  /docs                Files created in this wave', 'white');
        addSystemMessage('  /read <path>         Preview file content', 'white');
        addSystemMessage('  /open <path>         Open in $EDITOR', 'white');
        addSystemMessage('  /agents              Wave \u2192 Role \u2192 Session tree', 'white');
        addSystemMessage('  /sessions            Sessions + ports (kill/cleanup)', 'white');
        addSystemMessage('  /kill <id>           Kill a session', 'white');
        addSystemMessage('  /cleanup             Remove dead sessions', 'white');
        addSystemMessage('  /preset list         Installed presets', 'white');
        addSystemMessage('  /help                This help', 'white');
        addSystemMessage('  /quit                Exit', 'white');
        addSystemMessage('Keys: [Tab] team panel  [1-9] wave  [Esc] back  [Ctrl+C] quit', 'gray');
        break;
      case 'info':
        if (result.message === '__status__') {
          const wLabel = focusedWaveId
            ? `Wave ${focusedWaveIndex}: ${derivedWaveStatus}`
            : 'No active wave';
          addSystemMessage(wLabel, derivedWaveStatus === 'running' ? 'green' : 'gray');
          addSystemMessage(`Sessions: ${api.sessions.length}  Active: ${activeCount}  Waves: ${waves.length}  Ports: ${api.portSummary.totalPorts}`, 'white');
        }
        break;
      case 'preset_list': {
        const presets = result.presets ?? [];
        if (presets.length === 0) {
          addSystemMessage('No presets installed.', 'gray');
        } else {
          addSystemMessage('Installed presets:', 'cyan');
          for (const p of presets) {
            const star = p.isDefault ? ' \u2605' : '';
            const desc = p.description ? ` \u2014 ${p.description}` : '';
            addSystemMessage(`  ${p.id} (${p.rolesCount} roles)${desc}${star}`, p.isDefault ? 'green' : 'white');
          }
        }
        break;
      }
      case 'preset_select': {
        const presets = result.presets ?? [];
        if (presets.length === 0) {
          addSystemMessage('No presets. Creating wave with default team.', 'gray');
          try {
            const waveResult = await dispatchWave();
            onWaveCreated(waveResult.waveId, '');
          } catch { /* ignore */ }
        } else if (presets.length === 1) {
          // Only default → show prompt to enter directive
          addSystemMessage('Only default preset available. Type your directive:', 'gray');
        } else {
          // Multiple presets → show selection
          addSystemMessage('Select a team preset for this wave:', 'cyan');
          for (let i = 0; i < presets.length; i++) {
            const p = presets[i];
            const star = p.isDefault ? ' \u2605' : '';
            const desc = p.description ? ` \u2014 ${p.description}` : '';
            addSystemMessage(`  ${i + 1}. ${p.name} (${p.rolesCount} roles)${desc}${star}`, p.isDefault ? 'green' : 'white');
          }
          addSystemMessage('Type a number to select, then enter your directive.', 'gray');
          // Store presets for number selection — handled via pendingPresetSelect
          setPendingPresetSelect(presets);
        }
        break;
      }
      case 'panel':
        break;
      case 'quit':
        break;
      default:
        if (result.message) {
          addSystemMessage(result.message, 'green');
        }
    }
  }, [execute, addSystemMessage, addSystemLines, focusedWaveId, focusedWaveIndex, derivedWaveStatus, api.sessions.length, activeCount, waves, api.activeSessions, api.portSummary, pendingPresetSelect, onWaveCreated]);

  // Global key handler: Tab to toggle mode, Ctrl+C always exits
  useInput((input, key) => {
    if (key.ctrl && input === 'c') {
      exit();
      return;
    }
    if (mode === 'command' && key.tab) {
      setMode('panel');
    }
  });

  // Loading state
  if (view === 'loading') {
    return (
      <Box flexDirection="column" paddingX={1}>
        <Text color="cyan" bold>TYCONO TUI</Text>
        <Text color="gray">Connecting to API server...</Text>
      </Box>
    );
  }

  // Setup wizard
  if (view === 'setup') {
    return (
      <Box flexDirection="column" paddingX={1}>
        <SetupWizard onComplete={handleSetupComplete} />
      </Box>
    );
  }

  // Error display
  if (api.error) {
    return (
      <Box flexDirection="column" paddingX={1}>
        <Text color="cyan" bold>TYCONO TUI</Text>
        <Text color="red">API Error: {api.error}</Text>
        <Text color="gray">Make sure the API server is running on the configured port.</Text>
        <Text color="gray" dimColor>Press Ctrl+C to quit</Text>
      </Box>
    );
  }

  // Command Mode: scrollable terminal (no fullscreen)
  // Panel Mode: fullscreen (intentional — like vim for inspection)
  if (mode === 'panel') {
    // OOM debug levels: 0=full, 1=minimal, 2=orgTree only, 3=stream only
    const debugLevel = parseInt(process.env.PANEL_MINIMAL || '0', 10);
    if (debugLevel === 1) {
      return (
        <Box flexDirection="column">
          <Text color="cyan">Panel Mode (minimal)</Text>
          <Text color="gray">Events: {sse.events.length} | Press Esc</Text>
        </Box>
      );
    }
    if (debugLevel === 2) {
      return (
        <Box flexDirection="column">
          <OrgTree tree={orgTree} focused={true} selectedIndex={0} flatRoles={flatRoleIds} ceoStatus="idle" />
          <Text color="gray">OrgTree only | Press Esc</Text>
        </Box>
      );
    }
    if (debugLevel === 3) {
      return (
        <Box flexDirection="column">
          <StreamView events={sse.events} allRoleIds={flatRoleIds} streamStatus={sse.streamStatus} waveId={focusedWaveId} roleLabel="All" />
          <Text color="gray">StreamView only | Press Esc</Text>
        </Box>
      );
    }
    if (debugLevel === 4) {
      // Full layout structure but empty content
      return (
        <Box flexDirection="column" height={termHeight}>
          <Box flexGrow={1}>
            <Box flexDirection="column" width={28}>
              <Text color="green">Left Panel</Text>
            </Box>
            <Text color="gray">{'\u2502'}</Text>
            <Box flexGrow={1} flexDirection="column" overflow="hidden">
              <Text color="cyan">Right Panel</Text>
            </Box>
          </Box>
          <StatusBar companyName="test" waveIndex={1} waveCount={1} waveStatus="idle" activeCount={0} portCount={0} totalCost={0} />
        </Box>
      );
    }
    return (
      <Box flexDirection="column">
        <Box flexDirection="column">
          <PanelMode
            tree={orgTree}
            flatRoles={flatRoleIds}
            events={sse.events}
            selectedRoleIndex={selectedRoleIndex}
            selectedRoleId={selectedRoleId}
            streamStatus={sse.streamStatus}
            waveId={focusedWaveId}
            activeSessions={api.activeSessions}
            allSessions={api.sessions}
            companyRoot={process.env.COMPANY_ROOT || process.cwd()}
            waves={waves}
            focusedWaveId={focusedWaveId}
            onMove={(dir) => {
              const nextIdx = dir === 'up'
                ? Math.max(0, selectedRoleIndex - 1)
                : Math.min(flatRoleIds.length - 1, selectedRoleIndex + 1);
              setSelectedRoleIndex(nextIdx);
              setSelectedRoleId(flatRoleIds[nextIdx] ?? null);
            }}
            onSelect={() => {
              const roleId = flatRoleIds[selectedRoleIndex] ?? null;
              setSelectedRoleId(roleId === selectedRoleId ? null : roleId);
            }}
            onEscape={() => setMode('command')}
            onFocusWave={(newWaveId) => {
              setFocusedWaveId(newWaveId);
              sse.clearEvents();
              setSystemMessages([]);
            }}
          />
        </Box>
        <StatusBar
          companyName={api.company?.name ?? 'Loading...'}
          waveIndex={focusedWaveIndex}
          waveCount={waves.length}
          waveStatus={derivedWaveStatus}
          activeCount={activeCount}
          portCount={api.portSummary.totalPorts}
          totalCost={0}
        />
      </Box>
    );
  }

  // Command Mode: natural terminal flow (scrollable with mouse wheel)
  return (
    <Box flexDirection="column">
      <CommandMode
        events={sse.events}
        allRoleIds={flatRoleIds}
        systemMessages={systemMessages}
        onSubmit={handleCommandSubmit}
        onQuickAction={(action) => {
          handleCommandSubmit(`/${action}`);
        }}
        activeSessions={api.activeSessions}
        focusedWaveId={focusedWaveId}
      />
      <StatusBar
        companyName={api.company?.name ?? 'Loading...'}
        waveIndex={focusedWaveIndex}
        waveCount={waves.length}
        waveStatus={derivedWaveStatus}
        activeCount={activeCount}
        portCount={api.portSummary.totalPorts}
        totalCost={0}
        activeSessions={api.activeSessions}
        focusedWaveId={focusedWaveId}
        waveStartedAt={focusedWaveStartedAt}
      />
    </Box>
  );
};
