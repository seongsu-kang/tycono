/**
 * OrgTree — left panel showing organization hierarchy with real-time status
 */

import React from 'react';
import { Box, Text } from 'ink';
import type { OrgNode } from '../store';
import { statusIcon } from '../theme';

interface OrgTreeProps {
  tree: OrgNode[];
  focused: boolean;
  selectedIndex: number;
  flatRoles: string[];
}

function statusColor(status: string): string {
  switch (status) {
    case 'working':
    case 'streaming':
      return 'green';
    case 'done':
      return 'gray';
    case 'error':
      return 'red';
    case 'awaiting_input':
      return 'yellow';
    default:
      return 'gray';
  }
}

interface FlatEntry {
  roleId: string;
  level: string;
  status: string;
  prefix: string;
}

function flattenTree(nodes: OrgNode[], prefix: string = '', isLast: boolean[] = []): FlatEntry[] {
  const result: FlatEntry[] = [];

  for (let i = 0; i < nodes.length; i++) {
    const node = nodes[i];
    const last = i === nodes.length - 1;

    let linePrefix = '';
    for (let j = 0; j < isLast.length; j++) {
      linePrefix += isLast[j] ? '   ' : '│  ';
    }
    linePrefix += isLast.length > 0 || i > 0 || nodes.length > 1
      ? (last ? '└─ ' : '├─ ')
      : '';

    result.push({
      roleId: node.role.id,
      level: node.role.level,
      status: node.status,
      prefix: linePrefix,
    });

    if (node.children.length > 0) {
      result.push(...flattenTree(node.children, '', [...isLast, last]));
    }
  }

  return result;
}

export const OrgTree: React.FC<OrgTreeProps> = React.memo(({ tree, focused, selectedIndex, flatRoles }) => {
  const entries = flattenTree(tree);

  return (
    <Box flexDirection="column" paddingX={1}>
      <Text bold color={focused ? 'cyan' : 'gray'}>{'── Org Tree ──'}</Text>
      <Box marginTop={1}>
        <Text color="yellow" bold>{'\uD83D\uDC51'} CEO</Text>
      </Box>
      {entries.map((entry, i) => {
        const isSelected = focused && flatRoles[selectedIndex] === entry.roleId;
        const icon = statusIcon(entry.status);
        const color = statusColor(entry.status);

        return (
          <Box key={entry.roleId + '-' + i}>
            <Text color="gray">{entry.prefix}</Text>
            <Text
              color={color}
              bold={entry.status === 'working'}
            >
              {icon}
            </Text>
            <Text> </Text>
            <Text
              color={isSelected ? 'cyan' : 'white'}
              bold={isSelected}
              inverse={isSelected}
            >
              {entry.roleId}
            </Text>
          </Box>
        );
      })}
    </Box>
  );
});
