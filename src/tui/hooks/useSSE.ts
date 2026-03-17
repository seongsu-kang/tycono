/**
 * useSSE — subscribe to wave SSE stream with auto-reconnect
 *
 * Events are stored with trimmed data to prevent OOM:
 * - text/thinking: keep only displayable portion
 * - msg:start task: truncate long supervisor prompts
 * - tool inputs: summarize
 */

import { useState, useEffect, useRef, useCallback } from 'react';
import { subscribeToWaveStream, type SSEEvent, type SSEConnection } from '../api';

const MAX_EVENTS = 150;
const RECONNECT_DELAY_MS = 3000;
const MAX_RECONNECT_DELAY_MS = 15000;

/** Trim event data to prevent memory bloat */
function trimEvent(event: SSEEvent): SSEEvent {
  const data = { ...event.data };

  // Truncate large text fields
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
  // Summarize tool inputs
  if (data.input && typeof data.input === 'object') {
    const inp = data.input as Record<string, unknown>;
    const summary: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(inp)) {
      if (typeof v === 'string' && v.length > 200) {
        summary[k] = v.slice(0, 200);
      } else {
        summary[k] = v;
      }
    }
    data.input = summary;
  }

  return { ...event, data };
}

export interface SSEState {
  events: SSEEvent[];
  streamStatus: 'idle' | 'streaming' | 'done' | 'error';
  clearEvents(): void;
}

export function useSSE(waveId: string | null): SSEState {
  const [events, setEvents] = useState<SSEEvent[]>([]);
  const [streamStatus, setStreamStatus] = useState<'idle' | 'streaming' | 'done' | 'error'>('idle');
  const connRef = useRef<SSEConnection | null>(null);
  const waveIdRef = useRef<string | null>(null);
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const reconnectAttemptRef = useRef(0);
  const maxSeqRef = useRef(0);

  const clearEvents = useCallback(() => {
    setEvents([]);
    maxSeqRef.current = 0;
  }, []);

  useEffect(() => {
    if (waveIdRef.current !== waveId) {
      connRef.current?.close();
      connRef.current = null;
      waveIdRef.current = waveId;
      reconnectAttemptRef.current = 0;
      if (reconnectTimerRef.current) {
        clearTimeout(reconnectTimerRef.current);
        reconnectTimerRef.current = null;
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
        maxSeqRef.current = 0;
      }

      const conn = subscribeToWaveStream(
        waveId,
        (event) => {
          if (event.seq !== undefined && event.seq > maxSeqRef.current) {
            maxSeqRef.current = event.seq;
          }
          reconnectAttemptRef.current = 0;

          const trimmed = trimEvent(event);
          setEvents((prev) => {
            const next = [...prev, trimmed];
            return next.length > MAX_EVENTS ? next.slice(-MAX_EVENTS) : next;
          });
        },
        (reason) => {
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
    };
  }, [waveId]);

  return { events, streamStatus, clearEvents };
}
