/**
 * PanelMode — Tab view: Org Tree (left) + selected Role's stream (right)
 *
 * Navigation:
 *   j/k or arrow keys — move in Org Tree
 *   Enter             — select role to view its stream
 *   Esc               — return to Command Mode
 */

import React from 'react';
import { Box, Text, useInput } from 'ink';
import { OrgTree } from './OrgTree';
import { StreamView } from './StreamView';
import type { OrgNode } from '../store';
import type { SSEEvent } from '../api';

interface PanelModeProps {
  tree: OrgNode[];
  flatRoles: string[];
  events: SSEEvent[];
  selectedRoleIndex: number;
  selectedRoleId: string | null;
  streamStatus: 'idle' | 'streaming' | 'done' | 'error';
  waveId: string | null;
  onMove: (direction: 'up' | 'down') => void;
  onSelect: () => void;
  onEscape: () => void;
}

export const PanelMode: React.FC<PanelModeProps> = ({
  tree,
  flatRoles,
  events,
  selectedRoleIndex,
  selectedRoleId,
  streamStatus,
  waveId,
  onMove,
  onSelect,
  onEscape,
}) => {
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

  return (
    <Box flexDirection="column" flexGrow={1}>
      {/* Main content: Org Tree left | Stream right */}
      <Box flexGrow={1}>
        {/* Left: Org Tree */}
        <Box flexDirection="column" width={28}>
          <OrgTree
            tree={tree}
            focused={true}
            selectedIndex={selectedRoleIndex}
            flatRoles={flatRoles}
          />
        </Box>

        {/* Vertical separator */}
        <Box flexDirection="column" marginX={0}>
          <Text color="gray">{'\u2502\n'.repeat(15)}</Text>
        </Box>

        {/* Right: Stream for selected role */}
        <StreamView
          events={roleEvents}
          allRoleIds={flatRoles}
          streamStatus={streamStatus}
          waveId={waveId}
          roleLabel={roleLabel}
        />
      </Box>

      {/* Separator */}
      <Box width="100%">
        <Text color="gray">{'\u2500'.repeat(70)}</Text>
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
