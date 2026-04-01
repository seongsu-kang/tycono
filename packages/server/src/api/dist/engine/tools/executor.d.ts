import type { ToolCall, ToolResult } from '../llm-adapter.js';
import type { OrgTree } from '../org-tree.js';
export interface ToolExecutorOptions {
    companyRoot: string;
    roleId: string;
    orgTree: OrgTree;
    codeRoot?: string;
    onDispatch?: (roleId: string, task: string) => Promise<string>;
    onConsult?: (roleId: string, question: string) => Promise<string>;
    onToolExec?: (name: string, input: Record<string, unknown>) => void;
}
export declare function executeTool(toolCall: ToolCall, options: ToolExecutorOptions): Promise<ToolResult>;
