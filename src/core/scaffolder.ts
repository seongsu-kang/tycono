import { writeFileSync, readFileSync, mkdirSync, existsSync } from 'node:fs';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import yaml from 'js-yaml';
import type { Role } from '../types.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

/* ─── Default Roles ─────────────────────────────── */

const DEFAULT_ROLES: Role[] = [
  {
    id: 'ceo',
    name: 'Chief Executive Officer',
    level: 'c-level',
    reports_to: '-',
    persona: '최종 의사결정자. 비전을 제시하고, 팀을 정렬시킨다.\n조직의 방향과 우선순위를 결정하며, 전략적 판단을 내린다.',
    knowledge: {
      reads: ['company/', 'projects/', 'operations/', 'goals/'],
      writes: ['operations/decisions/', 'goals/'],
    },
    authority: {
      autonomous: ['전략 방향 설정', '의사결정 기록', '조직 정렬'],
      needs_approval: [],
    },
    reports: {
      daily: '핵심 의사결정 + 방향 조정',
      weekly: '전략 리뷰 + OKR 진행률',
    },
  },
  {
    id: 'cto',
    name: 'Chief Technology Officer',
    level: 'c-level',
    reports_to: 'ceo',
    persona: '시니어 소프트웨어 아키텍트. 실용주의자.\n오버엔지니어링을 경계하고, "지금 필요한 최소한"을 추구한다.\n기술 부채를 정량적으로 추적하며, 팀에 명확한 기술 방향을 제시한다.\n큰 방향을 받으면 자율적으로 The Loop를 실행한다 — Knowledge 확인, Task 분해, 의존성 분석 후 독립 태스크를 하위 Role에 병렬 dispatch하고 결과를 취합하여 보고한다. 구현 후 반드시 Knowledge와 Task를 정리한다.',
    knowledge: {
      reads: ['projects/', 'architecture/', 'operations/kpi/'],
      writes: ['architecture/', 'projects/*/technical/'],
    },
    authority: {
      autonomous: ['코드 리뷰 및 피드백', '기술 문서 작성/업데이트', '기술 부채 목록 관리', '개발 환경 설정'],
      needs_approval: ['아키텍처 변경', '신규 기술 스택 도입', '인프라 비용 발생', '외부 서비스 계약'],
    },
    reports: {
      daily: '기술 이슈 + 진행 상황',
      weekly: '기술 부채 현황 + 아키텍처 리스크 + 다음 주 기술 목표',
    },
  },
  {
    id: 'pm',
    name: 'Product Manager',
    level: 'team-lead',
    reports_to: 'cto',
    persona: '사용자 중심 사고. 데이터 기반 의사결정.\n"왜 이걸 만드는가?"를 항상 먼저 묻는다.\n스코프 크리프를 경계하고, MVP를 빠르게 검증하는 것을 최우선으로 한다.\n모든 작업에서 The Loop를 따른다 — 작업 후 반드시 Knowledge 업데이트와 Task 상태 정리를 수행한다.',
    knowledge: {
      reads: ['projects/', 'operations/', 'company/', 'knowledge/'],
      writes: ['projects/*/prd.md', 'projects/*/tasks.md', 'operations/standup/', 'operations/weekly/'],
    },
    authority: {
      autonomous: ['PRD 초안 작성', '백로그 관리 (태스크 생성/정리)', '사용자 리서치 정리', '스탠드업 진행/기록'],
      needs_approval: ['우선순위 대폭 변경', '스코프 변경 (추가/삭제)', '로드맵 수정', '외부 파트너 협업'],
    },
    reports: {
      daily: '프로젝트 진행률 + 블로커 + 오늘의 우선순위',
      weekly: '마일스톤 달성률 + 다음 주 목표 + 리스크',
    },
  },
  {
    id: 'engineer',
    name: 'Software Engineer',
    level: 'member',
    reports_to: 'cto',
    persona: '풀스택 엔지니어. 클린 코드를 추구하되 실용적.\n"동작하는 코드"를 먼저, "완벽한 코드"는 그 다음.\n테스트를 중시하고, PR 단위로 작업한다.\n구현 완료 후 반드시 The Loop ④⑤를 수행한다 — 변경사항을 문서에 반영하고 태스크 상태를 갱신한다.',
    knowledge: {
      reads: ['projects/', 'architecture/'],
      writes: ['projects/*/technical/', 'projects/*/tasks.md'],
    },
    authority: {
      autonomous: ['코드 구현 (할당된 태스크)', '유닛 테스트 작성', '버그 수정', '리팩토링 (소규모)'],
      needs_approval: ['프로덕션 배포', '대규모 리팩토링', '새 의존성 추가', 'DB 스키마 변경'],
    },
    reports: {
      daily: '완료 태스크 + 진행 중 + 블로커',
      weekly: '코드 품질 지표 + 기술 부채 기여분',
    },
  },
];

/* ─── CLAUDE.md Generator (public — tc hire에서도 사용) ─── */

/**
 * CLAUDE.md를 템플릿에서 생성. 100% Tycono 관리 — 유저 데이터 0%.
 * Role/조직 정보는 org-tree.ts가 role.yaml에서 동적 빌드하므로 CLAUDE.md에 포함하지 않음.
 */
export function generateClaudeMd(_name: string, _roles: Role[]): string {
  // Try to load from template file first
  const tmplPath = resolve(__dirname, '../../templates/CLAUDE.md.tmpl');
  if (existsSync(tmplPath)) {
    const tmpl = readFileSync(tmplPath, 'utf-8');
    const version = getPackageVersion();
    return tmpl.replaceAll('{{VERSION}}', version);
  }

  // Fallback: inline minimal template (for when running outside package context)
  return `# Company Rules

> Powered by [Tycono](https://tycono.ai) — AI Company Operating Platform

---

## Task Routing

| Task | Read First | Role |
|------|-----------|------|
| Product planning | \`projects/\` | PM |
| Technical design | \`architecture/\` | CTO |
| Implementation | \`projects/*/tasks.md\` | Engineer |
| Operations | \`operations/\` | PM |

---

## AI Work Rules

### Hub-First Principle

> **Read the relevant Hub document before starting any work.**

### Custom Rules (CRITICAL)

> ⛔ **Before starting work, check if \`.tycono/custom-rules.md\` exists and read it.**

---

<!-- tycono:managed v0.0.0 — This file is managed by Tycono. Do not edit manually. -->
`;
}

function getPackageVersion(): string {
  const pkgPath = resolve(__dirname, '../../package.json');
  try {
    const pkg = JSON.parse(readFileSync(pkgPath, 'utf-8'));
    return pkg.version || '0.0.0';
  } catch {
    return '0.0.0';
  }
}

/* ─── SKILL.md Generator (public — tc hire에서도 사용) ─── */

/**
 * Role용 SKILL.md 생성. tc init, tc hire 모두 동일 퀄리티.
 */
export function generateSkillMd(role: Role, companyName: string): string {
  const autonomous = role.authority.autonomous.map((a) => `- ${a}`).join('\n');
  const needsApproval = role.authority.needs_approval.length > 0
    ? role.authority.needs_approval.map((a) => `- ${a}`).join('\n')
    : '- (없음)';

  return `# ${role.name} Skill

당신은 **${companyName}**의 **${role.name}**입니다.
직급: ${role.level} | 보고 대상: ${role.reports_to}

## Persona

${role.persona}

## 행동 규칙

### 자율 행동 가능
${autonomous}

### CEO 승인 필요
${needsApproval}

## 관리 영역

| 항목 | 경로 |
|------|------|
${role.knowledge.writes.map((w) => `| writes | \`${w}\` |`).join('\n')}
${role.knowledge.reads.map((r) => `| reads | \`${r}\` |`).join('\n')}

## AKB 규칙

- 작업 결과는 반드시 AKB에 기록
- 일일 업무는 \`roles/${role.id}/journal/\`에 기록
- CEO 승인 필요 시 [APPROVAL_NEEDED] 태그 사용
- Hub 문서를 먼저 읽고 기존 가이드를 확인할 것
- 새 문서 생성 전 기존 문서 검색 필수 (겹침 30% 미만일 때만 생성)

## 리포트

- **Daily**: ${role.reports.daily}
- **Weekly**: ${role.reports.weekly}
`;
}

/* ─── roles.md Generator (public) ─── */

export function generateRolesMd(roles: Role[]): string {
  const rows = roles
    .map((r) => `| ${r.name} | ${r.id} | ${r.level} | ${r.reports_to} | Active |`)
    .join('\n');
  return `# Roles

| Role | ID | Level | Reports to | 상태 |
|------|-----|-------|------------|------|
${rows}
`;
}

/* ─── Helpers ───────────────────────────────────── */

function slugify(name: string): string {
  return name.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9가-힣-]/g, '');
}

function write(path: string, content: string): void {
  writeFileSync(path, content, 'utf-8');
}

function mkdir(path: string): void {
  mkdirSync(path, { recursive: true });
}

/* ─── Scaffold (tc init) ────────────────────────── */

export function scaffoldCompany(name: string, targetDir: string): void {
  const roles = DEFAULT_ROLES;
  const today = new Date().toISOString().slice(0, 10);

  // 1. Directories
  const dirs = [
    'company',
    'roles',
    'projects',
    'architecture',
    'operations',
    'operations/standup',
    'operations/weekly',
    'operations/decisions',
    'operations/waves',
    'operations/kpi',
    'goals',
    'knowledge',
    '.claude/skills',
  ];

  for (const role of roles) {
    dirs.push(`roles/${role.id}/journal`);
    dirs.push(`.claude/skills/${role.id}`);
  }

  for (const d of dirs) {
    mkdir(join(targetDir, d));
  }

  // 2. CLAUDE.md (reusable generator — 100% Tycono managed)
  write(join(targetDir, 'CLAUDE.md'), generateClaudeMd(name, roles));

  // 2b. .tycono/rules-version + custom-rules.md
  mkdir(join(targetDir, '.tycono'));
  write(join(targetDir, '.tycono', 'rules-version'), getPackageVersion());
  write(join(targetDir, '.tycono', 'custom-rules.md'), `# Custom Rules\n\n> Company-specific rules, constraints, and processes.\n> This file is owned by you — Tycono will never overwrite it.\n\n<!-- Add your custom rules below -->\n`);

  // 3. .gitignore
  write(join(targetDir, '.gitignore'), 'node_modules/\n.DS_Store\n');

  // 4. Hub documents
  write(
    join(targetDir, 'company', 'company.md'),
    `# ${name}\n\n> 회사 정보\n\n- **설립일**: ${today}\n- **팀**: ${roles.length}명\n`,
  );
  write(
    join(targetDir, 'company', 'budget.md'),
    '# Budget\n\n| 항목 | 금액 | 비고 |\n|------|------|------|\n| AI API | TBD | Claude API |\n',
  );
  write(
    join(targetDir, 'company', 'correction-log.md'),
    '# Correction Log\n\n> CEO 피드백 → 시정 조치 기록. 같은 실수 반복 방지.\n\n'
    + '| 날짜 | CEO 피드백 | 담당 | 시정 조치 | 수정 문서 |\n'
    + '|------|----------|------|---------|----------|\n',
  );

  write(join(targetDir, 'roles', 'roles.md'), generateRolesMd(roles));

  write(
    join(targetDir, 'projects', 'projects.md'),
    `# Projects\n\n아직 프로젝트가 없습니다.\n\n\`\`\`bash\ntc project new "프로젝트명"\n\`\`\`\n`,
  );

  write(
    join(targetDir, 'architecture', 'architecture.md'),
    '# Architecture\n\n> 기술 아키텍처 및 설계\n\nCTO가 정의합니다.\n\n---\n\n*관리: CTO*\n',
  );

  write(
    join(targetDir, 'operations', 'operations.md'),
    `# Operations

> 운영 기록 및 의사결정

## 하위 디렉토리

| 디렉토리 | 내용 |
|----------|------|
| \`standup/\` | 일일 스탠드업 기록 |
| \`weekly/\` | 주간 리포트 |
| \`decisions/\` | CEO 의사결정 로그 |
| \`waves/\` | Wave 디스패치 기록 |
| \`kpi/\` | 성과 지표 |

---

*관리: PM*
`,
  );

  write(
    join(targetDir, 'goals', 'goals.md'),
    '# Goals & OKR\n\nCEO가 목표를 설정하고, C-Level이 Key Results를 정의합니다.\n\n'
    + '## Current OKR\n\n_(아직 설정되지 않음. CEO가 방향을 지시하세요.)_\n',
  );

  write(
    join(targetDir, 'knowledge', 'knowledge.md'),
    '# Knowledge\n\n> 도메인 지식 및 학습 자료\n\n---\n\n*관리: 전체*\n',
  );

  // 5. Role files
  for (const role of roles) {
    const roleDir = join(targetDir, 'roles', role.id);

    // role.yaml
    write(
      join(roleDir, 'role.yaml'),
      yaml.dump(role, { lineWidth: -1, noRefs: true }),
    );

    // profile.md
    write(
      join(roleDir, 'profile.md'),
      `# ${role.name}\n\n**ID**: \`${role.id}\` | **Level**: ${role.level} | **Reports to**: ${role.reports_to}\n\n## Persona\n\n${role.persona}\n`,
    );

    // SKILL.md (reusable generator)
    write(
      join(targetDir, '.claude', 'skills', role.id, 'SKILL.md'),
      generateSkillMd(role, name),
    );
  }
}
