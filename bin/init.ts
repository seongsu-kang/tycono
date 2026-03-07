import fs from 'node:fs';
import path from 'node:path';
import readline from 'node:readline';
import { fileURLToPath } from 'node:url';
import { detectAuth } from './auth-detect.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const TEMPLATES_DIR = path.resolve(__dirname, '..', 'templates');

interface InitConfig {
  companyName: string;
  description: string;
  apiKey: string;
  team: 'startup' | 'research' | 'agency' | 'custom';
}

function ask(rl: readline.Interface, question: string, defaultValue?: string): Promise<string> {
  const suffix = defaultValue ? ` (${defaultValue})` : '';
  return new Promise((resolve) => {
    rl.question(`  ${question}${suffix}: `, (answer) => {
      resolve(answer.trim() || defaultValue || '');
    });
  });
}

function askSecret(rl: readline.Interface, question: string): Promise<string> {
  return new Promise((resolve) => {
    rl.question(`  ${question}: `, (answer) => {
      resolve(answer.trim());
    });
  });
}

function askChoice(rl: readline.Interface, question: string, choices: string[]): Promise<string> {
  return new Promise((resolve) => {
    console.log(`\n  ${question}`);
    choices.forEach((c, i) => console.log(`    ${i + 1}. ${c}`));
    rl.question('  Choice: ', (answer) => {
      const idx = parseInt(answer.trim(), 10) - 1;
      if (idx >= 0 && idx < choices.length) {
        resolve(choices[idx]);
      } else {
        resolve(choices[0]); // default to first
      }
    });
  });
}

function loadTemplate(name: string): string {
  return fs.readFileSync(path.join(TEMPLATES_DIR, name), 'utf-8');
}

interface TeamRole {
  id: string;
  name: string;
  level: string;
  reportsTo: string;
  persona: string;
}

function loadTeam(teamName: string): TeamRole[] {
  const teamPath = path.join(TEMPLATES_DIR, 'teams', `${teamName}.json`);
  if (!fs.existsSync(teamPath)) return [];
  return JSON.parse(fs.readFileSync(teamPath, 'utf-8'));
}

function renderTemplate(template: string, vars: Record<string, string>): string {
  let result = template;
  for (const [key, value] of Object.entries(vars)) {
    result = result.replaceAll(`{{${key}}}`, value);
  }
  return result;
}

function scaffold(config: InitConfig): void {
  const root = process.cwd();
  const vars = {
    COMPANY_NAME: config.companyName,
    DESCRIPTION: config.description,
  };

  // Create directories
  const dirs = [
    'company',
    'roles',
    'projects',
    'architecture',
    'operations',
    'operations/standup',
    'operations/waves',
    'operations/decisions',
    'knowledge',
    '.claude/skills',
  ];
  for (const dir of dirs) {
    fs.mkdirSync(path.join(root, dir), { recursive: true });
  }

  // Write CLAUDE.md
  const claudeTmpl = loadTemplate('CLAUDE.md.tmpl');
  fs.writeFileSync(path.join(root, 'CLAUDE.md'), renderTemplate(claudeTmpl, vars));

  // Write company/company.md
  const companyTmpl = loadTemplate('company.md.tmpl');
  fs.writeFileSync(path.join(root, 'company', 'company.md'), renderTemplate(companyTmpl, vars));

  // Write roles/roles.md
  const rolesTmpl = loadTemplate('roles.md.tmpl');
  fs.writeFileSync(path.join(root, 'roles', 'roles.md'), renderTemplate(rolesTmpl, vars));

  // Write .gitignore
  const giTmpl = loadTemplate('gitignore.tmpl');
  const gitignorePath = path.join(root, '.gitignore');
  if (!fs.existsSync(gitignorePath)) {
    fs.writeFileSync(gitignorePath, giTmpl);
  }

  // Write .env
  const envPath = path.join(root, '.env');
  if (config.apiKey) {
    fs.writeFileSync(envPath, `ANTHROPIC_API_KEY=${config.apiKey}\n`);
  }

  // Create team roles
  if (config.team !== 'custom') {
    const roles = loadTeam(config.team);
    for (const role of roles) {
      const roleDir = path.join(root, 'roles', role.id);
      const skillDir = path.join(root, '.claude', 'skills', role.id);
      const journalDir = path.join(roleDir, 'journal');

      fs.mkdirSync(roleDir, { recursive: true });
      fs.mkdirSync(journalDir, { recursive: true });
      fs.mkdirSync(skillDir, { recursive: true });

      // role.yaml
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

      // profile.md
      const profile = `# ${role.name}\n\n> ${role.persona}\n\n| Item | Value |\n|------|-------|\n| ID | ${role.id} |\n| Level | ${role.level} |\n| Reports To | ${role.reportsTo} |\n`;
      fs.writeFileSync(path.join(roleDir, 'profile.md'), profile);

      // SKILL.md
      const skill = `# ${role.name} Skills\n\nSkill definitions for the ${role.name} role.\n`;
      fs.writeFileSync(path.join(skillDir, 'SKILL.md'), skill);

      // Append to roles.md Hub table
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
  }

  // Hub files for empty directories
  const hubs: Record<string, string> = {
    'projects/projects.md': `# Projects\n\nProject listing for ${config.companyName}.\n\n| Project | Status | Lead |\n|---------|--------|------|\n`,
    'architecture/architecture.md': `# Architecture\n\nTechnical architecture for ${config.companyName}.\n`,
    'knowledge/knowledge.md': `# Knowledge Base\n\nDomain knowledge for ${config.companyName}.\n`,
  };
  for (const [filePath, content] of Object.entries(hubs)) {
    const full = path.join(root, filePath);
    if (!fs.existsSync(full)) {
      fs.writeFileSync(full, content);
    }
  }
}

export async function runInit(args: string[] = []): Promise<void> {
  const useDefaults = args.includes('-y') || args.includes('--yes');
  // Parse --name "Company Name" from args
  const nameIdx = args.indexOf('--name');
  const cliName = nameIdx >= 0 && args[nameIdx + 1] ? args[nameIdx + 1] : '';
  // Parse --template startup|research|agency|custom
  const tmplIdx = args.indexOf('--template');
  const cliTemplate = tmplIdx >= 0 && args[tmplIdx + 1] ? args[tmplIdx + 1] as InitConfig['team'] : '';

  console.log(`
  ┌─────────────────────────────────────────┐
  │                                         │
  │   tycono init                      │
  │   Create your AI company                │
  │                                         │
  └─────────────────────────────────────────┘
`);

  // Check if already initialized
  if (fs.existsSync(path.join(process.cwd(), 'CLAUDE.md'))) {
    if (!useDefaults) {
      const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
      console.log('  A company already exists in this directory (CLAUDE.md found).');
      const overwrite = await ask(rl, 'Overwrite? (y/N)', 'N');
      rl.close();
      if (overwrite.toLowerCase() !== 'y') {
        console.log('  Aborted.');
        return;
      }
    }
  }

  let companyName = cliName || 'My Company';
  let description = 'An AI-powered organization';
  let apiKey = process.env.ANTHROPIC_API_KEY || '';
  const validTeams = ['startup', 'research', 'agency', 'custom'] as const;
  let team: InitConfig['team'] = (cliTemplate && validTeams.includes(cliTemplate as typeof validTeams[number]))
    ? cliTemplate as InitConfig['team']
    : 'startup';

  if (useDefaults) {
    console.log('  Using defaults (-y flag)\n');
    const auth = detectAuth();
    console.log(`  AI Engine: ${auth.message}\n`);
  } else {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });

    // Step 1: Company info
    console.log('  Step 1/4: Company Info\n');
    companyName = await ask(rl, 'Company name', 'My Company');
    description = await ask(rl, 'Description', 'An AI-powered organization');

    // Step 2: Auth detection
    console.log('\n  Step 2/4: AI Engine\n');
    const auth = detectAuth();
    if (auth.engine === 'claude-cli') {
      console.log(`  ✓ ${auth.message}`);
      console.log('  Your AI roles will use Claude Code to execute tasks.\n');
    } else if (auth.engine === 'direct-api') {
      console.log(`  ✓ ${auth.message}\n`);
    } else {
      console.log('  No Claude CLI or API key detected.\n');
      console.log('  Option A: Install Claude Code → https://claude.ai/download');
      console.log('  Option B: Enter an Anthropic API key\n');
      apiKey = await askSecret(rl, 'ANTHROPIC_API_KEY (press Enter to skip)');
    }

    // Step 3: Team template
    console.log('\n  Step 3/4: Team Template\n');
    const teamChoice = await askChoice(rl, 'Select a team template:', [
      'Startup (CTO + PM + Engineer)',
      'Research (Lead Researcher + Analyst + Writer)',
      'Agency (Creative Director + Designer + Developer)',
      'Custom (no pre-built roles)',
    ]);

    const teamMap: Record<string, InitConfig['team']> = {
      'Startup (CTO + PM + Engineer)': 'startup',
      'Research (Lead Researcher + Analyst + Writer)': 'research',
      'Agency (Creative Director + Designer + Developer)': 'agency',
      'Custom (no pre-built roles)': 'custom',
    };
    team = teamMap[teamChoice] ?? 'startup';

    rl.close();
  }

  // Scaffold
  console.log('  Step 4/4: Scaffolding\n');
  console.log(`  Company:  ${companyName}`);
  console.log(`  Template: ${team}`);
  console.log(`  API Key:  ${apiKey ? 'configured' : 'skipped'}`);
  console.log('');

  scaffold({ companyName, description, apiKey, team });

  console.log('  Done! Your AI company is ready.\n');
  console.log('  Next steps:');
  console.log('    1. cd into this directory');
  console.log('    2. Run: npx tycono');
  console.log('    3. Open the dashboard in your browser\n');
}
