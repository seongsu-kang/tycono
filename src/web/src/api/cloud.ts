/* ─── Tycono Cloud API Client ──────────────── */

const CLOUD_API_URL = 'https://api.tycono.ai';

// Fallback to direct IP during development / before DNS propagation
const CLOUD_BASE = import.meta.env.VITE_CLOUD_API_URL ?? CLOUD_API_URL;

async function cloudGet<T>(path: string): Promise<T> {
  const res = await fetch(`${CLOUD_BASE}${path}`);
  if (!res.ok) throw new Error(`Cloud API error: ${res.status}`);
  return res.json();
}

async function cloudPost<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(`${CLOUD_BASE}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`Cloud API error: ${res.status}`);
  return res.json();
}

export interface CloudCharacterSummary {
  id: string;
  name: string;
  version: string;
  tagline: string;
  level: string;
  price: string;
  installs: number;
}

export interface CloudCharacterDetail {
  id: string;
  name: string;
  version: string;
  persona: string;
  authority: { autonomous: string[]; needsApproval: string[] };
  skills: Array<{ id: string; name: string; category: string }>;
  appearance: Record<string, string>;
  [key: string]: unknown;
}

export interface SyncCheckResult {
  updates: Array<{
    sourceId: string;
    roleId: string;
    currentVersion: string;
    latestVersion: string;
    hasUpdate: boolean;
    fields: string[];
  }>;
}

export const cloudApi = {
  health: () => cloudGet<{ status: string; version: string }>('/api/health'),

  // Store
  getCharacters: () => cloudGet<{ characters: CloudCharacterSummary[] }>('/api/store/characters'),
  getCharacter: (id: string) => cloudGet<CloudCharacterDetail>(`/api/store/characters/${id}`),
  getCharacterVersion: (id: string) => cloudGet<{ id: string; version: string }>(`/api/store/characters/${id}/version`),

  // Sync
  syncCheck: (roles: Array<{ roleId: string; sourceId: string; currentVersion: string }>) =>
    cloudPost<SyncCheckResult>('/api/sync/check', { roles }),
  syncPull: (sourceId: string) =>
    cloudPost<{ character: CloudCharacterDetail; version: string }>('/api/sync/pull', { sourceId }),

  // Publish
  publishCharacter: (data: { id: string; name: string; version?: string; data: Record<string, unknown> }) =>
    cloudPost<{ ok: boolean; id: string; version: string }>('/api/store/publish', data),
  deleteCharacter: (id: string) =>
    fetch(`${CLOUD_BASE}/api/store/characters/${id}`, { method: 'DELETE' }).then(r => r.json()),

  // Telemetry
  uploadTelemetry: (data: {
    instanceId: string;
    roleCount: number;
    totalTokens: number;
    totalCostUsd: number;
    rolesSummary?: Array<{ roleId: string; level: number; tokens: number }>;
  }) => cloudPost<{ ok: boolean }>('/api/telemetry', data),
};
