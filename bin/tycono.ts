import fs from 'node:fs';
import path from 'node:path';
import net from 'node:net';
import { fileURLToPath } from 'node:url';
import { execSync } from 'node:child_process';
import { detectAuth } from './auth-detect.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const VERSION = JSON.parse(
  fs.readFileSync(path.resolve(__dirname, '..', 'package.json'), 'utf-8')
).version;

function printHelp(): void {
  console.log(`
  tycono v${VERSION}

  Build an AI company. Watch them work.

  Usage:
    tycono [path]       Start the server (optionally point to a company directory)
    tycono tui          Start API server + TUI mode
    tycono tui --attach Connect TUI to existing API server
    tycono --help       Show this help message
    tycono --version    Show version

  Examples:
    tycono                      Start in current directory
    tycono ./my-company         Start with existing company folder
    tycono /path/to/akb         Start with absolute path
    tycono tui                  Start with terminal UI
    PORT=3000 tycono tui --attach  Attach TUI to running server

  AI Engine (auto-detected):
    1. Claude Code CLI       Install from https://claude.ai/download (recommended)
    2. ANTHROPIC_API_KEY     Set in .env for direct API mode (BYOK)

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

function openBrowser(url: string): void {
  try {
    const platform = process.platform;
    if (platform === 'darwin') {
      execSync(`open "${url}"`);
    } else if (platform === 'win32') {
      execSync(`start "" "${url}"`);
    } else {
      execSync(`xdg-open "${url}"`);
    }
  } catch {
    // silently fail — user can open manually
  }
}

function printBanner(companyName: string, port: number, url: string, engine: string): void {
  const w = 45;
  const pad = (s: string) => s.padEnd(w - 6);
  const engineLabel = engine === 'claude-cli' ? 'Claude Code CLI' : 'Direct API (BYOK)';
  console.log(`
  ┌${'─'.repeat(w)}┐
  │${' '.repeat(w)}│
  │   tycono v${VERSION.padEnd(w - 18)}│
  │${' '.repeat(w)}│
  │   Company:  ${pad(companyName)}│
  │   Engine:   ${pad(engineLabel)}│
  │   Port:     ${pad(String(port))}│
  │   URL:      ${pad(url)}│
  │${' '.repeat(w)}│
  │   Press Ctrl+C to stop${' '.repeat(w - 25)}│
  │${' '.repeat(w)}│
  └${'─'.repeat(w)}┘
`);
}

async function startServer(): Promise<void> {
  // Load .env from current directory
  const dotenvPath = path.resolve(process.cwd(), '.env');
  if (fs.existsSync(dotenvPath)) {
    const { config } = await import('dotenv');
    config({ path: dotenvPath });
  }

  // Set COMPANY_ROOT to cwd if not set
  if (!process.env.COMPANY_ROOT) {
    process.env.COMPANY_ROOT = process.cwd();
  }

  // Check for CLAUDE.md — also scan one level deep (for ~/acme-corp/ scenario)
  let claudeMdPath = path.join(process.env.COMPANY_ROOT, 'CLAUDE.md');
  let initialized = fs.existsSync(claudeMdPath);
  if (!initialized) {
    // Look for .tycono/ marker in subdirectories (faster than scanning all dirs for CLAUDE.md)
    try {
      const entries = fs.readdirSync(process.env.COMPANY_ROOT, { withFileTypes: true });
      for (const entry of entries) {
        if (!entry.isDirectory() || entry.name.startsWith('.')) continue;
        if (fs.existsSync(path.join(process.env.COMPANY_ROOT, entry.name, '.tycono', 'config.json'))) {
          process.env.COMPANY_ROOT = path.join(process.env.COMPANY_ROOT, entry.name);
          claudeMdPath = path.join(process.env.COMPANY_ROOT, 'CLAUDE.md');
          initialized = fs.existsSync(claudeMdPath);
          break;
        }
      }
    } catch { /* permission denied etc — ignore */ }
  }

  // Production mode + auto-detect execution engine (soft-fail)
  process.env.NODE_ENV = 'production';
  const auth = detectAuth();
  if (auth.engine === 'none' && initialized) {
    console.warn(`
  Warning: No AI engine detected.
  Configure one via the web dashboard or set ANTHROPIC_API_KEY in .env.
`);
  }
  process.env.EXECUTION_ENGINE = auth.engine === 'claude-cli' ? 'claude-cli' : auth.engine === 'direct-api' ? 'direct-api' : 'none';

  // Determine port
  const port = process.env.PORT ? Number(process.env.PORT) : await findFreePort();
  process.env.PORT = String(port);

  // Detect company name from company/company.md (user-owned), fallback to CLAUDE.md
  let companyName = 'My Company';
  if (initialized) {
    try {
      const companyMdPath = path.join(process.env.COMPANY_ROOT!, 'company', 'company.md');
      if (fs.existsSync(companyMdPath)) {
        const companyContent = fs.readFileSync(companyMdPath, 'utf-8');
        const titleMatch = companyContent.match(/^#\s+(.+)/m);
        if (titleMatch) companyName = titleMatch[1].trim();
      } else {
        const claudeContent = fs.readFileSync(claudeMdPath, 'utf-8');
        const titleMatch = claudeContent.match(/^#\s+(.+)/m);
        if (titleMatch) companyName = titleMatch[1].trim();
      }
    } catch {
      // ignore
    }
  }

  const url = `http://localhost:${port}`;
  if (initialized) {
    printBanner(companyName, port, url, auth.engine);
  } else {
    console.log(`
  ┌─────────────────────────────────────────────┐
  │                                             │
  │   tycono v${VERSION.padEnd(29)}│
  │                                             │
  │   No company found — starting setup wizard  │
  │   URL:      ${url.padEnd(31)}│
  │                                             │
  └─────────────────────────────────────────────┘
`);
  }

  // Import and start server
  const { createHttpServer } = await import('../src/api/src/create-server.js');
  const server = createHttpServer();

  const host = process.env.HOST || '0.0.0.0';
  server.listen(port, host, () => {
    openBrowser(url);
  });

  // Graceful shutdown
  const shutdown = () => {
    console.log('\n  Shutting down...');
    server.close(() => process.exit(0));
    setTimeout(() => process.exit(1), 5000);
  };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

async function startServerForTui(): Promise<void> {
  // Load .env from current directory
  const dotenvPath = path.resolve(process.cwd(), '.env');
  if (fs.existsSync(dotenvPath)) {
    const { config } = await import('dotenv');
    config({ path: dotenvPath });
  }

  if (!process.env.COMPANY_ROOT) {
    process.env.COMPANY_ROOT = process.cwd();
  }

  process.env.NODE_ENV = 'production';
  const auth = detectAuth();
  process.env.EXECUTION_ENGINE = auth.engine === 'claude-cli' ? 'claude-cli' : auth.engine === 'direct-api' ? 'direct-api' : 'none';

  const port = process.env.PORT ? Number(process.env.PORT) : await findFreePort();
  process.env.PORT = String(port);

  // Suppress ALL server output BEFORE creating server — hijack process streams
  const logFile = path.resolve(process.env.COMPANY_ROOT || process.cwd(), '.tycono', 'server.log');
  try { fs.mkdirSync(path.dirname(logFile), { recursive: true }); } catch {}
  const logFd = fs.openSync(logFile, 'a');
  const logStream = fs.createWriteStream(logFile, { fd: logFd });
  const origStdoutWrite = process.stdout.write.bind(process.stdout);
  const origLog = (...args: unknown[]) => origStdoutWrite(args.join(' ') + '\n');

  // Redirect ALL output to log file BEFORE importing server code
  // Ink needs stdout clean — server must not write to stdout or stderr
  console.log = (...a: unknown[]) => { logStream.write(a.join(' ') + '\n'); };
  console.error = (...a: unknown[]) => { logStream.write(a.join(' ') + '\n'); };
  console.warn = (...a: unknown[]) => { logStream.write(a.join(' ') + '\n'); };
  console.info = (...a: unknown[]) => { logStream.write(a.join(' ') + '\n'); };
  // Also redirect stderr.write — some code uses process.stderr directly
  const origStderrWrite = process.stderr.write.bind(process.stderr);
  process.stderr.write = ((chunk: any, ...args: any[]) => {
    logStream.write(typeof chunk === 'string' ? chunk : chunk.toString());
    return true;
  }) as any;

  const { createHttpServer } = await import('../src/api/src/create-server.js');
  const server = createHttpServer();

  await new Promise<void>((resolve) => {
    server.listen(port, '0.0.0.0', () => resolve());
  });

  origLog(`  API server started on port ${port}`);
  origLog(`  Logs: ${logFile}`);

  // Graceful shutdown
  const shutdown = () => {
    server.close(() => process.exit(0));
    setTimeout(() => process.exit(1), 5000);
  };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);

  // Start TUI — stdout.write is NOT intercepted, Ink has full control
  const { startTui } = await import('../src/tui/index.tsx');
  await startTui({ port });
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

  // tui subcommand: start API server + TUI mode
  if (command === 'tui') {
    const attachMode = args.includes('--attach');
    // If --attach, skip server start — just connect to existing API
    if (attachMode) {
      const port = process.env.PORT ? Number(process.env.PORT) : 3000;
      const { startTui } = await import('../src/tui/index.tsx');
      await startTui({ port });
      return;
    }

    // Start API server, then TUI
    await startServerForTui();
    return;
  }

  if (command && !command.startsWith('-')) {
    // Treat as path to company directory
    const resolved = path.resolve(command);
    if (!fs.existsSync(resolved)) {
      console.error(`  Path not found: ${resolved}`);
      process.exit(1);
    }
    process.env.COMPANY_ROOT = resolved;
  }

  await startServer();
}
