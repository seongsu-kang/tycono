export interface Role {
  id: string;
  name: string;
  level: string;
  reportsTo: string;
  status: string;
}

export interface RoleDetail extends Role {
  persona: string;
  authority: {
    autonomous: string[];
    needsApproval: string[];
  };
  journal: string;
}

export interface Project {
  id: string;
  name: string;
  status: string;
  created: string;
}

export interface Task {
  id: string;
  title: string;
  role: string;
  status: string;
  description: string;
}

export interface ProjectDetail extends Project {
  prd: string;
  tasks: Task[];
}

export interface Standup {
  date: string;
  content: string;
}

export interface Wave {
  id: string;
  timestamp: string;
  content: string;
}

export interface Decision {
  id: string;
  title: string;
  date: string;
  content: string;
}

export interface Company {
  name: string;
  domain: string;
  founded: string;
  mission: string;
  roles: Role[];
}

/* ─── Stream Event Types ───────────────── */

export interface StreamEvent {
  type: 'thinking' | 'tool' | 'dispatch' | 'dispatch:progress' | 'turn';
  timestamp: number;
  text?: string;
  toolName?: string;
  toolInput?: Record<string, unknown>;
  roleId?: string;
  task?: string;
  turn?: number;
  progressType?: string; // 'text' | 'thinking' | 'tool' | 'done' | 'error'
}

/* ─── Terminal Session Types ─────────────── */

export interface Message {
  id: string;
  from: 'ceo' | 'role';
  content: string;
  thinking?: string;
  streamEvents?: StreamEvent[];
  type: 'conversation' | 'directive' | 'system';
  status?: 'streaming' | 'done' | 'error';
  timestamp: string;
}

export interface RoleSource {
  id: string;
  sync: 'auto' | 'manual' | 'off';
  forked_at?: string;
  upstream_version?: string;
}

export interface CreateRoleInput {
  id: string;
  name: string;
  level: 'c-level' | 'team-lead' | 'member';
  reportsTo: string;
  persona: string;
  authority: { autonomous: string[]; needsApproval: string[] };
  knowledge: { reads: string[]; writes: string[] };
  reports: { daily: string; weekly: string };
  skills?: string[];
  source?: RoleSource;
}

/* ─── Sync Types ────────────────────────── */

export interface TrackedRole {
  roleId: string;
  name: string;
  level: string;
  source: RoleSource;
  persona: string;
  authority: { autonomous: string[]; needsApproval: string[] };
  skills?: string[];
}

export interface RoleLevelInfo {
  roleId: string;
  name: string;
  level: number;
  totalTokens: number;
  progress: number;
  formattedTokens: string;
  costUsd: number;
}

export interface CompanyStats {
  company: {
    roleCount: number;
    totalTokens: number;
    formattedTokens: string;
    totalCostUsd: number;
    avgLevel: number;
  };
  roles: RoleLevelInfo[];
  byModel: Record<string, { inputTokens: number; outputTokens: number; costUsd: number }>;
}

/* ─── Org Tree Types ─────────────────────── */

export interface OrgNode {
  id: string;
  name: string;
  level: 'c-level' | 'team-lead' | 'member';
  reportsTo: string;
  children: string[];
}

export interface OrgTreeResponse {
  root: string;
  nodes: Record<string, OrgNode>;
  chart: string;
}

/* ─── Activity Stream Types ──────────────── */

export type ActivityEventType =
  | 'job:start' | 'job:done' | 'job:error'
  | 'text' | 'thinking'
  | 'tool:start' | 'tool:result'
  | 'dispatch:start' | 'dispatch:done'
  | 'turn:complete'
  | 'import:scan' | 'import:process' | 'import:created'
  | 'stderr';

export interface ActivityEvent {
  seq: number;
  ts: string;
  type: ActivityEventType;
  roleId: string;
  parentJobId?: string;
  data: Record<string, unknown>;
}

export type JobType = 'assign' | 'wave' | 'session-message';
export type JobStatus = 'running' | 'done' | 'error';

export interface JobInfo {
  id: string;
  type: JobType;
  roleId: string;
  task: string;
  status: JobStatus;
  parentJobId?: string;
  childJobIds: string[];
  createdAt: string;
}

/* ─── Terminal Session Types ─────────────── */

export interface Session {
  id: string;
  roleId: string;
  title: string;
  mode: 'talk' | 'do';
  messages: Message[];
  status: 'active' | 'closed';
  createdAt: string;
  updatedAt: string;
}

/* ─── Onboarding / Setup Types ──────────── */

export interface CompanyStatus {
  initialized: boolean;
  companyName: string | null;
  engine: string;
  companyRoot: string;
  hasApiKey?: boolean;
}

export interface EngineDetection {
  claudeCli: boolean;
  apiKey: boolean;
  recommended: 'claude-cli' | 'direct-api' | 'none';
}

export interface PathValidation {
  valid: boolean;
  path?: string;
  hasClaudeMd?: boolean;
  files?: string[];
  error?: string;
}

export interface ScaffoldInput {
  companyName: string;
  description: string;
  apiKey?: string;
  team: 'startup' | 'research' | 'agency' | 'custom';
  existingProjectPath?: string;
  knowledgePaths?: string[];
}

export interface ScaffoldResult {
  ok: boolean;
  companyName: string;
  projectRoot: string;
  created: string[];
}

export interface TeamTemplate {
  id: string;
  roles: { id: string; name: string; level: string }[];
}

export interface BrowseResult {
  current: string;
  parent: string | null;
  dirs: { name: string; path: string }[];
  hasClaudeMd: boolean;
}

/* ─── Knowledge Import Types ─────────────────── */

export interface ImportJob {
  paths: string[];
  companyRoot: string;
}

export interface KnowledgeImportEvent {
  type: 'scanning' | 'processing' | 'created' | 'done' | 'error';
  path?: string;
  fileCount?: number;
  file?: string;
  index?: number;
  total?: number;
  title?: string;
  summary?: string;
  imported?: number;
  created?: number;
  skipped?: number;
  message?: string;
}

export interface ConnectAkbResult {
  ok: boolean;
  companyName: string;
  companyRoot: string;
  error?: string;
}

/* ─── Knowledge Base Types ────────────────────── */

export interface KnowledgeDoc {
  id: string;
  title: string;
  akb_type: 'hub' | 'node';
  status: 'active' | 'draft' | 'deprecated';
  tags: string[];
  category: string;
  tldr: string;
  links: { text: string; href: string }[];
  format?: 'md' | 'html';
}

export interface KnowledgeDocDetail extends KnowledgeDoc {
  content: string;
}

/* ─── Git Status Types ───────────────────────── */

export interface WorktreeInfo {
  jobId: string;
  path: string;
  branch: string;
  status: 'active' | 'done' | 'pending-merge' | 'stale';
  createdAt: string;
  roleId: string;
  task: string;
  filesChanged: number;
  aheadBy: number;
  conflictFiles?: string[];
}

export interface GitStatus {
  currentBranch: string;
  worktrees: WorktreeInfo[];
  staleBranches: string[];
  lastCommit: { sha: string; message: string; date: string } | null;
  unsavedCount: number;
  lastMerge?: {
    branch: string;
    mergedAt: string;
    roleId: string;
  };
}
