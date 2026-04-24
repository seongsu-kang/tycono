/**
 * role.yaml `effort` field parsing + model compatibility.
 * See: feat/role-effort-config
 */
import { describe, test, expect, vi, beforeEach, afterEach } from 'vitest';
import { parseEffortLevel, isEffortCompatibleWithModel } from '../src/engine/org-tree.js';

describe('parseEffortLevel', () => {
  test.each(['low', 'medium', 'high', 'xhigh', 'max'])('accepts valid level: %s', (level) => {
    expect(parseEffortLevel(level)).toBe(level);
  });

  test('is case-insensitive and trims', () => {
    expect(parseEffortLevel('MAX')).toBe('max');
    expect(parseEffortLevel('  High  ')).toBe('high');
  });

  test('rejects garbage strings', () => {
    expect(parseEffortLevel('extreme')).toBeUndefined();
    expect(parseEffortLevel('')).toBeUndefined();
    expect(parseEffortLevel('highest')).toBeUndefined();
  });

  test('rejects non-strings', () => {
    expect(parseEffortLevel(undefined)).toBeUndefined();
    expect(parseEffortLevel(null)).toBeUndefined();
    expect(parseEffortLevel(3)).toBeUndefined();
    expect(parseEffortLevel({})).toBeUndefined();
  });

  describe('warns on invalid input', () => {
    let warnSpy: ReturnType<typeof vi.spyOn>;
    beforeEach(() => {
      warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    });
    afterEach(() => warnSpy.mockRestore());

    test('unknown level string warns with context', () => {
      parseEffortLevel('extreeme', 'role.yaml id=critic');
      expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('Unknown effort level: "extreeme"'));
      expect(warnSpy.mock.calls[0][0]).toMatch(/role\.yaml id=critic/);
    });

    test('non-string type warns', () => {
      parseEffortLevel(3);
      expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('Invalid effort type'));
    });

    test('empty string does NOT warn (treat as unset)', () => {
      parseEffortLevel('');
      expect(warnSpy).not.toHaveBeenCalled();
    });

    test('undefined/null do NOT warn (treat as unset)', () => {
      parseEffortLevel(undefined);
      parseEffortLevel(null);
      expect(warnSpy).not.toHaveBeenCalled();
    });

    test('valid level does NOT warn', () => {
      parseEffortLevel('max');
      parseEffortLevel('HIGH');
      expect(warnSpy).not.toHaveBeenCalled();
    });
  });
});

describe('isEffortCompatibleWithModel', () => {
  test('undefined effort is always compatible', () => {
    expect(isEffortCompatibleWithModel(undefined, 'claude-sonnet-4-6')).toBe(true);
    expect(isEffortCompatibleWithModel(undefined, undefined)).toBe(true);
  });

  test('non-max effort is always compatible', () => {
    expect(isEffortCompatibleWithModel('low', 'claude-sonnet-4-6')).toBe(true);
    expect(isEffortCompatibleWithModel('high', 'claude-haiku-4-5')).toBe(true);
    expect(isEffortCompatibleWithModel('xhigh', 'claude-sonnet-4-6')).toBe(true);
  });

  test('max with opus-4-6 is compatible', () => {
    expect(isEffortCompatibleWithModel('max', 'claude-opus-4-6')).toBe(true);
    expect(isEffortCompatibleWithModel('max', 'CLAUDE-OPUS-4-6')).toBe(true);
  });

  test('max with sonnet/haiku/older-opus is incompatible (silent downgrade)', () => {
    expect(isEffortCompatibleWithModel('max', 'claude-sonnet-4-6')).toBe(false);
    expect(isEffortCompatibleWithModel('max', 'claude-haiku-4-5')).toBe(false);
    expect(isEffortCompatibleWithModel('max', 'claude-opus-4-5')).toBe(false);
  });

  test('unknown model: permissive (let CLI decide)', () => {
    expect(isEffortCompatibleWithModel('max', undefined)).toBe(true);
    expect(isEffortCompatibleWithModel('max', '')).toBe(true);
  });
});
