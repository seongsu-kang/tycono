/**
 * Backward-compatibility re-export from execution-manager.
 * All consumers should migrate to importing from execution-manager.ts directly.
 */
export {
  executionManager as jobManager,
  executionManager,
  type Execution as Job,
  type Execution,
  type StartExecutionParams as StartJobParams,
  type StartExecutionParams,
  type ExecStatus,
  type ExecType,
  canTransition,
  messageStatusToRoleStatus,
} from './execution-manager.js';
