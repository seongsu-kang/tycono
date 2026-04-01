import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execSync } from 'node:child_process';
import { glob } from 'glob';
import type { ToolCall, ToolResult } from '../llm-adapter.js';
import { validateWrite, validateRead } from '../authority-validator.js';
import type { OrgTree } from '../org-tree.js';
import { buildKnowledgeGateWarning } from '../knowledge-gate.js';
import { ActivityStream } from '../../services/activity-stream.js';
import { digest, quietDigest, type DigestResult } from '../../services/digest-engine.js';
import { supervisorHeartbeat } from '../../services/supervisor-heartbeat.js';
import { getSession } from '../../services/session-store.js';
import type { ActivityEvent } from '../../../../shared/types.js';

/* ─── Types ──────────────────────────────────── */

export interface ToolExecutorOptions {
  companyRoot: string;
  roleId: string;
  orgTree: OrgTree;
  codeRoot?: string;
  sessionId?: string;
  onDispatch?: (roleId: string, task: string) => Promise<string>;
  onConsult?: (roleId: string, question: string) => Promise<string>;
  onToolExec?: (name: string, input: Record<string, unknown>) => void;
  /** For supervision: abort a running session */
  onAbortSession?: (sessionId: string) => boolean;
  /** For supervision: amend a running session with new instructions */
  onAmendSession?: (sessionId: string, instruction: string) => boolean;
}

/* ─── Tool Executor ──────────────────────────── */

export async function executeTool(
  toolCall: ToolCall,
  options: ToolExecutorOptions,
): Promise<ToolResult> {
  const { companyRoot, roleId, orgTree, codeRoot, onDispatch, onConsult, onToolExec } = options;
  const { id, name, input } = toolCall;

  onToolExec?.(name, input);

  try {
    switch (name) {
      case 'read_file':
        return readFile(id, input, companyRoot, roleId, orgTree);
      case 'list_files':
        return listFiles(id, input, companyRoot, roleId, orgTree);
      case 'search_files':
        return searchFiles(id, input, companyRoot, roleId, orgTree);
      case 'write_file':
        return writeFile(id, input, companyRoot, roleId, orgTree);
      case 'edit_file':
        return editFile(id, input, companyRoot, roleId, orgTree);
      case 'bash_execute':
        return bashExecute(id, input, codeRoot ?? companyRoot);
      case 'dispatch':
        return await dispatchTask(id, input, onDispatch, options);
      case 'consult':
        return await consultTask(id, input, onConsult);
      case 'heartbeat_watch':
        return await heartbeatWatch(id, input, companyRoot);
      case 'amend_session':
        return amendSession(id, input, options.onAmendSession);
      case 'abort_session':
        return abortSession(id, input, options.onAbortSession);
      default:
        return { tool_use_id: id, content: `Unknown tool: ${name}`, is_error: true };
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { tool_use_id: id, content: `Error: ${message}`, is_error: true };
  }
}

/* ─── 2-Layer Knowledge: allowed read paths ──── */

/**
 * For READ operations, agents may access agency-bundled knowledge
 * in addition to the user's companyRoot (knowledge/).
 * Write operations remain restricted to companyRoot only.
 */
function isAllowedReadPath(absolute: string, companyRoot: string): boolean {
  const allowedPaths = [
    companyRoot,
    path.join(companyRoot, '.tycono', 'agencies'),
    path.join(os.homedir(), '.tycono', 'agencies'),
  ];
  return allowedPaths.some(p => absolute.startsWith(p));
}

/* ─── Tool Implementations ───────────────────── */

function readFile(
  id: string,
  input: Record<string, unknown>,
  companyRoot: string,
  roleId: string,
  orgTree: OrgTree,
): ToolResult {
  const filePath = String(input.path ?? '');
  if (!filePath) {
    return { tool_use_id: id, content: 'Error: path is required', is_error: true };
  }

  // Authority check
  const authResult = validateRead(orgTree, roleId, filePath);
  if (!authResult.allowed) {
    return { tool_use_id: id, content: `Access denied: ${authResult.reason}`, is_error: true };
  }

  const absolute = path.resolve(companyRoot, filePath);

  // Security: prevent path traversal (2-Layer: allow agency knowledge paths for reads)
  if (!isAllowedReadPath(absolute, companyRoot)) {
    return { tool_use_id: id, content: 'Error: path traversal not allowed', is_error: true };
  }

  if (!fs.existsSync(absolute)) {
    return { tool_use_id: id, content: `File not found: ${filePath}`, is_error: true };
  }

  const content = fs.readFileSync(absolute, 'utf-8');

  // Truncate very large files
  if (content.length > 50000) {
    return {
      tool_use_id: id,
      content: content.slice(0, 50000) + '\n\n[... truncated, file is ' + content.length + ' chars]',
    };
  }

  return { tool_use_id: id, content };
}

function listFiles(
  id: string,
  input: Record<string, unknown>,
  companyRoot: string,
  roleId: string,
  orgTree: OrgTree,
): ToolResult {
  const directory = String(input.directory ?? '.');
  const pattern = String(input.pattern ?? '*.md');

  // Authority check
  const authResult = validateRead(orgTree, roleId, directory);
  if (!authResult.allowed) {
    return { tool_use_id: id, content: `Access denied: ${authResult.reason}`, is_error: true };
  }

  const absolute = path.resolve(companyRoot, directory);
  // 2-Layer: allow agency knowledge paths for reads
  if (!isAllowedReadPath(absolute, companyRoot)) {
    return { tool_use_id: id, content: 'Error: path traversal not allowed', is_error: true };
  }

  if (!fs.existsSync(absolute)) {
    return { tool_use_id: id, content: `Directory not found: ${directory}`, is_error: true };
  }

  const files = glob.sync(pattern, { cwd: absolute }).sort();
  return { tool_use_id: id, content: files.length > 0 ? files.join('\n') : '(no matching files)' };
}

function searchFiles(
  id: string,
  input: Record<string, unknown>,
  companyRoot: string,
  roleId: string,
  orgTree: OrgTree,
): ToolResult {
  const pattern = String(input.pattern ?? '');
  const directory = String(input.directory ?? '.');
  const filePattern = String(input.file_pattern ?? '*');

  if (!pattern) {
    return { tool_use_id: id, content: 'Error: pattern is required', is_error: true };
  }

  // Authority check
  const authResult = validateRead(orgTree, roleId, directory);
  if (!authResult.allowed) {
    return { tool_use_id: id, content: `Access denied: ${authResult.reason}`, is_error: true };
  }

  const absolute = path.resolve(companyRoot, directory);
  // 2-Layer: allow agency knowledge paths for reads
  if (!isAllowedReadPath(absolute, companyRoot)) {
    return { tool_use_id: id, content: 'Error: path traversal not allowed', is_error: true };
  }

  const files = glob.sync(filePattern === '*' ? '**/*.{md,yaml,yml,ts,tsx,json}' : `**/${filePattern}`, {
    cwd: absolute,
    ignore: ['node_modules/**', 'dist/**', '.git/**'],
  });

  const regex = new RegExp(pattern, 'gi');
  const results: string[] = [];

  for (const file of files) {
    const filePath = path.join(absolute, file);
    try {
      const content = fs.readFileSync(filePath, 'utf-8');
      const lines = content.split('\n');
      for (let i = 0; i < lines.length; i++) {
        if (regex.test(lines[i])) {
          results.push(`${file}:${i + 1}: ${lines[i].trim()}`);
          if (results.length >= 50) break;
        }
        regex.lastIndex = 0; // Reset regex state
      }
    } catch {
      // Skip files that can't be read
    }
    if (results.length >= 50) break;
  }

  return {
    tool_use_id: id,
    content: results.length > 0 ? results.join('\n') : `No matches found for "${pattern}"`,
  };
}

function writeFile(
  id: string,
  input: Record<string, unknown>,
  companyRoot: string,
  roleId: string,
  orgTree: OrgTree,
): ToolResult {
  const filePath = String(input.path ?? '');
  const content = String(input.content ?? '');

  if (!filePath) {
    return { tool_use_id: id, content: 'Error: path is required', is_error: true };
  }

  // Authority check
  const authResult = validateWrite(orgTree, roleId, filePath);
  if (!authResult.allowed) {
    return { tool_use_id: id, content: `Access denied: ${authResult.reason}`, is_error: true };
  }

  const absolute = path.resolve(companyRoot, filePath);
  if (!absolute.startsWith(companyRoot)) {
    return { tool_use_id: id, content: 'Error: path traversal not allowed', is_error: true };
  }

  // Create parent directories
  const dir = path.dirname(absolute);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  const isNewFile = !fs.existsSync(absolute);
  fs.writeFileSync(absolute, content);

  let result = `File written: ${filePath} (${content.length} chars)`;

  // Knowledge Gate: 새 .md 파일 생성 시 자동 검색 + 경고 (journal 제외)
  if (isNewFile && filePath.endsWith('.md') && !filePath.includes('journal/')) {
    result += buildKnowledgeGateWarning(companyRoot, filePath, content);
  }

  return { tool_use_id: id, content: result };
}

function editFile(
  id: string,
  input: Record<string, unknown>,
  companyRoot: string,
  roleId: string,
  orgTree: OrgTree,
): ToolResult {
  const filePath = String(input.path ?? '');
  const oldString = String(input.old_string ?? '');
  const newString = String(input.new_string ?? '');

  if (!filePath || !oldString) {
    return { tool_use_id: id, content: 'Error: path and old_string are required', is_error: true };
  }

  // Authority check
  const authResult = validateWrite(orgTree, roleId, filePath);
  if (!authResult.allowed) {
    return { tool_use_id: id, content: `Access denied: ${authResult.reason}`, is_error: true };
  }

  const absolute = path.resolve(companyRoot, filePath);
  if (!absolute.startsWith(companyRoot)) {
    return { tool_use_id: id, content: 'Error: path traversal not allowed', is_error: true };
  }

  if (!fs.existsSync(absolute)) {
    return { tool_use_id: id, content: `File not found: ${filePath}`, is_error: true };
  }

  const content = fs.readFileSync(absolute, 'utf-8');
  if (!content.includes(oldString)) {
    return { tool_use_id: id, content: `String not found in ${filePath}: "${oldString.slice(0, 100)}"`, is_error: true };
  }

  const updated = content.replace(oldString, newString);
  fs.writeFileSync(absolute, updated);
  return { tool_use_id: id, content: `File edited: ${filePath}` };
}

/* ─── Bash Safety Layer (EG-002) ─────────────── */

/** Dangerous patterns that are always blocked */
const BLOCKED_PATTERNS = [
  /\brm\s+(-[a-z]*f|-[a-z]*r|--force|--recursive)\b/i,
  /\brm\s+-rf\b/i,
  /\bsudo\b/,
  /\bmkfs\b/,
  /\bdd\s+if=/,
  /\b(shutdown|reboot|halt|poweroff)\b/,
  /\bchmod\s+777\b/,
  /\bchown\b/,
  />\s*\/dev\//,
  /\bcurl\b.*\|\s*(bash|sh|zsh)\b/,
  /\bwget\b.*\|\s*(bash|sh|zsh)\b/,
  /\bgit\s+push\s+.*--force\b/,
  /\bgit\s+reset\s+--hard\b/,
  /\bnpm\s+publish\b/,
  /\beval\s*\(/,
  /:\(\)\s*\{/,  // fork bomb
  /\bsleep\s+\d/,  // Block sleep — use heartbeat_watch or supervision watch instead
];

function validateBashCommand(command: string): string | null {
  const trimmed = command.trim();
  if (!trimmed) return 'Empty command';

  for (const pattern of BLOCKED_PATTERNS) {
    if (pattern.test(trimmed)) {
      return `Blocked: command matches dangerous pattern "${pattern.source}"`;
    }
  }

  // Block commands that try to leave codeRoot via cd
  if (/\bcd\s+\//.test(trimmed) && !/\bcd\s+\/[^;|&]*&&/.test(trimmed)) {
    // Allow cd to absolute if chained with other commands (common pattern)
    // But block standalone cd to absolute paths outside codeRoot
  }

  return null; // OK
}

const MAX_BASH_TIMEOUT = 120_000;
const DEFAULT_BASH_TIMEOUT = 30_000;
const MAX_OUTPUT_LENGTH = 50_000;

function bashExecute(
  id: string,
  input: Record<string, unknown>,
  codeRoot: string,
): ToolResult {
  const command = String(input.command ?? '');
  const timeout = Math.min(Number(input.timeout) || DEFAULT_BASH_TIMEOUT, MAX_BASH_TIMEOUT);
  const cwdRelative = String(input.cwd ?? '.');

  // Validate command safety
  const blockReason = validateBashCommand(command);
  if (blockReason) {
    return { tool_use_id: id, content: `Error: ${blockReason}`, is_error: true };
  }

  // Resolve and validate cwd
  const cwd = path.resolve(codeRoot, cwdRelative);
  if (!cwd.startsWith(codeRoot)) {
    return { tool_use_id: id, content: 'Error: cwd path traversal not allowed', is_error: true };
  }
  if (!fs.existsSync(cwd)) {
    return { tool_use_id: id, content: `Error: directory not found: ${cwdRelative}`, is_error: true };
  }

  try {
    const stdout = execSync(command, {
      cwd,
      timeout,
      encoding: 'utf-8',
      maxBuffer: 1024 * 1024, // 1MB
      stdio: ['pipe', 'pipe', 'pipe'],
      env: { ...process.env, FORCE_COLOR: '0' },
    });

    const output = stdout.length > MAX_OUTPUT_LENGTH
      ? stdout.slice(0, MAX_OUTPUT_LENGTH) + `\n\n[... truncated, output is ${stdout.length} chars]`
      : stdout;

    return { tool_use_id: id, content: output || '(no output)' };
  } catch (err: unknown) {
    const execErr = err as { status?: number; stdout?: string; stderr?: string; message?: string };
    const stderr = execErr.stderr?.slice(0, 5000) ?? '';
    const stdout = execErr.stdout?.slice(0, 5000) ?? '';
    const exitCode = execErr.status ?? 1;

    let content = `Command exited with code ${exitCode}`;
    if (stdout) content += `\n\nSTDOUT:\n${stdout}`;
    if (stderr) content += `\n\nSTDERR:\n${stderr}`;
    if (!stdout && !stderr) content += `\n${execErr.message ?? ''}`;

    return { tool_use_id: id, content, is_error: true };
  }
}

/* ─── Dispatch / Consult ─────────────────────── */

async function dispatchTask(
  id: string,
  input: Record<string, unknown>,
  onDispatch?: (roleId: string, task: string) => Promise<string>,
  options?: ToolExecutorOptions,
): Promise<ToolResult> {
  const targetRoleId = String(input.roleId ?? '');
  const task = String(input.task ?? '');

  if (!targetRoleId || !task) {
    return { tool_use_id: id, content: 'Error: roleId and task are required', is_error: true };
  }

  if (!onDispatch) {
    // Emit dispatch:error — dispatch not available
    if (options?.sessionId) {
      const stream = ActivityStream.getOrCreate(options.sessionId, options.roleId);
      stream.emit('dispatch:error', options.roleId, {
        sourceRole: options.roleId,
        targetRole: targetRoleId,
        error: 'dispatch not available in this context',
        timestamp: Date.now(),
      });
    }
    return { tool_use_id: id, content: 'Error: dispatch not available in this context', is_error: true };
  }

  const result = await onDispatch(targetRoleId, task);

  // Detect dispatch rejection and emit dispatch:error event
  if (result.startsWith('Dispatch rejected:') || result.startsWith('[DISPATCH BLOCKED]')) {
    if (options?.sessionId) {
      const stream = ActivityStream.getOrCreate(options.sessionId, options.roleId);
      stream.emit('dispatch:error', options.roleId, {
        sourceRole: options.roleId,
        targetRole: targetRoleId,
        error: result,
        timestamp: Date.now(),
      });
    }
  }

  return { tool_use_id: id, content: result };
}

async function consultTask(
  id: string,
  input: Record<string, unknown>,
  onConsult?: (roleId: string, question: string) => Promise<string>,
): Promise<ToolResult> {
  const roleId = String(input.roleId ?? '');
  const question = String(input.question ?? '');

  if (!roleId || !question) {
    return { tool_use_id: id, content: 'Error: roleId and question are required', is_error: true };
  }

  if (!onConsult) {
    return { tool_use_id: id, content: 'Error: consult not available in this context', is_error: true };
  }

  const result = await onConsult(roleId, question);
  return { tool_use_id: id, content: result };
}

/* ─── Supervision Tools (SV-3, SV-6, SV-7) ──── */

const MAX_WATCH_DURATION = 300;
const DEFAULT_WATCH_DURATION = 120;

/** Find the waveId for a set of session IDs (for CEO directive injection) */
function findWaveIdForSessions(sessionIds: string[]): string | undefined {
  for (const sid of sessionIds) {
    const session = getSession(sid);
    if (session?.waveId) return session.waveId;
  }
  return undefined;
}

/**
 * heartbeat_watch: Block for N seconds collecting events from activity streams.
 * Returns a DigestEngine summary. Early-returns on alert events.
 * $0 LLM cost during wait — all blocking is server-side.
 */
async function heartbeatWatch(
  id: string,
  input: Record<string, unknown>,
  companyRoot: string,
): Promise<ToolResult> {
  const sessionIds = input.sessionIds as string[] | undefined;
  if (!sessionIds || !Array.isArray(sessionIds) || sessionIds.length === 0) {
    return { tool_use_id: id, content: 'Error: sessionIds array is required', is_error: true };
  }

  const durationSec = Math.min(
    Math.max(Number(input.durationSec) || DEFAULT_WATCH_DURATION, 5),
    MAX_WATCH_DURATION,
  );
  const alertOn = (input.alertOn as string[] | undefined) ?? ['msg:done', 'msg:error', 'msg:awaiting_input'];
  const alertSet = new Set(alertOn);

  // Collect current checkpoints (last known seq for each session)
  const startCheckpoints = new Map<string, number>();
  for (const sid of sessionIds) {
    const events = ActivityStream.readAll(sid);
    startCheckpoints.set(sid, events.length > 0 ? events[events.length - 1].seq + 1 : 0);
  }

  // Set up event collection with live subscriptions
  const collectedEvents = new Map<string, ActivityEvent[]>();
  for (const sid of sessionIds) {
    collectedEvents.set(sid, []);
  }

  let earlyReturn = false;
  const unsubscribers: Array<() => void> = [];

  // Subscribe to live events for early alert detection
  for (const sid of sessionIds) {
    const stream = ActivityStream.getOrCreate(sid, 'unknown');
    const handler = (event: ActivityEvent) => {
      const events = collectedEvents.get(sid);
      if (events) events.push(event);
      if (alertSet.has(event.type)) {
        earlyReturn = true;
      }
    };
    stream.subscribe(handler);
    unsubscribers.push(() => stream.unsubscribe(handler));
  }

  // Pre-compute waveId for directive checking during poll loop
  const waveIdForPoll = findWaveIdForSessions(sessionIds);

  // Wait for duration or early return (also breaks on pending CEO directive)
  await new Promise<void>((resolve) => {
    const timeout = setTimeout(resolve, durationSec * 1000);
    const checkInterval = setInterval(() => {
      if (earlyReturn) {
        clearTimeout(timeout);
        clearInterval(checkInterval);
        resolve();
        return;
      }
      // Early-return on pending CEO directive — don't block for 180s when user is waiting
      if (waveIdForPoll && supervisorHeartbeat.getPendingDirectives(waveIdForPoll).length > 0) {
        earlyReturn = true;
        clearTimeout(timeout);
        clearInterval(checkInterval);
        resolve();
        return;
      }
    }, 500); // Check every 500ms
    // Ensure cleanup even if early
    setTimeout(() => { clearInterval(checkInterval); }, durationSec * 1000 + 100);
  });

  // Unsubscribe all
  for (const unsub of unsubscribers) unsub();

  // If live subscription missed events (e.g., stream was not active), read from file
  for (const sid of sessionIds) {
    const fromSeq = startCheckpoints.get(sid) ?? 0;
    const liveEvents = collectedEvents.get(sid) ?? [];
    if (liveEvents.length === 0) {
      // Fallback: read from JSONL
      const fileEvents = ActivityStream.readFrom(sid, fromSeq);
      collectedEvents.set(sid, fileEvents);
    }
  }

  // Run DigestEngine
  const result: DigestResult = digest(collectedEvents);

  // SV: Inject pending CEO directives (Dispatch Protocol Principle 3: CEO directive = Priority 1)
  const waveId = findWaveIdForSessions(sessionIds);
  let ceoDirectiveText = '';
  if (waveId) {
    const pendingDirectives = supervisorHeartbeat.getPendingDirectives(waveId);
    if (pendingDirectives.length > 0) {
      // CEO directives override quiet tick gate — always surface them
      result.significanceScore = 10;
      for (const d of pendingDirectives) {
        result.anomalies.push({
          type: 'ceo_directive',
          sessionId: 'ceo',
          message: d.text,
          severity: 10,
        });
      }
      ceoDirectiveText = '\n\n### 🔴 [CEO DIRECTIVE] (PRIORITY 1 — process before anything else)\n' +
        pendingDirectives.map(d => `- ${d.text}`).join('\n');
      supervisorHeartbeat.markDirectivesDelivered(waveId);
    }
  }

  // SV-10: Quiet tick gate (skipped if CEO directives pending)
  if (result.significanceScore < 2 && result.anomalies.length === 0) {
    const quietText = quietDigest(sessionIds.length, result.eventCount, result.errorCount);
    return { tool_use_id: id, content: quietText };
  }

  return { tool_use_id: id, content: result.text + ceoDirectiveText };
}

/**
 * amend_session: Send additional instructions to a running session (SV-6)
 */
function amendSession(
  id: string,
  input: Record<string, unknown>,
  onAmend?: (sessionId: string, instruction: string) => boolean,
): ToolResult {
  const sessionId = String(input.sessionId ?? '');
  const instruction = String(input.instruction ?? '');

  if (!sessionId || !instruction) {
    return { tool_use_id: id, content: 'Error: sessionId and instruction are required', is_error: true };
  }

  if (!onAmend) {
    return { tool_use_id: id, content: 'Error: amend_session not available in this context', is_error: true };
  }

  const success = onAmend(sessionId, instruction);
  if (success) {
    return { tool_use_id: id, content: `Session ${sessionId} amended. Instruction will be injected at next turn boundary.` };
  }
  return { tool_use_id: id, content: `Failed to amend session ${sessionId}. Session may not be running.`, is_error: true };
}

/**
 * abort_session: Abort a running session immediately (SV-7)
 */
function abortSession(
  id: string,
  input: Record<string, unknown>,
  onAbort?: (sessionId: string) => boolean,
): ToolResult {
  const sessionId = String(input.sessionId ?? '');
  const reason = String(input.reason ?? 'Aborted by supervisor');

  if (!sessionId) {
    return { tool_use_id: id, content: 'Error: sessionId is required', is_error: true };
  }

  if (!onAbort) {
    return { tool_use_id: id, content: 'Error: abort_session not available in this context', is_error: true };
  }

  const success = onAbort(sessionId);
  if (success) {
    return { tool_use_id: id, content: `Session ${sessionId} aborted. Reason: ${reason}` };
  }
  return { tool_use_id: id, content: `Failed to abort session ${sessionId}. Session may not be running.`, is_error: true };
}
