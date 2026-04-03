/**
 * Ensure CLAUDE.md has AKB navigation guide.
 *
 * Two modes:
 * 1. No CLAUDE.md → create from full AKB template
 * 2. CLAUDE.md exists (any) → append/update AKB section only, never touch user content
 *
 * No full replacement ever. User content is always preserved.
 */
export declare function ensureClaudeMd(companyRoot: string): void;
