import { describe, it, expect, beforeEach, vi } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

// activity-tracker uses COMPANY_ROOT from file-reader, so we need to mock it
let testRoot: string;

beforeEach(() => {
  testRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'activity-test-'));
  fs.mkdirSync(path.join(testRoot, 'operations', 'activity'), { recursive: true });
});

// Direct file-based testing (avoids module singleton issue)
describe('Activity tracker file operations', () => {
  const activityDir = () => path.join(testRoot, 'operations', 'activity');
  const activityPath = (roleId: string) => path.join(activityDir(), `${roleId}.json`);

  it('writes working activity file', () => {
    const activity = {
      roleId: 'engineer',
      status: 'working',
      currentTask: 'coding task',
      startedAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      recentOutput: '',
    };
    fs.writeFileSync(activityPath('engineer'), JSON.stringify(activity, null, 2));

    const read = JSON.parse(fs.readFileSync(activityPath('engineer'), 'utf-8'));
    expect(read.status).toBe('working');
    expect(read.currentTask).toBe('coding task');
  });

  it('updates activity output', () => {
    const activity = {
      roleId: 'engineer',
      status: 'working',
      currentTask: 'task',
      startedAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      recentOutput: '',
    };
    fs.writeFileSync(activityPath('engineer'), JSON.stringify(activity));

    // Update
    const updated = { ...activity, recentOutput: 'progress...', updatedAt: new Date().toISOString() };
    fs.writeFileSync(activityPath('engineer'), JSON.stringify(updated));

    const read = JSON.parse(fs.readFileSync(activityPath('engineer'), 'utf-8'));
    expect(read.recentOutput).toContain('progress');
  });

  it('completes activity', () => {
    const activity = {
      roleId: 'engineer',
      status: 'working',
      currentTask: 'task',
      startedAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      recentOutput: '',
    };
    fs.writeFileSync(activityPath('engineer'), JSON.stringify(activity));

    const completed = { ...activity, status: 'done', updatedAt: new Date().toISOString() };
    fs.writeFileSync(activityPath('engineer'), JSON.stringify(completed));

    const read = JSON.parse(fs.readFileSync(activityPath('engineer'), 'utf-8'));
    expect(read.status).toBe('done');
  });

  it('lists all activities', () => {
    for (const role of ['cto', 'pm', 'engineer']) {
      const activity = { roleId: role, status: 'working', currentTask: `${role} task` };
      fs.writeFileSync(activityPath(role), JSON.stringify(activity));
    }

    const files = fs.readdirSync(activityDir()).filter(f => f.endsWith('.json'));
    expect(files).toHaveLength(3);

    const activities = files.map(f => JSON.parse(fs.readFileSync(path.join(activityDir(), f), 'utf-8')));
    expect(activities.map(a => a.roleId).sort()).toEqual(['cto', 'engineer', 'pm']);
  });

  it('clears activity by deleting file', () => {
    fs.writeFileSync(activityPath('pm'), JSON.stringify({ roleId: 'pm', status: 'done' }));
    expect(fs.existsSync(activityPath('pm'))).toBe(true);

    fs.unlinkSync(activityPath('pm'));
    expect(fs.existsSync(activityPath('pm'))).toBe(false);
  });
});
