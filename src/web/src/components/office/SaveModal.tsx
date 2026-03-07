import { useState, useEffect, useRef } from 'react';
import type { SaveStatus, CommitInfo, SaveResult } from '../../hooks/useSave';

interface Props {
  status: SaveStatus | null;
  history: CommitInfo[];
  onClose: () => void;
  onSave: (message?: string) => Promise<SaveResult>;
  onLoadHistory: () => Promise<void>;
  onRestore: (sha: string) => Promise<void>;
  saving: boolean;
}

type Tab = 'save' | 'history';

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

export default function SaveModal({ status, history, onClose, onSave, onLoadHistory, onRestore, saving }: Props) {
  const [tab, setTab] = useState<Tab>('save');
  const [message, setMessage] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [restoring, setRestoring] = useState(false);
  const [lastResult, setLastResult] = useState<SaveResult | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (tab === 'history') onLoadHistory();
  }, [tab, onLoadHistory]);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const allFiles = [
    ...(status?.modified ?? []).map(f => ({ status: 'M', file: f })),
    ...(status?.untracked ?? []).map(f => ({ status: 'A', file: f })),
  ];

  const handleSave = async () => {
    setError(null);
    setLastResult(null);
    try {
      const result = await onSave(message || undefined);
      setLastResult(result);
      setMessage('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Save failed');
    }
  };

  const handleRestore = async (sha: string) => {
    if (!confirm(`Restore from commit ${sha.slice(0, 7)}? This creates a new commit with those files.`)) return;
    setRestoring(true);
    try {
      await onRestore(sha);
      setRestoring(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Restore failed');
      setRestoring(false);
    }
  };

  // Global Escape handler
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onClose]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) handleSave();
  };

  return (
    <>
      <div className="fixed inset-0 bg-black/40 z-[60] backdrop-blur-sm" onClick={onClose} />
      <div
        className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[520px] max-h-[80vh] z-[61] overflow-hidden flex flex-col"
        style={{
          background: 'var(--hud-bg)',
          border: '3px solid var(--pixel-border)',
          fontFamily: 'var(--pixel-font)',
          color: 'var(--terminal-text)',
        }}
        onKeyDown={handleKeyDown}
      >
        {/* Header */}
        <div className="px-5 py-3 flex items-center justify-between shrink-0" style={{ borderBottom: '2px solid var(--pixel-border)' }}>
          <div className="flex items-center gap-3">
            <span className="text-lg font-black tracking-tight">SAVE GAME</span>
            <span className="text-[10px]" style={{ color: 'var(--terminal-text-secondary)' }}>
              {status?.branch ?? ''}
            </span>
          </div>
          <button onClick={onClose} className="text-[var(--terminal-text-secondary)] hover:text-[var(--terminal-text)] cursor-pointer text-lg">&times;</button>
        </div>

        {/* Tabs */}
        <div className="flex shrink-0" style={{ borderBottom: '2px solid var(--pixel-border)' }}>
          {(['save', 'history'] as Tab[]).map(t => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className="flex-1 py-2 text-[11px] font-bold uppercase tracking-wider cursor-pointer"
              style={{
                background: tab === t ? 'var(--hud-bg-alt)' : 'transparent',
                color: tab === t ? 'var(--terminal-text)' : 'var(--terminal-text-muted)',
                borderBottom: tab === t ? '2px solid var(--accent)' : '2px solid transparent',
              }}
            >
              {t === 'save' ? 'SAVE' : 'HISTORY'}
            </button>
          ))}
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-5 space-y-4">
          {tab === 'save' && (
            <>
              {/* Status */}
              <div className="text-[11px]" style={{ color: 'var(--terminal-text-secondary)' }}>
                {allFiles.length > 0 ? (
                  <span style={{ color: 'var(--idle-amber)' }}>* {allFiles.length} unsaved change{allFiles.length > 1 ? 's' : ''}</span>
                ) : (
                  <span style={{ color: 'var(--active-green)' }}>All changes saved</span>
                )}
              </div>

              {/* Changed Files */}
              {allFiles.length > 0 && (
                <div>
                  <div className="text-[10px] font-bold uppercase tracking-wider mb-2" style={{ color: 'var(--terminal-text-muted)' }}>
                    Changed Files
                  </div>
                  <div
                    className="text-[11px] max-h-[160px] overflow-y-auto p-2 space-y-0.5"
                    style={{ background: 'var(--terminal-bg)', border: '1px solid var(--terminal-border)' }}
                  >
                    {allFiles.map(({ status: s, file }) => (
                      <div key={file} className="flex gap-2">
                        <span style={{ color: s === 'A' ? 'var(--active-green)' : 'var(--idle-amber)', width: '14px' }}>{s}</span>
                        <span style={{ color: 'var(--terminal-text-secondary)' }}>{file}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Save Message */}
              {allFiles.length > 0 && (
                <div>
                  <div className="text-[10px] font-bold uppercase tracking-wider mb-2" style={{ color: 'var(--terminal-text-muted)' }}>
                    Save Message
                  </div>
                  <input
                    ref={inputRef}
                    type="text"
                    value={message}
                    onChange={e => setMessage(e.target.value)}
                    placeholder="Optional: describe your progress..."
                    className="w-full px-3 py-2 text-[12px] outline-none"
                    style={{
                      background: 'var(--terminal-bg)',
                      border: '1px solid var(--terminal-border)',
                      color: 'var(--terminal-text)',
                      fontFamily: 'var(--pixel-font)',
                    }}
                  />
                </div>
              )}

              {/* Save Button */}
              {allFiles.length > 0 && (
                <div className="flex gap-3">
                  <button
                    onClick={handleSave}
                    disabled={saving}
                    className="flex-1 py-2.5 text-[12px] font-black uppercase tracking-wider cursor-pointer disabled:opacity-50"
                    style={{
                      background: 'var(--accent)',
                      color: '#fff',
                      border: '2px solid var(--accent)',
                    }}
                  >
                    {saving ? 'SAVING...' : (status?.hasRemote ? 'SAVE & PUSH' : 'SAVE')}
                  </button>
                </div>
              )}

              {/* No remote hint */}
              {allFiles.length > 0 && status && !status.hasRemote && (
                <div className="text-[10px]" style={{ color: 'var(--terminal-text-muted)' }}>
                  Local save only — add a git remote to enable push
                </div>
              )}

              {/* Result */}
              {lastResult && (
                <div className="text-[11px] p-2" style={{ background: 'rgba(59,185,80,0.1)', border: '1px solid var(--active-green)', color: 'var(--active-green)' }}>
                  Saved! {lastResult.filesChanged} file{lastResult.filesChanged > 1 ? 's' : ''} committed
                  {lastResult.pushed ? ' & pushed' : ''}
                  {lastResult.pushError ? ` (push error: ${lastResult.pushError})` : ''}
                </div>
              )}

              {/* Error */}
              {error && (
                <div className="text-[11px] p-2" style={{ background: 'rgba(211,47,47,0.1)', border: '1px solid #D32F2F', color: '#EF5350' }}>
                  {error}
                </div>
              )}

              {/* Last save info */}
              {status?.lastCommit && (
                <div className="text-[10px]" style={{ color: 'var(--terminal-text-muted)' }}>
                  Last save: {status.lastCommit.message} ({timeAgo(status.lastCommit.date)})
                </div>
              )}
            </>
          )}

          {tab === 'history' && (
            <>
              {history.length === 0 && (
                <div className="text-[11px] text-center py-8" style={{ color: 'var(--terminal-text-muted)' }}>
                  No save history
                </div>
              )}
              <div className="space-y-1">
                {history.map(commit => (
                  <div
                    key={commit.sha}
                    className="flex items-center justify-between py-2 px-3 group"
                    style={{ background: 'var(--hud-bg-alt)', border: '1px solid var(--terminal-border)' }}
                  >
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-[11px] font-mono" style={{ color: 'var(--accent)' }}>{commit.shortSha}</span>
                        <span className="text-[11px] truncate" style={{ color: 'var(--terminal-text)' }}>{commit.message}</span>
                      </div>
                      <div className="text-[10px]" style={{ color: 'var(--terminal-text-muted)' }}>{timeAgo(commit.date)}</div>
                    </div>
                    <button
                      onClick={() => handleRestore(commit.sha)}
                      disabled={restoring}
                      className="text-[10px] font-bold px-2 py-1 opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer"
                      style={{
                        background: 'var(--terminal-bg)',
                        border: '1px solid var(--terminal-border)',
                        color: 'var(--idle-amber)',
                      }}
                    >
                      LOAD
                    </button>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      </div>
    </>
  );
}
