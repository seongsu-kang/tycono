/**
 * presets.ts — Preset API routes
 *
 * GET  /api/presets          — list all preset summaries
 * GET  /api/presets/:id      — get full preset detail
 * POST /api/presets/install  — install preset from data
 * DELETE /api/presets/:id    — remove installed preset
 */
import { Router } from 'express';
import fs from 'node:fs';
import path from 'node:path';
import YAML from 'yaml';
import { COMPANY_ROOT } from '../services/file-reader.js';
import { getPresetSummaries, getPresetById, loadPresets } from '../services/preset-loader.js';

export const presetsRouter = Router();

/** GET /api/presets — list preset summaries */
presetsRouter.get('/', (_req, res) => {
  try {
    const summaries = getPresetSummaries(COMPANY_ROOT);
    res.json(summaries);
  } catch (err) {
    res.status(500).json({ error: 'Failed to load presets' });
  }
});

/** GET /api/presets/:id — get full preset detail */
presetsRouter.get('/:id', (req, res) => {
  try {
    const preset = getPresetById(COMPANY_ROOT, req.params.id);
    if (!preset) {
      res.status(404).json({ error: `Preset not found: ${req.params.id}` });
      return;
    }
    res.json(preset.definition);
  } catch (err) {
    res.status(500).json({ error: 'Failed to load preset' });
  }
});

/** POST /api/presets/install — install a preset from provided data */
presetsRouter.post('/install', (req, res) => {
  try {
    const { id, preset } = req.body as { id: string; preset: Record<string, unknown> };
    if (!id || !preset) {
      res.status(400).json({ error: 'id and preset are required' });
      return;
    }

    // Validate preset has required fields
    if (!preset.name || !preset.roles || !Array.isArray(preset.roles)) {
      res.status(400).json({ error: 'preset must have name and roles array' });
      return;
    }

    // Check for conflict with existing preset
    const existing = getPresetById(COMPANY_ROOT, id);
    if (existing && !existing.isDefault) {
      res.status(409).json({ error: `Preset already installed: ${id}` });
      return;
    }

    // Create preset directory and write preset.yaml
    const presetDir = path.join(COMPANY_ROOT, 'company', 'presets', id);
    fs.mkdirSync(presetDir, { recursive: true });

    // Write preset.yaml
    const yamlContent = YAML.stringify(preset);
    fs.writeFileSync(path.join(presetDir, 'preset.yaml'), yamlContent);

    // Create subdirectories for roles/knowledge/skills
    fs.mkdirSync(path.join(presetDir, 'roles'), { recursive: true });
    fs.mkdirSync(path.join(presetDir, 'knowledge'), { recursive: true });
    fs.mkdirSync(path.join(presetDir, 'skills'), { recursive: true });

    // Write knowledge docs if provided
    const knowledge = req.body.knowledge as Array<{ filename: string; content: string }> | undefined;
    if (knowledge) {
      for (const doc of knowledge) {
        fs.writeFileSync(path.join(presetDir, 'knowledge', doc.filename), doc.content);
      }
    }

    // Write role yamls if provided
    const roleDefinitions = req.body.roleDefinitions as Array<{ id: string; yaml: string }> | undefined;
    if (roleDefinitions) {
      for (const role of roleDefinitions) {
        const roleDir = path.join(presetDir, 'roles', role.id);
        fs.mkdirSync(roleDir, { recursive: true });
        fs.writeFileSync(path.join(roleDir, 'role.yaml'), role.yaml);
      }
    }

    res.json({ ok: true, id, path: `company/presets/${id}` });
  } catch (err) {
    res.status(500).json({ error: `Install failed: ${err instanceof Error ? err.message : 'unknown'}` });
  }
});

/** DELETE /api/presets/:id — remove installed preset */
presetsRouter.delete('/:id', (req, res) => {
  try {
    const { id } = req.params;
    if (id === 'default' || id === '_default') {
      res.status(400).json({ error: 'Cannot remove default preset' });
      return;
    }

    const presetDir = path.join(COMPANY_ROOT, 'company', 'presets', id);
    if (!fs.existsSync(presetDir)) {
      res.status(404).json({ error: `Preset not found: ${id}` });
      return;
    }

    // Remove preset directory recursively
    fs.rmSync(presetDir, { recursive: true, force: true });

    res.json({ ok: true, id });
  } catch (err) {
    res.status(500).json({ error: `Remove failed: ${err instanceof Error ? err.message : 'unknown'}` });
  }
});
