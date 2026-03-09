import type { OrgTree } from '../org-tree.js';

/* ─── Runner Interface ──────────────────────── */

/**
 * Execution Runner 추상화.
 *
 * 현재 구현:
 *   - claude-cli: Claude Code CLI (`claude -p`) 기반 — 구독으로 비용 부담 없음
 *   - direct-api: Anthropic API 직접 호출 — 향후 전환용
 *
 * EXECUTION_ENGINE 환경변수로 전환 (기본값: claude-cli)
 */

/* ─── Attachment Types ────────────────────────── */

export interface ImageAttachment {
  type: 'image';
  data: string;      // base64 encoded
  name: string;
  mediaType: 'image/png' | 'image/jpeg' | 'image/gif' | 'image/webp';
}

/* ─── Config ──────────────────────────────────── */

export type TeamStatus = Record<string, { status: string; task?: string }>;

export interface RunnerConfig {
  companyRoot: string;
  roleId: string;
  task: string;
  sourceRole: string;
  orgTree: OrgTree;
  readOnly?: boolean;
  maxTurns?: number;
  model?: string;
  jobId?: string;
  teamStatus?: TeamStatus;
  attachments?: ImageAttachment[];
}

/* ─── Callbacks ───────────────────────────────── */

export interface RunnerCallbacks {
  onText?: (text: string) => void;
  onThinking?: (text: string) => void;
  onToolUse?: (tool: string, input?: Record<string, unknown>) => void;
  onDispatch?: (roleId: string, task: string) => void;
  onConsult?: (roleId: string, question: string) => void;
  onTurnComplete?: (turn: number) => void;
  onError?: (error: string) => void;
}

/* ─── Result ──────────────────────────────────── */

export interface RunnerResult {
  output: string;
  turns: number;
  totalTokens: { input: number; output: number };
  toolCalls: Array<{ name: string; input?: Record<string, unknown> }>;
  dispatches: Array<{ roleId: string; task: string; result?: string }>;
}

/* ─── Handle (for abort support) ──────────────── */

export interface RunnerHandle {
  promise: Promise<RunnerResult>;
  abort: () => void;
}

/* ─── Runner Interface ────────────────────────── */

export interface ExecutionRunner {
  execute(config: RunnerConfig, callbacks: RunnerCallbacks): RunnerHandle;
}
