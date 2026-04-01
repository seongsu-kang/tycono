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
  upvotes: number;
  downvotes: number;
  vote_score: number;
  my_vote?: number | null;
  publisher_id?: string | null;
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

export interface CloudPresetSummary {
  id: string;
  name: string;
  version: string;
  description?: string;
  tagline?: string;
  roles: string[];
  category?: string;
  tags?: string[];
  installs: number;
  upvotes: number;
  downvotes: number;
  vote_score: number;
  my_vote?: number | null;
  publisher_id?: string | null;
  author?: { id: string; name: string; verified?: boolean };
  pricing?: { type: string; price: number };
  wave_scoped?: {
    recommended_tasks?: string[];
    avg_wave_duration?: string;
    complexity?: string;
  };
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

export type StoreSortOption = 'name' | 'popular' | 'installs' | 'newest';

export const cloudApi = {
  health: () => cloudGet<{ status: string; version: string }>('/api/health'),

  // Auth
  getMyName: (instanceId: string) =>
    cloudGet<{ name: string | null }>(`/api/auth/my-name?instance_id=${encodeURIComponent(instanceId)}`),

  // Store
  getCharacters: (opts?: { sort?: StoreSortOption; instanceId?: string }) => {
    const params = new URLSearchParams();
    if (opts?.sort) params.set('sort', opts.sort);
    if (opts?.instanceId) params.set('instance_id', opts.instanceId);
    const qs = params.toString();
    return cloudGet<{ characters: CloudCharacterSummary[] }>(`/api/store/characters${qs ? `?${qs}` : ''}`);
  },
  getCharacter: (id: string) => cloudGet<CloudCharacterDetail>(`/api/store/characters/${id}`),
  getCharacterVersion: (id: string) => cloudGet<{ id: string; version: string }>(`/api/store/characters/${id}/version`),

  // Voting
  voteCharacter: (id: string, instanceId: string, vote: 1 | -1 | 0) =>
    cloudPost<{ ok: boolean; upvotes: number; downvotes: number }>(`/api/store/characters/${id}/vote`, { instanceId, vote }),

  // Install tracking
  trackInstall: (id: string) =>
    cloudPost<{ ok: boolean; installs: number }>(`/api/store/characters/${id}/install`, {}),

  // Sync
  syncCheck: (roles: Array<{ roleId: string; sourceId: string; currentVersion: string }>) =>
    cloudPost<SyncCheckResult>('/api/sync/check', { roles }),
  syncPull: (sourceId: string) =>
    cloudPost<{ character: CloudCharacterDetail; version: string }>('/api/sync/pull', { sourceId }),

  // Publish
  publishCharacter: (data: { id: string; name: string; version?: string; data: Record<string, unknown>; publisherId?: string }) =>
    cloudPost<{ ok: boolean; id: string; version: string }>('/api/store/publish', data),
  deleteCharacter: (id: string, publisherId?: string) => {
    const qs = publisherId ? `?publisher_id=${encodeURIComponent(publisherId)}` : '';
    return fetch(`${CLOUD_BASE}/api/store/characters/${id}${qs}`, { method: 'DELETE' }).then(r => r.json());
  },

  // Preset Store (Cloud Marketplace)
  getCloudPresets: (opts?: { sort?: StoreSortOption; instanceId?: string }) => {
    const params = new URLSearchParams();
    if (opts?.sort) params.set('sort', opts.sort);
    if (opts?.instanceId) params.set('instance_id', opts.instanceId);
    const qs = params.toString();
    return cloudGet<{ presets: CloudPresetSummary[] }>(`/api/presets${qs ? `?${qs}` : ''}`);
  },
  getCloudPreset: (id: string) => cloudGet<CloudPresetSummary>(`/api/presets/${id}`),
  votePreset: (id: string, instanceId: string, vote: 1 | -1 | 0) =>
    cloudPost<{ ok: boolean; upvotes: number; downvotes: number }>(`/api/presets/${id}/vote`, { instanceId, vote }),
  trackPresetInstall: (id: string) =>
    cloudPost<{ ok: boolean; installs: number }>(`/api/presets/${id}/install`, {}),
  publishPreset: (data: { id: string; name: string; version?: string; data: Record<string, unknown>; publisherId?: string }) =>
    cloudPost<{ ok: boolean; id: string; version: string }>('/api/presets/publish', data),

  // Telemetry
  uploadTelemetry: (data: {
    instanceId: string;
    roleCount: number;
    totalTokens: number;
    totalCostUsd: number;
    rolesSummary?: Array<{ roleId: string; level: number; tokens: number }>;
  }) => cloudPost<{ ok: boolean }>('/api/telemetry', data),

  // Stats — sync company stats to Cloud for public profile
  // Note: displayName is resolved server-side from display_names table (never sent by client)
  syncStats: (data: {
    instanceId: string;
    roleCount: number;
    totalTokens: number;
    rolesData: Array<{ roleId: string; name: string; tokens: number }>;
  }) => cloudPost<{ ok: boolean }>('/api/stats/sync', data),
};
