export type RepoType = 'akb' | 'code';
export interface GitStatus {
    dirty: boolean;
    modified: string[];
    untracked: string[];
    lastCommit: {
        sha: string;
        message: string;
        date: string;
    } | null;
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
 * Initialize a new git repository
 * @param root - AKB repository root (COMPANY_ROOT)
 * @param repo - Repository type ('akb' or 'code'), default 'akb'
 */
export declare function gitInit(root: string, repo?: RepoType): {
    ok: boolean;
    message: string;
    noGitBinary?: boolean;
};
/**
 * Get current git status. Returns noGit=true if not a git repo.
 * @param root - AKB repository root (COMPANY_ROOT)
 * @param repo - Repository type ('akb' or 'code'), default 'akb'
 */
export declare function getGitStatus(root: string, repo?: RepoType): GitStatus;
/**
 * Commit + push save-tracked files
 * @param root - AKB repository root (COMPANY_ROOT)
 * @param message - Optional commit message
 * @param repo - Repository type ('akb' or 'code'), default 'akb'
 */
export declare function gitSave(root: string, message?: string, repo?: RepoType): SaveResult;
/**
 * Get commit history
 * @param root - AKB repository root (COMPANY_ROOT)
 * @param limit - Maximum number of commits to retrieve
 * @param repo - Repository type ('akb' or 'code'), default 'akb'
 */
export declare function gitHistory(root: string, limit?: number, repo?: RepoType): CommitInfo[];
/**
 * Restore files from a previous commit (non-destructive: creates new commit)
 * @param root - AKB repository root (COMPANY_ROOT)
 * @param sha - Commit SHA to restore from
 * @param paths - Optional paths to restore (defaults to SAVE_PATHS for AKB, all for CODE)
 * @param repo - Repository type ('akb' or 'code'), default 'akb'
 */
export declare function gitRestore(root: string, sha: string, paths?: string[], repo?: RepoType): RestoreResult;
/**
 * Fetch remote and return ahead/behind status
 * @param root - AKB repository root (COMPANY_ROOT)
 * @param repo - Repository type ('akb' or 'code'), default 'akb'
 */
export declare function gitFetchStatus(root: string, repo?: RepoType): SyncStatus;
/**
 * Safe pull (fast-forward only)
 * @param root - AKB repository root (COMPANY_ROOT)
 * @param repo - Repository type ('akb' or 'code'), default 'akb'
 */
export declare function gitPull(root: string, repo?: RepoType): PullResult;
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
export declare function githubStatus(root: string, repo?: RepoType): GitHubStatus;
/**
 * Create a GitHub repo, set remote, and push
 */
export declare function githubCreateRepo(root: string, repoName: string, visibility?: 'private' | 'public', repo?: RepoType): GitHubCreateResult;
/**
 * Manually add a git remote
 */
export declare function gitAddRemote(root: string, url: string, repo?: RepoType): {
    ok: boolean;
    message: string;
};
