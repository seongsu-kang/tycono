/**
 * Backward-compatibility re-export from execution-manager.
 * All consumers should migrate to importing from execution-manager.ts directly.
 */
export { executionManager as jobManager, executionManager, canTransition, messageStatusToRoleStatus, } from './execution-manager.js';
