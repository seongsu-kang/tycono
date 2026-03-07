import { describe, it, expect } from 'vitest';
import { estimateCost, MODEL_PRICING } from '../../src/services/pricing.js';

describe('estimateCost', () => {
  it('calculates Sonnet cost correctly', () => {
    // 1M input + 1M output at Sonnet rates: $3 + $15 = $18
    const cost = estimateCost(1_000_000, 1_000_000, 'claude-sonnet-4-20250514');
    expect(cost).toBeCloseTo(18.0);
  });

  it('calculates Opus cost correctly', () => {
    // 1M input + 1M output at Opus rates: $15 + $75 = $90
    const cost = estimateCost(1_000_000, 1_000_000, 'claude-opus-4-6');
    expect(cost).toBeCloseTo(90.0);
  });

  it('calculates Haiku cost correctly', () => {
    // 1M input + 1M output at Haiku rates: $0.80 + $4 = $4.80
    const cost = estimateCost(1_000_000, 1_000_000, 'claude-haiku-4-5');
    expect(cost).toBeCloseTo(4.80);
  });

  it('uses Sonnet as default for unknown models', () => {
    const cost = estimateCost(1_000_000, 1_000_000, 'unknown-model');
    expect(cost).toBeCloseTo(18.0);
  });

  it('handles small token counts', () => {
    // 10K input + 5K output at Sonnet: $0.03 + $0.075 = $0.105
    const cost = estimateCost(10_000, 5_000, 'claude-sonnet-4-5');
    expect(cost).toBeCloseTo(0.105);
  });

  it('handles zero tokens', () => {
    expect(estimateCost(0, 0, 'claude-sonnet-4-5')).toBe(0);
  });
});

describe('MODEL_PRICING', () => {
  it('has entries for all major model families', () => {
    expect(MODEL_PRICING['claude-sonnet-4-5']).toBeDefined();
    expect(MODEL_PRICING['claude-opus-4-6']).toBeDefined();
    expect(MODEL_PRICING['claude-haiku-4-5']).toBeDefined();
  });
});
