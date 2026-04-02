import { describe, test, expect, vi, beforeEach } from 'vitest';

// Mock session-store before importing dispatch-classifier
const mockSessions: Array<{ id: string; waveId: string; roleId: string; status: string }> = [];

vi.mock('../src/services/session-store.js', () => ({
  listSessions: () => mockSessions,
}));

vi.mock('../src/services/execution-manager.js', () => ({
  executionManager: {
    getActiveExecution: (sessionId: string) => {
      const session = mockSessions.find(s => s.id === sessionId);
      if (!session || session.status !== 'active') return undefined;
      return { sessionId, task: 'previous task', cliSessionId: 'cli-123' };
    },
    getCompletedExecution: (sessionId: string) => {
      const session = mockSessions.find(s => s.id === sessionId);
      if (!session) return undefined;
      return { sessionId, task: 'previous task', cliSessionId: 'cli-123' };
    },
  },
}));

vi.mock('../src/services/file-reader.js', () => ({
  COMPANY_ROOT: '/tmp/test-company',
}));

// Suppress fs operations in logDecision
vi.mock('node:fs', async () => {
  const actual = await vi.importActual('node:fs');
  return {
    ...actual,
    mkdirSync: vi.fn(),
    appendFileSync: vi.fn(),
  };
});

import { decideDispatchOrAmend, findActiveSession, findPrevDoneSession } from '../src/services/dispatch-classifier.js';

describe('Role당 1세션 Invariant (BUG-FORKBOMB)', () => {
  beforeEach(() => {
    mockSessions.length = 0;
  });

  const WAVE = 'wave-test-001';
  const ROLE = 'cto';

  // ─── R3-01: done 세션 재dispatch → amend ─────────

  test('done 세션이 있으면 amend 반환', async () => {
    mockSessions.push({ id: 'ses-cto-001', waveId: WAVE, roleId: ROLE, status: 'done' });

    const result = await decideDispatchOrAmend(WAVE, ROLE, 'ceo', 'Phase 2 진행해');

    expect(result.action).toBe('amend');
    expect(result.prevSessionId).toBe('ses-cto-001');
    expect(result.reason).toBe('prev-session-done');
  });

  // ─── R3-02: active 세션 재dispatch → amend ─────────

  test('active 세션이 있으면 amend 반환 (fork bomb 방지)', async () => {
    mockSessions.push({ id: 'ses-cto-002', waveId: WAVE, roleId: ROLE, status: 'active' });

    const result = await decideDispatchOrAmend(WAVE, ROLE, 'ceo', '추가 작업');

    expect(result.action).toBe('amend');
    expect(result.prevSessionId).toBe('ses-cto-002');
    expect(result.reason).toBe('role-already-active');
  });

  // ─── R3-03: error 3회 → new ─────────

  test('error 3회 이상이면 new 반환 (fresh start)', async () => {
    // done 세션 1개 + error 3개
    mockSessions.push({ id: 'ses-cto-010', waveId: WAVE, roleId: ROLE, status: 'done' });
    mockSessions.push({ id: 'ses-cto-011', waveId: WAVE, roleId: ROLE, status: 'error' });
    mockSessions.push({ id: 'ses-cto-012', waveId: WAVE, roleId: ROLE, status: 'error' });
    mockSessions.push({ id: 'ses-cto-013', waveId: WAVE, roleId: ROLE, status: 'error' });

    const result = await decideDispatchOrAmend(WAVE, ROLE, 'ceo', '다시 시도');

    expect(result.action).toBe('new');
    expect(result.reason).toContain('error-threshold');
  });

  test('error 2회면 아직 amend', async () => {
    mockSessions.push({ id: 'ses-cto-020', waveId: WAVE, roleId: ROLE, status: 'done' });
    mockSessions.push({ id: 'ses-cto-021', waveId: WAVE, roleId: ROLE, status: 'error' });
    mockSessions.push({ id: 'ses-cto-022', waveId: WAVE, roleId: ROLE, status: 'error' });

    const result = await decideDispatchOrAmend(WAVE, ROLE, 'ceo', '다시 시도');

    expect(result.action).toBe('amend');
    expect(result.prevSessionId).toBe('ses-cto-020');
  });

  // ─── R3-04: 세션 없음 → new ─────────

  test('세션 없으면 new 반환 (첫 dispatch)', async () => {
    const result = await decideDispatchOrAmend(WAVE, ROLE, 'ceo', '첫 작업');

    expect(result.action).toBe('new');
    expect(result.reason).toBe('no-prev-session');
  });

  // ─── R3-05: wave context 없으면 new ─────────

  test('waveId 없으면 항상 new', async () => {
    mockSessions.push({ id: 'ses-cto-030', waveId: WAVE, roleId: ROLE, status: 'done' });

    const result = await decideDispatchOrAmend(undefined, ROLE, 'ceo', '작업');

    expect(result.action).toBe('new');
    expect(result.reason).toBe('no-wave-context');
  });

  // ─── findActiveSession ─────────

  test('findActiveSession: active 세션 찾기', () => {
    mockSessions.push({ id: 'ses-eng-001', waveId: WAVE, roleId: 'engineer', status: 'active' });

    const found = findActiveSession(WAVE, 'engineer');
    expect(found).not.toBeNull();
    expect(found!.sessionId).toBe('ses-eng-001');
  });

  test('findActiveSession: 없으면 null', () => {
    const found = findActiveSession(WAVE, 'engineer');
    expect(found).toBeNull();
  });

  // ─── findPrevDoneSession (status='done' 수정 확인) ─────────

  test('findPrevDoneSession: done 상태 찾기', () => {
    mockSessions.push({ id: 'ses-qa-001', waveId: WAVE, roleId: 'qa', status: 'done' });

    const found = findPrevDoneSession(WAVE, 'qa');
    expect(found).not.toBeNull();
    expect(found!.sessionId).toBe('ses-qa-001');
  });

  test('findPrevDoneSession: closed 상태도 찾기', () => {
    mockSessions.push({ id: 'ses-qa-002', waveId: WAVE, roleId: 'qa', status: 'closed' });

    const found = findPrevDoneSession(WAVE, 'qa');
    expect(found).not.toBeNull();
    expect(found!.sessionId).toBe('ses-qa-002');
  });

  // ─── Haiku 미사용 확인 ─────────

  test('Haiku classifier가 호출되지 않음 (deterministic)', async () => {
    mockSessions.push({ id: 'ses-cto-040', waveId: WAVE, roleId: ROLE, status: 'done' });

    // If Haiku were called, it would fail (no API key in test env)
    // The test passing means Haiku is not called
    const result = await decideDispatchOrAmend(WAVE, ROLE, 'ceo', '완전히 다른 새 작업');

    // Even "completely different scope" → amend (no Haiku to say 'new')
    expect(result.action).toBe('amend');
    expect(result.reason).toBe('prev-session-done');
  });

  // ─── 다른 wave의 세션은 영향 없음 ─────────

  test('다른 wave의 세션은 무시', async () => {
    mockSessions.push({ id: 'ses-cto-050', waveId: 'wave-OTHER', roleId: ROLE, status: 'active' });

    const result = await decideDispatchOrAmend(WAVE, ROLE, 'ceo', '작업');

    expect(result.action).toBe('new');
    expect(result.reason).toBe('no-prev-session');
  });
});
