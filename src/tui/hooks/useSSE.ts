/**
 * useSSE — subscribe to wave SSE stream with auto-reconnect
 *
 * Performance: batches events and updates React state max once per 300ms
 * to prevent fullscreen Panel Mode from re-rendering on every text chunk.
 */

import { useState, useEffect, useRef, useCallback } from 'react';
import { subscribeToWaveStream, type SSEEvent, type SSEConnection } from '../api';

const MAX_EVENTS = 100;
const RECONNECT_DELAY_MS = 3000;
const MAX_RECONNECT_DELAY_MS = 15000;
const BATCH_INTERVAL_MS = 300; // Throttle: update React state max ~3x/sec

/** Trim event data to prevent memory bloat */
function trimEvent(event: SSEEvent): SSEEvent {
  const data = { ...event.data };

  if (typeof data.text === 'string' && data.text.length > 500) {
    data.text = data.text.slice(0, 500);
  }
  if (typeof data.task === 'string' && data.task.length > 200) {
    data.task = data.task.slice(0, 200);
  }
  if (typeof data.error === 'string' && data.error.length > 300) {
    data.error = data.error.slice(0, 300);
  }
  if (typeof data.message === 'string' && data.message.length > 300) {
    data.message = data.message.slice(0, 300);
  }
  if (data.input && typeof data.input === 'object') {
    const inp = data.input as Record<string, unknown>;
    const summary: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(inp)) {
      summary[k] = typeof v === 'string' && v.length > 200 ? v.slice(0, 200) : v;
    }
    data.input = summary;
  }

  return { ...event, data };
}

export interface SSEState {
  events: SSEEvent[];
  streamStatus: 'idle' | 'streaming' | 'done' | 'error';
  clearEvents(): void;
  loadHistory(events: SSEEvent[]): void;
}

export function useSSE(waveId: string | null): SSEState {
  const [events, setEvents] = useState<SSEEvent[]>([]);
  const [streamStatus, setStreamStatus] = useState<'idle' | 'streaming' | 'done' | 'error'>('idle');
  const connRef = useRef<SSEConnection | null>(null);
  const waveIdRef = useRef<string | null>(null);
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const reconnectAttemptRef = useRef(0);
  const maxSeqRef = useRef(0);

  // Batch buffer — accumulate events, flush to React state periodically
  const batchRef = useRef<SSEEvent[]>([]);
  const batchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const flushBatch = useCallback(() => {
    batchTimerRef.current = null;
    const batch = batchRef.current;
    if (batch.length === 0) return;
    batchRef.current = [];

    setEvents((prev) => {
      const next = [...prev, ...batch];
      return next.length > MAX_EVENTS ? next.slice(-MAX_EVENTS) : next;
    });
  }, []);

  const clearEvents = useCallback(() => {
    batchRef.current = [];
    setEvents([]);
    maxSeqRef.current = 0;
  }, []);

  const loadHistory = useCallback((historyEvents: SSEEvent[]) => {
    setEvents(historyEvents.slice(-MAX_EVENTS));
  }, []);

  useEffect(() => {
    if (waveIdRef.current !== waveId) {
      connRef.current?.close();
      connRef.current = null;
      waveIdRef.current = waveId;
      reconnectAttemptRef.current = 0;
      batchRef.current = [];
      if (reconnectTimerRef.current) {
        clearTimeout(reconnectTimerRef.current);
        reconnectTimerRef.current = null;
      }
      if (batchTimerRef.current) {
        clearTimeout(batchTimerRef.current);
        batchTimerRef.current = null;
      }
    }

    if (!waveId) {
      setStreamStatus('idle');
      return;
    }

    const connect = (fromSeq: number) => {
      setStreamStatus('streaming');

      if (fromSeq === 0) {
        setEvents([]);
        batchRef.current = [];
        maxSeqRef.current = 0;
      }

      const conn = subscribeToWaveStream(
        waveId,
        (event) => {
          if (event.seq !== undefined && event.seq > maxSeqRef.current) {
            maxSeqRef.current = event.seq;
          }
          reconnectAttemptRef.current = 0;

          // Add to batch buffer (don't trigger React re-render yet)
          // Cap batch to prevent unbounded growth if flush is delayed
          if (batchRef.current.length < 50) {
            batchRef.current.push(trimEvent(event));
          }

          // Schedule flush if not already scheduled
          if (!batchTimerRef.current) {
            batchTimerRef.current = setTimeout(flushBatch, BATCH_INTERVAL_MS);
          }
        },
        (reason) => {
          // Flush remaining events before status change
          flushBatch();

          if (reason === 'done') {
            setStreamStatus('done');
          } else {
            const attempt = reconnectAttemptRef.current++;
            const delay = Math.min(
              RECONNECT_DELAY_MS * Math.pow(1.5, attempt),
              MAX_RECONNECT_DELAY_MS,
            );
            setStreamStatus('streaming');
            reconnectTimerRef.current = setTimeout(() => {
              reconnectTimerRef.current = null;
              if (waveIdRef.current === waveId) {
                connect(maxSeqRef.current);
              }
            }, delay);
          }
        },
        fromSeq,
      );

      connRef.current = conn;
    };

    connect(0);

    return () => {
      connRef.current?.close();
      connRef.current = null;
      if (reconnectTimerRef.current) {
        clearTimeout(reconnectTimerRef.current);
        reconnectTimerRef.current = null;
      }
      if (batchTimerRef.current) {
        clearTimeout(batchTimerRef.current);
        batchTimerRef.current = null;
      }
    };
  }, [waveId, flushBatch]);

  return { events, streamStatus, clearEvents, loadHistory };
}
