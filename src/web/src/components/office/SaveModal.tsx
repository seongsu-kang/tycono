import { useState, useEffect, useRef, useCallback } from 'react';
import { api } from '../../api/client';
import type { SaveStatus, CommitInfo, SaveResult, SyncInfo, PullResult, RepoType } from '../../hooks/useSave';

/** Generate a commit message from changed file paths */
function generateCommitMessage(files: Array<{ status: string; file: string }>): string {
  if (files.length === 0) return '';

  // Group by top-level folder
  const groups: Record<string, string[]> = {};
  for (const { file } of files) {
    const parts = file.split('/');
    const group = parts[0] === '.' ? parts[1] ?? 'root' : parts[0];
    (groups[group] ??= []).push(file);
  }

  // Map folder to human-readable category
  const categoryMap: Record<string, string> = {
    roles: 'roles',
    projects: 'projects',
    operations: 'operations',
    knowledge: 'knowledge',
    architecture: 'architecture',
    company: 'company',
    '.tycono': 'config',
    '.claude': 'skills',
  };

  const parts: string[] = [];
  for (const [group, groupFiles] of Object.entries(groups)) {
    const cat = categoryMap[group] ?? group;
    if (groupFiles.length === 1) {
      const fname = groupFiles[0].split('/').pop() ?? groupFiles[0];
      parts.push(`${cat}/${fname}`);
    } else {
      parts.push(`${cat} (${groupFiles.length} files)`);
    }
  }

  // Determine prefix based on file types
  const hasNew = files.some(f => f.status === 'A');
  const hasModified = files.some(f => f.status === 'M');
  const prefix = hasNew && !hasModified ? 'add' : hasNew ? 'update' : 'update';

  return `${prefix}: ${parts.join(', ')}`;
}

interface Props {
  status: SaveStatus | null;
  history: CommitInfo[];
  onClose: () => void;
  onSave: (message?: string) => Promise<SaveResult>;
  onLoadHistory: () => Promise<void>;
  onRestore: (sha: string) => Promise<void>;
  saving: boolean;
  onDelegate?: (filesSummary: string) => void;
  delegateRoleName?: string;
  // Sync
  repo: RepoType;
  onRepoChange: (r: RepoType) => void;
  syncInfo: SyncInfo | null;
  onPull: () => Promise<PullResult>;
  pulling: boolean;
  onRefresh?: () => void;
  onInitGit?: () => Promise<void>;
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

/** No Git sub-component — shown when git is not initialized or not installed */
function NoGitSection({ onInitGit, onDelegate, delegateRoleName }: {
  onInitGit: () => Promise<void>;
  onDelegate?: () => void;
  delegateRoleName?: string;
}) {
  const [initing, setIniting] = useState(false);
  const [result, setResult] = useState<{ ok: boolean; message: string } | null>(null);

  const handleInit = async () => {
    setIniting(true);
    setResult(null);
    try {
      await onInitGit();
      setResult({ ok: true, message: 'Git repository initialized!' });
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed';
      // Check if it's a "git not installed" error
      if (msg.includes('not installed') || msg.includes('noGitBinary')) {
        setResult({ ok: false, message: 'git is not installed on this system' });
      } else {
        setResult({ ok: false, message: msg });
      }
    } finally {
      setIniting(false);
    }
  };

  const isGitMissing = result && !result.ok && result.message.includes('not installed');

  return (
    <div className="p-3 space-y-2" style={{ background: 'rgba(211,47,47,0.05)', border: '1px solid var(--pixel-border)' }}>
      <div className="text-[10px] font-bold uppercase tracking-wider" style={{ color: 'var(--terminal-text-muted)' }}>
        No Git Repository
      </div>

      {!result && (
        <>
          <div className="text-[10px]" style={{ color: 'var(--terminal-text-secondary)' }}>
            This project has no git repository. Initialize one to start saving.
          </div>
          <div className="flex gap-2 flex-wrap">
            <button
              onClick={handleInit}
              disabled={initing}
              className="text-[10px] font-bold px-3 py-1.5 cursor-pointer disabled:opacity-50"
              style={{ background: 'var(--accent)', color: '#fff', border: 'none' }}
            >
              {initing ? 'INITIALIZING...' : 'GIT INIT'}
            </button>
            {onDelegate && (
              <button
                onClick={onDelegate}
                className="text-[10px] font-bold px-3 py-1.5 cursor-pointer"
                style={{ background: 'var(--terminal-bg)', color: 'var(--idle-amber)', border: '1px solid var(--idle-amber)' }}
              >
                {'\uD83E\uDD16'} {delegateRoleName?.toUpperCase() ?? 'AI'} FIX
              </button>
            )}
          </div>
        </>
      )}

      {result && result.ok && (
        <div className="text-[10px] p-1.5" style={{ background: 'rgba(59,185,80,0.1)', border: '1px solid var(--active-green)', color: 'var(--active-green)' }}>
          {result.message}
        </div>
      )}

      {isGitMissing && (
        <div className="space-y-2">
          <div className="text-[10px]" style={{ color: '#EF5350' }}>
            git is not installed on this system.
          </div>
          <div className="text-[10px] space-y-1" style={{ color: 'var(--terminal-text-muted)' }}>
            <div><b>macOS:</b> xcode-select --install</div>
            <div><b>Ubuntu/Debian:</b> sudo apt install git</div>
            <div><b>Windows:</b>{' '}
              <a href="https://git-scm.com/downloads" target="_blank" rel="noopener noreferrer"
                style={{ color: 'var(--accent)', textDecoration: 'underline' }}>git-scm.com/downloads</a>
            </div>
          </div>
          <div className="flex gap-2 flex-wrap">
            <button
              onClick={() => { setResult(null); }}
              className="text-[10px] font-bold px-3 py-1 cursor-pointer"
              style={{ background: 'var(--accent)', color: '#fff', border: 'none' }}
            >
              RETRY
            </button>
            {onDelegate && (
              <button
                onClick={onDelegate}
                className="text-[10px] font-bold px-3 py-1 cursor-pointer"
                style={{ background: 'var(--terminal-bg)', color: 'var(--idle-amber)', border: '1px solid var(--idle-amber)' }}
              >
                {'\uD83E\uDD16'} {delegateRoleName?.toUpperCase() ?? 'AI'} FIX
              </button>
            )}
          </div>
        </div>
      )}

      {result && !result.ok && !isGitMissing && (
        <div className="text-[10px] p-1.5" style={{ background: 'rgba(211,47,47,0.1)', border: '1px solid #D32F2F', color: '#EF5350' }}>
          {result.message}
        </div>
      )}
    </div>
  );
}

/** GitHub Connect sub-component — shown when no remote is configured */
function GitHubConnect({ repo, onConnected, onDelegate, delegateRoleName }: {
  repo: RepoType;
  onConnected: () => void;
  onDelegate?: () => void;
  delegateRoleName?: string;
}) {
  const [state, setState] = useState<'idle' | 'checking' | 'ready' | 'creating' | 'manual'>('idle');
  const [ghStatus, setGhStatus] = useState<{
    ghInstalled: boolean; authenticated: boolean; username?: string; hasRemote: boolean;
  } | null>(null);
  const [repoName, setRepoName] = useState('');
  const [visibility, setVisibility] = useState<'private' | 'public'>('private');
  const [manualUrl, setManualUrl] = useState('');
  const [result, setResult] = useState<{ ok: boolean; message: string } | null>(null);
  const [busy, setBusy] = useState(false);

  const checkGitHub = async () => {
    setState('checking');
    setResult(null);
    try {
      const s = await api.getGithubStatus(repo);
      setGhStatus(s);
      if (s.hasRemote) {
        onConnected();
      } else if (s.ghInstalled && s.authenticated) {
        setState('ready');
      } else {
        setState('idle');
      }
    } catch {
      setState('idle');
    }
  };

  const createRepo = async () => {
    if (!repoName.trim()) return;
    setBusy(true);
    setResult(null);
    try {
      const r = await api.githubCreateRepo(repoName.trim(), visibility, repo);
      setResult(r);
      if (r.ok) {
        setTimeout(onConnected, 1500);
      }
    } catch (err) {
      setResult({ ok: false, message: err instanceof Error ? err.message : 'Failed' });
    } finally {
      setBusy(false);
    }
  };

  const addManualRemote = async () => {
    if (!manualUrl.trim()) return;
    setBusy(true);
    setResult(null);
    try {
      const r = await api.addRemote(manualUrl.trim(), repo);
      setResult(r);
      if (r.ok) {
        setTimeout(onConnected, 1500);
      }
    } catch (err) {
      setResult({ ok: false, message: err instanceof Error ? err.message : 'Failed' });
    } finally {
      setBusy(false);
    }
  };

  /** Delegate button — appears in all non-ready states */
  const delegateBtn = onDelegate ? (
    <button
      onClick={onDelegate}
      className="text-[10px] font-bold px-3 py-1.5 cursor-pointer"
      style={{ background: 'var(--terminal-bg)', color: 'var(--idle-amber)', border: '1px solid var(--idle-amber)' }}
      title={`Ask ${delegateRoleName ?? 'AI'} to set up GitHub remote`}
    >
      {'\uD83E\uDD16'} {delegateRoleName?.toUpperCase() ?? 'AI'} FIX
    </button>
  ) : null;

  return (
    <div className="p-3 space-y-2" style={{ background: 'rgba(100,100,255,0.05)', border: '1px solid var(--pixel-border)' }}>
      <div className="text-[10px] font-bold uppercase tracking-wider" style={{ color: 'var(--terminal-text-muted)' }}>
        No Remote — Local Only
      </div>

      {state === 'idle' && !ghStatus && (
        <div className="flex gap-2 flex-wrap">
          <button
            onClick={checkGitHub}
            className="text-[10px] font-bold px-3 py-1.5 cursor-pointer"
            style={{ background: 'var(--accent)', color: '#fff', border: 'none' }}
          >
            CONNECT GITHUB
          </button>
          <button
            onClick={() => setState('manual')}
            className="text-[10px] font-bold px-3 py-1.5 cursor-pointer"
            style={{ background: 'var(--terminal-bg)', color: 'var(--terminal-text)', border: '1px solid var(--terminal-border)' }}
          >
            ADD REMOTE URL
          </button>
          {delegateBtn}
        </div>
      )}

      {state === 'checking' && (
        <div className="text-[10px]" style={{ color: 'var(--terminal-text-secondary)' }}>Checking GitHub CLI...</div>
      )}

      {state === 'idle' && ghStatus && !ghStatus.ghInstalled && (
        <div className="space-y-2">
          <div className="text-[10px]" style={{ color: 'var(--idle-amber)' }}>
            GitHub CLI (gh) not installed.
          </div>
          <div className="text-[10px] space-y-0.5" style={{ color: 'var(--terminal-text-muted)' }}>
            <div>
              Install:{' '}
              <a href="https://cli.github.com" target="_blank" rel="noopener noreferrer"
                style={{ color: 'var(--accent)', textDecoration: 'underline' }}>cli.github.com</a>
            </div>
            <div style={{ fontFamily: 'var(--pixel-font)' }}>brew install gh && gh auth login</div>
          </div>
          <div className="flex gap-2 flex-wrap">
            <button
              onClick={checkGitHub}
              className="text-[10px] font-bold px-3 py-1 cursor-pointer"
              style={{ background: 'var(--accent)', color: '#fff', border: 'none' }}
            >
              RETRY
            </button>
            <button
              onClick={() => setState('manual')}
              className="text-[10px] font-bold px-3 py-1 cursor-pointer"
              style={{ background: 'var(--terminal-bg)', color: 'var(--terminal-text)', border: '1px solid var(--terminal-border)' }}
            >
              ADD URL MANUALLY
            </button>
            {delegateBtn}
          </div>
        </div>
      )}

      {state === 'idle' && ghStatus && ghStatus.ghInstalled && !ghStatus.authenticated && (
        <div className="space-y-2">
          <div className="text-[10px]" style={{ color: 'var(--idle-amber)' }}>
            GitHub CLI installed but not logged in.
          </div>
          <div className="text-[10px]" style={{ color: 'var(--terminal-text-muted)', fontFamily: 'var(--pixel-font)' }}>
            Run in terminal: gh auth login
          </div>
          <div className="flex gap-2 flex-wrap">
            <button
              onClick={checkGitHub}
              className="text-[10px] font-bold px-3 py-1 cursor-pointer"
              style={{ background: 'var(--accent)', color: '#fff', border: 'none' }}
            >
              RETRY
            </button>
            <button
              onClick={() => setState('manual')}
              className="text-[10px] font-bold px-3 py-1 cursor-pointer"
              style={{ background: 'var(--terminal-bg)', color: 'var(--terminal-text)', border: '1px solid var(--terminal-border)' }}
            >
              ADD REMOTE URL
            </button>
            {delegateBtn}
          </div>
        </div>
      )}

      {state === 'ready' && ghStatus && (
        <div className="space-y-2">
          <div className="text-[10px]" style={{ color: 'var(--active-green)' }}>
            Logged in as {ghStatus.username || 'GitHub user'}
          </div>
          <div className="flex gap-2 items-center">
            <input
              type="text"
              value={repoName}
              onChange={e => setRepoName(e.target.value)}
              placeholder="repository-name"
              className="flex-1 px-2 py-1.5 text-[11px] outline-none"
              style={{ background: 'var(--terminal-bg)', border: '1px solid var(--terminal-border)', color: 'var(--terminal-text)', fontFamily: 'var(--pixel-font)' }}
            />
            <select
              value={visibility}
              onChange={e => setVisibility(e.target.value as 'private' | 'public')}
              className="px-2 py-1.5 text-[10px] outline-none cursor-pointer"
              style={{ background: 'var(--terminal-bg)', border: '1px solid var(--terminal-border)', color: 'var(--terminal-text)', fontFamily: 'var(--pixel-font)' }}
            >
              <option value="private">Private</option>
              <option value="public">Public</option>
            </select>
          </div>
          <div className="flex gap-2">
            <button
              onClick={createRepo}
              disabled={busy || !repoName.trim()}
              className="text-[10px] font-bold px-3 py-1.5 cursor-pointer disabled:opacity-50"
              style={{ background: 'var(--accent)', color: '#fff', border: 'none' }}
            >
              {busy ? 'CREATING...' : 'CREATE & PUSH'}
            </button>
            <button
              onClick={() => setState('manual')}
              className="text-[10px] px-2 py-1 cursor-pointer"
              style={{ background: 'transparent', color: 'var(--terminal-text-muted)', border: '1px solid var(--terminal-border)' }}
            >
              USE URL INSTEAD
            </button>
          </div>
        </div>
      )}

      {state === 'manual' && (
        <div className="space-y-2">
          <div className="text-[10px]" style={{ color: 'var(--terminal-text-muted)' }}>
            <a href="https://github.com/new" target="_blank" rel="noopener noreferrer"
              style={{ color: 'var(--accent)', textDecoration: 'underline' }}>Create a new repo on GitHub</a>
            {' '}then paste the URL below:
          </div>
          <input
            type="text"
            value={manualUrl}
            onChange={e => setManualUrl(e.target.value)}
            placeholder="https://github.com/username/repo-name.git"
            className="w-full px-2 py-1.5 text-[11px] outline-none"
            style={{ background: 'var(--terminal-bg)', border: '1px solid var(--terminal-border)', color: 'var(--terminal-text)', fontFamily: 'var(--pixel-font)' }}
          />
          <div className="flex gap-2">
            <button
              onClick={addManualRemote}
              disabled={busy || !manualUrl.trim()}
              className="text-[10px] font-bold px-3 py-1.5 cursor-pointer disabled:opacity-50"
              style={{ background: 'var(--accent)', color: '#fff', border: 'none' }}
            >
              {busy ? 'ADDING...' : 'ADD REMOTE & PUSH'}
            </button>
            <button
              onClick={() => { setState('idle'); setGhStatus(null); }}
              className="text-[10px] px-2 py-1 cursor-pointer"
              style={{ background: 'transparent', color: 'var(--terminal-text-muted)', border: '1px solid var(--terminal-border)' }}
            >
              BACK
            </button>
          </div>
        </div>
      )}

      {result && (
        <div className="text-[10px] p-1.5" style={{
          background: result.ok ? 'rgba(59,185,80,0.1)' : 'rgba(211,47,47,0.1)',
          border: `1px solid ${result.ok ? 'var(--active-green)' : '#D32F2F'}`,
          color: result.ok ? 'var(--active-green)' : '#EF5350',
        }}>
          {result.message}
        </div>
      )}
    </div>
  );
}

export default function SaveModal({
  status, history, onClose, onSave, onLoadHistory, onRestore, saving,
  onDelegate, delegateRoleName,
  repo, onRepoChange, syncInfo, onPull, pulling, onRefresh, onInitGit,
}: Props) {
  const [tab, setTab] = useState<Tab>('save');
  const [message, setMessage] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [restoring, setRestoring] = useState(false);
  const [lastResult, setLastResult] = useState<SaveResult | null>(null);
  const [pullResult, setPullResult] = useState<PullResult | null>(null);
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

  // Auto-generate commit message on mount
  const autoGenerated = useRef(false);
  useEffect(() => {
    if (!autoGenerated.current && allFiles.length > 0 && !message) {
      setMessage(generateCommitMessage(allFiles));
      autoGenerated.current = true;
    }
  }, [allFiles.length]); // eslint-disable-line react-hooks/exhaustive-deps

  // Reset auto-gen when repo changes
  useEffect(() => {
    autoGenerated.current = false;
    setMessage('');
    setPullResult(null);
    setLastResult(null);
    setError(null);
  }, [repo]);

  const handleRegenerate = useCallback(() => {
    setMessage(generateCommitMessage(allFiles));
  }, [allFiles]);

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

  const handlePull = async () => {
    setPullResult(null);
    setError(null);
    try {
      const result = await onPull();
      setPullResult(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Pull failed');
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
            <span className="text-lg font-black tracking-tight">SAVE COMPANY</span>
            <span className="text-[10px]" style={{ color: 'var(--terminal-text-secondary)' }}>
              {status?.branch ?? ''}
            </span>
          </div>
          <div className="flex items-center gap-2">
            {/* Sync indicator */}
            {syncInfo && syncInfo.hasRemote && (syncInfo.behind > 0 || syncInfo.ahead > 0) && (
              <span className="text-[10px] font-bold" style={{ color: syncInfo.behind > 0 ? 'var(--idle-amber)' : 'var(--active-green)' }}>
                {syncInfo.behind > 0 && `\u2193${syncInfo.behind}`}
                {syncInfo.behind > 0 && syncInfo.ahead > 0 && ' '}
                {syncInfo.ahead > 0 && `\u2191${syncInfo.ahead}`}
              </span>
            )}
            <button onClick={onClose} className="text-[var(--terminal-text-secondary)] hover:text-[var(--terminal-text)] cursor-pointer text-lg">&times;</button>
          </div>
        </div>

        {/* Repo Toggle */}
        <div className="flex shrink-0" style={{ borderBottom: '2px solid var(--pixel-border)' }}>
          {(['akb', 'code'] as RepoType[]).map(r => (
            <button
              key={r}
              onClick={() => onRepoChange(r)}
              className="flex-1 py-1.5 text-[10px] font-bold uppercase tracking-wider cursor-pointer"
              style={{
                background: repo === r ? 'var(--hud-bg-alt)' : 'transparent',
                color: repo === r ? 'var(--terminal-text)' : 'var(--terminal-text-muted)',
                borderBottom: repo === r ? '2px solid var(--accent)' : '2px solid transparent',
              }}
            >
              {r === 'akb' ? 'AKB' : 'CODE'}
            </button>
          ))}
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
              {/* No Git — install or init */}
              {status?.noGit && (
                <NoGitSection
                  onInitGit={async () => {
                    await onInitGit?.();
                    onRefresh?.();
                  }}
                  onDelegate={onDelegate ? () => {
                    onDelegate(`Git is not initialized or not installed for this project. Please check if git is installed (run "git --version"). If git is available, initialize the repository with "git init" and make an initial commit. If git is not installed, provide clear instructions for the user's OS to install it.`);
                  } : undefined}
                  delegateRoleName={delegateRoleName}
                />
              )}

              {/* Pull Section */}
              {syncInfo && syncInfo.hasRemote && syncInfo.behind > 0 && (
                <div className="flex items-center justify-between p-2" style={{ background: 'rgba(255,180,0,0.08)', border: '1px solid var(--idle-amber)' }}>
                  <span className="text-[11px]" style={{ color: 'var(--idle-amber)' }}>
                    {syncInfo.behind} commit{syncInfo.behind > 1 ? 's' : ''} behind remote
                  </span>
                  <button
                    onClick={handlePull}
                    disabled={pulling}
                    className="text-[10px] font-bold px-3 py-1 cursor-pointer"
                    style={{
                      background: 'var(--idle-amber)',
                      color: '#000',
                      border: 'none',
                      opacity: pulling ? 0.5 : 1,
                    }}
                  >
                    {pulling ? 'PULLING...' : '\u2193 PULL'}
                  </button>
                </div>
              )}

              {/* Pull result */}
              {pullResult && (
                <div className="text-[11px] p-2" style={{
                  background: pullResult.status === 'ok' ? 'rgba(59,185,80,0.1)' : pullResult.status === 'up-to-date' ? 'rgba(59,185,80,0.1)' : 'rgba(211,47,47,0.1)',
                  border: `1px solid ${pullResult.status === 'ok' || pullResult.status === 'up-to-date' ? 'var(--active-green)' : '#D32F2F'}`,
                  color: pullResult.status === 'ok' || pullResult.status === 'up-to-date' ? 'var(--active-green)' : '#EF5350',
                }}>
                  {pullResult.message}
                </div>
              )}

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
                  <div className="flex items-center justify-between mb-2">
                    <div className="text-[10px] font-bold uppercase tracking-wider" style={{ color: 'var(--terminal-text-muted)' }}>
                      Save Message
                    </div>
                    <button
                      onClick={handleRegenerate}
                      className="text-[9px] px-1.5 py-0.5 cursor-pointer"
                      style={{
                        background: 'var(--terminal-bg)',
                        border: '1px solid var(--terminal-border)',
                        color: 'var(--accent)',
                        fontFamily: 'var(--pixel-font)',
                      }}
                      title="Auto-generate message from changes"
                    >
                      {'\u2728'} AUTO
                    </button>
                  </div>
                  <input
                    ref={inputRef}
                    type="text"
                    value={message}
                    onChange={e => setMessage(e.target.value)}
                    placeholder="Auto-generated — edit if needed"
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

              {/* Save Buttons */}
              {allFiles.length > 0 && (
                <div className="flex gap-2">
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
                  {onDelegate && (
                    <button
                      onClick={() => {
                        const summary = allFiles.map(f => `${f.status} ${f.file}`).join('\n');
                        onDelegate(summary);
                      }}
                      disabled={saving}
                      className="py-2.5 px-4 text-[11px] font-bold uppercase tracking-wider cursor-pointer disabled:opacity-50"
                      style={{
                        background: 'var(--terminal-bg)',
                        color: 'var(--terminal-text)',
                        border: '2px solid var(--pixel-border)',
                      }}
                      title={`Delegate to ${delegateRoleName ?? 'AI role'} — they'll review, commit, push & merge`}
                    >
                      {'\uD83E\uDD16'} {delegateRoleName?.toUpperCase() ?? 'DELEGATE'}
                    </button>
                  )}
                </div>
              )}

              {/* No remote — GitHub connect */}
              {status && !status.hasRemote && !status.noGit && (
                <GitHubConnect
                  repo={repo}
                  onConnected={() => onRefresh?.()}
                  onDelegate={onDelegate ? () => {
                    const repoLabel = repo === 'akb' ? 'AKB' : 'Code';
                    onDelegate(`Set up a GitHub remote for the ${repoLabel} repository and push all commits. If gh CLI is available, use "gh repo create". Otherwise, guide through manual setup. Current repo path can be found in config.`);
                  } : undefined}
                  delegateRoleName={delegateRoleName}
                />
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
