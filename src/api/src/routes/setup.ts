/**
 * setup.ts — Onboarding / setup API routes
 *
 * Used by the Web Onboarding Wizard to detect engine,
 * validate paths, and scaffold a new AKB.
 */
import { Router } from 'express';
import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';
import os from 'node:os';
import { scaffold, getAvailableTeams, loadTeam } from '../services/scaffold.js';
import type { ScaffoldConfig } from '../services/scaffold.js';
import { importKnowledge } from '../services/knowledge-importer.js';
import { AnthropicProvider, type LLMProvider } from '../engine/llm-adapter.js';
import { jobManager } from '../services/job-manager.js';
import { applyConfig, readConfig } from '../services/company-config.js';

export const setupRouter = Router();

/**
 * POST /api/setup/detect-engine
 */
setupRouter.post('/detect-engine', (_req, res) => {
  let claudeCli = false;
  let apiKey = false;

  try {
    const result = execSync('claude --version 2>/dev/null', {
      timeout: 5000,
      stdio: ['ignore', 'pipe', 'ignore'],
      env: { ...process.env, CLAUDECODE: '' },
    });
    claudeCli = result.toString().includes('Claude Code');
  } catch {
    claudeCli = false;
  }

  if (process.env.ANTHROPIC_API_KEY) {
    apiKey = true;
  }

  res.json({
    claudeCli,
    apiKey,
    recommended: claudeCli ? 'claude-cli' : apiKey ? 'direct-api' : 'none',
  });
});

/**
 * POST /api/setup/validate-path
 */
setupRouter.post('/validate-path', (req, res) => {
  const { path: targetPath } = req.body;

  if (!targetPath || typeof targetPath !== 'string') {
    res.status(400).json({ valid: false, error: 'Path is required' });
    return;
  }

  const resolved = path.resolve(targetPath);

  if (!fs.existsSync(resolved)) {
    res.status(400).json({ valid: false, error: 'Path does not exist' });
    return;
  }

  const stat = fs.statSync(resolved);
  if (!stat.isDirectory()) {
    res.status(400).json({ valid: false, error: 'Path is not a directory' });
    return;
  }

  const hasClaude = fs.existsSync(path.join(resolved, 'CLAUDE.md'));
  const files = fs.readdirSync(resolved).slice(0, 20);

  res.json({ valid: true, path: resolved, hasClaudeMd: hasClaude, files });
});

/**
 * POST /api/setup/scaffold
 */
setupRouter.post('/scaffold', (req, res) => {
  const { companyName, description, apiKey, team, existingProjectPath, knowledgePaths } = req.body;

  if (!companyName || typeof companyName !== 'string') {
    res.status(400).json({ error: 'companyName is required' });
    return;
  }

  const projectRoot = process.env.COMPANY_ROOT || process.cwd();

  const config: ScaffoldConfig = {
    companyName,
    description: description || 'An AI-powered organization',
    apiKey: apiKey || undefined,
    team: team || 'startup',
    projectRoot,
    existingProjectPath: existingProjectPath || undefined,
    knowledgePaths: knowledgePaths || undefined,
  };

  try {
    const created = scaffold(config);

    process.env.COMPANY_ROOT = projectRoot;
    // Load config.json written by scaffold and apply to process.env
    applyConfig(projectRoot);
    jobManager.refreshRunner();

    res.json({ ok: true, companyName, projectRoot, created });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Scaffold failed';
    res.status(500).json({ error: message });
  }
});

/**
 * POST /api/setup/browse
 * Browse directories for folder picker UI.
 */
setupRouter.post('/browse', (req, res) => {
  const { path: targetPath } = req.body;
  const resolved = targetPath ? path.resolve(targetPath) : os.homedir();

  if (!fs.existsSync(resolved)) {
    res.status(400).json({ error: 'Path does not exist', path: resolved });
    return;
  }

  const stat = fs.statSync(resolved);
  if (!stat.isDirectory()) {
    res.status(400).json({ error: 'Not a directory', path: resolved });
    return;
  }

  try {
    const entries = fs.readdirSync(resolved, { withFileTypes: true });
    const dirs = entries
      .filter(e => e.isDirectory() && !e.name.startsWith('.'))
      .map(e => ({
        name: e.name,
        path: path.join(resolved, e.name),
      }))
      .sort((a, b) => a.name.localeCompare(b.name));

    const parent = path.dirname(resolved);

    res.json({
      current: resolved,
      parent: parent !== resolved ? parent : null,
      dirs,
      hasClaudeMd: fs.existsSync(path.join(resolved, 'CLAUDE.md')),
    });
  } catch {
    res.status(403).json({ error: 'Cannot read directory', path: resolved });
  }
});

/**
 * POST /api/setup/connect-akb
 * Connect an existing AKB directory.
 */
setupRouter.post('/connect-akb', (req, res) => {
  const { path: akbPath } = req.body;

  if (!akbPath || typeof akbPath !== 'string') {
    res.status(400).json({ ok: false, error: 'path is required' });
    return;
  }

  const resolved = path.resolve(akbPath);

  if (!fs.existsSync(resolved)) {
    res.status(400).json({ ok: false, error: 'Path does not exist' });
    return;
  }

  const claudeMdPath = path.join(resolved, 'CLAUDE.md');
  if (!fs.existsSync(claudeMdPath)) {
    res.status(400).json({ ok: false, error: 'No CLAUDE.md found — not a valid AKB directory' });
    return;
  }

  // Read company name from CLAUDE.md
  let companyName = 'Unknown';
  try {
    const content = fs.readFileSync(claudeMdPath, 'utf-8');
    const match = content.match(/^#\s+(.+)/m);
    if (match) companyName = match[1].trim();
  } catch { /* ignore */ }

  process.env.COMPANY_ROOT = resolved;

  // Load existing config.json if present
  const config = readConfig(resolved);
  applyConfig(resolved);
  jobManager.refreshRunner();

  res.json({ ok: true, companyName, companyRoot: resolved, engine: config.engine });
});

/**
 * POST /api/setup/import-knowledge (SSE)
 * AI-powered document import with progress streaming.
 */
setupRouter.post('/import-knowledge', (req, res) => {
  const { paths: importPaths, companyRoot } = req.body;

  if (!importPaths || !Array.isArray(importPaths) || importPaths.length === 0) {
    res.status(400).json({ error: 'paths array is required' });
    return;
  }

  const root = companyRoot || process.env.COMPANY_ROOT || process.cwd();

  // SSE headers
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive',
    'X-Accel-Buffering': 'no',
  });

  const sendSSE = (event: string, data: unknown) => {
    res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
  };

  // Build LLMProvider from env if available
  const llm: LLMProvider | undefined = process.env.ANTHROPIC_API_KEY
    ? new AnthropicProvider({ model: 'claude-haiku-4-5-20251001' })
    : undefined;

  importKnowledge(importPaths, root, {
    onScanning: (scanPath, fileCount) => sendSSE('scanning', { path: scanPath, fileCount }),
    onProcessing: (file, index, total) => sendSSE('processing', { file, index, total }),
    onCreated: (filePath, title, summary) => sendSSE('created', { path: filePath, title, summary }),
    onSkipped: (file, reason) => sendSSE('skipped', { file, reason }),
    onDone: (stats) => {
      sendSSE('done', stats);
      res.end();
    },
    onError: (message) => {
      sendSSE('error', { message });
      res.end();
    },
  }, llm).catch((err) => {
    sendSSE('error', { message: err instanceof Error ? err.message : 'Import failed' });
    res.end();
  });
});

/**
 * GET /api/setup/teams
 */
setupRouter.get('/teams', (_req, res) => {
  const teams = getAvailableTeams();
  const result = teams.map(t => ({
    id: t,
    roles: loadTeam(t).map(r => ({ id: r.id, name: r.name, level: r.level })),
  }));
  res.json(result);
});
