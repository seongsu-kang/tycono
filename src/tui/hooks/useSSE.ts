/**
 * useSSE — subscribe to wave SSE stream with auto-reconnect
 */

import { useState, useEffect, useRef, useCallback } from 'react';
import { subscribeToWaveStream, type SSEEvent, type SSEConnection } from '../api';

const MAX_EVENTS = 500;
const RECONNECT_DELAY_MS = 3000;
const MAX_RECONNECT_DELAY_MS = 15000;

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
    // Disconnect if waveId changed
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

      // Only clear events on first connect (not reconnects)
      if (fromSeq === 0) {
        setEvents([]);
        maxSeqRef.current = 0;
      }

      const conn = subscribeToWaveStream(
        waveId,
        (event) => {
          // Track max seq for reconnect resume
          if (event.seq !== undefined && event.seq > maxSeqRef.current) {
            maxSeqRef.current = event.seq;
          }
          reconnectAttemptRef.current = 0; // Reset on successful event

          setEvents((prev) => {
            const next = [...prev, event];
            return next.length > MAX_EVENTS ? next.slice(-MAX_EVENTS) : next;
          });
        },
        (reason) => {
          if (reason === 'done') {
            setStreamStatus('done');
          } else {
            // Disconnected or error → auto-reconnect
            const attempt = reconnectAttemptRef.current++;
            const delay = Math.min(
              RECONNECT_DELAY_MS * Math.pow(1.5, attempt),
              MAX_RECONNECT_DELAY_MS,
            );

            setStreamStatus('streaming'); // Keep showing streaming during reconnect

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
