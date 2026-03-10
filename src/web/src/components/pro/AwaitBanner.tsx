import { useState } from 'react';
import { api } from '../../api/client';

const ROLE_COLORS: Record<string, string> = {
  cto: '#1565C0', cbo: '#E65100', pm: '#2E7D32',
  engineer: '#4A148C', designer: '#AD1457', qa: '#00695C',
  'data-analyst': '#0277BD',
};

export interface AwaitBannerProps {
  roleId: string;
  roleName: string;
  sessionId: string;
  message?: string;
  onReply?: (sessionId: string, message: string) => void | Promise<void>;
  onDismiss?: () => void;
}

export default function AwaitBanner({
  roleId,
  roleName,
  sessionId,
  message,
  onReply,
  onDismiss,
}: AwaitBannerProps) {
  const [replyText, setReplyText] = useState('');
  const [replying, setReplying] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const color = ROLE_COLORS[roleId] ?? '#888';

  const handleReply = async () => {
    if (!replyText.trim() || replying) return;

    setReplying(true);
    setError(null);

    try {
      if (onReply) {
        await onReply(sessionId, replyText.trim());
      } else {
        await api.replyToSession(sessionId, replyText.trim());
      }
      setReplyText('');
      if (onDismiss) onDismiss();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to send reply');
    } finally {
      setReplying(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey && !replying) {
      e.preventDefault();
      handleReply();
    }
  };

  return (
    <div
      className="mx-4 my-3 rounded-lg overflow-hidden"
      style={{
        background: `${color}10`,
        border: `1px solid ${color}50`,
      }}
    >
      <div className="px-4 py-3">
        {/* Header */}
        <div className="flex items-center gap-2 mb-3">
          <span className="text-lg">⚠️</span>
          <div className="flex-1">
            <span className="text-[12px] font-semibold" style={{ color }}>
              {roleName} needs your input
            </span>
            {message && (
              <div
                className="text-[11px] mt-1"
                style={{ color: 'var(--terminal-text-muted, #887766)' }}
              >
                {message}
              </div>
            )}
          </div>
          {onDismiss && (
            <button
              onClick={onDismiss}
              className="text-[10px] px-2 py-1 rounded hover:opacity-80 transition-opacity"
              style={{ color: 'var(--terminal-text-muted)' }}
            >
              ×
            </button>
          )}
        </div>

        {/* Input */}
        <div className="flex gap-2">
          <input
            type="text"
            value={replyText}
            onChange={e => setReplyText(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Type your response..."
            disabled={replying}
            className="flex-1 px-3 py-2 rounded text-[12px] outline-none"
            style={{
              background: 'var(--terminal-bg, #1C1612)',
              border: '1px solid var(--terminal-border, #2E261F)',
              color: 'var(--terminal-text, #fff5eb)',
            }}
          />
          <button
            onClick={handleReply}
            disabled={replying || !replyText.trim()}
            className="px-4 py-2 rounded text-[11px] font-medium hover:opacity-90 transition-opacity disabled:opacity-50 disabled:cursor-not-allowed"
            style={{
              background: color,
              color: '#fff',
            }}
          >
            {replying ? 'Sending...' : 'Send ▸'}
          </button>
        </div>

        {/* Error */}
        {error && (
          <div
            className="mt-2 text-[10px] px-2 py-1 rounded"
            style={{
              background: '#EF444420',
              color: '#EF4444',
            }}
          >
            {error}
          </div>
        )}
      </div>
    </div>
  );
}
