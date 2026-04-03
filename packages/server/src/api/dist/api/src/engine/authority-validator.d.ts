import { type OrgTree } from './org-tree.js';
export interface AuthResult {
    allowed: boolean;
    reason: string;
}
/**
 * Validate whether a source role can dispatch a task to a target role.
 * Returns a detailed result with the reason.
 */
export declare function validateDispatch(orgTree: OrgTree, sourceRole: string, targetRole: string): AuthResult;
/**
 * Validate whether a source role can consult (ask a question to) a target role.
 * Allowed: peers (same parent), direct manager, or subordinates.
 */
export declare function validateConsult(orgTree: OrgTree, sourceRole: string, targetRole: string): AuthResult;
/**
 * Validate whether a role can perform a write operation to a given path.
 * Checks the knowledge.writes scope from role.yaml.
 */
export declare function validateWrite(orgTree: OrgTree, roleId: string, filePath: string): AuthResult;
/**
 * Validate whether a role can read a given path.
 */
export declare function validateRead(orgTree: OrgTree, roleId: string, filePath: string): AuthResult;
