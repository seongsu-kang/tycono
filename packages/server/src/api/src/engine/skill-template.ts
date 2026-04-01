import type { OrgNode } from './org-tree.js';

/**
 * Level 1: 템플릿 기반 SKILL.md 자동 생성
 *
 * role.yaml 데이터를 기반으로 SKILL.md 골격을 생성한다.
 * Level 2 (AI 보강)는 Agent Runtime 완성 후 추가.
 */
export function generateSkillMd(node: OrgNode): string {
  const approvalTarget = node.reportsTo || 'CEO';

  const autonomousRows = node.authority.autonomous
    .map((a) => `| ${a} | ✅ | |`)
    .join('\n');

  const approvalRows = node.authority.needsApproval
    .map((a) => `| ${a} | | ⚠️ ${approvalTarget} 승인 |`)
    .join('\n');

  const readPaths = node.knowledge.reads
    .map((p) => `| 읽기 | \`${p}\` |`)
    .join('\n');

  const writePaths = node.knowledge.writes
    .map((p) => `| 쓰기 | \`${p}\` |`)
    .join('\n');

  const coreMaxim = extractMaxim(node.persona);

  return `# ${node.name} Skill

---
name: ${node.id}
description: |
  ${node.persona.trim().split('\n')[0]}
allowed-tools: [Read, Write, Edit, Glob, Grep, Bash]
---

> "${coreMaxim}"

## 핵심 책임

| 영역 | 자율 | 승인 필요 |
|------|------|-----------|
${autonomousRows}
${approvalRows}

---

## 작업 프로세스

### 작업 수신 시

\`\`\`
1. 관련 Hub 문서 읽기
2. 기존 문서/코드 확인 (grep 키워드 3개+)
3. 작업 수행
4. 결과 기록 (저널 + AKB)
5. ${approvalTarget} 승인 필요 사항은 [APPROVAL_NEEDED] 태그
\`\`\`

---

## 핵심 파일 경로

| 용도 | 경로 |
|------|------|
${readPaths}
${writePaths}
| 저널 | \`roles/${node.id}/journal/\` |

---

## 저널 작성

작업 완료 후 \`roles/${node.id}/journal/YYYY-MM-DD.md\`:

\`\`\`markdown
# ${node.name} Journal — YYYY-MM-DD

### {작업 제목}

#### 완료 사항
1. ...

#### [APPROVAL_NEEDED] (있는 경우)
- ...

#### 생성/수정 파일
| 파일 | 작업 |
|------|------|
\`\`\`

---

## 보고 규칙

- **일일**: ${node.reports.daily || '완료 사항 + 진행 중 + 블로커'}
- **주간**: ${node.reports.weekly || '주간 성과 + 다음 주 목표'}

---

## Equipped Skills

${node.skills?.length ? node.skills.map((s) => `- \`${s}\` — see \`.claude/skills/_shared/${s}/SKILL.md\``).join('\n') : '- (none)'}

---

## AKB 규칙

- 작업 결과는 반드시 AKB에 기록
- 일일 업무는 \`roles/${node.id}/journal/\`에 기록
- ${approvalTarget} 승인 필요 시 [APPROVAL_NEEDED] 태그 사용
- 새 문서 생성 시 관련 Hub에 등록 필수

---

## 핵심 원칙

> "작업 전에 Hub 문서를 먼저 읽어라. 이미 있는 것을 다시 만들지 마라."

> "모든 작업에는 기록이 남아야 한다. 기록 없는 작업은 없었던 것이다."
`;
}

function extractMaxim(persona: string): string {
  // Try to find a quoted phrase in persona
  const quoted = persona.match(/"([^"]+)"/);
  if (quoted) return quoted[1];

  // Otherwise use the first sentence
  const firstSentence = persona.trim().split(/[.。]/)[0];
  return firstSentence.trim();
}
