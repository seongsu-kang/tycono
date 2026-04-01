/**
 * role-level.ts — Server-side role level calculation
 *
 * Mirrors the frontend level system.
 * Formula: level = floor(√(tokens ÷ 50,000))
 * Infinite levels, quadratic scaling.
 */
export declare function calcLevel(totalTokens: number): number;
export declare function tokensForLevel(level: number): number;
export declare function calcProgress(totalTokens: number): number;
export declare function formatTokens(tokens: number): string;
