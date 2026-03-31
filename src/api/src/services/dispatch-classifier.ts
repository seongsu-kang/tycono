/**
 * dispatch-classifier.ts — Haiku 기반 dispatch vs amend 판단
 *
 * 같은 wave 내에서 같은 role에 재dispatch 시,
 * Haiku가 "follow-up(amend)" vs "new scope(dispatch)" 판단.
 * 판단 결과를 JSONL에 기록하여 데이터 축적.
 */
import fs from 'node:fs';
import path from 'node:path';
import { COMPANY_ROOT } from './file-reader.js';
import { readConfig } from './company-config.js';
import { listSessions } from './session-store.js';
import { executionManager } from './execution-manager.js';

/* ─── Types ──────────────────────────── */

export interface DispatchDecision {
  ts: string;
  waveId: string;
  roleId: string;
  sourceRole: string;
  prevTask: string;
  newTask: string;
  prevSessionId: string;
  decision: 'amend' | 'new';
  reason: string;
  haiku: boolean;
}

/* ─── Haiku Classification ────────────── */

const CLASSIFY_SYSTEM = `You are a dispatch classifier for an AI team orchestration system.

Given a previous task and a new task for the SAME role in the SAME wave, decide:
- A = AMEND (follow-up on same work — fix, refine, iterate on previous output)
- N = NEW (genuinely different scope — unrelated to previous work)

Examples:
- prev: "fix token mapping", new: "Critic found bug in token mapping, fix it" → A
- prev: "build grid system", new: "add sound effects" → N
- prev: "implement battle system", new: "QA found bugs in battle, fix" → A
- prev: "write API endpoints", new: "design database schema" → N

Reply with ONLY "A" or "N".`;

export async function classifyDispatch(
  prevTask: string,
  newTask: string,
): Promise<'amend' | 'new'> {
  try {
    const config = readConfig(COMPANY_ROOT);
    const engine = config.engine || process.env.EXECUTION_ENGINE || 'claude-cli';

    const userMsg = `Previous task: ${prevTask.slice(0, 300)}\nNew task: ${newTask.slice(0, 300)}`;

    if (engine === 'claude-cli') {
      const { ClaudeCliProvider } = await import('../engine/llm-adapter.js');
      const provider = new ClaudeCliProvider({ model: 'claude-haiku-4-5-20251001' });
      const response = await provider.chat(CLASSIFY_SYSTEM, [{ role: 'user', content: userMsg }]);
      const textBlock = response.content.find((c) => c.type === 'text') as { type: 'text'; text: string } | undefined;
      const reply = textBlock?.text?.trim() ?? '';
      return reply === 'A' ? 'amend' : 'new';
    } else if (process.env.ANTHROPIC_API_KEY) {
      const Anthropic = (await import('@anthropic-ai/sdk')).default;
      const client = new Anthropic();
      const response = await client.messages.create({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 1,
        system: CLASSIFY_SYSTEM,
        messages: [{ role: 'user', content: userMsg }],
      });
      const reply = (response.content[0] as { type: 'text'; text: string }).text.trim();
      return reply === 'A' ? 'amend' : 'new';
    }
  } catch (err) {
    console.warn('[DispatchClassifier] Haiku classification failed, defaulting to new:', err);
  }
  return 'new'; // fallback: 판단 불가 시 안전하게 새 dispatch
}

/* ─── Previous Session Finder ─────────── */

export interface PrevSessionInfo {
  sessionId: string;
  task: string;
  cliSessionId?: string;
}

/**
 * 같은 wave 내에서 같은 role의 가장 최근 done 세션을 찾는다.
 */
export function findPrevDoneSession(waveId: string, roleId: string): PrevSessionInfo | null {
  // execution-manager에서 done 상태 세션 검색
  const sessions = listSessions().filter(
    s => s.waveId === waveId && s.roleId === roleId && s.status === 'closed',
  );

  if (sessions.length === 0) return null;

  // 가장 최근 세션
  const latest = sessions[sessions.length - 1];

  // execution에서 task와 cliSessionId 가져오기
  const exec = executionManager.getCompletedExecution(latest.id);

  return {
    sessionId: latest.id,
    task: exec?.task ?? '',
    cliSessionId: exec?.cliSessionId,
  };
}

/* ─── Decision Logger ─────────────────── */

function logDecision(decision: DispatchDecision): void {
  const logDir = path.join(COMPANY_ROOT, '.tycono');
  const logPath = path.join(logDir, 'dispatch-decisions.jsonl');
  try {
    fs.mkdirSync(logDir, { recursive: true });
    fs.appendFileSync(logPath, JSON.stringify(decision) + '\n');
  } catch {
    // Non-critical — don't crash on log failure
  }
}

/* ─── Main Decision Function ──────────── */

export interface AutoAmendResult {
  action: 'amend' | 'new';
  prevSessionId?: string;
  reason: string;
}

/**
 * dispatch 요청 시 auto-amend 여부를 판단한다.
 *
 * 조건:
 * 1. waveId가 있어야 함 (wave 내 dispatch만)
 * 2. 같은 role의 이전 done 세션이 있어야 함
 * 3. 이전 세션이 error가 아니어야 함
 * 4. 이전 세션이 현재 running이 아니어야 함 (병렬 dispatch 보호)
 * 5. Haiku가 "follow-up"이라 판단해야 함
 */
export async function decideDispatchOrAmend(
  waveId: string | undefined,
  roleId: string,
  sourceRole: string,
  newTask: string,
): Promise<AutoAmendResult> {
  // No wave context → always new dispatch
  if (!waveId) {
    return { action: 'new', reason: 'no-wave-context' };
  }

  // Find previous done session for same role in same wave
  const prev = findPrevDoneSession(waveId, roleId);
  if (!prev) {
    return { action: 'new', reason: 'no-prev-session' };
  }

  // Check if there's a currently running session for this role (parallel dispatch protection)
  // Check execution-level status for running (session status 'active' means has active execution)
  const running = listSessions().find(
    s => s.waveId === waveId && s.roleId === roleId && s.status === 'active',
  );
  if (running) {
    return { action: 'new', reason: 'prev-session-running' };
  }

  // Haiku classification
  const classification = await classifyDispatch(prev.task, newTask);

  const decision: DispatchDecision = {
    ts: new Date().toISOString(),
    waveId,
    roleId,
    sourceRole,
    prevTask: prev.task.slice(0, 200),
    newTask: newTask.slice(0, 200),
    prevSessionId: prev.sessionId,
    decision: classification,
    reason: classification === 'amend' ? 'haiku-follow-up' : 'haiku-new-scope',
    haiku: true,
  };
  logDecision(decision);

  console.log(`[AutoAmend] ${roleId}: ${classification.toUpperCase()} (prev=${prev.sessionId}, reason=${decision.reason})`);

  return {
    action: classification,
    prevSessionId: classification === 'amend' ? prev.sessionId : undefined,
    reason: decision.reason,
  };
}
