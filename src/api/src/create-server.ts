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
import { companyRouter } from './routes/company.js';
import { handleExecRequest } from './routes/execute.js';
import { engineRouter } from './routes/engine.js';
import { sessionsRouter } from './routes/sessions.js';
import { setupRouter } from './routes/setup.js';
import { getAllActivities, completeActivity } from './services/activity-tracker.js';
import { knowledgeRouter } from './routes/knowledge.js';
import { preferencesRouter } from './routes/preferences.js';
import { saveRouter } from './routes/save.js';
import { speechRouter } from './routes/speech.js';
import { costRouter } from './routes/cost.js';
import { importKnowledge } from './services/knowledge-importer.js';
import { AnthropicProvider, type LLMProvider } from './engine/llm-adapter.js';
import { readConfig } from './services/company-config.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const isProd = process.env.NODE_ENV === 'production';
const corsOrigin = isProd ? true : /^http:\/\/localhost:\d+$/;

/**
 * 서버 시작 시 stale "working" activity 파일을 정리한다.
 * tsx watch 모드에서 재시작 시 in-memory 상태가 초기화되어도
 * 파일이 "working"으로 남는 버그를 방지한다.
 */
function cleanupStaleActivities(): void {
  const activities = getAllActivities();
  for (const activity of activities) {
    if (activity.status === 'working') {
      completeActivity(activity.roleId);
      console.log(`[STARTUP] Cleaned stale activity: ${activity.roleId} (was working on "${activity.currentTask}")`);
    }
  }
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
  cleanupStaleActivities();

  const app = createExpressApp();

  const server = http.createServer((req, res) => {
    const url = req.url ?? '';
    const method = req.method ?? '';

    // SSE 엔드포인트: Express 우회하여 raw HTTP로 처리
    if ((url.startsWith('/api/exec/') || url.startsWith('/api/jobs') || url === '/api/setup/import-knowledge') && method === 'POST') {
      setExecCors(req, res);
      if (url === '/api/setup/import-knowledge') {
        handleImportKnowledge(req, res);
      } else {
        handleExecRequest(req, res);
      }
      return;
    }

    // CORS preflight for exec/jobs endpoints
    if ((url.startsWith('/api/exec/') || url.startsWith('/api/jobs')) && method === 'OPTIONS') {
      setExecCors(req, res);
      res.setHeader('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS');
      res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
      res.writeHead(204);
      res.end();
      return;
    }

    // Non-SSE exec/jobs endpoints (GET, DELETE)
    if ((url.startsWith('/api/exec/') || url.startsWith('/api/jobs')) && (method === 'GET' || method === 'DELETE')) {
      setExecCors(req, res);
      handleExecRequest(req, res);
      return;
    }

    // 나머지는 Express 처리
    (app as (req: http.IncomingMessage, res: http.ServerResponse) => void)(req, res);
  });

  server.timeout = 0;
  server.requestTimeout = 0;

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
        const claudeMdPath = path.join(COMPANY_ROOT, 'CLAUDE.md');
        const content = fs.readFileSync(claudeMdPath, 'utf-8');
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

  app.get('/api/health', (_req, res) => {
    res.json({ status: 'ok', companyRoot: COMPANY_ROOT });
  });

  // Production: serve web build as static files (SPA fallback)
  if (isProd) {
    const distPath = path.resolve(__dirname, '../../web/dist');
    app.use(express.static(distPath));
    app.use((_req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.use((err: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    console.error(`[ERROR] ${err.message}`);
    const status = err.name === 'FileNotFoundError' ? 404 : 500;
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
