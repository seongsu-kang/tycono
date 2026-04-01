/* ─── Shared Types (re-export from single source of truth) ── */

export {
  type ActivityEventType,
  type ActivityEvent,
  type RoleStatus,
  type SessionStatus,
  type SessionSource,
  type MessageStatus,
  type WaveRoleStatus,
  type WaveNodeStatus,
  type StreamStatus,
  isRoleActive,
  isMessageActive,
  isWaveNodeActive,
  isMessageTerminal,
  eventTypeToMessageStatus,
  messageStatusToRoleStatus,
  canTransition,
} from '@shared/types';
import type { ActivityEvent, MessageStatus, SessionStatus, SessionSource, WaveRoleStatus } from '@shared/types';

/* ─── Frontend Types ─────────────────────── */

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
  directive: string;
  rolesCount: number;
  startedAt: string;
  commit?: { sha: string; message: string; committedAt: string };
  hasRunning?: boolean;
}

export interface WaveReplay {
  id: string;
  directive: string;
  startedAt: string;
  duration: number;
  roles: WaveReplayRole[];
  /** D-014: Server-generated wave ID */
  waveId?: string;
  /** D-014: Session IDs created for this wave (one per role) */
  sessionIds?: string[];
}

export interface WaveReplayRole {
  roleId: string;
  roleName: string;
  sessionId: string;
  status: WaveRoleStatus;
  events: ActivityEvent[];
  childSessions?: Array<{
    roleId: string;
    roleName: string;
    sessionId: string;
    status: WaveRoleStatus;
    events: ActivityEvent[];
  }>;
  isFollowUp?: boolean;
  followUpTask?: string;
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

export interface ImageAttachment {
  type: 'image';
  data: string;      // base64 encoded
  name: string;
  mediaType: 'image/png' | 'image/jpeg' | 'image/gif' | 'image/webp';
}

export interface Message {
  id: string;
  from: 'ceo' | 'role';
  content: string;
  thinking?: string;
  streamEvents?: StreamEvent[];
  type: 'conversation' | 'directive' | 'system';
  status?: MessageStatus;
  timestamp: string;
  attachments?: ImageAttachment[];

  /* D-014: Session-Centric extensions */
  events?: ActivityEvent[];
  dispatches?: Array<{ sessionId: string; roleId: string }>;
  readOnly?: boolean;
  turns?: number;
  tokens?: { input: number; output: number };
  knowledgeDebt?: Array<{ type: string; file?: string; message: string }>;
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
  level: 'c-level' | 'member';
  reportsTo: string;
  persona: string;
  authority: { autonomous: string[]; needsApproval: string[] };
  knowledge: { reads: string[]; writes: string[] };
  reports: { daily: string; weekly: string };
  skills?: string[];
  source?: RoleSource;
  skillContent?: import('./store').SkillExport;
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
  level: 'c-level' | 'member';
  reportsTo: string;
  children: string[];
}

export interface OrgTreeResponse {
  root: string;
  nodes: Record<string, OrgNode>;
  chart: string;
}

/* ─── Terminal Session Types ─────────────── */

export interface Session {
  id: string;
  roleId: string;
  title: string;
  mode: 'talk' | 'do';
  messages: Message[];
  status: SessionStatus;
  createdAt: string;
  updatedAt: string;
  source?: SessionSource;
  parentSessionId?: string;
  waveId?: string;
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
  language?: string;
  location?: string;
  codeRoot?: string;
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

export interface ImportRequest {
  paths: string[];
  companyRoot: string;
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
  sessionId: string;
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

/* ─── Active Session Types ──────────────────── */

export interface PortAllocation {
  api: number;
  vite: number;
  hmr?: number;
}

export interface ActiveSession {
  sessionId: string;
  roleId: string;
  task: string;
  ports: PortAllocation;
  worktreePath?: string;
  pid?: number;
  startedAt: string;
  status: 'active' | 'idle' | 'dead';
  messageStatus?: MessageStatus | null;
  roleName?: string;
  alive?: boolean | null;
}

export interface ActiveSessionsResponse {
  sessions: ActiveSession[];
  summary: { active: number; totalPorts: number };
}
