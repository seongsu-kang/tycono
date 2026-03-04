import type { Company, Role, RoleDetail, Project, ProjectDetail, Standup, Wave, Decision, Session, CreateRoleInput, JobInfo, CompanyStatus, EngineDetection, PathValidation, ScaffoldInput, ScaffoldResult, TeamTemplate, BrowseResult, ConnectAkbResult } from '../types';

const BASE = '/api';

async function get<T>(path: string): Promise<T> {
  const res = await fetch(`${BASE}${path}`);
  if (!res.ok) throw new Error(`API error: ${res.status}`);
  return res.json();
}

async function post<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`API error: ${res.status}`);
  return res.json();
}

async function patch_<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`API error: ${res.status}`);
  return res.json();
}

async function del<T>(path: string): Promise<T> {
  const res = await fetch(`${BASE}${path}`, { method: 'DELETE' });
  if (!res.ok) throw new Error(`API error: ${res.status}`);
  return res.json();
}

export const api = {
  // Existing
  getCompany: () => get<Company>('/company'),
  getRoles: () => get<Role[]>('/roles'),
  getRole: (id: string) => get<RoleDetail>(`/roles/${id}`),
  getProjects: () => get<Project[]>('/projects'),
  getProject: (id: string) => get<ProjectDetail>(`/projects/${id}`),
  getStandups: () => get<Standup[]>('/operations/standups'),
  getWaves: () => get<Wave[]>('/operations/waves'),
  getDecisions: () => get<Decision[]>('/operations/decisions'),

  // Roles (Engine)
  createRole: (input: CreateRoleInput) =>
    post<{ ok: boolean; roleId: string }>('/engine/roles', input),
  deleteRole: (id: string) =>
    del<{ ok: boolean; removed: string }>(`/engine/roles/${id}`),

  // Sessions
  getSessions: () => get<Omit<Session, 'messages'>[]>('/sessions'),
  getSession: (id: string) => get<Session>(`/sessions/${id}`),
  createSession: (roleId: string, mode: 'talk' | 'do' = 'talk') =>
    post<Session>('/sessions', { roleId, mode }),
  deleteSession: (id: string) => del<{ ok: boolean }>(`/sessions/${id}`),
  updateSession: (id: string, patch: { title?: string; mode?: 'talk' | 'do' }) =>
    patch_<Session>(`/sessions/${id}`, patch),

  // Jobs
  startJob: (params: { type?: string; roleId?: string; task?: string; directive?: string; sourceRole?: string; readOnly?: boolean; targetRole?: string }) =>
    post<{ jobId: string }>('/jobs', params),
  getJob: (id: string) => get<JobInfo>(`/jobs/${id}`),
  listJobs: (filter?: { status?: string; roleId?: string }) => {
    const params = new URLSearchParams();
    if (filter?.status) params.set('status', filter.status);
    if (filter?.roleId) params.set('roleId', filter.roleId);
    const qs = params.toString();
    return get<{ jobs: JobInfo[] }>(`/jobs${qs ? '?' + qs : ''}`);
  },
  abortJob: (id: string) => del<{ ok: boolean }>(`/jobs/${id}`),

  // Setup / Onboarding
  getStatus: () => get<CompanyStatus>('/status'),
  detectEngine: () => post<EngineDetection>('/setup/detect-engine', {}),
  validatePath: (path: string) => post<PathValidation>('/setup/validate-path', { path }),
  scaffold: (input: ScaffoldInput) => post<ScaffoldResult>('/setup/scaffold', input),
  getTeams: () => get<TeamTemplate[]>('/setup/teams'),
  browse: (path?: string) => post<BrowseResult>('/setup/browse', { path }),
  connectAkb: (path: string) => post<ConnectAkbResult>('/setup/connect-akb', { path }),
};
