import { type OrgTree, canDispatchTo, canConsult, getChainOfCommand } from './org-tree.js';

/* ─── Types ──────────────────────────────────── */

export interface AuthResult {
  allowed: boolean;
  reason: string;
}

/* ─── Validation ─────────────────────────────── */

/**
 * Validate whether a source role can dispatch a task to a target role.
 * Returns a detailed result with the reason.
 */
export function validateDispatch(
  orgTree: OrgTree,
  sourceRole: string,
  targetRole: string,
): AuthResult {
  // Self-dispatch not allowed
  if (sourceRole === targetRole) {
    return { allowed: false, reason: `Cannot dispatch to self (${sourceRole})` };
  }

  // Check source exists
  if (!orgTree.nodes.has(sourceRole) && sourceRole !== 'ceo') {
    return { allowed: false, reason: `Source role not found: ${sourceRole}` };
  }

  // Check target exists
  if (!orgTree.nodes.has(targetRole)) {
    return { allowed: false, reason: `Target role not found: ${targetRole}` };
  }

  // Check authority
  if (!canDispatchTo(orgTree, sourceRole, targetRole)) {
    const sourceChain = getChainOfCommand(orgTree, sourceRole).join(' → ');
    const targetChain = getChainOfCommand(orgTree, targetRole).join(' → ');
    return {
      allowed: false,
      reason: `${sourceRole} has no authority over ${targetRole}. ` +
        `Source chain: ${sourceChain}. Target chain: ${targetChain}.`,
    };
  }

  return { allowed: true, reason: 'Dispatch authorized' };
}

/**
 * Validate whether a source role can consult (ask a question to) a target role.
 * Allowed: peers (same parent), direct manager, or subordinates.
 */
export function validateConsult(
  orgTree: OrgTree,
  sourceRole: string,
  targetRole: string,
): AuthResult {
  if (sourceRole === targetRole) {
    return { allowed: false, reason: `Cannot consult self (${sourceRole})` };
  }

  if (!orgTree.nodes.has(sourceRole) && sourceRole !== 'ceo') {
    return { allowed: false, reason: `Source role not found: ${sourceRole}` };
  }

  if (!orgTree.nodes.has(targetRole)) {
    return { allowed: false, reason: `Target role not found: ${targetRole}` };
  }

  if (!canConsult(orgTree, sourceRole, targetRole)) {
    return {
      allowed: false,
      reason: `${sourceRole} cannot consult ${targetRole}. Only peers (same manager), direct manager, or subordinates are allowed.`,
    };
  }

  return { allowed: true, reason: 'Consult authorized' };
}

/**
 * Validate whether a role can perform a write operation to a given path.
 * Checks the knowledge.writes scope from role.yaml.
 */
export function validateWrite(
  orgTree: OrgTree,
  roleId: string,
  filePath: string,
): AuthResult {
  const node = orgTree.nodes.get(roleId);
  if (!node) {
    return { allowed: false, reason: `Role not found: ${roleId}` };
  }

  // CEO can write anywhere
  if (roleId === 'ceo') {
    return { allowed: true, reason: 'CEO has full write access' };
  }

  // Check if file path matches any write scope
  const normalizedPath = filePath.replace(/^\//, '');
  for (const scope of node.knowledge.writes) {
    const normalizedScope = scope.replace(/\*$/, '').replace(/\/$/, '');
    if (normalizedPath.startsWith(normalizedScope)) {
      return { allowed: true, reason: `Path ${filePath} is within write scope ${scope}` };
    }
  }

  return {
    allowed: false,
    reason: `${roleId} cannot write to ${filePath}. ` +
      `Allowed write paths: ${node.knowledge.writes.join(', ')}`,
  };
}

/**
 * Validate whether a role can read a given path.
 */
export function validateRead(
  orgTree: OrgTree,
  roleId: string,
  filePath: string,
): AuthResult {
  const node = orgTree.nodes.get(roleId);
  if (!node) {
    return { allowed: false, reason: `Role not found: ${roleId}` };
  }

  // CEO can read anywhere
  if (roleId === 'ceo') {
    return { allowed: true, reason: 'CEO has full read access' };
  }

  const normalizedPath = filePath.replace(/^\//, '');
  const allReadable = [...node.knowledge.reads, ...node.knowledge.writes];

  for (const scope of allReadable) {
    const normalizedScope = scope.replace(/\*$/, '').replace(/\/$/, '');
    if (normalizedPath.startsWith(normalizedScope)) {
      return { allowed: true, reason: `Path ${filePath} is within read scope` };
    }
  }

  return {
    allowed: false,
    reason: `${roleId} cannot read ${filePath}. ` +
      `Allowed paths: ${allReadable.join(', ')}`,
  };
}
