export interface ModelPricing {
    inputPer1M: number;
    outputPer1M: number;
}
/**
 * Anthropic model pricing table.
 * Source: https://docs.anthropic.com/en/docs/about-claude/pricing
 */
export declare const MODEL_PRICING: Record<string, ModelPricing>;
/** Estimate cost in USD for a given token usage */
export declare function estimateCost(inputTokens: number, outputTokens: number, model: string): number;
