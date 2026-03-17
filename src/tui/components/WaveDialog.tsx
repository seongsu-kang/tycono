/**
 * WaveDialog — modal for wave dispatch input
 */

import React, { useState } from 'react';
import { Box, Text, useInput } from 'ink';
import TextInput from 'ink-text-input';

interface WaveDialogProps {
  onSubmit(directive: string): void;
  onCancel(): void;
}

export const WaveDialog: React.FC<WaveDialogProps> = ({ onSubmit, onCancel }) => {
  const [directive, setDirective] = useState('');

  useInput((_input, key) => {
    if (key.escape) {
      onCancel();
    }
  });

  const handleSubmit = (value: string) => {
    const trimmed = value.trim();
    if (trimmed) {
      onSubmit(trimmed);
    }
  };

  return (
    <Box
      flexDirection="column"
      borderStyle="round"
      borderColor="cyan"
      paddingX={2}
      paddingY={1}
    >
      <Text bold color="cyan">{'\u2500\u2500'} Wave Dispatch {'\u2500\u2500'}</Text>
      <Box marginTop={1}>
        <Text color="white">Directive: </Text>
      </Box>
      <Box marginTop={0}>
        <Text color="green">&gt; </Text>
        <TextInput
          value={directive}
          onChange={setDirective}
          onSubmit={handleSubmit}
          placeholder="Type your wave directive..."
        />
      </Box>
      <Box marginTop={1}>
        <Text color="gray" dimColor>[Enter: Dispatch]  [Esc: Cancel]</Text>
      </Box>
    </Box>
  );
};
