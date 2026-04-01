import { useState, useCallback } from 'react';
import type { Wave, Decision } from '../../types';
import OfficeMarkdown from './OfficeMarkdown';
import { usePanelResize } from './KnowledgePanel';

interface Props {
  waves: Wave[];
  decisions: Decision[];
  mode: 'bulletin' | 'decisions';
  onClose: () => void;
  onOpenWaveCenter?: () => void;
  onUpdateDecision?: (id: string, content: string) => Promise<void>;
  onDeleteDecision?: (id: string) => Promise<void>;
  terminalWidth?: number;
  onMaximize?: () => void;
  /* legacy — kept for compat */
  standups?: unknown[];
}

export default function OperationsPanel({ waves, decisions, mode: _mode, onClose, onOpenWaveCenter, onUpdateDecision, onDeleteDecision, terminalWidth = 0, onMaximize }: Props) {
  const [tab, setTab] = useState<'decisions' | 'waves'>('decisions');

  const { panelRight, panelWidth, isResizing, handleResizeStart } = usePanelResize(terminalWidth, undefined, onMaximize);

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
        <div className="p-5 bg-[var(--desk-wood)] text-white relative">
          <div className="absolute top-3 right-3 flex items-center gap-1">
            {onMaximize && (
              <button onClick={onMaximize} className="w-7 h-7 rounded-full bg-white/20 text-white flex items-center justify-center text-sm hover:bg-white/30 cursor-pointer" title="Maximize (Pro View)">{'\u2922'}</button>
            )}
            <button onClick={onClose} className="w-7 h-7 rounded-full bg-white/20 text-white flex items-center justify-center text-lg hover:bg-white/30 cursor-pointer">×</button>
          </div>
          <div className="text-lg font-bold">
            {'\u{1F4CB}'} Decisions
          </div>
        </div>

        {/* Tabs */}
        <div className="flex" style={{ borderBottom: '1px solid var(--terminal-border)' }}>
          <TabBtn label={`Decisions (${decisions.length})`} active={tab === 'decisions'} onClick={() => setTab('decisions')} />
          {onOpenWaveCenter ? (
            <TabBtn label={`Waves \u2192`} active={false} onClick={onOpenWaveCenter} />
          ) : (
            <TabBtn label={`Waves (${waves.length})`} active={tab === 'waves'} onClick={() => setTab('waves')} />
          )}
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-5">
          {tab === 'decisions' && (decisions.length > 0 ? decisions.map((d) => (
            <DecisionCard
              key={d.id}
              decision={d}
              onSave={onUpdateDecision}
              onDelete={onDeleteDecision}
            />
          )) : (
            <div className="text-center py-10 text-sm" style={{ color: 'var(--terminal-text-muted)' }}>No decisions yet</div>
          ))}
          {tab === 'waves' && waves.map((w, i) => (
            <ContentCard key={i} title={`Wave ${w.id}`} subtitle={w.startedAt} content={w.directive} />
          ))}
        </div>
      </div>
    </>
  );
}

function DecisionCard({ decision, onSave, onDelete }: {
  decision: Decision;
  onSave?: (id: string, content: string) => Promise<void>;
  onDelete?: (id: string) => Promise<void>;
}) {
  const [expanded, setExpanded] = useState(false);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(decision.content);
  const [saving, setSaving] = useState(false);
  const preview = stripMarkdown(decision.content).slice(0, 160);
  const hasMore = decision.content.length > 100;

  const handleSave = useCallback(async () => {
    if (!onSave || draft === decision.content) { setEditing(false); return; }
    setSaving(true);
    try {
      await onSave(decision.id, draft);
      setEditing(false);
    } finally {
      setSaving(false);
    }
  }, [onSave, draft, decision.id, decision.content]);

  const handleDelete = useCallback(async () => {
    if (!onDelete) return;
    setSaving(true);
    try {
      await onDelete(decision.id);
    } finally {
      setSaving(false);
    }
  }, [onDelete, decision.id]);

  return (
    <div className="mb-3 rounded-lg overflow-hidden" style={{ background: 'var(--hud-bg-alt)', border: '1px solid var(--terminal-border)' }}>
      <div
        className="p-3 cursor-pointer hover:bg-white/5"
        onClick={() => { if (!editing) setExpanded(!expanded); }}
      >
        <div className="flex items-center justify-between">
          <div className="font-medium text-sm" style={{ color: 'var(--terminal-text)' }}>#{decision.id} {decision.title}</div>
          <div className="flex items-center gap-1.5 shrink-0 ml-2">
            {expanded && !editing && onSave && (
              <button
                onClick={(e) => { e.stopPropagation(); setDraft(decision.content); setEditing(true); }}
                className="text-[10px] px-2 py-0.5 rounded hover:bg-white/10 transition-colors"
                style={{ color: 'var(--terminal-text-muted)', border: '1px solid var(--terminal-border)' }}
              >Edit</button>
            )}
            <span className="text-xs" style={{ color: 'var(--terminal-text-muted)' }}>{expanded ? '\u25B2' : '\u25BC'}</span>
          </div>
        </div>
        {decision.date && <div className="text-xs mt-0.5" style={{ color: 'var(--terminal-text-muted)' }}>{decision.date}</div>}
      </div>

      {expanded && editing ? (
        <div className="px-3 pb-3 pt-2" style={{ borderTop: '1px solid var(--terminal-border)' }}>
          <textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            className="w-full rounded-lg p-3 text-xs leading-relaxed resize-none font-mono terminal-scrollbar focus:outline-none"
            style={{
              background: 'var(--terminal-inline-bg)',
              border: '1px solid var(--terminal-border)',
              color: 'var(--terminal-text)',
              minHeight: 200,
            }}
            rows={12}
          />
          <div className="flex items-center justify-between mt-2">
            <div>
              {onDelete && (
                <button
                  onClick={handleDelete}
                  disabled={saving}
                  className="text-[10px] px-2 py-1 rounded hover:bg-red-900/30 transition-colors disabled:opacity-40"
                  style={{ color: '#EF4444', border: '1px solid #EF444440' }}
                >Delete</button>
              )}
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => setEditing(false)}
                disabled={saving}
                className="text-[10px] px-3 py-1 rounded hover:bg-white/5 transition-colors disabled:opacity-40"
                style={{ color: 'var(--terminal-text-muted)', border: '1px solid var(--terminal-border)' }}
              >Cancel</button>
              <button
                onClick={handleSave}
                disabled={saving || draft === decision.content}
                className="text-[10px] px-3 py-1 rounded font-semibold transition-colors disabled:opacity-40"
                style={{ background: 'var(--desk-wood)', color: '#fff' }}
              >{saving ? 'Saving...' : 'Save'}</button>
            </div>
          </div>
        </div>
      ) : expanded ? (
        <div className="px-3 pb-3 text-xs leading-relaxed pt-2" style={{ borderTop: '1px solid var(--terminal-border)', color: 'var(--terminal-text-secondary)' }}>
          <OfficeMarkdown content={decision.content} />
        </div>
      ) : null}

      {!expanded && hasMore && (
        <div className="px-3 pb-2 text-xs line-clamp-2 leading-relaxed" style={{ color: 'var(--terminal-text-muted)' }}>{preview}</div>
      )}
    </div>
  );
}

function TabBtn({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="px-4 py-2.5 text-sm font-medium cursor-pointer"
      style={{
        color: active ? 'var(--accent)' : 'var(--terminal-text-muted)',
        borderBottom: active ? '2px solid var(--accent)' : '2px solid transparent',
      }}
    >
      {label}
    </button>
  );
}

function stripMarkdown(text: string): string {
  return text
    .replace(/^#{1,6}\s+/gm, '')
    .replace(/\*\*([^*]+)\*\*/g, '$1')
    .replace(/\*([^*]+)\*/g, '$1')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/```[\s\S]*?```/g, '')
    .replace(/^\s*[-*+]\s+/gm, '\u2022 ')
    .replace(/^\s*\d+\.\s+/gm, '')
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    .replace(/^>\s+/gm, '')
    .replace(/^---+$/gm, '')
    .replace(/\|[^|]*\|/g, '')
    .replace(/\n{2,}/g, ' \u00B7 ')
    .replace(/\n/g, ' ')
    .trim();
}

function ContentCard({ title, subtitle, content }: { title: string; subtitle?: string; content: string }) {
  const [expanded, setExpanded] = useState(false);
  const hasMore = content.length > 100;
  const preview = stripMarkdown(content).slice(0, 160);

  return (
    <div className="mb-3 rounded-lg overflow-hidden" style={{ background: 'var(--hud-bg-alt)', border: '1px solid var(--terminal-border)' }}>
      <div
        className="p-3 cursor-pointer hover:bg-white/5"
        onClick={() => setExpanded(!expanded)}
      >
        <div className="flex items-center justify-between">
          <div className="font-medium text-sm" style={{ color: 'var(--terminal-text)' }}>{title}</div>
          <span className="text-xs shrink-0 ml-2" style={{ color: 'var(--terminal-text-muted)' }}>{expanded ? '\u25B2' : '\u25BC'}</span>
        </div>
        {subtitle && <div className="text-xs mt-0.5" style={{ color: 'var(--terminal-text-muted)' }}>{subtitle}</div>}
      </div>
      {expanded && (
        <div className="px-3 pb-3 text-xs leading-relaxed pt-2" style={{ borderTop: '1px solid var(--terminal-border)', color: 'var(--terminal-text-secondary)' }}>
          <OfficeMarkdown content={content} />
        </div>
      )}
      {!expanded && hasMore && (
        <div className="px-3 pb-2 text-xs line-clamp-2 leading-relaxed" style={{ color: 'var(--terminal-text-muted)' }}>{preview}</div>
      )}
    </div>
  );
}
