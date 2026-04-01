import fs from 'node:fs';
import path from 'node:path';
import YAML from 'yaml';
import { buildOrgTree, type OrgNode, type OrgTree, type RoleSource } from './org-tree.js';
import { generateSkillMd } from './skill-template.js';

/* ─── Types ──────────────────────────────────── */

export interface SkillContentDef {
  frontmatter: Record<string, unknown>;
  body: string;
}

export interface SkillExportDef {
  primary: SkillContentDef | null;
  shared: Array<{ id: string } & SkillContentDef>;
}

export interface RoleDefinition {
  id: string;
  name: string;
  level: 'c-level' | 'member';
  reportsTo: string;
  persona: string;
  skills?: string[];
  source?: RoleSource;
  skillContent?: SkillExportDef;
  authority: {
    autonomous: string[];
    needsApproval: string[];
  };
  knowledge: {
    reads: string[];
    writes: string[];
  };
  reports: {
    daily: string;
    weekly: string;
  };
}

export interface RoleValidationResult {
  valid: boolean;
  issues: Array<{
    severity: 'error' | 'warning';
    message: string;
    file: string;
  }>;
}

/* ─── Role Lifecycle Manager ─────────────────── */

export class RoleLifecycleManager {
  constructor(private companyRoot: string) {}

  /**
   * Create a new Role: role.yaml + SKILL.md + profile.md + journal/
   */
  async createRole(def: RoleDefinition): Promise<void> {
    const roleDir = path.join(this.companyRoot, 'knowledge', 'roles', def.id);
    const skillDir = path.join(this.companyRoot, '.claude', 'skills', def.id);
    const journalDir = path.join(roleDir, 'journal');

    // 1. Create directories
    fs.mkdirSync(roleDir, { recursive: true });
    fs.mkdirSync(journalDir, { recursive: true });
    fs.mkdirSync(skillDir, { recursive: true });

    // 2. Write role.yaml
    const yamlContent = this.buildRoleYaml(def);
    fs.writeFileSync(path.join(roleDir, 'role.yaml'), yamlContent);

    // 3. Write profile.md
    const profileContent = this.buildProfile(def);
    fs.writeFileSync(path.join(roleDir, 'profile.md'), profileContent);

    // 4. Generate SKILL.md (Level 1 template)
    const orgNode = this.defToOrgNode(def);
    const skillContent = generateSkillMd(orgNode);
    fs.writeFileSync(path.join(skillDir, 'SKILL.md'), skillContent);

    // 4b. Store에서 온 skillContent가 있으면 덮어쓰기
    if (def.skillContent?.primary) {
      const content = serializeSkillMd(def.skillContent.primary);
      fs.writeFileSync(path.join(skillDir, 'SKILL.md'), content);
    }

    // 4c. Shared skills 설치 (이미 있으면 건너뜀)
    if (def.skillContent?.shared) {
      for (const shared of def.skillContent.shared) {
        const sharedDir = path.join(this.companyRoot, '.claude', 'skills', '_shared', shared.id);
        const sharedSkillPath = path.join(sharedDir, 'SKILL.md');
        if (!fs.existsSync(sharedSkillPath)) {
          fs.mkdirSync(sharedDir, { recursive: true });
          fs.writeFileSync(sharedSkillPath, serializeSkillMd(shared));
        }
      }
    }

    // 5. Update roles.md Hub
    this.addToRolesHub(def);
  }

  /**
   * Update an existing Role's definition
   */
  async updateRole(id: string, changes: Partial<RoleDefinition>): Promise<void> {
    const yamlPath = path.join(this.companyRoot, 'knowledge', 'roles', id, 'role.yaml');
    if (!fs.existsSync(yamlPath)) {
      throw new Error(`Role not found: ${id}`);
    }

    // Read current
    const current = YAML.parse(fs.readFileSync(yamlPath, 'utf-8')) as Record<string, unknown>;

    // Apply changes
    if (changes.name !== undefined) current.name = changes.name;
    if (changes.level !== undefined) current.level = changes.level;
    if (changes.reportsTo !== undefined) current.reports_to = changes.reportsTo;
    if (changes.persona !== undefined) current.persona = changes.persona;
    if (changes.skills !== undefined) current.skills = changes.skills;
    if (changes.authority !== undefined) {
      current.authority = {
        autonomous: changes.authority.autonomous,
        needs_approval: changes.authority.needsApproval,
      };
    }
    if (changes.knowledge !== undefined) {
      current.knowledge = {
        reads: changes.knowledge.reads,
        writes: changes.knowledge.writes,
      };
    }
    if (changes.reports !== undefined) {
      current.reports = changes.reports;
    }
    if (changes.source !== undefined) {
      current.source = changes.source;
    }

    fs.writeFileSync(yamlPath, YAML.stringify(current));
  }

  /**
   * Remove a Role and all its files
   */
  async removeRole(id: string): Promise<void> {
    const roleDir = path.join(this.companyRoot, 'knowledge', 'roles', id);
    const skillDir = path.join(this.companyRoot, '.claude', 'skills', id);

    if (fs.existsSync(roleDir)) {
      fs.rmSync(roleDir, { recursive: true });
    }
    if (fs.existsSync(skillDir)) {
      fs.rmSync(skillDir, { recursive: true });
    }

    // Remove from roles.md Hub
    this.removeFromRolesHub(id);
  }

  /**
   * Regenerate SKILL.md from role.yaml (Level 1 template)
   */
  async regenerateSkill(id: string): Promise<void> {
    const tree = buildOrgTree(this.companyRoot);
    const node = tree.nodes.get(id);
    if (!node) throw new Error(`Role not found in org tree: ${id}`);

    const skillDir = path.join(this.companyRoot, '.claude', 'skills', id);
    fs.mkdirSync(skillDir, { recursive: true });

    const skillContent = generateSkillMd(node);
    fs.writeFileSync(path.join(skillDir, 'SKILL.md'), skillContent);
  }

  /**
   * Validate Role integrity: check all required files exist
   */
  validateRole(id: string): RoleValidationResult {
    const issues: RoleValidationResult['issues'] = [];

    const roleDir = path.join(this.companyRoot, 'knowledge', 'roles', id);
    const yamlPath = path.join(roleDir, 'role.yaml');
    const profilePath = path.join(roleDir, 'profile.md');
    const journalDir = path.join(roleDir, 'journal');
    const skillPath = path.join(this.companyRoot, '.claude', 'skills', id, 'SKILL.md');

    if (!fs.existsSync(yamlPath)) {
      issues.push({ severity: 'error', message: 'role.yaml missing', file: yamlPath });
    }

    if (!fs.existsSync(skillPath)) {
      issues.push({ severity: 'error', message: 'SKILL.md missing', file: skillPath });
    }

    if (!fs.existsSync(profilePath)) {
      issues.push({ severity: 'warning', message: 'profile.md missing', file: profilePath });
    }

    if (!fs.existsSync(journalDir)) {
      issues.push({ severity: 'warning', message: 'journal/ directory missing', file: journalDir });
    }

    // Check role.yaml has required fields
    if (fs.existsSync(yamlPath)) {
      try {
        const raw = YAML.parse(fs.readFileSync(yamlPath, 'utf-8')) as Record<string, unknown>;
        if (!raw.id) issues.push({ severity: 'error', message: 'role.yaml missing "id" field', file: yamlPath });
        if (!raw.name) issues.push({ severity: 'error', message: 'role.yaml missing "name" field', file: yamlPath });
        if (!raw.reports_to) issues.push({ severity: 'warning', message: 'role.yaml missing "reports_to" field', file: yamlPath });
        if (!raw.persona) issues.push({ severity: 'warning', message: 'role.yaml missing "persona" field', file: yamlPath });
      } catch {
        issues.push({ severity: 'error', message: 'role.yaml is not valid YAML', file: yamlPath });
      }
    }

    return { valid: issues.filter((i) => i.severity === 'error').length === 0, issues };
  }

  /**
   * Validate all roles in the organization
   */
  validateAll(): Map<string, RoleValidationResult> {
    const results = new Map<string, RoleValidationResult>();
    const rolesDir = path.join(this.companyRoot, 'knowledge', 'roles');

    if (!fs.existsSync(rolesDir)) return results;

    const entries = fs.readdirSync(rolesDir, { withFileTypes: true });
    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      if (entry.name === 'roles.md') continue; // Hub file, not a role dir

      const yamlPath = path.join(rolesDir, entry.name, 'role.yaml');
      if (fs.existsSync(yamlPath)) {
        results.set(entry.name, this.validateRole(entry.name));
      }
    }

    return results;
  }

  /* ─── Private helpers ──────────────────────── */

  private defToOrgNode(def: RoleDefinition): OrgNode {
    return {
      id: def.id,
      name: def.name,
      level: def.level,
      reportsTo: def.reportsTo,
      children: [],
      persona: def.persona,
      authority: {
        autonomous: def.authority.autonomous,
        needsApproval: def.authority.needsApproval,
      },
      knowledge: {
        reads: def.knowledge.reads,
        writes: def.knowledge.writes,
      },
      reports: def.reports,
      skills: def.skills,
      source: def.source,
    };
  }

  private buildRoleYaml(def: RoleDefinition): string {
    const obj: Record<string, unknown> = {
      id: def.id,
      name: def.name,
      level: def.level,
      reports_to: def.reportsTo,
      persona: def.persona,
    };
    if (def.skills?.length) {
      obj.skills = def.skills;
    }
    if (def.source) {
      obj.source = def.source;
    }
    obj.authority = {
      autonomous: def.authority.autonomous,
      needs_approval: def.authority.needsApproval,
    };
    obj.knowledge = {
      reads: def.knowledge.reads,
      writes: def.knowledge.writes,
    };
    obj.reports = def.reports;
    return YAML.stringify(obj);
  }

  private buildProfile(def: RoleDefinition): string {
    return `# ${def.name}

> ${def.persona.trim().split('\n')[0]}

## 기본 정보

| 항목 | 내용 |
|------|------|
| ID | ${def.id} |
| 직급 | ${def.level} |
| 보고 대상 | ${def.reportsTo} |

## Persona

${def.persona}

## Authority

### 자율
${def.authority.autonomous.map((a) => `- ${a}`).join('\n')}

### 승인 필요
${def.authority.needsApproval.map((a) => `- ${a}`).join('\n')}
`;
  }

  private addToRolesHub(def: RoleDefinition): void {
    const hubPath = path.join(this.companyRoot, 'knowledge', 'roles', 'roles.md');
    if (!fs.existsSync(hubPath)) return;

    const content = fs.readFileSync(hubPath, 'utf-8');
    if (content.includes(`| ${def.id} |`)) {
      return; // Already exists
    }

    const row = `| ${def.name} | ${def.id} | ${def.level} | ${def.reportsTo} | Active |`;
    const updatedContent = content.trimEnd() + '\n' + row + '\n';
    fs.writeFileSync(hubPath, updatedContent);
  }

  private removeFromRolesHub(id: string): void {
    const hubPath = path.join(this.companyRoot, 'knowledge', 'roles', 'roles.md');
    if (!fs.existsSync(hubPath)) return;

    const content = fs.readFileSync(hubPath, 'utf-8');
    const lines = content.split('\n').filter((line) => {
      if (!line.includes('|')) return true;
      const cells = line.split('|').map((c) => c.trim());
      return !cells.some((c) => c === id);
    });
    fs.writeFileSync(hubPath, lines.join('\n'));
  }

}

/* ─── Helpers ──────────────────────────────── */

function serializeSkillMd(skill: SkillContentDef): string {
  const fm = skill.frontmatter;
  const yamlLines: string[] = [];
  if (fm.name) yamlLines.push(`name: ${fm.name}`);
  if (fm.description) yamlLines.push(`description: ${JSON.stringify(fm.description)}`);
  if (fm.allowedTools && Array.isArray(fm.allowedTools)) {
    yamlLines.push(`allowedTools:\n${(fm.allowedTools as string[]).map(t => `  - ${t}`).join('\n')}`);
  }
  if (fm.model) yamlLines.push(`model: ${fm.model}`);
  if (fm.tags && Array.isArray(fm.tags)) {
    yamlLines.push(`tags:\n${(fm.tags as string[]).map(t => `  - ${t}`).join('\n')}`);
  }

  if (yamlLines.length === 0) {
    return skill.body;
  }
  return `---\n${yamlLines.join('\n')}\n---\n\n${skill.body}`;
}
