/**
 * CommandInput — bottom bar with command input and shortcut hints
 */

import React from 'react';
import { Box, Text } from 'ink';

interface CommandInputProps {
  focused: boolean;
  waveStatus: 'idle' | 'running' | 'done';
  dialog: string;
}

export const CommandInput: React.FC<CommandInputProps> = ({ focused, waveStatus, dialog }) => {
  if (dialog !== 'none') return null;

  return (
    <Box width="100%" paddingX={1} justifyContent="space-between">
      <Box>
        <Text color="green" bold>&gt; </Text>
        <Text color={focused ? 'white' : 'gray'}>
          {waveStatus === 'running' ? 'Wave running...' : 'Ready'}
        </Text>
      </Box>
      <Box>
        <Text color="gray" dimColor>
          [w]ave  [?]help  [q]uit  [Tab]panel
        </Text>
      </Box>
    </Box>
  );
};
