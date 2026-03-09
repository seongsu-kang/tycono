// Context Engine — public API
export { buildOrgTree, canDispatchTo, canConsult, getSubordinates, getDescendants, getChainOfCommand, formatOrgChart, refreshOrgTree } from './org-tree.js';
export type { OrgTree, OrgNode, Authority, KnowledgeAccess } from './org-tree.js';

export { assembleContext } from './context-assembler.js';
export type { AssembledContext } from './context-assembler.js';

export { validateDispatch, validateConsult, validateWrite, validateRead } from './authority-validator.js';
export type { AuthResult } from './authority-validator.js';

export { RoleLifecycleManager } from './role-lifecycle.js';
export type { RoleDefinition, RoleValidationResult } from './role-lifecycle.js';

export { generateSkillMd } from './skill-template.js';

export { AnthropicProvider, LLMAdapter } from './llm-adapter.js';
export type { LLMProvider, ToolDefinition, ToolCall, ToolResult, LLMResponse, LLMMessage } from './llm-adapter.js';

export { runAgentLoop } from './agent-loop.js';
export type { AgentConfig, AgentResult } from './agent-loop.js';

export { getToolsForRole } from './tools/definitions.js';
export { executeTool } from './tools/executor.js';

// Runner abstraction
export { createRunner, ClaudeCliRunner, DirectApiRunner } from './runners/index.js';
export type { ExecutionRunner, RunnerConfig, RunnerCallbacks, RunnerHandle, RunnerResult } from './runners/index.js';
