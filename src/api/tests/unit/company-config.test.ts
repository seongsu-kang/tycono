import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { readConfig, writeConfig, applyConfig } from '../../src/services/company-config.js';

let testRoot: string;

beforeEach(() => {
  testRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'config-test-'));
});

afterEach(() => {
  // Clean up env vars
  delete process.env.ANTHROPIC_API_KEY;
  delete process.env.EXECUTION_ENGINE;
});

describe('readConfig', () => {
  it('returns defaults when config.json does not exist', () => {
    const config = readConfig(testRoot);
    expect(config.engine).toBe('claude-cli');
    expect(config.apiKey).toBeUndefined();
  });

  it('reads config.json when present', () => {
    const dir = path.join(testRoot, '.the-company');
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, 'config.json'), JSON.stringify({
      engine: 'direct-api',
      apiKey: 'sk-test-123',
    }));

    const config = readConfig(testRoot);
    expect(config.engine).toBe('direct-api');
    expect(config.apiKey).toBe('sk-test-123');
  });

  it('returns defaults on malformed JSON', () => {
    const dir = path.join(testRoot, '.the-company');
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, 'config.json'), 'not json');

    const config = readConfig(testRoot);
    expect(config.engine).toBe('claude-cli');
  });
});

describe('writeConfig', () => {
  it('creates .the-company dir and config.json', () => {
    writeConfig(testRoot, { engine: 'direct-api', apiKey: 'sk-abc' });

    const configPath = path.join(testRoot, '.the-company', 'config.json');
    expect(fs.existsSync(configPath)).toBe(true);

    const written = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
    expect(written.engine).toBe('direct-api');
    expect(written.apiKey).toBe('sk-abc');
  });

  it('overwrites existing config', () => {
    writeConfig(testRoot, { engine: 'claude-cli' });
    writeConfig(testRoot, { engine: 'direct-api', apiKey: 'new-key' });

    const config = readConfig(testRoot);
    expect(config.engine).toBe('direct-api');
    expect(config.apiKey).toBe('new-key');
  });
});

describe('applyConfig', () => {
  it('sets process.env from config.json', () => {
    writeConfig(testRoot, { engine: 'direct-api', apiKey: 'sk-apply-test' });

    const config = applyConfig(testRoot);

    expect(config.engine).toBe('direct-api');
    expect(process.env.EXECUTION_ENGINE).toBe('direct-api');
    expect(process.env.ANTHROPIC_API_KEY).toBe('sk-apply-test');
  });

  it('does not override existing env vars', () => {
    process.env.EXECUTION_ENGINE = 'existing-value';
    process.env.ANTHROPIC_API_KEY = 'existing-key';

    writeConfig(testRoot, { engine: 'direct-api', apiKey: 'new-key' });
    applyConfig(testRoot);

    expect(process.env.EXECUTION_ENGINE).toBe('existing-value');
    expect(process.env.ANTHROPIC_API_KEY).toBe('existing-key');
  });

  it('handles missing config gracefully', () => {
    const config = applyConfig(testRoot);
    expect(config.engine).toBe('claude-cli');
  });
});

describe('config persistence (scaffold → restart → reload)', () => {
  it('config survives simulated server restart', () => {
    // Simulate scaffold writing config
    writeConfig(testRoot, { engine: 'direct-api', apiKey: 'sk-persist' });

    // Simulate server restart — clear env
    delete process.env.ANTHROPIC_API_KEY;
    delete process.env.EXECUTION_ENGINE;

    // Simulate server startup — apply from disk
    const config = applyConfig(testRoot);
    expect(config.engine).toBe('direct-api');
    expect(process.env.ANTHROPIC_API_KEY).toBe('sk-persist');
    expect(process.env.EXECUTION_ENGINE).toBe('direct-api');
  });
});
