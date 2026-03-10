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
import { scaffold, getAvailableTeams, loadTeam, getRequiredTools, installSkillTools } from '../services/scaffold.js';
import type { ScaffoldConfig } from '../services/scaffold.js';
import { importKnowledge } from '../services/knowledge-importer.js';
import { gitInit } from '../services/git-save.js';
import { AnthropicProvider, type LLMProvider } from '../engine/llm-adapter.js';
import { jobManager } from '../services/job-manager.js';
import { applyConfig, readConfig, writeConfig } from '../services/company-config.js';
import { mergePreferences } from '../services/preferences.js';
import { setCompanyRoot } from '../services/file-reader.js';

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
  const { companyName, description, apiKey, team, existingProjectPath, knowledgePaths, codeRoot, language, location } = req.body;

  if (!companyName || typeof companyName !== 'string') {
    res.status(400).json({ error: 'companyName is required' });
    return;
  }

  // Determine project root: explicit location from wizard > fallback to CWD with safety check
  let projectRoot: string;
  if (location && typeof location === 'string') {
    projectRoot = path.resolve(location);
  } else {
    const baseRoot = process.env.COMPANY_ROOT || process.cwd();
    const dangerousPaths = new Set(['/', os.homedir(), os.tmpdir()]);
    const isDangerous = dangerousPaths.has(baseRoot) || baseRoot === '/tmp';
    if (isDangerous) {
      const slug = companyName.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'my-company';
      projectRoot = path.join(baseRoot, slug);
    } else {
      projectRoot = baseRoot;
    }
  }

  if (!fs.existsSync(projectRoot)) {
    fs.mkdirSync(projectRoot, { recursive: true });
  }

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

    setCompanyRoot(projectRoot);
    // Load config.json written by scaffold and apply to process.env
    const scaffoldConfig = applyConfig(projectRoot);
    // Save codeRoot if provided
    if (codeRoot && typeof codeRoot === 'string') {
      writeConfig(projectRoot, { ...scaffoldConfig, codeRoot });
    }
    // Save language preference
    if (language && typeof language === 'string') {
      mergePreferences(projectRoot, { language });
    }
    jobManager.refreshRunner();

    // Auto git init (graceful — skip if git not installed)
    const gitResult = gitInit(projectRoot);

    res.json({ ok: true, companyName, projectRoot, created, git: gitResult });
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
 * POST /api/setup/mkdir
 * Create a new directory inside the browsed location.
 */
setupRouter.post('/mkdir', (req, res) => {
  const { path: parentPath, name } = req.body;
  if (!parentPath || !name || typeof parentPath !== 'string' || typeof name !== 'string') {
    res.status(400).json({ error: 'path and name are required' });
    return;
  }
  // Sanitize name — no path separators or dots-only
  const sanitized = name.trim().replace(/[/\\]/g, '');
  if (!sanitized || sanitized === '.' || sanitized === '..') {
    res.status(400).json({ error: 'Invalid folder name' });
    return;
  }
  const target = path.join(path.resolve(parentPath), sanitized);
  try {
    fs.mkdirSync(target, { recursive: true });
    res.json({ ok: true, path: target });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Unknown error';
    res.status(500).json({ error: msg });
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

  setCompanyRoot(resolved);

  // Load existing config.json if present
  const config = readConfig(resolved);
  applyConfig(resolved);
  jobManager.refreshRunner();

  res.json({ ok: true, companyName, companyRoot: resolved, engine: config.engine, codeRoot: config.codeRoot || null });
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
 * GET /api/setup/code-root
 * Get the current codeRoot config value.
 */
setupRouter.get('/code-root', (_req, res) => {
  const companyRoot = process.env.COMPANY_ROOT || process.cwd();
  const config = readConfig(companyRoot);
  res.json({ codeRoot: config.codeRoot || null });
});

/**
 * POST /api/setup/code-root
 * Set or update the codeRoot config field.
 */
setupRouter.post('/code-root', (req, res) => {
  const { codeRoot: newCodeRoot } = req.body;
  const companyRoot = process.env.COMPANY_ROOT || process.cwd();

  if (!newCodeRoot || typeof newCodeRoot !== 'string') {
    res.status(400).json({ ok: false, error: 'codeRoot path is required' });
    return;
  }

  const resolved = path.resolve(newCodeRoot);
  if (!fs.existsSync(resolved)) {
    res.status(400).json({ ok: false, error: 'Path does not exist' });
    return;
  }

  if (!fs.statSync(resolved).isDirectory()) {
    res.status(400).json({ ok: false, error: 'Path is not a directory' });
    return;
  }

  // Check if it's a git repository
  let isGitRepo = false;
  try {
    execSync('git rev-parse --git-dir', { cwd: resolved, timeout: 5000, stdio: ['pipe', 'pipe', 'pipe'] });
    isGitRepo = true;
  } catch {
    // Not a git repo — still allow, but inform
  }

  const config = readConfig(companyRoot);
  writeConfig(companyRoot, { ...config, codeRoot: resolved });

  res.json({ ok: true, codeRoot: resolved, isGitRepo });
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

/**
 * POST /api/setup/required-tools
 * Check which tools are needed for a team's skills.
 */
setupRouter.post('/required-tools', (req, res) => {
  const { team } = req.body;
  if (!team || typeof team !== 'string') {
    res.json({ tools: [] });
    return;
  }

  const roles = loadTeam(team);
  const skillIds = new Set<string>();
  for (const role of roles) {
    if (role.defaultSkills) {
      for (const s of role.defaultSkills) skillIds.add(s);
    }
  }

  const tools = getRequiredTools(Array.from(skillIds));
  res.json({ tools });
});

/**
 * POST /api/setup/install-tools (SSE)
 * Install CLI tools required by team skills with progress streaming.
 */
setupRouter.post('/install-tools', (req, res) => {
  const { team } = req.body;
  if (!team || typeof team !== 'string') {
    res.status(400).json({ error: 'team is required' });
    return;
  }

  const roles = loadTeam(team);
  const skillIds = new Set<string>();
  for (const role of roles) {
    if (role.defaultSkills) {
      for (const s of role.defaultSkills) skillIds.add(s);
    }
  }

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

  installSkillTools(Array.from(skillIds), {
    onChecking: (tool) => sendSSE('checking', { tool }),
    onInstalling: (tool) => sendSSE('installing', { tool }),
    onInstalled: (tool) => sendSSE('installed', { tool }),
    onSkipped: (tool, reason) => sendSSE('skipped', { tool, reason }),
    onError: (tool, error) => sendSSE('error', { tool, error }),
    onDone: (stats) => {
      sendSSE('done', stats);
      res.end();
    },
  });
});
