/**
 * Token Tracking Integration Test
 *
 * agent-loop이 TokenLedger에 토큰 사용량을 제대로 기록하는지 검증.
 * MockProvider의 usage 필드를 활용하여 기록 정합성 확인.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { runAgentLoop } from '../../src/engine/agent-loop.js';
import { TokenLedger, resetTokenLedger } from '../../src/services/token-ledger.js';
import { MockProvider, textResponse, dispatchResponse } from '../mocks/mock-provider.js';
import { createTestOrgTree } from '../mocks/mock-org-tree.js';

let testRoot: string;
const orgTree = createTestOrgTree();

beforeEach(() => {
  testRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'token-track-test-'));
  resetTokenLedger();
  // Scaffold minimal AKB
  for (const dir of ['roles/cto', 'roles/pm', 'roles/engineer', 'knowledge', 'architecture', 'projects', 'operations/decisions', '.claude/skills/cto', '.claude/skills/pm', '.claude/skills/engineer']) {
    fs.mkdirSync(path.join(testRoot, dir), { recursive: true });
  }
  fs.writeFileSync(path.join(testRoot, 'CLAUDE.md'), '# TestCo\n');
  for (const role of ['cto', 'pm', 'engineer']) {
    fs.writeFileSync(path.join(testRoot, 'roles', role, 'role.yaml'),
      `id: ${role}\nname: ${role}\nlevel: member\nreports_to: ${role === 'cto' ? 'ceo' : 'cto'}\npersona: "test"\n`);
  }
});

describe('Token tracking in agent-loop', () => {
  it('records token usage to ledger for each LLM call', async () => {
    const ledger = new TokenLedger(testRoot);
    const mock = new MockProvider([
      textResponse('hello', { inputTokens: 500, outputTokens: 200 }),
    ]);

    await runAgentLoop({
      companyRoot: testRoot,
      roleId: 'cto',
      task: 'say hello',
      sourceRole: 'ceo',
      orgTree,
      llm: mock,
      jobId: 'test-job-1',
      model: 'claude-sonnet-4-5',
      tokenLedger: ledger,
    });

    const summary = ledger.query();
    expect(summary.entries).toHaveLength(1);
    expect(summary.entries[0].jobId).toBe('test-job-1');
    expect(summary.entries[0].roleId).toBe('cto');
    expect(summary.entries[0].model).toBe('claude-sonnet-4-5');
    expect(summary.entries[0].inputTokens).toBe(500);
    expect(summary.entries[0].outputTokens).toBe(200);
  });

  it('records tokens for both parent and sub-agent in dispatch', async () => {
    const ledger = new TokenLedger(testRoot);
    const mock = new MockProvider([
      // CTO call (1000 in, 400 out)
      dispatchResponse('pm', 'status'),
      // PM sub-agent call (300 in, 100 out)
      textResponse('PM result', { inputTokens: 300, outputTokens: 100 }),
      // CTO final (800 in, 300 out)
      textResponse('CTO summary', { inputTokens: 800, outputTokens: 300 }),
    ]);

    const result = await runAgentLoop({
      companyRoot: testRoot,
      roleId: 'cto',
      task: 'check status',
      sourceRole: 'ceo',
      orgTree,
      llm: mock,
      jobId: 'test-job-2',
      model: 'claude-sonnet-4-5',
      tokenLedger: ledger,
    });

    const summary = ledger.query();
    // Should have entries for CTO (2 calls) + PM (1 call) = 3 entries
    expect(summary.entries.length).toBeGreaterThanOrEqual(2);

    // Filter by role
    const ctoSummary = ledger.query({ roleId: 'cto' });
    const pmSummary = ledger.query({ roleId: 'pm' });

    expect(ctoSummary.entries.length).toBeGreaterThanOrEqual(1);
    expect(pmSummary.entries.length).toBeGreaterThanOrEqual(1);
    expect(pmSummary.totalInput).toBe(300);
    expect(pmSummary.totalOutput).toBe(100);

    // Total tokens in result should include sub-agent tokens
    expect(result.totalTokens.input).toBeGreaterThan(0);
    expect(result.totalTokens.output).toBeGreaterThan(0);
  });

  it('works without ledger (optional parameter)', async () => {
    const mock = new MockProvider([textResponse('ok')]);

    // Should not throw when tokenLedger is not provided
    const result = await runAgentLoop({
      companyRoot: testRoot,
      roleId: 'pm',
      task: 'test',
      sourceRole: 'ceo',
      orgTree,
      llm: mock,
      // no tokenLedger
    });

    expect(result.output).toBe('ok');
  });
});
