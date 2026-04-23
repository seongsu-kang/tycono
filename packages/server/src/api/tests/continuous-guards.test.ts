/**
 * BUG-NOOP-LOOP — `--continuous` guards.
 *
 * Replaces the weaker `turns <= 1 && dispatches === 0` check from BUG-STORM
 * with layered guards inspired by OpenHands StuckDetector.
 * See: knowledge/methodologies/agent-loop-termination-patterns.md
 */
import { describe, test, expect } from 'vitest';
import {
  decideContinuousAction,
  type ContinuousGuardState,
  type ContinuousExecResult,
} from '../src/services/supervisor-heartbeat.js';

function makeState(overrides: Partial<ContinuousGuardState> = {}): ContinuousGuardState {
  return {
    recentFingerprints: [],
    continuousWaveCount: 0,
    continuousStartedAt: Date.now(),
    maxContinuousWaves: 20,
    maxContinuousWallclockMs: 2 * 60 * 60 * 1000,
    maxContinuousCostUsd: 50,
    ...overrides,
  };
}

function exec(overrides: Partial<ContinuousExecResult> = {}): ContinuousExecResult {
  return {
    output: 'some CEO summary',
    turns: 5,
    dispatches: [{ roleId: 'scout', task: 'find data' }],
    ...overrides,
  };
}

describe('decideContinuousAction', () => {
  test('Tier 1a: zero dispatches → halt (regardless of turn count)', () => {
    // Exact scenario the buggy guard missed: CEO ran many turns but did no real work.
    const state = makeState();
    const d = decideContinuousAction(state, exec({ dispatches: [], turns: 7 }), 0);
    expect(d.action).toBe('halt');
    expect(d.action === 'halt' && d.reason).toMatch(/zero-dispatch/);
    expect(d.action === 'halt' && d.reason).toMatch(/turns=7/);
  });

  test('Tier 1a: zero dispatches with turns=1 still halts (preserves old behavior)', () => {
    const state = makeState();
    const d = decideContinuousAction(state, exec({ dispatches: [], turns: 1 }), 0);
    expect(d.action).toBe('halt');
  });

  test('Tier 1b: identical fingerprint twice in a row → halt', () => {
    // wave-1776872612959 scenario: 2,174 sessions re-emitting same verdict.
    const state = makeState();
    const e = exec({ output: 'All 3 hypotheses FAIL. commit 46848c3.', dispatches: [{ roleId: 'judge', task: 'verdict' }] });
    const first = decideContinuousAction(state, e, 0);
    expect(first.action).toBe('restart');
    const second = decideContinuousAction(state, e, 0);
    expect(second.action).toBe('halt');
    expect(second.action === 'halt' && second.reason).toMatch(/fingerprint-repeat/);
  });

  test('Tier 1b: different outputs → no false halt', () => {
    const state = makeState();
    const first = decideContinuousAction(state, exec({ output: 'round 1 result' }), 0);
    const second = decideContinuousAction(state, exec({ output: 'round 2 result' }), 0);
    expect(first.action).toBe('restart');
    expect(second.action).toBe('restart');
  });

  test('Tier 1b: dispatch set changes → no false halt', () => {
    const state = makeState();
    const first = decideContinuousAction(state, exec({ dispatches: [{ roleId: 'scout', task: 't' }] }), 0);
    const second = decideContinuousAction(state, exec({ dispatches: [{ roleId: 'scout', task: 't' }, { roleId: 'analyst', task: 'x' }] }), 0);
    expect(first.action).toBe('restart');
    expect(second.action).toBe('restart');
  });

  test('Tier 2: max-waves ceiling halts at the configured limit', () => {
    const state = makeState({ maxContinuousWaves: 3 });
    let last;
    for (let i = 0; i < 4; i++) {
      // Each iteration needs a unique fingerprint to avoid Tier 1b halt.
      last = decideContinuousAction(state, exec({ output: `iteration ${i}` }), 0);
    }
    expect(last?.action).toBe('halt');
    expect(last?.action === 'halt' && last.reason).toMatch(/max-waves/);
  });

  test('Tier 2: wallclock ceiling halts when elapsed exceeds budget', () => {
    const startedAt = Date.now() - 10_000;
    const state = makeState({ continuousStartedAt: startedAt, maxContinuousWallclockMs: 5_000 });
    const d = decideContinuousAction(state, exec({ output: 'anything' }), 0);
    expect(d.action).toBe('halt');
    expect(d.action === 'halt' && d.reason).toMatch(/wallclock/);
  });

  test('Tier 2: cost ceiling halts when loopCostUsd exceeds cap', () => {
    const state = makeState({ maxContinuousCostUsd: 10 });
    const d = decideContinuousAction(state, exec({ output: 'x' }), 15);
    expect(d.action).toBe('halt');
    expect(d.action === 'halt' && d.reason).toMatch(/cost/);
  });

  test('Normal iteration: dispatches > 0, new fingerprint, under ceilings → restart', () => {
    const state = makeState();
    const d = decideContinuousAction(state, exec(), 1.5);
    expect(d.action).toBe('restart');
    if (d.action === 'restart') {
      expect(d.waveCount).toBe(1);
      expect(d.costUsd).toBe(1.5);
      expect(d.turns).toBe(5);
      expect(d.dispatches).toBe(1);
    }
  });

  test('recentFingerprints ring buffer caps at 3 entries', () => {
    const state = makeState();
    for (let i = 0; i < 10; i++) {
      decideContinuousAction(state, exec({ output: `round ${i}` }), 0);
    }
    expect(state.recentFingerprints.length).toBeLessThanOrEqual(3);
  });
});
