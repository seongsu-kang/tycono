interface SupervisorState {
    waveId: string;
    directive: string;
    targetRoles?: string[];
    continuous: boolean;
    preset?: string;
    supervisorSessionId: string | null;
    executionId: string | null;
    status: 'starting' | 'running' | 'restarting' | 'stopped' | 'error' | 'awaiting_approval';
    crashCount: number;
    maxCrashRetries: number;
    restartTimer: ReturnType<typeof setTimeout> | null;
    cleanupTimer: ReturnType<typeof setTimeout> | null;
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
declare class SupervisorHeartbeat {
    private supervisors;
    /**
     * Start a CEO Supervisor for a wave.
     * This creates a supervisor session and starts an execution.
     * If the execution dies, it auto-restarts (heartbeat).
     */
    start(waveId: string, directive: string, targetRoles?: string[], continuous?: boolean, preset?: string, modelOverrides?: Record<string, string>): SupervisorState;
    /**
     * Save wave file immediately so directive persists across restarts.
     * saveCompletedWave() adds session/role details on completion.
     */
    private saveWaveFile;
    /**
     * Stop the supervisor for a wave (graceful).
     */
    stop(waveId: string): void;
    /**
     * Add a CEO directive to be delivered at the next supervisor tick.
     * Dispatch Protocol Principle 2: tick이 유일한 동기화 지점.
     */
    addDirective(waveId: string, text: string): PendingDirective | null;
    /**
     * Answer a question from the supervisor.
     */
    answerQuestion(waveId: string, questionId: string, answer: string): boolean;
    /**
     * Get pending (undelivered) directives for a wave.
     * Called by DigestEngine to include in the supervisor's digest.
     */
    getPendingDirectives(waveId: string): PendingDirective[];
    /**
     * Mark directives as delivered.
     */
    markDirectivesDelivered(waveId: string): void;
    /**
     * Add a question from the supervisor to CEO.
     */
    addQuestion(waveId: string, question: string, fromRole: string, context: string): PendingQuestion;
    /**
     * Get unanswered questions for a wave.
     */
    getUnansweredQuestions(waveId: string): PendingQuestion[];
    /**
     * Get the state for a wave.
     */
    getState(waveId: string): SupervisorState | undefined;
    /**
     * List all active supervisor states.
     */
    listActive(): SupervisorState[];
    /**
     * Classify: is this directive a question/status check (conversation)
     * or a work task (needs dispatch)?
     *
     * Uses Haiku LLM for classification when ANTHROPIC_API_KEY is available.
     * Falls back to regex heuristic when no API key.
     */
    private static readonly CLASSIFY_SYSTEM;
    private classifyDirective;
    private isConversationDirectiveFallback;
    /**
     * Spawn a lightweight conversation session (no dispatch tools).
     * CEO reads files and answers directly.
     */
    /**
     * Load conversation history from activity-stream files for a wave.
     * Used when supervisor restarts (e.g., TUI restarted) to restore context.
     */
    private loadWaveHistory;
    private spawnConversation;
    private spawnSupervisor;
    private watchExecution;
    private onSupervisorDone;
    private onSupervisorCrash;
    private scheduleRestart;
}
export declare const supervisorHeartbeat: SupervisorHeartbeat;
export {};
