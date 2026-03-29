/**
 * preset-loader.ts — Load presets from multiple sources (2-Layer Knowledge)
 *
 * Scan order (first match wins per preset ID):
 *   1. knowledge/presets/{name}/preset.yaml    (legacy/local presets)
 *   2. .tycono/agencies/{name}/preset.yaml     (local agency install)
 *   3. ~/.tycono/agencies/{name}/preset.yaml   (global agency install)
 *   4. Bundled presets (shipped with tycono-server)
 *
 * Returns PresetSummary[] for TUI display and full LoadedPreset for wave creation.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execSync } from 'node:child_process';
import YAML from 'yaml';
import type { PresetDefinition, LoadedPreset, PresetSummary } from '../../../shared/types.js';

const PRESETS_DIR = 'knowledge/presets';
const DEFAULT_PRESET_FILE = '_default.yaml';

/**
 * Build a default preset definition from existing roles/ directory.
 * This is generated on-the-fly — no need to persist _default.yaml.
 */
function buildDefaultPreset(companyRoot: string): LoadedPreset {
  const rolesDir = path.join(companyRoot, 'knowledge', 'roles');
  const roles: string[] = [];

  if (fs.existsSync(rolesDir)) {
    const entries = fs.readdirSync(rolesDir, { withFileTypes: true });
    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      const yamlPath = path.join(rolesDir, entry.name, 'role.yaml');
      if (fs.existsSync(yamlPath)) {
        roles.push(entry.name);
      }
    }
  }

  return {
    definition: {
      spec: 'preset/v1',
      id: 'default',
      name: 'Default Team',
      tagline: 'Your current team',
      version: '1.0.0',
      roles,
    },
    path: null,
    isDefault: true,
  };
}

/**
 * Load a single preset from a directory containing preset.yaml.
 */
function loadPresetFromDir(presetDir: string): LoadedPreset | null {
  const yamlPath = path.join(presetDir, 'preset.yaml');
  if (!fs.existsSync(yamlPath)) return null;

  try {
    const raw = YAML.parse(fs.readFileSync(yamlPath, 'utf-8')) as PresetDefinition;
    if (!raw.id || !raw.name || !Array.isArray(raw.roles)) return null;

    return {
      definition: {
        spec: raw.spec || 'preset/v1',
        id: raw.id,
        name: raw.name,
        tagline: raw.tagline,
        version: raw.version || '1.0.0',
        description: raw.description,
        author: raw.author,
        category: raw.category,
        industry: raw.industry,
        stage: raw.stage,
        use_case: raw.use_case,
        roles: raw.roles,
        knowledge_docs: raw.knowledge_docs,
        skills_count: raw.skills_count,
        pricing: raw.pricing,
        tags: raw.tags,
        languages: raw.languages,
        stats: raw.stats,
        wave_scoped: raw.wave_scoped,
      },
      path: presetDir,
      isDefault: false,
    };
  } catch {
    return null;
  }
}

/**
 * Load all presets from knowledge/presets/ + auto-generated default.
 * Returns [default, ...installed] — default is always first.
 */
export function loadPresets(companyRoot: string): LoadedPreset[] {
  const presets: LoadedPreset[] = [];

  // 1. Default preset (always present)
  const defaultPreset = buildDefaultPreset(companyRoot);

  // Check if _default.yaml exists with overrides
  const defaultYamlPath = path.join(companyRoot, PRESETS_DIR, DEFAULT_PRESET_FILE);
  if (fs.existsSync(defaultYamlPath)) {
    try {
      const raw = YAML.parse(fs.readFileSync(defaultYamlPath, 'utf-8')) as Partial<PresetDefinition>;
      if (raw.name) defaultPreset.definition.name = raw.name;
      if (raw.tagline) defaultPreset.definition.tagline = raw.tagline;
      if (raw.description) defaultPreset.definition.description = raw.description;
    } catch { /* ignore malformed _default.yaml */ }
  }

  presets.push(defaultPreset);

  // 2. Installed presets from knowledge/presets/{name}/preset.yaml
  const presetsDir = path.join(companyRoot, PRESETS_DIR);
  if (fs.existsSync(presetsDir)) {
    const entries = fs.readdirSync(presetsDir, { withFileTypes: true });
    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      const preset = loadPresetFromDir(path.join(presetsDir, entry.name));
      if (preset) presets.push(preset);
    }
  }

  // 3. Installed agencies from .tycono/agencies/ (2-Layer Knowledge)
  //    Local project agencies take priority, then global (~/.tycono/agencies/)
  const agencyDirs = [
    path.join(companyRoot, '.tycono', 'agencies'),
    path.join(os.homedir(), '.tycono', 'agencies'),
  ];
  const loadedIds = new Set(presets.map(p => p.definition.id));
  for (const agenciesDir of agencyDirs) {
    if (!fs.existsSync(agenciesDir)) continue;
    const entries = fs.readdirSync(agenciesDir, { withFileTypes: true });
    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      if (loadedIds.has(entry.name)) continue; // earlier sources take priority
      const preset = loadPresetFromDir(path.join(agenciesDir, entry.name));
      if (preset) {
        presets.push(preset);
        loadedIds.add(preset.definition.id);
      }
    }
  }

  // 4. Bundled presets (shipped with tycono-server, fallback if not in user's project)
  const bundledPresetsDir = path.resolve(__dirname, '../../../../presets');
  if (fs.existsSync(bundledPresetsDir)) {
    const entries = fs.readdirSync(bundledPresetsDir, { withFileTypes: true });
    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      if (loadedIds.has(entry.name)) continue; // user's preset takes priority
      const preset = loadPresetFromDir(path.join(bundledPresetsDir, entry.name));
      if (preset) presets.push(preset);
    }
  }

  return presets;
}

/**
 * Get preset summaries for TUI display.
 */
export function getPresetSummaries(companyRoot: string): PresetSummary[] {
  return loadPresets(companyRoot).map(p => ({
    id: p.definition.id,
    name: p.definition.name,
    description: p.definition.description ?? p.definition.tagline,
    rolesCount: p.definition.roles.length,
    roles: p.definition.roles,
    isDefault: p.isDefault,
  }));
}

/**
 * Find a specific preset by ID.
 * Falls back to remote download from tycono.ai if not found locally.
 */
export function getPresetById(companyRoot: string, presetId: string): LoadedPreset | null {
  const presets = loadPresets(companyRoot);
  const local = presets.find(p => p.definition.id === presetId);
  if (local) return local;

  // Try downloading from tycono.ai preset registry
  const downloaded = downloadPreset(companyRoot, presetId);
  return downloaded;
}

/**
 * Download a preset from the remote registry (tycono.ai).
 * Saves to knowledge/presets/{id}/ for future use.
 */
function downloadPreset(companyRoot: string, presetId: string): LoadedPreset | null {
  const REGISTRY_URL = process.env.TYCONO_PRESET_REGISTRY || 'https://tycono.ai/api/presets';

  try {
    // Synchronous HTTP request (preset download is a blocking init step)
    const response = execSync(
      `curl -s --max-time 10 "${REGISTRY_URL}/${presetId}/download"`,
      { encoding: 'utf-8' },
    );

    const data = JSON.parse(response);
    if (!data.preset || !data.files) return null;

    // Save to local presets directory
    const targetDir = path.join(companyRoot, PRESETS_DIR, presetId);
    fs.mkdirSync(targetDir, { recursive: true });

    // Write preset.yaml
    fs.writeFileSync(
      path.join(targetDir, 'preset.yaml'),
      YAML.stringify(data.preset),
    );

    // Write knowledge files
    if (data.files && typeof data.files === 'object') {
      for (const [filePath, content] of Object.entries(data.files)) {
        const fullPath = path.join(targetDir, filePath);
        fs.mkdirSync(path.dirname(fullPath), { recursive: true });
        fs.writeFileSync(fullPath, content as string);
      }
    }

    console.log(`[Preset] Downloaded "${presetId}" from ${REGISTRY_URL}`);
    return loadPresetFromDir(targetDir);
  } catch (err) {
    console.warn(`[Preset] Failed to download "${presetId}": ${(err as Error).message}`);
    return null;
  }
}

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
export function autoSelectPreset(companyRoot: string, directive: string): string | undefined {
  const presets = loadPresets(companyRoot).filter(p => !p.isDefault);
  if (presets.length === 0) return undefined;

  const words = directive.toLowerCase().split(/[\s,.:;!?'"()\-]+/).filter(w => w.length > 2);
  if (words.length === 0) return undefined;

  let bestId: string | undefined;
  let bestScore = 0;

  for (const preset of presets) {
    const def = preset.definition;
    let score = 0;

    // task_keywords: strongest signal — exact match (weight 5), partial (weight 2)
    const taskKeywords = def.wave_scoped?.task_keywords ?? [];
    for (const kw of taskKeywords) {
      const kwLower = kw.toLowerCase();
      if (words.includes(kwLower)) {
        score += 5; // exact word match
      } else if (words.some(w => (w.length > 3 && kwLower.includes(w)) || (kwLower.length > 3 && w.includes(kwLower)))) {
        score += 2; // partial match (only for longer words)
      }
    }

    // tags: exact match (weight 3), partial (weight 1)
    const tags = def.tags ?? [];
    for (const tag of tags) {
      const tagLower = tag.toLowerCase();
      if (words.includes(tagLower)) {
        score += 3;
      } else if (words.some(w => w.length > 3 && (w.includes(tagLower) || tagLower.includes(w)))) {
        score += 1;
      }
    }

    // use_case: word match (weight 2)
    const useCases = def.use_case ?? [];
    for (const uc of useCases) {
      const ucWords = uc.toLowerCase().split(/[\s\-_]+/).filter(u => u.length > 2);
      for (const ucw of ucWords) {
        if (words.includes(ucw)) score += 2;
      }
    }

    // category + industry: exact match only (weight 1)
    if (def.category && words.includes(def.category.toLowerCase())) score += 1;
    if (def.industry && words.includes(def.industry.toLowerCase())) score += 1;

    if (score > bestScore) {
      bestScore = score;
      bestId = def.id;
    }
  }

  // Minimum threshold: need at least one strong keyword match
  return bestScore >= 2 ? bestId : undefined;
}
