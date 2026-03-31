import fs from 'node:fs';
import path from 'node:path';
import net from 'node:net';
import { execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const VERSION = JSON.parse(
  fs.readFileSync(path.resolve(__dirname, '..', 'package.json'), 'utf-8')
).version;

function printHelp(): void {
  console.log(`
  tycono-server v${VERSION}

  AI team orchestration server. Headless by default.

  Usage:
    tycono-server [path]       Start API server (default: current directory)
    tycono-server --help       Show this help
    tycono-server --version    Show version

  Examples:
    tycono-server                    Start in current directory
    tycono-server ./my-company       Start with company directory
    PORT=3001 tycono-server          Use specific port

  Environment:
    PORT                     Server port (default: auto-detect free port)
    COMPANY_ROOT             Company directory (default: current directory)
`);
}

function findFreePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.listen(0, () => {
      const addr = server.address();
      if (addr && typeof addr === 'object') {
        const port = addr.port;
        server.close(() => resolve(port));
      } else {
        reject(new Error('Could not find free port'));
      }
    });
    server.on('error', reject);
  });
}

function detectEngine(): string {
  try {
    execSync('claude --version', { stdio: 'pipe' });
    return 'claude-cli';
  } catch {}
  if (process.env.ANTHROPIC_API_KEY) return 'direct-api';
  return 'none';
}

export async function main(args: string[]): Promise<void> {
  const command = args[0];

  if (command === '--help' || command === '-h') {
    printHelp();
    return;
  }

  if (command === '--version' || command === '-v') {
    console.log(VERSION);
    return;
  }

  // Load .env
  const dotenvPath = path.resolve(process.cwd(), '.env');
  if (fs.existsSync(dotenvPath)) {
    const { config } = await import('dotenv');
    config({ path: dotenvPath });
  }

  // Company root
  if (command && !command.startsWith('-')) {
    process.env.COMPANY_ROOT = path.resolve(command);
  }
  if (!process.env.COMPANY_ROOT) {
    process.env.COMPANY_ROOT = process.cwd();
  }

  // Check for knowledge/ subdirectory pattern
  const knowledgeDir = path.join(process.env.COMPANY_ROOT, 'knowledge');
  if (fs.existsSync(path.join(knowledgeDir, 'CLAUDE.md'))) {
    // Company root is the parent of knowledge/
  } else if (!fs.existsSync(path.join(process.env.COMPANY_ROOT, 'CLAUDE.md'))) {
    // Scan one level deep
    try {
      const entries = fs.readdirSync(process.env.COMPANY_ROOT, { withFileTypes: true });
      for (const entry of entries) {
        if (!entry.isDirectory() || entry.name.startsWith('.')) continue;
        if (fs.existsSync(path.join(process.env.COMPANY_ROOT, entry.name, '.tycono', 'config.json'))) {
          process.env.COMPANY_ROOT = path.join(process.env.COMPANY_ROOT, entry.name);
          break;
        }
      }
    } catch {}
  }

  process.env.NODE_ENV = 'production';

  // Detect engine
  const engine = detectEngine();
  process.env.EXECUTION_ENGINE = engine;

  // Port
  const port = process.env.PORT ? Number(process.env.PORT) : await findFreePort();
  process.env.PORT = String(port);

  // Company name
  let companyName = 'My Company';
  try {
    const claudeMdPath = path.join(process.env.COMPANY_ROOT, 'CLAUDE.md');
    if (fs.existsSync(claudeMdPath)) {
      const content = fs.readFileSync(claudeMdPath, 'utf-8');
      const match = content.match(/^#\s+(.+)/m);
      if (match) companyName = match[1].trim();
    }
  } catch {}

  const url = `http://localhost:${port}`;

  console.log(`  tycono-server v${VERSION}`);
  console.log(`  API: ${url}`);
  console.log(`  Company: ${companyName}`);
  console.log(`  Engine: ${engine}`);
  console.log(`  PID: ${process.pid}`);

  // Write headless.json for discovery
  const headlessInfo = { port, pid: process.pid, url, startedAt: new Date().toISOString() };
  const headlessPath = path.join(process.env.COMPANY_ROOT, '.tycono', 'headless.json');
  try {
    fs.mkdirSync(path.dirname(headlessPath), { recursive: true });
    fs.writeFileSync(headlessPath, JSON.stringify(headlessInfo, null, 2));
  } catch {}

  // Start server
  const { createHttpServer } = await import('../../src/api/src/create-server.js');
  const server = createHttpServer();

  const host = process.env.HOST || '0.0.0.0';
  server.listen(port, host);

  // Graceful shutdown with active wave guard (BUG-CONCURRENT protection)
  let forceShutdown = false;
  let forceTimer: ReturnType<typeof setTimeout> | null = null;

  const doShutdown = () => {
    console.log('\n  Shutting down...');
    try { fs.unlinkSync(headlessPath); } catch {}
    server.close(() => process.exit(0));
    setTimeout(() => process.exit(1), 5000);
  };

  const shutdown = async () => {
    try {
      const { getActiveWaveCount } = await import('../../src/api/src/create-server.js');
      const activeCount = getActiveWaveCount();

      if (activeCount > 0 && !forceShutdown) {
        console.log(`\n  ⚠️  ${activeCount} active wave(s) running. Press Ctrl+C again within 5s to force shutdown.`);
        forceShutdown = true;
        forceTimer = setTimeout(() => { forceShutdown = false; }, 5000);
        return;
      }
    } catch {
      // If we can't check, proceed with shutdown
    }

    if (forceTimer) clearTimeout(forceTimer);
    doShutdown();
  };

  process.on('SIGINT', shutdown);
  process.on('SIGTERM', doShutdown);
}
