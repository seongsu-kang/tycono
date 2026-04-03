/**
 * TUI API Client — HTTP + SSE for communicating with Tycono API server
 */

import http from 'node:http';

let BASE_URL = 'http://localhost:3000';

export function setBaseUrl(url: string): void {
  BASE_URL = url.replace(/\/$/, '');
}

export function getBaseUrl(): string {
  return BASE_URL;
}

/* ─── HTTP helpers ─── */

export async function fetchJson<T>(path: string, options?: { method?: string; body?: unknown }): Promise<T> {
  const url = `${BASE_URL}${path}`;
  const method = options?.method ?? 'GET';
  const bodyStr = options?.body ? JSON.stringify(options.body) : undefined;

  return new Promise((resolve, reject) => {
    const urlObj = new URL(url);
    const req = http.request(
      {
        hostname: urlObj.hostname,
        port: urlObj.port,
        path: urlObj.pathname + urlObj.search,
        method,
        headers: {
          'Content-Type': 'application/json',
          ...(bodyStr ? { 'Content-Length': Buffer.byteLength(bodyStr) } : {}),
        },
      },
      (res) => {
        let data = '';
        res.on('data', (chunk) => { data += chunk; });
        res.on('end', () => {
          try {
            const parsed = JSON.parse(data);
            if (res.statusCode && res.statusCode >= 400) {
              reject(new Error(parsed.error ?? `HTTP ${res.statusCode} from ${path}`));
              return;
            }
            resolve(parsed as T);
          } catch {
            reject(new Error(`Invalid JSON from ${path}: ${data.slice(0, 200)}`));
          }
        });
      },
    );
    req.on('error', reject);
    req.setTimeout(10_000, () => {
      req.destroy(new Error(`Timeout: ${path}`));
    });
    if (bodyStr) req.write(bodyStr);
    req.end();
  });
}

/* ─── API Types ─── */

export interface RoleInfo {
  id: string;
  name: string;
  level: string;
  reportsTo: string;
  status: string;
}

export interface CompanyInfo {
  name: string;
  domain: string;
  founded: string;
  mission: string;
  roles: RoleInfo[];
}

export interface SessionInfo {
  id: string;
  roleId: string;
  title: string;
  mode: string;
  status: string;
  source: string;
  waveId?: string;
  parentSessionId?: string;
  createdAt: string;
}

export interface ExecStatus {
  statuses: Record<string, string>;
  activeExecutions: Array<{
    id: string;
    roleId: string;
    task: string;
    startedAt: string;
  }>;
}

export interface WaveResponse {
  waveId: string;
  supervisorSessionId?: string;
  mode: string;
  directive: string;
}

export interface SSEEvent {
  seq: number;
  ts: string;
  type: string;
  roleId: string;
  data: Record<string, unknown>;
}

/* ─── API calls ─── */

export async function fetchCompany(): Promise<CompanyInfo> {
  return fetchJson<CompanyInfo>('/api/company');
}

export async function fetchRoles(): Promise<RoleInfo[]> {
  return fetchJson<RoleInfo[]>('/api/roles');
}

export async function fetchSessions(): Promise<SessionInfo[]> {
  return fetchJson<SessionInfo[]>('/api/sessions');
}

export async function fetchExecStatus(): Promise<ExecStatus> {
  return fetchJson<ExecStatus>('/api/exec/status');
}

/* ─── Wave Preview (dry-run) ─── */

export interface RolePreview {
  roleId: string;
  name: string;
  level: string;
  model: string;
  children: RolePreview[];
}

export interface WavePreview {
  directive: string;
  preset: string | null;
  presetName: string | null;
  presetAutoDetected: boolean;
  continuous: boolean;
  team: RolePreview[];
  totalAgents: number;
  dispatchOrder: 'parallel' | 'sequential';
  estimatedCostPerRound: number;
  availableModels: string[];
}

export async function previewWave(directive?: string, options?: {
  targetRoles?: string[];
  continuous?: boolean;
  preset?: string;
}): Promise<WavePreview> {
  return fetchJson<WavePreview>('/api/jobs/preview', {
    method: 'POST',
    body: {
      type: 'wave',
      directive: directive ?? '',
      targetRoles: options?.targetRoles,
      continuous: options?.continuous ?? false,
      preset: options?.preset,
    },
  });
}

export async function dispatchWave(directive?: string, options?: {
  targetRoles?: string[];
  continuous?: boolean;
  preset?: string;
  modelOverrides?: Record<string, string>;
}): Promise<WaveResponse> {
  return fetchJson<WaveResponse>('/api/jobs', {
    method: 'POST',
    body: {
      type: 'wave',
      directive: directive ?? '',
      targetRoles: options?.targetRoles,
      continuous: options?.continuous ?? false,
      preset: options?.preset,
      modelOverrides: options?.modelOverrides,
    },
  });
}

export async function sendDirective(waveId: string, text: string): Promise<{ ok: boolean }> {
  return fetchJson<{ ok: boolean }>(`/api/waves/${waveId}/directive`, {
    method: 'POST',
    body: { text },
  });
}

export async function stopWave(waveId: string): Promise<{ ok: boolean; abortedSessions: number }> {
  return fetchJson<{ ok: boolean; abortedSessions: number }>(`/api/waves/${waveId}/stop`, {
    method: 'POST',
  });
}

export async function fetchActiveWaves(): Promise<{ waves: Array<{ waveId: string; sessionIds: string[] }> }> {
  return fetchJson('/api/waves/active');
}

export interface PastWaveInfo {
  id: string;
  directive: string;
  rolesCount: number;
  startedAt: string;
  sessionIds?: string[];
}

export async function fetchPastWaves(limit = 20): Promise<PastWaveInfo[]> {
  const all = await fetchJson<PastWaveInfo[]>('/api/operations/waves');
  return all.slice(0, limit);
}

/* ─── Active Sessions (port/worktree visibility) ─── */

export interface ActiveSessionInfo {
  sessionId: string;
  roleId: string;
  task: string;
  ports: { api: number; vite: number; hmr?: number };
  worktreePath?: string;
  pid?: number;
  startedAt: string;
  status: 'active' | 'idle' | 'dead';
  waveId?: string | null;
  messageStatus?: string | null;
  alive?: boolean | null;
}

export interface ActiveSessionsResponse {
  sessions: ActiveSessionInfo[];
  summary: { active: number; totalPorts: number };
}

export async function fetchActiveSessions(): Promise<ActiveSessionsResponse> {
  return fetchJson<ActiveSessionsResponse>('/api/active-sessions');
}

export async function killSession(sessionId: string): Promise<{ ok: boolean }> {
  return fetchJson<{ ok: boolean }>(`/api/active-sessions/${sessionId}`, { method: 'DELETE' });
}

export async function cleanupSessions(): Promise<{ cleaned: number; remaining: number }> {
  return fetchJson<{ cleaned: number; remaining: number }>('/api/active-sessions/cleanup', { method: 'POST' });
}

/* ─── Presets ─── */

export interface PresetSummary {
  id: string;
  name: string;
  description?: string;
  rolesCount: number;
  roles: string[];
  isDefault: boolean;
}

export async function fetchPresets(): Promise<PresetSummary[]> {
  return fetchJson<PresetSummary[]>('/api/presets');
}

/* ─── Knowledge docs ─── */

export interface KnowledgeDoc {
  id: string;
  title: string;
  path: string;
  type?: string;
  domain?: string;
  status?: string;
  updatedAt?: string;
}

export async function fetchKnowledgeDocs(): Promise<KnowledgeDoc[]> {
  return fetchJson<KnowledgeDoc[]>('/api/knowledge');
}

/** Scan COMPANY_ROOT for all .md files (not API-dependent) */
export async function fetchCompanyRoot(): Promise<string> {
  const health = await fetchJson<{ companyRoot: string }>('/api/health');
  return health.companyRoot;
}

/* ─── Setup API calls ─── */

export interface TeamTemplate {
  id: string;
  name: string;
  description: string;
  roles: Array<string | { id: string; name: string; level?: string }>;
}

export interface ScaffoldResult {
  path: string;
  rolesCreated: number;
}

export async function fetchSetupTeams(): Promise<TeamTemplate[]> {
  return fetchJson<TeamTemplate[]>('/api/setup/teams');
}

export async function postSetupScaffold(companyName: string, teamId: string): Promise<ScaffoldResult> {
  return fetchJson<ScaffoldResult>('/api/setup/scaffold', {
    method: 'POST',
    body: { companyName, teamId },
  });
}

export async function postSetupCodeRoot(codeRoot: string): Promise<{ ok: boolean }> {
  return fetchJson<{ ok: boolean }>('/api/setup/code-root', {
    method: 'POST',
    body: { codeRoot },
  });
}

/* ─── SSE stream ─── */

export interface SSEConnection {
  close(): void;
}

export function subscribeToWaveStream(
  waveId: string,
  onEvent: (event: SSEEvent) => void,
  onEnd?: (reason: string) => void,
  fromSeq?: number,
): SSEConnection {
  const url = new URL(`${BASE_URL}/api/waves/${waveId}/stream`);
  if (fromSeq) url.searchParams.set('from', String(fromSeq));

  let destroyed = false;
  let req: http.ClientRequest | null = null;

  const connect = () => {
    req = http.get(url.toString(), (res) => {
      let buffer = '';

      res.on('data', (chunk: Buffer) => {
        if (destroyed) return;
        buffer += chunk.toString();

        // Parse SSE format
        const parts = buffer.split('\n\n');
        buffer = parts.pop() ?? '';

        for (const part of parts) {
          if (!part.trim() || part.startsWith(':')) continue;

          const lines = part.split('\n');
          let eventType = '';
          let data = '';

          for (const line of lines) {
            if (line.startsWith('event: ')) {
              eventType = line.slice(7);
            } else if (line.startsWith('data: ')) {
              data = line.slice(6);
            }
          }

          if ((eventType === 'activity' || eventType === 'wave:event') && data) {
            try {
              const parsed = JSON.parse(data);
              // wave:event wraps the actual event in .event field
              const evt = parsed.event ?? parsed;
              onEvent(evt as SSEEvent);
            } catch { /* ignore parse errors */ }
          } else if (eventType === 'stream:end' && data) {
            try {
              const parsed = JSON.parse(data);
              onEnd?.(parsed.reason ?? 'unknown');
            } catch {
              onEnd?.('unknown');
            }
          }
        }
      });

      res.on('end', () => {
        if (!destroyed) {
          onEnd?.('disconnected');
        }
      });

      res.on('error', () => {
        if (!destroyed) {
          onEnd?.('error');
        }
      });
    });

    req.on('error', () => {
      if (!destroyed) {
        onEnd?.('error');
      }
    });
  };

  connect();

  return {
    close() {
      destroyed = true;
      req?.destroy();
    },
  };
}
