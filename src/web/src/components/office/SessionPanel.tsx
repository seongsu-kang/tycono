import { useState, useEffect, useCallback } from 'react';
import { api } from '../../api/client';
import type { ActiveSession, ActiveSessionsResponse } from '../../types';

interface SessionPanelProps {
  onClose: () => void;
}

export default function SessionPanel({ onClose }: SessionPanelProps) {
  const [data, setData] = useState<ActiveSessionsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [removing, setRemoving] = useState<string | null>(null);

  const fetchSessions = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await api.getActiveSessions();
      setData(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load sessions');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchSessions();
    // Auto-refresh every 10s
    const interval = setInterval(fetchSessions, 10000);
    return () => clearInterval(interval);
  }, [fetchSessions]);

  const handleRemove = async (sessionId: string) => {
    setRemoving(sessionId);
    try {
      await api.deleteActiveSession(sessionId);
      await fetchSessions();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to remove session');
    } finally {
      setRemoving(null);
    }
  };

  const handleCleanup = async () => {
    try {
      await api.cleanupActiveSessions();
      await fetchSessions();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to cleanup sessions');
    }
  };

  if (loading && !data) {
    return (
      <div style={{ padding: 24, color: 'rgba(255,255,255,0.6)' }}>Loading sessions...</div>
    );
  }

  if (error && !data) {
    return (
      <div style={{ padding: 24, color: '#ff6b6b' }}>
        {error}
        <button onClick={onClose} style={{ marginLeft: 12, color: 'rgba(255,255,255,0.6)', background: 'none', border: 'none', cursor: 'pointer' }}>Close</button>
      </div>
    );
  }

  if (!data) return null;

  const activeSessions = data.sessions.filter(s => s.status === 'active');
  const idleSessions = data.sessions.filter(s => s.status === 'idle');
  const deadSessions = data.sessions.filter(s => s.status === 'dead');

  return (
    <div style={{ padding: 20, color: 'rgba(255,255,255,0.9)', maxHeight: '100%', overflowY: 'auto' }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <h3 style={{ margin: 0, fontSize: 16, fontWeight: 600 }}>ACTIVE SESSIONS</h3>
        <div style={{ display: 'flex', gap: 8 }}>
          {deadSessions.length > 0 && (
            <button
              onClick={handleCleanup}
              style={{
                background: 'rgba(255,180,100,0.15)', border: '1px solid rgba(255,180,100,0.2)',
                color: '#FFB74D', borderRadius: 6, padding: '4px 10px', fontSize: 12,
                cursor: 'pointer',
              }}
            >
              Cleanup Dead
            </button>
          )}
          <button
            onClick={fetchSessions}
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

      {/* Summary */}
      <div style={{
        padding: '10px 14px', background: 'rgba(255,255,255,0.04)', borderRadius: 8,
        border: '1px solid rgba(255,255,255,0.06)', marginBottom: 16, fontSize: 13,
        display: 'flex', justifyContent: 'space-between',
      }}>
        <div>
          <span style={{ color: 'rgba(255,255,255,0.5)' }}>Sessions: </span>
          <span style={{ fontWeight: 500 }}>{data.summary.active}</span>
        </div>
        <div>
          <span style={{ color: 'rgba(255,255,255,0.5)' }}>Ports in use: </span>
          <span style={{ fontWeight: 500 }}>{data.summary.totalPorts}</span>
        </div>
      </div>

      {/* Active Sessions */}
      {activeSessions.length > 0 && (
        <>
          <SectionHeader label="Active" count={activeSessions.length} />
          {activeSessions.map(s => (
            <SessionRow
              key={s.sessionId}
              session={s}
              removing={removing === s.sessionId}
              onRemove={() => handleRemove(s.sessionId)}
              statusColor="#4FC3F7"
            />
          ))}
        </>
      )}

      {/* Idle Sessions */}
      {idleSessions.length > 0 && (
        <>
          <SectionHeader label="Idle" count={idleSessions.length} />
          {idleSessions.map(s => (
            <SessionRow
              key={s.sessionId}
              session={s}
              removing={removing === s.sessionId}
              onRemove={() => handleRemove(s.sessionId)}
              statusColor="#FFB74D"
            />
          ))}
        </>
      )}

      {/* Dead Sessions */}
      {deadSessions.length > 0 && (
        <>
          <SectionHeader label="Dead" count={deadSessions.length} />
          {deadSessions.map(s => (
            <SessionRow
              key={s.sessionId}
              session={s}
              removing={removing === s.sessionId}
              onRemove={() => handleRemove(s.sessionId)}
              statusColor="#ff6b6b"
            />
          ))}
        </>
      )}

      {/* Empty state */}
      {data.sessions.length === 0 && (
        <div style={{ color: 'rgba(255,255,255,0.4)', fontSize: 13, padding: '20px 0', textAlign: 'center' }}>
          No active sessions. Sessions appear when jobs run with port allocation.
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

interface SessionRowProps {
  session: ActiveSession;
  removing: boolean;
  onRemove: () => void;
  statusColor: string;
}

function SessionRow({ session, removing, onRemove, statusColor }: SessionRowProps) {
  const { ports } = session;

  return (
    <div style={{
      marginBottom: 8, padding: '10px 14px', background: 'rgba(255,255,255,0.03)',
      borderRadius: 8, border: '1px solid rgba(255,255,255,0.06)',
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          {/* Role + Status */}
          <div style={{ fontSize: 13, fontWeight: 500, marginBottom: 2 }}>
            <span style={{
              display: 'inline-block', width: 8, height: 8, borderRadius: '50%',
              backgroundColor: statusColor, marginRight: 8, verticalAlign: 'middle',
            }} />
            <span style={{ textTransform: 'uppercase' }}>{session.roleName || session.roleId}</span>
            {session.messageStatus && (
              <span style={{
                marginLeft: 8, fontSize: 10, padding: '1px 6px',
                background: 'rgba(255,255,255,0.08)', borderRadius: 3,
                color: 'rgba(255,255,255,0.6)',
              }}>
                {session.messageStatus}
              </span>
            )}
          </div>

          {/* Task */}
          {session.task && (
            <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.5)', marginBottom: 4 }}>
              "{session.task.slice(0, 60)}{session.task.length > 60 ? '...' : ''}"
            </div>
          )}

          {/* Ports */}
          <div style={{ fontSize: 11, display: 'flex', gap: 8, marginBottom: 2 }}>
            <span style={{ color: '#81C784' }}>API:{ports.api || '?'}</span>
            <span style={{ color: '#64B5F6' }}>Vite:{ports.vite || '?'}</span>
            {ports.hmr && <span style={{ color: '#FFB74D' }}>HMR:{ports.hmr}</span>}
          </div>

          {/* Meta */}
          <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.35)' }}>
            {session.sessionId.slice(0, 12)}...
            {session.worktreePath && (
              <>{' \u00B7 '}{truncatePath(session.worktreePath)}</>
            )}
            {session.pid && <>{' \u00B7 '}PID:{session.pid}</>}
            {' \u00B7 '}{timeAgo(session.startedAt)}
          </div>
        </div>

        <button
          onClick={onRemove}
          disabled={removing}
          style={{
            background: 'rgba(255,100,100,0.15)', border: '1px solid rgba(255,100,100,0.2)',
            color: '#ff6b6b', borderRadius: 4, padding: '3px 8px', fontSize: 10,
            cursor: removing ? 'wait' : 'pointer',
            opacity: removing ? 0.6 : 1,
            fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.5,
            flexShrink: 0, marginLeft: 8,
          }}
        >
          {removing ? '...' : 'STOP'}
        </button>
      </div>
    </div>
  );
}

function truncatePath(p: string, maxLen = 35): string {
  if (p.length <= maxLen) return p;
  return '...' + p.slice(p.length - maxLen + 3);
}
