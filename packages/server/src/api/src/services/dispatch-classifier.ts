/**
 * dispatch-classifier.ts — Role당 1세션 Invariant
 *
 * Dispatch 시 같은 wave 내 같은 role의 기존 세션을 찾아:
 * - active → amend (기존 세션에 추가 지시)
 * - done → amend (이어서 작업)
 * - error N회 → new (fresh start)
 * - 없음 → new (첫 생성)
 *
 * Haiku classifier 제거 — deterministic 판단.
 * BUG-FORKBOMB: CEO 무한 dispatch 루프 구조적 차단.
 */
import fs from 'node:fs';
import path from 'node:path';
import { COMPANY_ROOT } from './file-reader.js';
import { listSessions } from './session-store.js';
import { executionManager } from './execution-manager.js';

/* ─── Types ──────────────────────────── */

export interface DispatchDecision {
  ts: string;
  waveId: string;
  roleId: string;
  sourceRole: string;
  newTask: string;
  prevSessionId: string;
  decision: 'amend' | 'new';
  reason: string;
}

/* ─── Constants ──────────────────────── */

const ERROR_THRESHOLD = 3; // error 3회 초과 시 fresh session 허용

/* ─── Session Finder ─────────────────── */

export interface PrevSessionInfo {
  sessionId: string;
  task: string;
  status: string;
  cliSessionId?: string;
}

/**
 * 같은 wave 내에서 같은 role의 active 세션을 찾는다.
 */
export function findActiveSession(waveId: string, roleId: string): PrevSessionInfo | null {
  const session = listSessions().find(
    s => s.waveId === waveId && s.roleId === roleId && (s.status === 'active' || s.status === 'awaiting_input'),
  );
  if (!session) return null;

  const exec = executionManager.getActiveExecution(session.id);
  return {
    sessionId: session.id,
    task: exec?.task ?? '',
    status: session.status,
    cliSessionId: exec?.cliSessionId,
  };
}

/**
 * 같은 wave 내에서 같은 role의 가장 최근 done 세션을 찾는다.
 */
export function findPrevDoneSession(waveId: string, roleId: string): PrevSessionInfo | null {
  const sessions = listSessions().filter(
    s => s.waveId === waveId && s.roleId === roleId && (s.status === 'done' || s.status === 'closed'),
  );

  if (sessions.length === 0) return null;

  const latest = sessions[sessions.length - 1];
  const exec = executionManager.getCompletedExecution(latest.id);

  return {
    sessionId: latest.id,
    task: exec?.task ?? '',
    status: latest.status,
    cliSessionId: exec?.cliSessionId,
  };
}

/**
 * 같은 wave 내에서 같은 role의 error 세션 수를 센다.
 */
function countErrorSessions(waveId: string, roleId: string): number {
  return listSessions().filter(
    s => s.waveId === waveId && s.roleId === roleId && s.status === 'error',
  ).length;
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
 * dispatch 요청 시 기존 세션 reuse 여부를 deterministic하게 판단.
 *
 * Role당 1세션 Invariant:
 * 1. active 세션 있음 → amend (대기 후 추가 지시)
 * 2. done 세션 있음 → amend (이어서)
 * 3. error N회 초과 → new (fresh start)
 * 4. 세션 없음 → new (첫 생성)
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

  // 1. Active session → amend (BUG-FORKBOMB fix: 기존에는 'new' 반환하여 fork bomb 유발)
  const active = findActiveSession(waveId, roleId);
  if (active) {
    const decision: DispatchDecision = {
      ts: new Date().toISOString(),
      waveId, roleId, sourceRole, newTask: newTask.slice(0, 200),
      prevSessionId: active.sessionId,
      decision: 'amend', reason: 'role-already-active',
    };
    logDecision(decision);
    console.log(`[Dispatch] ${roleId}: AMEND (active session ${active.sessionId})`);
    return { action: 'amend', prevSessionId: active.sessionId, reason: 'role-already-active' };
  }

  // 2. Done session → amend (이어서 작업)
  const prev = findPrevDoneSession(waveId, roleId);
  if (prev) {
    // 2a. Error threshold 체크: error가 많으면 fresh start
    const errorCount = countErrorSessions(waveId, roleId);
    if (errorCount >= ERROR_THRESHOLD) {
      const decision: DispatchDecision = {
        ts: new Date().toISOString(),
        waveId, roleId, sourceRole, newTask: newTask.slice(0, 200),
        prevSessionId: prev.sessionId,
        decision: 'new', reason: `error-threshold-${errorCount}`,
      };
      logDecision(decision);
      console.log(`[Dispatch] ${roleId}: NEW (${errorCount} errors >= ${ERROR_THRESHOLD} threshold)`);
      return { action: 'new', reason: `error-threshold-${errorCount}` };
    }

    const decision: DispatchDecision = {
      ts: new Date().toISOString(),
      waveId, roleId, sourceRole, newTask: newTask.slice(0, 200),
      prevSessionId: prev.sessionId,
      decision: 'amend', reason: 'prev-session-done',
    };
    logDecision(decision);
    console.log(`[Dispatch] ${roleId}: AMEND (done session ${prev.sessionId})`);
    return { action: 'amend', prevSessionId: prev.sessionId, reason: 'prev-session-done' };
  }

  // 3. No session → new dispatch
  console.log(`[Dispatch] ${roleId}: NEW (first dispatch in wave)`);
  return { action: 'new', reason: 'no-prev-session' };
}
