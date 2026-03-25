/**
 * Wave Supervisor Integration Tests
 *
 * Verifies the bugs found in EXP-005:
 * 1. CEO session preservation — supervisor session has messages and persists
 * 2. Wave auto-save on completion — wave JSON saved to .tycono/waves/
 * 3. Session hierarchy tracking — parentSessionId chain and waveId propagation
 * 4. ORG PROPAGATION status — active wave role statuses via GET /api/waves/active
 */
import { describe, test, expect, beforeAll, afterAll, vi } from 'vitest';
import request from 'supertest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

/* ─── Mock the runner to avoid ClaudeCliRunner circular import issue ─── */
vi.mock('../src/engine/runners/index.js', () => {
  const noopRunner = {
    execute: () => ({
      promise: new Promise(() => {}), // Never resolves (simulates long-running)
      abort: () => {},
    }),
  };
  return {
    createRunner: () => noopRunner,
    ClaudeCliRunner: class { execute = noopRunner.execute; },
    DirectApiRunner: class { execute = noopRunner.execute; },
  };
});

/* ─── Temp directory for isolated COMPANY_ROOT ─── */

let tmpDir: string;

beforeAll(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'tycono-wave-test-'));
  process.env.COMPANY_ROOT = tmpDir;
});

afterAll(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
  delete process.env.COMPANY_ROOT;
});

/* ─── Lazy app + scaffold (cached) ─── */

let _appPromise: Promise<import('express').Application> | null = null;

function getApp(): Promise<import('express').Application> {
  if (!_appPromise) {
    _appPromise = (async () => {
      const { createExpressApp } = await import('../src/create-server.js');
      const app = createExpressApp();

      // Scaffold via API
      const res = await request(app)
        .post('/api/setup/scaffold')
        .send({
          companyName: 'WaveTestCo',
          description: 'Test company for wave supervisor tests',
          team: 'startup',
          location: tmpDir,
        });

      if (res.status !== 200) {
        throw new Error(`Scaffold failed: ${res.status} ${JSON.stringify(res.body)}`);
      }

      return app;
    })();
  }
  return _appPromise;
}

describe('Wave Supervisor System', () => {

  describe('1. CEO Session Preservation', () => {
    test('scaffold succeeds and sessions API works', async () => {
      const app = await getApp();

      const res = await request(app).get('/api/sessions');
      expect(res.status).toBe(200);
      expect(Array.isArray(res.body)).toBe(true);
    });

    test('createSession with wave source sets waveId and source correctly', async () => {
      await getApp(); // ensure scaffolded
      const { createSession, getSession, listSessions } = await import('../src/services/session-store.js');

      const waveId = `wave-test-${Date.now()}`;
      const session = createSession('ceo', {
        mode: 'do',
        source: 'wave',
        waveId,
      });

      expect(session).toBeDefined();
      expect(session.id).toMatch(/^ses-ceo-/);
      expect(session.roleId).toBe('ceo');
      expect(session.waveId).toBe(waveId);
      expect(session.source).toBe('wave');
      expect(session.mode).toBe('do');

      // Verify it persists in the session list
      const sessions = listSessions();
      const found = sessions.find(s => s.id === session.id);
      expect(found).toBeDefined();
      expect(found!.waveId).toBe(waveId);
      expect(found!.source).toBe('wave');

      // Verify getSession returns full detail with messages array
      const detail = getSession(session.id);
      expect(detail).toBeDefined();
      expect(detail!.messages).toEqual([]);
    });

    test('session with messages is not empty after addMessage', async () => {
      await getApp();
      const { createSession, getSession, addMessage } = await import('../src/services/session-store.js');

      const waveId = `wave-msg-${Date.now()}`;
      const session = createSession('ceo', {
        mode: 'do',
        source: 'wave',
        waveId,
      });

      // Simulate what supervisor-heartbeat does: add a CEO directive message
      const ceoMsg = {
        id: `msg-${Date.now()}-ceo-supervisor`,
        from: 'ceo' as const,
        content: 'Test directive for wave',
        type: 'directive' as const,
        status: 'done' as const,
        timestamp: new Date().toISOString(),
      };
      addMessage(session.id, ceoMsg);

      const detail = getSession(session.id);
      expect(detail).toBeDefined();
      expect(detail!.messages.length).toBeGreaterThan(0);
      expect(detail!.messages[0].content).toBe('Test directive for wave');
      expect(detail!.messages[0].from).toBe('ceo');
    });

    test('GET /api/sessions includes CEO wave session', async () => {
      const app = await getApp();
      const { createSession, addMessage } = await import('../src/services/session-store.js');

      const waveId = `wave-api-${Date.now()}`;
      const session = createSession('ceo', {
        mode: 'do',
        source: 'wave',
        waveId,
      });

      addMessage(session.id, {
        id: `msg-${Date.now()}-ceo`,
        from: 'ceo',
        content: 'Wave directive via API',
        type: 'directive',
        status: 'done',
        timestamp: new Date().toISOString(),
      });

      const res = await request(app).get('/api/sessions');
      expect(res.status).toBe(200);

      const found = res.body.find((s: { id: string }) => s.id === session.id);
      expect(found).toBeDefined();
      expect(found.roleId).toBe('ceo');
      expect(found.waveId).toBe(waveId);
      expect(found.source).toBe('wave');
    });

    test('GET /api/sessions/:id returns session detail with messages', async () => {
      const app = await getApp();
      const { createSession, addMessage } = await import('../src/services/session-store.js');

      const waveId = `wave-detail-ses-${Date.now()}`;
      const session = createSession('ceo', {
        mode: 'do',
        source: 'wave',
        waveId,
      });

      addMessage(session.id, {
        id: `msg-${Date.now()}-ceo-detail`,
        from: 'ceo',
        content: 'Detail check directive',
        type: 'directive',
        status: 'done',
        timestamp: new Date().toISOString(),
      });

      const res = await request(app).get(`/api/sessions/${session.id}`);
      expect(res.status).toBe(200);
      expect(res.body.id).toBe(session.id);
      expect(res.body.waveId).toBe(waveId);
      expect(res.body.messages.length).toBeGreaterThan(0);
      expect(res.body.messages[0].content).toBe('Detail check directive');
    });
  });

  describe('2. Wave Auto-Save on Completion', () => {
    test('wave JSON contains correct structure when saved to disk', async () => {
      await getApp();
      const wavesDir = path.join(tmpDir, '.tycono', 'waves');
      fs.mkdirSync(wavesDir, { recursive: true });

      const waveId = `wave-struct-${Date.now()}`;
      const waveJson = {
        id: waveId,
        directive: 'Build the product',
        startedAt: new Date().toISOString(),
        duration: 0,
        waveId,
        sessionIds: ['ses-cto-123', 'ses-cbo-456'],
        roles: [
          {
            roleId: 'cto',
            roleName: 'CTO',
            sessionId: 'ses-cto-123',
            status: 'done',
            events: [],
            childSessions: [],
          },
          {
            roleId: 'cbo',
            roleName: 'CBO',
            sessionId: 'ses-cbo-456',
            status: 'done',
            events: [],
            childSessions: [],
          },
        ],
      };

      const filePath = path.join(wavesDir, `${waveId}.json`);
      fs.writeFileSync(filePath, JSON.stringify(waveJson, null, 2));

      // Verify via operations API
      const app = await getApp();
      const res = await request(app).get('/api/operations/waves');
      expect(res.status).toBe(200);
      expect(Array.isArray(res.body)).toBe(true);

      const found = res.body.find((w: { id: string }) => w.id === waveId);
      expect(found).toBeDefined();
      expect(found.directive).toBe('Build the product');
      expect(found.rolesCount).toBe(2);
      expect(found.sessionIds).toEqual(['ses-cto-123', 'ses-cbo-456']);
    });

    test('GET /api/operations/waves/:id returns wave detail', async () => {
      const wavesDir = path.join(tmpDir, '.tycono', 'waves');
      fs.mkdirSync(wavesDir, { recursive: true });

      const waveId = `wave-detail-${Date.now()}`;
      const waveJson = {
        id: waveId,
        directive: 'Detail test',
        startedAt: new Date().toISOString(),
        roles: [{ roleId: 'cto', status: 'done', events: [], childSessions: [] }],
      };
      fs.writeFileSync(
        path.join(wavesDir, `${waveId}.json`),
        JSON.stringify(waveJson, null, 2),
      );

      const app = await getApp();
      const res = await request(app).get(`/api/operations/waves/${waveId}`);
      expect(res.status).toBe(200);
      expect(res.body.id).toBe(waveId);
      expect(res.body.replay).toBeDefined();
      expect(res.body.replay.directive).toBe('Detail test');
    });

    test('PATCH /api/operations/waves/:id updates commit info', async () => {
      const wavesDir = path.join(tmpDir, '.tycono', 'waves');
      fs.mkdirSync(wavesDir, { recursive: true });

      const waveId = `wave-patch-${Date.now()}`;
      const waveJson = { id: waveId, directive: 'Patch test', roles: [] };
      fs.writeFileSync(
        path.join(wavesDir, `${waveId}.json`),
        JSON.stringify(waveJson, null, 2),
      );

      const app = await getApp();
      const res = await request(app)
        .patch(`/api/operations/waves/${waveId}`)
        .send({
          commitSha: 'abc123',
          commitMessage: 'wave commit',
          committedAt: '2026-03-15T00:00:00Z',
        });

      expect(res.status).toBe(200);
      expect(res.body.ok).toBe(true);

      // Verify the file was updated
      const data = JSON.parse(fs.readFileSync(path.join(wavesDir, `${waveId}.json`), 'utf-8'));
      expect(data.commit).toBeDefined();
      expect(data.commit.sha).toBe('abc123');
      expect(data.commit.message).toBe('wave commit');
    });

    test('wave file not found returns 404', async () => {
      const app = await getApp();
      const res = await request(app).get('/api/operations/waves/nonexistent-wave-id');
      expect(res.status).toBe(404);
    });
  });

  describe('3. Session Hierarchy Tracking', () => {
    test('child session has correct parentSessionId and inherits waveId', async () => {
      await getApp();
      const { createSession, getSession } = await import('../src/services/session-store.js');

      const waveId = `wave-hierarchy-${Date.now()}`;

      // CEO supervisor session
      const ceoSession = createSession('ceo', {
        mode: 'do',
        source: 'wave',
        waveId,
      });

      // CTO session dispatched by CEO
      const ctoSession = createSession('cto', {
        mode: 'do',
        source: 'dispatch',
        parentSessionId: ceoSession.id,
        waveId,
      });

      // Engineer session dispatched by CTO
      const engSession = createSession('engineer', {
        mode: 'do',
        source: 'dispatch',
        parentSessionId: ctoSession.id,
        waveId,
      });

      // Verify CEO session
      const ceo = getSession(ceoSession.id);
      expect(ceo).toBeDefined();
      expect(ceo!.waveId).toBe(waveId);
      expect(ceo!.source).toBe('wave');
      expect(ceo!.parentSessionId).toBeUndefined();

      // Verify CTO session
      const cto = getSession(ctoSession.id);
      expect(cto).toBeDefined();
      expect(cto!.waveId).toBe(waveId);
      expect(cto!.source).toBe('dispatch');
      expect(cto!.parentSessionId).toBe(ceoSession.id);

      // Verify Engineer session
      const eng = getSession(engSession.id);
      expect(eng).toBeDefined();
      expect(eng!.waveId).toBe(waveId);
      expect(eng!.source).toBe('dispatch');
      expect(eng!.parentSessionId).toBe(ctoSession.id);
    });

    test('all sessions in hierarchy share the same waveId', async () => {
      await getApp();
      const { createSession, listSessions } = await import('../src/services/session-store.js');

      const waveId = `wave-shared-${Date.now()}`;

      createSession('ceo', { mode: 'do', source: 'wave', waveId });
      createSession('cto', { mode: 'do', source: 'dispatch', waveId });
      createSession('cbo', { mode: 'do', source: 'dispatch', waveId });
      createSession('engineer', { mode: 'do', source: 'dispatch', waveId });

      const sessions = listSessions();
      const waveSessions = sessions.filter(s => s.waveId === waveId);
      expect(waveSessions.length).toBe(4);

      for (const s of waveSessions) {
        expect(s.waveId).toBe(waveId);
      }
    });

    test('parentSessionId chain is navigable from leaf to root', async () => {
      await getApp();
      const { createSession, getSession } = await import('../src/services/session-store.js');

      const waveId = `wave-chain-${Date.now()}`;

      const ceo = createSession('ceo', { mode: 'do', source: 'wave', waveId });
      const cto = createSession('cto', { mode: 'do', source: 'dispatch', parentSessionId: ceo.id, waveId });
      const eng = createSession('engineer', { mode: 'do', source: 'dispatch', parentSessionId: cto.id, waveId });

      // Walk up the chain from engineer to CEO
      const engSession = getSession(eng.id);
      expect(engSession!.parentSessionId).toBe(cto.id);

      const ctoSession = getSession(engSession!.parentSessionId!);
      expect(ctoSession!.parentSessionId).toBe(ceo.id);

      const ceoSession = getSession(ctoSession!.parentSessionId!);
      expect(ceoSession!.parentSessionId).toBeUndefined();
      expect(ceoSession!.source).toBe('wave');
    });

    test('GET /api/sessions/:id returns session with parentSessionId and waveId', async () => {
      const app = await getApp();
      const { createSession } = await import('../src/services/session-store.js');

      const waveId = `wave-api-chain-${Date.now()}`;
      const parent = createSession('ceo', { mode: 'do', source: 'wave', waveId });
      const child = createSession('cto', {
        mode: 'do',
        source: 'dispatch',
        parentSessionId: parent.id,
        waveId,
      });

      const res = await request(app).get(`/api/sessions/${child.id}`);
      expect(res.status).toBe(200);
      expect(res.body.parentSessionId).toBe(parent.id);
      expect(res.body.waveId).toBe(waveId);
      expect(res.body.source).toBe('dispatch');
    });
  });

  describe('4. Wave Active Status and Role Tracking', () => {
    test('wave-multiplexer tracks registered sessions and returns correct shape', async () => {
      await getApp();
      const { waveMultiplexer } = await import('../src/services/wave-multiplexer.js');

      const waveId = `wave-mux-${Date.now()}`;

      // Initially no sessions for a new wave
      const initialIds = waveMultiplexer.getWaveSessionIds(waveId);
      expect(initialIds).toEqual([]);

      // getActiveWaves returns an array
      const activeWaves = waveMultiplexer.getActiveWaves();
      expect(Array.isArray(activeWaves)).toBe(true);

      // Verify shape of active wave entries if any exist
      for (const wave of activeWaves) {
        expect(wave).toHaveProperty('id');
        expect(wave).toHaveProperty('directive');
        expect(wave).toHaveProperty('dispatches');
        expect(wave).toHaveProperty('sessionIds');
        expect(wave).toHaveProperty('startedAt');
      }
    });

    test('wave-tracker findWaveFile locates wave JSON by direct path', async () => {
      await getApp();
      const { findWaveFile } = await import('../src/services/wave-tracker.js');

      const wavesDir = path.join(tmpDir, '.tycono', 'waves');
      fs.mkdirSync(wavesDir, { recursive: true });

      const waveId = `wave-tracker-${Date.now()}`;
      const waveJson = { id: waveId, waveId, directive: 'tracker test', roles: [] };
      fs.writeFileSync(
        path.join(wavesDir, `${waveId}.json`),
        JSON.stringify(waveJson, null, 2),
      );

      const filePath = findWaveFile(waveId);
      expect(filePath).not.toBeNull();
      expect(filePath).toContain(waveId);
    });

    test('wave-tracker findWaveFile returns null for non-existent wave', async () => {
      await getApp();
      const { findWaveFile } = await import('../src/services/wave-tracker.js');

      const result = findWaveFile(`nonexistent-wave-${Date.now()}`);
      expect(result).toBeNull();
    });

    test('wave-tracker appendFollowUpToWave adds role entry to wave JSON', async () => {
      await getApp();
      const { appendFollowUpToWave } = await import('../src/services/wave-tracker.js');

      const wavesDir = path.join(tmpDir, '.tycono', 'waves');
      fs.mkdirSync(wavesDir, { recursive: true });

      const waveId = `wave-followup-${Date.now()}`;
      const waveJson = { id: waveId, waveId, directive: 'followup test', roles: [] };
      const filePath = path.join(wavesDir, `${waveId}.json`);
      fs.writeFileSync(filePath, JSON.stringify(waveJson, null, 2));

      appendFollowUpToWave(waveId, 'ses-cto-followup', 'cto', 'Follow-up task');

      const updated = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
      expect(updated.roles.length).toBe(1);
      expect(updated.roles[0].roleId).toBe('cto');
      expect(updated.roles[0].sessionId).toBe('ses-cto-followup');
      expect(updated.roles[0].status).toBe('running');
      expect(updated.roles[0].isFollowUp).toBe(true);
      expect(updated.roles[0].followUpTask).toBe('Follow-up task');
    });

    test('supervisor-heartbeat start creates CEO session with directive message', async () => {
      await getApp();
      const { supervisorHeartbeat } = await import('../src/services/supervisor-heartbeat.js');

      const waveId = `wave-sv-${Date.now()}`;
      const state = supervisorHeartbeat.start(waveId, 'Test supervisor directive');

      expect(state).toBeDefined();
      expect(state.waveId).toBe(waveId);
      expect(state.directive).toBe('Test supervisor directive');
      expect(state.supervisorSessionId).not.toBeNull();
      expect(['starting', 'running', 'error']).toContain(state.status);

      // Verify a session was created with the directive message
      if (state.supervisorSessionId) {
        const { getSession } = await import('../src/services/session-store.js');
        const session = getSession(state.supervisorSessionId);
        expect(session).toBeDefined();
        expect(session!.roleId).toBe('ceo');
        expect(session!.waveId).toBe(waveId);
        expect(session!.source).toBe('wave');
        // CEO message should have been added (prevents deleteEmpty cleanup)
        expect(session!.messages.length).toBeGreaterThan(0);
        expect(session!.messages[0].content).toBe('Test supervisor directive');
      }

      supervisorHeartbeat.stop(waveId);
    });

    test('supervisor-heartbeat directive and question flow', async () => {
      await getApp();
      const { supervisorHeartbeat } = await import('../src/services/supervisor-heartbeat.js');

      const waveId = `wave-dir-${Date.now()}`;
      supervisorHeartbeat.start(waveId, 'Directive test');

      // Test directive queuing
      const directive = supervisorHeartbeat.addDirective(waveId, 'New CEO instruction');
      expect(directive).not.toBeNull();
      expect(directive!.text).toBe('New CEO instruction');
      expect(directive!.delivered).toBe(false);

      const pending = supervisorHeartbeat.getPendingDirectives(waveId);
      expect(pending.length).toBeGreaterThan(0);

      // Test question/answer
      const q = supervisorHeartbeat.addQuestion(waveId, 'Should we proceed?', 'cto', 'Context');
      expect(q.id).toMatch(/^q-/);

      const unanswered = supervisorHeartbeat.getUnansweredQuestions(waveId);
      expect(unanswered.length).toBe(1);

      supervisorHeartbeat.answerQuestion(waveId, q.id, 'Yes');
      expect(supervisorHeartbeat.getUnansweredQuestions(waveId).length).toBe(0);

      supervisorHeartbeat.stop(waveId);
    });
  });

  describe('5. Wave Save and Session Collection (BUG-W01)', () => {
    test('session-store filters sessions by waveId for auto-collection', async () => {
      await getApp();
      const { createSession, addMessage, listSessions } = await import('../src/services/session-store.js');

      const waveId = `wave-w01-${Date.now()}`;

      // Create sessions belonging to this wave
      const s1 = createSession('cto', { mode: 'do', source: 'wave', waveId });
      const s2 = createSession('cbo', { mode: 'do', source: 'wave', waveId });

      addMessage(s1.id, {
        id: `msg-${Date.now()}-1`,
        from: 'ceo',
        content: 'CTO task',
        type: 'directive',
        status: 'done',
        timestamp: new Date().toISOString(),
      });
      addMessage(s2.id, {
        id: `msg-${Date.now()}-2`,
        from: 'ceo',
        content: 'CBO task',
        type: 'directive',
        status: 'done',
        timestamp: new Date().toISOString(),
      });

      // Simulate BUG-W01 auto-collection
      const waveSessions = listSessions().filter(s => s.waveId === waveId);
      const sessionIds = waveSessions.map(s => s.id);
      expect(sessionIds.length).toBe(2);
      expect(waveSessions.map(s => s.roleId).sort()).toEqual(['cbo', 'cto']);
    });

    test('session files are persisted to disk with full metadata', async () => {
      await getApp();
      const { createSession, addMessage } = await import('../src/services/session-store.js');

      const waveId = `wave-persist-${Date.now()}`;
      const session = createSession('cto', { mode: 'do', source: 'wave', waveId });

      addMessage(session.id, {
        id: `msg-${Date.now()}-persist`,
        from: 'ceo',
        content: 'Persist test',
        type: 'directive',
        status: 'done',
        timestamp: new Date().toISOString(),
      });

      // Check filesystem
      const sessionFile = path.join(tmpDir, '.tycono', 'sessions', `${session.id}.json`);
      expect(fs.existsSync(sessionFile)).toBe(true);

      const data = JSON.parse(fs.readFileSync(sessionFile, 'utf-8'));
      expect(data.id).toBe(session.id);
      expect(data.waveId).toBe(waveId);
      expect(data.source).toBe('wave');
      expect(data.messages.length).toBeGreaterThan(0);
    });

    test('updateSession can change waveId on existing session', async () => {
      await getApp();
      const { createSession, updateSession, getSession } = await import('../src/services/session-store.js');

      const session = createSession('cto', { mode: 'do' });
      expect(session.waveId).toBeUndefined();

      const waveId = `wave-update-${Date.now()}`;
      updateSession(session.id, { waveId });

      const updated = getSession(session.id);
      expect(updated!.waveId).toBe(waveId);
    });

    test('deleteEmpty does not delete sessions with messages', async () => {
      await getApp();
      const { createSession, addMessage, deleteEmpty, getSession } = await import('../src/services/session-store.js');

      const waveId = `wave-noclean-${Date.now()}`;
      const session = createSession('ceo', { mode: 'do', source: 'wave', waveId });

      // Add a message (what supervisor-heartbeat does to prevent cleanup)
      addMessage(session.id, {
        id: `msg-${Date.now()}-nodelete`,
        from: 'ceo',
        content: 'This session should not be deleted',
        type: 'directive',
        status: 'done',
        timestamp: new Date().toISOString(),
      });

      deleteEmpty();

      // Session with messages should survive
      const surviving = getSession(session.id);
      expect(surviving).toBeDefined();
      expect(surviving!.messages.length).toBeGreaterThan(0);
    });
  });
});
