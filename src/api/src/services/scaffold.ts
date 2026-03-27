/**
 * scaffold.ts — AKB scaffolding service
 *
 * AKB scaffolding used by the web onboarding wizard.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execSync } from 'node:child_process';
import { writeConfig } from './company-config.js';
import { mergePreferences, type CharacterAppearance } from './preferences.js';
import type { CompanyConfig } from './company-config.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const TEMPLATES_DIR = path.resolve(__dirname, '../../../../templates');

/* ─── Default Appearances ─── */

const DEFAULT_ROLE_APPEARANCES: Record<string, { skinColor: string; hairColor: string; shirtColor: string; pantsColor: string; shoeColor: string; hairStyle: string; outfitStyle: string; accessory: string }> = {
  // Shared across templates
  cto:               { skinColor: '#F5CBA7', hairColor: '#2C1810', shirtColor: '#1565C0', pantsColor: '#37474F', shoeColor: '#212121', hairStyle: 'short', outfitStyle: 'tshirt', accessory: 'glasses' },
  cbo:               { skinColor: '#FDEBD0', hairColor: '#1A0A00', shirtColor: '#E65100', pantsColor: '#37474F', shoeColor: '#1A1A1A', hairStyle: 'slicked', outfitStyle: 'suit', accessory: 'lapels' },
  pm:                { skinColor: '#FDEBD0', hairColor: '#6D4C41', shirtColor: '#2E7D32', pantsColor: '#37474F', shoeColor: '#212121', hairStyle: 'bun', outfitStyle: 'tshirt', accessory: 'blush' },
  engineer:          { skinColor: '#F5CBA7', hairColor: '#1A1A1A', shirtColor: '#4A148C', pantsColor: '#37474F', shoeColor: '#7B1FA2', hairStyle: 'messy', outfitStyle: 'hoodie', accessory: 'headphones' },
  designer:          { skinColor: '#FDEBD0', hairColor: '#AD1457', shirtColor: '#AD1457', pantsColor: '#37474F', shoeColor: '#212121', hairStyle: 'bob', outfitStyle: 'tshirt', accessory: 'beret' },
  qa:                { skinColor: '#F5CBA7', hairColor: '#4E342E', shirtColor: '#00695C', pantsColor: '#37474F', shoeColor: '#212121', hairStyle: 'short', outfitStyle: 'tshirt', accessory: 'badge' },
  // Startup template
  'be-engineer':     { skinColor: '#F5CBA7', hairColor: '#1A1A1A', shirtColor: '#4A148C', pantsColor: '#37474F', shoeColor: '#7B1FA2', hairStyle: 'messy', outfitStyle: 'hoodie', accessory: 'headphones' },
  'fe-engineer':     { skinColor: '#FDEBD0', hairColor: '#5D4037', shirtColor: '#00838F', pantsColor: '#37474F', shoeColor: '#212121', hairStyle: 'wavy', outfitStyle: 'tshirt', accessory: 'glasses' },
  po:                { skinColor: '#F5CBA7', hairColor: '#6D4C41', shirtColor: '#2E7D32', pantsColor: '#37474F', shoeColor: '#212121', hairStyle: 'bun', outfitStyle: 'tshirt', accessory: 'blush' },
  // Research template
  'lead-researcher': { skinColor: '#F5CBA7', hairColor: '#4E342E', shirtColor: '#1565C0', pantsColor: '#37474F', shoeColor: '#212121', hairStyle: 'short', outfitStyle: 'suit', accessory: 'glasses' },
  'lead-analyst':    { skinColor: '#FDEBD0', hairColor: '#1A0A00', shirtColor: '#6A1B9A', pantsColor: '#37474F', shoeColor: '#212121', hairStyle: 'slicked', outfitStyle: 'suit', accessory: 'glasses' },
  researcher:        { skinColor: '#F5CBA7', hairColor: '#3E2723', shirtColor: '#00695C', pantsColor: '#37474F', shoeColor: '#212121', hairStyle: 'messy', outfitStyle: 'tshirt', accessory: 'badge' },
  analyst:           { skinColor: '#FDEBD0', hairColor: '#4E342E', shirtColor: '#0277BD', pantsColor: '#37474F', shoeColor: '#212121', hairStyle: 'bob', outfitStyle: 'tshirt', accessory: 'glasses' },
  writer:            { skinColor: '#F5CBA7', hairColor: '#6D4C41', shirtColor: '#558B2F', pantsColor: '#37474F', shoeColor: '#212121', hairStyle: 'wavy', outfitStyle: 'tshirt', accessory: 'blush' },
  editor:            { skinColor: '#FDEBD0', hairColor: '#3E2723', shirtColor: '#BF360C', pantsColor: '#37474F', shoeColor: '#212121', hairStyle: 'short', outfitStyle: 'tshirt', accessory: 'badge' },
  // Agency template
  'creative-director': { skinColor: '#FDEBD0', hairColor: '#AD1457', shirtColor: '#6A1B9A', pantsColor: '#37474F', shoeColor: '#212121', hairStyle: 'wavy', outfitStyle: 'tshirt', accessory: 'beret' },
  'account-director':  { skinColor: '#F5CBA7', hairColor: '#1A0A00', shirtColor: '#37474F', pantsColor: '#37474F', shoeColor: '#1A1A1A', hairStyle: 'slicked', outfitStyle: 'suit', accessory: 'lapels' },
  copywriter:          { skinColor: '#F5CBA7', hairColor: '#5D4037', shirtColor: '#E65100', pantsColor: '#37474F', shoeColor: '#212121', hairStyle: 'messy', outfitStyle: 'hoodie', accessory: 'headphones' },
  developer:           { skinColor: '#FDEBD0', hairColor: '#1A1A1A', shirtColor: '#1565C0', pantsColor: '#37474F', shoeColor: '#212121', hairStyle: 'short', outfitStyle: 'hoodie', accessory: 'glasses' },
  strategist:          { skinColor: '#F5CBA7', hairColor: '#4E342E', shirtColor: '#00695C', pantsColor: '#37474F', shoeColor: '#212121', hairStyle: 'bun', outfitStyle: 'tshirt', accessory: 'badge' },
};

const AKB_METHODOLOGY_CONTENT = `# Agentic Knowledge Base (AKB)

> The canonical reference for AKB — the file-based knowledge protocol for AI agents.

## TL;DR

- **Definition**: A file-based knowledge system where AI uses **search (Grep/Glob)** to find and **contextual links** to navigate
- **Essence**: File-based Lightweight Ontology (Tag = Type, inline links = Edges)
- **Philosophy**: Optimize documents so AI can find them — don't force AI to follow a rigid protocol
- **Structure**: Root (CLAUDE.md) → Hub ({folder}.md) → Node (*.md)
- **Core rules**: 5 writing principles (TL;DR, contextual links, keyword-optimized filenames, atomicity, semantic vs implementation separation)

---

## Architecture

AKB follows a 3-layer hierarchy: **Root → Hub → Node**.

| Layer | Role | Description |
|-------|------|-------------|
| **Root** (CLAUDE.md) | Minimal routing | Auto-injected as system prompt, provides key file paths |
| **Hub** ({folder}.md) | TOC for humans | Folder overview; AI reads selectively |
| **Node** (*.md) | Actual information | What AI searches for via Grep/Glob |

## Writing Principles

1. **TL;DR Required** — 3-5 bullet points with bold keywords for Grep search
2. **Contextual Links** — Place links inline with context, not in isolated lists
3. **Keyword Filenames** — Use descriptive filenames (not notes.md, use market-analysis.md)
4. **Atomicity** — One topic per doc, under 200 lines
5. **Semantic vs Implementation** — AKB holds "why" and relationships; code repo holds specs and configs

## Design Principle

> "Don't try to change AI behavior — optimize documents so AI can find them naturally."

If AI found the information it needed and produced a good answer, that's proof AKB is working.
`;

function getPackageVersion(): string {
  const pkgPath = path.resolve(__dirname, '../../../../package.json');
  try {
    const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf-8'));
    return pkg.version || '0.0.0';
  } catch {
    return '0.0.0';
  }
}

export interface ScaffoldConfig {
  companyName: string;
  description: string;
  apiKey?: string;
  team: 'startup' | 'research' | 'agency' | 'custom';
  projectRoot: string;
  existingProjectPath?: string;
  knowledgePaths?: string[];
  language?: string;
}

interface TeamRole {
  id: string;
  name: string;
  level: string;
  reportsTo: string;
  persona: string;
  defaultSkills?: string[];
}

function loadTemplate(name: string): string {
  return fs.readFileSync(path.join(TEMPLATES_DIR, name), 'utf-8');
}

export function loadTeam(teamName: string): TeamRole[] {
  const teamPath = path.join(TEMPLATES_DIR, 'teams', `${teamName}.json`);
  if (!fs.existsSync(teamPath)) return [];
  return JSON.parse(fs.readFileSync(teamPath, 'utf-8'));
}

export function getAvailableTeams(): string[] {
  const teamsDir = path.join(TEMPLATES_DIR, 'teams');
  if (!fs.existsSync(teamsDir)) return [];
  return fs.readdirSync(teamsDir)
    .filter(f => f.endsWith('.json'))
    .map(f => f.replace('.json', ''));
}

export interface SkillToolDef {
  package: string;
  binary: string;
  installCmd: string;
}

export interface SkillMeta {
  id: string;
  name: string;
  description: string;
  version: string;
  author: string;
  tags: string[];
  category: string;
  compatibleRoles: string[];
  dependencies: string[];
  files: string[];
  tools?: SkillToolDef[];
}

/**
 * Get available skills from the template registry
 */
export function getAvailableSkills(): SkillMeta[] {
  const manifestPath = path.join(TEMPLATES_DIR, 'skills', '_manifest.json');
  if (!fs.existsSync(manifestPath)) return [];

  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf-8'));
  const skills: SkillMeta[] = [];

  for (const entry of manifest.skills) {
    const metaPath = path.join(TEMPLATES_DIR, 'skills', entry.id, 'meta.json');
    if (fs.existsSync(metaPath)) {
      skills.push(JSON.parse(fs.readFileSync(metaPath, 'utf-8')));
    }
  }

  return skills;
}

/**
 * Check if a CLI binary is available on the system
 */
function isBinaryInstalled(binary: string): boolean {
  try {
    execSync(`which ${binary}`, { stdio: 'ignore', timeout: 5000 });
    return true;
  } catch {
    return false;
  }
}

/**
 * Collect all tools required by a set of skills
 */
export function getRequiredTools(skillIds: string[]): Array<SkillToolDef & { skillId: string; installed: boolean }> {
  const tools: Array<SkillToolDef & { skillId: string; installed: boolean }> = [];
  const seen = new Set<string>();

  for (const skillId of skillIds) {
    const metaPath = path.join(TEMPLATES_DIR, 'skills', skillId, 'meta.json');
    if (!fs.existsSync(metaPath)) continue;

    const meta: SkillMeta = JSON.parse(fs.readFileSync(metaPath, 'utf-8'));
    if (!meta.tools?.length) continue;

    for (const tool of meta.tools) {
      if (seen.has(tool.package)) continue;
      seen.add(tool.package);
      tools.push({
        ...tool,
        skillId,
        installed: isBinaryInstalled(tool.binary),
      });
    }
  }

  return tools;
}

export interface ToolInstallCallbacks {
  onChecking?: (tool: string) => void;
  onInstalling?: (tool: string) => void;
  onInstalled?: (tool: string) => void;
  onSkipped?: (tool: string, reason: string) => void;
  onError?: (tool: string, error: string) => void;
  onDone?: (stats: { installed: number; skipped: number; failed: number }) => void;
}

/**
 * Install CLI tools required by skills
 */
export function installSkillTools(skillIds: string[], callbacks?: ToolInstallCallbacks): void {
  const tools = getRequiredTools(skillIds);
  let installed = 0;
  let skipped = 0;
  let failed = 0;

  for (const tool of tools) {
    callbacks?.onChecking?.(tool.package);

    if (tool.installed) {
      callbacks?.onSkipped?.(tool.package, 'already installed');
      skipped++;
      continue;
    }

    callbacks?.onInstalling?.(tool.package);
    try {
      execSync(tool.installCmd, { stdio: 'ignore', timeout: 120000 });
      callbacks?.onInstalled?.(tool.package);
      installed++;
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'install failed';
      callbacks?.onError?.(tool.package, msg);
      failed++;
    }
  }

  callbacks?.onDone?.({ installed, skipped, failed });
}

function renderTemplate(template: string, vars: Record<string, string>): string {
  let result = template;
  for (const [key, value] of Object.entries(vars)) {
    result = result.replaceAll(`{{${key}}}`, value);
  }
  return result;
}

/**
 * Copy a skill from templates/skills/ to the target AKB's .claude/skills/_shared/
 */
function installSkill(root: string, skillId: string): boolean {
  const srcDir = path.join(TEMPLATES_DIR, 'skills', skillId);
  if (!fs.existsSync(srcDir)) return false;

  const destDir = path.join(root, '.claude', 'skills', '_shared', skillId);
  fs.mkdirSync(destDir, { recursive: true });

  // Copy SKILL.md
  const skillMdSrc = path.join(srcDir, 'SKILL.md');
  if (fs.existsSync(skillMdSrc)) {
    fs.copyFileSync(skillMdSrc, path.join(destDir, 'SKILL.md'));
  }

  return true;
}

/**
 * Collect all unique skills needed by a team's roles and install them
 */
function installTeamSkills(root: string, roles: TeamRole[]): string[] {
  const installed: string[] = [];
  const skillIds = new Set<string>();

  for (const role of roles) {
    if (role.defaultSkills) {
      for (const skillId of role.defaultSkills) {
        skillIds.add(skillId);
      }
    }
  }

  for (const skillId of skillIds) {
    if (installSkill(root, skillId)) {
      installed.push(skillId);
    }
  }

  return installed;
}

export function scaffold(config: ScaffoldConfig): string[] {
  const root = config.projectRoot;
  const created: string[] = [];
  const vars = {
    COMPANY_NAME: config.companyName,
    DESCRIPTION: config.description,
  };

  // Create directories
  const dirs = [
    'knowledge', 'knowledge/roles', 'knowledge/projects',
    'knowledge/architecture', 'knowledge/methodologies',
    'knowledge/decisions', 'knowledge/presets',
    '.tycono/waves', '.tycono/sessions', '.tycono/standup',
    '.tycono/activity-streams', '.tycono/cost', '.tycono/activity',
    '.claude/skills', '.claude/skills/_shared', '.tycono',
  ];
  for (const dir of dirs) {
    fs.mkdirSync(path.join(root, dir), { recursive: true });
    created.push(dir + '/');
  }

  // Write CLAUDE.md — knowledge/ only (AI agent's cwd)
  const claudeTmpl = loadTemplate('CLAUDE.md.tmpl');
  const pkgVersion = getPackageVersion();
  const claudeContent = claudeTmpl.replaceAll('{{VERSION}}', pkgVersion);
  fs.writeFileSync(path.join(root, 'knowledge', 'CLAUDE.md'), claudeContent);
  created.push('knowledge/CLAUDE.md');

  // Write .tycono/rules-version
  fs.writeFileSync(path.join(root, '.tycono', 'rules-version'), pkgVersion);
  created.push('.tycono/rules-version');

  // Write knowledge/custom-rules.md (empty stub — user owned, git tracked)
  const customRulesPath = path.join(root, 'knowledge', 'custom-rules.md');
  if (!fs.existsSync(customRulesPath)) {
    fs.writeFileSync(customRulesPath, `# Custom Rules\n\n> Company-specific rules, constraints, and processes.\n> This file is owned by you — Tycono will never overwrite it.\n\n<!-- Add your custom rules below -->\n`);
    created.push('knowledge/custom-rules.md');
  }

  // Write knowledge/company.md
  const companyTmpl = loadTemplate('company.md.tmpl');
  fs.writeFileSync(path.join(root, 'knowledge', 'company.md'), renderTemplate(companyTmpl, vars));
  created.push('knowledge/company.md');

  // Write knowledge/roles/roles.md
  const rolesTmpl = loadTemplate('roles.md.tmpl');
  fs.writeFileSync(path.join(root, 'knowledge', 'roles', 'roles.md'), renderTemplate(rolesTmpl, vars));
  created.push('knowledge/roles/roles.md');

  // Write .gitignore
  const giTmpl = loadTemplate('gitignore.tmpl');
  const gitignorePath = path.join(root, '.gitignore');
  if (!fs.existsSync(gitignorePath)) {
    fs.writeFileSync(gitignorePath, giTmpl);
    created.push('.gitignore');
  }

  // Write .tycono/config.json (engine + API key + codeRoot)
  const slug = config.companyName.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'my-company';
  const defaultCodeRoot = path.join(path.dirname(root), `${slug}-code`);
  if (config.apiKey) {
    const companyConfig: CompanyConfig = {
      engine: 'direct-api',
      apiKey: config.apiKey,
      codeRoot: defaultCodeRoot,
    };
    writeConfig(root, companyConfig);
    created.push('.tycono/config.json');
    // Also write .env for backward compatibility
    fs.writeFileSync(path.join(root, '.env'), `ANTHROPIC_API_KEY=${config.apiKey}\n`);
    created.push('.env');
  } else {
    const companyConfig: CompanyConfig = { engine: 'claude-cli', codeRoot: defaultCodeRoot };
    writeConfig(root, companyConfig);
    created.push('.tycono/config.json');
  }
  // Ensure codeRoot directory exists
  fs.mkdirSync(defaultCodeRoot, { recursive: true });
  created.push(`(code) ${defaultCodeRoot}`);

  // Save language preference (default: English)
  mergePreferences(root, { language: config.language || 'en' });

  // Create team roles + install skills
  if (config.team !== 'custom') {
    const roles = loadTeam(config.team);

    // Install shared skills needed by this team
    const installedSkills = installTeamSkills(root, roles);
    for (const skillId of installedSkills) {
      created.push(`.claude/skills/_shared/${skillId}/`);
    }

    // Create roles with skill references
    for (const role of roles) {
      createRole(root, role);
      created.push(`knowledge/roles/${role.id}/`);
    }
  }

  // Hub files
  const hubs: Record<string, string> = {
    'knowledge/projects/projects.md': `# Projects\n\nProject listing for ${config.companyName}.\n\n| Project | Status | Lead |\n|---------|--------|------|\n`,
    'knowledge/architecture/architecture.md': `# Architecture\n\nTechnical architecture for ${config.companyName}.\n`,
    'knowledge/knowledge.md': `# Knowledge Base\n\nDomain knowledge for ${config.companyName}.\n`,
  };
  for (const [filePath, content] of Object.entries(hubs)) {
    const full = path.join(root, filePath);
    if (!fs.existsSync(full)) {
      fs.writeFileSync(full, content);
      created.push(filePath);
    }
  }

  // Methodology documents
  const methodologiesHub = path.join(root, 'knowledge', 'methodologies', 'methodologies.md');
  if (!fs.existsSync(methodologiesHub)) {
    fs.writeFileSync(methodologiesHub, `# Methodologies\n\n> Frameworks and principles that guide how AI agents work in this organization.\n\n## Documents\n\n| Document | Description |\n|----------|-------------|\n| [agentic-knowledge-base.md](./agentic-knowledge-base.md) | AKB — the file-based knowledge protocol for AI agents |\n\n---\n\n*Managed by: All*\n`);
    created.push('knowledge/methodologies/methodologies.md');
  }
  const akbDoc = path.join(root, 'knowledge', 'methodologies', 'agentic-knowledge-base.md');
  if (!fs.existsSync(akbDoc)) {
    fs.writeFileSync(akbDoc, AKB_METHODOLOGY_CONTENT);
    created.push('knowledge/methodologies/agentic-knowledge-base.md');
  }

  // Set default appearances for team roles
  if (config.team !== 'custom') {
    const roles = loadTeam(config.team);
    const appearances: Record<string, CharacterAppearance> = {};
    for (const role of roles) {
      const def = DEFAULT_ROLE_APPEARANCES[role.id];
      if (def) appearances[role.id] = def;
    }
    if (Object.keys(appearances).length > 0) {
      mergePreferences(root, { appearances });
    }
  }

  // Brownfield: note existing project path
  if (config.existingProjectPath) {
    const targetDir = path.join(root, 'knowledge', 'projects', 'existing');
    if (!fs.existsSync(targetDir)) {
      fs.mkdirSync(targetDir, { recursive: true });
      fs.writeFileSync(
        path.join(targetDir, 'prd.md'),
        `# Existing Project\n\nImported from: ${config.existingProjectPath}\n`
      );
      created.push('knowledge/projects/existing/');
    }
  }

  // Extra knowledge paths
  if (config.knowledgePaths?.length) {
    const knowledgeMd = path.join(root, 'knowledge', 'knowledge.md');
    let content = fs.readFileSync(knowledgeMd, 'utf-8');
    content += '\n## External Knowledge Sources\n\n';
    for (const kp of config.knowledgePaths) {
      content += `- ${kp}\n`;
    }
    fs.writeFileSync(knowledgeMd, content);
  }

  // Auto-init git for AKB
  const gitDir = path.join(root, '.git');
  if (!fs.existsSync(gitDir)) {
    try {
      execSync('git init', { cwd: root, stdio: 'pipe' });
      execSync('git add -A', { cwd: root, stdio: 'pipe' });
      execSync('git commit -m "Initial commit by Tycono"', { cwd: root, stdio: 'pipe' });
    } catch { /* ignore — git may not be installed */ }
  }

  return created;
}

function createRole(root: string, role: TeamRole): void {
  const roleDir = path.join(root, 'knowledge', 'roles', role.id);
  const skillDir = path.join(root, '.claude', 'skills', role.id);
  const journalDir = path.join(roleDir, 'journal');

  fs.mkdirSync(roleDir, { recursive: true });
  fs.mkdirSync(journalDir, { recursive: true });
  fs.mkdirSync(skillDir, { recursive: true });

  // Build role.yaml with skills field
  // Use block scalar (|-) for persona to safely handle embedded quotes
  const personaLines = role.persona.split('\n').map((l, i) => i === 0 ? `  ${l}` : `  ${l}`).join('\n');
  const yamlLines = [
    `id: ${role.id}`,
    `name: "${role.name}"`,
    `level: ${role.level}`,
    `reports_to: ${role.reportsTo}`,
    `persona: |-`,
    personaLines,
  ];

  if (role.defaultSkills?.length) {
    yamlLines.push('skills:');
    for (const skill of role.defaultSkills) {
      yamlLines.push(`  - ${skill}`);
    }
  }

  yamlLines.push(
    'authority:',
    '  autonomous:',
    '    - Implementation within assigned scope',
    '  needs_approval:',
    '    - Architecture changes',
    'knowledge:',
    '  reads:',
    '    - projects/',
    '  writes:',
    '    - projects/',
    'reports:',
    '  daily: standup',
    '  weekly: summary',
  );

  fs.writeFileSync(path.join(roleDir, 'role.yaml'), yamlLines.join('\n') + '\n');

  const profile = `# ${role.name}\n\n> ${role.persona}\n\n| Item | Value |\n|------|-------|\n| ID | ${role.id} |\n| Level | ${role.level} |\n| Reports To | ${role.reportsTo} |\n`;
  fs.writeFileSync(path.join(roleDir, 'profile.md'), profile);

  const skill = `# ${role.name} Skills\n\nSkill definitions for the ${role.name} role.\n`;
  fs.writeFileSync(path.join(skillDir, 'SKILL.md'), skill);

  // Append to roles.md
  const rolesHubPath = path.join(root, 'knowledge', 'roles', 'roles.md');
  if (fs.existsSync(rolesHubPath)) {
    const hubContent = fs.readFileSync(rolesHubPath, 'utf-8');
    const row = `| ${role.name} | ${role.id} | ${role.level} | ${role.reportsTo} | Active |`;
    fs.writeFileSync(rolesHubPath, hubContent.trimEnd() + '\n' + row + '\n');
  }

}
