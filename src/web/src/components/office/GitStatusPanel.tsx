import { useState, useEffect, useCallback } from 'react';
import { api } from '../../api/client';
import type { GitStatus, WorktreeInfo } from '../../types';

interface GitStatusPanelProps {
  onClose: () => void;
}

export default function GitStatusPanel({ onClose }: GitStatusPanelProps) {
  const [status, setStatus] = useState<GitStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [removing, setRemoving] = useState<string | null>(null);

  const fetchStatus = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await api.getGitStatus();
      setStatus(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load git status');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchStatus();
  }, [fetchStatus]);

  const handleRemoveWorktree = async (wt: WorktreeInfo) => {
    setRemoving(wt.path);
    try {
      await api.deleteWorktree(wt.path);
      await fetchStatus();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to remove worktree');
    } finally {
      setRemoving(null);
    }
  };

  const handleDeleteBranch = async (branch: string) => {
    setRemoving(branch);
    try {
      await api.deleteBranch(branch);
      await fetchStatus();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete branch');
    } finally {
      setRemoving(null);
    }
  };

  if (loading && !status) {
    return (
      <div style={{ padding: 24, color: 'rgba(255,255,255,0.6)' }}>Loading git status...</div>
    );
  }

  if (error && !status) {
    return (
      <div style={{ padding: 24, color: '#ff6b6b' }}>
        {error}
        <button onClick={onClose} style={{ marginLeft: 12, color: 'rgba(255,255,255,0.6)', background: 'none', border: 'none', cursor: 'pointer' }}>Close</button>
      </div>
    );
  }

  if (!status) return null;

  const activeWorktrees = status.worktrees.filter(w => w.status === 'active');
  const pendingMerge = status.worktrees.filter(w => w.status === 'pending-merge');
  const staleWorktrees = status.worktrees.filter(w => w.status === 'stale');

  function parseRoleFromBranch(branch: string): string | null {
    // Try patterns: job/{id} -> look at roleId, feat/{role}-xxx, etc.
    const parts = branch.split('/');
    if (parts.length > 1) {
      const segment = parts[parts.length - 1];
      const knownRoles = ['cto', 'cbo', 'pm', 'engineer', 'designer', 'qa', 'data-analyst'];
      for (const role of knownRoles) {
        if (segment.toLowerCase().includes(role)) return role;
      }
    }
    return null;
  }

  function truncatePath(path: string, maxLen = 40): string {
    if (path.length <= maxLen) return path;
    return '...' + path.slice(path.length - maxLen + 3);
  }

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

  return (
    <div style={{ padding: 20, color: 'rgba(255,255,255,0.9)', maxHeight: '100%', overflowY: 'auto' }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <h3 style={{ margin: 0, fontSize: 16, fontWeight: 600 }}>GIT STATUS</h3>
        <div style={{ display: 'flex', gap: 8 }}>
          <button
            onClick={fetchStatus}
            disabled={loading}
            style={{
              background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.1)',
              color: 'rgba(255,255,255,0.7)', borderRadius: 6, padding: '4px 10px', fontSize: 12,
              cursor: loading ? 'wait' : 'pointer',
            }}
          >
            {loading ? 'Checking...' : 'Refresh'}
          </button>
          <button
            onClick={onClose}
            style={{ background: 'none', border: 'none', color: 'rgba(255,255,255,0.5)', cursor: 'pointer', fontSize: 18 }}
          >{'\u00D7'}</button>
        </div>
      </div>

      {error && (
        <div style={{ padding: '8px 12px', background: 'rgba(255,100,100,0.1)', borderRadius: 6, color: '#ff6b6b', fontSize: 12, marginBottom: 12 }}>
          {error}
        </div>
      )}

      {/* Branch + Last Commit Summary */}
      <div style={{
        padding: '10px 14px', background: 'rgba(255,255,255,0.04)', borderRadius: 8,
        border: '1px solid rgba(255,255,255,0.06)', marginBottom: 16, fontSize: 13,
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <span style={{ color: 'rgba(255,255,255,0.5)' }}>Branch: </span>
            <span style={{ fontWeight: 500 }}>{status.currentBranch}</span>
          </div>
          <div>
            {status.unsavedCount > 0 && (
              <span style={{ color: '#FFB74D', fontSize: 12 }}>
                {status.unsavedCount} unsaved
              </span>
            )}
          </div>
        </div>
        {status.lastCommit && (
          <div style={{ marginTop: 6, fontSize: 11, color: 'rgba(255,255,255,0.4)' }}>
            Last commit: {status.lastCommit.message.slice(0, 60)}
            {status.lastCommit.message.length > 60 ? '...' : ''}
            {' \u00B7 '}{timeAgo(status.lastCommit.date)}
          </div>
        )}
      </div>

      {/* Active Worktrees */}
      {activeWorktrees.length > 0 && (
        <>
          <SectionHeader label="Active Worktrees" count={activeWorktrees.length} />
          {activeWorktrees.map(wt => (
            <WorktreeRow
              key={wt.path}
              wt={wt}
              roleFromBranch={wt.roleId || parseRoleFromBranch(wt.branch)}
              truncatePath={truncatePath}
              timeAgo={timeAgo}
              removing={removing === wt.path}
              onRemove={() => handleRemoveWorktree(wt)}
              statusColor="#4FC3F7"
              statusIcon={'\uD83D\uDCC2'}
            />
          ))}
        </>
      )}

      {/* Pending Merge */}
      {pendingMerge.length > 0 && (
        <>
          <SectionHeader label="Pending Merge" count={pendingMerge.length} />
          {pendingMerge.map(wt => (
            <WorktreeRow
              key={wt.path}
              wt={wt}
              roleFromBranch={wt.roleId || parseRoleFromBranch(wt.branch)}
              truncatePath={truncatePath}
              timeAgo={timeAgo}
              removing={removing === wt.path}
              onRemove={() => handleRemoveWorktree(wt)}
              statusColor="#FFB74D"
              statusIcon={'\u26A0\uFE0F'}
            />
          ))}
        </>
      )}

      {/* Stale Worktrees */}
      {staleWorktrees.length > 0 && (
        <>
          <SectionHeader label="Stale" count={staleWorktrees.length} />
          {staleWorktrees.map(wt => (
            <WorktreeRow
              key={wt.path}
              wt={wt}
              roleFromBranch={wt.roleId || parseRoleFromBranch(wt.branch)}
              truncatePath={truncatePath}
              timeAgo={timeAgo}
              removing={removing === wt.path}
              onRemove={() => handleRemoveWorktree(wt)}
              statusColor="#ff6b6b"
              statusIcon={'\uD83D\uDD34'}
            />
          ))}
        </>
      )}

      {/* Stale/Unmerged Branches */}
      {status.staleBranches.length > 0 && (
        <>
          <SectionHeader label="Unmerged Branches" count={status.staleBranches.length} />
          {status.staleBranches.map(branch => (
            <div key={branch} style={{
              marginBottom: 8, padding: '10px 14px', background: 'rgba(255,255,255,0.03)',
              borderRadius: 8, border: '1px solid rgba(255,255,255,0.06)',
              display: 'flex', justifyContent: 'space-between', alignItems: 'center',
            }}>
              <div style={{ fontSize: 13 }}>
                <span style={{ color: 'rgba(255,255,255,0.5)', marginRight: 6 }}>{'\u26A0\uFE0F'}</span>
                <span style={{ fontWeight: 500 }}>{branch}</span>
              </div>
              <button
                onClick={() => handleDeleteBranch(branch)}
                disabled={removing === branch}
                style={{
                  background: 'rgba(255,100,100,0.15)', border: '1px solid rgba(255,100,100,0.2)',
                  color: '#ff6b6b', borderRadius: 4, padding: '3px 8px', fontSize: 10,
                  cursor: removing === branch ? 'wait' : 'pointer',
                  opacity: removing === branch ? 0.6 : 1,
                  fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.5,
                }}
              >
                {removing === branch ? '...' : 'DELETE'}
              </button>
            </div>
          ))}
        </>
      )}

      {/* Empty state */}
      {activeWorktrees.length === 0 && pendingMerge.length === 0 && staleWorktrees.length === 0 && status.staleBranches.length === 0 && (
        <div style={{ color: 'rgba(255,255,255,0.4)', fontSize: 13, padding: '20px 0', textAlign: 'center' }}>
          {'\u2713'} All clean. No active worktrees or stale branches.
        </div>
      )}

      {/* Last Merge */}
      {status.lastMerge && (
        <div style={{ marginTop: 16, fontSize: 11, color: 'rgba(255,255,255,0.3)', lineHeight: 1.5 }}>
          Last merge: <span style={{ color: 'rgba(255,255,255,0.5)' }}>{status.lastMerge.branch}</span>
          {' \u00B7 '}{status.lastMerge.roleId}
          {' \u00B7 '}{timeAgo(status.lastMerge.mergedAt)}
        </div>
      )}
    </div>
  );
}

function SectionHeader({ label, count }: { label: string; count: number }) {
  return (
    <h4 style={{
      margin: '16px 0 8px', fontSize: 11, fontWeight: 600,
      color: 'rgba(255,255,255,0.5)', textTransform: 'uppercase', letterSpacing: 1,
    }}>
      {label} ({count})
    </h4>
  );
}

interface WorktreeRowProps {
  wt: WorktreeInfo;
  roleFromBranch: string | null;
  truncatePath: (p: string, max?: number) => string;
  timeAgo: (d: string) => string;
  removing: boolean;
  onRemove: () => void;
  statusColor: string;
  statusIcon: string;
}

function WorktreeRow({ wt, roleFromBranch, truncatePath, timeAgo, removing, onRemove, statusColor, statusIcon }: WorktreeRowProps) {
  return (
    <div style={{
      marginBottom: 8, padding: '10px 14px', background: 'rgba(255,255,255,0.03)',
      borderRadius: 8, border: '1px solid rgba(255,255,255,0.06)',
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 13, fontWeight: 500, marginBottom: 2 }}>
            <span style={{ marginRight: 6 }}>{statusIcon}</span>
            {wt.branch}
            {roleFromBranch && (
              <span style={{
                marginLeft: 8, fontSize: 10, padding: '1px 6px',
                background: 'rgba(255,255,255,0.08)', borderRadius: 3,
                color: 'rgba(255,255,255,0.6)', textTransform: 'uppercase',
              }}>
                {roleFromBranch}
              </span>
            )}
          </div>
          {wt.task && (
            <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.5)', marginBottom: 2 }}>
              "{wt.task.slice(0, 50)}{wt.task.length > 50 ? '...' : ''}"
            </div>
          )}
          <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.35)' }}>
            {truncatePath(wt.path)}
            {' \u00B7 '}{wt.filesChanged} file{wt.filesChanged !== 1 ? 's' : ''} changed
            {' \u00B7 '}{timeAgo(wt.createdAt)}
          </div>
          {wt.conflictFiles && wt.conflictFiles.length > 0 && (
            <div style={{ fontSize: 10, color: '#ff6b6b', marginTop: 4 }}>
              {'\u26D4'} CONFLICT: {wt.conflictFiles.join(', ')}
            </div>
          )}
        </div>
        <button
          onClick={onRemove}
          disabled={removing}
          style={{
            background: 'rgba(255,100,100,0.15)', border: '1px solid rgba(255,100,100,0.2)',
            color: statusColor, borderRadius: 4, padding: '3px 8px', fontSize: 10,
            cursor: removing ? 'wait' : 'pointer',
            opacity: removing ? 0.6 : 1,
            fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.5,
            flexShrink: 0, marginLeft: 8,
          }}
        >
          {removing ? '...' : 'REMOVE'}
        </button>
      </div>
    </div>
  );
}
