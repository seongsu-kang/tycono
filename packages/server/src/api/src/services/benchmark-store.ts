import fs from 'node:fs';
import path from 'node:path';
import { COMPANY_ROOT } from './file-reader.js';
import { ActivityStream } from './activity-stream.js';
import { getTokenLedger } from './token-ledger.js';
import { estimateCostFromEntry } from './pricing.js';
import * as boardStore from './board-store.js';

/* ─── Types ──────────────────────────── */

export interface RoleBenchmark {
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheCreationTokens: number;
  costUsd: number;
  turns: number;
  toolCalls: number;
  bashCalls: number;
  readCalls: number;
  dispatchCalls: number;
}

export interface WaveBenchmark {
  ts: string;
  waveId: string;
  agencyId: string;
  directive: string;
  serverVersion: string;
  totalCostUsd: number;
  totalDuration: number;
  byRole: Record<string, RoleBenchmark>;
  lessonsExtracted: number;
  boardTasksDone: number;
  boardTasksSkipped: number;
  features: string[];
  tags: string[];
}

export interface Experiment {
  id: string;
  ts: string;
  directive: string;
  agencyId: string;
  runs: Array<{
    waveId: string;
    serverVersion: string;
    features: string[];
    benchmarkRef: string; // waveId to look up in benchmarks
  }>;
  status: 'running' | 'done';
}

/* ─── Paths ──────────────────────────── */

function benchmarksDir(): string {
  return path.join(COMPANY_ROOT, '.tycono', 'benchmarks');
}

function benchmarksPath(agencyId: string): string {
  return path.join(benchmarksDir(), `${agencyId}.jsonl`);
}

function experimentsPath(): string {
  return path.join(benchmarksDir(), '_experiments.jsonl');
}

/* ─── Collect benchmark from completed wave ── */

export function collectBenchmark(
  waveId: string,
  agencyId: string,
  directive: string,
  serverVersion: string,
  startTime: number,
  lessonsExtracted: number,
  features: string[],
): WaveBenchmark | null {
  const ledger = getTokenLedger(COMPANY_ROOT);

  // Collect token usage by role from all sessions in this wave
  const byRole: Record<string, RoleBenchmark> = {};
  let totalCostUsd = 0;

  // Query ledger for all sessions (we don't have wave filter, so scan all recent)
  const summary = ledger.query({});
  const waveEntries = summary.entries.filter(e => {
    // Match entries from sessions that belong to this wave
    // Session IDs contain role info: ses-{roleId}-{timestamp}
    return e.sessionId?.includes(waveId) || true; // TODO: better wave filtering
  });

  // Group by role from activity-streams
  const streamsDir = ActivityStream.getStreamDir();
  if (fs.existsSync(streamsDir)) {
    const streamFiles = fs.readdirSync(streamsDir).filter(f => f.endsWith('.jsonl'));

    for (const file of streamFiles) {
      const sessionId = file.replace('.jsonl', '');
      const events = ActivityStream.readAll(sessionId);
      if (events.length === 0) continue;

      const roleId = events[0].roleId;
      if (!roleId) continue;

      // Check if this session belongs to our wave (by checking traceId or timing)
      const firstTs = new Date(events[0].ts).getTime();
      if (firstTs < startTime - 60000) continue; // Skip sessions older than wave start

      if (!byRole[roleId]) {
        byRole[roleId] = {
          inputTokens: 0, outputTokens: 0,
          cacheReadTokens: 0, cacheCreationTokens: 0,
          costUsd: 0, turns: 0, toolCalls: 0,
          bashCalls: 0, readCalls: 0, dispatchCalls: 0,
        };
      }

      const r = byRole[roleId];

      for (const e of events) {
        if (e.type === 'tool:start') {
          r.toolCalls++;
          const name = e.data?.name as string || '';
          if (name === 'Bash') r.bashCalls++;
          if (name === 'Read') r.readCalls++;
          if (name === 'dispatch') r.dispatchCalls++;
        }
        if (e.type === 'msg:turn-complete') {
          r.turns++;
        }
      }

      // Token usage from ledger entries matching this session
      const sessionEntries = summary.entries.filter(e => e.sessionId === sessionId);
      for (const entry of sessionEntries) {
        r.inputTokens += entry.inputTokens;
        r.outputTokens += entry.outputTokens;
        r.cacheReadTokens += entry.cacheReadTokens ?? 0;
        r.cacheCreationTokens += entry.cacheCreationTokens ?? 0;
        r.costUsd += estimateCostFromEntry(entry);
      }

      totalCostUsd += r.costUsd;
    }
  }

  if (Object.keys(byRole).length === 0) return null;

  // Board stats
  let boardTasksDone = 0;
  let boardTasksSkipped = 0;
  try {
    const board = boardStore.getBoard(waveId);
    if (board) {
      boardTasksDone = board.tasks.filter((t: { status: string }) => t.status === 'done').length;
      boardTasksSkipped = board.tasks.filter((t: { status: string }) => t.status === 'skipped').length;
    }
  } catch {}

  const benchmark: WaveBenchmark = {
    ts: new Date().toISOString(),
    waveId,
    agencyId,
    directive: directive.slice(0, 80),
    serverVersion,
    totalCostUsd,
    totalDuration: Date.now() - startTime,
    byRole,
    lessonsExtracted,
    boardTasksDone,
    boardTasksSkipped,
    features,
    tags: [],
  };

  return benchmark;
}

/* ─── Save / Load ──────────────────── */

export function saveBenchmark(benchmark: WaveBenchmark): void {
  const dir = benchmarksDir();
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  const fp = benchmarksPath(benchmark.agencyId);
  fs.appendFileSync(fp, JSON.stringify(benchmark) + '\n');
}

export function loadBenchmarks(agencyId: string): WaveBenchmark[] {
  const fp = benchmarksPath(agencyId);
  if (!fs.existsSync(fp)) return [];
  const lines = fs.readFileSync(fp, 'utf-8').split('\n').filter(Boolean);
  return lines.map(l => { try { return JSON.parse(l); } catch { return null; } }).filter(Boolean);
}

export function getBenchmark(agencyId: string, waveId: string): WaveBenchmark | null {
  const all = loadBenchmarks(agencyId);
  return all.find(b => b.waveId === waveId) ?? null;
}

export function listAllBenchmarks(): WaveBenchmark[] {
  const dir = benchmarksDir();
  if (!fs.existsSync(dir)) return [];
  const files = fs.readdirSync(dir).filter(f => f.endsWith('.jsonl') && !f.startsWith('_'));
  const all: WaveBenchmark[] = [];
  for (const f of files) {
    const agencyId = f.replace('.jsonl', '');
    all.push(...loadBenchmarks(agencyId));
  }
  return all.sort((a, b) => b.ts.localeCompare(a.ts));
}

/* ─── Experiments ──────────────────── */

export function saveExperiment(experiment: Experiment): void {
  const dir = benchmarksDir();
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  const fp = experimentsPath();

  // Load existing, replace if same ID
  const existing = loadExperiments().filter(e => e.id !== experiment.id);
  existing.push(experiment);

  const content = existing.map(e => JSON.stringify(e)).join('\n') + '\n';
  fs.writeFileSync(fp, content);
}

export function loadExperiments(): Experiment[] {
  const fp = experimentsPath();
  if (!fs.existsSync(fp)) return [];
  const lines = fs.readFileSync(fp, 'utf-8').split('\n').filter(Boolean);
  return lines.map(l => { try { return JSON.parse(l); } catch { return null; } }).filter(Boolean);
}
