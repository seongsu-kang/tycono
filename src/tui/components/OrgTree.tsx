/**
 * OrgTree — left panel showing organization hierarchy
 * Simplified to single Text render to prevent yoga OOM on wide terminals
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
  ceoStatus?: string;
}

function flattenTree(nodes: OrgNode[], isLast: boolean[] = []): Array<{ roleId: string; status: string; line: string }> {
  const result: Array<{ roleId: string; status: string; line: string }> = [];
  for (let i = 0; i < nodes.length; i++) {
    const node = nodes[i];
    const last = i === nodes.length - 1;
    let prefix = '';
    for (let j = 0; j < isLast.length; j++) {
      prefix += isLast[j] ? '   ' : '\u2502  ';
    }
    prefix += last ? '\u2514\u2500 ' : '\u251C\u2500 ';
    const icon = statusIcon(node.status);
    result.push({ roleId: node.role.id, status: node.status, line: `${prefix}${icon} ${node.role.id}` });
    if (node.children.length > 0) {
      result.push(...flattenTree(node.children, [...isLast, last]));
    }
  }
  return result;
}

export const OrgTree: React.FC<OrgTreeProps> = React.memo(({ tree, focused, selectedIndex, flatRoles, ceoStatus }) => {
  const ceoIcon = statusIcon(ceoStatus ?? 'idle');
  const entries = flattenTree(tree);

  // Render entire tree as single Text block (1 yoga node instead of 50+)
  const lines = [`${ceoIcon} CEO`, ...entries.map(e => e.line)];

  return (
    <Box flexDirection="column" paddingX={1}>
      <Text bold color={focused ? 'cyan' : 'gray'}>{'\u2500\u2500 Org Tree \u2500\u2500'}</Text>
      <Text color="white">{'\n' + lines.join('\n')}</Text>
    </Box>
  );
});
