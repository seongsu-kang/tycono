/**
 * role-level.ts — Server-side role level calculation
 *
 * Mirrors the frontend level system.
 * Formula: level = floor(√(tokens ÷ 50,000))
 * Infinite levels, quadratic scaling.
 */

const BASE_XP = 50_000;

export function calcLevel(totalTokens: number): number {
  if (totalTokens < BASE_XP) return 1;
  return Math.max(1, Math.floor(Math.sqrt(totalTokens / BASE_XP)));
}

export function tokensForLevel(level: number): number {
  return BASE_XP * level * level;
}

export function calcProgress(totalTokens: number): number {
  const level = calcLevel(totalTokens);
  const current = tokensForLevel(level);
  const next = tokensForLevel(level + 1);
  return Math.min(1, (totalTokens - current) / (next - current));
}

export function formatTokens(tokens: number): string {
  if (tokens >= 1_000_000) return `${(tokens / 1_000_000).toFixed(1)}M`;
  if (tokens >= 1_000) return `${(tokens / 1_000).toFixed(0)}K`;
  return String(tokens);
}
