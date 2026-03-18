/**
 * PanelMode — Tab view: Org Tree (left) + Agent Detail + Stream (right)
 *
 * Left:  Org Tree with status icons
 *        + compact resource summary (waves, ports)
 * Right: Selected role's resource info (port, worktree, browser)
 *        + event stream
 *
 * Navigation:
 *   j/k or arrow keys — move in Org Tree
 *   Enter             — select role to view its stream
 *   Esc               — return to Command Mode
 */

import React, { useState, useEffect, useMemo } from 'react';
import { Box, Text, useInput } from 'ink';
import { OrgTree } from './OrgTree';
import { StreamView } from './StreamView';
import type { OrgNode } from '../store';
import type { SSEEvent, ActiveSessionInfo } from '../api';
import type { WaveInfo } from '../hooks/useCommand';

interface PanelModeProps {
  tree: OrgNode[];
  flatRoles: string[];
  events: SSEEvent[];
  selectedRoleIndex: number;
  selectedRoleId: string | null;
  streamStatus: 'idle' | 'streaming' | 'done' | 'error';
  waveId: string | null;
  activeSessions: ActiveSessionInfo[];
  waves: WaveInfo[];
  focusedWaveId: string | null;
  portSummary: { active: number; totalPorts: number };
  onMove: (direction: 'up' | 'down') => void;
  onSelect: () => void;
  onEscape: () => void;
}

/** Find active session for a given roleId */
function findSessionForRole(activeSessions: ActiveSessionInfo[], roleId: string): ActiveSessionInfo | null {
  // Prefer active sessions, then any
  return activeSessions.find(s => s.roleId === roleId && s.status === 'active')
    ?? activeSessions.find(s => s.roleId === roleId)
    ?? null;
}

/** Format elapsed time */
function elapsed(startedAt: string): string {
  const ms = Date.now() - new Date(startedAt).getTime();
  if (ms < 60_000) return `${Math.floor(ms / 1000)}s`;
  if (ms < 3600_000) return `${Math.floor(ms / 60_000)}m`;
  return `${Math.floor(ms / 3600_000)}h`;
}

export const PanelMode: React.FC<PanelModeProps> = ({
  tree,
  flatRoles,
  events,
  selectedRoleIndex,
  selectedRoleId,
  streamStatus,
  waveId,
  activeSessions,
  waves,
  focusedWaveId,
  portSummary,
  onMove,
  onSelect,
  onEscape,
}) => {
  // Track terminal height for vertical separator
  const [termHeight, setTermHeight] = useState(process.stdout.rows || 30);
  useEffect(() => {
    const onResize = () => setTermHeight(process.stdout.rows || 30);
    process.stdout.on('resize', onResize);
    return () => { process.stdout.off('resize', onResize); };
  }, []);

  // Memoize expensive strings
  const separatorStr = useMemo(() => '\u2502\n'.repeat(Math.max(5, termHeight - 6)), [termHeight]);

  useInput((input, key) => {
    if (key.escape) {
      onEscape();
      return;
    }
    if (key.upArrow || input === 'k') {
      onMove('up');
      return;
    }
    if (key.downArrow || input === 'j') {
      onMove('down');
      return;
    }
    if (key.return) {
      onSelect();
      return;
    }
  });

  // Filter events for selected role
  const roleEvents = selectedRoleId
    ? events.filter((e) => e.roleId === selectedRoleId)
    : events;

  const roleLabel = selectedRoleId
    ? flatRoles.includes(selectedRoleId) ? selectedRoleId : 'All'
    : 'All';

  // Find resource info for selected role
  const selectedSession = selectedRoleId
    ? findSessionForRole(activeSessions, selectedRoleId)
    : null;

  // Focused wave info
  const focusedWave = waves.find(w => w.waveId === focusedWaveId);
  const focusedWaveIndex = focusedWaveId
    ? waves.findIndex(w => w.waveId === focusedWaveId) + 1
    : 0;

  return (
    <Box flexDirection="column" flexGrow={1}>
      {/* Main content: Org Tree left | Detail + Stream right */}
      <Box flexGrow={1}>
        {/* Left: Org Tree + Resource Summary */}
        <Box flexDirection="column" width={28}>
          <OrgTree
            tree={tree}
            focused={true}
            selectedIndex={selectedRoleIndex}
            flatRoles={flatRoles}
            ceoStatus={activeSessions.some(s => s.roleId === 'ceo' && s.status === 'active') ? 'working' : 'idle'}
          />
        </Box>

        {/* Vertical separator — memoized to avoid regenerating on every render */}
        <Box flexDirection="column" marginX={0}>
          <Text color="gray">{separatorStr}</Text>
        </Box>

        {/* Right: Agent Detail + Stream */}
        <Box flexGrow={1} flexDirection="column" overflow="hidden">
          {/* Agent Resource Header — shown when a role is selected */}
          {selectedRoleId && selectedSession && (
            <Box flexDirection="column" paddingX={1} marginBottom={0}>
              <Box justifyContent="space-between">
                <Text bold color="cyan">{selectedRoleId}</Text>
                <Text color={selectedSession.status === 'active' ? 'green' : 'gray'}>
                  {selectedSession.status === 'active' ? '\u25CF' : '\u25CB'} {selectedSession.status}
                  {selectedSession.startedAt ? ` (${elapsed(selectedSession.startedAt)})` : ''}
                </Text>
              </Box>

              {/* Ports */}
              <Box>
                <Text color="gray">Port  </Text>
                <Text color="white">
                  API:{selectedSession.ports.api} Vite:{selectedSession.ports.vite}
                  {selectedSession.ports.hmr ? ` HMR:${selectedSession.ports.hmr}` : ''}
                </Text>
              </Box>

              {/* Worktree */}
              {selectedSession.worktreePath && (
                <Box>
                  <Text color="gray">Tree  </Text>
                  <Text color="white">{selectedSession.worktreePath}</Text>
                </Box>
              )}

              {/* Wave association */}
              {selectedSession.waveId && (
                <Box>
                  <Text color="gray">Wave  </Text>
                  <Text color="white">
                    {(() => {
                      const wi = waves.findIndex(w => w.waveId === selectedSession.waveId);
                      return wi >= 0 ? `Wave ${wi + 1}` : selectedSession.waveId;
                    })()}
                  </Text>
                </Box>
              )}

              {/* Task */}
              {selectedSession.task && (
                <Box>
                  <Text color="gray">Task  </Text>
                  <Text color="white">{selectedSession.task.slice(0, 60)}</Text>
                </Box>
              )}

              <Text color="gray">{'\u2500'.repeat(40)}</Text>
            </Box>
          )}

          {/* Agent Resource Header — role selected but no active session */}
          {selectedRoleId && !selectedSession && (
            <Box flexDirection="column" paddingX={1} marginBottom={0}>
              <Text bold color="cyan">{selectedRoleId}</Text>
              <Text color="gray">(no active session)</Text>
              <Text color="gray">{'\u2500'.repeat(40)}</Text>
            </Box>
          )}

          {/* Stream */}
          <StreamView
            events={roleEvents}
            allRoleIds={flatRoles}
            streamStatus={streamStatus}
            waveId={waveId}
            roleLabel={roleLabel}
          />
        </Box>
      </Box>

      {/* Separator */}
      <Box width="100%">
        <Text color="gray">{'\u2500'.repeat(process.stdout.columns || 70)}</Text>
      </Box>

      {/* Footer hints */}
      <Box paddingX={1} justifyContent="center">
        <Text color="gray" dimColor>
          [j/k] move  [Enter] select  [Esc] back to command
        </Text>
      </Box>
    </Box>
  );
};
