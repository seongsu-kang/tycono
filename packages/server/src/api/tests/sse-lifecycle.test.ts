import { describe, test, expect, vi, beforeEach, afterEach } from 'vitest';
import { EventEmitter } from 'node:events';
import { spawn } from 'node:child_process';

/* ─── Mock helpers ─────────────────────────────── */

/** Minimal ServerResponse mock */
function createMockResponse() {
  let ended = false;
  let destroyed = false;
  const chunks: string[] = [];

  return {
    get destroyed() { return destroyed; },
    get writableEnded() { return ended; },
    writeHead: vi.fn(),
    write: vi.fn((chunk: string) => {
      if (ended || destroyed) throw new Error('write after end');
      chunks.push(chunk);
      return true;
    }),
    end: vi.fn(() => { ended = true; }),
    destroy: () => { destroyed = true; },
    chunks,
    // Expose for assertions
    _setEnded: () => { ended = true; },
    _setDestroyed: () => { destroyed = true; },
  };
}

/* ─── sendSSE guard tests ──────────────────────── */

describe('sendSSE — destroyed/ended response guard', () => {
  // Inline the function to test in isolation
  function sendSSE(res: ReturnType<typeof createMockResponse>, event: string, data: unknown): boolean {
    if (res.destroyed || res.writableEnded) return false;
    try {
      res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
      return true;
    } catch {
      return false;
    }
  }

  test('writes SSE to active response', () => {
    const res = createMockResponse();
    const ok = sendSSE(res, 'output', { text: 'hello' });
    expect(ok).toBe(true);
    expect(res.chunks).toHaveLength(1);
    expect(res.chunks[0]).toContain('event: output');
    expect(res.chunks[0]).toContain('"text":"hello"');
  });

  test('returns false for ended response', () => {
    const res = createMockResponse();
    res._setEnded();
    const ok = sendSSE(res, 'output', { text: 'hello' });
    expect(ok).toBe(false);
    expect(res.write).not.toHaveBeenCalled();
  });

  test('returns false for destroyed response', () => {
    const res = createMockResponse();
    res._setDestroyed();
    const ok = sendSSE(res, 'output', { text: 'hello' });
    expect(ok).toBe(false);
    expect(res.write).not.toHaveBeenCalled();
  });

  test('returns false when write throws', () => {
    const res = createMockResponse();
    res.write = vi.fn(() => { throw new Error('EPIPE'); });
    const ok = sendSSE(res, 'output', { text: 'hello' });
    expect(ok).toBe(false);
  });
});

/* ─── SSE heartbeat lifecycle tests ────────────── */

describe('SSE heartbeat lifecycle', () => {
  beforeEach(() => { vi.useFakeTimers(); });
  afterEach(() => { vi.useRealTimers(); });

  function startSSELifecycle(
    res: ReturnType<typeof createMockResponse>,
    onTimeout: () => void,
  ): () => void {
    const SSE_HEARTBEAT_MS = 15_000;
    const SSE_TIMEOUT_MS = 10 * 60 * 1000;

    const heartbeat = setInterval(() => {
      if (res.destroyed || res.writableEnded) {
        clearInterval(heartbeat);
        return;
      }
      try { res.write(': heartbeat\n\n'); } catch { clearInterval(heartbeat); }
    }, SSE_HEARTBEAT_MS);

    const timeout = setTimeout(() => {
      onTimeout();
    }, SSE_TIMEOUT_MS);

    return () => {
      clearInterval(heartbeat);
      clearTimeout(timeout);
    };
  }

  test('sends heartbeat every 15 seconds', () => {
    const res = createMockResponse();
    const cleanup = startSSELifecycle(res, vi.fn());

    vi.advanceTimersByTime(15_000);
    expect(res.chunks.filter(c => c.includes('heartbeat'))).toHaveLength(1);

    vi.advanceTimersByTime(15_000);
    expect(res.chunks.filter(c => c.includes('heartbeat'))).toHaveLength(2);

    cleanup();
  });

  test('stops heartbeat when response is ended', () => {
    const res = createMockResponse();
    const cleanup = startSSELifecycle(res, vi.fn());

    vi.advanceTimersByTime(15_000);
    expect(res.chunks.filter(c => c.includes('heartbeat'))).toHaveLength(1);

    res._setEnded();
    vi.advanceTimersByTime(15_000);
    // Should not have sent another heartbeat
    expect(res.chunks.filter(c => c.includes('heartbeat'))).toHaveLength(1);

    cleanup();
  });

  test('fires timeout after 10 minutes', () => {
    const res = createMockResponse();
    const onTimeout = vi.fn();
    const cleanup = startSSELifecycle(res, onTimeout);

    vi.advanceTimersByTime(10 * 60 * 1000);
    expect(onTimeout).toHaveBeenCalledOnce();

    cleanup();
  });

  test('cleanup prevents timeout and heartbeat', () => {
    const res = createMockResponse();
    const onTimeout = vi.fn();
    const cleanup = startSSELifecycle(res, onTimeout);

    // Cleanup immediately
    cleanup();

    vi.advanceTimersByTime(10 * 60 * 1000);
    expect(onTimeout).not.toHaveBeenCalled();
    expect(res.chunks).toHaveLength(0);
  });
});

/* ─── Runner exit safety net tests ─────────────── */

describe('Runner exit → close safety net', () => {
  beforeEach(() => { vi.useFakeTimers(); });
  afterEach(() => { vi.useRealTimers(); });

  test('resolves normally on close event', async () => {
    let resolved = false;
    let resolvedValue: { output: string } | null = null;

    const proc = new EventEmitter();

    const promise = new Promise<{ output: string }>((resolve) => {
      let safetyResolved = false;

      proc.on('exit', () => {
        setTimeout(() => {
          if (!safetyResolved) {
            safetyResolved = true;
            resolve({ output: 'safety-net' });
          }
        }, 5000);
      });

      proc.on('close', () => {
        if (safetyResolved) return;
        safetyResolved = true;
        resolve({ output: 'normal-close' });
      });
    });

    promise.then((v) => {
      resolved = true;
      resolvedValue = v;
    });

    // Emit exit then close (normal flow)
    proc.emit('exit', 0, null);
    proc.emit('close', 0, null);

    // Flush microtasks
    await vi.advanceTimersByTimeAsync(0);

    expect(resolved).toBe(true);
    expect(resolvedValue!.output).toBe('normal-close');
  });

  test('safety net resolves if close never fires after exit', async () => {
    let resolvedValue: { output: string } | null = null;

    const proc = new EventEmitter();

    const promise = new Promise<{ output: string }>((resolve) => {
      let safetyResolved = false;

      proc.on('exit', () => {
        setTimeout(() => {
          if (!safetyResolved) {
            safetyResolved = true;
            resolve({ output: 'safety-net' });
          }
        }, 5000);
      });

      proc.on('close', () => {
        if (safetyResolved) return;
        safetyResolved = true;
        resolve({ output: 'normal-close' });
      });
    });

    promise.then((v) => { resolvedValue = v; });

    // Only emit exit, never close (simulates stuck pipe)
    proc.emit('exit', 0, null);

    // Not yet resolved
    await vi.advanceTimersByTimeAsync(1000);
    expect(resolvedValue).toBeNull();

    // After 5s safety net fires
    await vi.advanceTimersByTimeAsync(4000);
    expect(resolvedValue!.output).toBe('safety-net');
  });

  test('close after safety net is ignored', async () => {
    let resolvedValue: { output: string } | null = null;
    let resolveCount = 0;

    const proc = new EventEmitter();

    const promise = new Promise<{ output: string }>((resolve) => {
      let safetyResolved = false;

      proc.on('exit', () => {
        setTimeout(() => {
          if (!safetyResolved) {
            safetyResolved = true;
            resolve({ output: 'safety-net' });
          }
        }, 5000);
      });

      proc.on('close', () => {
        if (safetyResolved) return;
        safetyResolved = true;
        resolve({ output: 'late-close' });
      });
    });

    promise.then((v) => {
      resolveCount++;
      resolvedValue = v;
    });

    proc.emit('exit', 0, null);
    await vi.advanceTimersByTimeAsync(5000);

    // Safety net resolved
    expect(resolvedValue!.output).toBe('safety-net');

    // Late close arrives
    proc.emit('close', 0, null);
    await vi.advanceTimersByTimeAsync(0);

    // Should not double-resolve (promise only resolves once, but we verify our guard)
    expect(resolveCount).toBe(1);
  });
});

/* ─── Client stale detection tests ─────────────── */

describe('Client stale connection detection', () => {
  beforeEach(() => { vi.useFakeTimers(); });
  afterEach(() => { vi.useRealTimers(); });

  test('detects stale connection after 60s of no data', async () => {
    let lastDataAt = Date.now();
    const STALE_TIMEOUT_MS = 60_000;
    let staleDetected = false;

    const staleCheck = setInterval(() => {
      if (Date.now() - lastDataAt > STALE_TIMEOUT_MS) {
        clearInterval(staleCheck);
        staleDetected = true;
      }
    }, 10_000);

    // Advance 50s — not yet stale
    vi.advanceTimersByTime(50_000);
    expect(staleDetected).toBe(false);

    // Advance to 70s — stale
    vi.advanceTimersByTime(20_000);
    expect(staleDetected).toBe(true);

    clearInterval(staleCheck);
  });

  test('resets stale timer on data received', () => {
    let lastDataAt = Date.now();
    const STALE_TIMEOUT_MS = 60_000;
    let staleDetected = false;

    const staleCheck = setInterval(() => {
      if (Date.now() - lastDataAt > STALE_TIMEOUT_MS) {
        clearInterval(staleCheck);
        staleDetected = true;
      }
    }, 10_000);

    // Advance 50s
    vi.advanceTimersByTime(50_000);
    expect(staleDetected).toBe(false);

    // Simulate data arrival — reset timer
    lastDataAt = Date.now();

    // Advance another 50s (total 100s, but only 50s since last data)
    vi.advanceTimersByTime(50_000);
    expect(staleDetected).toBe(false);

    // Advance another 20s (70s since last data) — now stale
    vi.advanceTimersByTime(20_000);
    expect(staleDetected).toBe(true);

    clearInterval(staleCheck);
  });

  test('heartbeat prevents staleness', () => {
    let lastDataAt = Date.now();
    const STALE_TIMEOUT_MS = 60_000;
    let staleDetected = false;

    const staleCheck = setInterval(() => {
      if (Date.now() - lastDataAt > STALE_TIMEOUT_MS) {
        clearInterval(staleCheck);
        staleDetected = true;
      }
    }, 10_000);

    // Simulate heartbeats every 15s for 5 minutes
    for (let i = 0; i < 20; i++) {
      vi.advanceTimersByTime(15_000);
      lastDataAt = Date.now(); // heartbeat = data
    }

    // 5 minutes passed, but never stale due to heartbeats
    expect(staleDetected).toBe(false);

    clearInterval(staleCheck);
  });
});

/* ─── Integration: spawn + safety net ──────────── */

describe('Integration: real child_process exit/close', () => {
  test('short-lived process fires both exit and close', async () => {
    const events: string[] = [];

    const proc = spawn('echo', ['hello']);

    await new Promise<void>((resolve) => {
      proc.on('exit', () => { events.push('exit'); });
      proc.on('close', () => {
        events.push('close');
        resolve();
      });
    });

    expect(events).toContain('exit');
    expect(events).toContain('close');
    // 'exit' should come before or at same time as 'close'
    expect(events.indexOf('exit')).toBeLessThanOrEqual(events.indexOf('close'));
  });
});
