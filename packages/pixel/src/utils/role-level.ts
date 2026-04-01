/* ═══════════════════════════════════════════
   Role Level System — Token-based XP
   Infinite levels, quadratic scaling
   Formula: level = floor(√(tokens ÷ 50,000))
   ═══════════════════════════════════════════ */

const BASE_XP = 50_000;

/** Calculate level from total token count (infinite, quadratic curve) */
export function calcLevel(totalTokens: number): number {
  if (totalTokens < BASE_XP) return 1;
  return Math.max(1, Math.floor(Math.sqrt(totalTokens / BASE_XP)));
}

/** Total tokens needed to reach a given level */
export function tokensForLevel(level: number): number {
  return BASE_XP * level * level;
}

/** XP progress to next level (0.0 ~ 1.0) */
export function calcProgress(totalTokens: number): number {
  const level = calcLevel(totalTokens);
  const current = tokensForLevel(level);
  const next = tokensForLevel(level + 1);
  return Math.min(1, (totalTokens - current) / (next - current));
}

/** Format token count for display (e.g. "1.2M", "450K") */
export function formatTokens(tokens: number): string {
  if (tokens >= 1_000_000) return `${(tokens / 1_000_000).toFixed(1)}M`;
  if (tokens >= 1_000) return `${(tokens / 1_000).toFixed(0)}K`;
  return String(tokens);
}

export type RoleLevelData = Record<string, { level: number; totalTokens: number; progress: number }>;

/** Compute levels for all roles from cost summary byRole data */
export function computeRoleLevels(
  byRole: Record<string, { inputTokens: number; outputTokens: number }>,
): RoleLevelData {
  const result: RoleLevelData = {};
  for (const [roleId, data] of Object.entries(byRole)) {
    const total = data.inputTokens + data.outputTokens;
    result[roleId] = { level: calcLevel(total), totalTokens: total, progress: calcProgress(total) };
  }
  return result;
}
