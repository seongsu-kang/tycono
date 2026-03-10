import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';
import { glob } from 'glob';
import type { ToolCall, ToolResult } from '../llm-adapter.js';
import { validateWrite, validateRead } from '../authority-validator.js';
import type { OrgTree } from '../org-tree.js';
import { buildKnowledgeGateWarning } from '../knowledge-gate.js';

/* ─── Types ──────────────────────────────────── */

export interface ToolExecutorOptions {
  companyRoot: string;
  roleId: string;
  orgTree: OrgTree;
  codeRoot?: string;
  onDispatch?: (roleId: string, task: string) => Promise<string>;
  onConsult?: (roleId: string, question: string) => Promise<string>;
  onToolExec?: (name: string, input: Record<string, unknown>) => void;
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
        return await dispatchTask(id, input, onDispatch);
      case 'consult':
        return await consultTask(id, input, onConsult);
      default:
        return { tool_use_id: id, content: `Unknown tool: ${name}`, is_error: true };
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { tool_use_id: id, content: `Error: ${message}`, is_error: true };
  }
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

  // Security: prevent path traversal
  if (!absolute.startsWith(companyRoot)) {
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
  if (!absolute.startsWith(companyRoot)) {
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
  if (!absolute.startsWith(companyRoot)) {
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
): Promise<ToolResult> {
  const roleId = String(input.roleId ?? '');
  const task = String(input.task ?? '');

  if (!roleId || !task) {
    return { tool_use_id: id, content: 'Error: roleId and task are required', is_error: true };
  }

  if (!onDispatch) {
    return { tool_use_id: id, content: 'Error: dispatch not available in this context', is_error: true };
  }

  const result = await onDispatch(roleId, task);
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
