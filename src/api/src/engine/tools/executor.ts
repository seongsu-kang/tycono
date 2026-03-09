import fs from 'node:fs';
import path from 'node:path';
import { glob } from 'glob';
import type { ToolCall, ToolResult } from '../llm-adapter.js';
import { validateWrite, validateRead } from '../authority-validator.js';
import type { OrgTree } from '../org-tree.js';

/* ─── Types ──────────────────────────────────── */

export interface ToolExecutorOptions {
  companyRoot: string;
  roleId: string;
  orgTree: OrgTree;
  onDispatch?: (roleId: string, task: string) => Promise<string>;
  onConsult?: (roleId: string, question: string) => Promise<string>;
  onToolExec?: (name: string, input: Record<string, unknown>) => void;
}

/* ─── Tool Executor ──────────────────────────── */

export async function executeTool(
  toolCall: ToolCall,
  options: ToolExecutorOptions,
): Promise<ToolResult> {
  const { companyRoot, roleId, orgTree, onDispatch, onConsult, onToolExec } = options;
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

  // AKB Level 0 hint: 새 .md 파일 생성 시 (journal 제외)
  if (isNewFile && filePath.endsWith('.md') && !filePath.includes('journal/')) {
    result += '\n\n[AKB] 새 .md 파일입니다. 확인: '
      + '(1) search_files로 기존 문서를 검색했는가? '
      + '(2) 관련 Hub에 등록했는가? '
      + '(3) cross-link를 추가했는가?';
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
