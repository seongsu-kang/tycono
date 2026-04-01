import { useState } from 'react';

interface Props {
  roleId: string;
  roleName: string;
  onClose: () => void;
  onConfirm: (roleId: string) => void;
}

export default function FireRoleModal({ roleId, roleName, onClose, onConfirm }: Props) {
  const [busy, setBusy] = useState(false);

  const handleFire = async () => {
    setBusy(true);
    try {
      await onConfirm(roleId);
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <div className="fixed inset-0 bg-black/40 z-[60] backdrop-blur-sm" onClick={onClose} />
      <div className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[480px] z-[61] bg-[var(--wall)] rounded-2xl shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="p-5 text-white" style={{ background: 'linear-gradient(135deg, #B71C1C, #D32F2F)' }}>
          <div className="text-lg font-bold">Fire Role</div>
          <div className="text-sm opacity-80 mt-0.5">Remove {roleName} ({roleId})</div>
        </div>

        {/* Body */}
        <div className="p-5">
          <div className="p-4 rounded-lg border-2 border-red-300 bg-red-50 mb-4">
            <div className="text-sm font-bold text-red-800 mb-1">Warning</div>
            <div className="text-xs text-red-700 leading-relaxed">
              This will permanently delete the role directory including
              <strong> role.yaml</strong>, <strong>profile.md</strong>, <strong>SKILL.md</strong>,
              and all journal entries. This action cannot be undone.
            </div>
          </div>
          <div className="text-sm text-gray-600">
            Are you sure you want to fire <strong>{roleName}</strong>?
          </div>
        </div>

        {/* Footer */}
        <div className="flex justify-end gap-3 px-5 pb-5">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm rounded-lg border border-gray-300 hover:bg-gray-50 cursor-pointer"
          >
            Cancel
          </button>
          <button
            onClick={handleFire}
            disabled={busy}
            className="px-5 py-2 text-sm text-white rounded-lg font-semibold cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
            style={{ background: '#B71C1C' }}
          >
            {busy ? 'Removing...' : 'Confirm Fire'}
          </button>
        </div>
      </div>
    </>
  );
}
