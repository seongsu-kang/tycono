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

export function createHttpServer(): http.Server {
  cleanupStaleActivities();

  const app = express();

  app.use(cors({ origin: corsOrigin }));
  app.use(express.json());

  // Setup / onboarding
  app.use('/api/setup', setupRouter);

  // Status — frontend checks this to decide wizard vs office
  app.get('/api/status', (_req, res) => {
    const claudeMdPath = path.join(COMPANY_ROOT, 'CLAUDE.md');
    const initialized = fs.existsSync(claudeMdPath);
    let companyName: string | null = null;
    if (initialized) {
      try {
        const content = fs.readFileSync(claudeMdPath, 'utf-8');
        const match = content.match(/^#\s+(.+)/m);
        if (match) companyName = match[1].trim();
      } catch { /* ignore */ }
    }
    res.json({ initialized, companyName, engine: process.env.EXECUTION_ENGINE || 'none', companyRoot: COMPANY_ROOT });
  });

  app.use('/api/roles', rolesRouter);
  app.use('/api/projects', projectsRouter);
  app.use('/api/operations', operationsRouter);
  app.use('/api/company', companyRouter);
  app.use('/api/engine', engineRouter);
  app.use('/api/sessions', sessionsRouter);

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

  function setExecCors(req: http.IncomingMessage, res: http.ServerResponse): void {
    const origin = req.headers.origin;
    if (!origin) return;
    if (isProd || /^http:\/\/localhost:\d+$/.test(origin)) {
      res.setHeader('Access-Control-Allow-Origin', origin);
      res.setHeader('Access-Control-Allow-Credentials', 'true');
    }
  }

  const server = http.createServer((req, res) => {
    const url = req.url ?? '';
    const method = req.method ?? '';

    // SSE/Job 엔드포인트: Express 우회하여 raw HTTP로 처리
    if ((url.startsWith('/api/exec/') || url.startsWith('/api/jobs')) && method === 'POST') {
      setExecCors(req, res);
      handleExecRequest(req, res);
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
