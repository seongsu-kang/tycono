import fs from 'node:fs';
import path from 'node:path';
import { readPreferences } from '../services/preferences.js';
import { readConfig } from '../services/company-config.js';
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
export type TeamStatus = Record<string, { status: string; task?: string }>;

export function assembleContext(
  companyRoot: string,
  roleId: string,
  task: string,
  sourceRole: string,
  orgTree: OrgTree,
  options?: { teamStatus?: TeamStatus },
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

  // 6. SKILL.md (Role-specific + equipped shared skills)
  const skillContent = loadSkillMd(companyRoot, roleId);
  if (skillContent) {
    sections.push('# Skills & Tools\n\n' + skillContent);
  }

  // 6b. Shared Skills (from role.yaml skills field)
  const sharedSkills = loadSharedSkills(companyRoot, node.skills);
  if (sharedSkills) {
    sections.push('# Equipped Skills\n\n' + sharedSkills);
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

  // 9. Code Root (코드 프로젝트 경로)
  const config = readConfig(companyRoot);
  if (config.codeRoot) {
    sections.push(`# Code Project\n\nThe code repository is located at: \`${config.codeRoot}\`\nUse this path when working with source code (reading, writing, building, testing).`);
  }

  // 10. Task는 별도 필드로 분리
  const subordinates = getSubordinates(orgTree, roleId);

  // Dispatch 도구 안내 (하위 Role이 있는 경우)
  if (subordinates.length > 0) {
    sections.push(buildDispatchSection(orgTree, roleId, subordinates, options?.teamStatus));
  }

  // Language preference
  const prefs = readPreferences(companyRoot);
  const lang = prefs.language ?? 'auto';
  if (lang !== 'auto') {
    const langNames: Record<string, string> = { en: 'English', ko: 'Korean', ja: 'Japanese' };
    sections.push(`# Language\n\nAlways respond in **${langNames[lang] ?? lang}**. All output — reports, analysis, code comments, status updates — must be in ${langNames[lang] ?? lang}.`);
  }

  // Execution behavior rules (prevents infinite exploration loops in -p mode)
  sections.push(`# Execution Rules (CRITICAL)

## Interpreting Tasks
- A [CEO Wave] is a directive from the CEO. Interpret it based on your role's expertise.
- If the directive is vague, focus on what YOUR ROLE can contribute. Don't try to cover everything.
- Break ambiguous directives into concrete actions within your authority scope.
- If you truly cannot determine what to do, state your interpretation and proceed with it.

## Efficiency
- Read ONLY files directly relevant to your task. Do NOT explore the codebase broadly.
- If a file doesn't exist at the expected path, try at most 2 alternatives, then move on.
- Do NOT use \`find\` or \`ls\` to scan entire directory trees. Use the Project Structure above.
- Never \`sleep\` or poll in loops. If something isn't ready, report it and move on.

## When Stuck
- If you cannot find what you need after 3 search attempts, STOP searching immediately.
- Do NOT retry the same failing command or approach.
- Summarize what you found, what you couldn't find, and deliver your best answer with what you have.

## Output
- Always produce a concrete deliverable: code change, report, analysis, or clear status update.
- End with a brief summary of what you did and any unresolved items.`);

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
  const parts: string[] = [];

  // 1. System rules (CLAUDE.md — Tycono managed)
  const claudeMdPath = path.join(companyRoot, 'CLAUDE.md');
  if (fs.existsSync(claudeMdPath)) {
    parts.push(fs.readFileSync(claudeMdPath, 'utf-8'));
  }

  // 2. User custom rules (.tycono/custom-rules.md — user owned)
  const customPath = path.join(companyRoot, '.tycono', 'custom-rules.md');
  if (fs.existsSync(customPath)) {
    const custom = fs.readFileSync(customPath, 'utf-8').trim();
    if (custom) {
      parts.push('---\n\n## Company Custom Rules\n\n' + custom);
    }
  }

  // 3. Company info (company/company.md — user owned)
  const companyMdPath = path.join(companyRoot, 'company', 'company.md');
  if (fs.existsSync(companyMdPath)) {
    const companyInfo = fs.readFileSync(companyMdPath, 'utf-8').trim();
    if (companyInfo) {
      parts.push('---\n\n## Company Info\n\n' + companyInfo);
    }
  }

  return parts.length > 0 ? parts.join('\n\n') : null;
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

  const hasKnowledgeWrite = node.knowledge.writes.some((p) =>
    p === '*' || p.startsWith('knowledge') || p === 'knowledge/*'
  );

  return `# Knowledge Scope

## Readable Paths
${reads || '- None'}

## Writable Paths
${writes || '- None'}

Only access files within your knowledge scope. For information outside your scope, ask your manager.${hasKnowledgeWrite ? `

## Knowledge Base 문서 작성 규칙

보고서, 분석 결과, 리서치 등 **공유 가치가 있는 문서**는 반드시 \`knowledge/\` 디렉토리에 작성하세요.

\`\`\`yaml
---
title: "문서 제목"
akb_type: node
status: active
tags: ["tag1", "tag2"]
domain: tech|market|process|strategy|financial|competitor|general
---
\`\`\`

- 파일 경로: \`knowledge/{category}/{filename}.md\`
- 반드시 위 YAML frontmatter를 포함할 것
- journal/에는 일지만, knowledge/에는 공유 문서를 작성` : ''}`;
}

function loadSkillMd(companyRoot: string, roleId: string): string | null {
  const skillPath = path.join(companyRoot, '.claude', 'skills', roleId, 'SKILL.md');
  if (!fs.existsSync(skillPath)) return null;
  return fs.readFileSync(skillPath, 'utf-8');
}

function loadSharedSkills(companyRoot: string, skillIds?: string[]): string | null {
  if (!skillIds?.length) return null;

  const sections: string[] = [];
  for (const skillId of skillIds) {
    const skillPath = path.join(companyRoot, '.claude', 'skills', '_shared', skillId, 'SKILL.md');
    if (!fs.existsSync(skillPath)) continue;
    const content = fs.readFileSync(skillPath, 'utf-8');
    // Extract just the key sections (skip frontmatter)
    const body = content.replace(/^---[\s\S]*?---\n*/, '').trim();
    sections.push(`## [Skill: ${skillId}]\n\n${body}`);
  }

  return sections.length > 0 ? sections.join('\n\n---\n\n') : null;
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

function buildDispatchSection(orgTree: OrgTree, roleId: string, subordinates: string[], teamStatus?: TeamStatus): string {
  const subInfo = subordinates.map((id) => {
    const sub = orgTree.nodes.get(id);
    const base = sub ? `- **${sub.name}** (\`${id}\`): ${sub.persona.split('\n')[0]}` : `- ${id}`;
    const st = teamStatus?.[id];
    if (st && st.status === 'working') {
      const taskHint = st.task ? `: "${st.task.slice(0, 60)}"` : '';
      return `${base} — **Working**${taskHint}`;
    }
    return `${base} — Idle`;
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
