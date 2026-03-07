import { describe, it, expect } from 'vitest';
import { getSubordinates, canDispatchTo, getChainOfCommand } from '../../src/engine/org-tree.js';
import { createTestOrgTree, createFlatOrgTree } from '../mocks/mock-org-tree.js';

const orgTree = createTestOrgTree(); // CEO → CTO → PM, Engineer

describe('getSubordinates', () => {
  it('returns direct subordinates of CTO', () => {
    const subs = getSubordinates(orgTree, 'cto');
    expect(subs).toContain('pm');
    expect(subs).toContain('engineer');
    expect(subs).toHaveLength(2);
  });

  it('returns CTO as CEO subordinate', () => {
    const subs = getSubordinates(orgTree, 'ceo');
    expect(subs).toContain('cto');
  });

  it('returns empty array for leaf nodes', () => {
    const subs = getSubordinates(orgTree, 'engineer');
    expect(subs).toHaveLength(0);
  });
});

describe('canDispatchTo', () => {
  it('CEO can dispatch to CTO', () => {
    expect(canDispatchTo(orgTree, 'ceo', 'cto')).toBe(true);
  });

  it('CTO can dispatch to PM', () => {
    expect(canDispatchTo(orgTree, 'cto', 'pm')).toBe(true);
  });

  it('PM cannot dispatch to Engineer (peer)', () => {
    expect(canDispatchTo(orgTree, 'pm', 'engineer')).toBe(false);
  });

  it('Engineer cannot dispatch to CTO (upward)', () => {
    expect(canDispatchTo(orgTree, 'engineer', 'cto')).toBe(false);
  });
});

describe('getChainOfCommand', () => {
  it('returns chain from CEO to Engineer', () => {
    const chain = getChainOfCommand(orgTree, 'engineer');
    // Bottom-up order: self → parent → root
    expect(chain).toEqual(['engineer', 'cto', 'ceo']);
  });

  it('returns [ceo] for CEO itself', () => {
    const chain = getChainOfCommand(orgTree, 'ceo');
    expect(chain).toEqual(['ceo']);
  });
});
