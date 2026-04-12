import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { execSync, spawn, type ChildProcess } from 'node:child_process';
import { COMPANY_ROOT } from './file-reader.js';
import type { WaveBenchmark } from './benchmark-store.js';
import { loadBenchmarks } from './benchmark-store.js';

/* ─── Types ──────────────────────────── */

export interface ExperimentRun {
  id: string;
  serverVersion: string;
  features: string[];
  configOverrides: Record<string, unknown>;
  sandboxDir: string;
  port: number;
  waveId: string;
  pid: number;
  status: 'pending' | 'installing' | 'running' | 'done' | 'error';
  error?: string;
  benchmark?: WaveBenchmark;
}

export interface Experiment {
  id: string;
  ts: string;
  directive: string;
  agencyId: string;
  status: 'pending' | 'running' | 'done' | 'error';
  runs: ExperimentRun[];
}

/* ─── Storage ──────────────────────────── */

function experimentsDir(): string {
  return path.join(COMPANY_ROOT, '.tycono', 'experiments');
}

function experimentPath(id: string): string {
  return path.join(experimentsDir(), `${id}.json`);
}

export function saveExperiment(exp: Experiment): void {
  const dir = experimentsDir();
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(experimentPath(exp.id), JSON.stringify(exp, null, 2));
}

export function loadExperiment(id: string): Experiment | null {
  const fp = experimentPath(id);
  if (!fs.existsSync(fp)) return null;
  try { return JSON.parse(fs.readFileSync(fp, 'utf-8')); } catch { return null; }
}

export function listExperiments(): Experiment[] {
  const dir = experimentsDir();
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir)
    .filter(f => f.endsWith('.json'))
    .map(f => { try { return JSON.parse(fs.readFileSync(path.join(dir, f), 'utf-8')); } catch { return null; } })
    .filter(Boolean)
    .sort((a: Experiment, b: Experiment) => b.ts.localeCompare(a.ts));
}

/* ─── Sandbox ──────────────────────────── */

function createSandbox(agencyId: string): string {
  const sandboxDir = fs.mkdtempSync(path.join(os.tmpdir(), `tycono-exp-`));

  // Create basic structure
  fs.mkdirSync(path.join(sandboxDir, 'knowledge'), { recursive: true });
  fs.mkdirSync(path.join(sandboxDir, '.tycono'), { recursive: true });

  // Copy CLAUDE.md
  const claudeMd = path.join(COMPANY_ROOT, 'knowledge', 'CLAUDE.md');
  if (fs.existsSync(claudeMd)) {
    fs.cpSync(claudeMd, path.join(sandboxDir, 'knowledge', 'CLAUDE.md'));
  } else {
    fs.writeFileSync(path.join(sandboxDir, 'knowledge', 'CLAUDE.md'), '# Experiment\n');
  }

  // Copy agency if exists
  const agencySources = [
    path.join(COMPANY_ROOT, '.tycono', 'agencies', agencyId),
    path.join(os.homedir(), '.tycono', 'agencies', agencyId),
  ];
  for (const src of agencySources) {
    if (fs.existsSync(src)) {
      const dest = path.join(sandboxDir, '.tycono', 'agencies', agencyId);
      fs.cpSync(src, dest, { recursive: true });
      break;
    }
  }

  return sandboxDir;
}

function installServer(sandboxDir: string, version: string): void {
  const serverDir = path.join(sandboxDir, 'server');
  fs.mkdirSync(serverDir, { recursive: true });
  fs.writeFileSync(path.join(serverDir, 'package.json'), '{"private":true}');

  // Use shared npm cache to speed up installs
  const cacheDir = path.join(os.tmpdir(), 'tycono-exp-npm-cache');
  fs.mkdirSync(cacheDir, { recursive: true });

  execSync(`npm install tycono-server@${version} --save --loglevel=error --cache "${cacheDir}"`, {
    cwd: serverDir,
    timeout: 300_000,  // 5min — npm install can be slow
    stdio: 'pipe',
  });
}

function applyConfigOverrides(sandboxDir: string, agencyId: string, overrides: Record<string, unknown>): void {
  if (Object.keys(overrides).length === 0) return;

  // Find agency.yaml and patch it
  const yamlPaths = [
    path.join(sandboxDir, '.tycono', 'agencies', agencyId, 'agency.yaml'),
  ];
  for (const yp of yamlPaths) {
    if (fs.existsSync(yp)) {
      let content = fs.readFileSync(yp, 'utf-8');
      // Simple YAML append for overrides
      for (const [key, value] of Object.entries(overrides)) {
        if (typeof value === 'string') {
          content += `\n${key}: |\n  ${value.replace(/\n/g, '\n  ')}\n`;
        } else {
          content += `\n${key}: ${JSON.stringify(value)}\n`;
        }
      }
      fs.writeFileSync(yp, content);
      break;
    }
  }
}

/* ─── Run Experiment ──────────────────── */

const runningProcesses = new Map<string, ChildProcess>();

export async function runExperiment(experiment: Experiment): Promise<void> {
  experiment.status = 'running';
  saveExperiment(experiment);

  // Setup sandboxes sequentially (npm install is resource-heavy, parallel causes timeouts)
  for (const run of experiment.runs) {
    try {
      run.status = 'installing';
      saveExperiment(experiment);

      // Create sandbox
      run.sandboxDir = createSandbox(experiment.agencyId);

      // Install specific server version
      console.log(`[Experiment] Installing tycono-server@${run.serverVersion} in ${run.sandboxDir}`);
      installServer(run.sandboxDir, run.serverVersion);

      // Apply config overrides (ceo_prompt, context_mode, etc.)
      applyConfigOverrides(run.sandboxDir, experiment.agencyId, run.configOverrides);

      run.status = 'pending';
      saveExperiment(experiment);
      console.log(`[Experiment] ${run.id} sandbox ready`);
    } catch (err) {
      run.status = 'error';
      run.error = String(err);
      saveExperiment(experiment);
      console.error(`[Experiment] ${run.id} setup failed:`, err);
    }
  }

  // Start servers and waves sequentially to avoid port conflicts
  for (const run of experiment.runs) {
    if (run.status !== 'pending') continue;

    try {
      // Start server
      const serverBin = path.join(run.sandboxDir, 'server', 'node_modules', '.bin', 'tycono-server');
      // Clean env: remove PORT (auto-detect), remove conflicting paths
      const cleanEnv = { ...process.env };
      delete cleanEnv.PORT;  // Force auto-detect free port
      delete cleanEnv.__TYCONO_HEAP_SET;  // Allow heap re-config

      const serverProc = spawn('node', [serverBin], {
        cwd: run.sandboxDir,
        env: {
          ...cleanEnv,
          COMPANY_ROOT: run.sandboxDir,
          NODE_ENV: 'production',
        },
        stdio: 'pipe',
        detached: true,
      });
      run.pid = serverProc.pid || 0;
      runningProcesses.set(run.id, serverProc);

      // Wait for server ready
      const headlessPath = path.join(run.sandboxDir, '.tycono', 'headless.json');
      let port = 0;
      for (let i = 0; i < 60; i++) {
        if (fs.existsSync(headlessPath)) {
          try {
            const hj = JSON.parse(fs.readFileSync(headlessPath, 'utf-8'));
            port = hj.port;
            // Verify health
            const resp = execSync(`curl -s --max-time 2 http://localhost:${port}/api/health`, { stdio: 'pipe' }).toString();
            if (resp.includes('"ok"')) break;
          } catch {}
        }
        await new Promise(r => setTimeout(r, 1000));
      }

      if (!port) {
        run.status = 'error';
        run.error = 'Server did not start within 60s';
        saveExperiment(experiment);
        continue;
      }
      run.port = port;

      // Start wave
      const waveResp = execSync(
        `curl -s -X POST http://localhost:${port}/api/exec/wave -H "Content-Type: application/json" -d '${JSON.stringify({ directive: experiment.directive, preset: experiment.agencyId })}'`,
        { stdio: 'pipe', timeout: 30_000 }
      ).toString();

      const waveData = JSON.parse(waveResp);
      run.waveId = waveData.waveId || '';
      run.status = 'running';
      saveExperiment(experiment);

      // Wait for wave completion (async)
      waitForWave(run, port, experiment).catch(err => {
        run.status = 'error';
        run.error = String(err);
        saveExperiment(experiment);
      });

    } catch (err) {
      run.status = 'error';
      run.error = String(err);
      saveExperiment(experiment);
    }
  }
}

async function waitForWave(run: ExperimentRun, port: number, experiment: Experiment): Promise<void> {
  const timeout = 300_000; // 5 min
  const start = Date.now();

  while (Date.now() - start < timeout) {
    try {
      const resp = execSync(
        `curl -s http://localhost:${port}/api/waves/active`,
        { stdio: 'pipe', timeout: 5_000 }
      ).toString();
      const data = JSON.parse(resp);
      const waves = data.waves || data;
      const hasWave = Array.isArray(waves) && waves.some((w: { id: string }) => w.id === run.waveId);
      if (!hasWave) {
        // Wave done — collect benchmark
        try {
          const bmResp = execSync(
            `curl -s http://localhost:${port}/api/benchmarks`,
            { stdio: 'pipe', timeout: 5_000 }
          ).toString();
          const bmData = JSON.parse(bmResp);
          if (bmData.benchmarks?.length > 0) {
            run.benchmark = bmData.benchmarks[bmData.benchmarks.length - 1];
          }
        } catch {}

        run.status = 'done';
        saveExperiment(experiment);

        // Cleanup: kill server
        const proc = runningProcesses.get(run.id);
        if (proc) { proc.kill(); runningProcesses.delete(run.id); }

        // Check if all runs done
        if (experiment.runs.every(r => r.status === 'done' || r.status === 'error')) {
          experiment.status = 'done';
          saveExperiment(experiment);
        }
        return;
      }
    } catch {}
    await new Promise(r => setTimeout(r, 5_000));
  }

  run.status = 'error';
  run.error = 'Wave timed out (5min)';
  saveExperiment(experiment);
}

/* ─── Cleanup ──────────────────────────── */

export function cleanupExperiment(experimentId: string): void {
  const exp = loadExperiment(experimentId);
  if (!exp) return;

  for (const run of exp.runs) {
    // Kill server if still running
    const proc = runningProcesses.get(run.id);
    if (proc) { proc.kill(); runningProcesses.delete(run.id); }

    // Remove sandbox
    if (run.sandboxDir && fs.existsSync(run.sandboxDir)) {
      fs.rmSync(run.sandboxDir, { recursive: true, force: true });
    }
  }
}
