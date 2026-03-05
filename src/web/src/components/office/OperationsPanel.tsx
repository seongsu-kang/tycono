import { useState } from 'react';
import type { Standup, Wave, Decision } from '../../types';
import OfficeMarkdown from './OfficeMarkdown';
import { usePanelResize } from './KnowledgePanel';

interface Props {
  standups: Standup[];
  waves: Wave[];
  decisions: Decision[];
  mode: 'bulletin' | 'decisions';
  onClose: () => void;
  terminalWidth?: number;
}

export default function OperationsPanel({ standups, waves, decisions, mode, onClose, terminalWidth = 0 }: Props) {
  const [tab, setTab] = useState<'standups' | 'waves' | 'decisions'>(
    mode === 'decisions' ? 'decisions' : 'standups'
  );

  const { panelRight, panelWidth, isResizing, handleResizeStart } = usePanelResize(terminalWidth);

  return (
    <>
      <div className="dimmer fixed top-0 left-0 bottom-0 bg-black/30 z-40 open" style={{ right: panelRight }} onClick={onClose} />

      <div className={`side-panel open fixed top-0 h-full z-50 flex flex-col bg-[var(--wall)] border-l-[3px] border-[var(--desk-wood)] shadow-[-4px_0_20px_rgba(0,0,0,0.2)] ${isResizing ? 'resizing' : ''}`}
        style={{ right: panelRight, width: panelWidth }}
      >
        {/* Resize handle */}
        <div
          className={`absolute top-0 -left-[5px] w-[10px] h-full cursor-col-resize z-[60] transition-colors ${isResizing ? 'bg-black/10' : 'hover:bg-black/5'}`}
          onMouseDown={handleResizeStart}
        />
        {/* Header */}
        <div className="p-5 bg-[var(--desk-wood)] text-white relative">
          <button
            onClick={onClose}
            className="absolute top-3 right-3 w-7 h-7 rounded-full bg-white/20 text-white flex items-center justify-center text-lg hover:bg-white/30 cursor-pointer"
          >
            ×
          </button>
          <div className="text-lg font-bold">
            {mode === 'bulletin' ? '\u{1F4CC} Bulletin Board' : '\u{1F4DC} Decision Log'}
          </div>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-[var(--office-border)]">
          {mode === 'bulletin' ? (
            <>
              <TabBtn label={`Standups (${standups.length})`} active={tab === 'standups'} onClick={() => setTab('standups')} />
              <TabBtn label={`Waves (${waves.length})`} active={tab === 'waves'} onClick={() => setTab('waves')} />
            </>
          ) : (
            <TabBtn label={`Decisions (${decisions.length})`} active={tab === 'decisions'} onClick={() => setTab('decisions')} />
          )}
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-5">
          {tab === 'standups' && standups.map((s, i) => (
            <ContentCard key={i} title={`Standup ${s.date}`} content={s.content} />
          ))}
          {tab === 'waves' && waves.map((w, i) => (
            <ContentCard key={i} title={`Wave ${w.id}`} subtitle={w.timestamp} content={w.content} />
          ))}
          {tab === 'decisions' && decisions.map((d, i) => (
            <ContentCard key={i} title={`#${d.id} ${d.title}`} subtitle={d.date} content={d.content} />
          ))}
        </div>
      </div>
    </>
  );
}

function TabBtn({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className={`px-4 py-2.5 text-sm font-medium cursor-pointer ${
        active
          ? 'text-[var(--desk-wood)] border-b-2 border-[var(--desk-wood)]'
          : 'text-gray-400 hover:text-gray-600'
      }`}
    >
      {label}
    </button>
  );
}

function stripMarkdown(text: string): string {
  return text
    .replace(/^#{1,6}\s+/gm, '')     // headings
    .replace(/\*\*([^*]+)\*\*/g, '$1') // bold
    .replace(/\*([^*]+)\*/g, '$1')     // italic
    .replace(/`([^`]+)`/g, '$1')       // inline code
    .replace(/```[\s\S]*?```/g, '')    // code blocks
    .replace(/^\s*[-*+]\s+/gm, '• ')  // list markers
    .replace(/^\s*\d+\.\s+/gm, '')    // numbered list
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1') // links
    .replace(/^>\s+/gm, '')           // blockquote
    .replace(/^---+$/gm, '')          // hr
    .replace(/\|[^|]*\|/g, '')        // table rows
    .replace(/\n{2,}/g, ' · ')        // collapse newlines
    .replace(/\n/g, ' ')
    .trim();
}

function ContentCard({ title, subtitle, content }: { title: string; subtitle?: string; content: string }) {
  const [expanded, setExpanded] = useState(false);
  const hasMore = content.length > 100;
  const preview = stripMarkdown(content).slice(0, 160);

  return (
    <div className="mb-3 bg-white rounded-lg border border-[var(--office-border)] overflow-hidden">
      <div
        className="p-3 cursor-pointer hover:bg-gray-50"
        onClick={() => setExpanded(!expanded)}
      >
        <div className="flex items-center justify-between">
          <div className="font-medium text-sm text-gray-800">{title}</div>
          <span className="text-gray-300 text-xs shrink-0 ml-2">{expanded ? '▲' : '▼'}</span>
        </div>
        {subtitle && <div className="text-xs text-gray-400 mt-0.5">{subtitle}</div>}
      </div>
      {expanded && (
        <div className="px-3 pb-3 text-xs text-gray-600 leading-relaxed border-t border-[var(--office-border)] pt-2">
          <OfficeMarkdown content={content} />
        </div>
      )}
      {!expanded && hasMore && (
        <div className="px-3 pb-2 text-xs text-gray-400 line-clamp-2 leading-relaxed">{preview}</div>
      )}
    </div>
  );
}
