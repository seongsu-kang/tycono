/* ═══════════════════════════════════════════
   Role Level System — Token-based XP
   Cosmetic only, no performance restrictions
   ═══════════════════════════════════════════ */

/** Level thresholds (total tokens = input + output) */
const THRESHOLDS = [
  0,        // Lv.1: new hire
  10_000,   // Lv.2
  50_000,   // Lv.3
  150_000,  // Lv.4
  400_000,  // Lv.5
  1_000_000,  // Lv.6
  2_500_000,  // Lv.7
  5_000_000,  // Lv.8
  10_000_000, // Lv.9
  25_000_000, // Lv.10: master
];

/** Calculate level from total token count */
export function calcLevel(totalTokens: number): number {
  let level = 1;
  for (let i = THRESHOLDS.length - 1; i >= 0; i--) {
    if (totalTokens >= THRESHOLDS[i]) { level = i + 1; break; }
  }
  return Math.min(level, 10);
}

/** XP progress to next level (0.0 ~ 1.0) */
export function calcProgress(totalTokens: number): number {
  const level = calcLevel(totalTokens);
  if (level >= 10) return 1;
  const current = THRESHOLDS[level - 1];
  const next = THRESHOLDS[level];
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
