import { useState, useEffect, useCallback, useRef } from 'react';
import { api } from '../api/client';

export type RepoType = 'akb' | 'code';

export interface SaveStatus {
  dirty: boolean;
  modified: string[];
  untracked: string[];
  lastCommit: { sha: string; message: string; date: string } | null;
  branch: string;
  hasRemote: boolean;
  synced: boolean;
  noGit: boolean;
}

export interface CommitInfo {
  sha: string;
  shortSha: string;
  message: string;
  date: string;
}

export interface SaveResult {
  ok: boolean;
  commitSha: string;
  message: string;
  filesChanged: number;
  pushed: boolean;
  pushError?: string;
}

export interface SyncInfo {
  ahead: number;
  behind: number;
  branch: string;
  hasRemote: boolean;
}

export interface PullResult {
  status: 'ok' | 'dirty' | 'diverged' | 'up-to-date' | 'no-remote' | 'error';
  message: string;
  commits?: number;
}

export type SaveState = 'synced' | 'dirty' | 'saving' | 'error' | 'no-git';

export interface UseSaveReturn {
  state: SaveState;
  dirtyCount: number;
  lastSaved: string | null;
  status: SaveStatus | null;
  save: (message?: string) => Promise<SaveResult>;
  history: CommitInfo[];
  loadHistory: () => Promise<void>;
  restore: (sha: string) => Promise<void>;
  refresh: () => Promise<void>;
  initGit: () => Promise<void>;
  // Repo toggle
  repo: RepoType;
  setRepo: (r: RepoType) => void;
  // Sync
  syncInfo: SyncInfo | null;
  fetchSyncStatus: () => Promise<void>;
  pull: () => Promise<PullResult>;
  pulling: boolean;
}

const POLL_INTERVAL = 30_000;
const SYNC_POLL_INTERVAL = 300_000; // 5 minutes

export function useSave(): UseSaveReturn {
  const [repo, setRepoState] = useState<RepoType>('akb');
  const [status, setStatus] = useState<SaveStatus | null>(null);
  const [state, setState] = useState<SaveState>('synced');
  const [history, setHistory] = useState<CommitInfo[]>([]);
  const [syncInfo, setSyncInfo] = useState<SyncInfo | null>(null);
  const [pulling, setPulling] = useState(false);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const syncPollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const repoRef = useRef<RepoType>(repo);

  // Keep ref in sync
  repoRef.current = repo;

  const fetchStatus = useCallback(async () => {
    try {
      const s = await api.getSaveStatus(repoRef.current);
      setStatus(s);
      if (s.noGit) {
        setState('no-git');
      } else {
        setState(prev => prev === 'saving' ? prev : (s.dirty ? 'dirty' : 'synced'));
      }
    } catch {
      setState('error');
    }
  }, []);

  const fetchSyncStatus = useCallback(async () => {
    try {
      const info = await api.getSyncStatus(repoRef.current);
      setSyncInfo({
        ahead: info.ahead,
        behind: info.behind,
        branch: info.branch,
        hasRemote: info.hasRemote,
      });
    } catch {
      // ignore — no remote or network issue
    }
  }, []);

  // Lazy: don't poll on mount. Call refresh() to start.
  const startPolling = useCallback(() => {
    if (pollRef.current) clearInterval(pollRef.current);
    fetchStatus();
    pollRef.current = setInterval(fetchStatus, POLL_INTERVAL);

    // Also start sync polling
    if (syncPollRef.current) clearInterval(syncPollRef.current);
    fetchSyncStatus();
    syncPollRef.current = setInterval(fetchSyncStatus, SYNC_POLL_INTERVAL);
  }, [fetchStatus, fetchSyncStatus]);

  useEffect(() => {
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
      if (syncPollRef.current) clearInterval(syncPollRef.current);
    };
  }, []);

  // When repo changes, refetch
  const setRepo = useCallback((r: RepoType) => {
    setRepoState(r);
    repoRef.current = r;
    setStatus(null);
    setSyncInfo(null);
    setHistory([]);
    // Trigger fresh fetch
    setTimeout(() => {
      fetchStatus();
      fetchSyncStatus();
    }, 0);
  }, [fetchStatus, fetchSyncStatus]);

  const save = useCallback(async (message?: string): Promise<SaveResult> => {
    setState('saving');
    try {
      const result = await api.save(message, repoRef.current);
      await fetchStatus();
      return result;
    } catch (err) {
      setState('error');
      throw err;
    }
  }, [fetchStatus]);

  const loadHistory = useCallback(async () => {
    try {
      const h = await api.getSaveHistory(20, repoRef.current);
      setHistory(h);
    } catch {
      // ignore
    }
  }, []);

  const restore = useCallback(async (sha: string) => {
    setState('saving');
    try {
      await api.restoreSave(sha, undefined, repoRef.current);
      await fetchStatus();
    } catch (err) {
      setState('error');
      throw err;
    }
  }, [fetchStatus]);

  const pull = useCallback(async (): Promise<PullResult> => {
    setPulling(true);
    try {
      const result = await api.pull(repoRef.current);
      await fetchStatus();
      await fetchSyncStatus();
      return result;
    } catch (err) {
      throw err;
    } finally {
      setPulling(false);
    }
  }, [fetchStatus, fetchSyncStatus]);

  const initGit = useCallback(async () => {
    try {
      await api.initGit(repoRef.current);
      await fetchStatus();
    } catch {
      setState('error');
    }
  }, [fetchStatus]);

  const dirtyCount = status ? status.modified.length + status.untracked.length : 0;
  const lastSaved = status?.lastCommit?.date ?? null;

  const refresh = useCallback(async () => {
    startPolling();
  }, [startPolling]);

  return {
    state, dirtyCount, lastSaved, status, save, history, loadHistory, restore, refresh, initGit,
    repo, setRepo,
    syncInfo, fetchSyncStatus, pull, pulling,
  };
}
