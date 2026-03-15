/**
 * CEO Supervisor Heartbeat Service
 *
 * The "bash while-true loop" equivalent — keeps exactly ONE CEO Supervisor
 * session alive per wave. That session uses dispatch/watch/amend tools
 * like any other supervisor node in the recursive tree.
 *
 * Heartbeat = "CEO Supervisor를 죽지 않게 살려두는 것"
 *
 * Dispatch Protocol Principle 6: 죽어도 세상은 돌아간다
 * - Subordinates keep running during supervisor crash
 * - On restart, digest catches up with all missed events
 */
import { executionManager, type Execution } from './execution-manager.js';
import { createSession, getSession, listSessions, addMessage, type Message } from './session-store.js';
import { buildOrgTree, getSubordinates } from '../engine/org-tree.js';
import { COMPANY_ROOT } from './file-reader.js';
import { ActivityStream } from './activity-stream.js';
import { saveCompletedWave } from './wave-tracker.js';

/* ─── Types ──────────────────────────────────── */

interface SupervisorState {
  waveId: string;
  directive: string;
  targetRoles?: string[];
  supervisorSessionId: string | null;
  executionId: string | null;
  status: 'starting' | 'running' | 'restarting' | 'stopped' | 'error';
  crashCount: number;
  maxCrashRetries: number;
  restartTimer: ReturnType<typeof setTimeout> | null;
  pendingDirectives: PendingDirective[];
  pendingQuestions: PendingQuestion[];
  createdAt: string;
}

export interface PendingDirective {
  id: string;
  text: string;
  createdAt: string;
  delivered: boolean;
}

export interface PendingQuestion {
  id: string;
  question: string;
  fromRole: string;
  context: string;
  createdAt: string;
  answer?: string;
  answeredAt?: string;
}

/* ─── Supervisor Heartbeat Manager ───────────── */

class SupervisorHeartbeat {
  private supervisors = new Map<string, SupervisorState>();

  /**
   * Start a CEO Supervisor for a wave.
   * This creates a supervisor session and starts an execution.
   * If the execution dies, it auto-restarts (heartbeat).
   */
  start(waveId: string, directive: string, targetRoles?: string[]): SupervisorState {
    // Check if supervisor already running for this wave
    const existing = this.supervisors.get(waveId);
    if (existing && (existing.status === 'running' || existing.status === 'starting')) {
      console.log(`[Supervisor] Already running for wave ${waveId}`);
      return existing;
    }

    const state: SupervisorState = {
      waveId,
      directive,
      targetRoles,
      supervisorSessionId: null,
      executionId: null,
      status: 'starting',
      crashCount: 0,
      maxCrashRetries: 10,
      restartTimer: null,
      pendingDirectives: [],
      pendingQuestions: [],
      createdAt: new Date().toISOString(),
    };

    this.supervisors.set(waveId, state);
    this.spawnSupervisor(state);
    return state;
  }

  /**
   * Stop the supervisor for a wave (graceful).
   */
  stop(waveId: string): void {
    const state = this.supervisors.get(waveId);
    if (!state) return;

    state.status = 'stopped';
    if (state.restartTimer) {
      clearTimeout(state.restartTimer);
      state.restartTimer = null;
    }

    // Abort the running execution if any
    if (state.executionId) {
      const exec = executionManager.getExecution(state.executionId);
      if (exec && exec.status === 'running') {
        exec.abort();
      }
    }

    console.log(`[Supervisor] Stopped for wave ${state.waveId}`);
  }

  /**
   * Add a CEO directive to be delivered at the next supervisor tick.
   * Dispatch Protocol Principle 2: tick이 유일한 동기화 지점.
   */
  addDirective(waveId: string, text: string): PendingDirective | null {
    const state = this.supervisors.get(waveId);
    if (!state) return null;

    const directive: PendingDirective = {
      id: `dir-${Date.now()}`,
      text,
      createdAt: new Date().toISOString(),
      delivered: false,
    };

    state.pendingDirectives.push(directive);
    console.log(`[Supervisor] Directive queued for wave ${waveId}: ${text.slice(0, 80)}`);
    return directive;
  }

  /**
   * Answer a question from the supervisor.
   */
  answerQuestion(waveId: string, questionId: string, answer: string): boolean {
    const state = this.supervisors.get(waveId);
    if (!state) return false;

    const q = state.pendingQuestions.find(q => q.id === questionId);
    if (!q) return false;

    q.answer = answer;
    q.answeredAt = new Date().toISOString();
    return true;
  }

  /**
   * Get pending (undelivered) directives for a wave.
   * Called by DigestEngine to include in the supervisor's digest.
   */
  getPendingDirectives(waveId: string): PendingDirective[] {
    const state = this.supervisors.get(waveId);
    if (!state) return [];
    return state.pendingDirectives.filter(d => !d.delivered);
  }

  /**
   * Mark directives as delivered.
   */
  markDirectivesDelivered(waveId: string): void {
    const state = this.supervisors.get(waveId);
    if (!state) return;
    for (const d of state.pendingDirectives) {
      d.delivered = true;
    }
  }

  /**
   * Add a question from the supervisor to CEO.
   */
  addQuestion(waveId: string, question: string, fromRole: string, context: string): PendingQuestion {
    const state = this.supervisors.get(waveId);
    const q: PendingQuestion = {
      id: `q-${Date.now()}`,
      question,
      fromRole,
      context,
      createdAt: new Date().toISOString(),
    };

    if (state) {
      state.pendingQuestions.push(q);
    }
    return q;
  }

  /**
   * Get unanswered questions for a wave.
   */
  getUnansweredQuestions(waveId: string): PendingQuestion[] {
    const state = this.supervisors.get(waveId);
    if (!state) return [];
    return state.pendingQuestions.filter(q => !q.answer);
  }

  /**
   * Get the state for a wave.
   */
  getState(waveId: string): SupervisorState | undefined {
    return this.supervisors.get(waveId);
  }

  /**
   * List all active supervisor states.
   */
  listActive(): SupervisorState[] {
    return Array.from(this.supervisors.values())
      .filter(s => s.status === 'running' || s.status === 'starting' || s.status === 'restarting');
  }

  /* ─── Internal: Spawn / Restart ────────────── */

  private spawnSupervisor(state: SupervisorState): void {
    const orgTree = buildOrgTree(COMPANY_ROOT);
    let cLevelRoles = getSubordinates(orgTree, 'ceo');

    if (state.targetRoles && state.targetRoles.length > 0) {
      const allowed = new Set(state.targetRoles);
      cLevelRoles = cLevelRoles.filter(r => allowed.has(r));
    }

    if (cLevelRoles.length === 0) {
      console.error(`[Supervisor] No C-Level roles found for wave ${state.waveId}`);
      state.status = 'error';
      return;
    }

    // Build the supervisor task prompt
    const cLevelList = cLevelRoles.map(r => {
      const node = orgTree.nodes.get(r);
      const name = node?.name ?? r;
      const subs = getSubordinates(orgTree, r);
      return `- **${name}** (\`${r}\`): ${subs.length} subordinates [${subs.join(', ')}]`;
    }).join('\n');

    const isRecovery = state.crashCount > 0;
    const recoveryContext = isRecovery
      ? `\n\n⚠️ [RECOVERY] This is a restart after crash #${state.crashCount}. Check all session states via supervision watch.`
      : '';

    const supervisorTask = `[CEO Supervisor] ${state.directive}

## Your Role
You are the CEO Supervisor — the root of the supervision tree.
Your job: dispatch C-Level roles, watch their progress, relay opinions between them,
and ensure the CEO's directive is fulfilled.

## Available C-Level Roles
${cLevelList}

## Dispatch Protocol (6 Principles)
1. **Universal Loop**: dispatch → watch → react → repeat (same as all supervisors)
2. **Tick = sync point**: All events processed at watch tick boundary
3. **Priority**: CEO directive > crash > abort > peer opinion > subordinate question > status
4. **Hierarchy**: Only dispatch your direct reports. Relay opinions, don't create shortcuts
5. **Done condition**: ALL subordinates must be done before you report done
6. **Crash resilience**: If you restart, digest catches you up

## Supervisor Guidelines
- G-01: After amending a C-Level, verify on next tick that they reflected it. If not, escalate to CEO directive priority.
- G-02: If a C-Level crashes 3+ times consecutively, stop dispatching them and report to CEO.
- G-03: Multiple CEO directives in same tick → apply the latest one only.
- G-04: If you dispatch the same role 3+ times with no progress, intervene: "specify what's wrong concretely."
- G-05: abort = graceful amend ("wrap up and stop"). Not a hard kill.
- G-06: If two sessions show no events for 3+ minutes, suspect deadlock → re-sequence their work.
- G-07: **Cross-team relay is YOUR job.** When a C-Level completes, immediately amend the other active C-Levels with a summary of the completed work. Example: CBO finishes game design → amend CTO: "CBO delivered game design docs. Key decisions: [summary]. Review and align your implementation."
- G-08: Don't just watch passively. On every tick, ask: "Does any active C-Level need information from a completed C-Level?" If yes, amend with the relevant context.

## Cross-Team Relay Protocol (CRITICAL)
⛔ C-Levels do NOT talk to each other directly. YOU are the relay.

When C-Level A completes while C-Level B is still active:
1. Review A's deliverables (read their committed files or final report)
2. Summarize the key decisions, artifacts, and constraints from A's work
3. amend B: "C-Level A completed. Here are their deliverables relevant to your work: [summary]. Review and incorporate."
4. On next tick, verify B acknowledged and reflected A's input

When C-Level A produces intermediate results that B needs:
1. amend B with the relevant intermediate output
2. You don't need to wait for A to finish — relay as results become available

Examples:
- CBO finishes game design → amend CTO: "CBO delivered: world-building doc, 15 monster specs, quest design, UI guidelines. Ensure implementation matches these specs."
- CTO's engineer creates API schema → amend CBO: "CTO's team defined the data schema. Here's the structure: [summary]. Adjust business docs if needed."
- Designer finishes UI guide → relay to CTO team: "Designer's UI guide is ready at [path]. Frontend implementation should follow these specs."

## CEO Directive Channel
If new CEO directives arrive mid-execution, they will appear in your supervision watch digest
marked as [CEO DIRECTIVE]. These are PRIORITY 1 — process before anything else.
${recoveryContext}

## Quality Gate (CRITICAL — G-09)
⛔ **"Subordinate said done" ≠ "Work is actually done."**
⛔ **"Code exists" ≠ "Code works."** You MUST run and test the output, not just read files.

Before declaring yourself done, you MUST:

1. **Read the actual output files** — don't trust status reports. Check the code yourself.
2. **RUN it and test it** — this is the most important step:
   - For web apps/games: \`cd <code-dir> && python3 -m http.server 9999\` then open in browser
   - Actually try the core interactions (click buttons, press keys, navigate)
   - If basic interactions fail (can't move, can't click, blank screen) → it's NOT done
3. **Count against requirements** — if the directive says "15 monsters, 7 maps", count them.
4. **Check the directive's specific tech requirements** — if it mentions a specific library/engine, verify it's actually used in the code (grep for it).
5. **If quality is insufficient → re-dispatch** with specific, actionable feedback:
   - "Arrow keys don't move the player. Fix input handling in WorldScene."
   - "TyconoForge was required but not used. Add character rendering with TyconoForge.render()."
   - NOT vague feedback like "improve quality" or "make it better"
6. **Iterate until the directive is truly fulfilled.** There is NO time limit.
   20,000 lines of non-working code is worse than 5,000 lines that actually play.

Re-dispatch pattern:
- dispatch same C-Level with specific gaps identified
- Each iteration should close specific gaps, not redo everything
- Maximum 5 iterations per C-Level before escalating

## Instructions
1. Analyze the directive and decide which C-Level roles to dispatch (not necessarily all)
2. Dispatch them with clear tasks
3. Enter supervision watch loop
4. Monitor, **actively relay results between teams**, course-correct
5. When subordinates report done → **verify deliverables against requirements (G-09)**
6. If gaps exist → re-dispatch with specific feedback. Repeat 3-5.
7. Only when ALL requirements are met → compile results and report`;

    // BUG-008 fix: Wave:Supervisor:Session = 1:1:1 invariant.
    // Reuse existing session on restart instead of creating a new one.
    let sessionId = state.supervisorSessionId;
    if (sessionId && getSession(sessionId)) {
      console.log(`[Supervisor] Reusing existing session ${sessionId} for wave ${state.waveId}`);
    } else {
      const session = createSession('ceo', {
        mode: 'do',
        source: 'wave',
        waveId: state.waveId,
      });
      sessionId = session.id;
      state.supervisorSessionId = sessionId;

      // Add the directive as CEO message so the session isn't empty (prevents deleteEmpty cleanup)
      const ceoMsg: Message = {
        id: `msg-${Date.now()}-ceo-supervisor`,
        from: 'ceo',
        content: state.directive,
        type: 'directive',
        status: 'done',
        timestamp: new Date().toISOString(),
      };
      addMessage(sessionId, ceoMsg);
    }
    state.status = 'running';

    try {
      const exec = executionManager.startExecution({
        type: 'wave',
        roleId: 'ceo',
        task: supervisorTask,
        sourceRole: 'ceo',
        targetRoles: state.targetRoles,
        sessionId,
      });

      state.executionId = exec.id;

      this.watchExecution(state, exec);

      console.log(`[Supervisor] Started for wave ${state.waveId} | session=${sessionId} | exec=${exec.id}`);
    } catch (err) {
      console.error(`[Supervisor] Failed to start for wave ${state.waveId}:`, err);
      state.status = 'error';
    }
  }

  private watchExecution(state: SupervisorState, exec: Execution): void {
    const subscriber = (event: { type: string; data: Record<string, unknown> }) => {
      if (event.type === 'msg:done') {
        exec.stream.unsubscribe(subscriber);
        this.onSupervisorDone(state);
      } else if (event.type === 'msg:error') {
        exec.stream.unsubscribe(subscriber);
        this.onSupervisorCrash(state, String(event.data.message ?? 'unknown error'));
      }
    };

    exec.stream.subscribe(subscriber);
  }

  private onSupervisorDone(state: SupervisorState): void {
    // Check if there are still running C-Level sessions for this wave
    const waveSessions = listSessions().filter(s => s.waveId === state.waveId && s.id !== state.supervisorSessionId);
    const runningChildren = waveSessions.filter(s => {
      const exec = executionManager.getActiveExecution(s.id);
      return exec && exec.status === 'running';
    });

    if (runningChildren.length > 0) {
      // Principle 5: can't be done with running children → restart supervisor
      console.log(`[Supervisor] Done but ${runningChildren.length} children still running. Restarting.`);
      state.crashCount = 0; // Not a crash, intentional restart
      this.scheduleRestart(state, 5_000); // 5s delay
    } else {
      console.log(`[Supervisor] Wave ${state.waveId} complete. All subordinates done.`);
      state.status = 'stopped';

      // Auto-save the completed wave to operations/waves/
      try {
        const result = saveCompletedWave(state.waveId, state.directive);
        if (result.ok) {
          console.log(`[Supervisor] Wave auto-saved: ${result.path}`);
        } else {
          console.warn(`[Supervisor] Wave auto-save returned no result for ${state.waveId}`);
        }
      } catch (err) {
        console.error(`[Supervisor] Failed to auto-save wave ${state.waveId}:`, err);
      }
    }
  }

  private onSupervisorCrash(state: SupervisorState, error: string): void {
    if (state.status === 'stopped') return; // Intentional stop

    state.crashCount++;
    console.log(`[Supervisor] Crash #${state.crashCount} for wave ${state.waveId}: ${error}`);

    if (state.crashCount >= state.maxCrashRetries) {
      console.error(`[Supervisor] Max retries (${state.maxCrashRetries}) reached for wave ${state.waveId}. Giving up.`);
      state.status = 'error';
      return;
    }

    // Principle 6: restart with exponential backoff (max 30s)
    const delay = Math.min(10_000 * Math.pow(1.5, state.crashCount - 1), 30_000);
    this.scheduleRestart(state, delay);
  }

  private scheduleRestart(state: SupervisorState, delayMs: number): void {
    state.status = 'restarting';
    console.log(`[Supervisor] Scheduling restart for wave ${state.waveId} in ${delayMs}ms`);

    state.restartTimer = setTimeout(() => {
      state.restartTimer = null;
      if (state.status !== 'restarting') return; // Cancelled
      this.spawnSupervisor(state);
    }, delayMs);
  }
}

/* ─── Singleton ──────────────────────────────── */

export const supervisorHeartbeat = new SupervisorHeartbeat();
