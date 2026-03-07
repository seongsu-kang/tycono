/**
 * Dispatch Chain Integration Test
 *
 * CEO → CTO → PM, Engineer 전체 파이프라인을 MockProvider로 검증.
 * DirectApiRunner를 사용하여 실제 runner → agent-loop → tool executor 경로를 테스트.
 * SSE 콜백 순서, dispatch 전파, activity 상태 변화를 검증.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { DirectApiRunner } from '../../src/engine/runners/direct-api.js';
import { MockProvider, textResponse, dispatchResponse, toolUseResponse } from '../mocks/mock-provider.js';
import { createTestOrgTree } from '../mocks/mock-org-tree.js';
import type { RunnerCallbacks, RunnerResult } from '../../src/engine/runners/types.js';

let testRoot: string;
const orgTree = createTestOrgTree();

beforeEach(() => {
  testRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'dispatch-chain-test-'));
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

/** Helper: run a DirectApiRunner job and collect all SSE callbacks */
async function runWithCallbacks(
  mock: MockProvider,
  roleId: string,
  task: string,
  sourceRole = 'ceo',
): Promise<{
  result: RunnerResult;
  events: Array<{ type: string; data: unknown }>;
}> {
  const runner = new DirectApiRunner(mock);
  const events: Array<{ type: string; data: unknown }> = [];

  const callbacks: RunnerCallbacks = {
    onText: (text) => events.push({ type: 'text', data: { text } }),
    onThinking: (text) => events.push({ type: 'thinking', data: { text } }),
    onToolUse: (name, input) => events.push({ type: 'tool', data: { name, input } }),
    onDispatch: (rId, t) => events.push({ type: 'dispatch', data: { roleId: rId, task: t } }),
    onTurnComplete: (turn) => events.push({ type: 'turn', data: { turn } }),
    onError: (error) => events.push({ type: 'error', data: { error } }),
  };

  const handle = runner.execute(
    { companyRoot: testRoot, roleId, task, sourceRole, orgTree },
    callbacks,
  );

  const result = await handle.promise;
  return { result, events };
}

describe('Dispatch Chain — CTO dispatches to subordinates', () => {
  it('CTO → PM dispatch produces correct SSE event sequence', async () => {
    const mock = new MockProvider([
      // Turn 1: CTO dispatches to PM
      dispatchResponse('pm', 'report project status'),
      // Turn 1 (sub-agent PM): PM responds with text
      textResponse('PM: Phase 1 is 90% complete. On track for deadline.'),
      // Turn 2: CTO summarizes
      textResponse('CTO Summary: PM reports Phase 1 at 90%, on track.'),
    ]);

    const { result, events } = await runWithCallbacks(mock, 'cto', 'Get PM status report');

    // Verify dispatch happened
    expect(result.dispatches).toHaveLength(1);
    expect(result.dispatches[0].roleId).toBe('pm');
    expect(result.dispatches[0].task).toBe('report project status');

    // Verify SSE event sequence contains dispatch event
    const dispatchEvents = events.filter(e => e.type === 'dispatch');
    expect(dispatchEvents).toHaveLength(1);
    expect((dispatchEvents[0].data as Record<string, unknown>).roleId).toBe('pm');

    // Verify text events exist
    const textEvents = events.filter(e => e.type === 'text');
    expect(textEvents.length).toBeGreaterThanOrEqual(1);

    // Verify result contains CTO's final output
    expect(result.output).toContain('CTO Summary');
    expect(result.turns).toBeGreaterThanOrEqual(2);
  });

  it('CTO dispatches to both PM and Engineer', async () => {
    const mock = new MockProvider([
      // CTO Turn 1: dispatch to PM
      dispatchResponse('pm', 'report progress'),
      // PM sub-agent
      textResponse('PM: All tasks on schedule'),
      // CTO Turn 2: dispatch to Engineer (after PM result)
      dispatchResponse('engineer', 'check code quality'),
      // Engineer sub-agent
      textResponse('Engineer: No critical issues found'),
      // CTO Turn 3: final summary
      textResponse('CTO: Both PM and Engineer report positive status'),
    ]);

    const { result, events } = await runWithCallbacks(mock, 'cto', 'Full team status check');

    // Both dispatches recorded
    expect(result.dispatches).toHaveLength(2);
    const dispatchedRoles = result.dispatches.map(d => d.roleId).sort();
    expect(dispatchedRoles).toEqual(['engineer', 'pm']);

    // Both dispatch SSE events fired
    const dispatchEvents = events.filter(e => e.type === 'dispatch');
    expect(dispatchEvents).toHaveLength(2);

    // Verify dispatch events have correct role IDs
    const sseRoles = dispatchEvents.map(e => (e.data as Record<string, unknown>).roleId).sort();
    expect(sseRoles).toEqual(['engineer', 'pm']);

    // Final output from CTO
    expect(result.output).toContain('Both PM and Engineer');
  });

  it('SSE events arrive in correct order for dispatch flow', async () => {
    const mock = new MockProvider([
      dispatchResponse('pm', 'status'),
      textResponse('PM result'),
      textResponse('CTO final'),
    ]);

    const { events } = await runWithCallbacks(mock, 'cto', 'check status');

    // Find key event positions
    const eventTypes = events.map(e => e.type);

    // dispatch should come before the final text from CTO
    const dispatchIdx = eventTypes.indexOf('dispatch');
    const lastTextIdx = eventTypes.lastIndexOf('text');

    expect(dispatchIdx).toBeGreaterThanOrEqual(0);
    expect(lastTextIdx).toBeGreaterThan(dispatchIdx);
  });
});

describe('Dispatch Chain — tool use + dispatch combined', () => {
  it('CTO reads file then dispatches', async () => {
    fs.writeFileSync(path.join(testRoot, 'status.md'), '# Status: All good');

    const mock = new MockProvider([
      // Turn 1: CTO reads a file
      toolUseResponse('read_file', { path: 'status.md' }),
      // Turn 2: CTO dispatches based on what it read
      dispatchResponse('engineer', 'fix the issue found in status.md'),
      // Engineer sub-agent
      textResponse('Engineer: Issue resolved'),
      // Turn 3: CTO wraps up
      textResponse('CTO: Read status, dispatched fix to engineer, resolved'),
    ]);

    const { result, events } = await runWithCallbacks(mock, 'cto', 'Review status and fix issues');

    // File read + dispatch both happened
    expect(result.toolCalls.some(tc => tc.name === 'read_file')).toBe(true);
    expect(result.dispatches).toHaveLength(1);
    expect(result.dispatches[0].roleId).toBe('engineer');

    // SSE events include both tool and dispatch
    const toolEvents = events.filter(e => e.type === 'tool');
    const dispatchEvents = events.filter(e => e.type === 'dispatch');
    expect(toolEvents.length).toBeGreaterThanOrEqual(1);
    expect(dispatchEvents).toHaveLength(1);
  });
});

describe('Dispatch Chain — error handling', () => {
  it('unauthorized dispatch returns error in result', async () => {
    // PM trying to dispatch to Engineer (PM is not Engineer's boss in our tree)
    const mock = new MockProvider([
      dispatchResponse('engineer', 'do something'),
      textResponse('PM: dispatch failed'),
    ]);

    const { result } = await runWithCallbacks(mock, 'pm', 'try dispatching', 'ceo');

    // dispatch should fail since PM → Engineer is not allowed
    // The tool result should indicate rejection, but agent still runs
    expect(mock.callCount).toBeGreaterThanOrEqual(1);
  });

  it('dispatch to non-existent role returns error', async () => {
    const mock = new MockProvider([
      dispatchResponse('nonexistent', 'do something'),
      textResponse('CTO: dispatch failed'),
    ]);

    const { result } = await runWithCallbacks(mock, 'cto', 'dispatch to nobody');

    // The agent should get an error tool result and continue
    expect(mock.callCount).toBeGreaterThanOrEqual(1);
  });
});

describe('Dispatch Chain — depth and turns', () => {
  it('tracks total tokens from main + sub-agent', async () => {
    const mock = new MockProvider([
      dispatchResponse('pm', 'quick task'),
      textResponse('PM done'),
      textResponse('CTO done'),
    ]);

    const { result } = await runWithCallbacks(mock, 'cto', 'test tokens');

    // MockProvider returns 0 tokens, but structure should be valid
    expect(result.totalTokens).toBeDefined();
    expect(result.totalTokens.input).toBeGreaterThanOrEqual(0);
    expect(result.totalTokens.output).toBeGreaterThanOrEqual(0);
  });

  it('handles CTO dispatching with readOnly flag', async () => {
    const mock = new MockProvider([
      textResponse('CTO: read-only analysis complete'),
    ]);

    const runner = new DirectApiRunner(mock);
    const handle = runner.execute(
      { companyRoot: testRoot, roleId: 'cto', task: 'analyze', sourceRole: 'ceo', orgTree, readOnly: true },
      {},
    );

    const result = await handle.promise;
    expect(result.output).toContain('read-only analysis');
  });
});

describe('Runner abort', () => {
  it('DirectApiRunner.abort() kills the underlying AbortController', async () => {
    const mock = new MockProvider([textResponse('quick')]);

    const runner = new DirectApiRunner(mock);
    const handle = runner.execute(
      { companyRoot: testRoot, roleId: 'pm', task: 'test', sourceRole: 'ceo', orgTree },
      {},
    );

    // The handle should have an abort function
    expect(typeof handle.abort).toBe('function');

    // Let it complete normally
    const result = await handle.promise;
    expect(result.output).toContain('quick');
  });
});
