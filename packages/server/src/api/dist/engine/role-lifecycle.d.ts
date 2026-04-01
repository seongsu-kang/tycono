import { type RoleSource } from './org-tree.js';
export interface SkillContentDef {
    frontmatter: Record<string, unknown>;
    body: string;
}
export interface SkillExportDef {
    primary: SkillContentDef | null;
    shared: Array<{
        id: string;
    } & SkillContentDef>;
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
export declare class RoleLifecycleManager {
    private companyRoot;
    constructor(companyRoot: string);
    /**
     * Create a new Role: role.yaml + SKILL.md + profile.md + journal/
     */
    createRole(def: RoleDefinition): Promise<void>;
    /**
     * Update an existing Role's definition
     */
    updateRole(id: string, changes: Partial<RoleDefinition>): Promise<void>;
    /**
     * Remove a Role and all its files
     */
    removeRole(id: string): Promise<void>;
    /**
     * Regenerate SKILL.md from role.yaml (Level 1 template)
     */
    regenerateSkill(id: string): Promise<void>;
    /**
     * Validate Role integrity: check all required files exist
     */
    validateRole(id: string): RoleValidationResult;
    /**
     * Validate all roles in the organization
     */
    validateAll(): Map<string, RoleValidationResult>;
    private defToOrgNode;
    private buildRoleYaml;
    private buildProfile;
    private addToRolesHub;
    private removeFromRolesHub;
}
