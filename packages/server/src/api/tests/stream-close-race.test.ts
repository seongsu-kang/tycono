/**
 * BUG-APPROVAL Stream Close Race Test
 *
 * Verifies that when a first execution's cleanup closes the ActivityStream,
 * a continuation execution on the same session gets a new stream,
 * and subscribers on the old stream are lost.
 *
 * The fix ensures stream.close() is skipped when a sibling execution is active.
 */
import { describe, test, expect, beforeAll, afterAll } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

let tmpDir: string;

beforeAll(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'tycono-stream-test-'));
  process.env.COMPANY_ROOT = tmpDir;
  fs.mkdirSync(path.join(tmpDir, '.tycono', 'activity-streams'), { recursive: true });
});

afterAll(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
  delete process.env.COMPANY_ROOT;
});

describe('ActivityStream close race (BUG-APPROVAL)', () => {

  test('stream.close() clears subscribers and marks closed', async () => {
    const { ActivityStream } = await import('../src/services/activity-stream.js');

    const sessionId = `ses-ceo-close-test-${Date.now()}`;
    const stream = ActivityStream.getOrCreate(sessionId, 'ceo');

    const received: string[] = [];
    stream.subscribe((event) => { received.push(event.type); });

    stream.emit('text', 'ceo', { text: 'hello' });
    expect(received).toEqual(['text']);

    stream.close();
    expect(stream.isClosed).toBe(true);
    expect(stream.subscriberCount).toBe(0);

    // After close, events are not delivered
    stream.emit('msg:done', 'ceo', {});
    expect(received).toEqual(['text']); // unchanged
  });

  test('getOrCreate returns NEW stream after close (subscribers lost)', async () => {
    const { ActivityStream } = await import('../src/services/activity-stream.js');

    const sessionId = `ses-ceo-race-test-${Date.now()}`;

    // First stream (original execution)
    const stream1 = ActivityStream.getOrCreate(sessionId, 'ceo');
    const received1: string[] = [];
    stream1.subscribe((event) => { received1.push(event.type); });

    // Simulate stream close (30s cleanup timer)
    stream1.close();

    // Second stream (continuation execution) — different object!
    const stream2 = ActivityStream.getOrCreate(sessionId, 'ceo');
    expect(stream2).not.toBe(stream1); // New stream created

    // Events on stream2 are NOT received by stream1's subscriber
    stream2.emit('approval:needed', 'ceo', { question: 'test' });
    stream2.emit('msg:done', 'ceo', {});

    expect(received1).toEqual([]); // stream1 subscriber sees NOTHING from stream2
  });

  test('getOrCreate returns SAME stream when not closed (subscribers preserved)', async () => {
    const { ActivityStream } = await import('../src/services/activity-stream.js');

    const sessionId = `ses-ceo-same-test-${Date.now()}`;

    // First stream
    const stream1 = ActivityStream.getOrCreate(sessionId, 'ceo');
    const received: string[] = [];
    stream1.subscribe((event) => { received.push(event.type); });

    // Second getOrCreate WITHOUT close — returns same stream
    const stream2 = ActivityStream.getOrCreate(sessionId, 'ceo');
    expect(stream2).toBe(stream1); // Same object

    // Events on stream2 ARE received by subscriber
    stream2.emit('approval:needed', 'ceo', { question: 'test' });
    expect(received).toEqual(['approval:needed']); // ✅ subscriber preserved
  });
});
