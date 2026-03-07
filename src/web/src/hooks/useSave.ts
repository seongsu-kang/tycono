import { useState, useEffect, useCallback, useRef } from 'react';
import { api } from '../api/client';

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
}

const POLL_INTERVAL = 30_000;

export function useSave(): UseSaveReturn {
  const [status, setStatus] = useState<SaveStatus | null>(null);
  const [state, setState] = useState<SaveState>('synced');
  const [history, setHistory] = useState<CommitInfo[]>([]);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const fetchStatus = useCallback(async () => {
    try {
      const s = await api.getSaveStatus();
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

  // Poll status
  useEffect(() => {
    fetchStatus();
    pollRef.current = setInterval(fetchStatus, POLL_INTERVAL);
    return () => { if (pollRef.current) clearInterval(pollRef.current); };
  }, [fetchStatus]);

  const save = useCallback(async (message?: string): Promise<SaveResult> => {
    setState('saving');
    try {
      const result = await api.save(message);
      await fetchStatus();
      return result;
    } catch (err) {
      setState('error');
      throw err;
    }
  }, [fetchStatus]);

  const loadHistory = useCallback(async () => {
    try {
      const h = await api.getSaveHistory(20);
      setHistory(h);
    } catch {
      // ignore
    }
  }, []);

  const restore = useCallback(async (sha: string) => {
    setState('saving');
    try {
      await api.restoreSave(sha);
      await fetchStatus();
    } catch (err) {
      setState('error');
      throw err;
    }
  }, [fetchStatus]);

  const dirtyCount = status ? status.modified.length + status.untracked.length : 0;
  const lastSaved = status?.lastCommit?.date ?? null;

  return { state, dirtyCount, lastSaved, status, save, history, loadHistory, restore, refresh: fetchStatus };
}
