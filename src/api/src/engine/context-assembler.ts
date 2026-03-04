import fs from 'node:fs';
import path from 'node:path';
import {
  type OrgTree,
  type OrgNode,
  getSubordinates,
  getChainOfCommand,
  formatOrgChart,
} from './org-tree.js';

/* ─── Types ──────────────────────────────────── */

export interface AssembledContext {
  systemPrompt: string;
  task: string;
  sourceRole: string;
  targetRole: string;
  metadata: {
    orgPath: string[];
    knowledgeScope: string[];
    authorityLevel: string;
    subordinates: string[];
  };
}

/* ─── Context Assembly ───────────────────────── */

/**
 * 9단계 시스템 프롬프트 조립 파이프라인
 *
 * 1. CLAUDE.md (전사 규칙)
 * 2. Org Context (현재 조직도, 이 Role의 위치)
 * 3. Role Persona
 * 4. Authority Rules
 * 5. Knowledge Scope
 * 6. SKILL.md
 * 7. Hub Docs (라우팅 테이블의 "먼저 읽기" 경로)
 * 8. CEO Decisions (전사 공지 — Approved 결정만)
 * 9. Task
 */
export function assembleContext(
  companyRoot: string,
  roleId: string,
  task: string,
  sourceRole: string,
  orgTree: OrgTree,
): AssembledContext {
  const node = orgTree.nodes.get(roleId);
  if (!node) {
    throw new Error(`Role not found in org tree: ${roleId}`);
  }

  const sections: string[] = [];

  // 1. CLAUDE.md (전사 규칙 — 축약)
  const companyRules = loadCompanyRules(companyRoot);
  if (companyRules) {
    sections.push('# Company Rules\n\n' + companyRules);
  }

  // 2. Org Context
  sections.push(buildOrgContextSection(orgTree, node));

  // 3. Role Persona
  sections.push(buildPersonaSection(node));

  // 4. Authority Rules
  sections.push(buildAuthoritySection(node));

  // 5. Knowledge Scope
  sections.push(buildKnowledgeSection(node));

  // 6. SKILL.md
  const skillContent = loadSkillMd(companyRoot, roleId);
  if (skillContent) {
    sections.push('# Skills & Tools\n\n' + skillContent);
  }

  // 7. Hub Docs (요약)
  const hubSummary = loadHubSummaries(companyRoot, node);
  if (hubSummary) {
    sections.push('# Reference Documents\n\n' + hubSummary);
  }

  // 8. CEO Decisions (전사 공지)
  const ceoDecisions = loadCeoDecisions(companyRoot);
  if (ceoDecisions) {
    sections.push('# CEO Decisions (전사 공지)\n\n' + ceoDecisions);
  }

  // 9. Task는 별도 필드로 분리
  const subordinates = getSubordinates(orgTree, roleId);

  // Dispatch 도구 안내 (하위 Role이 있는 경우)
  if (subordinates.length > 0) {
    sections.push(buildDispatchSection(orgTree, roleId, subordinates));
  }

  const systemPrompt = sections.join('\n\n---\n\n');

  return {
    systemPrompt,
    task,
    sourceRole,
    targetRole: roleId,
    metadata: {
      orgPath: getChainOfCommand(orgTree, roleId),
      knowledgeScope: [...node.knowledge.reads, ...node.knowledge.writes],
      authorityLevel: node.level,
      subordinates,
    },
  };
}

/* ─── Section Builders ───────────────────────── */

function loadCompanyRules(companyRoot: string): string | null {
  const claudeMdPath = path.join(companyRoot, 'CLAUDE.md');
  if (!fs.existsSync(claudeMdPath)) return null;

  const content = fs.readFileSync(claudeMdPath, 'utf-8');

  // Extract key sections: AI 작업 규칙, AKB 관리
  // We keep it focused on operational rules, not the full CLAUDE.md
  const sections: string[] = [];

  // Extract AKB rules section
  const akbMatch = content.match(/### AKB 관리 의무[\s\S]*?(?=\n---|\n## [^#])/);
  if (akbMatch) {
    sections.push(akbMatch[0].trim());
  }

  // Extract Git rules
  const gitMatch = content.match(/### Git 규칙[\s\S]*?(?=\n###|\n---|\n## [^#])/);
  if (gitMatch) {
    sections.push(gitMatch[0].trim());
  }

  return sections.length > 0 ? sections.join('\n\n') : content.slice(0, 2000);
}

function buildOrgContextSection(orgTree: OrgTree, node: OrgNode): string {
  const chart = formatOrgChart(orgTree, node.id);
  const chain = getChainOfCommand(orgTree, node.id);

  return `# Organization

## Org Chart
\`\`\`
${chart}
\`\`\`

## Your Position
- **Role**: ${node.name} (${node.id})
- **Level**: ${node.level}
- **Reports To**: ${node.reportsTo}
- **Chain of Command**: ${chain.join(' → ')}
- **Direct Reports**: ${node.children.length > 0 ? node.children.join(', ') : 'None'}`;
}

function buildPersonaSection(node: OrgNode): string {
  return `# Persona

You are **${node.name}** of this company.

${node.persona}`;
}

function buildAuthoritySection(node: OrgNode): string {
  const autoList = node.authority.autonomous.map((a) => `- ✅ ${a}`).join('\n');
  const approvalList = node.authority.needsApproval.map((a) => `- ⚠️ ${a}`).join('\n');

  return `# Authority

## Autonomous Actions (proceed without approval)
${autoList || '- None defined'}

## Requires Approval from ${node.reportsTo || 'CEO'}
${approvalList || '- None defined'}

**Important**: Actions outside your authority must be tagged with [APPROVAL_NEEDED].`;
}

function buildKnowledgeSection(node: OrgNode): string {
  const reads = node.knowledge.reads.map((p) => `- \`${p}\``).join('\n');
  const writes = node.knowledge.writes.map((p) => `- \`${p}\``).join('\n');

  return `# Knowledge Scope

## Readable Paths
${reads || '- None'}

## Writable Paths
${writes || '- None'}

Only access files within your knowledge scope. For information outside your scope, ask your manager.`;
}

function loadSkillMd(companyRoot: string, roleId: string): string | null {
  const skillPath = path.join(companyRoot, '.claude', 'skills', roleId, 'SKILL.md');
  if (!fs.existsSync(skillPath)) return null;
  return fs.readFileSync(skillPath, 'utf-8');
}

function loadHubSummaries(companyRoot: string, node: OrgNode): string | null {
  const hubPaths = new Set<string>();

  // Determine which hub docs to include based on knowledge scope
  for (const readPath of node.knowledge.reads) {
    const base = readPath.replace(/\*$/, '').replace(/\/$/, '');
    const hubFile = path.join(companyRoot, base, `${path.basename(base)}.md`);
    if (fs.existsSync(hubFile)) {
      hubPaths.add(hubFile);
    }
  }

  if (hubPaths.size === 0) return null;

  const summaries: string[] = [];
  for (const hubPath of hubPaths) {
    const content = fs.readFileSync(hubPath, 'utf-8');
    // Extract TL;DR or first 500 chars
    const tldr = content.match(/## TL;DR[\s\S]*?(?=\n## [^#])/);
    const summary = tldr ? tldr[0] : content.slice(0, 500);
    const relativePath = path.relative(companyRoot, hubPath);
    summaries.push(`### ${relativePath}\n${summary.trim()}`);
  }

  return summaries.join('\n\n');
}

function loadCeoDecisions(companyRoot: string): string | null {
  const decisionsDir = path.join(companyRoot, 'operations', 'decisions');
  if (!fs.existsSync(decisionsDir)) return null;

  const files = fs.readdirSync(decisionsDir)
    .filter((f) => f.endsWith('.md') && f !== 'decisions.md')
    .sort();

  if (files.length === 0) return null;

  const summaries: string[] = [];

  for (const file of files) {
    const content = fs.readFileSync(path.join(decisionsDir, file), 'utf-8');

    // Only include Approved decisions
    const statusMatch = content.match(/>\s*Status:\s*(.+)/i);
    if (!statusMatch || !statusMatch[1].toLowerCase().includes('approved')) continue;

    // Extract title from first heading
    const titleMatch = content.match(/^#\s+(.+)/m);
    const title = titleMatch ? titleMatch[1].trim() : file;

    // Extract Decision section (first paragraph after ## Decision)
    const decisionMatch = content.match(/## Decision\s*\n\n([^\n]+)/);
    const summary = decisionMatch ? decisionMatch[1].trim() : '';

    if (summary) {
      summaries.push(`- **${title}**: ${summary}`);
    } else {
      // Fallback: use first 3 content lines after front matter
      const lines = content.split('\n').filter((l) => l.trim() && !l.startsWith('>') && !l.startsWith('#'));
      summaries.push(`- **${title}**: ${lines.slice(0, 1).join(' ').trim() || '(상세 내용은 파일 참조)'}`);
    }
  }

  if (summaries.length === 0) return null;

  return `아래는 CEO가 승인한 전사 결정 사항입니다. 모든 Role은 이 결정을 인지하고 준수해야 합니다.\n\n${summaries.join('\n')}`;
}

function buildDispatchSection(orgTree: OrgTree, roleId: string, subordinates: string[]): string {
  const subInfo = subordinates.map((id) => {
    const sub = orgTree.nodes.get(id);
    return sub ? `- **${sub.name}** (\`${id}\`): ${sub.persona.split('\n')[0]}` : `- ${id}`;
  }).join('\n');

  const exampleSubId = subordinates[0] ?? 'engineer';

  return `# Dispatch (Team Management)

You can assign tasks to your direct reports. They will execute independently and return results.

## Available Team Members
${subInfo}

## How to Dispatch

**Use Bash to run the dispatch command:**

\`\`\`bash
python3 "$DISPATCH_CMD" ${exampleSubId} "Task description here"
\`\`\`

**IMPORTANT**: Always use \`python3 "$DISPATCH_CMD"\` — this is the ONLY way to dispatch tasks to subordinates.

The command will:
1. Start a job for the subordinate
2. Wait up to ~100 seconds for completion
3. Return the subordinate's output if done, or a job ID to check later

If the subordinate takes longer than 100s, you'll get a job ID. Check the result with:
\`\`\`bash
python3 "$DISPATCH_CMD" --check <jobId>
\`\`\`

## Examples

\`\`\`bash
# Assign a task and wait for result
python3 "$DISPATCH_CMD" ${exampleSubId} "프로젝트 현황을 확인하고 보고서를 작성해"

# Check a previously dispatched job result
python3 "$DISPATCH_CMD" --check job-xxx-123
\`\`\`

## Rules
- Only dispatch to your direct reports listed above
- Include clear task description, acceptance criteria, and relevant file paths
- The dispatched agent will work independently and return results to you
- After receiving results, synthesize and report back`;
}
