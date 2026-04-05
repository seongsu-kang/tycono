/**
 * Board Store — wave-scoped task board persistence.
 *
 * Agents work through board tasks; humans intervene by editing the board.
 * Follows the same file-based pattern as wave-tracker.ts.
 *
 * Storage: .tycono/boards/{waveId}.json
 * Strategy: workflow-visibility-strategy.md §4
 */
import fs from 'node:fs';
import path from 'node:path';
import { COMPANY_ROOT } from './file-reader.js';
import type { Board, BoardTask, BoardTaskStatus, BoardHistoryEntry } from '../../../shared/types.js';
import { canBoardTaskTransition } from '../../../shared/types.js';

const BOARDS_DIR = () => path.join(COMPANY_ROOT, '.tycono', 'boards');

function ensureBoardsDir(): string {
  const dir = BOARDS_DIR();
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  return dir;
}

function boardPath(waveId: string): string {
  return path.join(ensureBoardsDir(), `${waveId}.json`);
}

/* ─── CRUD ───────────────────────────────── */

/** Create a new board for a wave */
export function createBoard(waveId: string, directive: string, tasks: BoardTask[]): Board {
  const now = new Date().toISOString();
  const board: Board = {
    waveId,
    directive,
    tasks,
    history: [],
    createdAt: now,
    updatedAt: now,
  };
  fs.writeFileSync(boardPath(waveId), JSON.stringify(board, null, 2), 'utf-8');
  console.log(`[BoardStore] Created board for wave ${waveId} with ${tasks.length} tasks`);
  return board;
}

/** Get a board by wave ID. Returns null if not found. */
export function getBoard(waveId: string): Board | null {
  const p = boardPath(waveId);
  if (!fs.existsSync(p)) return null;
  try {
    return JSON.parse(fs.readFileSync(p, 'utf-8')) as Board;
  } catch (err) {
    console.error(`[BoardStore] Failed to read board ${waveId}:`, err);
    return null;
  }
}

/** Check if a board exists for a wave */
export function hasBoard(waveId: string): boolean {
  return fs.existsSync(boardPath(waveId));
}

/** Save board to disk (internal — callers should use specific update methods) */
function saveBoard(board: Board): void {
  board.updatedAt = new Date().toISOString();
  fs.writeFileSync(boardPath(board.waveId), JSON.stringify(board, null, 2), 'utf-8');
}

/* ─── Task Operations ────────────────────── */

/** Update a task's status with transition validation */
export function updateTaskStatus(
  waveId: string, taskId: string, newStatus: BoardTaskStatus,
): { ok: boolean; error?: string } {
  const board = getBoard(waveId);
  if (!board) return { ok: false, error: 'Board not found' };

  const task = board.tasks.find(t => t.id === taskId);
  if (!task) return { ok: false, error: `Task ${taskId} not found` };

  if (!canBoardTaskTransition(task.status, newStatus)) {
    return { ok: false, error: `Cannot transition ${task.status} → ${newStatus}` };
  }

  task.status = newStatus;
  if (newStatus === 'running' && !task.startedAt) {
    task.startedAt = new Date().toISOString();
  }
  if (newStatus === 'done' || newStatus === 'skipped') {
    task.finishedAt = new Date().toISOString();
  }

  saveBoard(board);
  console.log(`[BoardStore] Task ${taskId} → ${newStatus} (wave ${waveId})`);
  return { ok: true };
}

/** Update a task's content (title, description, criteria, assignee) */
export function updateTask(
  waveId: string, taskId: string,
  updates: Partial<Pick<BoardTask, 'title' | 'description' | 'criteria' | 'assignee'>>,
): { ok: boolean; error?: string } {
  const board = getBoard(waveId);
  if (!board) return { ok: false, error: 'Board not found' };

  const task = board.tasks.find(t => t.id === taskId);
  if (!task) return { ok: false, error: `Task ${taskId} not found` };

  if (updates.title !== undefined) task.title = updates.title;
  if (updates.description !== undefined) task.description = updates.description;
  if (updates.criteria !== undefined) task.criteria = updates.criteria;
  if (updates.assignee !== undefined) task.assignee = updates.assignee;

  saveBoard(board);
  console.log(`[BoardStore] Task ${taskId} updated (wave ${waveId})`);
  return { ok: true };
}

/** Complete a task with result */
export function completeTask(
  waveId: string, taskId: string,
  result: 'pass' | 'fail', note?: string,
): { ok: boolean; error?: string } {
  const board = getBoard(waveId);
  if (!board) return { ok: false, error: 'Board not found' };

  const task = board.tasks.find(t => t.id === taskId);
  if (!task) return { ok: false, error: `Task ${taskId} not found` };

  if (task.status !== 'running') {
    return { ok: false, error: `Task ${taskId} is ${task.status}, not running` };
  }

  task.status = 'done';
  task.result = result;
  task.resultNote = note;
  task.finishedAt = new Date().toISOString();

  board.history.push({
    taskId,
    agent: task.assignee,
    result,
    note,
    ts: new Date().toISOString(),
  });

  saveBoard(board);
  console.log(`[BoardStore] Task ${taskId} completed: ${result} (wave ${waveId})`);
  return { ok: true };
}

/** Add a new task to the board */
export function addTask(
  waveId: string, task: BoardTask,
): { ok: boolean; error?: string } {
  const board = getBoard(waveId);
  if (!board) return { ok: false, error: 'Board not found' };

  if (board.tasks.some(t => t.id === task.id)) {
    return { ok: false, error: `Task ${task.id} already exists` };
  }

  board.tasks.push(task);
  saveBoard(board);
  console.log(`[BoardStore] Task ${task.id} added to wave ${waveId}`);
  return { ok: true };
}

/** Get tasks assigned to a specific role */
export function getTasksForRole(waveId: string, roleId: string): BoardTask[] {
  const board = getBoard(waveId);
  if (!board) return [];
  return board.tasks.filter(t => t.assignee === roleId);
}

/** Get the next ready task for a role (waiting + all deps done) */
export function getNextReadyTask(waveId: string, roleId: string): BoardTask | null {
  const board = getBoard(waveId);
  if (!board) return null;

  const myTasks = board.tasks.filter(t => t.assignee === roleId && t.status === 'waiting');
  for (const task of myTasks) {
    const depsReady = task.dependsOn.every(depId => {
      const dep = board.tasks.find(t => t.id === depId);
      return dep && (dep.status === 'done' || dep.status === 'skipped');
    });
    if (depsReady) return task;
  }
  return null;
}

/** List all boards */
export function listBoards(): Array<{ waveId: string; directive: string; taskCount: number; createdAt: string }> {
  const dir = BOARDS_DIR();
  if (!fs.existsSync(dir)) return [];

  const results: Array<{ waveId: string; directive: string; taskCount: number; createdAt: string }> = [];
  for (const file of fs.readdirSync(dir)) {
    if (!file.endsWith('.json')) continue;
    try {
      const data = JSON.parse(fs.readFileSync(path.join(dir, file), 'utf-8')) as Board;
      results.push({
        waveId: data.waveId,
        directive: data.directive,
        taskCount: data.tasks.length,
        createdAt: data.createdAt,
      });
    } catch { /* skip */ }
  }
  return results;
}
