export interface ScaffoldConfig {
    companyName: string;
    description: string;
    apiKey?: string;
    team: 'startup' | 'research' | 'agency' | 'custom';
    projectRoot: string;
    existingProjectPath?: string;
    knowledgePaths?: string[];
    language?: string;
}
interface TeamRole {
    id: string;
    name: string;
    level: string;
    reportsTo: string;
    persona: string;
    defaultSkills?: string[];
}
export declare function loadTeam(teamName: string): TeamRole[];
export declare function getAvailableTeams(): string[];
export interface SkillToolDef {
    package: string;
    binary: string;
    installCmd: string;
}
export interface SkillMeta {
    id: string;
    name: string;
    description: string;
    version: string;
    author: string;
    tags: string[];
    category: string;
    compatibleRoles: string[];
    dependencies: string[];
    files: string[];
    tools?: SkillToolDef[];
}
/**
 * Get available skills from the template registry
 */
export declare function getAvailableSkills(): SkillMeta[];
/**
 * Collect all tools required by a set of skills
 */
export declare function getRequiredTools(skillIds: string[]): Array<SkillToolDef & {
    skillId: string;
    installed: boolean;
}>;
export interface ToolInstallCallbacks {
    onChecking?: (tool: string) => void;
    onInstalling?: (tool: string) => void;
    onInstalled?: (tool: string) => void;
    onSkipped?: (tool: string, reason: string) => void;
    onError?: (tool: string, error: string) => void;
    onDone?: (stats: {
        installed: number;
        skipped: number;
        failed: number;
    }) => void;
}
/**
 * Install CLI tools required by skills
 */
export declare function installSkillTools(skillIds: string[], callbacks?: ToolInstallCallbacks): void;
export declare function scaffold(config: ScaffoldConfig): string[];
export {};
