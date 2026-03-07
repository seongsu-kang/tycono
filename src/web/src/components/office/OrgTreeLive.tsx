import type { WaveNode } from '../../hooks/useWaveTree';

const ROLE_COLORS: Record<string, string> = {
  cto: '#1565C0', cbo: '#E65100', pm: '#2E7D32',
  engineer: '#4A148C', designer: '#AD1457', qa: '#00695C',
  'data-analyst': '#0277BD',
};

const NODE_W = 120;
const NODE_H = 44;
const Y_GAP = 80;

interface LayoutNode {
  roleId: string;
  x: number;
  y: number;
  parentId: string | null;
}

function buildLayout(
  nodes: Map<string, WaveNode>,
  rootId: string,
): { layout: LayoutNode[]; width: number; height: number } {
  const root = nodes.get(rootId);
  if (!root) return { layout: [], width: 300, height: 200 };

  const layout: LayoutNode[] = [];
  const levels: string[][] = [];

  // BFS to get levels
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
    layout.push({ roleId: id, x: 0, y: depth * Y_GAP + 20, parentId });

    const node = nodes.get(id);
    if (node) {
      for (const childId of node.children) {
        if (nodes.has(childId) && !visited.has(childId)) {
          queue.push({ id: childId, depth: depth + 1, parentId: id });
        }
      }
    }
  }

  // Position nodes horizontally per level
  const maxWidth = Math.max(...levels.map(l => l.length)) * (NODE_W + 16);
  const totalWidth = Math.max(maxWidth, 280);

  for (const level of levels) {
    const levelWidth = level.length * (NODE_W + 16) - 16;
    const startX = (totalWidth - levelWidth) / 2;
    level.forEach((id, i) => {
      const item = layout.find(l => l.roleId === id);
      if (item) item.x = startX + i * (NODE_W + 16);
    });
  }

  const height = levels.length * Y_GAP + 40;
  return { layout, width: totalWidth, height };
}

interface Props {
  nodes: Map<string, WaveNode>;
  rootId: string;
  selectedRoleId: string | null;
  onSelectNode: (roleId: string) => void;
}

export default function OrgTreeLive({ nodes, rootId, selectedRoleId, onSelectNode }: Props) {
  const { layout, width, height } = buildLayout(nodes, rootId);

  const getNodeCenter = (roleId: string) => {
    const item = layout.find(l => l.roleId === roleId);
    if (!item) return { cx: 0, cy: 0 };
    return { cx: item.x + NODE_W / 2, cy: item.y + NODE_H / 2 };
  };

  const statusColor = (node: WaveNode) => {
    switch (node.status) {
      case 'running': return ROLE_COLORS[node.roleId] ?? '#FBBF24';
      case 'done': return '#2E7D32';
      case 'error': return '#C62828';
      case 'not-dispatched': return '#666';
      default: return '#888';
    }
  };

  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      width="100%"
      height="100%"
      className="block"
    >
      <defs>
        <filter id="glow">
          <feGaussianBlur stdDeviation="2" result="blur" />
          <feMerge>
            <feMergeNode in="blur" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
      </defs>

      {/* Edges */}
      {layout.filter(l => l.parentId).map((item) => {
        const parent = getNodeCenter(item.parentId!);
        const child = getNodeCenter(item.roleId);
        const node = nodes.get(item.roleId);
        const parentNode = nodes.get(item.parentId!);

        let stroke = 'rgba(180,200,240,0.15)';
        let dashArray = '4 4';
        let className = '';

        if (node?.status === 'done' || parentNode?.status === 'done') {
          stroke = '#2E7D3266';
          dashArray = '';
        } else if (node?.status === 'running') {
          stroke = ROLE_COLORS[item.roleId] ?? '#FBBF24';
          dashArray = '6 4';
          className = 'wave-edge-flow';
        }

        return (
          <line
            key={`${item.parentId}-${item.roleId}`}
            x1={parent.cx} y1={parent.cy + NODE_H / 2 - 4}
            x2={child.cx} y2={child.cy - NODE_H / 2 + 4}
            stroke={stroke}
            strokeWidth={1.5}
            strokeDasharray={dashArray}
            className={className}
          />
        );
      })}

      {/* Nodes */}
      {layout.map((item) => {
        const node = nodes.get(item.roleId);
        if (!node) return null;

        const color = statusColor(node);
        const isSelected = selectedRoleId === item.roleId;
        const isCeo = item.roleId === rootId;
        const opacity = isCeo ? 0.4 : node.status === 'not-dispatched' ? 0.35 : 1;

        return (
          <g
            key={item.roleId}
            transform={`translate(${item.x}, ${item.y})`}
            style={{ cursor: isCeo ? 'default' : 'pointer', opacity }}
            onClick={() => !isCeo && onSelectNode(item.roleId)}
          >
            {/* Node rect */}
            <rect
              x={0} y={0}
              width={NODE_W} height={NODE_H}
              rx={8} ry={8}
              fill="var(--terminal-bg-deeper, #181825)"
              stroke={isSelected ? '#fff' : color}
              strokeWidth={isSelected ? 2 : 1.5}
              strokeDasharray={node.status === 'not-dispatched' ? '4 3' : ''}
            />

            {/* Status dot */}
            <circle
              cx={14} cy={NODE_H / 2}
              r={4}
              fill={color}
              filter={node.status === 'running' ? 'url(#glow)' : undefined}
            >
              {node.status === 'running' && (
                <animate attributeName="opacity" values="1;0.4;1" dur="1.5s" repeatCount="indefinite" />
              )}
            </circle>

            {/* Role ID */}
            <text
              x={26} y={NODE_H / 2 - 4}
              fill="var(--terminal-text, #fff)"
              fontSize={10}
              fontWeight={700}
              fontFamily="var(--pixel-font)"
            >
              {node.roleId.toUpperCase()}
            </text>

            {/* Status text */}
            <text
              x={26} y={NODE_H / 2 + 10}
              fill="var(--terminal-text-muted, #888)"
              fontSize={8}
              fontFamily="var(--pixel-font)"
            >
              {node.status === 'running' ? 'Working...' :
               node.status === 'done' ? 'Complete' :
               node.status === 'error' ? 'Error' :
               node.status === 'waiting' ? 'Waiting' : ''}
            </text>

            {/* Done checkmark */}
            {node.status === 'done' && (
              <text x={NODE_W - 18} y={NODE_H / 2 + 4} fontSize={14} fill="#2E7D32">&#x2713;</text>
            )}
            {/* Error X */}
            {node.status === 'error' && (
              <text x={NODE_W - 18} y={NODE_H / 2 + 4} fontSize={14} fill="#C62828">&#x2717;</text>
            )}
          </g>
        );
      })}
    </svg>
  );
}
