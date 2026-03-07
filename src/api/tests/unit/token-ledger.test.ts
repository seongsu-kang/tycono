import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { TokenLedger, getTokenLedger, resetTokenLedger } from '../../src/services/token-ledger.js';
import { estimateCost } from '../../src/services/pricing.js';

let testRoot: string;
let ledger: TokenLedger;

beforeEach(() => {
  testRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'token-ledger-test-'));
  ledger = new TokenLedger(testRoot);
});

afterEach(() => {
  resetTokenLedger();
  fs.rmSync(testRoot, { recursive: true, force: true });
});

describe('TokenLedger — record', () => {
  it('creates JSONL file and appends entries', () => {
    ledger.record({
      ts: '2026-03-07T10:00:00Z',
      jobId: 'job-1',
      roleId: 'cto',
      model: 'claude-sonnet-4-20250514',
      inputTokens: 1000,
      outputTokens: 500,
    });

    const filePath = ledger.getFilePath();
    expect(fs.existsSync(filePath)).toBe(true);

    const content = fs.readFileSync(filePath, 'utf-8').trim();
    const entry = JSON.parse(content);
    expect(entry.jobId).toBe('job-1');
    expect(entry.inputTokens).toBe(1000);
    expect(entry.outputTokens).toBe(500);
  });

  it('appends multiple entries', () => {
    ledger.record({ ts: '2026-03-07T10:00:00Z', jobId: 'job-1', roleId: 'cto', model: 'sonnet', inputTokens: 100, outputTokens: 50 });
    ledger.record({ ts: '2026-03-07T10:01:00Z', jobId: 'job-1', roleId: 'cto', model: 'sonnet', inputTokens: 200, outputTokens: 100 });

    const lines = fs.readFileSync(ledger.getFilePath(), 'utf-8').trim().split('\n');
    expect(lines).toHaveLength(2);
  });
});

describe('TokenLedger — query', () => {
  beforeEach(() => {
    ledger.record({ ts: '2026-03-07T10:00:00Z', jobId: 'job-1', roleId: 'cto', model: 'sonnet', inputTokens: 1000, outputTokens: 500 });
    ledger.record({ ts: '2026-03-07T11:00:00Z', jobId: 'job-2', roleId: 'pm', model: 'sonnet', inputTokens: 2000, outputTokens: 800 });
    ledger.record({ ts: '2026-03-08T09:00:00Z', jobId: 'job-3', roleId: 'cto', model: 'opus', inputTokens: 3000, outputTokens: 1200 });
  });

  it('returns all entries without filter', () => {
    const result = ledger.query();
    expect(result.entries).toHaveLength(3);
    expect(result.totalInput).toBe(6000);
    expect(result.totalOutput).toBe(2500);
  });

  it('filters by roleId', () => {
    const result = ledger.query({ roleId: 'cto' });
    expect(result.entries).toHaveLength(2);
    expect(result.totalInput).toBe(4000);
  });

  it('filters by jobId', () => {
    const result = ledger.query({ jobId: 'job-2' });
    expect(result.entries).toHaveLength(1);
    expect(result.totalInput).toBe(2000);
  });

  it('filters by date range', () => {
    const result = ledger.query({ from: '2026-03-08', to: '2026-03-08' });
    expect(result.entries).toHaveLength(1);
    expect(result.totalInput).toBe(3000);
  });

  it('returns empty for non-existent file', () => {
    const emptyRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'empty-ledger-'));
    const emptyLedger = new TokenLedger(emptyRoot);
    const result = emptyLedger.query();
    expect(result.entries).toHaveLength(0);
    expect(result.totalInput).toBe(0);
    fs.rmSync(emptyRoot, { recursive: true, force: true });
  });
});

describe('getTokenLedger singleton', () => {
  it('returns same instance for same companyRoot', () => {
    const a = getTokenLedger(testRoot);
    const b = getTokenLedger(testRoot);
    expect(a).toBe(b);
  });

  it('returns new instance when companyRoot changes', () => {
    const root2 = fs.mkdtempSync(path.join(os.tmpdir(), 'ledger-test2-'));
    const a = getTokenLedger(testRoot);
    const b = getTokenLedger(root2);
    expect(a).not.toBe(b);
    fs.rmSync(root2, { recursive: true, force: true });
  });
});

describe('estimateCost', () => {
  it('Sonnet 4.5: $3/1M input + $15/1M output', () => {
    const cost = estimateCost(1_000_000, 1_000_000, 'claude-sonnet-4-5');
    expect(cost).toBeCloseTo(18.00, 2);
  });

  it('Haiku 4.5: $0.80/1M input + $4/1M output', () => {
    const cost = estimateCost(1_000_000, 1_000_000, 'claude-haiku-4-5-20251001');
    expect(cost).toBeCloseTo(4.80, 2);
  });

  it('Opus 4.6: $15/1M input + $75/1M output', () => {
    const cost = estimateCost(100_000, 50_000, 'claude-opus-4-6');
    expect(cost).toBeCloseTo(5.25, 2);
  });

  it('uses Sonnet pricing as default for unknown models', () => {
    const cost = estimateCost(1_000_000, 1_000_000, 'unknown-model');
    expect(cost).toBeCloseTo(18.00, 2);
  });

  it('returns 0 for zero tokens', () => {
    expect(estimateCost(0, 0, 'claude-sonnet-4-5')).toBe(0);
  });
});
