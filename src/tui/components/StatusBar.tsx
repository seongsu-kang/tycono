/**
 * StatusBar — bottom bar (Claude Code style)
 * Shows: company name, wave index [focused/total], active roles, ports, cost
 */

import React from 'react';
import { Box, Text } from 'ink';

interface StatusBarProps {
  companyName: string;
  waveIndex: number;      // 1-based focused wave index (0 = none)
  waveCount: number;      // total waves
  waveStatus: 'idle' | 'running' | 'done';
  activeCount: number;
  portCount: number;       // total allocated ports
  totalCost: number;
}

export const StatusBar: React.FC<StatusBarProps> = ({
  companyName,
  waveIndex,
  waveCount,
  waveStatus,
  activeCount,
  portCount,
  totalCost,
}) => {
  const statusDot = waveStatus === 'running' ? ' \u25CF'
    : waveStatus === 'done' ? ' \u2713'
    : '';

  const waveLabel = waveIndex > 0
    ? `Wave ${waveIndex}${statusDot}`
    : '';

  // Show [1/3] only when 2+ waves
  const countLabel = waveCount >= 2 ? ` [${waveIndex}/${waveCount}]` : '';

  return (
    <Box width="100%" paddingX={1}>
      <Text color="cyan" bold>Tycono</Text>
      <Text color="gray"> | </Text>
      <Text color="white">{companyName}</Text>
      {waveLabel && (
        <>
          <Text color="gray"> | </Text>
          <Text color={waveStatus === 'running' ? 'green' : 'gray'}>
            {waveLabel}{countLabel}
          </Text>
        </>
      )}
      {activeCount > 0 && (
        <>
          <Text color="gray"> | </Text>
          <Text color="yellow">{activeCount} active</Text>
        </>
      )}
      {portCount > 0 && (
        <>
          <Text color="gray"> | </Text>
          <Text color="blue">{portCount} ports</Text>
        </>
      )}
      <Text color="gray"> | </Text>
      <Text color="green">${totalCost.toFixed(2)}</Text>
    </Box>
  );
};
