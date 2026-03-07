import type { OrgNode } from '../../types';

const ROLE_COLORS: Record<string, string> = {
  cto: '#1565C0', cbo: '#E65100', pm: '#2E7D32',
  engineer: '#4A148C', designer: '#AD1457', qa: '#00695C',
  'data-analyst': '#0277BD',
};

interface Props {
  orgNodes: Record<string, OrgNode>;
  rootId: string;
}

export default function OrgTreePreview({ orgNodes, rootId }: Props) {
  const root = orgNodes[rootId];
  if (!root) return null;

  const cLevelIds = root.children;
  const cLevelNodes = cLevelIds.map(id => orgNodes[id]).filter(Boolean);

  // Gather all sub-roles under c-level
  const subRoles: Array<{ node: OrgNode; parentId: string }> = [];
  for (const cl of cLevelNodes) {
    for (const childId of cl.children) {
      const child = orgNodes[childId];
      if (child) subRoles.push({ node: child, parentId: cl.id });
    }
  }

  const totalRoles = cLevelNodes.length + subRoles.length;

  return (
    <div>
      <label className="block text-[11px] font-bold text-[var(--desk-dark)] uppercase tracking-wider mb-2">
        Propagation Preview
      </label>
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
          {cLevelNodes.map((node) => (
            <div key={node.id} className="flex flex-col items-center">
              <span
                className="px-2.5 py-1 text-[10px] font-bold rounded border-2 uppercase"
                style={{
                  borderColor: ROLE_COLORS[node.id] ?? '#888',
                  color: ROLE_COLORS[node.id] ?? '#888',
                  background: `${ROLE_COLORS[node.id] ?? '#888'}22`,
                }}
              >
                {node.id}
              </span>
              <span className="text-[8px] text-white/30 mt-0.5">direct</span>
            </div>
          ))}
        </div>

        {/* Sub-roles */}
        {subRoles.length > 0 && (
          <>
            <div className="flex justify-center mb-1">
              <div className="w-px h-2 bg-white/10" />
            </div>
            <div className="flex justify-center gap-2 flex-wrap">
              {subRoles.map(({ node }) => (
                <span
                  key={node.id}
                  className="px-2 py-0.5 text-[9px] font-semibold rounded border border-white/15 text-white/40 uppercase"
                >
                  {node.id}
                </span>
              ))}
            </div>
            <div className="text-center text-[8px] text-white/30 mt-1">via re-dispatch</div>
          </>
        )}
      </div>
      <div className="text-[10px] text-gray-400 mt-1.5">
        {totalRoles} role{totalRoles !== 1 ? 's' : ''} will receive this wave
      </div>
    </div>
  );
}
