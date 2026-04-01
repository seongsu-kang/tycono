import { useRef, useCallback } from 'react';
import type { ImageAttachment } from '../types';

interface StreamCallbacks {
  onText: (text: string) => void;
  onThinking?: (text: string) => void;
  onToolUse?: (name: string, input?: Record<string, unknown>) => void;
  onDispatch?: (roleId: string, task: string) => void;
  onDispatchProgress?: (roleId: string, type: string, data: Record<string, unknown>) => void;
  onTurn?: (turn: number) => void;
  onDone: (data: { roleMessageId: string }) => void;
  onError: (message: string) => void;
}

export default function useSessionStream() {
  const controllerRef = useRef<AbortController | null>(null);

  const abort = useCallback(() => {
    controllerRef.current?.abort();
    controllerRef.current = null;
  }, []);

  const sendMessage = useCallback((
    sessionId: string,
    content: string,
    mode: 'talk' | 'do',
    callbacks: StreamCallbacks,
    attachments?: ImageAttachment[],
  ) => {
    // Abort any previous stream
    abort();

    const controller = new AbortController();
    controllerRef.current = controller;

    fetch(`/api/sessions/${sessionId}/message`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content, mode, attachments }),
      signal: controller.signal,
    }).then(async (response) => {
      if (!response.ok || !response.body) {
        callbacks.onError('Failed to connect');
        return;
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      // Stale connection detection: if no data received for 60s, consider dead
      // Server sends heartbeats every 15s, so 60s = 4 missed heartbeats
      let lastDataAt = Date.now();
      const STALE_TIMEOUT_MS = 60_000;
      const staleCheck = setInterval(() => {
        if (Date.now() - lastDataAt > STALE_TIMEOUT_MS) {
          clearInterval(staleCheck);
          controller.abort();
          callbacks.onError('Connection stale — no data received for 60s');
        }
      }, 10_000);

      try {

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        lastDataAt = Date.now();
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() ?? '';

        // Parse SSE: event lines followed by data lines
        let currentEvent = '';

        for (let i = 0; i < lines.length; i++) {
          const line = lines[i];

          if (line.startsWith('event: ')) {
            currentEvent = line.slice(7).trim();
            continue;
          }

          if (line.startsWith('data: ')) {
            let data: Record<string, unknown>;
            try {
              data = JSON.parse(line.slice(6));
            } catch {
              currentEvent = '';
              continue;
            }

            switch (currentEvent) {
              case 'thinking':
                if (data.text) callbacks.onThinking?.(data.text as string);
                break;
              case 'output':
                if (data.text) callbacks.onText(data.text as string);
                break;
              case 'tool':
                callbacks.onToolUse?.(
                  data.name as string,
                  data.input as Record<string, unknown> | undefined,
                );
                break;
              case 'dispatch':
                callbacks.onDispatch?.(
                  data.roleId as string,
                  data.task as string,
                );
                break;
              case 'dispatch:progress':
                callbacks.onDispatchProgress?.(
                  data.roleId as string,
                  data.type as string,
                  data as Record<string, unknown>,
                );
                break;
              case 'turn':
                callbacks.onTurn?.(data.turn as number);
                break;
              case 'done':
                callbacks.onDone(data as { roleMessageId: string });
                break;
              case 'error':
                callbacks.onError((data.message as string) ?? 'Unknown error');
                break;
              default:
                // Fallback: untagged data lines with text → onText
                if (data.text) callbacks.onText(data.text as string);
                break;
            }

            currentEvent = '';
          }
        }
      }

      } finally {
        clearInterval(staleCheck);
      }
    }).catch((err) => {
      if (err.name !== 'AbortError') {
        callbacks.onError(err.message);
      }
    });

    return { abort };
  }, [abort]);

  return { sendMessage, abort };
}
