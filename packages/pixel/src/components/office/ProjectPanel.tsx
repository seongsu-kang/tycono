import { useState, useEffect } from 'react';
import { api } from '../../api/client';
import type { ProjectDetail } from '../../types';
import OfficeMarkdown from './OfficeMarkdown';
import { usePanelResize } from './KnowledgePanel';

interface Props {
  projectId: string;
  onClose: () => void;
  terminalWidth?: number;
}

export default function ProjectPanel({ projectId, onClose, terminalWidth = 0 }: Props) {
  const [project, setProject] = useState<ProjectDetail | null>(null);

  const { panelRight, panelWidth, isResizing, handleResizeStart } = usePanelResize(terminalWidth);

  useEffect(() => {
    api.getProject(projectId).then(setProject).catch(console.error);
  }, [projectId]);

  if (!project) {
    return (
      <>
        <div className="dimmer fixed top-0 left-0 bottom-0 bg-black/30 z-40 open" style={{ right: panelRight }} onClick={onClose} />
        <div className="side-panel open fixed top-0 h-full z-50 flex items-center justify-center border-l-[3px] border-[var(--meeting-blue)]"
          style={{ right: panelRight, width: panelWidth, background: 'var(--terminal-bg)' }}
        >
          <div className="text-sm" style={{ color: 'var(--terminal-text-muted)' }}>Loading project...</div>
        </div>
      </>
    );
  }

  const doneTasks = project.tasks.filter((t) => t.status === 'done').length;
  const totalTasks = project.tasks.length;
  const progress = totalTasks > 0 ? Math.round((doneTasks / totalTasks) * 100) : 0;

  return (
    <>
      <div className="dimmer fixed top-0 left-0 bottom-0 bg-black/30 z-40 open" style={{ right: panelRight }} onClick={onClose} />

      <div className={`side-panel open fixed top-0 h-full z-50 flex flex-col border-l-[3px] border-[var(--meeting-blue)] shadow-[-4px_0_20px_rgba(0,0,0,0.4)] ${isResizing ? 'resizing' : ''}`}
        style={{ right: panelRight, width: panelWidth, background: 'var(--terminal-bg)' }}
      >
        {/* Resize handle */}
        <div
          className={`absolute top-0 -left-[5px] w-[10px] h-full cursor-col-resize z-[60] transition-colors ${isResizing ? 'bg-white/10' : 'hover:bg-white/5'}`}
          onMouseDown={handleResizeStart}
        />
        {/* Header */}
        <div className="p-5 bg-[var(--meeting-blue)] text-white relative">
          <div className="text-sm opacity-70">Meeting Room</div>
          <button
            onClick={onClose}
            className="absolute top-3 right-3 z-10 w-7 h-7 rounded-full bg-white/20 text-white flex items-center justify-center text-lg hover:bg-white/30 cursor-pointer"
          >
            ×
          </button>
          <div className="text-xl font-bold mt-1">{project.name}</div>
          <div className="flex items-center gap-3 mt-3 text-sm">
            <span>Tasks: {totalTasks}</span>
            <span>Done: {doneTasks}</span>
            <span>Progress: {progress}%</span>
          </div>
          {/* Progress bar */}
          <div className="mt-2 h-1.5 bg-white/20 rounded-full overflow-hidden">
            <div className="h-full bg-white rounded-full transition-all" style={{ width: `${progress}%` }} />
          </div>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-5">
          {/* PRD */}
          {project.prd && (
            <div className="mb-5">
              <div className="text-[11px] font-bold uppercase tracking-wider mb-2" style={{ color: 'var(--terminal-text-muted)' }}>PRD</div>
              <div className="rounded-lg p-4 text-xs leading-relaxed max-h-60 overflow-y-auto" style={{ background: 'var(--hud-bg-alt)', border: '1px solid var(--terminal-border)', color: 'var(--terminal-text-secondary)' }}>
                <OfficeMarkdown content={project.prd} />
              </div>
            </div>
          )}

          {/* Tasks */}
          <div>
            <div className="text-[11px] font-bold uppercase tracking-wider mb-2" style={{ color: 'var(--terminal-text-muted)' }}>
              Tasks ({totalTasks})
            </div>
            <div className="space-y-2">
              {project.tasks.map((task) => (
                <div key={task.id} className="rounded-lg p-3" style={{ background: 'var(--hud-bg-alt)', border: '1px solid var(--terminal-border)' }}>
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium" style={{ color: 'var(--terminal-text)' }}>{task.title}</span>
                    <StatusBadge status={task.status} />
                  </div>
                  <div className="text-xs mt-1" style={{ color: 'var(--terminal-text-muted)' }}>{task.role}</div>
                  {task.description && (
                    <div className="text-xs mt-1.5 line-clamp-2" style={{ color: 'var(--terminal-text-secondary)' }}>{task.description}</div>
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </>
  );
}

function StatusBadge({ status }: { status: string }) {
  const styles: Record<string, { bg: string; color: string }> = {
    done: { bg: 'rgba(34,197,94,0.15)', color: '#4ade80' },
    'in-progress': { bg: 'rgba(59,130,246,0.15)', color: '#60a5fa' },
    todo: { bg: 'rgba(148,163,184,0.15)', color: 'var(--terminal-text-muted)' },
  };
  const s = styles[status] ?? styles.todo;
  return (
    <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full" style={{ background: s.bg, color: s.color }}>
      {status}
    </span>
  );
}
