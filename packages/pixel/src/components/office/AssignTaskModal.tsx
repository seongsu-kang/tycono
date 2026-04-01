import { useState, useRef, useEffect } from 'react';

interface Props {
  roleId: string;
  roleName: string;
  mode?: 'assign' | 'ask';
  onClose: () => void;
  onExecutionStart: (roleId: string, task: string) => void;
}

const ROLE_COLORS: Record<string, string> = {
  cto: '#1565C0', cbo: '#E65100', pm: '#2E7D32',
  engineer: '#4A148C', designer: '#AD1457', qa: '#00695C',
};

export default function AssignTaskModal({ roleId, roleName, mode = 'assign', onClose, onExecutionStart }: Props) {
  const [task, setTask] = useState('');
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const handleSubmit = () => {
    if (!task.trim()) return;
    onExecutionStart(roleId, task.trim());
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

  const color = ROLE_COLORS[roleId] ?? '#666';

  return (
    <>
      <div className="fixed inset-0 bg-black/40 z-[60] backdrop-blur-sm" onClick={onClose} />
      <div className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[520px] z-[61] bg-[var(--wall)] rounded-2xl shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="p-5 text-white" style={{ background: `linear-gradient(135deg, ${color}, ${color}cc)` }}>
          <div className="text-lg font-bold">{mode === 'ask' ? 'Ask' : 'Assign Task'}</div>
          <div className="text-sm opacity-80 mt-0.5">{mode === 'ask' ? `to ${roleName}` : `to ${roleName} (${roleId})`}</div>
        </div>

        {/* Body */}
        <div className="p-5">
          <label className="block text-[11px] font-bold text-[var(--desk-dark)] uppercase tracking-wider mb-2">
            Task Description
          </label>
          <textarea
            ref={inputRef}
            value={task}
            onChange={(e) => setTask(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={mode === 'ask' ? 'What would you like to ask?' : 'Describe the task...'}
            className="w-full h-32 p-3 rounded-lg border border-white/10 bg-white/5 text-sm text-white/90 placeholder-white/25 resize-none focus:outline-none focus:border-white/25 transition-colors"
          />
          <div className="text-[10px] text-white/30 mt-1">Cmd+Enter to submit</div>
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
            disabled={!task.trim()}
            className="px-5 py-2 text-sm text-white rounded-lg font-semibold cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
            style={{ background: color }}
          >
            {mode === 'ask' ? 'Ask' : 'Assign'}
          </button>
        </div>
      </div>
    </>
  );
}
