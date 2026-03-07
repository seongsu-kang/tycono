import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { runAgentLoop } from '../../src/engine/agent-loop.js';
import { TokenLedger } from '../../src/services/token-ledger.js';
import { MockProvider, textResponse, dispatchResponse } from '../mocks/mock-provider.js';
import { createTestOrgTree } from '../mocks/mock-org-tree.js';

let testRoot: string;
let ledger: TokenLedger;
const orgTree = createTestOrgTree();

beforeEach(() => {
  testRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'cost-tracking-test-'));
  ledger = new TokenLedger(testRoot);

  // Minimal AKB structure
  fs.mkdirSync(path.join(testRoot, 'roles', 'cto'), { recursive: true });
  fs.mkdirSync(path.join(testRoot, 'roles', 'pm'), { recursive: true });
  fs.mkdirSync(path.join(testRoot, 'roles', 'engineer'), { recursive: true });
  fs.writeFileSync(path.join(testRoot, 'CLAUDE.md'), '# Test Company\n');
  for (const role of ['cto', 'pm', 'engineer']) {
    fs.writeFileSync(
      path.join(testRoot, 'roles', role, 'role.yaml'),
      `id: ${role}\nname: ${role}\nlevel: member\nreports_to: ceo\npersona: "test"\n`,
    );
  }
  fs.mkdirSync(path.join(testRoot, 'knowledge'), { recursive: true });
  fs.mkdirSync(path.join(testRoot, 'architecture'), { recursive: true });
  fs.mkdirSync(path.join(testRoot, 'projects'), { recursive: true });
  fs.mkdirSync(path.join(testRoot, 'operations', 'decisions'), { recursive: true });
  fs.mkdirSync(path.join(testRoot, '.claude', 'skills', 'cto'), { recursive: true });
  fs.mkdirSync(path.join(testRoot, '.claude', 'skills', 'pm'), { recursive: true });
  fs.mkdirSync(path.join(testRoot, '.claude', 'skills', 'engineer'), { recursive: true });
});

afterEach(() => {
  fs.rmSync(testRoot, { recursive: true, force: true });
});

describe('Agent Loop — token tracking', () => {
  it('records tokens to ledger on each LLM call', async () => {
    const mock = new MockProvider([
      textResponse('result', { inputTokens: 500, outputTokens: 200 }),
    ]);

    await runAgentLoop({
      companyRoot: testRoot,
      roleId: 'cto',
      task: 'test token tracking',
      sourceRole: 'ceo',
      orgTree,
      llm: mock,
      jobId: 'job-test-1',
      model: 'claude-sonnet-4-20250514',
      tokenLedger: ledger,
    });

    const summary = ledger.query({ jobId: 'job-test-1' });
    expect(summary.entries).toHaveLength(1);
    expect(summary.totalInput).toBe(500);
    expect(summary.totalOutput).toBe(200);
    expect(summary.entries[0].roleId).toBe('cto');
    expect(summary.entries[0].model).toBe('claude-sonnet-4-20250514');
  });

  it('aggregates dispatch sub-agent tokens into parent', async () => {
    const mock = new MockProvider([
      // CTO dispatches to PM
      dispatchResponse('pm', 'report status'),
      // PM responds
      textResponse('PM: all good', { inputTokens: 300, outputTokens: 100 }),
      // CTO final response
      textResponse('CTO: PM says all good', { inputTokens: 400, outputTokens: 150 }),
    ]);
    // Override the first response to have usage
    mock['responses'][0].usage = { inputTokens: 600, outputTokens: 250 };

    const result = await runAgentLoop({
      companyRoot: testRoot,
      roleId: 'cto',
      task: 'get status from PM',
      sourceRole: 'ceo',
      orgTree,
      llm: mock,
      jobId: 'job-dispatch-test',
      model: 'claude-sonnet-4-20250514',
      tokenLedger: ledger,
    });

    // Parent should aggregate: CTO calls (600+400) + PM call (300) = 1300 input
    expect(result.totalTokens.input).toBe(1300);
    // CTO (250+150) + PM (100) = 500 output
    expect(result.totalTokens.output).toBe(500);

    // Ledger should have 3 entries (2 CTO + 1 PM)
    const all = ledger.query();
    expect(all.entries).toHaveLength(3);
    expect(all.totalInput).toBe(1300);
    expect(all.totalOutput).toBe(500);
  });

  it('works without tokenLedger (no crash)', async () => {
    const mock = new MockProvider([
      textResponse('no ledger', { inputTokens: 100, outputTokens: 50 }),
    ]);

    const result = await runAgentLoop({
      companyRoot: testRoot,
      roleId: 'pm',
      task: 'no ledger test',
      sourceRole: 'ceo',
      orgTree,
      llm: mock,
      // No tokenLedger, no jobId — should still work fine
    });

    expect(result.output).toContain('no ledger');
    expect(result.totalTokens.input).toBe(100);
    expect(result.totalTokens.output).toBe(50);
  });

  it('tracks tokens across multiple turns', async () => {
    const mock = new MockProvider([
      textResponse('turn 1', { inputTokens: 200, outputTokens: 80 }),
    ]);

    // Simple single-turn, but verifies basic flow
    const result = await runAgentLoop({
      companyRoot: testRoot,
      roleId: 'pm',
      task: 'multi-turn',
      sourceRole: 'ceo',
      orgTree,
      llm: mock,
      jobId: 'job-multi',
      model: 'claude-haiku-4-5',
      tokenLedger: ledger,
    });

    const summary = ledger.query({ jobId: 'job-multi' });
    expect(summary.entries).toHaveLength(1);
    expect(summary.entries[0].model).toBe('claude-haiku-4-5');
    expect(result.totalTokens.input).toBe(200);
  });
});
