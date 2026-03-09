import fs from 'node:fs';
import path from 'node:path';
import YAML from 'yaml';

/* ─── Types ──────────────────────────────────── */

export interface Authority {
  autonomous: string[];
  needsApproval: string[];
}

export interface KnowledgeAccess {
  reads: string[];
  writes: string[];
}

export interface RoleSource {
  id: string;
  sync: 'auto' | 'manual' | 'off';
  forked_at?: string;
  upstream_version?: string;
}

export interface OrgNode {
  id: string;
  name: string;
  level: 'c-level' | 'team-lead' | 'member';
  reportsTo: string;
  children: string[];
  persona: string;
  authority: Authority;
  knowledge: KnowledgeAccess;
  reports: { daily: string; weekly: string };
  skills?: string[];
  model?: string;
  source?: RoleSource;
}

export interface OrgTree {
  root: string;
  nodes: Map<string, OrgNode>;
}

/* ─── Raw YAML shape ─────────────────────────── */

interface RawRoleYaml {
  id: string;
  name: string;
  level: string;
  reports_to: string;
  persona: string;
  authority?: {
    autonomous?: string[];
    needs_approval?: string[];
  };
  knowledge?: {
    reads?: string[];
    writes?: string[];
  };
  reports?: {
    daily?: string;
    weekly?: string;
  };
  skills?: string[];
  model?: string;
  source?: {
    id?: string;
    sync?: string;
    forked_at?: string;
    upstream_version?: string;
  };
}

/* ─── Build ──────────────────────────────────── */

export function buildOrgTree(companyRoot: string): OrgTree {
  const rolesDir = path.join(companyRoot, 'roles');
  const tree: OrgTree = { root: 'ceo', nodes: new Map() };

  // CEO is implicit (not a role.yaml file)
  tree.nodes.set('ceo', {
    id: 'ceo',
    name: 'CEO',
    level: 'c-level',
    reportsTo: '',
    children: [],
    persona: '',
    authority: { autonomous: [], needsApproval: [] },
    knowledge: { reads: ['*'], writes: ['*'] },
    reports: { daily: '', weekly: '' },
  });

  if (!fs.existsSync(rolesDir)) return tree;

  // Read all role.yaml files
  const entries = fs.readdirSync(rolesDir, { withFileTypes: true });
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const yamlPath = path.join(rolesDir, entry.name, 'role.yaml');
    if (!fs.existsSync(yamlPath)) continue;

    try {
      const raw = YAML.parse(fs.readFileSync(yamlPath, 'utf-8')) as RawRoleYaml;
      const node: OrgNode = {
        id: raw.id || entry.name,
        name: raw.name || entry.name,
        level: (raw.level as OrgNode['level']) || 'member',
        reportsTo: (raw.reports_to || 'ceo').toLowerCase(),
        children: [],
        persona: raw.persona || '',
        authority: {
          autonomous: raw.authority?.autonomous ?? [],
          needsApproval: raw.authority?.needs_approval ?? [],
        },
        knowledge: {
          reads: raw.knowledge?.reads ?? [],
          writes: raw.knowledge?.writes ?? [],
        },
        reports: {
          daily: raw.reports?.daily ?? '',
          weekly: raw.reports?.weekly ?? '',
        },
        skills: raw.skills,
        model: raw.model,
        source: raw.source ? {
          id: raw.source.id || '',
          sync: (raw.source.sync as RoleSource['sync']) || 'manual',
          forked_at: raw.source.forked_at,
          upstream_version: raw.source.upstream_version,
        } : undefined,
      };
      tree.nodes.set(node.id, node);
    } catch {
      // Skip malformed YAML
    }
  }

  // Wire up children from reportsTo
  for (const [id, node] of tree.nodes) {
    if (id === 'ceo') continue;
    const parent = tree.nodes.get(node.reportsTo);
    if (parent) {
      parent.children.push(id);
    }
  }

  return tree;
}

/* ─── Queries ────────────────────────────────── */

/** Direct reports */
export function getSubordinates(tree: OrgTree, roleId: string): string[] {
  return tree.nodes.get(roleId)?.children ?? [];
}

/** All descendants (recursive) */
export function getDescendants(tree: OrgTree, roleId: string): string[] {
  const result: string[] = [];
  const stack = [...getSubordinates(tree, roleId)];
  while (stack.length > 0) {
    const id = stack.pop()!;
    result.push(id);
    stack.push(...getSubordinates(tree, id));
  }
  return result;
}

/** Chain from role up to CEO: [roleId, ..., ceo] */
export function getChainOfCommand(tree: OrgTree, roleId: string): string[] {
  const chain: string[] = [];
  let current = roleId;
  const visited = new Set<string>();
  while (current && !visited.has(current)) {
    visited.add(current);
    chain.push(current);
    const node = tree.nodes.get(current);
    if (!node || !node.reportsTo) break;
    current = node.reportsTo;
  }
  return chain;
}

/** Can source dispatch a task to target? */
export function canDispatchTo(tree: OrgTree, source: string, target: string): boolean {
  if (source === target) return false;

  // CEO can dispatch to direct reports only
  if (source === 'ceo') {
    return tree.nodes.get(target)?.reportsTo === 'ceo';
  }

  // Others can dispatch to anyone in their subtree
  const descendants = getDescendants(tree, source);
  return descendants.includes(target);
}

/** Can source consult (ask a question to) target? Peers, direct manager, or subordinates. */
export function canConsult(tree: OrgTree, source: string, target: string): boolean {
  if (source === target) return false;
  const sourceNode = tree.nodes.get(source);
  const targetNode = tree.nodes.get(target);
  if (!sourceNode || !targetNode) return false;

  // 1. Peers — same parent
  if (sourceNode.reportsTo === targetNode.reportsTo) return true;

  // 2. Direct manager
  if (sourceNode.reportsTo === target) return true;

  // 3. Subordinates (same as dispatch scope)
  const descendants = getDescendants(tree, source);
  return descendants.includes(target);
}

/** Refresh tree (re-read all role.yaml files) */
export function refreshOrgTree(companyRoot: string): OrgTree {
  return buildOrgTree(companyRoot);
}

/** Get a human-readable org chart string for context injection */
export function formatOrgChart(tree: OrgTree, perspective?: string): string {
  const lines: string[] = [];

  function render(nodeId: string, indent: number): void {
    const node = tree.nodes.get(nodeId);
    if (!node) return;
    const marker = perspective === nodeId ? ' ← YOU' : '';
    const prefix = indent === 0 ? '' : '  '.repeat(indent) + '└─ ';
    lines.push(`${prefix}${node.name} (${node.id})${marker}`);
    for (const childId of node.children) {
      render(childId, indent + 1);
    }
  }

  render('ceo', 0);
  return lines.join('\n');
}
