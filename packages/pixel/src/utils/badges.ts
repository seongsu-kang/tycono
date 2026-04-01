/* ═══════════════════════════════════════════
   Badge System — Milestone-based cosmetic badges
   Computed client-side from token usage & role data
   ═══════════════════════════════════════════ */

export interface Badge {
  id: string;
  name: string;
  icon: string;       // emoji
  description: string;
  check: (ctx: BadgeContext) => boolean;
}

export interface BadgeContext {
  roles: { id: string; level: number; totalTokens: number }[];
  totalTokens: number;
  roleCount: number;
  completedQuests?: string[];
}

export const BADGES: Badge[] = [
  {
    id: 'first-employee',
    name: 'First Employee',
    icon: '🏆',
    description: 'Hired your first role',
    check: (ctx) => ctx.roleCount >= 1,
  },
  {
    id: 'full-team',
    name: 'Full Team',
    icon: '👥',
    description: 'Hired 5+ roles',
    check: (ctx) => ctx.roleCount >= 5,
  },
  {
    id: 'token-10k',
    name: 'Getting Started',
    icon: '📊',
    description: 'Used 10K tokens total',
    check: (ctx) => ctx.totalTokens >= 10_000,
  },
  {
    id: 'token-100k',
    name: 'Power User',
    icon: '💪',
    description: 'Used 100K tokens total',
    check: (ctx) => ctx.totalTokens >= 100_000,
  },
  {
    id: 'token-millionaire',
    name: 'Token Millionaire',
    icon: '🎖',
    description: 'Used 1M tokens total',
    check: (ctx) => ctx.totalTokens >= 1_000_000,
  },
  {
    id: 'token-mogul',
    name: 'Token Mogul',
    icon: '💎',
    description: 'Used 10M tokens total',
    check: (ctx) => ctx.totalTokens >= 10_000_000,
  },
  {
    id: 'first-promotion',
    name: 'First Promotion',
    icon: '⭐',
    description: 'Any role reached Lv.3',
    check: (ctx) => ctx.roles.some(r => r.level >= 3),
  },
  {
    id: 'senior-staff',
    name: 'Senior Staff',
    icon: '🌟',
    description: 'Any role reached Lv.5',
    check: (ctx) => ctx.roles.some(r => r.level >= 5),
  },
  {
    id: 'master-class',
    name: 'Master Class',
    icon: '👑',
    description: 'Any role reached Lv.10',
    check: (ctx) => ctx.roles.some(r => r.level >= 10),
  },
  {
    id: 'full-house',
    name: 'Full House',
    icon: '🏠',
    description: 'All roles Lv.5+',
    check: (ctx) => ctx.roleCount >= 3 && ctx.roles.every(r => r.level >= 5),
  },
  // ─── Quest Badges ───
  {
    id: 'first-launch',
    name: 'First Launch',
    icon: '🚀',
    description: 'Completed Chapter 2 — gave your first order',
    check: (ctx) => ctx.completedQuests?.includes('ch2-q2') ?? false,
  },
  {
    id: 'team-builder',
    name: 'Team Builder',
    icon: '🏗️',
    description: 'Completed Chapter 4 — dispatched your first wave',
    check: (ctx) => ctx.completedQuests?.includes('ch4-q2') ?? false,
  },
  {
    id: 'explorer',
    name: 'Explorer',
    icon: '🔍',
    description: 'Completed Chapter 5 — customized a character',
    check: (ctx) => ctx.completedQuests?.includes('ch5-q2') ?? false,
  },
  {
    id: 'interior-designer',
    name: 'Interior Designer',
    icon: '🎨',
    description: 'Completed Chapter 7 — bought premium furniture',
    check: (ctx) => ctx.completedQuests?.includes('ch7-q2') ?? false,
  },
  {
    id: 'tycoon-master',
    name: 'Tycoon Master',
    icon: '🎯',
    description: 'Completed all 10 chapters',
    check: (ctx) => ctx.completedQuests?.includes('ch10-q3') ?? false,
  },
];

/** Compute earned badges from context */
export function computeBadges(ctx: BadgeContext): Badge[] {
  return BADGES.filter(b => b.check(ctx));
}
