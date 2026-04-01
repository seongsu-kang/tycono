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
  fetchKnowledgeDocs,
  fetchPastWaves,
  type CompanyInfo,
  type SessionInfo,
  type ExecStatus,
  type ActiveSessionInfo,
  type KnowledgeDoc,
  type PastWaveInfo,
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
  pastWaves: PastWaveInfo[];
  activeSessions: ActiveSessionInfo[];
  portSummary: { active: number; totalPorts: number };
  knowledgeDocs: KnowledgeDoc[];
  error: string | null;
  loaded: boolean;
  refresh(): void;
}

export function useApi(): ApiState {
  const [company, setCompany] = useState<CompanyInfo | null>(null);
  const [sessions, setSessions] = useState<SessionInfo[]>([]);
  const [execStatus, setExecStatus] = useState<ExecStatus | null>(null);
  const [activeWaves, setActiveWaves] = useState<ActiveWaveInfo[]>([]);
  const [pastWaves, setPastWaves] = useState<PastWaveInfo[]>([]);
  const pastWavesLoadedRef = useRef(false);
  const [activeSessions, setActiveSessions] = useState<ActiveSessionInfo[]>([]);
  const [portSummary, setPortSummary] = useState<{ active: number; totalPorts: number }>({ active: 0, totalPorts: 0 });
  const [knowledgeDocs, setKnowledgeDocs] = useState<KnowledgeDoc[]>([]);
  const kbLoadedRef = useRef(false);
  const [error, setError] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);
  const mountedRef = useRef(true);

  const refresh = useCallback(async () => {
    try {
      const promises: [
        Promise<CompanyInfo | null>,
        Promise<SessionInfo[]>,
        Promise<ExecStatus | null>,
        Promise<{ waves: Array<{ waveId: string; sessionIds: string[] }> }>,
        Promise<{ sessions: ActiveSessionInfo[]; summary: { active: number; totalPorts: number } }>,
        Promise<PastWaveInfo[]>,
      ] = [
        fetchCompany().catch(() => null),
        fetchSessions().catch(() => []),
        fetchExecStatus().catch(() => null),
        fetchActiveWaves().catch(() => ({ waves: [] })),
        fetchActiveSessions().catch(() => ({ sessions: [], summary: { active: 0, totalPorts: 0 } })),
        !pastWavesLoadedRef.current ? fetchPastWaves(20).catch(() => []) : Promise.resolve([]),
      ];
      const [comp, sess, exec, waves, activeSess, pastWavesResult] = await Promise.all(promises);

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

      // Past waves (load once, included in Promise.all)
      if (!pastWavesLoadedRef.current && pastWavesResult.length > 0) {
        pastWavesLoadedRef.current = true;
        setPastWaves(pastWavesResult);
      }

      // KB docs (load once, not every poll)
      if (!kbLoadedRef.current) {
        kbLoadedRef.current = true;
        fetchKnowledgeDocs().then(docs => {
          if (mountedRef.current) setKnowledgeDocs(docs);
        }).catch(() => {});
      }

      setError(null);
      setLoaded(true);
    } catch (err) {
      if (mountedRef.current) {
        setError(err instanceof Error ? err.message : 'API error');
        setLoaded(true);
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

  return { company, sessions, execStatus, activeWaves, pastWaves, activeSessions, portSummary, knowledgeDocs, error, loaded, refresh };
}
