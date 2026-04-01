import { type OrgTree } from './org-tree.js';
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
export type TeamStatus = Record<string, {
    status: string;
    task?: string;
}>;
export declare function assembleContext(companyRoot: string, roleId: string, task: string, sourceRole: string, orgTree: OrgTree, options?: {
    teamStatus?: TeamStatus;
    targetRoles?: string[];
}): AssembledContext;
