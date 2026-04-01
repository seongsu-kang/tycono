import { type LLMProvider } from './llm-adapter.js';
import { type OrgTree } from './org-tree.js';
import { type TeamStatus } from './context-assembler.js';
import { type TokenLedger } from '../services/token-ledger.js';
import { type ImageAttachment } from './runners/types.js';
export interface AgentConfig {
    companyRoot: string;
    roleId: string;
    task: string;
    sourceRole: string;
    orgTree: OrgTree;
    readOnly?: boolean;
    maxTurns?: number;
    codeRoot?: string;
    llm?: LLMProvider;
    depth?: number;
    visitedRoles?: Set<string>;
    abortSignal?: AbortSignal;
    teamStatus?: TeamStatus;
    jobId?: string;
    model?: string;
    tokenLedger?: TokenLedger;
    attachments?: ImageAttachment[];
    targetRoles?: string[];
    onText?: (text: string) => void;
    onToolExec?: (name: string, input: Record<string, unknown>) => void;
    onDispatch?: (roleId: string, task: string) => void;
    onConsult?: (roleId: string, question: string) => void;
    onTurnComplete?: (turn: number) => void;
}
export interface AgentResult {
    output: string;
    turns: number;
    totalTokens: {
        input: number;
        output: number;
    };
    toolCalls: Array<{
        name: string;
        input: Record<string, unknown>;
    }>;
    dispatches: Array<{
        roleId: string;
        task: string;
        result: string;
    }>;
}
export declare function runAgentLoop(config: AgentConfig): Promise<AgentResult>;
