/* ── Model Pricing ──────────────────────── */

export interface ModelPricing {
  inputPer1M: number;   // USD per 1M input tokens
  outputPer1M: number;  // USD per 1M output tokens
}

/**
 * Anthropic model pricing table.
 * Source: https://docs.anthropic.com/en/docs/about-claude/pricing
 *
 * Prompt caching multipliers (all models):
 *   - Cache write (creation): 1.25x input price
 *   - Cache read (hit):       0.1x input price
 *   - Cache miss:             1.0x input price (regular)
 */
export const MODEL_PRICING: Record<string, ModelPricing> = {
  // Sonnet 4 family
  'claude-sonnet-4-5':        { inputPer1M: 3.00,  outputPer1M: 15.00 },
  'claude-sonnet-4-20250514': { inputPer1M: 3.00,  outputPer1M: 15.00 },
  // Opus 4 family
  'claude-opus-4-6':          { inputPer1M: 15.00, outputPer1M: 75.00 },
  'claude-opus-4-7':          { inputPer1M: 15.00, outputPer1M: 75.00 },
  // Haiku 4.5 family
  'claude-haiku-4-5':              { inputPer1M: 0.80,  outputPer1M: 4.00 },
  'claude-haiku-4-5-20251001':     { inputPer1M: 0.80,  outputPer1M: 4.00 },
};

const DEFAULT_PRICING: ModelPricing = { inputPer1M: 3.00, outputPer1M: 15.00 };

/** Cache pricing multipliers (Anthropic standard) */
const CACHE_WRITE_MULTIPLIER = 1.25;
const CACHE_READ_MULTIPLIER = 0.10;

/**
 * Estimate cost in USD with prompt caching breakdown.
 *
 * When cacheReadTokens/cacheCreationTokens are provided, applies correct
 * cache pricing (0.1x for reads, 1.25x for writes) instead of treating
 * all input tokens at full price.
 */
export function estimateCost(
  inputTokens: number,
  outputTokens: number,
  model: string,
  cacheReadTokens?: number,
  cacheCreationTokens?: number,
): number {
  const pricing = MODEL_PRICING[model] ?? DEFAULT_PRICING;
  const inputRate = pricing.inputPer1M / 1_000_000;
  const outputRate = pricing.outputPer1M / 1_000_000;

  if (cacheReadTokens != null || cacheCreationTokens != null) {
    // Detailed cache-aware calculation
    const cacheRead = cacheReadTokens ?? 0;
    const cacheWrite = cacheCreationTokens ?? 0;
    // inputTokens here = cache miss tokens (regular price)
    const cacheMiss = Math.max(0, inputTokens - cacheRead - cacheWrite);

    return (cacheMiss * inputRate)
         + (cacheWrite * inputRate * CACHE_WRITE_MULTIPLIER)
         + (cacheRead * inputRate * CACHE_READ_MULTIPLIER)
         + (outputTokens * outputRate);
  }

  // Fallback: no cache breakdown available (legacy)
  return (inputTokens * inputRate) + (outputTokens * outputRate);
}

/** Convenience: estimate cost from a TokenEntry (auto-uses cache breakdown if available) */
export function estimateCostFromEntry(entry: { inputTokens: number; outputTokens: number; model: string; cacheReadTokens?: number; cacheCreationTokens?: number }): number {
  return estimateCost(entry.inputTokens, entry.outputTokens, entry.model, entry.cacheReadTokens, entry.cacheCreationTokens);
}
