/**
 * StatusBar — bottom bar (Claude Code style)
 * Shows: company name, wave info, dispatch chain, active roles, elapsed, cost
 */

import React from 'react';
import { Box, Text } from 'ink';
import type { ActiveSessionInfo } from '../api';

interface StatusBarProps {
  companyName: string;
  waveIndex: number;      // 1-based focused wave index (0 = none)
  waveCount: number;      // total waves
  waveStatus: 'idle' | 'running' | 'done';
  activeCount: number;
  portCount: number;       // total allocated ports
  totalCost: number;
  activeSessions?: ActiveSessionInfo[];
  focusedWaveId?: string | null;
  waveStartedAt?: number;  // timestamp of focused wave start
}

function elapsed(ms: number): string {
  const s = Math.floor(ms / 1000);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m${s % 60}s`;
  return `${Math.floor(m / 60)}h${m % 60}m`;
}

export const StatusBar: React.FC<StatusBarProps> = ({
  companyName,
  waveIndex,
  waveCount,
  waveStatus,
  activeCount,
  portCount,
  totalCost,
  activeSessions,
  focusedWaveId,
  waveStartedAt,
}) => {
  const statusDot = waveStatus === 'running' ? ' \u25CF'
    : waveStatus === 'done' ? ' \u2713'
    : '';

  const waveLabel = waveIndex > 0
    ? `Wave ${waveIndex}${statusDot}`
    : '';

  // Show [1/3] only when 2+ waves
  const countLabel = waveCount >= 2 ? ` [${waveIndex}/${waveCount}]` : '';

  // Dispatch chain: show active roles for focused wave
  let chainLabel = '';
  if (activeSessions && focusedWaveId && waveStatus === 'running') {
    const waveRoles = activeSessions
      .filter(s => s.waveId === focusedWaveId && s.status === 'active')
      .map(s => s.roleId);
    // Deduplicate and show chain
    const unique = [...new Set(waveRoles)];
    if (unique.length > 0) {
      chainLabel = unique.join('\u2192');
    }
  }

  // Elapsed time
  let elapsedLabel = '';
  if (waveStartedAt && waveStatus === 'running') {
    elapsedLabel = elapsed(Date.now() - waveStartedAt);
  }

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
      {chainLabel && (
        <>
          <Text color="gray"> | </Text>
          <Text color="yellow">{chainLabel}</Text>
        </>
      )}
      {elapsedLabel && (
        <>
          <Text color="gray"> </Text>
          <Text color="gray">{elapsedLabel}</Text>
        </>
      )}
      {!chainLabel && activeCount > 0 && (
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
