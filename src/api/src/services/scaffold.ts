/**
 * scaffold.ts — AKB scaffolding service
 *
 * Extracted from bin/init.ts for reuse by the web onboarding wizard.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const TEMPLATES_DIR = path.resolve(__dirname, '../../../../templates');

export interface ScaffoldConfig {
  companyName: string;
  description: string;
  apiKey?: string;
  team: 'startup' | 'research' | 'agency' | 'custom';
  projectRoot: string;
  existingProjectPath?: string;
  knowledgePaths?: string[];
}

interface TeamRole {
  id: string;
  name: string;
  level: string;
  reportsTo: string;
  persona: string;
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

function renderTemplate(template: string, vars: Record<string, string>): string {
  let result = template;
  for (const [key, value] of Object.entries(vars)) {
    result = result.replaceAll(`{{${key}}}`, value);
  }
  return result;
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
    'company', 'roles', 'projects', 'architecture',
    'operations', 'operations/standup', 'operations/waves',
    'operations/decisions', 'knowledge', '.claude/skills',
  ];
  for (const dir of dirs) {
    fs.mkdirSync(path.join(root, dir), { recursive: true });
    created.push(dir + '/');
  }

  // Write CLAUDE.md
  const claudeTmpl = loadTemplate('CLAUDE.md.tmpl');
  fs.writeFileSync(path.join(root, 'CLAUDE.md'), renderTemplate(claudeTmpl, vars));
  created.push('CLAUDE.md');

  // Write company/company.md
  const companyTmpl = loadTemplate('company.md.tmpl');
  fs.writeFileSync(path.join(root, 'company', 'company.md'), renderTemplate(companyTmpl, vars));
  created.push('company/company.md');

  // Write roles/roles.md
  const rolesTmpl = loadTemplate('roles.md.tmpl');
  fs.writeFileSync(path.join(root, 'roles', 'roles.md'), renderTemplate(rolesTmpl, vars));
  created.push('roles/roles.md');

  // Write .gitignore
  const giTmpl = loadTemplate('gitignore.tmpl');
  const gitignorePath = path.join(root, '.gitignore');
  if (!fs.existsSync(gitignorePath)) {
    fs.writeFileSync(gitignorePath, giTmpl);
    created.push('.gitignore');
  }

  // Write .env (API key)
  if (config.apiKey) {
    fs.writeFileSync(path.join(root, '.env'), `ANTHROPIC_API_KEY=${config.apiKey}\n`);
    created.push('.env');
  }

  // Create team roles
  if (config.team !== 'custom') {
    const roles = loadTeam(config.team);
    for (const role of roles) {
      createRole(root, role);
      created.push(`roles/${role.id}/`);
    }
  }

  // Hub files
  const hubs: Record<string, string> = {
    'projects/projects.md': `# Projects\n\nProject listing for ${config.companyName}.\n\n| Project | Status | Lead |\n|---------|--------|------|\n`,
    'architecture/architecture.md': `# Architecture\n\nTechnical architecture for ${config.companyName}.\n`,
    'knowledge/knowledge.md': `# Knowledge Base\n\nDomain knowledge for ${config.companyName}.\n`,
  };
  for (const [filePath, content] of Object.entries(hubs)) {
    const full = path.join(root, filePath);
    if (!fs.existsSync(full)) {
      fs.writeFileSync(full, content);
      created.push(filePath);
    }
  }

  // Brownfield: note existing project path
  if (config.existingProjectPath) {
    const targetDir = path.join(root, 'projects', 'existing');
    if (!fs.existsSync(targetDir)) {
      fs.mkdirSync(targetDir, { recursive: true });
      fs.writeFileSync(
        path.join(targetDir, 'prd.md'),
        `# Existing Project\n\nImported from: ${config.existingProjectPath}\n`
      );
      created.push('projects/existing/');
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

  return created;
}

function createRole(root: string, role: TeamRole): void {
  const roleDir = path.join(root, 'roles', role.id);
  const skillDir = path.join(root, '.claude', 'skills', role.id);
  const journalDir = path.join(roleDir, 'journal');

  fs.mkdirSync(roleDir, { recursive: true });
  fs.mkdirSync(journalDir, { recursive: true });
  fs.mkdirSync(skillDir, { recursive: true });

  const yaml = [
    `id: ${role.id}`,
    `name: "${role.name}"`,
    `level: ${role.level}`,
    `reports_to: ${role.reportsTo}`,
    `persona: "${role.persona}"`,
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
  ].join('\n');
  fs.writeFileSync(path.join(roleDir, 'role.yaml'), yaml + '\n');

  const profile = `# ${role.name}\n\n> ${role.persona}\n\n| Item | Value |\n|------|-------|\n| ID | ${role.id} |\n| Level | ${role.level} |\n| Reports To | ${role.reportsTo} |\n`;
  fs.writeFileSync(path.join(roleDir, 'profile.md'), profile);

  const skill = `# ${role.name} Skills\n\nSkill definitions for the ${role.name} role.\n`;
  fs.writeFileSync(path.join(skillDir, 'SKILL.md'), skill);

  // Append to roles.md
  const rolesHubPath = path.join(root, 'roles', 'roles.md');
  if (fs.existsSync(rolesHubPath)) {
    const hubContent = fs.readFileSync(rolesHubPath, 'utf-8');
    const row = `| ${role.name} | ${role.id} | ${role.level} | ${role.reportsTo} | Active |`;
    fs.writeFileSync(rolesHubPath, hubContent.trimEnd() + '\n' + row + '\n');
  }

  // Append to CLAUDE.md org table
  const claudeMdPath = path.join(root, 'CLAUDE.md');
  if (fs.existsSync(claudeMdPath)) {
    const claudeContent = fs.readFileSync(claudeMdPath, 'utf-8');
    const orgRow = `| **${role.name}** | AI (${role.id}) | ${role.level} | ${role.reportsTo} | Active |`;
    const orgMatch = claudeContent.match(/(## Organization[\s\S]*?\n(\|[^\n]*\n)+)/);
    if (orgMatch) {
      const insertPos = (orgMatch.index ?? 0) + orgMatch[0].length;
      const updated = claudeContent.slice(0, insertPos) + orgRow + '\n' + claudeContent.slice(insertPos);
      fs.writeFileSync(claudeMdPath, updated);
    }
  }
}
