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
    tycono [path]       Start TUI (default, optionally point to a company directory)
    tycono --classic    Start pixel office web UI
    tycono --attach     Connect TUI to existing API server
    tycono --preset <id>  Activate a company preset
    tycono --help       Show this help message
    tycono --version    Show version

  Examples:
    tycono                      Start TUI in current directory
    tycono ./my-company         Start TUI with existing company folder
    tycono --classic            Start pixel office web UI
    tycono --preset saas-plg-growth  Activate preset and start
    PORT=3000 tycono --attach   Attach TUI to running server

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

  // Redirect console + stdout.write to suppress server logs
  // ⛔ Do NOT redirect process.stderr.write — breaks Node.js http client
  console.log = (...a: unknown[]) => { logStream.write(a.join(' ') + '\n'); };
  console.error = (...a: unknown[]) => { logStream.write(a.join(' ') + '\n'); };
  console.warn = (...a: unknown[]) => { logStream.write(a.join(' ') + '\n'); };
  console.info = (...a: unknown[]) => { logStream.write(a.join(' ') + '\n'); };

  // Intercept stdout.write — allow Ink (ANSI), redirect server text to log
  const isInkOutput = (s: string) => s.includes('\x1b[') || s.includes('\x1b(');
  process.stdout.write = ((chunk: any, ...args: any[]) => {
    const str = typeof chunk === 'string' ? chunk : chunk.toString();
    if (isInkOutput(str)) return origStdoutWrite(chunk, ...args);
    logStream.write(str);
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

  // --classic: legacy pixel office web UI
  if (command === '--classic' || args.includes('--classic')) {
    if (command === '--classic' && args[1] && !args[1].startsWith('-')) {
      process.env.COMPANY_ROOT = path.resolve(args[1]);
    }
    await startServer();
    return;
  }

  // --attach: connect TUI to existing API server
  if (command === '--attach' || args.includes('--attach')) {
    const port = process.env.PORT ? Number(process.env.PORT) : 3000;
    const { startTui } = await import('../src/tui/index.tsx');
    await startTui({ port });
    return;
  }

  // --preset: activate a company preset
  if (command === '--preset' || args.includes('--preset')) {
    const presetIdIndex = args.indexOf('--preset');
    if (presetIdIndex === -1 || !args[presetIdIndex + 1]) {
      console.error('  Error: --preset requires a preset ID');
      console.error('  Example: npx tycono --preset saas-plg-growth');
      process.exit(1);
    }
    const presetId = args[presetIdIndex + 1];
    process.env.TYCONO_PRESET = presetId;
    console.log(`  Activating preset: ${presetId}`);
    await startServerForTui();
    return;
  }

  // Legacy: `tui` subcommand still works
  if (command === 'tui') {
    if (args.includes('--attach')) {
      const port = process.env.PORT ? Number(process.env.PORT) : 3000;
      const { startTui } = await import('../src/tui/index.tsx');
      await startTui({ port });
      return;
    }
    await startServerForTui();
    return;
  }

  // Path argument: treat as company directory
  if (command && !command.startsWith('-')) {
    const resolved = path.resolve(command);
    if (!fs.existsSync(resolved)) {
      console.error(`  Path not found: ${resolved}`);
      process.exit(1);
    }
    process.env.COMPANY_ROOT = resolved;
  }

  // Show first-run notice (once only)
  const prefsPath = path.resolve(process.env.COMPANY_ROOT || process.cwd(), '.tycono', 'preferences.json');
  let prefs: Record<string, unknown> = {};
  try { prefs = JSON.parse(fs.readFileSync(prefsPath, 'utf-8')); } catch {}
  if (!prefs.tuiNoticeShown) {
    console.log('');
    console.log('  Tycono v' + VERSION + ' — AI Company OS');
    console.log('');
    console.log('  New: Terminal mode is now the default.');
    console.log('  Faster, scriptable, built for work.');
    console.log('');
    console.log('  Looking for the pixel office?');
    console.log('  → npx tycono --classic');
    console.log('');
    prefs.tuiNoticeShown = true;
    try {
      fs.mkdirSync(path.dirname(prefsPath), { recursive: true });
      fs.writeFileSync(prefsPath, JSON.stringify(prefs, null, 2));
    } catch {}
  }

  // Default: TUI mode
  await startServerForTui();
}
