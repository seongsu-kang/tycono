import { useMemo, useCallback, useEffect } from 'react';
import { ReactFlow, type Node, type Edge } from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import type { WaveNode } from '../../hooks/useWaveTree';
import type { OrgNode } from '../../types';
import { isWaveNodeActive } from '../../types';
import OrgRoleNode, { DIMS, type OrgRoleData, type OrgRoleLevel } from './OrgRoleNode';
import OrgStatusEdge from './OrgStatusEdge';

const X_GAP = 24;
const Y_GAP = 56;

const nodeTypes = { orgRole: OrgRoleNode } as const;
const edgeTypes = { orgEdge: OrgStatusEdge } as const;

interface Props {
  nodes: Map<string, WaveNode>;
  rootId: string;
  selectedRoleId: string | null;
  onSelectNode: (roleId: string) => void;
  /** Checked roles for dispatch targeting */
  checkedRoles?: Set<string>;
  onToggleCheck?: (roleId: string) => void;
  /** Roles eligible for checkbox interaction (subtree of selected node) */
  eligibleRoles?: Set<string>;
  /** Org node metadata for level info */
  orgNodes?: Record<string, OrgNode>;
}

interface LayoutItem {
  roleId: string;
  x: number;
  y: number;
  parentId: string | null;
  level: OrgRoleLevel;
}

function getRoleLevel(roleId: string, rootId: string, orgNodes?: Record<string, OrgNode>): OrgRoleLevel {
  if (roleId === rootId) return 'ceo';
  if (orgNodes?.[roleId]?.level === 'c-level') return 'c-level';
  // Fallback: if parent is root, it's c-level
  if (orgNodes?.[roleId]?.reportsTo === rootId) return 'c-level';
  return 'member';
}

function buildLayout(
  nodes: Map<string, WaveNode>,
  rootId: string,
  orgNodes?: Record<string, OrgNode>,
): LayoutItem[] {
  const root = nodes.get(rootId);
  if (!root) return [];

  const layout: LayoutItem[] = [];
  const levels: string[][] = [];
  const queue: Array<{ id: string; depth: number; parentId: string | null }> = [
    { id: rootId, depth: 0, parentId: null },
  ];
  const visited = new Set<string>();

  while (queue.length > 0) {
    const { id, depth, parentId } = queue.shift()!;
    if (visited.has(id)) continue;
    visited.add(id);

    while (levels.length <= depth) levels.push([]);
    levels[depth].push(id);
    const rl = getRoleLevel(id, rootId, orgNodes);
    layout.push({ roleId: id, x: 0, y: 0, parentId, level: rl });

    const node = nodes.get(id);
    if (node) {
      for (const childId of node.children) {
        if (nodes.has(childId) && !visited.has(childId)) {
          queue.push({ id: childId, depth: depth + 1, parentId: id });
        }
      }
    }
  }

  // Calculate Y positions using cumulative level heights
  let yOffset = 0;
  for (let d = 0; d < levels.length; d++) {
    const levelRoleIds = levels[d];
    // Get max height in this level
    const maxH = Math.max(...levelRoleIds.map(id => {
      const item = layout.find(l => l.roleId === id);
      return item ? DIMS[item.level].h : 44;
    }));

    // Get widths for this level
    const totalWidth = levelRoleIds.reduce((sum, id) => {
      const item = layout.find(l => l.roleId === id);
      return sum + (item ? DIMS[item.level].w : 130) + X_GAP;
    }, -X_GAP);

    let xPos = -totalWidth / 2;
    for (const id of levelRoleIds) {
      const item = layout.find(l => l.roleId === id);
      if (!item) continue;
      const dim = DIMS[item.level];
      item.x = xPos + dim.w / 2; // center-aligned
      item.y = yOffset + (maxH - dim.h) / 2; // vertically center within level
      xPos += dim.w + X_GAP;
    }

    yOffset += maxH + Y_GAP;
  }

  // Shift so positions are relative to center (React Flow fitView handles the rest)
  // We already use center-based positioning, just offset x to be node left edge
  for (const item of layout) {
    const dim = DIMS[item.level];
    item.x -= dim.w / 2;
  }

  return layout;
}

export default function OrgTreeLive({
  nodes,
  rootId,
  selectedRoleId,
  onSelectNode,
  checkedRoles,
  onToggleCheck,
  eligibleRoles,
  orgNodes,
}: Props) {
  const showCheckboxes = !!onToggleCheck;

  const { rfNodes, rfEdges } = useMemo(() => {
    const layout = buildLayout(nodes, rootId, orgNodes);

    const rfNodes: Node[] = layout.map((item) => {
      const node = nodes.get(item.roleId);
      if (!node) return null;

      const hasActiveChildren = node.children.some(cid => {
        const child = nodes.get(cid);
        return child && isWaveNodeActive(child.status);
      });

      const data: OrgRoleData = {
        node,
        roleLevel: item.level,
        isSelected: selectedRoleId === item.roleId,
        isChecked: checkedRoles?.has(item.roleId) ?? false,
        showCheckbox: showCheckboxes,
        isEligible: !eligibleRoles || eligibleRoles.has(item.roleId),
        hasActiveChildren,
      };

      const dim = DIMS[item.level];

      return {
        id: item.roleId,
        type: 'orgRole',
        position: { x: item.x, y: item.y },
        data: data as unknown as Record<string, unknown>,
        draggable: false,
        selectable: false,
        width: dim.w,
        height: dim.h,
      };
    }).filter(Boolean) as Node[];

    const rfEdges: Edge[] = layout
      .filter(item => item.parentId)
      .map((item) => {
        const childNode = nodes.get(item.roleId);
        const parentNode = nodes.get(item.parentId!);
        return {
          id: `${item.parentId}-${item.roleId}`,
          source: item.parentId!,
          target: item.roleId,
          type: 'orgEdge',
          data: {
            childStatus: childNode?.status,
            parentStatus: parentNode?.status,
            childRoleId: item.roleId,
          },
          selectable: false,
        };
      });

    return { rfNodes, rfEdges };
  }, [nodes, rootId, selectedRoleId, checkedRoles, eligibleRoles, showCheckboxes, orgNodes]);

  const handleNodeClick = useCallback((_event: React.MouseEvent, node: Node) => {
    onSelectNode(node.id);
  }, [onSelectNode]);

  // Listen for checkbox toggle from custom event (avoids stale closure in memoized nodes)
  useEffect(() => {
    if (!onToggleCheck) return;
    const handler = (e: Event) => {
      const roleId = (e as CustomEvent).detail?.roleId;
      if (roleId) onToggleCheck(roleId);
    };
    window.addEventListener('org-toggle-check', handler);
    return () => window.removeEventListener('org-toggle-check', handler);
  }, [onToggleCheck]);

  return (
    <div className="org-rf-container" style={{ width: '100%', height: '100%', minHeight: 220 }}>
      <ReactFlow
        nodes={rfNodes}
        edges={rfEdges}
        nodeTypes={nodeTypes}
        edgeTypes={edgeTypes}
        onNodeClick={handleNodeClick}
        fitView
        fitViewOptions={{ padding: 0.12, minZoom: 0.5, maxZoom: 1 }}
        zoomOnScroll={false}
        zoomOnPinch={false}
        panOnDrag={false}
        panOnScroll={false}
        nodesDraggable={false}
        nodesConnectable={false}
        elementsSelectable={false}
        preventScrolling={false}
        proOptions={{ hideAttribution: true }}
        minZoom={0.3}
        maxZoom={2}
      />
    </div>
  );
}
