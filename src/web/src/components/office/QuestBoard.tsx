import { QUESTS, CHAPTERS, getQuestStatus, getChapterProgress } from '../../utils/quests';
import type { QuestProgress } from '../../utils/quests';
import { usePanelResize } from './KnowledgePanel';

interface Props {
  progress: QuestProgress;
  onQuestAction?: (questId: string) => void;
  onClose: () => void;
  terminalWidth?: number;
}

export default function QuestBoard({ progress, onQuestAction, onClose, terminalWidth = 0 }: Props) {
  const { completed, total } = getChapterProgress(progress);
  const pct = total > 0 ? Math.round((completed / total) * 100) : 0;
  const { panelRight, panelWidth, isResizing, handleResizeStart } = usePanelResize(terminalWidth);

  return (
    <>
      <div className="dimmer fixed top-0 left-0 bottom-0 bg-black/30 z-40 open" style={{ right: panelRight }} onClick={onClose} />

      <div className={`side-panel open fixed top-0 h-full z-50 flex flex-col border-l-[3px] shadow-[-4px_0_20px_rgba(0,0,0,0.4)] ${isResizing ? 'resizing' : ''}`}
        style={{ right: panelRight, width: panelWidth, background: 'var(--terminal-bg)', borderLeftColor: 'var(--desk-wood)' }}
      >
        {/* Resize handle */}
        <div
          className={`absolute top-0 -left-[5px] w-[10px] h-full cursor-col-resize z-[60] transition-colors ${isResizing ? 'bg-white/10' : 'hover:bg-white/5'}`}
          onMouseDown={handleResizeStart}
        />

        {/* Header */}
        <div className="p-5 text-white relative" style={{ background: 'linear-gradient(135deg, #8B5E3C, #6B4226)' }}>
          <button
            onClick={onClose}
            className="absolute top-3 right-3 w-7 h-7 rounded-full bg-white/20 text-white flex items-center justify-center text-lg hover:bg-white/30 cursor-pointer"
          >
            ×
          </button>
          <div className="flex items-center gap-2">
            <span className="text-xl">🐾</span>
            <div>
              <div className="text-lg font-bold">Pupu's Quest Board</div>
              <div className="text-xs opacity-70 mt-0.5">{completed}/{total} quests completed · {pct}%</div>
            </div>
          </div>
          {/* Progress bar */}
          <div className="mt-3">
            <div className="h-2 rounded-full overflow-hidden bg-white/15">
              <div
                className="h-full rounded-full transition-all duration-500"
                style={{ width: `${pct}%`, background: '#F4D03F' }}
              />
            </div>
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-5 flex flex-col gap-3">
          {CHAPTERS.map(ch => {
            const quests = QUESTS.filter(q => ch.questIds.includes(q.id));
            const allDone = quests.every(q => progress.completedQuests.includes(q.id));
            const isActive = ch.num === progress.activeChapter;
            const isLocked = ch.num > progress.activeChapter;

            return (
              <div key={ch.num} className="rounded-lg" style={{
                background: isActive ? 'var(--hud-bg-alt)' : 'transparent',
                border: isActive ? '1px solid var(--accent)' : '1px solid var(--terminal-border)',
                opacity: isLocked ? 0.4 : 1,
              }}>
                {/* Chapter header */}
                <div className="px-3 py-2 flex items-center gap-2">
                  <span className="text-sm">
                    {allDone ? '✅' : isLocked ? '🔒' : '🟡'}
                  </span>
                  <span className="text-sm font-medium" style={{ color: isActive ? 'var(--accent)' : 'var(--terminal-text)' }}>
                    Chapter {ch.num}: {ch.title}
                  </span>
                  {isActive && (
                    <span className="ml-auto text-[10px] px-1.5 py-0.5 rounded" style={{ background: 'var(--accent)', color: '#000' }}>
                      ACTIVE
                    </span>
                  )}
                </div>

                {/* Quests */}
                {!isLocked && (
                  <div className="px-3 pb-2 flex flex-col gap-1.5">
                    {quests.map(q => {
                      const status = getQuestStatus(q, progress);
                      return (
                        <div key={q.id} className="flex items-start gap-2 pl-2">
                          <span className="text-xs mt-0.5 shrink-0">
                            {status === 'completed' ? '☑' : status === 'active' ? '☐' : '·'}
                          </span>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2">
                              <span className="text-xs" style={{
                                color: status === 'completed' ? 'var(--terminal-text-muted)' : 'var(--terminal-text)',
                                textDecoration: status === 'completed' ? 'line-through' : 'none',
                              }}>
                                {q.title}
                              </span>
                              {status === 'active' && q.hint && onQuestAction && (
                                <button
                                  onClick={() => onQuestAction(q.id)}
                                  className="shrink-0 text-[10px] px-2 py-0.5 rounded cursor-pointer hover:brightness-125 transition-all"
                                  style={{ background: 'var(--accent)', color: '#000', fontWeight: 600 }}
                                >
                                  GO →
                                </button>
                              )}
                            </div>
                            {status === 'active' && q.hint && (
                              <div className="text-[10px] mt-0.5" style={{ color: 'var(--accent)' }}>
                                💡 {q.hint.message}
                              </div>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </>
  );
}
