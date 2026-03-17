/**
 * TUI Global State — simple shared state with React useState pattern
 */

import type { RoleInfo, CompanyInfo, SessionInfo, SSEEvent, ExecStatus } from './api';

export interface TuiState {
  // Company
  companyName: string;
  roles: RoleInfo[];

  // Execution status
  roleStatuses: Record<string, string>; // roleId -> 'idle' | 'working' | 'done' | 'awaiting_input'
  activeExecutions: ExecStatus['activeExecutions'];

  // Wave
  currentWaveId: string | null;
  waveStatus: 'idle' | 'running' | 'done';

  // Sessions
  sessions: SessionInfo[];

  // Stream events
  events: SSEEvent[];

  // UI state
  activePanel: 'org' | 'sessions' | 'stream' | 'command';
  dialog: 'none' | 'wave' | 'help';
  selectedRoleIndex: number;
  selectedSessionIndex: number;

  // Error
  lastError: string | null;

  // Cost (from events)
  totalCost: number;
  activeCount: number;
}

export function createInitialState(): TuiState {
  return {
    companyName: 'Loading...',
    roles: [],
    roleStatuses: {},
    activeExecutions: [],
    currentWaveId: null,
    waveStatus: 'idle',
    sessions: [],
    events: [],
    activePanel: 'org',
    dialog: 'none',
    selectedRoleIndex: 0,
    selectedSessionIndex: 0,
    lastError: null,
    totalCost: 0,
    activeCount: 0,
  };
}

/** Build org tree structure from flat roles list */
export interface OrgNode {
  role: RoleInfo;
  children: OrgNode[];
  status: string;
}

export function buildOrgTree(roles: RoleInfo[], statuses: Record<string, string>): OrgNode[] {
  const nodeMap = new Map<string, OrgNode>();

  for (const role of roles) {
    nodeMap.set(role.id, {
      role,
      children: [],
      status: statuses[role.id] ?? 'idle',
    });
  }

  const roots: OrgNode[] = [];

  for (const role of roles) {
    const node = nodeMap.get(role.id)!;
    const parentId = role.reportsTo?.toLowerCase();

    if (!parentId || parentId === 'ceo' || parentId === '-' || parentId === '') {
      roots.push(node);
    } else {
      // Find parent by checking role IDs
      const parent = nodeMap.get(parentId);
      if (parent) {
        parent.children.push(node);
      } else {
        // If parent not found, treat as root
        roots.push(node);
      }
    }
  }

  return roots;
}

/** Flatten org tree into visual top-to-bottom order of role IDs */
export function flattenOrgRoleIds(nodes: OrgNode[]): string[] {
  const result: string[] = [];
  for (const node of nodes) {
    result.push(node.role.id);
    if (node.children.length > 0) {
      result.push(...flattenOrgRoleIds(node.children));
    }
  }
  return result;
}
