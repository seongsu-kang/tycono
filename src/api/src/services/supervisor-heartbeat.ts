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
import fs from 'node:fs';
import path from 'node:path';
import { COMPANY_ROOT } from './file-reader.js';
import { ActivityStream } from './activity-stream.js';
import { saveCompletedWave } from './wave-tracker.js';

/* ─── Types ──────────────────────────────────── */

interface SupervisorState {
  waveId: string;
  directive: string;
  targetRoles?: string[];
  continuous: boolean;
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
  start(waveId: string, directive: string, targetRoles?: string[], continuous = false): SupervisorState {
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
      continuous,
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

    // Empty directive → idle wave (don't spawn supervisor yet)
    if (!directive) {
      state.status = 'stopped';
      console.log(`[Supervisor] Idle wave created: ${waveId} (no directive)`);
      return state;
    }

    // Save wave file immediately so directive persists across restarts
    this.saveWaveFile(waveId, directive);

    this.spawnSupervisor(state);
    return state;
  }

  /**
   * Save wave file immediately so directive persists across restarts.
   * saveCompletedWave() adds session/role details on completion.
   */
  private saveWaveFile(waveId: string, directive: string): void {
    try {
      const wavesDir = path.join(COMPANY_ROOT, 'operations', 'waves');
      if (!fs.existsSync(wavesDir)) fs.mkdirSync(wavesDir, { recursive: true });
      const wavePath = path.join(wavesDir, `${waveId}.json`);
      if (!fs.existsSync(wavePath)) {
        fs.writeFileSync(wavePath, JSON.stringify({
          id: waveId,
          waveId,
          directive,
          startedAt: new Date().toISOString(),
          sessionIds: [],
          roles: [],
        }, null, 2));
        console.log(`[Supervisor] Wave file created: ${wavePath}`);
      }
    } catch (err) {
      console.warn(`[Supervisor] Failed to save wave file for ${waveId}:`, err);
    }
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
    let state = this.supervisors.get(waveId);

    // If wave not in memory (e.g., server restarted), restore from disk
    if (!state) {
      // Check if this wave existed before (has sessions in session-store)
      const waveSessions = listSessions().filter(s => s.waveId === waveId);
      const ceoSession = waveSessions.find(s => s.roleId === 'ceo') ?? null;

      // Read original directive from wave artifact file
      let originalDirective = '';
      try {
        const waveFile = path.join(COMPANY_ROOT, 'operations', 'waves', `${waveId}.json`);
        if (fs.existsSync(waveFile)) {
          const waveData = JSON.parse(fs.readFileSync(waveFile, 'utf-8'));
          originalDirective = waveData.directive ?? '';
        }
      } catch { /* ignore */ }

      if (waveSessions.length > 0 || originalDirective) {
        // Restore supervisor state — from sessions or wave file
        state = {
          waveId,
          directive: originalDirective || text,
          continuous: false,
          supervisorSessionId: ceoSession?.id ?? null,
          executionId: null,
          status: 'stopped',
          crashCount: 0,
          maxCrashRetries: 10,
          restartTimer: null,
          pendingDirectives: [],
          pendingQuestions: [],
          createdAt: ceoSession?.createdAt ?? new Date().toISOString(),
        };
        this.supervisors.set(waveId, state);
        console.log(`[Supervisor] Restored wave ${waveId} from disk (${waveSessions.length} sessions, directive=${originalDirective ? 'yes' : 'no'})`);
      } else {
        return null;
      }
    }

    const directive: PendingDirective = {
      id: `dir-${Date.now()}`,
      text,
      createdAt: new Date().toISOString(),
      delivered: false,
    };

    state.pendingDirectives.push(directive);
    console.log(`[Supervisor] Directive queued for wave ${waveId}: ${text.slice(0, 80)}`);

    // If supervisor is stopped (agent finished or idle wave), wake it up
    if (state.status === 'stopped') {
      // Update the wave's directive if it was empty (idle wave first message)
      if (!state.directive) {
        state.directive = text;
      }
      state.crashCount = 0;

      // Dual Mode: Conversation vs Dispatch (code-level enforcement)
      // If directive looks like a question/status check → spawn conversation mode
      // If directive looks like a task → spawn full supervisor with dispatch tools
      if (this.isConversationDirective(text)) {
        this.spawnConversation(state, text);
      } else {
        this.scheduleRestart(state, 0);
      }
    }

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

  /* ─── Internal: Dual Mode ─────────────────── */

  /**
   * Heuristic: is this directive a question/status check (conversation)
   * or a work task (needs dispatch)?
   *
   * Conversation signals: question marks, status keywords, short length
   * Dispatch signals: imperative verbs (만들어, 수정해, 구현해), long directives
   */
  private isConversationDirective(text: string): boolean {
    const t = text.trim();

    // Short messages with question marks → conversation
    if (t.includes('?') && t.length < 100) return true;

    // Task patterns FIRST — action verbs override question patterns
    const taskPatterns = [
      /만들어/, /구현해/, /개발해/, /수정해/, /변경해/, /리팩토링/,
      /설계해/, /작성해/, /배포해/, /테스트해/, /고쳐/, /해줘/, /해봐/,
      /진행시켜/, /진행해/, /시작해/, /실행해/, /돌려/,
      /build/i, /create/i, /implement/i, /develop/i, /fix/i, /deploy/i, /refactor/i,
      /proceed/i, /start/i, /execute/i, /run/i, /do it/i, /go ahead/i,
    ];
    if (taskPatterns.some(p => p.test(t))) return false;

    // Korean question patterns
    const questionPatterns = [
      /확인해/, /알려줘/, /보여줘/, /어때/, /뭐야/, /뭐지/, /뭘까/,
      /상태/, /상황/, /현재/, /어디/, /얼마/,
      /what/i, /how.*going/i, /status/i, /check/i, /show/i, /tell/i,
    ];
    if (taskPatterns.some(p => p.test(t))) return false;

    // Default: short → conversation, long → dispatch
    return t.length < 60;
  }

  /**
   * Spawn a lightweight conversation session (no dispatch tools).
   * CEO reads files and answers directly.
   */
  /**
   * Load conversation history from activity-stream files for a wave.
   * Used when supervisor restarts (e.g., TUI restarted) to restore context.
   */
  private loadWaveHistory(waveId: string): string {
    try {
      // Find CEO sessions for this wave from session-store
      const allSessions = listSessions();
      console.log(`[WaveHistory] Loading for wave=${waveId}, total sessions=${allSessions.length}`);
      const waveCeoSessions = allSessions
        .filter(s => s.waveId === waveId && s.roleId === 'ceo')
        .sort((a, b) => a.createdAt.localeCompare(b.createdAt));

      console.log(`[WaveHistory] Found ${waveCeoSessions.length} CEO sessions for wave=${waveId}: ${waveCeoSessions.map(s => s.id).join(', ')}`);
      if (waveCeoSessions.length === 0) return '';

      const exchanges: Array<{ role: 'ceo' | 'supervisor'; text: string }> = [];
      for (const ses of waveCeoSessions.slice(-3)) {
        if (!ActivityStream.exists(ses.id)) continue;
        const events = ActivityStream.readAll(ses.id);

        let currentText = '';
        for (const e of events) {
          // New turn starts — flush accumulated text from previous turn
          if (e.type === 'msg:start') {
            if (currentText.trim()) {
              exchanges.push({ role: 'supervisor', text: currentText.trim().slice(0, 100) });
              currentText = '';
            }
            // Extract CEO directive
            const task = String(e.data.task ?? '');
            const match = task.match(/\[CEO (?:Supervisor|Question)\]\s*(.*?)(?:\n|$)/);
            if (match) {
              exchanges.push({ role: 'ceo', text: match[1].slice(0, 80) });
            }
          }
          // Accumulate supervisor response text
          if (e.type === 'text' && e.roleId === 'ceo') {
            const text = String(e.data.text ?? '').trim();
            if (text && !text.startsWith('#') && !text.startsWith('\u26D4')) {
              currentText += text + ' ';
            }
          }
          // Turn boundary — flush
          if (e.type === 'msg:done' || e.type === 'msg:awaiting_input' || e.type === 'msg:error') {
            if (currentText.trim()) {
              exchanges.push({ role: 'supervisor', text: currentText.trim().slice(0, 100) });
              currentText = '';
            }
          }
        }
        // Flush any remaining text
        if (currentText.trim()) {
          exchanges.push({ role: 'supervisor', text: currentText.trim().slice(0, 100) });
        }
      }

      if (exchanges.length === 0) return '';

      // Keep last 4 exchanges (2 Q&A pairs), cap total at 500 chars
      const recent = exchanges.slice(-4);
      const formatted = recent.map(e =>
        e.role === 'ceo' ? `CEO: "${e.text}"` : `→ ${e.text}`
      ).join('\n');

      const result = formatted.length > 500
        ? `\n[Previous conversation]\n${formatted.slice(-500)}\n`
        : `\n[Previous conversation]\n${formatted}\n`;
      console.log(`[WaveHistory] Result (${result.length} chars): ${result.slice(0, 200)}`);
      return result;
    } catch {
      return '';
    }
  }

  private spawnConversation(state: SupervisorState, directive: string): void {
    // Build conversation context: in-memory directives + disk history
    const deliveredDirectives = state.pendingDirectives.filter(d => d.delivered);
    const directiveHistory = deliveredDirectives.length > 0
      ? deliveredDirectives.map(d => `- CEO: "${d.text}"`).join('\n')
      : '';

    // If no in-memory history, load from disk (restart case)
    const diskHistory = !directiveHistory ? this.loadWaveHistory(state.waveId) : '';

    // Extract last execution's output from activity stream (what "just happened")
    let lastExecutionSummary = '';
    // Try current supervisorSessionId first, then search by waveId
    const sessionIdToCheck = state.supervisorSessionId
      || listSessions().find(s => s.waveId === state.waveId && s.roleId === 'ceo')?.id;
    if (sessionIdToCheck) {
      try {
        const events = ActivityStream.readAll(sessionIdToCheck);
        // Get last text outputs (the supervisor's final response)
        const textEvents = events.filter(e => e.type === 'text' && e.roleId === 'ceo');
        const toolEvents = events.filter(e => e.type === 'tool:start' && e.roleId === 'ceo');

        // Summarize: what tools were used + final text
        const toolSummary = toolEvents.slice(-10).map(e => {
          const name = (e.data.name as string) ?? '';
          const inp = e.data.input as Record<string, unknown> | undefined;
          const detail = inp?.file_path ?? inp?.command ?? '';
          return `  → ${name} ${String(detail).slice(0, 60)}`;
        }).join('\n');

        const lastText = textEvents.slice(-5).map(e => String(e.data.text ?? '')).join('').slice(-500);

        if (toolSummary || lastText) {
          lastExecutionSummary = `\n[Previous execution in this wave]\nTools used:\n${toolSummary}\n\nLast response:\n${lastText.slice(0, 500)}\n`;
        }
      } catch { /* ignore */ }
    }

    const context = [directiveHistory || diskHistory, lastExecutionSummary].filter(Boolean).join('\n');

    const task = `${context ? context + '\n' : ''}[CEO Question] ${directive}

You are the CEO's AI assistant. The above shows what happened previously in this wave.
Answer the CEO's question based on context. Be specific — reference files, results, and actions from the previous execution.
Do NOT dispatch anyone. Do NOT create new files. Just answer concisely.`;

    // Reuse session
    let sessionId = state.supervisorSessionId;
    if (!sessionId || !getSession(sessionId)) {
      const session = createSession('ceo', {
        mode: 'do',
        source: 'wave',
        waveId: state.waveId,
      });
      sessionId = session.id;
      state.supervisorSessionId = sessionId;
    }

    state.status = 'running';

    try {
      const exec = executionManager.startExecution({
        type: 'assign',  // assign = no supervisor tools (dispatch/watch/amend)
        roleId: 'ceo',
        task,
        sourceRole: 'ceo',
        sessionId,
      });

      state.executionId = exec.id;
      this.watchExecution(state, exec);

      console.log(`[Supervisor] Conversation mode for wave ${state.waveId} | directive: ${directive.slice(0, 60)}`);
    } catch (err) {
      console.error(`[Supervisor] Conversation spawn failed:`, err);
      // Fallback to full supervisor
      this.scheduleRestart(state, 0);
    }
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

    // Build conversation context from previous directives
    const deliveredDirectives = state.pendingDirectives.filter(d => d.delivered);
    const conversationHistory = deliveredDirectives.length > 0
      ? `\n## Previous Conversation in This Wave
${deliveredDirectives.map((d, i) => `${i + 1}. CEO said: "${d.text}"`).join('\n')}

You are continuing this conversation. The CEO's latest message builds on the above context.
Do NOT re-analyze from scratch — reference your previous findings.\n`
      : '';

    const supervisorTask = `[CEO Supervisor] ${state.directive}
${conversationHistory}
## Your Role
You are the CEO Supervisor — the CEO's AI proxy.
You can answer questions directly OR dispatch C-Level roles for complex work.

## Response Mode Decision (BEFORE dispatching)

⛔ Dispatch is expensive (spawns entire teams). Judge first:

**1. Direct Answer** — Can YOU handle this without dispatching?
   - Status check, progress report → Read files/docs yourself, answer directly
   - Simple question → Answer directly
   - Opinion request → Answer directly
   - Clarification on previous work → Answer from context
   → **Do NOT dispatch. Just answer.**

**2. Selective Dispatch** — Only specific C-Level(s) needed?
   - "코드 수정해" → CTO only
   - "디자인 개선해" → CBO only
   - "테스트해봐" → CTO only (who dispatches QA)
   → **Dispatch only the relevant C-Level(s).**

**3. Full Dispatch** — Multi-team collaboration required?
   - "새 기능 만들어" → CTO + CBO
   - "출시 준비해" → All C-Levels
   → **Dispatch multiple C-Levels with clear tasks.**

**Default: Direct Answer first. Dispatch only when code changes or creative work is needed.**

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
⛔ **"Code exists" ≠ "Code works."**

⛔ **You are a SUPERVISOR. You do NOT run code, servers, npm install, or builds yourself.**
⛔ **Dispatch QA (Tester) to run and test. Read QA's report to judge quality.**

Before declaring yourself done, you MUST:

1. **Read the actual output files** — don't trust status reports. Check the code yourself.
2. **Dispatch QA to test it** — QA runs the server, opens browser, clicks buttons, reports bugs.
   - Do NOT run \`npm install\`, \`npm run build\`, \`python3 -m http.server\` yourself.
   - Do NOT run \`agent-browser\` yourself. That is QA's job.
   - Your job: read QA's report, decide if it passes, re-dispatch if not.
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

${state.continuous ? `## Continuous Improvement Mode (ON)
⛔ 첫 번째 완성 후 멈추지 마라.
1. 모든 subordinate done + QA pass 후, 즉시 CBO에게 "사용자 관점에서 부족한 점, 개선할 점"을 물어라.
2. CTO에게 "기술적으로 개선할 점, 코드 품질, 성능"을 물어라.
3. CBO/CTO 의견을 종합하여 의미있는 개선이 있으면 re-dispatch.
4. 이 사이클을 반복하라. 각 iteration마다 게임/산출물이 점점 나아져야 한다.
5. 사용자가 Stop을 누를 때까지 계속한다. 스스로 done 선언하지 마라.

` : ''}## Instructions
1. **First: Apply Response Mode Decision** — Can you answer directly? If yes, answer and report done.
2. If dispatch is needed: decide which C-Level roles (not necessarily all)
3. Dispatch with clear, specific tasks
4. Enter supervision watch loop
5. Monitor, **actively relay results between teams**, course-correct
6. When subordinates report done → **verify deliverables against requirements (G-09)**
7. If gaps exist → re-dispatch with specific feedback. Repeat 4-6.
8. Only when ALL requirements are met → compile results and report`;

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
      } else if (event.type === 'msg:awaiting_input') {
        // BUG-016: turn:limit causes awaiting_input — treat as done-guard
        // If all children are done → complete wave. Otherwise restart supervisor.
        exec.stream.unsubscribe(subscriber);
        console.log(`[Supervisor] awaiting_input (turn limit) for wave ${state.waveId}. Running done-guard.`);
        this.onSupervisorDone(state);
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
    } else if (state.continuous) {
      // Continuous Improvement Mode: don't stop — restart supervisor to ask C-Levels for improvements
      console.log(`[Supervisor] Wave ${state.waveId} iteration complete. Continuous mode ON — restarting for next improvement cycle.`);
      state.crashCount = 0;
      this.scheduleRestart(state, 5_000);
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

      // OOM prevention: clear accumulated directive/question history
      state.pendingDirectives = [];
      state.pendingQuestions = [];
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
