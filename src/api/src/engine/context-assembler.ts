import fs from 'node:fs';
import path from 'node:path';
import { readPreferences } from '../services/preferences.js';
import { readConfig, resolveCodeRoot } from '../services/company-config.js';
import {
  type OrgTree,
  type OrgNode,
  getSubordinates,
  getChainOfCommand,
  formatOrgChart,
  canConsult,
} from './org-tree.js';
import { extractKeywords, searchRelatedDocs } from './knowledge-gate.js';

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
export type { TeamStatus } from '../../../shared/types.js';
import { type RoleStatus, type TeamStatus, isRoleActive } from '../../../shared/types.js';

export function assembleContext(
  companyRoot: string,
  roleId: string,
  task: string,
  sourceRole: string,
  orgTree: OrgTree,
  options?: { teamStatus?: TeamStatus; targetRoles?: string[] },
): AssembledContext {
  const node = orgTree.nodes.get(roleId);
  if (!node) {
    throw new Error(`Role not found in org tree: ${roleId}`);
  }

  const sections: string[] = [];

  // 1. Company Rules (CLAUDE.md + custom-rules.md + company.md)
  const companyRules = loadCompanyRules(companyRoot);
  if (companyRules) {
    sections.push(companyRules);
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
  const codeRoot = resolveCodeRoot(companyRoot);
  sections.push(`# Code Project

The code repository is located at: \`${codeRoot}\` (env: $TYCONO_CODE_ROOT)
The AKB (knowledge) directory is at: \`${companyRoot}\` (env: $TYCONO_AKB_ROOT)

Use the code repository path for all source code work (reading, writing, building, testing).

## Git Worktree Rules (CRITICAL)
- Your cwd is already set to the code repository. When creating worktrees, use relative paths or \`$TYCONO_CODE_ROOT\`.
- **NEVER run \`git worktree add\` in \`$TYCONO_AKB_ROOT\`** — the AKB directory is not a code repository.
- Recommended worktree path: \`$TYCONO_CODE_ROOT/.worktrees/{branch-name}\`
- Example: \`git worktree add .worktrees/feature-xyz -b feature/xyz\` (from cwd, which is already code repo)`);

  // 10. Pre-Knowledging: 작업 관련 문서 자동 탐색
  const preKSection = buildPreKnowledgingSection(companyRoot, task);
  if (preKSection) {
    sections.push(preKSection);
  }

  // Task는 별도 필드로 분리
  let subordinates = getSubordinates(orgTree, roleId);

  // Filter subordinates by targetRoles ONLY for CEO (wave dispatch scope)
  // C-Level roles should always see their own subordinates regardless of targetRoles
  if (options?.targetRoles && options.targetRoles.length > 0 && roleId === 'ceo') {
    subordinates = subordinates.filter(id => options.targetRoles!.includes(id));
  }

  // Supervision prompt (SV-11, SV-12: C-Level heartbeat mode)
  const heartbeatEnabled = node.heartbeat?.enabled === true;
  if (heartbeatEnabled && subordinates.length > 0) {
    sections.push(buildSupervisionSection(node));
  }

  // Dispatch 도구 안내 (하위 Role이 있는 경우)
  if (subordinates.length > 0) {
    sections.push(buildDispatchSection(orgTree, roleId, subordinates, options?.teamStatus));
  } else if (node.level === 'c-level') {
    // C-level with no subordinates — clarify authority boundaries
    sections.push(`# Team Structure

⚠️ **You have no direct reports.** You are an individual contributor at the C-level.

- You CANNOT dispatch tasks to other roles (no subordinates)
- You CAN consult other roles for information (see Consult section below)
- You MUST do the work yourself — research, analyze, write, decide
- If implementation requires another role (e.g., engineering work), recommend it to CEO
- Make decisions within your authority autonomously — do NOT ask CEO for decisions you can make yourself`);
  }

  // Consult 도구 안내 (상담 가능한 Role이 있는 경우)
  const consultSection = buildConsultSection(orgTree, roleId);
  if (consultSection) {
    sections.push(consultSection);
  }

  // Language preference (default: English)
  const prefs = readPreferences(companyRoot);
  const lang = prefs.language && prefs.language !== 'auto' ? prefs.language : 'en';
  const langNames: Record<string, string> = { en: 'English', ko: 'Korean (한국어)', ja: 'Japanese (日本語)' };
  const langName = langNames[lang] ?? lang;
  sections.push(`# Language (CRITICAL)

You MUST respond in **${langName}**.

This applies to ALL output without exception:
- Status updates, reports, and analysis
- Journal entries and standup notes
- Decision logs and knowledge documents
- User-facing messages and explanations
- Git commit messages and PR descriptions

Code (variable names, comments in code) may remain in English for readability.
Everything else MUST be in ${langName}.`);

  // Execution behavior rules (prevents infinite exploration loops in -p mode)
  sections.push(`# Execution Rules (CRITICAL)

## Interpreting Tasks
- A [CEO Wave] is a directive from the CEO. Interpret it based on your role's expertise.
- If the directive is vague, focus on what YOUR ROLE can contribute. Don't try to cover everything.
- Break ambiguous directives into concrete actions within your authority scope.
- If you truly cannot determine what to do, state your interpretation and proceed with it.
- **If you have subordinates, your FIRST action should be decomposing the task and dispatching.** Do NOT attempt implementation yourself — delegate to the appropriate team member.
- Review the "Available Team Members" section to understand each subordinate's capabilities before dispatching.

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
- End with a brief summary of what you did and any unresolved items.

## Sub-task Efficiency (when dispatched by a superior)
- Focus ONLY on the assigned task — nothing else.
- Do NOT update journals, knowledge docs, or tasks.md — your superior handles that.
- Do NOT read CLAUDE.md or explore unrelated files — go straight to the target file.
- If tsc/tests fail, fix the specific error. Do NOT refactor surrounding code.

## Commit Rule (when you modify code files)
- After completing code changes, you MUST commit your work.
- Use a descriptive commit message: \`git commit -m "type(scope): description"\`
- Common types: feat, fix, refactor, test, chore
- This ensures your work is not lost in uncommitted changes.
- Do NOT push — just commit locally. Your superior or the system handles push/PR.`);

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

function buildPreKnowledgingSection(companyRoot: string, task: string): string | null {
  // Extract keywords from the task directive
  const keywords = extractKeywords(task);
  if (keywords.length < 2) return null; // Too few keywords to be meaningful

  const related = searchRelatedDocs(companyRoot, keywords);
  if (related.length === 0) return null;

  const docList = related
    .map(doc => `- \`${doc.path}\` — ${doc.preview} (relevance: ${doc.matches})`)
    .join('\n');

  return `# 📚 Pre-Knowledging: Related Documents

The following existing documents are related to this task. **Read relevant ones before starting work** to avoid duplicating knowledge or missing existing context.

${docList}

> **Knowledging Rule**: Check these documents first. If your work produces new knowledge, update existing docs or create new ones with cross-links.`;
}

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
  const node = orgTree.nodes.get(roleId);
  const isCLevel = node?.level === 'c-level';

  const subInfo = subordinates.map((id) => {
    const sub = orgTree.nodes.get(id);
    if (!sub) return `- ${id} — (unknown role)`;

    const lines: string[] = [];

    // Header: name, id, persona summary
    const st = teamStatus?.[id];
    const status = st?.status && isRoleActive(st.status)
      ? `🔴 Working${st.task ? ` — "${st.task.slice(0, 60)}"` : ''}`
      : '🟢 Idle';
    lines.push(`### ${sub.name} (\`${id}\`) — ${status}`);
    lines.push(`> ${sub.persona.split('\n')[0]}`);

    // Level & model
    lines.push(`- **Level**: ${sub.level} | **Model**: ${sub.model ?? 'default'}`);

    // Skills
    if (sub.skills && sub.skills.length > 0) {
      lines.push(`- **Skills**: ${sub.skills.join(', ')}`);
    }

    // Authority — what they can do autonomously
    if (sub.authority.autonomous.length > 0) {
      lines.push(`- **Can do**: ${sub.authority.autonomous.join(', ')}`);
    }

    // Knowledge scope — what they can read/write
    if (sub.knowledge.reads.length > 0) {
      lines.push(`- **Reads**: ${sub.knowledge.reads.join(', ')}`);
    }
    if (sub.knowledge.writes.length > 0) {
      lines.push(`- **Writes**: ${sub.knowledge.writes.join(', ')}`);
    }

    // Their own subordinates (for chain delegation visibility)
    const grandchildren = orgTree.nodes.get(id)?.children ?? [];
    if (grandchildren.length > 0) {
      const gcNames = grandchildren.map(gc => {
        const gcNode = orgTree.nodes.get(gc);
        return gcNode ? `${gcNode.name} (${gc})` : gc;
      });
      lines.push(`- **Their reports**: ${gcNames.join(', ')}`);
    }

    return lines.join('\n');
  }).join('\n\n');

  const exampleSubId = subordinates[0] ?? 'engineer';

  let section = `# Dispatch (Team Management)

⛔ **YOU HAVE SUBORDINATES. YOU MUST USE THEM.**
⛔ **For ANY directive — whether it's "do X", "review Y", or even "what do you think about Z" — dispatch to your team first, THEN synthesize their input into your response.**
⛔ **Reading files and giving your own opinion WITHOUT dispatching is NEVER acceptable when you have a team.**

Even for opinion/analysis requests:
- Dispatch to relevant subordinates: "Analyze X from your perspective and report findings"
- Poll for results → Synthesize their input with your own analysis
- Your value is ORCHESTRATION, not solo work

## Available Team Members
${subInfo}

## How to Dispatch

**Dispatch is async: start a job → poll for result → review → next task.**

\`\`\`bash
# Step 1: Dispatch (returns immediately with job ID)
python3 "$DISPATCH_CMD" ${exampleSubId} "Task description here"

# Step 2: Poll for result (repeat every 10-30s until DONE)
python3 "$DISPATCH_CMD" --check <jobId>
\`\`\`

⛔ **NEVER use the Agent tool or Task tool to spawn sub-agents.** Those bypass the job tracking system. Use ONLY the dispatch command.

### The Pattern: Dispatch → Poll → Review → Next

\`\`\`bash
# 1. Dispatch first task (returns job ID immediately)
python3 "$DISPATCH_CMD" ${exampleSubId} "Task A"
# Output includes: Job ID: job-xxx

# 2. Poll for result (repeat until status is DONE)
python3 "$DISPATCH_CMD" --check job-xxx
# If RUNNING → wait 10-30s → --check again
# If DONE → read the result → proceed to next task

# 3. Dispatch next task
python3 "$DISPATCH_CMD" ${subordinates.length > 1 ? subordinates[1] : exampleSubId} "Task B"
python3 "$DISPATCH_CMD" --check job-yyy
# ... repeat

# 4. Continue until ALL tasks are done
\`\`\`

### --check Status Values
- **RUNNING** — Subordinate still working → poll again in 10-30s
- **DONE** — Task completed, result is printed
- **ERROR** — Task failed (re-dispatch with different instructions or report)
- **AWAITING_INPUT** — Subordinate has a question for you

### ⛔ CRITICAL Rules
- **NEVER re-dispatch the same task.** If --check shows RUNNING, just keep polling.
- **NEVER dispatch and immediately finish.** The dispatch→check→review loop must continue until ALL work is complete.
- **Save the job ID** from each dispatch to use with --check.`;

  // C-level roles get mandatory delegation rules
  if (isCLevel) {
    section += `

## C-Level Delegation Protocol (MANDATORY)

⛔ **You are a MANAGER. You do NOT write code, tests, or implementation yourself.**
⛔ **Your job is to PLAN, DELEGATE, REVIEW, and UPDATE KNOWLEDGE.**

### Core Rule: Always Delegate Down

When you receive a directive:
1. **Analyze** — Break it into sub-tasks appropriate for each subordinate
2. **Dispatch** — Assign tasks to subordinates with clear acceptance criteria
3. **Monitor** — Poll for results, review quality
4. **Verify** — Check git status: did subordinate commit? What files changed?
5. **Follow up** — If output doesn't meet criteria, dispatch back with feedback
6. **Report** — Synthesize results with change summary (files, commits, branch)

### What You Do vs What Subordinates Do

| YOU (C-Level) | SUBORDINATES (Members) |
|---------------|----------------------|
| Plan & decompose tasks | Implement code/design/tests |
| Dispatch with clear specs | Execute and return results |
| Review output quality | Fix issues when told |
| Update knowledge & tasks | Update their own journals |
| Report to superior | Report to you |

### The Supervision Loop (CRITICAL — DO NOT SKIP)

⛔ **You MUST keep running until ALL planned tasks are dispatched, reviewed, and completed.**
⛔ **NEVER dispatch once and stop. That leaves work half-done.**

The loop:
\`\`\`
PLAN TASKS → DISPATCH → POLL (--check) → REVIEW RESULT → DECIDE
                                                           ├── PASS → Next DIFFERENT Task
                                                           └── FAIL → Re-dispatch with SPECIFIC fix
                                                           └── ALL DONE → Update knowledge → Report
\`\`\`

### ⛔ CRITICAL: No Duplicate Dispatch

**NEVER dispatch the same or similar task to the same role twice.**
- If --check shows RUNNING, keep polling — do NOT re-dispatch
- If a subordinate completed a task, accept the result — do NOT re-dispatch
- If the result is unsatisfactory, re-dispatch with SPECIFIC different instructions
- Track dispatched job IDs — never repeat the same task
- After 2 dispatches to the same role, accept the result or report to CEO

**Example: Full supervision session**
\`\`\`bash
# Task 1: Dispatch to engineer
python3 "$DISPATCH_CMD" engineer "Implement feature X. Read tasks.md first."
# → Job ID: job-001

# Poll until done
python3 "$DISPATCH_CMD" --check job-001
# → Status: RUNNING — check again in 10-30s
python3 "$DISPATCH_CMD" --check job-001
# → Status: DONE (result printed)

# Review result... looks good. Task 2 (QA):
python3 "$DISPATCH_CMD" qa "Test feature X that engineer just implemented."
# → Job ID: job-002
python3 "$DISPATCH_CMD" --check job-002
# → Status: DONE — found bugs

# Re-dispatch with SPECIFIC fix:
python3 "$DISPATCH_CMD" engineer "Fix BUG: null check missing in auth.ts line 42"
# → Job ID: job-003
python3 "$DISPATCH_CMD" --check job-003
# → Status: DONE — all good. Update knowledge and report.
\`\`\`

⚠️ Do NOT use curl or other methods to create jobs — always use the dispatch command.

### Dispatch Quality Requirements

Every dispatch MUST include:
- **Context**: What documents/files to read first (CLAUDE.md + relevant Hub + SKILL.md)
- **Task**: Specific deliverable with acceptance criteria
- **Constraints**: File paths, standards, what NOT to do
- **AKB instruction**: "⛔ AKB Rule: Read CLAUDE.md before starting work."

### Anti-Patterns (NEVER do these)

- ❌ **Dispatching once and stopping** — you MUST keep working until directive is complete
- ❌ **Dispatching and NOT polling with --check** — you must poll for results
- ❌ **Re-dispatching when --check shows RUNNING** — just poll again
- ❌ Writing code yourself instead of dispatching to engineer
- ❌ Dispatching without acceptance criteria
- ❌ Accepting output without reviewing it
- ❌ Forgetting to update knowledge/tasks after work completes
- ❌ Doing only 1 dispatch when you should chain multiple (Engineer → QA)
- ❌ Reporting to superior without synthesizing subordinate outputs

### Post-Dispatch Verification (CRITICAL)

After a subordinate completes a code task, you MUST verify the work is preserved:

\`\`\`bash
# 1. Check if subordinate committed their work
git log --oneline -3

# 2. If NOT committed (changes are unstaged), commit on their behalf
git add -A && git commit -m "feat(scope): description of subordinate's work"

# 3. Include in your report to CEO:
#    - What files were changed
#    - Commit hash (if committed)
#    - Whether the changes compile (tsc --noEmit)
\`\`\`

⛔ **Uncommitted work = lost work.** If the subordinate didn't commit, YOU must commit before reporting.
Your final report MUST include a **Change Summary** with files changed and commit status.`;
  } else {
    section += `

## Delegation Rules (MANDATORY)

⛔ **You have subordinates — USE THEM before doing work yourself.**

- **Always dispatch first.** Break the directive into sub-tasks and assign to your team.
- Only do work yourself if NO subordinate can handle it (e.g., cross-cutting decisions).
- Include clear task description, acceptance criteria, and relevant file paths in every dispatch.
- After receiving results, synthesize and report back.
- Your output should reference subordinate findings, not just your own file reads.`;
  }

  return section;
}

function buildSupervisionSection(node: OrgNode): string {
  const hb = node.heartbeat ?? { enabled: true, intervalSec: 120, maxTicks: 60 };
  return `# Supervision Mode (Heartbeat)

⛔ **When you dispatch subordinates, you MUST enter supervision mode using heartbeat_watch.**
⛔ **Do NOT use sleep+curl polling. heartbeat_watch blocks server-side at zero cost.**

## Supervision Protocol

1. **Dispatch** subordinates with clear task descriptions
2. **Call heartbeat_watch** with the returned session IDs:
   \`heartbeat_watch(sessionIds=[...], durationSec=${hb.intervalSec})\`
3. **Analyze the digest** against your plan:
   - On track → call heartbeat_watch again (keep watching)
   - Off track → \`amend_session(sessionId, instruction)\` to course-correct
   - Seriously wrong → \`abort_session(sessionId)\` + re-dispatch with different instructions
   - Need peer input → \`consult(peer_role_id, question)\`
   - All done → compile results and report to your superior
4. **Repeat** heartbeat_watch until all subordinates complete

## Available Supervision Tools

| Tool | When to Use |
|------|-------------|
| \`heartbeat_watch\` | Watch subordinate sessions (blocks ${hb.intervalSec}s, $0 LLM cost) |
| \`amend_session\` | Inject new instructions into a running session |
| \`abort_session\` | Kill a session that's going wrong |
| \`consult\` | Ask a peer C-Level for their perspective |

## Digest Response

heartbeat_watch returns a digest with:
- **Significance score** (0-10): How much attention this tick needs
- **Anomalies**: Errors, stalls (3min+), sessions awaiting input
- **Per-session activity**: What each subordinate has been doing
- **Peer activity** (if peers are also in supervision mode)

Quiet ticks (score 0-1) return a single line: "All N sessions progressing normally."

## Budget

- Max ticks: ${hb.maxTicks} (${Math.round(hb.maxTicks * hb.intervalSec / 60)} minutes total)
- Quiet tick cost: ~$0.001 (minimal LLM analysis)
- Alert tick cost: ~$0.02-0.05 (intervention decision)

## ⛔ Anti-Patterns

- ❌ Using \`bash_execute\` with sleep/curl to poll — use heartbeat_watch instead
- ❌ Calling \`--check\` in a loop — heartbeat_watch handles this automatically
- ❌ Ignoring digest anomalies — always address errors and stalls
- ❌ Not re-watching after a quiet tick — keep the loop going until all done`;
}

function buildConsultSection(orgTree: OrgTree, roleId: string): string | null {
  // Build list of roles this agent can consult
  const consultable: string[] = [];
  for (const [id] of orgTree.nodes) {
    if (id !== roleId && canConsult(orgTree, roleId, id)) {
      consultable.push(id);
    }
  }

  if (consultable.length === 0) return null;

  const roleList = consultable.map((id) => {
    const n = orgTree.nodes.get(id);
    if (!n) return `- \`${id}\``;
    const firstLine = n.persona.split('\n')[0] || n.name;
    return `- **${n.name}** (\`${id}\`): ${firstLine}`;
  }).join('\n');

  return `# Consult (Ask Colleagues)

You can ask questions to other roles using the \`consult\` tool:

${roleList}

## How to Consult

Use the \`consult\` tool:
\`\`\`json
{ "roleId": "designer", "question": "What color scheme are you using for the dashboard?" }
\`\`\`

The consulted role will answer your question in read-only mode and return the response to you.

## When to Use
- Need technical decisions or clarifications from your manager
- Need design/implementation details from a peer
- Need domain expertise from another team member
- Unsure about architecture or conventions — ask before guessing

## Rules
- The consulted role answers in **read-only mode** (no file modifications)
- Keep questions specific and concise for better answers
- Don't consult for tasks that should be dispatched (use dispatch for work assignments)`;
}
