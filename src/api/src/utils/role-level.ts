/**
 * role-level.ts — Server-side role level calculation
 *
 * Mirrors the frontend level thresholds so the chat system prompt
 * can reference a role's current level and team stats.
 */

const THRESHOLDS = [
  0,           // Lv.1
  10_000,      // Lv.2
  50_000,      // Lv.3
  150_000,     // Lv.4
  400_000,     // Lv.5
  1_000_000,   // Lv.6
  2_500_000,   // Lv.7
  5_000_000,   // Lv.8
  10_000_000,  // Lv.9
  25_000_000,  // Lv.10
];

export function calcLevel(totalTokens: number): number {
  let level = 1;
  for (let i = THRESHOLDS.length - 1; i >= 0; i--) {
    if (totalTokens >= THRESHOLDS[i]) {
      level = i + 1;
      break;
    }
  }
  return Math.min(level, 10);
}

export function calcProgress(totalTokens: number): number {
  const level = calcLevel(totalTokens);
  if (level >= 10) return 1;
  const current = THRESHOLDS[level - 1];
  const next = THRESHOLDS[level];
  return Math.min(1, (totalTokens - current) / (next - current));
}

export function formatTokens(tokens: number): string {
  if (tokens >= 1_000_000) return `${(tokens / 1_000_000).toFixed(1)}M`;
  if (tokens >= 1_000) return `${(tokens / 1_000).toFixed(0)}K`;
  return String(tokens);
}
