/**
 * Ensure CLAUDE.md is up-to-date with the current package version.
 *
 * Called on server startup. Compares .tycono/rules-version with package version.
 * If different, regenerates CLAUDE.md from template (safe because CLAUDE.md
 * contains 0% user data — all user customization is in .tycono/custom-rules.md).
 */
export declare function ensureClaudeMd(companyRoot: string): void;
