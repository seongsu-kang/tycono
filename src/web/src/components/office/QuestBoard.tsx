import { QUESTS, CHAPTERS, getQuestStatus, getChapterProgress } from '../../utils/quests';
import type { QuestProgress } from '../../utils/quests';

interface Props {
  progress: QuestProgress;
  onQuestAction?: (questId: string) => void;
}

export default function QuestBoard({ progress, onQuestAction }: Props) {
  const { completed, total } = getChapterProgress(progress);
  const pct = total > 0 ? Math.round((completed / total) * 100) : 0;

  return (
    <div className="flex flex-col gap-3">
      {/* Header */}
      <div className="flex items-center gap-2 px-1">
        <span className="text-base">🐾</span>
        <span className="text-sm font-medium" style={{ color: 'var(--terminal-text)' }}>Pupu's Quest Board</span>
      </div>

      {/* Progress bar */}
      <div className="px-1">
        <div className="flex items-center justify-between text-xs mb-1.5" style={{ color: 'var(--terminal-text-muted)' }}>
          <span>Progress</span>
          <span>{completed}/{total} quests · {pct}%</span>
        </div>
        <div className="h-2 rounded-full overflow-hidden" style={{ background: 'var(--terminal-border)' }}>
          <div
            className="h-full rounded-full transition-all duration-500"
            style={{ width: `${pct}%`, background: 'var(--accent)' }}
          />
        </div>
      </div>

      {/* Chapters */}
      {CHAPTERS.map(ch => {
        const quests = QUESTS.filter(q => ch.questIds.includes(q.id));
        const allDone = quests.every(q => progress.completedQuests.includes(q.id));
        const isActive = ch.num === progress.activeChapter;
        const isLocked = ch.num > progress.activeChapter;

        return (
          <div key={ch.num} className="rounded-lg overflow-hidden" style={{
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
  );
}
