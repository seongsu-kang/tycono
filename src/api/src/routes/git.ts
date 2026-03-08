import { Router, Request, Response, NextFunction } from 'express';
import { execSync } from 'node:child_process';
import { COMPANY_ROOT } from '../services/file-reader.js';

export const gitRouter = Router();

interface WorktreeInfo {
  path: string;
  branch: string;
  commitHash: string;
  isMain: boolean;
}

interface LastCommit {
  hash: string;
  message: string;
  date: string;
}

function git(cmd: string): string {
  return execSync(`git ${cmd}`, { cwd: COMPANY_ROOT, encoding: 'utf-8' }).trim();
}

// GET /api/git/status
gitRouter.get('/status', (_req: Request, res: Response, next: NextFunction) => {
  try {
    // Current branch
    let currentBranch: string;
    try {
      currentBranch = git('rev-parse --abbrev-ref HEAD');
    } catch {
      res.status(500).json({ error: 'Not a git repository or git is not available' });
      return;
    }

    // Worktrees
    let worktrees: WorktreeInfo[] = [];
    try {
      const raw = git('worktree list --porcelain');
      const blocks = raw.split('\n\n').filter(Boolean);
      for (const block of blocks) {
        const lines = block.split('\n');
        const wtPath = lines.find(l => l.startsWith('worktree '))?.replace('worktree ', '') ?? '';
        const commitHash = lines.find(l => l.startsWith('HEAD '))?.replace('HEAD ', '') ?? '';
        const branchLine = lines.find(l => l.startsWith('branch '));
        const branch = branchLine ? branchLine.replace('branch refs/heads/', '') : '(detached)';
        const isMain = lines.some(l => l === 'worktree ' + COMPANY_ROOT) ||
          (!branchLine && lines.some(l => l === 'bare'));
        worktrees.push({
          path: wtPath,
          branch,
          commitHash,
          isMain: wtPath === COMPANY_ROOT,
        });
      }
    } catch {
      worktrees = [];
    }

    // Stale (unmerged) branches
    let staleBranches: string[] = [];
    try {
      const raw = git('branch --no-merged develop');
      staleBranches = raw
        .split('\n')
        .map(b => b.trim().replace(/^\*\s*/, ''))
        .filter(Boolean);
    } catch {
      staleBranches = [];
    }

    // Unsaved changes count
    let unsavedChanges = 0;
    try {
      const raw = git('status --porcelain');
      unsavedChanges = raw ? raw.split('\n').filter(Boolean).length : 0;
    } catch {
      unsavedChanges = 0;
    }

    // Last commit
    let lastCommit: LastCommit | null = null;
    try {
      const raw = git('log -1 --format=%H%n%s%n%aI');
      const [hash, message, date] = raw.split('\n');
      if (hash) {
        lastCommit = { hash, message: message ?? '', date: date ?? '' };
      }
    } catch {
      lastCommit = null;
    }

    res.json({
      currentBranch,
      worktrees,
      staleBranches,
      unsavedChanges,
      lastCommit,
    });
  } catch (err) {
    next(err);
  }
});

// DELETE /api/git/worktree/:path — Remove a worktree
gitRouter.delete('/worktree/{*path}', (req: Request, res: Response, next: NextFunction) => {
  try {
    const rawPath = (req.params as Record<string, unknown>).path;
    const worktreePath = Array.isArray(rawPath) ? rawPath.join('/') : String(rawPath ?? '');
    if (!worktreePath) {
      res.status(400).json({ error: 'Worktree path is required' });
      return;
    }

    try {
      git(`worktree remove ${JSON.stringify(worktreePath)}`);
    } catch {
      // Try force remove if normal remove fails
      git(`worktree remove --force ${JSON.stringify(worktreePath)}`);
    }

    res.json({ success: true, removed: worktreePath });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to remove worktree';
    res.status(500).json({ error: message });
  }
});

// DELETE /api/git/branch/:name — Delete a branch (local + remote)
gitRouter.delete('/branch/{*name}', (req: Request, res: Response, next: NextFunction) => {
  try {
    const rawName = (req.params as Record<string, unknown>).name;
    const branchName = Array.isArray(rawName) ? rawName.join('/') : String(rawName ?? '');
    if (!branchName) {
      res.status(400).json({ error: 'Branch name is required' });
      return;
    }

    // Prevent deleting main/develop
    if (branchName === 'main' || branchName === 'develop') {
      res.status(403).json({ error: `Cannot delete protected branch: ${branchName}` });
      return;
    }

    const errors: string[] = [];

    // Delete local branch
    try {
      git(`branch -d ${JSON.stringify(branchName)}`);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Unknown error';
      // If branch is not fully merged, report but continue to try remote
      if (msg.includes('not fully merged')) {
        errors.push(`Local branch not fully merged. Use force delete if intended.`);
      } else if (!msg.includes('not found')) {
        errors.push(`Local: ${msg}`);
      }
    }

    // Delete remote branch
    try {
      git(`push origin --delete ${JSON.stringify(branchName)}`);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Unknown error';
      if (!msg.includes('remote ref does not exist')) {
        errors.push(`Remote: ${msg}`);
      }
    }

    if (errors.length > 0) {
      res.status(207).json({ success: false, branch: branchName, errors });
    } else {
      res.json({ success: true, deleted: branchName });
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to delete branch';
    res.status(500).json({ error: message });
  }
});
