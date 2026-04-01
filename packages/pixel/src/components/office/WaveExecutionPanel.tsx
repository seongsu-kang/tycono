import { useState, useEffect, useRef } from 'react';

interface Props {
  directive: string;
  onClose: () => void;
  onDone: () => void;
}

export default function WaveExecutionPanel({ directive, onClose, onDone }: Props) {
  const [output, setOutput] = useState('');
  const [status, setStatus] = useState<'connecting' | 'running' | 'done' | 'error'>('connecting');
  const [elapsed, setElapsed] = useState(0);
  const outputRef = useRef<HTMLDivElement>(null);
  const startTime = useRef(Date.now());

  useEffect(() => {
    const timer = setInterval(() => {
      setElapsed(Math.floor((Date.now() - startTime.current) / 1000));
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    const controller = new AbortController();

    fetch('/api/exec/wave', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ directive }),
      signal: controller.signal,
    }).then(async (response) => {
      if (!response.ok || !response.body) {
        setStatus('error');
        setOutput('Failed to connect to execution server.');
        return;
      }

      setStatus('running');
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() ?? '';

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            try {
              const data = JSON.parse(line.slice(6));
              if (data.text) {
                setOutput((prev) => prev + data.text);
              }
            } catch { /* skip malformed lines */ }
          }
          if (line.startsWith('event: done')) {
            setStatus('done');
            onDone();
          }
          if (line.startsWith('event: error')) {
            setStatus('error');
          }
        }
      }

      if (status === 'running') {
        setStatus('done');
        onDone();
      }
    }).catch((err) => {
      if (err.name !== 'AbortError') {
        setStatus('error');
        setOutput((prev) => prev + `\nError: ${err.message}`);
      }
    });

    return () => controller.abort();
  }, [directive]);

  // Auto-scroll
  useEffect(() => {
    if (outputRef.current) {
      outputRef.current.scrollTop = outputRef.current.scrollHeight;
    }
  }, [output]);

  const statusLabel = { connecting: 'Connecting...', running: 'Dispatching', done: 'Complete', error: 'Error' }[status];
  const statusColor = { connecting: '#888', running: '#B71C1C', done: '#2E7D32', error: '#C62828' }[status];
  const fmtTime = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;

  return (
    <>
      <div className="fixed inset-0 bg-black/40 z-[60] backdrop-blur-sm" onClick={status === 'done' || status === 'error' ? onClose : undefined} />
      <div className="fixed top-[5%] left-1/2 -translate-x-1/2 w-[700px] h-[85vh] z-[61] bg-[var(--terminal-bg)] rounded-2xl shadow-2xl overflow-hidden flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3 border-b border-[var(--terminal-border)]">
          <div className="flex items-center gap-3">
            <div className="w-3 h-3 rounded-full animate-pulse" style={{ background: statusColor }} />
            <div>
              <span className="text-[var(--terminal-text)] font-bold text-sm">CEO WAVE</span>
              <span className="text-[var(--terminal-text-secondary)] text-xs ml-2">Company-wide directive</span>
            </div>
          </div>
          <div className="flex items-center gap-4">
            <span className="text-[var(--terminal-text-muted)] text-xs font-mono">{fmtTime(elapsed)}</span>
            <span className="text-xs px-2 py-0.5 rounded-full font-semibold" style={{ background: `${statusColor}22`, color: statusColor }}>
              {statusLabel}
            </span>
            {(status === 'done' || status === 'error') && (
              <button onClick={onClose} className="text-[var(--terminal-text-muted)] hover:text-[var(--terminal-text)] text-lg cursor-pointer">×</button>
            )}
          </div>
        </div>

        {/* Directive Bar */}
        <div className="px-5 py-2 bg-red-900/20 border-b border-[var(--terminal-code-border)] text-xs text-red-200/80">
          <span className="text-[var(--terminal-text-muted)]">Directive: </span>{directive}
        </div>

        {/* Output */}
        <div ref={outputRef} className="flex-1 overflow-y-auto p-5 font-mono text-xs text-amber-300/90 leading-relaxed whitespace-pre-wrap">
          {output || (status === 'connecting' ? 'Connecting to wave dispatch engine...' : '')}
          {status === 'running' && <span className="inline-block w-2 h-4 bg-amber-400 animate-pulse ml-0.5" />}
        </div>

        {/* Footer */}
        <div className="px-5 py-3 border-t border-[var(--terminal-border)] flex items-center justify-between">
          <div className="text-[10px] text-[var(--terminal-text-muted)]">
            {output.length > 0 ? `${output.split('\n').length} lines · ${output.length} chars` : ''}
          </div>
          {(status === 'done' || status === 'error') && (
            <button
              onClick={onClose}
              className="px-4 py-1.5 text-xs text-white rounded-lg font-semibold cursor-pointer"
              style={{ background: '#B71C1C' }}
            >
              Close
            </button>
          )}
        </div>
      </div>
    </>
  );
}
