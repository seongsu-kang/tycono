/**
 * create-app.ts — Express 앱 팩토리
 *
 * server.ts에서 분리하여 테스트에서 재사용 가능하게 한다.
 * supertest 등에서 import 후 테스트용 앱으로 활용.
 */
import express from 'express';
import cors from 'cors';
import fs from 'node:fs';
import path from 'node:path';
import { COMPANY_ROOT } from './services/file-reader.js';
import { rolesRouter } from './routes/roles.js';
import { projectsRouter } from './routes/projects.js';
import { operationsRouter } from './routes/operations.js';
import { companyRouter } from './routes/company.js';
import { engineRouter } from './routes/engine.js';
import { sessionsRouter } from './routes/sessions.js';
import { setupRouter } from './routes/setup.js';
import { skillsRouter } from './routes/skills.js';

export function createApp() {
  const app = express();

  const corsOrigin = process.env.NODE_ENV === 'production' ? true : /^http:\/\/localhost:\d+$/;
  app.use(cors({ origin: corsOrigin }));
  app.use(express.json());

  // Suppress favicon 404
  app.get('/favicon.ico', (_req, res) => res.status(204).end());

  // Setup / onboarding (always available)
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
  app.use('/api/skills', skillsRouter);

  app.get('/api/health', (_req, res) => {
    res.json({ status: 'ok', companyRoot: COMPANY_ROOT });
  });

  // Debug: memory stats for leak detection
  app.get('/api/debug/memory', (_req, res) => {
    const { executionManager } = require('./services/execution-manager.js');
    const { listSessions } = require('./services/session-store.js');
    const mem = process.memoryUsage();
    res.json({
      heap: { used: Math.round(mem.heapUsed / 1024 / 1024), total: Math.round(mem.heapTotal / 1024 / 1024) },
      rss: Math.round(mem.rss / 1024 / 1024),
      execManager: executionManager.getMemoryStats(),
      sessions: listSessions().length,
    });
  });

  app.use((err: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    const status = err.name === 'FileNotFoundError' ? 404 : 500;
    res.status(status).json({ error: err.message });
  });

  return app;
}
