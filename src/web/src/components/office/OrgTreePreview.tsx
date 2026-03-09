import { useCallback } from 'react';
import type { OrgNode } from '../../types';

const ROLE_COLORS: Record<string, string> = {
  cto: '#1565C0', cbo: '#E65100', pm: '#2E7D32',
  engineer: '#4A148C', designer: '#AD1457', qa: '#00695C',
  'data-analyst': '#0277BD',
};

interface Props {
  orgNodes: Record<string, OrgNode>;
  rootId: string;
  /** If provided, enables interactive toggle mode */
  activeRoles?: Set<string>;
  onToggleRole?: (roleId: string, active: boolean) => void;
}

export default function OrgTreePreview({ orgNodes, rootId, activeRoles, onToggleRole }: Props) {
  const root = orgNodes[rootId];
  if (!root) return null;

  const interactive = !!activeRoles && !!onToggleRole;

  const cLevelIds = root.children;
  const cLevelNodes = cLevelIds.map(id => orgNodes[id]).filter(Boolean);

  // Gather all sub-roles under c-level
  const subRolesByParent = new Map<string, OrgNode[]>();
  const allSubRoles: OrgNode[] = [];
  for (const cl of cLevelNodes) {
    const children: OrgNode[] = [];
    for (const childId of cl.children) {
      const child = orgNodes[childId];
      if (child) {
        children.push(child);
        allSubRoles.push(child);
      }
    }
    subRolesByParent.set(cl.id, children);
  }

  const isActive = (id: string) => !activeRoles || activeRoles.has(id);

  const activeCount = interactive
    ? cLevelNodes.filter(n => activeRoles.has(n.id)).length +
      allSubRoles.filter(n => activeRoles.has(n.id)).length
    : cLevelNodes.length + allSubRoles.length;

  const totalRoles = cLevelNodes.length + allSubRoles.length;

  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <label className="block text-[11px] font-bold text-[var(--desk-dark)] uppercase tracking-wider">
          {interactive ? 'Select Target Roles' : 'Propagation Preview'}
        </label>
        {interactive && (
          <span className="text-[10px] text-white/50">
            {activeCount}/{totalRoles} selected
          </span>
        )}
      </div>
      <div className="bg-white/5 border border-white/10 rounded-lg p-4">
        {/* CEO */}
        <div className="flex justify-center mb-2">
          <span className="px-3 py-1 text-[10px] font-bold rounded border-2 border-white/20 bg-white/5 text-white/30 uppercase">
            CEO
          </span>
        </div>

        {/* Lines from CEO to C-Level */}
        {cLevelNodes.length > 0 && (
          <div className="flex justify-center mb-1">
            <div className="w-px h-3 bg-white/15" />
          </div>
        )}

        {/* Horizontal connector */}
        {cLevelNodes.length > 1 && (
          <div className="flex justify-center mb-1">
            <div
              className="h-px bg-white/15"
              style={{ width: `${Math.min(cLevelNodes.length * 80, 320)}px` }}
            />
          </div>
        )}

        {/* C-Level row */}
        <div className="flex justify-center gap-3 mb-2 flex-wrap">
          {cLevelNodes.map((node) => {
            const active = isActive(node.id);
            const color = ROLE_COLORS[node.id] ?? '#888';
            return (
              <CLevelNode
                key={node.id}
                node={node}
                active={active}
                color={color}
                interactive={interactive}
                onToggle={onToggleRole}
                subRoles={subRolesByParent.get(node.id) ?? []}
                activeRoles={activeRoles}
              />
            );
          })}
        </div>

        {/* Sub-roles */}
        {allSubRoles.length > 0 && (
          <>
            <div className="flex justify-center mb-1">
              <div className="w-px h-2 bg-white/10" />
            </div>
            <div className="flex justify-center gap-2 flex-wrap">
              {allSubRoles.map((node) => {
                const active = isActive(node.id);
                // Find parent C-level
                const parentId = cLevelNodes.find(cl => cl.children.includes(node.id))?.id;
                const parentActive = parentId ? isActive(parentId) : true;
                const canToggle = interactive && parentActive;
                return (
                  <span
                    key={node.id}
                    className={`px-2 py-0.5 text-[9px] font-semibold rounded border uppercase transition-all ${
                      canToggle ? 'cursor-pointer select-none' : interactive ? 'cursor-not-allowed' : ''
                    } ${
                      active && parentActive
                        ? 'border-white/15 text-white/40'
                        : 'border-white/5 text-white/15 opacity-50'
                    }`}
                    onClick={canToggle ? () => onToggleRole!(node.id, !active) : undefined}
                    title={interactive
                      ? (parentActive
                        ? (active ? 'Click to exclude' : 'Click to include')
                        : `Enable ${parentId?.toUpperCase()} first`)
                      : undefined}
                  >
                    {node.id}
                  </span>
                );
              })}
            </div>
            <div className="text-center text-[8px] text-white/30 mt-1">via re-dispatch</div>
          </>
        )}
      </div>
      <div className="text-[10px] text-gray-400 mt-1.5">
        {interactive
          ? `${activeCount} role${activeCount !== 1 ? 's' : ''} will receive this wave`
          : `${totalRoles} role${totalRoles !== 1 ? 's' : ''} will receive this wave`}
      </div>
    </div>
  );
}

/* ─── C-Level Node with toggle ─── */

function CLevelNode({
  node,
  active,
  color,
  interactive,
  onToggle,
  subRoles,
  activeRoles,
}: {
  node: OrgNode;
  active: boolean;
  color: string;
  interactive: boolean;
  onToggle?: (roleId: string, active: boolean) => void;
  subRoles: OrgNode[];
  activeRoles?: Set<string>;
}) {
  const handleClick = useCallback((e: React.MouseEvent) => {
    if (!interactive || !onToggle) return;
    if (active) {
      // Cascade OFF: turning off a parent disables all children
      onToggle(node.id, false);
      for (const sub of subRoles) {
        if (activeRoles?.has(sub.id)) {
          onToggle(sub.id, false);
        }
      }
    } else {
      // ON: node only by default, Shift+click enables entire subtree
      onToggle(node.id, true);
      if (e.shiftKey) {
        for (const sub of subRoles) {
          if (!activeRoles?.has(sub.id)) {
            onToggle(sub.id, true);
          }
        }
      }
    }
  }, [interactive, onToggle, active, node.id, subRoles, activeRoles]);

  return (
    <div className="flex flex-col items-center">
      <span
        className={`px-2.5 py-1 text-[10px] font-bold rounded border-2 uppercase transition-all ${
          interactive ? 'cursor-pointer select-none hover:scale-105' : ''
        }`}
        style={{
          borderColor: active ? color : `${color}44`,
          color: active ? color : `${color}44`,
          background: active ? `${color}22` : 'transparent',
          opacity: active ? 1 : 0.4,
        }}
        onClick={handleClick}
        title={interactive ? (active ? 'Click to exclude (disables subordinates)' : 'Click to include / Shift+click to include with all subordinates') : undefined}
      >
        {node.id}
      </span>
      <span className="text-[8px] text-white/30 mt-0.5">
        {interactive ? (active ? 'active' : 'off') : 'direct'}
      </span>
    </div>
  );
}
