/**
 * useApi — periodic API polling for TUI state updates
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import {
  fetchCompany,
  fetchSessions,
  fetchExecStatus,
  fetchActiveWaves,
  type CompanyInfo,
  type SessionInfo,
  type ExecStatus,
} from '../api';

const POLL_INTERVAL = 3000; // 3 seconds

export interface ApiState {
  company: CompanyInfo | null;
  sessions: SessionInfo[];
  execStatus: ExecStatus | null;
  activeWaveId: string | null;
  error: string | null;
  refresh(): void;
}

export function useApi(): ApiState {
  const [company, setCompany] = useState<CompanyInfo | null>(null);
  const [sessions, setSessions] = useState<SessionInfo[]>([]);
  const [execStatus, setExecStatus] = useState<ExecStatus | null>(null);
  const [activeWaveId, setActiveWaveId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const mountedRef = useRef(true);

  const refresh = useCallback(async () => {
    try {
      const [comp, sess, exec, waves] = await Promise.all([
        fetchCompany().catch(() => null),
        fetchSessions().catch(() => []),
        fetchExecStatus().catch(() => null),
        fetchActiveWaves().catch(() => ({ waves: [] })),
      ]);

      if (!mountedRef.current) return;

      if (comp) setCompany(comp);
      setSessions(Array.isArray(sess) ? sess : []);
      if (exec) setExecStatus(exec);

      // Find active wave
      if (waves.waves && waves.waves.length > 0) {
        setActiveWaveId(waves.waves[0].waveId);
      }

      setError(null);
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

  return { company, sessions, execStatus, activeWaveId, error, refresh };
}
