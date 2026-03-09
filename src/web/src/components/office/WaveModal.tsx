import { useState, useRef, useEffect, useCallback } from 'react';
import OrgTreePreview from './OrgTreePreview';
import type { OrgNode } from '../../types';

interface Props {
  cLevelRoles: { id: string; name: string }[];
  orgNodes: Record<string, OrgNode>;
  rootId: string;
  onClose: () => void;
  onDispatch: (directive: string, targetRoles?: string[]) => void;
}

export default function WaveModal({ cLevelRoles, orgNodes, rootId, onClose, onDispatch }: Props) {
  const [directive, setDirective] = useState('');
  const inputRef = useRef<HTMLTextAreaElement>(null);

  // Initialize activeRoles with all roles (everything ON by default)
  const [activeRoles, setActiveRoles] = useState<Set<string>>(() => {
    const all = new Set<string>();
    const root = orgNodes[rootId];
    if (root) {
      for (const cId of root.children) {
        all.add(cId);
        const cNode = orgNodes[cId];
        if (cNode) {
          for (const subId of cNode.children) {
            all.add(subId);
          }
        }
      }
    }
    return all;
  });

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const handleToggleRole = useCallback((roleId: string, active: boolean) => {
    setActiveRoles(prev => {
      const next = new Set(prev);
      if (active) {
        next.add(roleId);
      } else {
        next.delete(roleId);
      }
      return next;
    });
  }, []);

  const activeCLevelCount = cLevelRoles.filter(r => activeRoles.has(r.id)).length;

  const handleSubmit = () => {
    if (!directive.trim() || activeCLevelCount === 0) return;
    // Count total possible roles
    const root = orgNodes[rootId];
    let totalCount = 0;
    if (root) {
      for (const cId of root.children) {
        totalCount++;
        const cNode = orgNodes[cId];
        if (cNode) totalCount += cNode.children.length;
      }
    }
    // Only pass targetRoles if not all are selected (backward compat)
    const allSelected = activeRoles.size >= totalCount;
    const targetRoles = allSelected ? undefined : Array.from(activeRoles);
    onDispatch(directive.trim(), targetRoles);
    onClose();
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
      handleSubmit();
    }
    if (e.key === 'Escape') {
      onClose();
    }
  };

  const hasOrgData = rootId && Object.keys(orgNodes).length > 0;

  return (
    <>
      <div className="fixed inset-0 bg-black/40 z-[60] backdrop-blur-sm" onClick={onClose} />
      <div className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[560px] z-[61] bg-[var(--wall)] rounded-2xl shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="p-5 text-white" style={{ background: 'linear-gradient(135deg, #B71C1C, #D32F2F)' }}>
          <div className="text-lg font-bold">CEO Wave</div>
          <div className="text-sm opacity-80 mt-0.5">
            {hasOrgData
              ? 'Select target roles and broadcast a directive'
              : 'Broadcast a directive to all C-Level reports'}
          </div>
        </div>

        {/* Body */}
        <div className="p-5 space-y-4">
          {/* Interactive Org Chart */}
          {hasOrgData && (
            <OrgTreePreview
              orgNodes={orgNodes}
              rootId={rootId}
              activeRoles={activeRoles}
              onToggleRole={handleToggleRole}
            />
          )}

          {/* Target Roles (fallback if no org data) */}
          {!hasOrgData && (
            <div>
              <label className="block text-[11px] font-bold text-[var(--desk-dark)] uppercase tracking-wider mb-2">
                Dispatching to
              </label>
              <div className="flex gap-2 flex-wrap">
                {cLevelRoles.length > 0 ? cLevelRoles.map((r) => (
                  <span
                    key={r.id}
                    className="px-3 py-1.5 text-xs font-semibold rounded-lg border-2 border-red-200 bg-red-50 text-red-800"
                  >
                    {r.id.toUpperCase()} · {r.name}
                  </span>
                )) : (
                  <span className="text-xs text-gray-400 italic">No C-Level roles found</span>
                )}
              </div>
              <div className="text-[10px] text-gray-400 mt-1">
                Each C-Level receives the directive and delegates to their reports
              </div>
            </div>
          )}

          {/* Directive */}
          <div>
            <label className="block text-[11px] font-bold text-[var(--desk-dark)] uppercase tracking-wider mb-2">
              Directive
            </label>
            <textarea
              ref={inputRef}
              value={directive}
              onChange={(e) => setDirective(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="e.g. Report current status across all departments"
              className="w-full h-28 p-3 rounded-lg border border-white/10 bg-white/5 text-sm text-white/90 placeholder-white/25 resize-none focus:outline-none focus:border-white/25 transition-colors"
            />
            <div className="text-[10px] text-gray-400 mt-1">Cmd+Enter to dispatch</div>
          </div>
        </div>

        {/* Footer */}
        <div className="flex justify-end gap-3 px-5 pb-5">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm rounded-lg border border-white/15 text-white/60 hover:bg-white/5 cursor-pointer"
          >
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            disabled={!directive.trim() || activeCLevelCount === 0}
            className="px-5 py-2 text-sm text-white rounded-lg font-semibold cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
            style={{ background: '#B71C1C' }}
          >
            Dispatch to {activeCLevelCount} Role{activeCLevelCount !== 1 ? 's' : ''}
          </button>
        </div>
      </div>
    </>
  );
}
