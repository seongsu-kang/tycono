import { describe, it, expect, vi, beforeEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { runAgentLoop } from '../../src/engine/agent-loop.js';
import { MockProvider, textResponse, dispatchResponse, toolUseResponse } from '../mocks/mock-provider.js';
import { createTestOrgTree } from '../mocks/mock-org-tree.js';

/* ─── Test AKB scaffolding ──────────────────── */

let testRoot: string;

beforeEach(() => {
  testRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'agent-loop-test-'));
  // Minimal AKB structure for context-assembler
  fs.mkdirSync(path.join(testRoot, 'roles', 'cto'), { recursive: true });
  fs.mkdirSync(path.join(testRoot, 'roles', 'pm'), { recursive: true });
  fs.mkdirSync(path.join(testRoot, 'roles', 'engineer'), { recursive: true });
  fs.writeFileSync(path.join(testRoot, 'CLAUDE.md'), '# Test Company\n');

  // role.yaml files
  for (const role of ['cto', 'pm', 'engineer']) {
    fs.writeFileSync(path.join(testRoot, 'roles', role, 'role.yaml'), `id: ${role}\nname: ${role}\nlevel: member\nreports_to: ceo\npersona: "test"\n`);
  }

  // Knowledge + architecture hubs
  fs.mkdirSync(path.join(testRoot, 'knowledge'), { recursive: true });
  fs.mkdirSync(path.join(testRoot, 'architecture'), { recursive: true });
  fs.mkdirSync(path.join(testRoot, 'projects'), { recursive: true });
  fs.mkdirSync(path.join(testRoot, 'operations', 'decisions'), { recursive: true });
  fs.mkdirSync(path.join(testRoot, '.claude', 'skills', 'cto'), { recursive: true });
  fs.mkdirSync(path.join(testRoot, '.claude', 'skills', 'pm'), { recursive: true });
  fs.mkdirSync(path.join(testRoot, '.claude', 'skills', 'engineer'), { recursive: true });
});

const orgTree = createTestOrgTree();

describe('Agent Loop — basic', () => {
  it('returns text output for simple response', async () => {
    const mock = new MockProvider([textResponse('Hello from CTO')]);

    const result = await runAgentLoop({
      companyRoot: testRoot,
      roleId: 'cto',
      task: 'say hello',
      sourceRole: 'ceo',
      orgTree,
      llm: mock,
    });

    expect(result.output).toContain('Hello from CTO');
    expect(result.turns).toBe(1);
    expect(mock.callCount).toBe(1);
  });

  it('calls onText callback with output', async () => {
    const mock = new MockProvider([textResponse('response text')]);
    const onText = vi.fn();

    await runAgentLoop({
      companyRoot: testRoot,
      roleId: 'cto',
      task: 'test',
      sourceRole: 'ceo',
      orgTree,
      llm: mock,
      onText,
    });

    expect(onText).toHaveBeenCalledWith('response text');
  });

  it('includes system prompt in LLM call', async () => {
    const mock = new MockProvider([textResponse('ok')]);

    await runAgentLoop({
      companyRoot: testRoot,
      roleId: 'cto',
      task: 'task',
      sourceRole: 'ceo',
      orgTree,
      llm: mock,
    });

    expect(mock.calls[0].system).toBeTruthy();
    expect(mock.calls[0].system.length).toBeGreaterThan(50);
  });
});

describe('Agent Loop — tool execution', () => {
  it('executes read_file tool and continues', async () => {
    // Create a file for the read tool to find
    fs.writeFileSync(path.join(testRoot, 'test.md'), '# Test Content');

    const mock = new MockProvider([
      toolUseResponse('read_file', { path: 'test.md' }),
      textResponse('I read the file'),
    ]);

    const result = await runAgentLoop({
      companyRoot: testRoot,
      roleId: 'cto',
      task: 'read the test file',
      sourceRole: 'ceo',
      orgTree,
      llm: mock,
    });

    expect(result.turns).toBe(2);
    expect(result.toolCalls).toHaveLength(1);
    expect(result.toolCalls[0].name).toBe('read_file');
    expect(result.output).toContain('I read the file');
  });
});

describe('Agent Loop — dispatch', () => {
  it('dispatches to subordinate and returns result', async () => {
    const mock = new MockProvider([
      // CTO dispatches to PM
      dispatchResponse('pm', 'report status'),
      // PM responds (sub-agent call)
      textResponse('PM: Everything on track'),
      // CTO continues after getting PM result
      textResponse('CTO: PM reports everything is on track'),
    ]);

    const onDispatch = vi.fn();

    const result = await runAgentLoop({
      companyRoot: testRoot,
      roleId: 'cto',
      task: 'get PM status',
      sourceRole: 'ceo',
      orgTree,
      llm: mock,
      onDispatch,
    });

    expect(result.dispatches).toHaveLength(1);
    expect(result.dispatches[0].roleId).toBe('pm');
    expect(result.dispatches[0].task).toBe('report status');
    expect(onDispatch).toHaveBeenCalledWith('pm', 'report status');
    expect(mock.callCount).toBeGreaterThanOrEqual(2); // CTO + PM
  });

  it('dispatches to multiple subordinates', async () => {
    const mock = new MockProvider([
      // CTO dispatches to PM
      dispatchResponse('pm', 'report status'),
      textResponse('PM: project on schedule'),
      // CTO dispatches to Engineer
      dispatchResponse('engineer', 'check code quality'),
      textResponse('Engineer: code looks good'),
      // CTO final summary
      textResponse('CTO: All teams report positive status'),
    ]);

    const result = await runAgentLoop({
      companyRoot: testRoot,
      roleId: 'cto',
      task: 'get all team status',
      sourceRole: 'ceo',
      orgTree,
      llm: mock,
    });

    expect(result.dispatches).toHaveLength(2);
    expect(result.dispatches.map(d => d.roleId)).toContain('pm');
    expect(result.dispatches.map(d => d.roleId)).toContain('engineer');
  });
});

describe('Agent Loop — safety guards', () => {
  it('blocks circular dispatch', async () => {
    // CTO tries to dispatch back to CTO (via visitedRoles)
    const mock = new MockProvider([
      dispatchResponse('cto', 'recursive task'),
      textResponse('done'),
    ]);

    const result = await runAgentLoop({
      companyRoot: testRoot,
      roleId: 'cto',
      task: 'test circular',
      sourceRole: 'ceo',
      orgTree,
      llm: mock,
    });

    // The dispatch tool result should contain BLOCKED
    // CTO should still get a response back
    expect(mock.callCount).toBeGreaterThanOrEqual(1);
  });

  it('blocks dispatch at depth 3', async () => {
    const result = await runAgentLoop({
      companyRoot: testRoot,
      roleId: 'cto',
      task: 'too deep',
      sourceRole: 'ceo',
      orgTree,
      llm: new MockProvider([textResponse('should not reach')]),
      depth: 3,
    });

    expect(result.output).toContain('DISPATCH BLOCKED');
    expect(result.output).toContain('Max dispatch depth');
    expect(result.turns).toBe(0);
  });

  it('respects maxTurns limit', async () => {
    // Create a provider that always wants to use tools (never stops)
    const responses = Array.from({ length: 25 }, () =>
      toolUseResponse('read_file', { path: 'nonexistent.md' })
    );
    const mock = new MockProvider(responses);

    const result = await runAgentLoop({
      companyRoot: testRoot,
      roleId: 'pm',
      task: 'infinite loop test',
      sourceRole: 'ceo',
      orgTree,
      llm: mock,
      maxTurns: 5,
    });

    expect(result.turns).toBeLessThanOrEqual(5);
  });

  it('respects abort signal', async () => {
    const controller = new AbortController();
    // Abort immediately
    controller.abort();

    const mock = new MockProvider([textResponse('should not run')]);

    const result = await runAgentLoop({
      companyRoot: testRoot,
      roleId: 'pm',
      task: 'aborted task',
      sourceRole: 'ceo',
      orgTree,
      llm: mock,
      abortSignal: controller.signal,
    });

    expect(result.turns).toBe(0);
    expect(mock.callCount).toBe(0);
  });
});

describe('Agent Loop — callbacks', () => {
  it('fires onTurnComplete after each turn', async () => {
    const mock = new MockProvider([
      toolUseResponse('read_file', { path: 'test.md' }),
      textResponse('done'),
    ]);
    fs.writeFileSync(path.join(testRoot, 'test.md'), 'content');

    const onTurnComplete = vi.fn();

    await runAgentLoop({
      companyRoot: testRoot,
      roleId: 'pm',
      task: 'read and report',
      sourceRole: 'ceo',
      orgTree,
      llm: mock,
      onTurnComplete,
    });

    expect(onTurnComplete).toHaveBeenCalledWith(1);
  });

  it('fires onToolExec when tool is called', async () => {
    fs.writeFileSync(path.join(testRoot, 'test.md'), 'content');
    const mock = new MockProvider([
      toolUseResponse('read_file', { path: 'test.md' }),
      textResponse('done'),
    ]);
    const onToolExec = vi.fn();

    await runAgentLoop({
      companyRoot: testRoot,
      roleId: 'pm',
      task: 'read file',
      sourceRole: 'ceo',
      orgTree,
      llm: mock,
      onToolExec,
    });

    expect(onToolExec).toHaveBeenCalledWith('read_file', expect.any(Object));
  });
});
