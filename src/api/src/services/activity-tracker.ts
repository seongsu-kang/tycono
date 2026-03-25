import fs from 'node:fs';
import path from 'node:path';
import { COMPANY_ROOT } from './file-reader.js';
import type { RoleStatus } from '../../../shared/types.js';

function activityDir(): string {
  return path.join(COMPANY_ROOT, '.tycono', 'activity');
}

export interface RoleActivity {
  roleId: string;
  status: RoleStatus;
  currentTask: string;
  startedAt: string;
  updatedAt: string;
  recentOutput: string;
}

function activityPath(roleId: string): string {
  return path.join(activityDir(), `${roleId}.json`);
}

function ensureDir(): void {
  const dir = activityDir();
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

export function setActivity(roleId: string, task: string): void {
  ensureDir();
  const activity: RoleActivity = {
    roleId,
    status: 'working',
    currentTask: task,
    startedAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    recentOutput: '',
  };
  fs.writeFileSync(activityPath(roleId), JSON.stringify(activity, null, 2));
  invalidateCache();
}

export function updateActivity(roleId: string, output: string): void {
  const activity = getActivity(roleId);
  if (!activity) return;
  activity.updatedAt = new Date().toISOString();
  activity.recentOutput = output.slice(-500);
  fs.writeFileSync(activityPath(roleId), JSON.stringify(activity, null, 2));
  invalidateCache();
}

export function markAwaitingInput(roleId: string): void {
  const activity = getActivity(roleId);
  if (!activity) return;
  activity.status = 'awaiting_input';
  activity.updatedAt = new Date().toISOString();
  fs.writeFileSync(activityPath(roleId), JSON.stringify(activity, null, 2));
  invalidateCache();
}

export function completeActivity(roleId: string): void {
  const activity = getActivity(roleId);
  if (!activity) return;
  activity.status = 'done';
  activity.updatedAt = new Date().toISOString();
  fs.writeFileSync(activityPath(roleId), JSON.stringify(activity, null, 2));
  invalidateCache();
}

export function clearActivity(roleId: string): void {
  const filePath = activityPath(roleId);
  if (fs.existsSync(filePath)) {
    fs.unlinkSync(filePath);
  }
  invalidateCache();
}

export function getActivity(roleId: string): RoleActivity | null {
  const filePath = activityPath(roleId);
  if (!fs.existsSync(filePath)) return null;
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf-8'));
  } catch {
    return null;
  }
}

/** Cached getAllActivities — avoids re-reading files within TTL window */
let _activitiesCache: RoleActivity[] | null = null;
let _activitiesCacheTs = 0;
const ACTIVITIES_CACHE_TTL = 500; // ms

export function getAllActivities(): RoleActivity[] {
  const now = Date.now();
  if (_activitiesCache && now - _activitiesCacheTs < ACTIVITIES_CACHE_TTL) {
    return _activitiesCache;
  }
  ensureDir();
  const files = fs.readdirSync(activityDir()).filter(f => f.endsWith('.json'));
  _activitiesCache = files.map(f => {
    try {
      return JSON.parse(fs.readFileSync(path.join(activityDir(), f), 'utf-8'));
    } catch {
      return null;
    }
  }).filter((a): a is RoleActivity => a !== null);
  _activitiesCacheTs = now;
  return _activitiesCache;
}

/** Invalidate cache after writes (setActivity, updateActivity, completeActivity) */
function invalidateCache(): void {
  _activitiesCache = null;
}
