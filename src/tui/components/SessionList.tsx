/**
 * SessionList — left bottom panel showing session history
 */

import React from 'react';
import { Box, Text } from 'ink';
import type { SessionInfo } from '../api';

interface SessionListProps {
  sessions: SessionInfo[];
  focused: boolean;
  selectedIndex: number;
}

function sourceIcon(source: string): string {
  switch (source) {
    case 'wave': return 'W';
    case 'dispatch': return 'D';
    case 'chat': return 'C';
    case 'consult': return 'Q';
    default: return '?';
  }
}

function statusSymbol(status: string): { icon: string; color: string } {
  switch (status) {
    case 'active':
      return { icon: '\u25CF', color: 'green' };
    case 'closed':
      return { icon: '\u2713', color: 'gray' };
    default:
      return { icon: '\u25CB', color: 'gray' };
  }
}

export const SessionList: React.FC<SessionListProps> = ({ sessions, focused, selectedIndex }) => {
  // Show most recent first, limit to 10
  const sorted = [...sessions]
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
    .slice(0, 10);

  return (
    <Box flexDirection="column" paddingX={1}>
      <Text bold color={focused ? 'cyan' : 'gray'}>
        {'\u2500\u2500'} Sessions ({sessions.length}) {'\u2500\u2500'}
      </Text>
      {sorted.length === 0 && (
        <Text color="gray" dimColor>No sessions yet</Text>
      )}
      {sorted.map((session, i) => {
        const isSelected = focused && i === selectedIndex;
        const { icon, color } = statusSymbol(session.status);
        const title = session.title || session.roleId;
        const src = sourceIcon(session.source);

        return (
          <Box key={session.id}>
            <Text color={color}>{icon}</Text>
            <Text> </Text>
            <Text color="gray">[{src}]</Text>
            <Text> </Text>
            <Text
              color={isSelected ? 'cyan' : 'white'}
              bold={isSelected}
              inverse={isSelected}
            >
              {title.length > 25 ? title.slice(0, 24) + '\u2026' : title}
            </Text>
          </Box>
        );
      })}
    </Box>
  );
};
