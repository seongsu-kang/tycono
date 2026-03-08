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
 */
import { execSync } from 'node:child_process';

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

/**
 * Paths to include in save (relative to root).
 * Only AKB files — never user source code.
 * See: knowledge/data-persistence-architecture.md §2
 */
const SAVE_PATHS = [
  'roles/',
  'projects/',
  'knowledge/',
  'architecture/',
  'company/',
  'operations/standup/',
  'operations/waves/',
  'operations/decisions/',
  'operations/cost/',
  'operations/activity-streams/',
  '.claude/skills/',
  '.tycono/',
  'CLAUDE.md',
];

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

/** Check if directory is a git repository */
function isGitRepo(root: string): boolean {
  return run('git rev-parse --is-inside-work-tree', root) === 'true';
}

/** Initialize a new git repository */
export function gitInit(root: string): { ok: boolean; message: string } {
  if (isGitRepo(root)) {
    return { ok: true, message: 'Already a git repository' };
  }
  try {
    runOrThrow('git init', root);
    runOrThrow('git add -A', root);
    runOrThrow('git commit -m "Initial commit by Tycono"', root);
    return { ok: true, message: 'Git repository initialized with initial commit' };
  } catch (err) {
    return { ok: false, message: err instanceof Error ? err.message : 'git init failed' };
  }
}

/** Get current git status. Returns noGit=true if not a git repo. */
export function getGitStatus(root: string): GitStatus {
  if (!isGitRepo(root)) {
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

  const porcelain = run('git status --porcelain', root);
  const lines = porcelain ? porcelain.split('\n').filter(Boolean) : [];

  const modified: string[] = [];
  const untracked: string[] = [];

  for (const line of lines) {
    const status = line.substring(0, 2);
    const file = line.substring(3);
    // Filter to save paths only — never include user source code
    if (!SAVE_PATHS.some(p => file.startsWith(p))) continue;
    if (status.includes('?')) {
      untracked.push(file);
    } else {
      modified.push(file);
    }
  }

  let lastCommit: GitStatus['lastCommit'] = null;
  const logLine = run('git log -1 --format=%H%n%s%n%aI', root);
  if (logLine) {
    const [sha, message, date] = logLine.split('\n');
    if (sha) lastCommit = { sha, message: message ?? '', date: date ?? '' };
  }

  const branch = run('git rev-parse --abbrev-ref HEAD', root) || 'unknown';
  const hasRemote = !!run('git remote', root);

  let synced = true;
  if (hasRemote) {
    const local = run('git rev-parse HEAD', root);
    const remote = run(`git rev-parse origin/${branch}`, root);
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

/** Commit + push save-tracked files */
export function gitSave(root: string, message?: string): SaveResult {
  if (!isGitRepo(root)) {
    throw new Error('Not a git repository. Run "git init" first.');
  }

  const status = getGitStatus(root);
  if (!status.dirty) {
    throw new Error('No changes to save');
  }

  const allFiles = [...status.modified, ...status.untracked];

  // Stage only save-tracked files
  for (const file of allFiles) {
    runOrThrow(`git add "${file}"`, root);
  }

  const prefix = '[tycono] ';
  const commitMsg = message
    ? `${prefix}${message}`
    : `${prefix}Save — ${new Date().toISOString().slice(0, 16)} (${allFiles.length} files)`;
  runOrThrow(`git commit -m "${commitMsg.replace(/"/g, '\\"')}"`, root);

  const sha = run('git rev-parse HEAD', root);

  let pushed = false;
  let pushError: string | undefined;
  if (status.hasRemote) {
    try {
      runOrThrow(`git push origin ${status.branch}`, root);
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

/** Get commit history */
export function gitHistory(root: string, limit = 20): CommitInfo[] {
  if (!isGitRepo(root)) return [];

  const log = run(`git log --format=%H%n%h%n%s%n%aI -n ${limit}`, root);
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

/** Restore files from a previous commit (non-destructive: creates new commit) */
export function gitRestore(root: string, sha: string, paths?: string[]): RestoreResult {
  if (!isGitRepo(root)) {
    throw new Error('Not a git repository');
  }

  const targetPaths = paths?.length ? paths : SAVE_PATHS;
  const restoredFiles: string[] = [];

  for (const p of targetPaths) {
    try {
      runOrThrow(`git checkout ${sha} -- "${p}"`, root);
      restoredFiles.push(p);
    } catch {
      // Path may not exist in that commit — skip
    }
  }

  if (restoredFiles.length === 0) {
    throw new Error('No files could be restored from that commit');
  }

  const msg = `[tycono] Restore from ${sha.slice(0, 7)} (${restoredFiles.length} paths)`;
  runOrThrow('git add -A', root);
  runOrThrow(`git commit -m "${msg}"`, root);

  const newSha = run('git rev-parse HEAD', root);

  return { commitSha: newSha, restoredFiles };
}
