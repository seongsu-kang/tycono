import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createRunner } from '../../src/engine/runners/index.js';
import { DirectApiRunner } from '../../src/engine/runners/direct-api.js';
import { ClaudeCliRunner } from '../../src/engine/runners/claude-cli.js';

let origEngine: string | undefined;

beforeEach(() => {
  origEngine = process.env.EXECUTION_ENGINE;
});

afterEach(() => {
  if (origEngine === undefined) delete process.env.EXECUTION_ENGINE;
  else process.env.EXECUTION_ENGINE = origEngine;
});

describe('createRunner', () => {
  it('returns ClaudeCliRunner by default', () => {
    delete process.env.EXECUTION_ENGINE;
    const runner = createRunner();
    expect(runner).toBeInstanceOf(ClaudeCliRunner);
  });

  it('returns ClaudeCliRunner for claude-cli engine', () => {
    process.env.EXECUTION_ENGINE = 'claude-cli';
    const runner = createRunner();
    expect(runner).toBeInstanceOf(ClaudeCliRunner);
  });

  it('returns DirectApiRunner for direct-api engine', () => {
    process.env.EXECUTION_ENGINE = 'direct-api';
    const runner = createRunner();
    expect(runner).toBeInstanceOf(DirectApiRunner);
  });
});
