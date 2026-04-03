export interface Authority {
    autonomous: string[];
    needsApproval: string[];
}
export interface KnowledgeAccess {
    reads: string[];
    writes: string[];
}
export interface RoleSource {
    id: string;
    sync: 'auto' | 'manual' | 'off';
    forked_at?: string;
    upstream_version?: string;
}
export interface HeartbeatConfig {
    enabled: boolean;
    intervalSec: number;
    maxTicks: number;
}
export interface OrgNode {
    id: string;
    name: string;
    level: 'c-level' | 'member';
    reportsTo: string;
    children: string[];
    persona: string;
    authority: Authority;
    knowledge: KnowledgeAccess;
    reports: {
        daily: string;
        weekly: string;
    };
    skills?: string[];
    model?: string;
    source?: RoleSource;
    heartbeat?: HeartbeatConfig;
}
export interface OrgTree {
    root: string;
    nodes: Map<string, OrgNode>;
}
export declare function buildOrgTree(companyRoot: string, presetId?: string): OrgTree;
/** Direct reports */
export declare function getSubordinates(tree: OrgTree, roleId: string): string[];
/** All descendants (recursive) */
export declare function getDescendants(tree: OrgTree, roleId: string): string[];
/** Chain from role up to CEO: [roleId, ..., ceo] */
export declare function getChainOfCommand(tree: OrgTree, roleId: string): string[];
/** Can source dispatch a task to target? */
export declare function canDispatchTo(tree: OrgTree, source: string, target: string): boolean;
/** Can source consult (ask a question to) target? Peers, direct manager, or subordinates. */
export declare function canConsult(tree: OrgTree, source: string, target: string): boolean;
/** Refresh tree (re-read all role.yaml files) */
export declare function refreshOrgTree(companyRoot: string, presetId?: string): OrgTree;
/** Get a human-readable org chart string for context injection */
export declare function formatOrgChart(tree: OrgTree, perspective?: string): string;
