import type { OrgNode } from './org-tree.js';
/**
 * Level 1: 템플릿 기반 SKILL.md 자동 생성
 *
 * role.yaml 데이터를 기반으로 SKILL.md 골격을 생성한다.
 * Level 2 (AI 보강)는 Agent Runtime 완성 후 추가.
 */
export declare function generateSkillMd(node: OrgNode): string;
