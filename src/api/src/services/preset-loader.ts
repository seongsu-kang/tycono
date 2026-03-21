/**
 * preset-loader.ts — Load presets from company/presets/
 *
 * Scans company/presets/ for:
 *   - _default.yaml (auto-generated from existing roles/)
 *   - {name}/preset.yaml (installed presets with roles/skills/knowledge)
 *
 * Returns PresetSummary[] for TUI display and full LoadedPreset for wave creation.
 */
import fs from 'node:fs';
import path from 'node:path';
import YAML from 'yaml';
import type { PresetDefinition, LoadedPreset, PresetSummary } from '../../../shared/types.js';

const PRESETS_DIR = 'company/presets';
const DEFAULT_PRESET_FILE = '_default.yaml';

/**
 * Build a default preset definition from existing roles/ directory.
 * This is generated on-the-fly — no need to persist _default.yaml.
 */
function buildDefaultPreset(companyRoot: string): LoadedPreset {
  const rolesDir = path.join(companyRoot, 'roles');
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
 * Load all presets from company/presets/ + auto-generated default.
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

  // 2. Installed presets from company/presets/{name}/preset.yaml
  const presetsDir = path.join(companyRoot, PRESETS_DIR);
  if (fs.existsSync(presetsDir)) {
    const entries = fs.readdirSync(presetsDir, { withFileTypes: true });
    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      const preset = loadPresetFromDir(path.join(presetsDir, entry.name));
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
 */
export function getPresetById(companyRoot: string, presetId: string): LoadedPreset | null {
  const presets = loadPresets(companyRoot);
  return presets.find(p => p.definition.id === presetId) ?? null;
}
