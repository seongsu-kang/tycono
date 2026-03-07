import { describe, it, expect } from 'vitest';
import { validateDispatch } from '../../src/engine/authority-validator.js';
import { createTestOrgTree, createFlatOrgTree } from '../mocks/mock-org-tree.js';

const orgTree = createTestOrgTree(); // CEO → CTO → PM, Engineer

describe('validateDispatch', () => {
  it('allows CEO to dispatch to CTO', () => {
    const result = validateDispatch(orgTree, 'ceo', 'cto');
    expect(result.allowed).toBe(true);
  });

  it('allows CTO to dispatch to PM (direct subordinate)', () => {
    const result = validateDispatch(orgTree, 'cto', 'pm');
    expect(result.allowed).toBe(true);
  });

  it('allows CTO to dispatch to Engineer (direct subordinate)', () => {
    const result = validateDispatch(orgTree, 'cto', 'engineer');
    expect(result.allowed).toBe(true);
  });

  it('blocks self-dispatch', () => {
    const result = validateDispatch(orgTree, 'cto', 'cto');
    expect(result.allowed).toBe(false);
    expect(result.reason).toContain('self');
  });

  it('blocks PM dispatching to Engineer (peer, not subordinate)', () => {
    const result = validateDispatch(orgTree, 'pm', 'engineer');
    expect(result.allowed).toBe(false);
  });

  it('blocks Engineer dispatching to CTO (upward dispatch)', () => {
    const result = validateDispatch(orgTree, 'engineer', 'cto');
    expect(result.allowed).toBe(false);
  });

  it('blocks dispatch to non-existent role', () => {
    const result = validateDispatch(orgTree, 'ceo', 'nonexistent');
    expect(result.allowed).toBe(false);
  });
});
