#!/usr/bin/env node

import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, join } from 'node:path';
import { createRequire } from 'node:module';
import { execFileSync } from 'node:child_process';

// Auto-increase heap if not already set (prevents OOM with server+TUI in same process)
if (!process.env.__TYCONO_HEAP_SET && !process.execArgv.some(a => a.includes('max-old-space-size'))) {
  process.env.__TYCONO_HEAP_SET = '1';
  try {
    execFileSync(process.execPath, [
      '--max-old-space-size=8192',
      '--expose-gc',
      // '--heapsnapshot-near-heap-limit=1', // Enable for OOM diagnosis (creates large files)
      ...process.execArgv,
      fileURLToPath(import.meta.url),
      ...process.argv.slice(2),
    ], { stdio: 'inherit', env: process.env });
  } catch (e) {
    process.exit(e.status ?? 1);
  }
  process.exit(0);
}

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Resolve tsx using createRequire from THIS file's location
const require = createRequire(import.meta.url);
const tsxApiPath = pathToFileURL(require.resolve('tsx/esm/api')).href;
const tsx = await import(tsxApiPath);
tsx.register();

// Now we can import .ts files
const entryPath = pathToFileURL(join(__dirname, 'tycono.ts')).href;
const { main } = await import(entryPath);
await main(process.argv.slice(2));
