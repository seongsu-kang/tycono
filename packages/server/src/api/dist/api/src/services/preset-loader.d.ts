import type { LoadedPreset, PresetSummary } from '../../../shared/types.js';
/**
 * Load all presets from knowledge/presets/ + auto-generated default.
 * Returns [default, ...installed] — default is always first.
 */
export declare function loadPresets(companyRoot: string): LoadedPreset[];
/**
 * Get preset summaries for TUI display.
 */
export declare function getPresetSummaries(companyRoot: string): PresetSummary[];
/**
 * Find a specific preset by ID.
 * Falls back to remote download from tycono.ai if not found locally.
 */
export declare function getPresetById(companyRoot: string, presetId: string): LoadedPreset | null;
/**
 * Auto-select the best preset based on directive text.
 *
 * Matches directive words against each preset's:
 *   - wave_scoped.task_keywords (highest weight: 3)
 *   - tags (weight: 2)
 *   - use_case (weight: 2)
 *   - category + industry (weight: 1)
 *
 * Returns preset ID with highest score, or undefined if no meaningful match.
 * Minimum score threshold: 2 (at least one strong keyword match).
 */
export declare function autoSelectPreset(companyRoot: string, directive: string): string | undefined;
