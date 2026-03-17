/**
 * TUI App — main layout with 4 panels
 *
 * Layout:
 * ┌─────────────────────────────────────────┐
 * │ StatusBar                               │
 * ├──────────────┬──────────────────────────┤
 * │ OrgTree      │ StreamPanel              │
 * │              │                          │
 * ├──────────────┤                          │
 * │ SessionList  │                          │
 * ├──────────────┴──────────────────────────┤
 * │ CommandInput                            │
 * └─────────────────────────────────────────┘
 */

import React, { useState, useCallback, useMemo } from 'react';
import { Box, Text, useApp } from 'ink';
import { StatusBar } from './components/StatusBar.js';
import { OrgTree } from './components/OrgTree.js';
import { SessionList } from './components/SessionList.js';
import { StreamPanel } from './components/StreamPanel.js';
import { CommandInput } from './components/CommandInput.js';
import { WaveDialog } from './components/WaveDialog.js';
import { HelpOverlay } from './components/HelpOverlay.js';
import { useApi } from './hooks/useApi.js';
import { useSSE } from './hooks/useSSE.js';
import { useKeyboard } from './hooks/useKeyboard.js';
import { buildOrgTree } from './store.js';
import { dispatchWave } from './api.js';

type Panel = 'org' | 'sessions' | 'stream' | 'command';
type Dialog = 'none' | 'wave' | 'help';

const PANELS: Panel[] = ['org', 'sessions', 'stream', 'command'];

export const App: React.FC = () => {
  const { exit } = useApp();
  const api = useApi();

  const [activePanel, setActivePanel] = useState<Panel>('org');
  const [dialog, setDialog] = useState<Dialog>('none');
  const [selectedRoleIndex, setSelectedRoleIndex] = useState(0);
  const [selectedSessionIndex, setSelectedSessionIndex] = useState(0);
  const [waveId, setWaveId] = useState<string | null>(null);
  const [waveStatus, setWaveStatus] = useState<'idle' | 'running' | 'done'>('idle');

  // Derive active wave from API if we don't have one
  const effectiveWaveId = waveId ?? api.activeWaveId;

  const sse = useSSE(effectiveWaveId);

  // Build org tree
  const roles = api.company?.roles ?? [];
  const flatRoleIds = useMemo(() => roles.map(r => r.id), [roles]);
  const statuses = api.execStatus?.statuses ?? {};
  const orgTree = useMemo(() => buildOrgTree(roles, statuses), [roles, statuses]);

  // Count active
  const activeCount = Object.values(statuses).filter(s => s === 'working' || s === 'streaming').length;

  // Determine wave status from SSE
  const derivedWaveStatus = useMemo(() => {
    if (sse.streamStatus === 'streaming') return 'running' as const;
    if (sse.streamStatus === 'done') return 'done' as const;
    if (waveStatus === 'running' && activeCount > 0) return 'running' as const;
    return waveStatus;
  }, [sse.streamStatus, waveStatus, activeCount]);

  // Handle wave dispatch
  const handleWaveSubmit = useCallback(async (directive: string) => {
    setDialog('none');
    try {
      const result = await dispatchWave(directive);
      setWaveId(result.waveId);
      setWaveStatus('running');
      sse.clearEvents();
      api.refresh();
    } catch (err) {
      // Show error briefly
      console.error('Wave dispatch failed:', err);
    }
  }, [sse, api]);

  // Keyboard actions — disabled when dialog is open
  const keyboardEnabled = dialog === 'none';

  useKeyboard({
    onWave: () => setDialog('wave'),
    onQuit: () => exit(),
    onHelp: () => setDialog(dialog === 'help' ? 'none' : 'help'),
    onTab: () => {
      const idx = PANELS.indexOf(activePanel);
      setActivePanel(PANELS[(idx + 1) % PANELS.length]);
    },
    onUp: () => {
      if (activePanel === 'org') {
        setSelectedRoleIndex(Math.max(0, selectedRoleIndex - 1));
      } else if (activePanel === 'sessions') {
        setSelectedSessionIndex(Math.max(0, selectedSessionIndex - 1));
      }
    },
    onDown: () => {
      if (activePanel === 'org') {
        setSelectedRoleIndex(Math.min(flatRoleIds.length - 1, selectedRoleIndex + 1));
      } else if (activePanel === 'sessions') {
        setSelectedSessionIndex(Math.min(Math.max(0, api.sessions.length - 1), selectedSessionIndex + 1));
      }
    },
    onEnter: () => {
      // Future: select role/session to show in stream
    },
    onEscape: () => {
      if (dialog !== 'none') {
        setDialog('none');
      }
    },
  }, keyboardEnabled);

  // Error display
  if (api.error) {
    return (
      <Box flexDirection="column" paddingX={1}>
        <Text color="cyan" bold>TYCONO TUI</Text>
        <Text color="red">API Error: {api.error}</Text>
        <Text color="gray">Make sure the API server is running on the configured port.</Text>
        <Text color="gray" dimColor>Press q to quit</Text>
      </Box>
    );
  }

  // Help overlay
  if (dialog === 'help') {
    return (
      <Box flexDirection="column">
        <StatusBar
          companyName={api.company?.name ?? 'Loading...'}
          waveId={effectiveWaveId}
          waveStatus={derivedWaveStatus}
          activeCount={activeCount}
          totalCost={0}
        />
        <HelpOverlay onClose={() => setDialog('none')} />
      </Box>
    );
  }

  // Wave dialog
  if (dialog === 'wave') {
    return (
      <Box flexDirection="column">
        <StatusBar
          companyName={api.company?.name ?? 'Loading...'}
          waveId={effectiveWaveId}
          waveStatus={derivedWaveStatus}
          activeCount={activeCount}
          totalCost={0}
        />
        <WaveDialog
          onSubmit={handleWaveSubmit}
          onCancel={() => setDialog('none')}
        />
      </Box>
    );
  }

  return (
    <Box flexDirection="column">
      {/* Status Bar */}
      <StatusBar
        companyName={api.company?.name ?? 'Loading...'}
        waveId={effectiveWaveId}
        waveStatus={derivedWaveStatus}
        activeCount={activeCount}
        totalCost={0}
      />

      {/* Separator */}
      <Box width="100%">
        <Text color="gray">{'\u2500'.repeat(70)}</Text>
      </Box>

      {/* Main content: left (org + sessions) | right (stream) */}
      <Box flexGrow={1}>
        {/* Left column */}
        <Box flexDirection="column" width={28}>
          <OrgTree
            tree={orgTree}
            focused={activePanel === 'org'}
            selectedIndex={selectedRoleIndex}
            flatRoles={flatRoleIds}
          />
          <Box marginTop={1}>
            <SessionList
              sessions={api.sessions}
              focused={activePanel === 'sessions'}
              selectedIndex={selectedSessionIndex}
            />
          </Box>
        </Box>

        {/* Vertical separator */}
        <Box flexDirection="column" marginX={0}>
          <Text color="gray">{'\u2502\n'.repeat(15)}</Text>
        </Box>

        {/* Right column: Stream */}
        <StreamPanel
          events={sse.events}
          allRoleIds={flatRoleIds}
          focused={activePanel === 'stream'}
          streamStatus={sse.streamStatus}
          waveId={effectiveWaveId}
        />
      </Box>

      {/* Separator */}
      <Box width="100%">
        <Text color="gray">{'\u2500'.repeat(70)}</Text>
      </Box>

      {/* Command Input */}
      <CommandInput
        focused={activePanel === 'command'}
        waveStatus={derivedWaveStatus}
        dialog={dialog}
      />
    </Box>
  );
};
