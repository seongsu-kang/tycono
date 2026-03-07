/**
 * Live Cost Tracking Test — Real Anthropic API (Haiku)
 *
 * 실제 Haiku 모델로 agent-loop 실행 후:
 * 1. TokenLedger에 기록 확인
 * 2. estimateCost() 환산 정확성 확인
 * 3. 토큰 수 > 0 확인
 *
 * 실행: ANTHROPIC_API_KEY=... npx vitest run --config vitest.live.config.ts
 */
import { describe, it, expect, beforeEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { runAgentLoop } from '../../src/engine/agent-loop.js';
import { AnthropicProvider } from '../../src/engine/llm-adapter.js';
import { TokenLedger, resetTokenLedger } from '../../src/services/token-ledger.js';
import { estimateCost } from '../../src/services/pricing.js';
import { createTestOrgTree } from '../mocks/mock-org-tree.js';

const API_KEY = process.env.ANTHROPIC_API_KEY;
const MODEL = 'claude-haiku-4-5-20251001';

// Skip if no API key
const describeIf = API_KEY ? describe : describe.skip;

let testRoot: string;
const orgTree = createTestOrgTree();

beforeEach(() => {
  testRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'live-cost-test-'));
  resetTokenLedger();
  // Scaffold minimal AKB
  for (const dir of ['roles/cto', 'roles/pm', 'roles/engineer', 'knowledge', 'architecture', 'projects', 'operations/decisions', '.claude/skills/cto', '.claude/skills/pm', '.claude/skills/engineer']) {
    fs.mkdirSync(path.join(testRoot, dir), { recursive: true });
  }
  fs.writeFileSync(path.join(testRoot, 'CLAUDE.md'), '# TestCo\n');
  for (const role of ['cto', 'pm', 'engineer']) {
    fs.writeFileSync(path.join(testRoot, 'roles', role, 'role.yaml'),
      `id: ${role}\nname: ${role}\nlevel: member\nreports_to: ${role === 'cto' ? 'ceo' : 'cto'}\npersona: "test persona"\n`);
  }
});

describeIf('Live Cost Tracking — Haiku', () => {
  it('single call: records tokens and calculates cost', async () => {
    const ledger = new TokenLedger(testRoot);
    const llm = new AnthropicProvider({ apiKey: API_KEY, model: MODEL });

    const result = await runAgentLoop({
      companyRoot: testRoot,
      roleId: 'pm',
      task: 'Say "hello" in one word. Nothing else.',
      sourceRole: 'ceo',
      orgTree,
      llm,
      jobId: 'live-cost-1',
      model: MODEL,
      tokenLedger: ledger,
      maxTurns: 1,
    });

    // 1. Agent returned something
    expect(result.output.length).toBeGreaterThan(0);
    expect(result.turns).toBe(1);

    // 2. Tokens tracked in result
    expect(result.totalTokens.input).toBeGreaterThan(0);
    expect(result.totalTokens.output).toBeGreaterThan(0);

    // 3. Ledger has entry
    const summary = ledger.query();
    expect(summary.entries).toHaveLength(1);
    expect(summary.entries[0].jobId).toBe('live-cost-1');
    expect(summary.entries[0].roleId).toBe('pm');
    expect(summary.entries[0].model).toBe(MODEL);
    expect(summary.entries[0].inputTokens).toBe(result.totalTokens.input);
    expect(summary.entries[0].outputTokens).toBe(result.totalTokens.output);

    // 4. Cost estimation works
    const cost = estimateCost(summary.totalInput, summary.totalOutput, MODEL);
    expect(cost).toBeGreaterThan(0);
    // Haiku: $0.80/1M in + $4/1M out — a simple call should be < $0.01
    expect(cost).toBeLessThan(0.01);

    // 5. JSONL file exists on disk
    expect(fs.existsSync(ledger.getFilePath())).toBe(true);
    const lines = fs.readFileSync(ledger.getFilePath(), 'utf-8').trim().split('\n');
    expect(lines).toHaveLength(1);
    const entry = JSON.parse(lines[0]);
    expect(entry.inputTokens).toBe(result.totalTokens.input);

    console.log(`[Live] Tokens: ${result.totalTokens.input} in / ${result.totalTokens.output} out`);
    console.log(`[Live] Cost: $${cost.toFixed(6)}`);
  }, 30_000);

  it('query filters work with real data', async () => {
    const ledger = new TokenLedger(testRoot);
    const llm = new AnthropicProvider({ apiKey: API_KEY, model: MODEL });

    // Run two calls with different roles
    await runAgentLoop({
      companyRoot: testRoot,
      roleId: 'cto',
      task: 'Reply with just "ok".',
      sourceRole: 'ceo',
      orgTree,
      llm,
      jobId: 'live-cost-2a',
      model: MODEL,
      tokenLedger: ledger,
      maxTurns: 1,
    });

    await runAgentLoop({
      companyRoot: testRoot,
      roleId: 'pm',
      task: 'Reply with just "yes".',
      sourceRole: 'ceo',
      orgTree,
      llm,
      jobId: 'live-cost-2b',
      model: MODEL,
      tokenLedger: ledger,
      maxTurns: 1,
    });

    // All entries
    const all = ledger.query();
    expect(all.entries).toHaveLength(2);
    expect(all.totalInput).toBeGreaterThan(0);
    expect(all.totalOutput).toBeGreaterThan(0);

    // Filter by roleId
    const ctoOnly = ledger.query({ roleId: 'cto' });
    expect(ctoOnly.entries).toHaveLength(1);
    expect(ctoOnly.entries[0].jobId).toBe('live-cost-2a');

    const pmOnly = ledger.query({ roleId: 'pm' });
    expect(pmOnly.entries).toHaveLength(1);
    expect(pmOnly.entries[0].jobId).toBe('live-cost-2b');

    // Filter by jobId
    const job2a = ledger.query({ jobId: 'live-cost-2a' });
    expect(job2a.entries).toHaveLength(1);

    // Total cost
    const totalCost = estimateCost(all.totalInput, all.totalOutput, MODEL);
    console.log(`[Live] 2 calls — Total: ${all.totalInput} in / ${all.totalOutput} out — $${totalCost.toFixed(6)}`);
  }, 60_000);

  it('cost summary can be built for API response shape', async () => {
    const ledger = new TokenLedger(testRoot);
    const llm = new AnthropicProvider({ apiKey: API_KEY, model: MODEL });

    await runAgentLoop({
      companyRoot: testRoot,
      roleId: 'cto',
      task: 'Reply "1".',
      sourceRole: 'ceo',
      orgTree,
      llm,
      jobId: 'live-cost-3',
      model: MODEL,
      tokenLedger: ledger,
      maxTurns: 1,
    });

    // Build API response shape (simulating /api/cost/summary)
    const all = ledger.query();
    const byRole = new Map<string, { input: number; output: number }>();
    for (const e of all.entries) {
      const existing = byRole.get(e.roleId) ?? { input: 0, output: 0 };
      existing.input += e.inputTokens;
      existing.output += e.outputTokens;
      byRole.set(e.roleId, existing);
    }

    const apiResponse = {
      totalTokens: { input: all.totalInput, output: all.totalOutput },
      totalCostUsd: estimateCost(all.totalInput, all.totalOutput, MODEL),
      byRole: Object.fromEntries(
        [...byRole.entries()].map(([roleId, tokens]) => [
          roleId,
          { ...tokens, costUsd: estimateCost(tokens.input, tokens.output, MODEL) },
        ]),
      ),
      jobCount: all.entries.length,
    };

    expect(apiResponse.totalCostUsd).toBeGreaterThan(0);
    expect(apiResponse.byRole['cto']).toBeDefined();
    expect(apiResponse.byRole['cto'].costUsd).toBeGreaterThan(0);
    expect(apiResponse.jobCount).toBe(1);

    console.log('[Live] API response shape:', JSON.stringify(apiResponse, null, 2));
  }, 30_000);
});
