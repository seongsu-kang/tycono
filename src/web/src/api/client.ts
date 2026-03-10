import type { Company, Role, RoleDetail, Project, ProjectDetail, Standup, Wave, Decision, Session, CreateRoleInput, JobInfo, CompanyStatus, EngineDetection, PathValidation, ScaffoldInput, ScaffoldResult, TeamTemplate, BrowseResult, ConnectAkbResult, KnowledgeDoc, KnowledgeDocDetail, OrgTreeResponse, TrackedRole, CompanyStats, GitStatus, ActiveSessionsResponse, ActiveSession } from '../types';
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
  getWaveDetail: (id: string) => get<{ id: string; timestamp: string; content: string; replay?: import('../types').WaveReplay }>(`/operations/waves/${id}`),
  getDecisions: () => get<Decision[]>('/operations/decisions'),

  // Engine
  getOrgTree: () => get<OrgTreeResponse>('/engine/org'),

  // Skills
  getSkills: () => get<Array<{ id: string; name: string; description: string; source: string; installed: boolean }>>('/skills'),
  exportSkills: (roleId: string) => get<import('../types/store').SkillExport>(`/skills/export/${roleId}`),

  // Skill Registry (External)
  getSkillRegistry: () => get<Array<{ source: string; label: string; skills: Array<{ id: string; name: string; description: string; category: string; url: string; installed: boolean }> }>>('/skills/registry'),
  installRegistrySkill: (skillId: string, url: string) => post<{ ok: boolean; skillId: string }>('/skills/registry/install', { skillId, url }),

  // Roles (Engine)
  createRole: (input: CreateRoleInput) =>
    post<{ ok: boolean; roleId: string }>('/engine/roles', input),
  updateRole: (id: string, changes: { name?: string; persona?: string }) =>
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
  startJob: (params: { type?: string; roleId?: string; task?: string; directive?: string; sourceRole?: string; readOnly?: boolean; targetRole?: string; targetRoles?: string[] }) =>
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
  replyToJob: (id: string, message: string) =>
    post<{ jobId: string; roleId: string }>(`/jobs/${id}/reply`, { message }),
  saveWave: (params: { directive: string; jobIds: string[] }) =>
    post<{ ok: boolean; path: string }>('/waves/save', params),

  // Setup / Onboarding
  getStatus: () => get<CompanyStatus>('/status'),
  detectEngine: () => post<EngineDetection>('/setup/detect-engine', {}),
  validatePath: (path: string) => post<PathValidation>('/setup/validate-path', { path }),
  scaffold: (input: ScaffoldInput) => post<ScaffoldResult>('/setup/scaffold', input),
  getTeams: () => get<TeamTemplate[]>('/setup/teams'),
  browse: (path?: string) => post<BrowseResult>('/setup/browse', { path }),
  connectAkb: (path: string) => post<ConnectAkbResult>('/setup/connect-akb', { path }),
  getRequiredTools: (team: string) => post<{ tools: Array<{ package: string; binary: string; installCmd: string; skillId: string; installed: boolean }> }>('/setup/required-tools', { team }),
  installTools: (team: string, onEvent: (event: string, data: Record<string, unknown>) => void): Promise<void> => {
    return fetch(`${BASE}/setup/install-tools`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ team }),
    }).then(res => {
      const reader = res.body?.getReader();
      if (!reader) return;
      const decoder = new TextDecoder();
      let buffer = '';

      const read = (): Promise<void> => reader.read().then(({ done, value }) => {
        if (done) return;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';
        let currentEvent = '';
        for (const line of lines) {
          if (line.startsWith('event: ')) currentEvent = line.slice(7);
          else if (line.startsWith('data: ') && currentEvent) {
            try { onEvent(currentEvent, JSON.parse(line.slice(6))); } catch { /* ignore */ }
            currentEvent = '';
          }
        }
        return read();
      });

      return read();
    });
  },

  // Knowledge Base
  getKnowledge: () => get<KnowledgeDoc[]>('/knowledge'),
  getKnowledgeDoc: (id: string) => {
    // Encode each path segment to handle special characters while preserving slashes
    const encodedPath = id.split('/').map(encodeURIComponent).join('/');
    return get<KnowledgeDocDetail>(`/knowledge/${encodedPath}`);
  },
  createKnowledgeDoc: (params: { filename: string; title: string; category?: string; content?: string }) =>
    post<{ id: string; title: string }>('/knowledge', params),
  updateKnowledgeDoc: (id: string, content: string) => {
    const encodedPath = id.split('/').map(encodeURIComponent).join('/');
    return fetch(`${BASE}/knowledge/${encodedPath}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content }),
    }).then(r => { if (!r.ok) throw new Error(`API error: ${r.status}`); return r.json(); });
  },
  deleteKnowledgeDoc: (id: string) => {
    const encodedPath = id.split('/').map(encodeURIComponent).join('/');
    return del<{ id: string; status: string }>(`/knowledge/${encodedPath}`);
  },

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
  getSaveStatus: (repo: 'akb' | 'code' = 'akb') => get<{
    dirty: boolean; modified: string[]; untracked: string[];
    lastCommit: { sha: string; message: string; date: string } | null;
    branch: string; hasRemote: boolean; synced: boolean; noGit: boolean;
  }>(`/save/status?repo=${repo}`),
  save: (message?: string, repo: 'akb' | 'code' = 'akb') => post<{
    ok: boolean; commitSha: string; message: string;
    filesChanged: number; pushed: boolean; pushError?: string;
  }>(`/save?repo=${repo}`, { message }),
  getSaveHistory: (limit = 20, repo: 'akb' | 'code' = 'akb') => get<Array<{
    sha: string; shortSha: string; message: string; date: string;
  }>>(`/save/history?limit=${limit}&repo=${repo}`),
  restoreSave: (sha: string, paths?: string[], repo: 'akb' | 'code' = 'akb') => post<{
    ok: boolean; commitSha: string; restoredFiles: string[];
  }>(`/save/restore?repo=${repo}`, { sha, paths }),
  initGit: () => post<{ ok: boolean; message: string }>('/save/init', {}),

  // Git Sync
  getSyncStatus: (repo: 'akb' | 'code' = 'akb') => get<{
    ahead: number; behind: number; branch: string; remote: string; hasRemote: boolean;
  }>(`/save/sync-status?repo=${repo}`),
  pull: async (repo: 'akb' | 'code' = 'akb') => {
    const res = await fetch(`${BASE}/save/pull?repo=${repo}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: '{}',
    });
    const data = await res.json();
    return data as {
      status: 'ok' | 'dirty' | 'diverged' | 'up-to-date' | 'no-remote' | 'error';
      message: string; commits?: number; behind?: number; ahead?: number;
    };
  },

  // GitHub Integration
  getGithubStatus: (repo: 'akb' | 'code' = 'akb') => get<{
    ghInstalled: boolean; authenticated: boolean; username?: string;
    hasRemote: boolean; remoteUrl?: string;
  }>(`/save/github-status?repo=${repo}`),
  githubCreateRepo: (name: string, visibility: 'private' | 'public' = 'private', repo: 'akb' | 'code' = 'akb') =>
    post<{ ok: boolean; message: string; repoUrl?: string; remoteUrl?: string }>(
      `/save/github-create-repo?repo=${repo}`, { name, visibility }),
  addRemote: (url: string, repo: 'akb' | 'code' = 'akb') =>
    post<{ ok: boolean; message: string }>(`/save/remote?repo=${repo}`, { url }),

  // Code Root
  setCodeRoot: async (codeRoot: string) => {
    const res = await fetch(`${BASE}/setup/code-root`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ codeRoot }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || `API error: ${res.status}`);
    return data as { ok: boolean; codeRoot: string; isGitRepo: boolean };
  },
  getCodeRoot: () => get<{ codeRoot: string | null }>('/setup/code-root'),

  // Cost
  getCostSummary: () => get<{
    totalInputTokens: number; totalOutputTokens: number; totalCostUsd: number;
    byRole: Record<string, { inputTokens: number; outputTokens: number; costUsd: number }>;
  }>('/cost/summary'),

  // Sync
  getSyncRoles: () => get<{ roles: TrackedRole[] }>('/sync/roles'),
  applySyncUpdate: (data: {
    roleId: string;
    changes: { persona?: string; authority?: { autonomous: string[]; needsApproval: string[] }; skills?: string[] };
    upstreamVersion?: string;
  }) => post<{ ok: boolean; roleId: string; applied: string[] }>('/sync/apply', data),

  // Stats (Gamification)
  getCompanyStats: () => get<CompanyStats>('/sync/stats'),

  // Coins
  getCoins: () => get<{ balance: number; totalEarned: number; totalSpent: number; transactions: Array<{ ts: string; amount: number; reason: string; ref?: string }> }>('/coins'),
  earnCoins: (amount: number, reason: string, ref?: string) =>
    post<{ ok: boolean; balance: number; transaction: { ts: string; amount: number; reason: string } }>('/coins/earn', { amount, reason, ref }),
  spendCoins: (amount: number, reason: string, ref?: string) =>
    post<{ ok: boolean; balance: number; transaction: { ts: string; amount: number; reason: string } }>('/coins/spend', { amount, reason, ref }),
  migrateCoins: (completedQuests: number) =>
    post<{ ok: boolean; balance: number; granted?: number; reason?: string; skipped?: boolean }>('/coins/migrate', { completedQuests }),

  // Quests
  getQuestProgress: () => get<{ completedQuests: string[]; activeChapter: number; sideQuestsCompleted: string[]; firstCompletedAt?: string }>('/quests/progress'),
  saveQuestProgress: (data: { completedQuests: string[]; activeChapter: number; sideQuestsCompleted: string[]; firstCompletedAt?: string }) =>
    fetch(`${BASE}/quests/progress`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) }).then(r => r.json()),

  // Active Sessions (Port Registry)
  getActiveSessions: () => get<ActiveSessionsResponse>('/active-sessions'),
  getActiveSession: (id: string) => get<ActiveSession>(`/active-sessions/${id}`),
  registerActiveSession: (data: { sessionId: string; roleId: string; task?: string; pid?: number; worktreePath?: string }) =>
    post<{ ok: boolean; ports: { api: number; vite: number; hmr?: number }; existing: boolean }>('/active-sessions/register', data),
  deleteActiveSession: (id: string) => del<{ ok: boolean; released: { api: number; vite: number } }>(`/active-sessions/${id}`),
  cleanupActiveSessions: () => post<{ cleaned: number; remaining: number }>('/active-sessions/cleanup', {}),

  // Git Status
  getGitStatus: () => get<GitStatus>('/git/status'),
  deleteWorktree: (path: string) => del<{ ok: boolean }>(`/git/worktrees/${encodeURIComponent(path)}`),
  deleteBranch: (name: string) => del<{ ok: boolean }>(`/git/branches/${encodeURIComponent(name)}`),
};
