/* =========================================================
   OfficeChatView — Slack-style chat message list
   Renders ChatMessage[] in a scrollable feed
   ========================================================= */

import { useEffect, useRef, useState } from 'react';
import type { ChatChannel, ChatMessage } from '../../types/chat';

const ROLE_COLORS: Record<string, string> = {
  ceo: '#FFB300', cto: '#1565C0', cbo: '#E65100', pm: '#2E7D32',
  engineer: '#4A148C', designer: '#AD1457', qa: '#00695C',
  'data-analyst': '#0277BD',
};

const ROLE_NAMES: Record<string, string> = {
  ceo: 'CEO (You)', cto: 'CTO', cbo: 'CBO', pm: 'PM',
  engineer: 'Engineer', designer: 'Designer', qa: 'QA',
  'data-analyst': 'Data Analyst',
};

function formatTime(ts: number): string {
  const d = new Date(ts);
  return d.toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' });
}

function ChatMsg({ msg }: { msg: ChatMessage }) {
  const color = ROLE_COLORS[msg.roleId] ?? '#888';
  const name = ROLE_NAMES[msg.roleId] ?? msg.roleId;

  if (msg.type === 'dispatch') {
    // Determine icon and color based on text content
    const isWave = msg.text.includes('WAVE');
    const isComplete = msg.text.includes('completed') || msg.text.includes('완료');
    const icon = isWave ? '📡' : isComplete ? '✓' : '→';
    const textColor = isComplete ? 'text-green-400/70' : 'text-[var(--terminal-text-muted)]';

    return (
      <div className="flex items-start gap-2 px-3 py-1 hover:bg-white/[0.02]">
        <span className="text-[10px] text-[var(--terminal-text-muted)] shrink-0 w-10 text-right mt-0.5">
          {formatTime(msg.ts)}
        </span>
        <span className="text-[10px] shrink-0 mt-0.5">{icon}</span>
        <span className={`text-[11px] ${textColor}`}>{msg.text}</span>
      </div>
    );
  }

  // type === 'chat' — LLM-generated channel conversation
  return (
    <div className="flex items-start gap-2 px-3 py-1.5 hover:bg-white/[0.02]">
      <span className="text-[10px] text-[var(--terminal-text-muted)] shrink-0 w-10 text-right mt-0.5">
        {formatTime(msg.ts)}
      </span>
      <div className="flex-1 min-w-0">
        <span className="text-[11px] font-semibold mr-1.5" style={{ color }}>
          {name}
        </span>
        <span className="text-xs text-[var(--terminal-text-secondary)]">
          {msg.text}
        </span>
      </div>
    </div>
  );
}

interface Props {
  channel: ChatChannel;
  allRoles?: Array<{ id: string; name: string }>;
  onUpdateMembers?: (channelId: string, members: string[]) => void;
  onUpdateTopic?: (channelId: string, topic: string) => void;
  onSendMessage?: (channelId: string, text: string) => void;
}

export default function OfficeChatView({ channel, allRoles, onUpdateMembers, onUpdateTopic, onSendMessage }: Props) {
  const bottomRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [ceoInput, setCeoInput] = useState('');

  // Auto-scroll to bottom on new messages (only if already near bottom)
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const isNearBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
    if (isNearBottom) {
      bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [channel.messages.length]);

  const [showInvite, setShowInvite] = useState(false);
  const [editingTopic, setEditingTopic] = useState(false);
  const [topicDraft, setTopicDraft] = useState('');

  const canSendMessage = onSendMessage && channel.id !== 'general';

  const handleCeoSend = () => {
    if (!ceoInput.trim() || !onSendMessage) return;
    onSendMessage(channel.id, ceoInput.trim());
    setCeoInput('');
    // Scroll to bottom after sending
    setTimeout(() => bottomRef.current?.scrollIntoView({ behavior: 'smooth' }), 50);
  };

  return (
    <div className="flex-1 flex flex-col min-h-0">
      {/* Scrollable message area */}
      <div ref={containerRef} className="flex-1 overflow-y-auto terminal-scrollbar py-2 min-h-0">
        {/* Channel header */}
        <div className="px-3 py-2 mb-2 border-b border-[var(--terminal-border)] flex items-center gap-2">
          <span className="text-sm font-semibold text-[var(--terminal-text)]">{channel.name}</span>
          {channel.members.length > 0 && (
            <span className="text-[10px] text-[var(--terminal-text-muted)]">
              {channel.members.map(m => ROLE_NAMES[m] ?? m).join(', ')}
            </span>
          )}
          {channel.members.length === 0 && (
            <span className="text-[10px] text-[var(--terminal-text-muted)]">
              {channel.isDefault ? 'system logs' : 'no members'}
            </span>
          )}
          {!channel.isDefault && allRoles && onUpdateMembers && (
            <button
              className="ml-auto text-[10px] px-2 py-0.5 rounded bg-white/5 hover:bg-white/10 text-[var(--terminal-text-muted)]"
              onClick={() => setShowInvite(!showInvite)}
            >
              {showInvite ? 'Done' : 'Invite'}
            </button>
          )}
        </div>
        {/* Channel topic */}
        {!channel.isDefault && onUpdateTopic && (
          <div className="px-3 pb-2 mb-1">
            {editingTopic ? (
              <input
                autoFocus
                value={topicDraft}
                onChange={(e) => setTopicDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    onUpdateTopic(channel.id, topicDraft.trim());
                    setEditingTopic(false);
                  }
                  if (e.key === 'Escape') setEditingTopic(false);
                }}
                onBlur={() => {
                  onUpdateTopic(channel.id, topicDraft.trim());
                  setEditingTopic(false);
                }}
                placeholder="Set a topic for this channel..."
                className="w-full bg-transparent text-[10px] text-[var(--terminal-text-muted)] outline-none border-b border-[var(--terminal-border)] pb-0.5"
              />
            ) : (
              <button
                onClick={() => { setTopicDraft(channel.topic ?? ''); setEditingTopic(true); }}
                className="text-[10px] text-[var(--terminal-text-muted)] hover:text-[var(--terminal-text-secondary)] cursor-pointer italic"
              >
                {channel.topic || 'Click to set channel topic...'}
              </button>
            )}
          </div>
        )}
        {/* Member management dropdown */}
        {showInvite && !channel.isDefault && allRoles && onUpdateMembers && (
          <div className="px-3 pb-2 mb-2 border-b border-[var(--terminal-border)]">
            <div className="flex flex-wrap gap-1">
              {allRoles.map(role => {
                const isMember = channel.members.includes(role.id);
                return (
                  <button
                    key={role.id}
                    className={`text-[10px] px-2 py-1 rounded ${isMember ? 'bg-white/15 text-[var(--terminal-text)]' : 'bg-white/5 text-[var(--terminal-text-muted)]'}`}
                    onClick={() => {
                      const next = isMember
                        ? channel.members.filter(m => m !== role.id)
                        : [...channel.members, role.id];
                      onUpdateMembers(channel.id, next);
                    }}
                  >
                    {isMember ? '✓ ' : ''}{role.name}
                  </button>
                );
              })}
            </div>
          </div>
        )}
        {channel.messages.length === 0 && (
          <div className="flex-1 flex flex-col items-center justify-center text-[var(--terminal-text-muted)] text-xs gap-1 py-8">
            <span>{channel.isDefault ? 'No dispatch events yet' : 'No messages yet — invite roles to start chatting'}</span>
          </div>
        )}
        {channel.messages.map(msg => (
          <ChatMsg key={msg.id} msg={msg} />
        ))}
        <div ref={bottomRef} />
      </div>

      {/* CEO input bar */}
      {canSendMessage && (
        <div className="shrink-0 px-3 py-2 border-t border-[var(--terminal-border)]">
          <div className="flex gap-2 items-center">
            <span className="text-[10px] font-semibold shrink-0" style={{ color: '#FFB300' }}>CEO</span>
            <input
              type="text"
              value={ceoInput}
              onChange={(e) => setCeoInput(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleCeoSend(); } }}
              placeholder="Say something..."
              className="flex-1 px-2 py-1 text-xs rounded border bg-transparent text-[var(--terminal-text)] border-[var(--terminal-border)] outline-none focus:border-[#FFB300]/50"
            />
          </div>
        </div>
      )}
    </div>
  );
}
