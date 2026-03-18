/**
 * Preset Loader — loads company preset specifications and knowledge docs
 *
 * Presets are located at: COMPANY_ROOT/presets/{presetId}/preset.yaml
 * Knowledge docs are at: COMPANY_ROOT/presets/{presetId}/knowledge/*.md
 */
import fs from 'node:fs';
import path from 'node:path';
// @ts-ignore — js-yaml has no type definitions
import yaml from 'js-yaml';
import { COMPANY_ROOT } from './file-reader.js';
import type { PresetSpec } from '../../../shared/types.js';

/* ─── Load preset specification ──────────── */

export function loadPreset(presetId: string): PresetSpec | null {
  const presetDir = path.join(COMPANY_ROOT, 'presets', presetId);
  const presetFile = path.join(presetDir, 'preset.yaml');

  if (!fs.existsSync(presetFile)) {
    console.warn(`[PresetLoader] Preset not found: ${presetId}`);
    return null;
  }

  try {
    const content = fs.readFileSync(presetFile, 'utf-8');
    const spec = yaml.load(content) as PresetSpec;

    // Validate spec
    if (!spec.spec || spec.spec !== 'preset/v1') {
      console.error(`[PresetLoader] Invalid spec version for preset ${presetId}`);
      return null;
    }

    if (!spec.id || !spec.name || !spec.version) {
      console.error(`[PresetLoader] Missing required fields in preset ${presetId}`);
      return null;
    }

    console.log(`[PresetLoader] Loaded preset: ${spec.name} (${spec.id})`);
    return spec;
  } catch (err) {
    console.error(`[PresetLoader] Failed to load preset ${presetId}:`, err);
    return null;
  }
}

/* ─── Get preset knowledge file paths ────── */

export function getPresetKnowledge(presetId: string): string[] {
  const knowledgeDir = path.join(COMPANY_ROOT, 'presets', presetId, 'knowledge');

  if (!fs.existsSync(knowledgeDir)) {
    return [];
  }

  try {
    const files = fs.readdirSync(knowledgeDir)
      .filter(f => f.endsWith('.md'))
      .map(f => path.join(knowledgeDir, f));

    console.log(`[PresetLoader] Found ${files.length} knowledge docs for preset ${presetId}`);
    return files;
  } catch (err) {
    console.error(`[PresetLoader] Failed to read knowledge dir for preset ${presetId}:`, err);
    return [];
  }
}
