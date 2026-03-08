import type { Company, Role, RoleDetail, Project, ProjectDetail, Standup, Wave, Decision, Session, CreateRoleInput, JobInfo, CompanyStatus, EngineDetection, PathValidation, ScaffoldInput, ScaffoldResult, TeamTemplate, BrowseResult, ConnectAkbResult, KnowledgeDoc, KnowledgeDocDetail, OrgTreeResponse } from '../types';
import type { SpeechSettings } from '../types/speech';

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

async function del<T>(path: string, body?: unknown): Promise<T> {
  const opts: RequestInit = { method: 'DELETE' };
  if (body !== undefined) {
    opts.headers = { 'Content-Type': 'application/json' };
    opts.body = JSON.stringify(body);
  }
  const res = await fetch(`${BASE}${path}`, opts);
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

  // Engine
  getOrgTree: () => get<OrgTreeResponse>('/engine/org'),

  // Skills
  getSkills: () => get<Array<{ id: string; name: string; description: string; source: string; installed: boolean }>>('/skills'),

  // Roles (Engine)
  createRole: (input: CreateRoleInput) =>
    post<{ ok: boolean; roleId: string }>('/engine/roles', input),
  updateRole: (id: string, changes: { name?: string }) =>
    patch_<{ ok: boolean; roleId: string }>(`/engine/roles/${id}`, changes),
  deleteRole: (id: string) =>
    del<{ ok: boolean; removed: string }>(`/engine/roles/${id}`),

  // Sessions
  getSessions: () => get<Omit<Session, 'messages'>[]>('/sessions'),
  getSession: (id: string) => get<Session>(`/sessions/${id}`),
  createSession: (roleId: string, mode: 'talk' | 'do' = 'talk') =>
    post<Session>('/sessions', { roleId, mode }),
  deleteSession: (id: string) => del<{ ok: boolean }>(`/sessions/${id}`),
  deleteSessions: (ids: string[]) => del<{ deleted: number }>('/sessions', { ids }),
  deleteEmptySessions: () => del<{ deleted: number; ids: string[] }>('/sessions?empty=true'),
  updateSession: (id: string, patch: { title?: string; mode?: 'talk' | 'do' }) =>
    patch_<Session>(`/sessions/${id}`, patch),

  // Jobs
  startJob: (params: { type?: string; roleId?: string; task?: string; directive?: string; sourceRole?: string; readOnly?: boolean; targetRole?: string }) =>
    post<{ jobId: string; jobIds?: string[] }>('/jobs', params),
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

  // Knowledge Base
  getKnowledge: () => get<KnowledgeDoc[]>('/knowledge'),
  getKnowledgeDoc: (id: string) => get<KnowledgeDocDetail>(`/knowledge/${id}`),
  createKnowledgeDoc: (params: { filename: string; title: string; category?: string; content?: string }) =>
    post<{ id: string; title: string }>('/knowledge', params),
  updateKnowledgeDoc: (id: string, content: string) => {
    return fetch(`${BASE}/knowledge/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content }),
    }).then(r => { if (!r.ok) throw new Error(`API error: ${r.status}`); return r.json(); });
  },
  deleteKnowledgeDoc: (id: string) => del<{ id: string; status: string }>(`/knowledge/${id}`),

  // Preferences
  getPreferences: () => get<{ appearances: Record<string, unknown>; theme: string; speech?: SpeechSettings; language?: string }>('/preferences'),
  updatePreferences: (data: Record<string, unknown>) =>
    patch_<{ ok: boolean; appearances: Record<string, unknown>; theme: string; speech?: SpeechSettings; language?: string }>('/preferences', data),

  // Chat (LLM-powered channel conversation)
  chatInChannel: (data: {
    channelId: string;
    channelTopic?: string;
    roleId: string;
    history: Array<{ roleId: string; text: string; ts: number }>;
    members: Array<{ id: string; name: string; level: string }>;
    relationships: Array<{ partnerId: string; familiarity: number }>;
    workContext?: { currentTask: string | null; taskProgress: string | null };
  }) => post<{ message: string; tokens: { input: number; output: number } }>('/speech/chat', data),

  // Save (Git)
  getSaveStatus: () => get<{
    dirty: boolean; modified: string[]; untracked: string[];
    lastCommit: { sha: string; message: string; date: string } | null;
    branch: string; hasRemote: boolean; synced: boolean; noGit: boolean;
  }>('/save/status'),
  save: (message?: string) => post<{
    ok: boolean; commitSha: string; message: string;
    filesChanged: number; pushed: boolean; pushError?: string;
  }>('/save', { message }),
  getSaveHistory: (limit = 20) => get<Array<{
    sha: string; shortSha: string; message: string; date: string;
  }>>(`/save/history?limit=${limit}`),
  restoreSave: (sha: string, paths?: string[]) => post<{
    ok: boolean; commitSha: string; restoredFiles: string[];
  }>('/save/restore', { sha, paths }),
  initGit: () => post<{ ok: boolean; message: string }>('/save/init', {}),

  // Cost
  getCostSummary: () => get<{
    totalInputTokens: number; totalOutputTokens: number; totalCostUsd: number;
    byRole: Record<string, { inputTokens: number; outputTokens: number; costUsd: number }>;
  }>('/cost/summary'),
};
