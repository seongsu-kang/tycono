/**
 * skills.ts — Skill registry + Role-Skill management API
 */
import { Router } from 'express';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import YAML from 'yaml';
import { COMPANY_ROOT } from '../services/file-reader.js';
import { getAvailableSkills } from '../services/scaffold.js';
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
export const skillsRouter = Router();
/* ─── Skill Registry ─────────────────────── */
// GET /api/skills — Available skills (from templates + installed)
skillsRouter.get('/', (_req, res, next) => {
    try {
        // 1. Template skills (bundled with the product)
        const templateSkills = getAvailableSkills().map(s => ({
            ...s,
            source: 'template',
            installed: isSkillInstalled(s.id),
        }));
        // 2. Installed skills not in templates (user-added)
        const sharedDir = path.join(COMPANY_ROOT, '.claude', 'skills', '_shared');
        const installedIds = new Set(templateSkills.map(s => s.id));
        const userSkills = [];
        if (fs.existsSync(sharedDir)) {
            for (const entry of fs.readdirSync(sharedDir, { withFileTypes: true })) {
                if (!entry.isDirectory() || installedIds.has(entry.name))
                    continue;
                const skillMdPath = path.join(sharedDir, entry.name, 'SKILL.md');
                if (!fs.existsSync(skillMdPath))
                    continue;
                const content = fs.readFileSync(skillMdPath, 'utf-8');
                const meta = extractSkillMeta(content, entry.name);
                userSkills.push({ ...meta, source: 'user', installed: true });
            }
        }
        res.json([...templateSkills, ...userSkills]);
    }
    catch (err) {
        next(err);
    }
});
// GET /api/skills/registry — Browse external skill registries
skillsRouter.get('/registry', async (_req, res, next) => {
    try {
        // Known skill registries (curated list of quality skills)
        const REGISTRIES = [
            {
                source: 'anthropics/skills',
                label: 'Anthropic Official',
                skills: [
                    { id: 'frontend-design', name: 'Frontend Design', description: 'Create distinctive, production-grade frontend interfaces with high design quality', category: 'design', url: 'https://raw.githubusercontent.com/anthropics/skills/main/skills/frontend-design/SKILL.md' },
                    { id: 'webapp-testing', name: 'Web App Testing', description: 'Playwright-based toolkit for testing local web applications', category: 'testing', url: 'https://raw.githubusercontent.com/anthropics/skills/main/skills/webapp-testing/SKILL.md' },
                    { id: 'mcp-builder', name: 'MCP Builder', description: 'Guide for creating high-quality MCP servers for LLM tool integration', category: 'development', url: 'https://raw.githubusercontent.com/anthropics/skills/main/skills/mcp-builder/SKILL.md' },
                    { id: 'internal-comms', name: 'Internal Comms', description: 'Write internal communications: status reports, newsletters, 3P updates', category: 'operations', url: 'https://raw.githubusercontent.com/anthropics/skills/main/skills/internal-comms/SKILL.md' },
                    { id: 'web-artifacts-builder', name: 'Web Artifacts Builder', description: 'React + Tailwind + shadcn/ui component development and bundling', category: 'development', url: 'https://raw.githubusercontent.com/anthropics/skills/main/skills/web-artifacts-builder/SKILL.md' },
                    { id: 'skill-creator', name: 'Skill Creator', description: 'Interactive guide for building new Claude Code skills', category: 'meta', url: 'https://raw.githubusercontent.com/anthropics/skills/main/skills/skill-creator/SKILL.md' },
                    { id: 'algorithmic-art', name: 'Algorithmic Art', description: 'Generative art using p5.js with flow fields and particle systems', category: 'creative', url: 'https://raw.githubusercontent.com/anthropics/skills/main/skills/algorithmic-art/SKILL.md' },
                    { id: 'canvas-design', name: 'Canvas Design', description: 'Visual art creation in PNG and PDF formats', category: 'creative', url: 'https://raw.githubusercontent.com/anthropics/skills/main/skills/canvas-design/SKILL.md' },
                ],
            },
            {
                source: 'community',
                label: 'Community',
                skills: [
                    { id: 'tdd-superpowers', name: 'TDD (Test-Driven Dev)', description: 'Test-first development with Red-Green-Refactor cycle', category: 'development', url: 'https://raw.githubusercontent.com/obra/superpowers/main/skills/tdd/SKILL.md' },
                ],
            },
        ];
        // Mark which ones are already installed
        const result = REGISTRIES.map(registry => ({
            ...registry,
            skills: registry.skills.map(skill => ({
                ...skill,
                installed: isSkillInstalled(skill.id),
            })),
        }));
        res.json(result);
    }
    catch (err) {
        next(err);
    }
});
// POST /api/skills/registry/install — Install a skill from external registry
skillsRouter.post('/registry/install', async (req, res, next) => {
    try {
        const { skillId, url } = req.body;
        if (!skillId || !url) {
            res.status(400).json({ error: 'skillId and url are required' });
            return;
        }
        // Already installed?
        if (isSkillInstalled(skillId)) {
            res.json({ ok: true, message: 'Already installed', skillId });
            return;
        }
        // Fetch SKILL.md from URL
        const response = await fetch(url);
        if (!response.ok) {
            res.status(502).json({ error: `Failed to fetch skill: ${response.status}` });
            return;
        }
        const content = await response.text();
        // Install to .claude/skills/_shared/{skillId}/SKILL.md
        const destDir = path.join(COMPANY_ROOT, '.claude', 'skills', '_shared', skillId);
        fs.mkdirSync(destDir, { recursive: true });
        fs.writeFileSync(path.join(destDir, 'SKILL.md'), content);
        res.json({ ok: true, skillId, installed: true });
    }
    catch (err) {
        next(err);
    }
});
/* ─── Skill Export (for Store publish) ──── */
// GET /api/skills/export/:roleId — Export full SKILL.md content for publishing
// NOTE: Must be registered BEFORE /:id to avoid "export" matching as an id
skillsRouter.get('/export/:roleId', (req, res, next) => {
    try {
        const roleId = req.params.roleId;
        // 1. Primary skill: .claude/skills/{roleId}/SKILL.md
        let primary = null;
        const primaryPath = path.join(COMPANY_ROOT, '.claude', 'skills', roleId, 'SKILL.md');
        if (fs.existsSync(primaryPath)) {
            const content = fs.readFileSync(primaryPath, 'utf-8');
            primary = parseSkillContent(content, roleId);
        }
        // 2. Shared skills from role.yaml skills[] array
        const sharedIds = getRoleSkills(roleId);
        const shared = [];
        for (const sharedId of sharedIds) {
            const sharedPath = path.join(COMPANY_ROOT, '.claude', 'skills', '_shared', sharedId, 'SKILL.md');
            if (fs.existsSync(sharedPath)) {
                const content = fs.readFileSync(sharedPath, 'utf-8');
                const parsed = parseSkillContent(content, sharedId);
                shared.push({ id: sharedId, ...parsed });
            }
        }
        res.json({ primary, shared });
    }
    catch (err) {
        next(err);
    }
});
// GET /api/skills/:id — Skill detail (wildcard — must be LAST among GET routes)
skillsRouter.get('/:id', (req, res, next) => {
    try {
        const id = req.params.id;
        // Check installed first
        const installedPath = path.join(COMPANY_ROOT, '.claude', 'skills', '_shared', id, 'SKILL.md');
        if (fs.existsSync(installedPath)) {
            const content = fs.readFileSync(installedPath, 'utf-8');
            const meta = extractSkillMeta(content, id);
            res.json({ ...meta, installed: true, content });
            return;
        }
        // Check template
        const templateSkills = getAvailableSkills();
        const templateSkill = templateSkills.find(s => s.id === id);
        if (templateSkill) {
            res.json({ ...templateSkill, installed: false });
            return;
        }
        res.status(404).json({ error: `Skill not found: ${id}` });
    }
    catch (err) {
        next(err);
    }
});
/* ─── Role-Skill Management ─────────────── */
// GET /api/roles/:id/skills — Skills equipped to a role
skillsRouter.get('/role/:roleId', (req, res, next) => {
    try {
        const roleId = req.params.roleId;
        const skills = getRoleSkills(roleId);
        res.json(skills);
    }
    catch (err) {
        next(err);
    }
});
// POST /api/roles/:id/skills — Equip a skill to a role
skillsRouter.post('/role/:roleId', (req, res, next) => {
    try {
        const roleId = req.params.roleId;
        const { skillId } = req.body;
        if (!skillId || typeof skillId !== 'string') {
            res.status(400).json({ error: 'skillId is required' });
            return;
        }
        // Verify skill exists (installed or template)
        if (!isSkillInstalled(skillId) && !isSkillInTemplate(skillId)) {
            res.status(404).json({ error: `Skill not found: ${skillId}` });
            return;
        }
        // Install skill if not already installed
        if (!isSkillInstalled(skillId)) {
            installSkillFromTemplate(skillId);
        }
        // Add to role.yaml skills array
        const yamlPath = path.join(COMPANY_ROOT, 'roles', roleId, 'role.yaml');
        if (!fs.existsSync(yamlPath)) {
            res.status(404).json({ error: `Role not found: ${roleId}` });
            return;
        }
        const raw = YAML.parse(fs.readFileSync(yamlPath, 'utf-8'));
        const skills = raw.skills || [];
        if (skills.includes(skillId)) {
            res.json({ ok: true, message: 'Skill already equipped' });
            return;
        }
        skills.push(skillId);
        raw.skills = skills;
        fs.writeFileSync(yamlPath, YAML.stringify(raw));
        res.json({ ok: true, roleId, skillId, skills });
    }
    catch (err) {
        next(err);
    }
});
// DELETE /api/roles/:roleId/skills/:skillId — Unequip a skill
skillsRouter.delete('/role/:roleId/:skillId', (req, res, next) => {
    try {
        const roleId = req.params.roleId;
        const skillId = req.params.skillId;
        const yamlPath = path.join(COMPANY_ROOT, 'roles', roleId, 'role.yaml');
        if (!fs.existsSync(yamlPath)) {
            res.status(404).json({ error: `Role not found: ${roleId}` });
            return;
        }
        const raw = YAML.parse(fs.readFileSync(yamlPath, 'utf-8'));
        const skills = raw.skills || [];
        const idx = skills.indexOf(skillId);
        if (idx === -1) {
            res.json({ ok: true, message: 'Skill not equipped' });
            return;
        }
        skills.splice(idx, 1);
        raw.skills = skills.length > 0 ? skills : undefined;
        fs.writeFileSync(yamlPath, YAML.stringify(raw));
        res.json({ ok: true, roleId, skillId, skills });
    }
    catch (err) {
        next(err);
    }
});
/* ─── Helpers ────────────────────────────── */
function isSkillInstalled(skillId) {
    return fs.existsSync(path.join(COMPANY_ROOT, '.claude', 'skills', '_shared', skillId, 'SKILL.md'));
}
function isSkillInTemplate(skillId) {
    return getAvailableSkills().some(s => s.id === skillId);
}
function installSkillFromTemplate(skillId) {
    const srcDir = path.resolve(__dirname, '../../../../../templates/skills', skillId);
    const destDir = path.join(COMPANY_ROOT, '.claude', 'skills', '_shared', skillId);
    if (!fs.existsSync(srcDir))
        return;
    fs.mkdirSync(destDir, { recursive: true });
    const skillMdSrc = path.join(srcDir, 'SKILL.md');
    if (fs.existsSync(skillMdSrc)) {
        fs.copyFileSync(skillMdSrc, path.join(destDir, 'SKILL.md'));
    }
}
function getRoleSkills(roleId) {
    const yamlPath = path.join(COMPANY_ROOT, 'roles', roleId, 'role.yaml');
    if (!fs.existsSync(yamlPath))
        return [];
    const raw = YAML.parse(fs.readFileSync(yamlPath, 'utf-8'));
    return raw.skills || [];
}
function extractSkillMeta(content, id) {
    const frontmatter = content.match(/^---\n([\s\S]*?)\n---/);
    if (!frontmatter) {
        return { id, name: id, description: '' };
    }
    try {
        const meta = YAML.parse(frontmatter[1]);
        return {
            id,
            name: meta.name || id,
            description: meta.description || '',
            ...(meta.tags ? { tags: meta.tags } : {}),
        };
    }
    catch {
        return { id, name: id, description: '' };
    }
}
function parseSkillContent(content, id) {
    const fmMatch = content.match(/^---\n([\s\S]*?)\n---\n?([\s\S]*)/);
    if (!fmMatch) {
        return { frontmatter: { name: id, description: '' }, body: content };
    }
    try {
        const meta = YAML.parse(fmMatch[1]);
        return {
            frontmatter: {
                name: meta.name || id,
                description: meta.description || '',
                ...(meta.allowedTools ? { allowedTools: meta.allowedTools } : {}),
                ...(meta.model ? { model: meta.model } : {}),
                ...(meta.tags ? { tags: meta.tags } : {}),
            },
            body: fmMatch[2].trim(),
        };
    }
    catch {
        return { frontmatter: { name: id, description: '' }, body: content };
    }
}
