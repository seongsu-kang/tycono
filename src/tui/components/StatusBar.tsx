/**
 * StatusBar — top bar showing company name, wave status, active count, cost
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
    ? `Wave ${waveId.replace('wave-', '#')} ${waveStatus === 'running' ? '\u25CF' : waveStatus === 'done' ? '\u2713' : ''} ${waveStatus}`
    : 'No active wave';

  return (
    <Box
      width="100%"
      paddingX={1}
      justifyContent="space-between"
    >
      <Box>
        <Text bold color="cyan">TYCONO</Text>
        <Text color="white"> </Text>
        <Text color="white">{companyName}</Text>
      </Box>
      <Box>
        <Text color={waveStatus === 'running' ? 'green' : 'gray'}>
          {waveLabel}
        </Text>
        <Text color="white">  </Text>
        <Text color="yellow">{activeCount} active</Text>
        <Text color="white">  </Text>
        <Text color="green">${totalCost.toFixed(2)}</Text>
      </Box>
    </Box>
  );
};
