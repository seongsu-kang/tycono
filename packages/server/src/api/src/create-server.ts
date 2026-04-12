/**
 * create-server.ts — HTTP 서버 팩토리
 *
 * server.ts에서 서버 생성 로직을 분리하여 테스트에서 재사용 가능하게 한다.
 * 반환된 서버 인스턴스는 listen()을 직접 호출하지 않으므로,
 * 호출자가 포트를 지정해서 기동할 수 있다.
 */
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import express from 'express';
import cors from 'cors';
import { COMPANY_ROOT } from './services/file-reader.js';
import { rolesRouter } from './routes/roles.js';
import { projectsRouter } from './routes/projects.js';
import { operationsRouter } from './routes/operations.js';
import { boardRouter } from './routes/board.js';
import { companyRouter } from './routes/company.js';
import { handleExecRequest } from './routes/execute.js';
import { engineRouter } from './routes/engine.js';
import { sessionsRouter } from './routes/sessions.js';
import { setupRouter } from './routes/setup.js';
// activity-tracker removed — executionManager resets on restart
import { knowledgeRouter } from './routes/knowledge.js';
import { preferencesRouter } from './routes/preferences.js';
import { saveRouter } from './routes/save.js';
import { speechRouter } from './routes/speech.js';
import { costRouter } from './routes/cost.js';
import { syncRouter } from './routes/sync.js';
import { gitRouter } from './routes/git.js';
import { skillsRouter } from './routes/skills.js';
import { questsRouter } from './routes/quests.js';
import { coinsRouter } from './routes/coins.js';
import { activeSessionsRouter } from './routes/active-sessions.js';
import { supervisionRouter } from './routes/supervision.js';
import { presetsRouter } from './routes/presets.js';
import { importKnowledge } from './services/knowledge-importer.js';
import { AnthropicProvider, type LLMProvider } from './engine/llm-adapter.js';
import { readConfig } from './services/company-config.js';
import { ensureClaudeMd } from './services/claude-md-manager.js';

import { supervisorHeartbeat } from './services/supervisor-heartbeat.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const isProd = process.env.NODE_ENV === 'production';
const corsOrigin = isProd ? true : /^http:\/\/localhost:\d+$/;

/** Get count of active waves (for shutdown guard) */
export function getActiveWaveCount(): number {
  return supervisorHeartbeat.listActive().length;
}

/* ─── Raw HTTP handler for import-knowledge SSE ─── */

function handleImportKnowledge(req: http.IncomingMessage, res: http.ServerResponse): void {
  let data = '';
  req.on('data', (chunk) => { data += chunk; });
  req.on('end', () => {
    let body: Record<string, unknown>;
    try { body = JSON.parse(data); } catch { body = {}; }

    const importPaths = body.paths as string[] | undefined;
    if (!importPaths || !Array.isArray(importPaths) || importPaths.length === 0) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'paths array is required' }));
      return;
    }

    const root = (body.companyRoot as string) || COMPANY_ROOT;

    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
      'X-Accel-Buffering': 'no',
    });

    const sendSSE = (event: string, eventData: unknown) => {
      res.write(`event: ${event}\ndata: ${JSON.stringify(eventData)}\n\n`);
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
      onDone: (stats) => { sendSSE('done', stats); res.end(); },
      onError: (message) => { sendSSE('error', { message }); res.end(); },
    }, llm).catch((err) => {
      sendSSE('error', { message: err instanceof Error ? err.message : 'Import failed' });
      res.end();
    });
  });
}

export function createHttpServer(): http.Server {
  // Only cleanup/ensure if a company is already initialized (avoid creating dirs in CWD)
  if (COMPANY_ROOT && fs.existsSync(path.join(COMPANY_ROOT, 'knowledge', 'CLAUDE.md'))) {
    ensureClaudeMd(COMPANY_ROOT);
  }

  const app = createExpressApp();

  const server = http.createServer((req, res) => {
    const rawUrl = req.url ?? '';
    const url = rawUrl.split('?')[0]; // Strip query string for route matching
    const method = req.method ?? '';

    // GET /api/waves/active — restore active waves after refresh
    if (url === '/api/waves/active' && method === 'GET') {
      setExecCors(req, res);
      handleExecRequest(req, res);
      return;
    }

    // SSE multiplexed wave stream (GET /api/waves/:waveId/stream)
    if (url.match(/^\/api\/waves\/[^/]+\/stream/) && method === 'GET') {
      setExecCors(req, res);
      handleExecRequest(req, res);
      return;
    }

    // D-014: POST /api/sessions/:id/message — delegate to execute handler for SSE streaming
    const sessionMessageMatch = url.match(/^\/api\/sessions\/([^/]+)\/message$/);
    if (sessionMessageMatch && method === 'POST') {
      setExecCors(req, res);
      // Rewrite URL to legacy format for handleExecRequest
      req.url = `/api/exec/session/${sessionMessageMatch[1]}/message`;
      handleExecRequest(req, res);
      return;
    }

    // SSE 엔드포인트: Express 우회하여 raw HTTP로 처리
    // BUG-008: /api/waves/:waveId/directive and /api/waves/:waveId/question POST도 포함
    // Board API는 Express router로 처리 (raw handler 제외)
    const isBoardRoute = url.match(/^\/api\/waves\/[^/]+\/(board|events|blackboard)/);
    if (!isBoardRoute && (url.startsWith('/api/exec/') || url.startsWith('/api/jobs') || url.startsWith('/api/waves/') || url === '/api/waves/save' || url === '/api/setup/import-knowledge') && method === 'POST') {
      setExecCors(req, res);
      if (url === '/api/setup/import-knowledge') {
        handleImportKnowledge(req, res);
      } else {
        handleExecRequest(req, res);
      }
      return;
    }

    // CORS preflight for exec/jobs/sessions endpoints
    if ((url.startsWith('/api/exec/') || url.startsWith('/api/jobs') || url.match(/^\/api\/sessions\/[^/]+\/message$/)) && method === 'OPTIONS') {
      setExecCors(req, res);
      res.setHeader('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS');
      res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
      res.writeHead(204);
      res.end();
      return;
    }

    // Non-SSE exec/jobs/waves endpoints (GET, DELETE)
    if (!isBoardRoute && (url.startsWith('/api/exec/') || url.startsWith('/api/jobs') || url.startsWith('/api/waves/')) && (method === 'GET' || method === 'DELETE')) {
      setExecCors(req, res);
      handleExecRequest(req, res);
      return;
    }

    // 나머지는 Express 처리
    (app as (req: http.IncomingMessage, res: http.ServerResponse) => void)(req, res);
  });

  server.timeout = 0;
  server.requestTimeout = 0;
  server.headersTimeout = 0;

  return server;
}

export function createExpressApp(): express.Application {
  const app = express();

  app.use(cors({ origin: corsOrigin }));
  app.use(express.json());

  // Setup / onboarding
  app.use('/api/setup', setupRouter);

  // Status — frontend checks this to decide wizard vs office
  app.get('/api/status', (_req, res) => {
    const config = readConfig(COMPANY_ROOT);
    const tyconoDir = path.join(COMPANY_ROOT, '.tycono', 'config.json');
    const initialized = fs.existsSync(tyconoDir);
    let companyName: string | null = null;
    if (initialized) {
      try {
        // Read company name from knowledge/company.md (user-owned data)
        const companyMdPath = path.join(COMPANY_ROOT, 'knowledge', 'company.md');
        const content = fs.readFileSync(companyMdPath, 'utf-8');
        const match = content.match(/^#\s+(.+)/m);
        if (match) companyName = match[1].trim();
      } catch { /* ignore */ }
    }
    res.json({ initialized, companyName, engine: config.engine || process.env.EXECUTION_ENGINE || 'none', companyRoot: COMPANY_ROOT, codeRoot: config.codeRoot || null, hasApiKey: !!process.env.ANTHROPIC_API_KEY });
  });

  app.use('/api/roles', rolesRouter);
  app.use('/api/projects', projectsRouter);
  app.use('/api/operations', operationsRouter);
  app.use('/api/company', companyRouter);
  app.use('/api/engine', engineRouter);
  app.use('/api/sessions', sessionsRouter);
  app.use('/api/knowledge', knowledgeRouter);
  app.use('/api/preferences', preferencesRouter);
  app.use('/api/speech', speechRouter);
  app.use('/api/save', saveRouter);
  app.use('/api/cost', costRouter);
  app.use('/api/sync', syncRouter);
  app.use('/api/git', gitRouter);
  app.use('/api/skills', skillsRouter);
  app.use('/api/quests', questsRouter);
  app.use('/api/coins', coinsRouter);
  app.use('/api/active-sessions', activeSessionsRouter);
  app.use('/api/supervision', supervisionRouter);
  app.use('/api/presets', presetsRouter);
  app.use('/api', boardRouter);

  app.get('/api/health', (_req, res) => {
    res.json({ status: 'ok', companyRoot: COMPANY_ROOT });
  });

  // Board Dashboard UI — React app (built with Vite)
  const uiDistPath = path.resolve(__dirname, '../../ui/dist');
  if (fs.existsSync(uiDistPath)) {
    app.use('/ui', express.static(uiDistPath));
    // SPA fallback
    app.use('/ui', (_req, res) => {
      res.sendFile(path.join(uiDistPath, 'index.html'));
    });
  } else {
    // Fallback: serve legacy single-file dashboard
    app.get('/ui', (_req, res) => {
      const legacyPath = path.resolve(__dirname, '../../ui/dashboard.html');
      if (fs.existsSync(legacyPath)) {
        res.sendFile(legacyPath);
      } else {
        res.status(404).send('Dashboard not found. Run: cd packages/server/src/ui && npm run build');
      }
    });
  }

  // Production: serve web build as static files (SPA fallback)
  if (isProd) {
    const distPath = path.resolve(__dirname, '../../web/dist');
    app.use(express.static(distPath));
    app.use((_req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.use((err: Error, req: express.Request, res: express.Response, _next: express.NextFunction) => {
    const status = err.name === 'FileNotFoundError' ? 404 : 500;
    // Log server errors via console.error (redirected to log file in TUI mode)
    // 404 errors are expected (e.g. fresh install, no company.md) — skip
    if (status >= 500) {
      console.error(`[ERROR] ${req.method} ${req.url} — ${err.message}`);
    }
    res.status(status).json({ error: err.message });
  });

  return app;
}

function setExecCors(req: http.IncomingMessage, res: http.ServerResponse): void {
  const origin = req.headers.origin;
  if (!origin) return;
  if (isProd || /^http:\/\/localhost:\d+$/.test(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Access-Control-Allow-Credentials', 'true');
  }
}
