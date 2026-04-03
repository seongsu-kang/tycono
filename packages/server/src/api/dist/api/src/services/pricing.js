/* ── Model Pricing ──────────────────────── */
/**
 * Anthropic model pricing table.
 * Source: https://docs.anthropic.com/en/docs/about-claude/pricing
 */
export const MODEL_PRICING = {
    // Sonnet 4 family
    'claude-sonnet-4-5': { inputPer1M: 3.00, outputPer1M: 15.00 },
    'claude-sonnet-4-20250514': { inputPer1M: 3.00, outputPer1M: 15.00 },
    // Opus 4 family
    'claude-opus-4-6': { inputPer1M: 15.00, outputPer1M: 75.00 },
    // Haiku 4.5 family
    'claude-haiku-4-5': { inputPer1M: 0.80, outputPer1M: 4.00 },
    'claude-haiku-4-5-20251001': { inputPer1M: 0.80, outputPer1M: 4.00 },
};
const DEFAULT_PRICING = { inputPer1M: 3.00, outputPer1M: 15.00 };
/** Estimate cost in USD for a given token usage */
export function estimateCost(inputTokens, outputTokens, model) {
    const pricing = MODEL_PRICING[model] ?? DEFAULT_PRICING;
    return (inputTokens * pricing.inputPer1M / 1_000_000)
        + (outputTokens * pricing.outputPer1M / 1_000_000);
}
