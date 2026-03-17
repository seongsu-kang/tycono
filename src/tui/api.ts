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

async function fetchJson<T>(path: string, options?: { method?: string; body?: unknown }): Promise<T> {
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

export async function dispatchWave(directive: string, options?: {
  targetRoles?: string[];
  continuous?: boolean;
}): Promise<WaveResponse> {
  return fetchJson<WaveResponse>('/api/jobs', {
    method: 'POST',
    body: {
      type: 'wave',
      directive,
      targetRoles: options?.targetRoles,
      continuous: options?.continuous ?? false,
    },
  });
}

export async function sendDirective(waveId: string, text: string): Promise<{ ok: boolean }> {
  return fetchJson<{ ok: boolean }>(`/api/waves/${waveId}/directive`, {
    method: 'POST',
    body: { text },
  });
}

export async function fetchActiveWaves(): Promise<{ waves: Array<{ waveId: string; sessionIds: string[] }> }> {
  return fetchJson('/api/waves/active');
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

          if (eventType === 'activity' && data) {
            try {
              onEvent(JSON.parse(data) as SSEEvent);
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
