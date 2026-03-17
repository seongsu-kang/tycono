/**
 * StatusBar — bottom bar (Claude Code style)
 * Shows: company name, wave status, active roles, cost
 */

import React from 'react';
import { Box, Text } from 'ink';

interface StatusBarProps {
  companyName: string;
  waveId: string | null;
  waveStatus: 'idle' | 'running' | 'done';
  activeCount: number;
  totalCost: number;
}

export const StatusBar: React.FC<StatusBarProps> = ({
  companyName,
  waveId,
  waveStatus,
  activeCount,
  totalCost,
}) => {
  const waveLabel = waveId
    ? `Wave ${waveId.replace('wave-', '#')}`
    : '';
  const statusDot = waveStatus === 'running' ? ' ●'
    : waveStatus === 'done' ? ' ✓'
    : '';

  return (
    <Box width="100%" paddingX={1}>
      <Text color="cyan" bold>Tycono</Text>
      <Text color="gray"> | </Text>
      <Text color="white">{companyName}</Text>
      {waveLabel && (
        <>
          <Text color="gray"> | </Text>
          <Text color={waveStatus === 'running' ? 'green' : 'gray'}>
            {waveLabel}{statusDot}
          </Text>
        </>
      )}
      {activeCount > 0 && (
        <>
          <Text color="gray"> | </Text>
          <Text color="yellow">{activeCount} active</Text>
        </>
      )}
      <Text color="gray"> | </Text>
      <Text color="green">${totalCost.toFixed(2)}</Text>
    </Box>
  );
};
