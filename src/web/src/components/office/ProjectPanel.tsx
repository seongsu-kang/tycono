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
        <div className="side-panel open fixed top-0 h-full z-50 flex items-center justify-center bg-[var(--wall)] border-l-[3px] border-[var(--meeting-blue)]"
          style={{ right: panelRight, width: panelWidth }}
        >
          <div className="text-gray-400 text-sm">Loading project...</div>
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

      <div className={`side-panel open fixed top-0 h-full z-50 flex flex-col bg-[var(--wall)] border-l-[3px] border-[var(--meeting-blue)] shadow-[-4px_0_20px_rgba(0,0,0,0.2)] ${isResizing ? 'resizing' : ''}`}
        style={{ right: panelRight, width: panelWidth }}
      >
        {/* Resize handle */}
        <div
          className={`absolute top-0 -left-[5px] w-[10px] h-full cursor-col-resize z-[60] transition-colors ${isResizing ? 'bg-black/10' : 'hover:bg-black/5'}`}
          onMouseDown={handleResizeStart}
        />
        {/* Header */}
        <div className="p-5 bg-[var(--meeting-blue)] text-white relative">
          <button
            onClick={onClose}
            className="absolute top-3 right-3 w-7 h-7 rounded-full bg-white/20 text-white flex items-center justify-center text-lg hover:bg-white/30 cursor-pointer"
          >
            ×
          </button>
          <div className="text-sm opacity-70">Meeting Room</div>
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
              <div className="text-[11px] font-bold text-[var(--desk-dark)] uppercase tracking-wider mb-2">PRD</div>
              <div className="bg-white rounded-lg border border-[var(--office-border)] p-4 text-xs text-gray-600 leading-relaxed max-h-60 overflow-y-auto">
                <OfficeMarkdown content={project.prd} />
              </div>
            </div>
          )}

          {/* Tasks */}
          <div>
            <div className="text-[11px] font-bold text-[var(--desk-dark)] uppercase tracking-wider mb-2">
              Tasks ({totalTasks})
            </div>
            <div className="space-y-2">
              {project.tasks.map((task) => (
                <div key={task.id} className="bg-white rounded-lg border border-[var(--office-border)] p-3">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium text-gray-800">{task.title}</span>
                    <StatusBadge status={task.status} />
                  </div>
                  <div className="text-xs text-gray-400 mt-1">{task.role}</div>
                  {task.description && (
                    <div className="text-xs text-gray-500 mt-1.5 line-clamp-2">{task.description}</div>
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
  const styles: Record<string, string> = {
    done: 'bg-green-100 text-green-700',
    'in-progress': 'bg-blue-100 text-blue-700',
    todo: 'bg-gray-100 text-gray-500',
  };
  return (
    <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${styles[status] ?? styles.todo}`}>
      {status}
    </span>
  );
}
