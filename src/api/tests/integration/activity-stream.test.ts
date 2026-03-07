/**
 * ActivityStream 이벤트 순서 + 구독 + JSONL persistence 테스트
 */
import { describe, it, expect, beforeEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

// ActivityStream uses COMPANY_ROOT for file path — we test the event model directly
import type { ActivityEvent, ActivityEventType } from '../../src/services/activity-stream.js';

describe('ActivityStream event model', () => {
  // Simulate ActivityStream behavior without the singleton dependency
  class TestActivityStream {
    private seq = 0;
    private subscribers = new Set<(event: ActivityEvent) => void>();
    private events: ActivityEvent[] = [];
    private filePath: string;

    constructor(jobId: string, roleId: string, dir: string, parentJobId?: string) {
      this.filePath = path.join(dir, `${jobId}.jsonl`);
      fs.writeFileSync(this.filePath, '', { flag: 'w' });
    }

    emit(type: ActivityEventType, roleId: string, data: Record<string, unknown>): ActivityEvent {
      const event: ActivityEvent = {
        seq: this.seq++,
        ts: new Date().toISOString(),
        type,
        roleId,
        data,
      };
      this.events.push(event);
      fs.appendFileSync(this.filePath, JSON.stringify(event) + '\n');
      for (const cb of this.subscribers) {
        try { cb(event); } catch { /* ignore */ }
      }
      return event;
    }

    subscribe(cb: (event: ActivityEvent) => void): void {
      this.subscribers.add(cb);
    }

    unsubscribe(cb: (event: ActivityEvent) => void): void {
      this.subscribers.delete(cb);
    }

    get allEvents(): ActivityEvent[] { return this.events; }
    get subscriberCount(): number { return this.subscribers.size; }
  }

  let testDir: string;

  beforeEach(() => {
    testDir = fs.mkdtempSync(path.join(os.tmpdir(), 'stream-test-'));
  });

  it('emits events with incrementing seq numbers', () => {
    const stream = new TestActivityStream('job-1', 'cto', testDir);

    stream.emit('job:start', 'cto', { task: 'test' });
    stream.emit('text', 'cto', { text: 'hello' });
    stream.emit('job:done', 'cto', { output: 'done' });

    const events = stream.allEvents;
    expect(events).toHaveLength(3);
    expect(events[0].seq).toBe(0);
    expect(events[1].seq).toBe(1);
    expect(events[2].seq).toBe(2);
  });

  it('streams events to subscribers in order', () => {
    const stream = new TestActivityStream('job-2', 'cto', testDir);
    const received: ActivityEvent[] = [];

    stream.subscribe((event) => received.push(event));

    stream.emit('job:start', 'cto', { task: 'task' });
    stream.emit('text', 'cto', { text: 'working...' });
    stream.emit('tool:start', 'cto', { name: 'read_file', input: { path: 'x.md' } });
    stream.emit('turn:complete', 'cto', { turn: 1 });
    stream.emit('dispatch:start', 'cto', { targetRoleId: 'pm', task: 'sub-task', childJobId: 'job-3' });
    stream.emit('text', 'cto', { text: 'after dispatch' });
    stream.emit('job:done', 'cto', { output: 'complete' });

    expect(received).toHaveLength(7);
    expect(received.map(e => e.type)).toEqual([
      'job:start',
      'text',
      'tool:start',
      'turn:complete',
      'dispatch:start',
      'text',
      'job:done',
    ]);
  });

  it('persists events to JSONL file', () => {
    const stream = new TestActivityStream('job-persist', 'engineer', testDir);

    stream.emit('job:start', 'engineer', { task: 'code' });
    stream.emit('text', 'engineer', { text: 'coding...' });
    stream.emit('job:done', 'engineer', { output: 'done' });

    const filePath = path.join(testDir, 'job-persist.jsonl');
    expect(fs.existsSync(filePath)).toBe(true);

    const lines = fs.readFileSync(filePath, 'utf-8').split('\n').filter(Boolean);
    expect(lines).toHaveLength(3);

    const parsed = lines.map(l => JSON.parse(l) as ActivityEvent);
    expect(parsed[0].type).toBe('job:start');
    expect(parsed[1].type).toBe('text');
    expect(parsed[2].type).toBe('job:done');
  });

  it('unsubscribe stops receiving events', () => {
    const stream = new TestActivityStream('job-unsub', 'pm', testDir);
    const received: ActivityEvent[] = [];

    const subscriber = (event: ActivityEvent) => received.push(event);
    stream.subscribe(subscriber);

    stream.emit('text', 'pm', { text: 'before' });
    expect(received).toHaveLength(1);

    stream.unsubscribe(subscriber);
    stream.emit('text', 'pm', { text: 'after' });
    expect(received).toHaveLength(1); // Still 1 — unsubscribed
  });

  it('multiple subscribers all receive events', () => {
    const stream = new TestActivityStream('job-multi', 'cto', testDir);
    const sub1: string[] = [];
    const sub2: string[] = [];

    stream.subscribe((e) => sub1.push(e.type));
    stream.subscribe((e) => sub2.push(e.type));

    stream.emit('text', 'cto', { text: 'hello' });

    expect(sub1).toEqual(['text']);
    expect(sub2).toEqual(['text']);
  });

  it('subscriber error does not affect other subscribers', () => {
    const stream = new TestActivityStream('job-error', 'cto', testDir);
    const received: string[] = [];

    stream.subscribe(() => { throw new Error('bad subscriber'); });
    stream.subscribe((e) => received.push(e.type));

    stream.emit('text', 'cto', { text: 'hello' });
    expect(received).toEqual(['text']); // Second subscriber still works
  });
});
