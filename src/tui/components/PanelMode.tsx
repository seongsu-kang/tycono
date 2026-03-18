/**
 * PanelMode — Wave-scoped team view
 *
 * Shows focused wave's team state:
 *   Left:  Wave title + Org Tree (wave-scoped status) + Wave tabs
 *   Right: Selected role's resources + stream
 *
 * Navigation:
 *   j/k        — move in Org Tree (auto-selects)
 *   1-9        — switch wave focus
 *   Enter      — toggle filtered/all stream
 *   Esc        — return to Command Mode
 *   Ctrl+C     — quit
 */

import React, { useState, useEffect, useMemo } from 'react';
import { Box, Text, useInput } from 'ink';
import { OrgTree } from './OrgTree';
import { StreamView } from './StreamView';
import type { OrgNode } from '../store';
import type { SSEEvent, ActiveSessionInfo, SessionInfo } from '../api';
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
  allSessions: SessionInfo[];
  waves: WaveInfo[];
  focusedWaveId: string | null;
  onMove: (direction: 'up' | 'down') => void;
  onSelect: () => void;
  onEscape: () => void;
  onFocusWave: (waveId: string) => void;
}

/** Get wave-scoped role statuses */
function getWaveScopedStatuses(
  allSessions: SessionInfo[],
  focusedWaveId: string | null,
): Record<string, string> {
  if (!focusedWaveId) return {};
  const statuses: Record<string, string> = {};
  for (const s of allSessions) {
    if (s.waveId !== focusedWaveId) continue;
    if (s.status === 'active') {
      statuses[s.roleId] = 'working';
    } else if (!statuses[s.roleId]) {
      statuses[s.roleId] = 'done';
    }
  }
  return statuses;
}

/** Find active session for a role in focused wave */
function findSessionForRole(
  activeSessions: ActiveSessionInfo[],
  allSessions: SessionInfo[],
  roleId: string,
  focusedWaveId: string | null,
): ActiveSessionInfo | null {
  // First try: session with matching waveId
  if (focusedWaveId) {
    const waveSes = allSessions.find(s => s.waveId === focusedWaveId && s.roleId === roleId && s.status === 'active');
    if (waveSes) {
      return activeSessions.find(s => s.sessionId === waveSes.id) ?? null;
    }
  }
  // Fallback: any active session for this role
  return activeSessions.find(s => s.roleId === roleId && s.status === 'active') ?? null;
}

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
  allSessions,
  waves,
  focusedWaveId,
  onMove,
  onSelect,
  onEscape,
  onFocusWave,
}) => {
  const [termHeight, setTermHeight] = useState(process.stdout.rows || 30);
  useEffect(() => {
    const onResize = () => setTermHeight(process.stdout.rows || 30);
    process.stdout.on('resize', onResize);
    return () => { process.stdout.off('resize', onResize); };
  }, []);

  const separatorStr = useMemo(() => '\u2502\n'.repeat(Math.max(5, termHeight - 8)), [termHeight]);

  // Wave-scoped statuses for Org Tree
  const waveScopedStatuses = useMemo(
    () => getWaveScopedStatuses(allSessions, focusedWaveId),
    [allSessions, focusedWaveId],
  );

  // Override tree node statuses with wave-scoped values
  const waveScopedTree = useMemo(() => {
    function scopeNode(node: OrgNode): OrgNode {
      return {
        ...node,
        status: waveScopedStatuses[node.role.id] ?? 'idle',
        children: node.children.map(scopeNode),
      };
    }
    return tree.map(scopeNode);
  }, [tree, waveScopedStatuses]);

  useInput((input, key) => {
    if (key.escape) { onEscape(); return; }
    if (key.upArrow || input === 'k') { onMove('up'); return; }
    if (key.downArrow || input === 'j') { onMove('down'); return; }
    if (key.return) { onSelect(); return; }
    // 1-9: wave switch
    const num = parseInt(input, 10);
    if (num >= 1 && num <= 9 && num <= waves.length) {
      onFocusWave(waves[num - 1].waveId);
    }
  });

  // Filter events for selected role
  const roleEvents = selectedRoleId
    ? events.filter((e) => e.roleId === selectedRoleId)
    : events;

  const roleLabel = selectedRoleId
    ? flatRoles.includes(selectedRoleId) ? selectedRoleId : 'All'
    : 'All';

  // Find resource info for selected role (wave-scoped)
  const selectedSession = selectedRoleId
    ? findSessionForRole(activeSessions, allSessions, selectedRoleId, focusedWaveId)
    : null;

  // Focused wave info
  const focusedWave = waves.find(w => w.waveId === focusedWaveId);
  const focusedWaveIndex = focusedWaveId
    ? waves.findIndex(w => w.waveId === focusedWaveId) + 1
    : 0;

  // Wave session count for display
  const waveSessionCount = focusedWaveId
    ? allSessions.filter(s => s.waveId === focusedWaveId).length
    : 0;

  const leftWidth = 28;

  return (
    <Box flexDirection="column" flexGrow={1}>
      {/* Main content */}
      <Box flexGrow={1}>
        {/* Left: Wave title + Org Tree + Wave tabs */}
        <Box flexDirection="column" width={leftWidth}>
          {/* Wave title */}
          <Box paddingX={1} marginBottom={0}>
            <Text color="green" bold>
              W{focusedWaveIndex}
            </Text>
            <Text color="gray"> </Text>
            <Text color="white" wrap="truncate">
              {focusedWave?.directive ? focusedWave.directive.slice(0, leftWidth - 6) : '(idle)'}
            </Text>
          </Box>

          {/* Session count */}
          {waveSessionCount > 0 && (
            <Box paddingX={1}>
              <Text color="gray">{waveSessionCount} sessions</Text>
            </Box>
          )}

          {/* Org Tree (wave-scoped statuses) */}
          <OrgTree
            tree={waveScopedTree}
            focused={true}
            selectedIndex={selectedRoleIndex}
            flatRoles={flatRoles}
            ceoStatus={waveScopedStatuses['ceo'] ?? 'idle'}
          />

          {/* Wave tabs at bottom */}
          {waves.length > 1 && (
            <Box paddingX={1} marginTop={1}>
              {waves.map((w, i) => {
                const isFocused = w.waveId === focusedWaveId;
                return (
                  <Box key={w.waveId} marginRight={1}>
                    <Text
                      color={isFocused ? 'green' : 'gray'}
                      bold={isFocused}
                      inverse={isFocused}
                    >
                      {` ${i + 1} `}
                    </Text>
                  </Box>
                );
              })}
            </Box>
          )}
        </Box>

        {/* Vertical separator */}
        <Box flexDirection="column" marginX={0}>
          <Text color="gray">{separatorStr}</Text>
        </Box>

        {/* Right: Agent Detail + Stream */}
        <Box flexGrow={1} flexDirection="column" overflow="hidden">
          {/* Agent Resource Header */}
          {selectedRoleId && selectedSession && (
            <Box flexDirection="column" paddingX={1} marginBottom={0}>
              <Box justifyContent="space-between">
                <Text bold color="cyan">{selectedRoleId}</Text>
                <Text color={selectedSession.status === 'active' ? 'green' : 'gray'}>
                  {selectedSession.status === 'active' ? '\u25CF' : '\u25CB'} {selectedSession.status}
                  {selectedSession.startedAt ? ` (${elapsed(selectedSession.startedAt)})` : ''}
                </Text>
              </Box>
              {selectedSession.ports.api > 0 && (
                <Box>
                  <Text color="gray">Port  </Text>
                  <Text color="white">
                    API:{selectedSession.ports.api} Vite:{selectedSession.ports.vite}
                    {selectedSession.ports.hmr ? ` HMR:${selectedSession.ports.hmr}` : ''}
                  </Text>
                </Box>
              )}
              {selectedSession.worktreePath && (
                <Box>
                  <Text color="gray">Tree  </Text>
                  <Text color="white">{selectedSession.worktreePath}</Text>
                </Box>
              )}
              {selectedSession.task && (
                <Box>
                  <Text color="gray">Task  </Text>
                  <Text color="white" wrap="truncate">{selectedSession.task.slice(0, 60)}</Text>
                </Box>
              )}
              <Text color="gray">{'\u2500'.repeat(40)}</Text>
            </Box>
          )}

          {selectedRoleId && !selectedSession && (
            <Box flexDirection="column" paddingX={1} marginBottom={0}>
              <Text bold color="cyan">{selectedRoleId}</Text>
              <Text color="gray">(not active in this wave)</Text>
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
          [j/k] move  [Enter] all/role  {waves.length > 1 ? '[1-9] wave  ' : ''}[Esc] command  [Ctrl+C] quit
        </Text>
      </Box>
    </Box>
  );
};
