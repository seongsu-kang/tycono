/**
 * git-save.ts — Git commit + push 기반 세이브 시스템
 *
 * 모든 진행 상황을 GitHub에 영속화한다.
 * 의존성 0: child_process.execSync만 사용.
 *
 * 핵심 원칙 (data-persistence-architecture.md):
 * - SAVE_PATHS의 AKB 파일만 stage (유저 소스코드 미포함)
 * - git 없으면 graceful 비활성화
 * - remote 없으면 commit만 (push skip)
 *
 * Dual-Repo Support (DG-001):
 * - repo='akb': AKB repo (COMPANY_ROOT), SAVE_PATHS 필터 적용
 * - repo='code': Code repo (codeRoot), SAVE_PATHS 필터 비활성화
 */
import { execSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { resolveCodeRoot } from './company-config.js';

export type RepoType = 'akb' | 'code';

export interface GitStatus {
  dirty: boolean;
  modified: string[];
  untracked: string[];
  lastCommit: { sha: string; message: string; date: string } | null;
  branch: string;
  hasRemote: boolean;
  synced: boolean;
  noGit: boolean;
}

export interface SaveResult {
  commitSha: string;
  message: string;
  filesChanged: number;
  pushed: boolean;
  pushError?: string;
}

export interface CommitInfo {
  sha: string;
  shortSha: string;
  message: string;
  date: string;
}

export interface RestoreResult {
  commitSha: string;
  restoredFiles: string[];
}

export interface PullResult {
  status: 'ok' | 'dirty' | 'diverged' | 'up-to-date' | 'no-remote' | 'error';
  message: string;
  commits?: number;
  behind?: number;
  ahead?: number;
}

export interface SyncStatus {
  ahead: number;
  behind: number;
  branch: string;
  remote: string;
  hasRemote: boolean;
}

/**
 * Paths to include in save (relative to root).
 * Only AKB files — never user source code.
 * See: knowledge/data-persistence-architecture.md §2
 */
const SAVE_PATHS = [
  'knowledge/',
  '.claude/skills/',
  '.tycono/',
  'CLAUDE.md',
];

/**
 * Resolve repository root based on repo type
 * @param akbRoot - AKB repository root (COMPANY_ROOT)
 * @param repo - Repository type ('akb' or 'code')
 * @returns Resolved repository root path
 */
function resolveRepoRoot(akbRoot: string, repo: RepoType = 'akb'): string {
  if (repo === 'akb') {
    return akbRoot;
  }
  return resolveCodeRoot(akbRoot);
}

/**
 * Check if SAVE_PATHS filter should be applied
 * @param repo - Repository type
 * @returns true if filter should be applied (AKB only)
 */
function shouldFilterPaths(repo: RepoType = 'akb'): boolean {
  return repo === 'akb';
}

function run(cmd: string, cwd: string): string {
  try {
    return execSync(cmd, { cwd, encoding: 'utf-8', timeout: 5000, stdio: ['pipe', 'pipe', 'pipe'] }).trim();
  } catch {
    return '';
  }
}

function runOrThrow(cmd: string, cwd: string): string {
  return execSync(cmd, { cwd, encoding: 'utf-8', timeout: 5000, stdio: ['pipe', 'pipe', 'pipe'] }).trim();
}

/** Check if git binary is available */
function isGitAvailable(): boolean {
  try {
    execSync('git --version', { timeout: 3000, stdio: ['pipe', 'pipe', 'pipe'] });
    return true;
  } catch {
    return false;
  }
}

/** Check if directory is (or is inside) a git repository */
function isGitRepo(root: string): boolean {
  return run('git rev-parse --is-inside-work-tree', root) === 'true';
}

/** Check if directory is the root of its own git repository (has .git here) */
function isGitRoot(root: string): boolean {
  const toplevel = run('git rev-parse --show-toplevel', root);
  if (!toplevel) return false;
  return resolve(toplevel) === resolve(root);
}

/**
 * Initialize a new git repository
 * @param root - AKB repository root (COMPANY_ROOT)
 * @param repo - Repository type ('akb' or 'code'), default 'akb'
 */
export function gitInit(root: string, repo: RepoType = 'akb'): { ok: boolean; message: string; noGitBinary?: boolean } {
  if (!isGitAvailable()) {
    return { ok: false, message: 'git is not installed', noGitBinary: true };
  }

  const repoRoot = resolveRepoRoot(root, repo);

  if (isGitRoot(repoRoot)) {
    return { ok: true, message: 'Already a git repository' };
  }
  try {
    runOrThrow('git init', repoRoot);
    runOrThrow('git add -A', repoRoot);
    runOrThrow('git commit -m "Initial commit by Tycono"', repoRoot);
    return { ok: true, message: 'Git repository initialized with initial commit' };
  } catch (err) {
    return { ok: false, message: err instanceof Error ? err.message : 'git init failed' };
  }
}

/**
 * Get current git status. Returns noGit=true if not a git repo.
 * @param root - AKB repository root (COMPANY_ROOT)
 * @param repo - Repository type ('akb' or 'code'), default 'akb'
 */
export function getGitStatus(root: string, repo: RepoType = 'akb'): GitStatus {
  const repoRoot = resolveRepoRoot(root, repo);

  if (!isGitRoot(repoRoot)) {
    return {
      dirty: false,
      modified: [],
      untracked: [],
      lastCommit: null,
      branch: '',
      hasRemote: false,
      synced: false,
      noGit: true,
    };
  }

  const porcelain = run('git status --porcelain', repoRoot);
  const lines = porcelain ? porcelain.split('\n').filter(Boolean) : [];

  const modified: string[] = [];
  const untracked: string[] = [];
  const applyFilter = shouldFilterPaths(repo);

  for (const line of lines) {
    const status = line.substring(0, 2);
    const file = line.substring(3);

    // For CODE repo, include all files; for AKB, filter to SAVE_PATHS only
    if (applyFilter && !SAVE_PATHS.some(p => file.startsWith(p))) {
      continue;
    }

    if (status.includes('?')) {
      untracked.push(file);
    } else {
      modified.push(file);
    }
  }

  let lastCommit: GitStatus['lastCommit'] = null;
  const logLine = run('git log -1 --format=%H%n%s%n%aI', repoRoot);
  if (logLine) {
    const [sha, message, date] = logLine.split('\n');
    if (sha) lastCommit = { sha, message: message ?? '', date: date ?? '' };
  }

  const branch = run('git rev-parse --abbrev-ref HEAD', repoRoot) || 'unknown';
  const hasRemote = !!run('git remote', repoRoot);

  let synced = true;
  if (hasRemote) {
    const local = run('git rev-parse HEAD', repoRoot);
    const remote = run(`git rev-parse origin/${branch}`, repoRoot);
    synced = !!local && local === remote;
  }

  return {
    dirty: modified.length > 0 || untracked.length > 0,
    modified,
    untracked,
    lastCommit,
    branch,
    hasRemote,
    synced,
    noGit: false,
  };
}

/**
 * Commit + push save-tracked files
 * @param root - AKB repository root (COMPANY_ROOT)
 * @param message - Optional commit message
 * @param repo - Repository type ('akb' or 'code'), default 'akb'
 */
export function gitSave(root: string, message?: string, repo: RepoType = 'akb'): SaveResult {
  const repoRoot = resolveRepoRoot(root, repo);

  if (!isGitRoot(repoRoot)) {
    throw new Error('Not a git repository. Run "git init" first.');
  }

  const status = getGitStatus(root, repo);
  if (!status.dirty) {
    throw new Error('No changes to save');
  }

  const allFiles = [...status.modified, ...status.untracked];

  // Stage files
  for (const file of allFiles) {
    runOrThrow(`git add "${file}"`, repoRoot);
  }

  const prefix = '[tycono] ';
  const commitMsg = message
    ? `${prefix}${message}`
    : `${prefix}Save — ${new Date().toISOString().slice(0, 16)} (${allFiles.length} files)`;
  runOrThrow(`git commit -m "${commitMsg.replace(/"/g, '\\"')}"`, repoRoot);

  const sha = run('git rev-parse HEAD', repoRoot);

  let pushed = false;
  let pushError: string | undefined;
  if (status.hasRemote) {
    try {
      runOrThrow(`git push origin ${status.branch}`, repoRoot);
      pushed = true;
    } catch (err) {
      pushError = err instanceof Error ? err.message : 'Push failed';
    }
  }

  return {
    commitSha: sha,
    message: commitMsg,
    filesChanged: allFiles.length,
    pushed,
    pushError,
  };
}

/**
 * Get commit history
 * @param root - AKB repository root (COMPANY_ROOT)
 * @param limit - Maximum number of commits to retrieve
 * @param repo - Repository type ('akb' or 'code'), default 'akb'
 */
export function gitHistory(root: string, limit = 20, repo: RepoType = 'akb'): CommitInfo[] {
  const repoRoot = resolveRepoRoot(root, repo);

  if (!isGitRoot(repoRoot)) return [];

  const log = run(`git log --format=%H%n%h%n%s%n%aI -n ${limit}`, repoRoot);
  if (!log) return [];

  const lines = log.split('\n');
  const commits: CommitInfo[] = [];

  for (let i = 0; i + 3 < lines.length; i += 4) {
    commits.push({
      sha: lines[i],
      shortSha: lines[i + 1],
      message: lines[i + 2],
      date: lines[i + 3],
    });
  }

  return commits;
}

/**
 * Restore files from a previous commit (non-destructive: creates new commit)
 * @param root - AKB repository root (COMPANY_ROOT)
 * @param sha - Commit SHA to restore from
 * @param paths - Optional paths to restore (defaults to SAVE_PATHS for AKB, all for CODE)
 * @param repo - Repository type ('akb' or 'code'), default 'akb'
 */
export function gitRestore(root: string, sha: string, paths?: string[], repo: RepoType = 'akb'): RestoreResult {
  const repoRoot = resolveRepoRoot(root, repo);

  if (!isGitRoot(repoRoot)) {
    throw new Error('Not a git repository');
  }

  // For CODE repo without explicit paths, restore everything (use '.')
  // For AKB repo, use SAVE_PATHS
  const targetPaths = paths?.length ? paths : (repo === 'code' ? ['.'] : SAVE_PATHS);
  const restoredFiles: string[] = [];

  for (const p of targetPaths) {
    try {
      runOrThrow(`git checkout ${sha} -- "${p}"`, repoRoot);
      restoredFiles.push(p);
    } catch {
      // Path may not exist in that commit — skip
    }
  }

  if (restoredFiles.length === 0) {
    throw new Error('No files could be restored from that commit');
  }

  const msg = `[tycono] Restore from ${sha.slice(0, 7)} (${restoredFiles.length} paths)`;
  runOrThrow('git add -A', repoRoot);
  runOrThrow(`git commit -m "${msg}"`, repoRoot);

  const newSha = run('git rev-parse HEAD', repoRoot);

  return { commitSha: newSha, restoredFiles };
}

/**
 * Fetch remote and return ahead/behind status
 * @param root - AKB repository root (COMPANY_ROOT)
 * @param repo - Repository type ('akb' or 'code'), default 'akb'
 */
export function gitFetchStatus(root: string, repo: RepoType = 'akb'): SyncStatus {
  const repoRoot = resolveRepoRoot(root, repo);

  if (!isGitRoot(repoRoot)) {
    return { ahead: 0, behind: 0, branch: '', remote: '', hasRemote: false };
  }

  const branch = run('git rev-parse --abbrev-ref HEAD', repoRoot) || 'unknown';
  const hasRemote = !!run('git remote', repoRoot);

  if (!hasRemote) {
    return { ahead: 0, behind: 0, branch, remote: '', hasRemote: false };
  }

  // Fetch from remote (timeout 15s for network)
  try {
    execSync('git fetch origin', { cwd: repoRoot, encoding: 'utf-8', timeout: 15000, stdio: ['pipe', 'pipe', 'pipe'] });
  } catch {
    // Fetch failed (no network, etc.) — return what we know
    return { ahead: 0, behind: 0, branch, remote: 'origin', hasRemote: true };
  }

  // Count ahead/behind
  const revList = run(`git rev-list --left-right --count HEAD...origin/${branch}`, repoRoot);
  let ahead = 0;
  let behind = 0;
  if (revList) {
    const parts = revList.split(/\s+/);
    ahead = parseInt(parts[0], 10) || 0;
    behind = parseInt(parts[1], 10) || 0;
  }

  return { ahead, behind, branch, remote: 'origin', hasRemote: true };
}

/**
 * Safe pull (fast-forward only)
 * @param root - AKB repository root (COMPANY_ROOT)
 * @param repo - Repository type ('akb' or 'code'), default 'akb'
 */
export function gitPull(root: string, repo: RepoType = 'akb'): PullResult {
  const repoRoot = resolveRepoRoot(root, repo);

  if (!isGitRoot(repoRoot)) {
    return { status: 'error', message: 'Not a git repository' };
  }

  const branch = run('git rev-parse --abbrev-ref HEAD', repoRoot) || 'unknown';
  const hasRemote = !!run('git remote', repoRoot);

  if (!hasRemote) {
    return { status: 'no-remote', message: 'No remote configured' };
  }

  // Fetch first
  try {
    execSync('git fetch origin', { cwd: repoRoot, encoding: 'utf-8', timeout: 15000, stdio: ['pipe', 'pipe', 'pipe'] });
  } catch {
    return { status: 'error', message: 'Failed to fetch from remote' };
  }

  // Check for uncommitted changes
  const porcelain = run('git status --porcelain', repoRoot);
  if (porcelain) {
    return { status: 'dirty', message: 'Uncommitted changes — save or stash before pulling' };
  }

  // Check ahead/behind
  const revList = run(`git rev-list --left-right --count HEAD...origin/${branch}`, repoRoot);
  let ahead = 0;
  let behind = 0;
  if (revList) {
    const parts = revList.split(/\s+/);
    ahead = parseInt(parts[0], 10) || 0;
    behind = parseInt(parts[1], 10) || 0;
  }

  if (behind === 0) {
    return { status: 'up-to-date', message: 'Already up to date', ahead, behind: 0 };
  }

  if (ahead > 0 && behind > 0) {
    return { status: 'diverged', message: `Branches diverged (${ahead} ahead, ${behind} behind) — manual merge needed`, ahead, behind };
  }

  // Safe fast-forward pull
  try {
    runOrThrow(`git pull --ff-only origin ${branch}`, repoRoot);
    return { status: 'ok', message: `Pulled ${behind} commit(s)`, commits: behind, ahead: 0, behind: 0 };
  } catch (err) {
    return { status: 'error', message: err instanceof Error ? err.message : 'Pull failed' };
  }
}

// ─── GitHub Integration ───────────────────────────

export interface GitHubStatus {
  ghInstalled: boolean;
  authenticated: boolean;
  username?: string;
  hasRemote: boolean;
  remoteUrl?: string;
}

export interface GitHubCreateResult {
  ok: boolean;
  message: string;
  repoUrl?: string;
  remoteUrl?: string;
}

/**
 * Check GitHub CLI availability and auth status
 */
export function githubStatus(root: string, repo: RepoType = 'akb'): GitHubStatus {
  // Check gh CLI
  let ghInstalled = false;
  try {
    execSync('gh --version', { timeout: 3000, stdio: ['pipe', 'pipe', 'pipe'] });
    ghInstalled = true;
  } catch {
    // gh not installed
  }

  if (!ghInstalled) {
    return { ghInstalled: false, authenticated: false, hasRemote: false };
  }

  // Check auth
  let authenticated = false;
  let username: string | undefined;
  try {
    const status = execSync('gh auth status', {
      timeout: 5000, encoding: 'utf-8', stdio: ['pipe', 'pipe', 'pipe'],
    }).trim();
    authenticated = true;
    const match = status.match(/Logged in to github\.com account (\S+)/i)
      ?? status.match(/account (\S+)/i);
    if (match) username = match[1];
  } catch (err) {
    // gh auth status exits 1 if not logged in, but still outputs info to stderr
    const output = err instanceof Error ? (err as { stderr?: string }).stderr ?? '' : '';
    if (output.includes('Logged in')) {
      authenticated = true;
      const match = output.match(/account (\S+)/i);
      if (match) username = match[1];
    }
  }

  // Check remote
  let hasRemote = false;
  let remoteUrl: string | undefined;
  try {
    const repoRoot = resolveRepoRoot(root, repo);
    if (isGitRoot(repoRoot)) {
      remoteUrl = run('git remote get-url origin', repoRoot) || undefined;
      hasRemote = !!remoteUrl;
    }
  } catch {
    // ignore
  }

  return { ghInstalled, authenticated, username, hasRemote, remoteUrl };
}

/**
 * Create a GitHub repo, set remote, and push
 */
export function githubCreateRepo(
  root: string,
  repoName: string,
  visibility: 'private' | 'public' = 'private',
  repo: RepoType = 'akb',
): GitHubCreateResult {
  const repoRoot = resolveRepoRoot(root, repo);

  // Auto-init git if not a proper git root (e.g. fresh init, or nested inside parent repo)
  if (!isGitRoot(repoRoot)) {
    const initResult = gitInit(root, repo);
    if (!initResult.ok) {
      return { ok: false, message: initResult.message };
    }
  }

  // Check gh + auth
  const status = githubStatus(root, repo);
  if (!status.ghInstalled) {
    return { ok: false, message: 'GitHub CLI (gh) is not installed' };
  }
  if (!status.authenticated) {
    return { ok: false, message: 'Not logged in to GitHub — run "gh auth login" first' };
  }
  if (status.hasRemote) {
    return { ok: false, message: `Remote already configured: ${status.remoteUrl}` };
  }

  // Create repo + set remote + push
  try {
    const flag = visibility === 'public' ? '--public' : '--private';
    const result = execSync(
      `gh repo create "${repoName}" ${flag} --source=. --remote=origin --push`,
      { cwd: repoRoot, encoding: 'utf-8', timeout: 30000, stdio: ['pipe', 'pipe', 'pipe'] },
    ).trim();

    // Extract repo URL from output
    const urlMatch = result.match(/(https:\/\/github\.com\/\S+)/);
    const repoUrl = urlMatch ? urlMatch[1] : undefined;
    const remoteUrl = run('git remote get-url origin', repoRoot) || undefined;

    return { ok: true, message: 'Repository created and pushed', repoUrl, remoteUrl };
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Failed to create repository';
    // Common errors
    if (msg.includes('already exists')) {
      return { ok: false, message: 'A repository with this name already exists on GitHub' };
    }
    return { ok: false, message: msg };
  }
}

/**
 * Manually add a git remote
 */
export function gitAddRemote(root: string, url: string, repo: RepoType = 'akb'): { ok: boolean; message: string } {
  const repoRoot = resolveRepoRoot(root, repo);

  if (!isGitRoot(repoRoot)) {
    return { ok: false, message: 'Not a git repository' };
  }

  const existing = run('git remote get-url origin', repoRoot);
  if (existing) {
    return { ok: false, message: `Remote already configured: ${existing}` };
  }

  try {
    runOrThrow(`git remote add origin "${url}"`, repoRoot);
    // Try initial push
    const branch = run('git rev-parse --abbrev-ref HEAD', repoRoot) || 'main';
    try {
      execSync(`git push -u origin ${branch}`, {
        cwd: repoRoot, encoding: 'utf-8', timeout: 15000, stdio: ['pipe', 'pipe', 'pipe'],
      });
      return { ok: true, message: `Remote added and pushed to ${url}` };
    } catch {
      return { ok: true, message: `Remote added: ${url} (push failed — check credentials)` };
    }
  } catch (err) {
    return { ok: false, message: err instanceof Error ? err.message : 'Failed to add remote' };
  }
}
