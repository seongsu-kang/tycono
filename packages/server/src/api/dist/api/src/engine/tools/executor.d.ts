import type { ToolCall, ToolResult } from '../llm-adapter.js';
import type { OrgTree } from '../org-tree.js';
export interface ToolExecutorOptions {
    companyRoot: string;
    roleId: string;
    orgTree: OrgTree;
    codeRoot?: string;
    sessionId?: string;
    onDispatch?: (roleId: string, task: string) => Promise<string>;
    onConsult?: (roleId: string, question: string) => Promise<string>;
    onToolExec?: (name: string, input: Record<string, unknown>) => void;
    /** For supervision: abort a running session */
    onAbortSession?: (sessionId: string) => boolean;
    /** For supervision: amend a running session with new instructions */
    onAmendSession?: (sessionId: string, instruction: string) => boolean;
}
export declare function executeTool(toolCall: ToolCall, options: ToolExecutorOptions): Promise<ToolResult>;
