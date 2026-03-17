/**
 * HelpOverlay — keyboard shortcut reference
 */

import React from 'react';
import { Box, Text, useInput } from 'ink';

interface HelpOverlayProps {
  onClose(): void;
}

const shortcuts = [
  ['w', 'Wave dispatch'],
  ['q', 'Quit'],
  ['?', 'Toggle help'],
  ['Tab', 'Cycle panels'],
  ['j/k', 'Navigate (in focused panel)'],
  ['Enter', 'Select'],
  ['Esc', 'Close dialog / deselect'],
] as const;

export const HelpOverlay: React.FC<HelpOverlayProps> = ({ onClose }) => {
  useInput((input, key) => {
    if (input === '?' || input === 'q' || key.escape) {
      onClose();
    }
  });

  return (
    <Box
      flexDirection="column"
      borderStyle="round"
      borderColor="yellow"
      paddingX={2}
      paddingY={1}
    >
      <Text bold color="yellow">{'\u2500\u2500'} Keyboard Shortcuts {'\u2500\u2500'}</Text>
      <Box marginTop={1} flexDirection="column">
        {shortcuts.map(([key, desc]) => (
          <Box key={key}>
            <Text color="cyan" bold>{key.padEnd(8)}</Text>
            <Text color="white">{desc}</Text>
          </Box>
        ))}
      </Box>
      <Box marginTop={1}>
        <Text color="gray" dimColor>Press ? or Esc to close</Text>
      </Box>
    </Box>
  );
};
