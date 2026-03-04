import { useState, useEffect, useRef, useCallback } from 'react';
import type { ActivityEvent } from '../types';

export type StreamStatus = 'idle' | 'connecting' | 'streaming' | 'done' | 'error';

interface UseActivityStreamResult {
  events: ActivityEvent[];
  status: StreamStatus;
  textOutput: string;
  childJobIds: string[];
  reconnect: () => void;
}

export default function useActivityStream(jobId: string | null): UseActivityStreamResult {
  const [events, setEvents] = useState<ActivityEvent[]>([]);
  const [status, setStatus] = useState<StreamStatus>('idle');
  const [textOutput, setTextOutput] = useState('');
  const [childJobIds, setChildJobIds] = useState<string[]>([]);
  const lastSeqRef = useRef(-1);
  const controllerRef = useRef<AbortController | null>(null);
  const reconnectRef = useRef(0);

  const connect = useCallback(() => {
    if (!jobId) return;

    controllerRef.current?.abort();
    const controller = new AbortController();
    controllerRef.current = controller;

    setStatus('connecting');

    const fromSeq = lastSeqRef.current + 1;
    const url = `/api/jobs/${jobId}/stream?from=${fromSeq}`;

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

                  // Track last seq for reconnection
                  if (event.seq > lastSeqRef.current) {
                    lastSeqRef.current = event.seq;
                  }

                  setEvents((prev) => {
                    // Dedup by seq
                    if (prev.some(e => e.seq === event.seq)) return prev;
                    return [...prev, event];
                  });

                  // Accumulate text output
                  if (event.type === 'text') {
                    setTextOutput((prev) => prev + (event.data.text as string ?? ''));
                  }

                  // Track child job IDs from dispatch events
                  if (event.type === 'dispatch:start' && event.data.childJobId) {
                    setChildJobIds((prev) => [...prev, event.data.childJobId as string]);
                  }

                  // Update status on job completion
                  if (event.type === 'job:done') {
                    setStatus('done');
                  } else if (event.type === 'job:error') {
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

        // Auto-reconnect (up to 3 times)
        if (reconnectRef.current < 3) {
          reconnectRef.current++;
          setTimeout(connect, 1000 * reconnectRef.current);
        }
      });
  }, [jobId]);

  const reconnect = useCallback(() => {
    reconnectRef.current = 0;
    connect();
  }, [connect]);

  // Connect when jobId changes
  useEffect(() => {
    if (!jobId) {
      setEvents([]);
      setStatus('idle');
      setTextOutput('');
      setChildJobIds([]);
      lastSeqRef.current = -1;
      return;
    }

    // Reset state for new job
    setEvents([]);
    setTextOutput('');
    setChildJobIds([]);
    lastSeqRef.current = -1;
    reconnectRef.current = 0;

    connect();

    return () => {
      controllerRef.current?.abort();
    };
  }, [jobId, connect]);

  return { events, status, textOutput, childJobIds, reconnect };
}
