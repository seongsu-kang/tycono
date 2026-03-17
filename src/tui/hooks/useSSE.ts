/**
 * useSSE — subscribe to wave SSE stream
 */

import { useState, useEffect, useRef, useCallback } from 'react';
import { subscribeToWaveStream, type SSEEvent, type SSEConnection } from '../api';

const MAX_EVENTS = 500;

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

  const clearEvents = useCallback(() => {
    setEvents([]);
  }, []);

  useEffect(() => {
    // Disconnect if waveId changed
    if (waveIdRef.current !== waveId) {
      connRef.current?.close();
      connRef.current = null;
      waveIdRef.current = waveId;
    }

    if (!waveId) {
      setStreamStatus('idle');
      return;
    }

    setStreamStatus('streaming');
    setEvents([]);

    const conn = subscribeToWaveStream(
      waveId,
      (event) => {
        setEvents((prev) => {
          const next = [...prev, event];
          return next.length > MAX_EVENTS ? next.slice(-MAX_EVENTS) : next;
        });
      },
      (reason) => {
        if (reason === 'done') {
          setStreamStatus('done');
        } else if (reason === 'error') {
          setStreamStatus('error');
        } else {
          setStreamStatus('done');
        }
      },
    );

    connRef.current = conn;

    return () => {
      conn.close();
    };
  }, [waveId]);

  return { events, streamStatus, clearEvents };
}
