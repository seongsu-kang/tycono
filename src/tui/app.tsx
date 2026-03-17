/**
 * TUI App v2 — Hybrid Mode (Command + Panel)
 *
 * Two modes:
 *   Command Mode (default) — stream summary + command input (> prompt)
 *   Panel Mode (Tab)       — Org Tree left + Role stream right
 *
 * Tab toggles between modes, Esc returns to Command Mode.
 */

import React, { useState, useCallback, useMemo, useEffect } from 'react';
import { Box, Text, useApp, useInput } from 'ink';
import { StatusBar } from './components/StatusBar';
import { CommandMode, type StreamLine } from './components/CommandMode';
import { PanelMode } from './components/PanelMode';
import { SetupWizard } from './components/SetupWizard';
import { useApi } from './hooks/useApi';
import { useSSE } from './hooks/useSSE';
import { useCommand } from './hooks/useCommand';
import { buildOrgTree } from './store';

type Mode = 'command' | 'panel';
type View = 'loading' | 'setup' | 'dashboard';

let sysLineId = 100000;

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

  // Wave state
  const [waveId, setWaveId] = useState<string | null>(null);
  const [waveStatus, setWaveStatus] = useState<'idle' | 'running' | 'done'>('idle');

  // Panel mode state
  const [selectedRoleIndex, setSelectedRoleIndex] = useState(0);
  const [selectedRoleId, setSelectedRoleId] = useState<string | null>(null);

  // System messages (command feedback displayed in stream area)
  const [systemMessages, setSystemMessages] = useState<StreamLine[]>([]);

  // Terminal full height with resize tracking
  const [termHeight, setTermHeight] = useState(process.stdout.rows || 30);

  useEffect(() => {
    const onResize = () => {
      setTermHeight(process.stdout.rows || 30);
    };
    process.stdout.on('resize', onResize);
    return () => {
      process.stdout.off('resize', onResize);
    };
  }, []);

  const addSystemMessage = useCallback((text: string, color: string = 'yellow') => {
    setSystemMessages(prev => {
      const next = [...prev, { id: ++sysLineId, text, color }];
      return next.length > 50 ? next.slice(-50) : next;
    });
  }, []);

  // Auto-sync: when waveId is null (e.g. --attach), pick up api.activeWaveId
  useEffect(() => {
    if (waveId === null && api.activeWaveId) {
      setWaveId(api.activeWaveId);
    }
  }, [waveId, api.activeWaveId]);

  // Derive effective wave ID (from manual set or API polling)
  const effectiveWaveId = waveId ?? api.activeWaveId;

  // SSE subscription
  const sse = useSSE(effectiveWaveId);

  // Build org tree
  const roles = api.company?.roles ?? [];
  const flatRoleIds = useMemo(() => roles.map(r => r.id), [roles]);
  const statuses = api.execStatus?.statuses ?? {};
  const orgTree = useMemo(() => buildOrgTree(roles, statuses), [roles, statuses]);

  // Active count
  const activeCount = Object.values(statuses).filter(
    s => s === 'working' || s === 'streaming'
  ).length;

  // Derived wave status
  const derivedWaveStatus = useMemo(() => {
    if (sse.streamStatus === 'streaming') return 'running' as const;
    if (sse.streamStatus === 'done') return 'done' as const;
    if (waveStatus === 'running' && activeCount > 0) return 'running' as const;
    return waveStatus;
  }, [sse.streamStatus, waveStatus, activeCount]);

  // Command handler
  const { execute } = useCommand({
    activeWaveId: effectiveWaveId,
    onWaveStarted: (newWaveId) => {
      setWaveId(newWaveId);
      setWaveStatus('running');
      sse.clearEvents();
      api.refresh();
    },
    onStopped: () => {
      setWaveStatus('idle');
      api.refresh();
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
        addSystemMessage(`\u26A1 ${result.message}`, 'yellow');
        break;
      case 'directive_sent':
        addSystemMessage(`\u26A1 ${result.message}`, 'yellow');
        break;
      case 'stopped':
        addSystemMessage(`\u26A1 ${result.message}`, 'red');
        break;
      case 'error':
        addSystemMessage(result.message, 'red');
        break;
      case 'help':
        addSystemMessage('Commands:', 'cyan');
        addSystemMessage('  wave <directive> [--continuous]  Start a wave', 'white');
        addSystemMessage('  directive <text>                 Send directive to active wave', 'white');
        addSystemMessage('  stop                             Stop all active executions', 'white');
        addSystemMessage('  status                           Show current status', 'white');
        addSystemMessage('  assign <role> <task>             Assign task to role', 'white');
        addSystemMessage('  summary                          Show last wave summary', 'white');
        addSystemMessage('  roles                            Show org tree (Panel Mode)', 'white');
        addSystemMessage('  help                             Show this help', 'white');
        addSystemMessage('  quit                             Exit TUI', 'white');
        addSystemMessage('Keys: [Tab] panel  [Esc] back  [Ctrl+C] stop/quit', 'gray');
        break;
      case 'info':
        if (result.message === '__status__') {
          const wLabel = effectiveWaveId
            ? `Wave ${effectiveWaveId.replace('wave-', '#')}: ${derivedWaveStatus}`
            : 'No active wave';
          addSystemMessage(wLabel, derivedWaveStatus === 'running' ? 'green' : 'gray');
          addSystemMessage(`Sessions: ${api.sessions.length}  Active: ${activeCount}`, 'white');
        } else if (result.message === '__summary__') {
          addSystemMessage('Summary: not yet implemented', 'gray');
        }
        break;
      case 'panel':
        // mode already switched
        break;
      case 'quit':
        // exit already called
        break;
      default:
        if (result.message) {
          addSystemMessage(result.message, 'green');
        }
    }
  }, [execute, addSystemMessage, effectiveWaveId, derivedWaveStatus, api.sessions.length, activeCount]);

  // Global key handler: Tab to toggle mode, Ctrl+C handling
  useInput((input, key) => {
    if (mode === 'command' && key.tab) {
      setMode('panel');
      return;
    }
    // Ctrl+C in command mode: stop wave or exit
    if (key.ctrl && input === 'c') {
      if (derivedWaveStatus === 'running') {
        execute('stop');
      } else {
        exit();
      }
    }
  }, { isActive: mode === 'command' });

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

  return (
    <Box flexDirection="column" height={termHeight}>
      {/* Status Bar — always shown */}
      <StatusBar
        companyName={api.company?.name ?? 'Loading...'}
        waveId={effectiveWaveId}
        waveStatus={derivedWaveStatus}
        activeCount={activeCount}
        totalCost={0}
      />

      {/* Separator */}
      <Box width="100%">
        <Text color="gray">{'─'.repeat(process.stdout.columns || 70)}</Text>
      </Box>

      {/* Mode content — fill remaining height */}
      <Box flexGrow={1} flexDirection="column">
      {mode === 'command' ? (
        <CommandMode
          events={sse.events}
          allRoleIds={flatRoleIds}
          systemMessages={systemMessages}
          onSubmit={handleCommandSubmit}
        />
      ) : (
        <PanelMode
          tree={orgTree}
          flatRoles={flatRoleIds}
          events={sse.events}
          selectedRoleIndex={selectedRoleIndex}
          selectedRoleId={selectedRoleId}
          streamStatus={sse.streamStatus}
          waveId={effectiveWaveId}
          onMove={(dir) => {
            if (dir === 'up') {
              setSelectedRoleIndex(Math.max(0, selectedRoleIndex - 1));
            } else {
              setSelectedRoleIndex(Math.min(flatRoleIds.length - 1, selectedRoleIndex + 1));
            }
          }}
          onSelect={() => {
            const roleId = flatRoleIds[selectedRoleIndex] ?? null;
            setSelectedRoleId(roleId === selectedRoleId ? null : roleId);
          }}
          onEscape={() => setMode('command')}
        />
      )}
      </Box>
    </Box>
  );
};
