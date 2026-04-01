import { useState, useEffect, useRef, useCallback } from 'react';
import type { ActivityEvent, StreamStatus } from '../types';
export type { StreamStatus } from '../types';

interface UseActivityStreamResult {
  events: ActivityEvent[];
  status: StreamStatus;
  textOutput: string;
  childSessionIds: string[];
  reconnect: () => void;
}

/** Session-only activity stream hook. Connects to /api/sessions/:id/stream */
export default function useActivityStream(sessionId: string | null): UseActivityStreamResult {
  const [events, setEvents] = useState<ActivityEvent[]>([]);
  const [status, setStatus] = useState<StreamStatus>('idle');
  const [textOutput, setTextOutput] = useState('');
  const [childSessionIds, setChildSessionIds] = useState<string[]>([]);
  const lastSeqRef = useRef(-1);
  const controllerRef = useRef<AbortController | null>(null);
  const reconnectRef = useRef(0);

  const connect = useCallback(() => {
    if (!sessionId) return;

    controllerRef.current?.abort();
    const controller = new AbortController();
    controllerRef.current = controller;

    setStatus('connecting');

    const fromSeq = lastSeqRef.current + 1;
    const url = `/api/sessions/${sessionId}/stream?from=${fromSeq}`;

    fetch(url, { signal: controller.signal })
      .then(async (response) => {
        if (!response.ok || !response.body) {
          setStatus('error');
          return;
        }

        setStatus('streaming');
        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = '';

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split('\n');
          buffer = lines.pop() ?? '';

          let currentEvent = '';
          for (const line of lines) {
            if (line.startsWith('event: ')) {
              currentEvent = line.slice(7).trim();
            } else if (line.startsWith('data: ')) {
              try {
                const data = JSON.parse(line.slice(6));

                if (currentEvent === 'activity') {
                  const event = data as ActivityEvent;

                  if (event.seq > lastSeqRef.current) {
                    lastSeqRef.current = event.seq;
                  }

                  setEvents((prev) => {
                    if (prev.some(e => e.seq === event.seq)) return prev;
                    return [...prev, event];
                  });

                  if (event.type === 'text') {
                    setTextOutput((prev) => prev + (event.data.text as string ?? ''));
                  }

                  if (event.type === 'dispatch:start' && event.data.childSessionId) {
                    setChildSessionIds((prev) => [...prev, event.data.childSessionId as string]);
                  }

                  if (event.type === 'msg:done') {
                    setStatus('done');
                  } else if (event.type === 'msg:error') {
                    setStatus('error');
                  }
                } else if (currentEvent === 'stream:end') {
                  const reason = data.reason as string;
                  if (reason === 'done') setStatus('done');
                  else if (reason === 'error') setStatus('error');
                  else setStatus('done');
                }
              } catch { /* skip malformed */ }
              currentEvent = '';
            }
          }
        }

        // Stream ended naturally
        if (status === 'streaming') {
          setStatus('done');
        }
      })
      .catch((err) => {
        if (err.name === 'AbortError') return;
        setStatus('error');

        if (reconnectRef.current < 3) {
          reconnectRef.current++;
          setTimeout(connect, 1000 * reconnectRef.current);
        }
      });
  }, [sessionId]);

  const reconnect = useCallback(() => {
    reconnectRef.current = 0;
    connect();
  }, [connect]);

  useEffect(() => {
    if (!sessionId) {
      setEvents([]);
      setStatus('idle');
      setTextOutput('');
      setChildSessionIds([]);
      lastSeqRef.current = -1;
      return;
    }

    setEvents([]);
    setTextOutput('');
    setChildSessionIds([]);
    lastSeqRef.current = -1;
    reconnectRef.current = 0;

    connect();

    return () => {
      controllerRef.current?.abort();
    };
  }, [sessionId, connect]);

  return { events, status, textOutput, childSessionIds, reconnect };
}
