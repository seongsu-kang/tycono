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
import { CommandMode, type StreamLine } from './components/CommandMode';
import { PanelMode } from './components/PanelMode';
import { SetupWizard } from './components/SetupWizard';
import { useApi } from './hooks/useApi';
import { useSSE } from './hooks/useSSE';
import { useCommand, type WaveInfo } from './hooks/useCommand';
import { dispatchWave } from './api';
import type { ActiveSessionInfo } from './api';
import { buildOrgTree, flattenOrgRoleIds } from './store';

type Mode = 'command' | 'panel';
type View = 'loading' | 'setup' | 'dashboard';

let sysLineId = 100000;

/** Format agent tree for /agents command */
function formatAgentsTree(
  waves: WaveInfo[],
  activeSessions: ActiveSessionInfo[],
  focusedWaveId: string | null,
): StreamLine[] {
  const lines: StreamLine[] = [];

  if (waves.length === 0 && activeSessions.length === 0) {
    lines.push({ id: ++sysLineId, text: 'No active agents.', color: 'gray' });
    return lines;
  }

  // Group sessions by waveId
  const sessionsByWave = new Map<string, ActiveSessionInfo[]>();
  const unlinked: ActiveSessionInfo[] = [];
  for (const s of activeSessions) {
    if (s.waveId) {
      if (!sessionsByWave.has(s.waveId)) sessionsByWave.set(s.waveId, []);
      sessionsByWave.get(s.waveId)!.push(s);
    } else {
      unlinked.push(s);
    }
  }

  // Display each wave
  for (let i = 0; i < waves.length; i++) {
    const w = waves[i];
    const isFocused = w.waveId === focusedWaveId;
    const marker = isFocused ? '*' : ' ';
    const label = w.directive ? w.directive.slice(0, 50) : '(idle)';
    lines.push({
      id: ++sysLineId,
      text: `${marker}Wave ${i + 1}: "${label}"`,
      color: isFocused ? 'green' : 'cyan',
    });

    const waveSessions = sessionsByWave.get(w.waveId) ?? [];
    if (waveSessions.length === 0) {
      lines.push({ id: ++sysLineId, text: '  (no agents)', color: 'gray' });
    }
    for (const s of waveSessions) {
      const statusIcon = s.status === 'active' ? '\u25CF' : s.status === 'dead' ? '\u25CF' : '\u25CB';
      const statusColor = s.status === 'active' ? 'green' : s.status === 'dead' ? 'red' : 'gray';
      const portInfo = s.ports.api ? `API:${s.ports.api} Vite:${s.ports.vite}` : '(no ports)';
      const worktree = s.worktreePath ? `\u{1F33F} ${s.worktreePath.split('/').pop()}` : '';
      lines.push({
        id: ++sysLineId,
        text: `  ${statusIcon} ${s.roleId.padEnd(14)} ${portInfo}${worktree ? ' ' + worktree : ''}`,
        color: statusColor,
      });
      if (s.task) {
        lines.push({
          id: ++sysLineId,
          text: `    ${s.task.slice(0, 60)}`,
          color: 'gray',
        });
      }
    }
  }

  // Unlinked sessions (not associated with any wave)
  if (unlinked.length > 0) {
    lines.push({ id: ++sysLineId, text: '', color: 'white' });
    lines.push({ id: ++sysLineId, text: 'Unlinked sessions:', color: 'yellow' });
    for (const s of unlinked) {
      const portInfo = s.ports.api ? `API:${s.ports.api} Vite:${s.ports.vite}` : '(no ports)';
      lines.push({
        id: ++sysLineId,
        text: `  ${s.roleId.padEnd(14)} ${portInfo}  ${s.task?.slice(0, 40) ?? ''}`,
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

  React.useEffect(() => {
    if (!api.loaded) return;
    if (view === 'loading') {
      setView(api.company ? 'dashboard' : 'setup');
    }
  }, [api.loaded, api.company, view]);

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

    if (api.activeWaves.length > 0) {
      // Attach to existing waves from API
      const apiWaves: WaveInfo[] = api.activeWaves.map(w => ({
        waveId: w.waveId,
        directive: w.directive ?? '',
        startedAt: w.startedAt ?? Date.now(),
      }));
      setWaves(apiWaves);
      setFocusedWaveId(apiWaves[apiWaves.length - 1].waveId);
      autoWaveCreated.current = true;
    } else if (api.loaded) {
      // Create a new empty wave
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
        // If empty wave creation fails, still proceed — user can /new
        autoWaveCreated.current = true;
      });
    }
  }, [view, api.activeWaves, api.loaded]);

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

  // Focused wave index (1-based)
  const focusedWaveIndex = useMemo(() => {
    if (!focusedWaveId) return 0;
    return waves.findIndex(w => w.waveId === focusedWaveId) + 1;
  }, [focusedWaveId, waves]);

  // Command handler
  const { execute } = useCommand({
    focusedWaveId,
    waves,
    onWaveCreated: (newWaveId, directive) => {
      const newWave: WaveInfo = {
        waveId: newWaveId,
        directive,
        startedAt: Date.now(),
      };
      setWaves(prev => [...prev, newWave]);
      setFocusedWaveId(newWaveId);
      sse.clearEvents();
      api.refresh();
    },
    onFocusWave: (waveId) => {
      setFocusedWaveId(waveId);
      sse.clearEvents();
    },
    onQuit: () => exit(),
    onShowPanel: () => setMode('panel'),
  });

  // Handle command submission from CommandMode
  const handleCommandSubmit = useCallback(async (input: string) => {
    addSystemMessage(`> ${input}`, 'white');

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
          addSystemMessage('Waves:', 'cyan');
          waves.forEach((w, i) => {
            const isFocused = w.waveId === focusedWaveId;
            const prefix = isFocused ? '*' : ' ';
            const label = w.directive ? w.directive.slice(0, 60) : '(idle)';
            addSystemMessage(`${prefix}${i + 1}. Wave ${i + 1} \u2014 ${label}`, isFocused ? 'green' : 'white');
          });
        }
        break;
      }
      case 'agents': {
        const lines = formatAgentsTree(waves, api.activeSessions, focusedWaveId);
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
            const wave = s.waveId ? ` wave=${String(s.waveId).replace('wave-', 'W')}` : '';
            addSystemMessage(
              `  ${s.sessionId.slice(0, 25).padEnd(26)} ${s.roleId.padEnd(12)} API:${s.ports.api} ${s.status}${alive}${wave}`,
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
      case 'error':
        addSystemMessage(result.message, 'red');
        break;
      case 'help':
        addSystemMessage('Type naturally to talk to your AI team.', 'cyan');
        addSystemMessage('Commands:', 'cyan');
        addSystemMessage('  /new [text]          Create new wave', 'white');
        addSystemMessage('  /waves               List all waves', 'white');
        addSystemMessage('  /focus <n>           Switch to wave n', 'white');
        addSystemMessage('  /agents              Agent tree + resources', 'white');
        addSystemMessage('  /ports               Port allocations', 'white');
        addSystemMessage('  /sessions            All sessions (kill/cleanup)', 'white');
        addSystemMessage('  /kill <id>           Kill a session', 'white');
        addSystemMessage('  /cleanup             Remove dead sessions', 'white');
        addSystemMessage('  /status              Show current status', 'white');
        addSystemMessage('  /assign <role> <task> Assign task to role', 'white');
        addSystemMessage('  /roles               Org tree (Panel Mode)', 'white');
        addSystemMessage('  /help                Show this help', 'white');
        addSystemMessage('  /quit                Exit TUI', 'white');
        addSystemMessage('Keys: [Tab] panel  [Esc] back  [Ctrl+C] quit', 'gray');
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
      case 'panel':
        break;
      case 'quit':
        break;
      default:
        if (result.message) {
          addSystemMessage(result.message, 'green');
        }
    }
  }, [execute, addSystemMessage, addSystemLines, focusedWaveId, focusedWaveIndex, derivedWaveStatus, api.sessions.length, activeCount, waves, api.activeSessions, api.portSummary]);

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
    return (
      <Box flexDirection="column" height={termHeight}>
        <Box flexGrow={1} flexDirection="column">
          <PanelMode
            tree={orgTree}
            flatRoles={flatRoleIds}
            events={sse.events}
            selectedRoleIndex={selectedRoleIndex}
            selectedRoleId={selectedRoleId}
            streamStatus={sse.streamStatus}
            waveId={focusedWaveId}
            activeSessions={api.activeSessions}
            waves={waves}
            focusedWaveId={focusedWaveId}
            portSummary={api.portSummary}
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
      />
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
};
