/**
 * useApi — periodic API polling for TUI state updates
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import {
  fetchCompany,
  fetchSessions,
  fetchExecStatus,
  fetchActiveWaves,
  fetchActiveSessions,
  type CompanyInfo,
  type SessionInfo,
  type ExecStatus,
  type ActiveSessionInfo,
} from '../api';

const POLL_INTERVAL = 5000; // 5 seconds (reduce re-renders)

export interface ActiveWaveInfo {
  waveId: string;
  sessionIds: string[];
  directive?: string;
  startedAt?: number;
}

export interface ApiState {
  company: CompanyInfo | null;
  sessions: SessionInfo[];
  execStatus: ExecStatus | null;
  activeWaves: ActiveWaveInfo[];
  activeSessions: ActiveSessionInfo[];
  portSummary: { active: number; totalPorts: number };
  error: string | null;
  loaded: boolean;
  refresh(): void;
}

export function useApi(): ApiState {
  const [company, setCompany] = useState<CompanyInfo | null>(null);
  const [sessions, setSessions] = useState<SessionInfo[]>([]);
  const [execStatus, setExecStatus] = useState<ExecStatus | null>(null);
  const [activeWaves, setActiveWaves] = useState<ActiveWaveInfo[]>([]);
  const [activeSessions, setActiveSessions] = useState<ActiveSessionInfo[]>([]);
  const [portSummary, setPortSummary] = useState<{ active: number; totalPorts: number }>({ active: 0, totalPorts: 0 });
  const [error, setError] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);
  const mountedRef = useRef(true);

  const refresh = useCallback(async () => {
    try {
      const [comp, sess, exec, waves, activeSess] = await Promise.all([
        fetchCompany().catch(() => null),
        fetchSessions().catch(() => []),
        fetchExecStatus().catch(() => null),
        fetchActiveWaves().catch(() => ({ waves: [] })),
        fetchActiveSessions().catch(() => ({ sessions: [], summary: { active: 0, totalPorts: 0 } })),
      ]);

      if (!mountedRef.current) return;

      if (comp) setCompany(comp);
      setSessions(Array.isArray(sess) ? sess : []);
      if (exec) setExecStatus(exec);

      // Store full active waves array
      if (waves.waves && waves.waves.length > 0) {
        setActiveWaves(waves.waves.map((w: { waveId: string; sessionIds: string[] }) => ({
          waveId: w.waveId,
          sessionIds: w.sessionIds ?? [],
        })));
      }

      // Active sessions (port/resource visibility)
      setActiveSessions(activeSess.sessions ?? []);
      setPortSummary(activeSess.summary ?? { active: 0, totalPorts: 0 });

      setError(null);
      setLoaded(true);
    } catch (err) {
      if (mountedRef.current) {
        setError(err instanceof Error ? err.message : 'API error');
      }
    }
  }, []);

  useEffect(() => {
    mountedRef.current = true;
    refresh();
    const interval = setInterval(refresh, POLL_INTERVAL);
    return () => {
      mountedRef.current = false;
      clearInterval(interval);
    };
  }, [refresh]);

  return { company, sessions, execStatus, activeWaves, activeSessions, portSummary, error, loaded, refresh };
}
