/**
 * Mock org tree for testing — CEO → CTO → PM, Engineer
 */
import type { OrgTree, OrgNode } from '../../src/engine/org-tree.js';

const defaultAuth = {
  autonomous: ['Implementation within assigned scope'],
  needsApproval: ['Architecture changes'],
};
const defaultKnowledge = { reads: ['projects/'], writes: ['projects/'] };
const defaultReports = { daily: 'standup', weekly: 'summary' };

function node(overrides: Partial<OrgNode> & Pick<OrgNode, 'id' | 'name' | 'level' | 'reportsTo' | 'persona'>): OrgNode {
  return {
    children: [],
    authority: defaultAuth,
    knowledge: defaultKnowledge,
    reports: defaultReports,
    ...overrides,
  };
}

/**
 * Standard test org: CEO → CTO → PM, Engineer
 */
export function createTestOrgTree(): OrgTree {
  const ceo = node({ id: 'ceo', name: 'CEO', level: 'c-level', reportsTo: '', persona: 'Company leader', children: ['cto'] });
  const cto = node({ id: 'cto', name: 'CTO', level: 'c-level', reportsTo: 'ceo', persona: 'Technical leader', children: ['pm', 'engineer'] });
  const pm = node({ id: 'pm', name: 'PM', level: 'team-lead', reportsTo: 'cto', persona: 'Product manager' });
  const engineer = node({ id: 'engineer', name: 'Engineer', level: 'member', reportsTo: 'cto', persona: 'Software engineer' });

  const nodes = new Map<string, OrgNode>();
  nodes.set('ceo', ceo);
  nodes.set('cto', cto);
  nodes.set('pm', pm);
  nodes.set('engineer', engineer);

  return { root: 'ceo', nodes };
}

/**
 * Flat test org: CEO → A, B (no depth)
 */
export function createFlatOrgTree(): OrgTree {
  const ceo = node({ id: 'ceo', name: 'CEO', level: 'c-level', reportsTo: '', persona: 'Leader', children: ['a', 'b'] });
  const a = node({ id: 'a', name: 'Role A', level: 'member', reportsTo: 'ceo', persona: 'Worker A' });
  const b = node({ id: 'b', name: 'Role B', level: 'member', reportsTo: 'ceo', persona: 'Worker B' });

  const nodes = new Map<string, OrgNode>();
  nodes.set('ceo', ceo);
  nodes.set('a', a);
  nodes.set('b', b);

  return { root: 'ceo', nodes };
}
