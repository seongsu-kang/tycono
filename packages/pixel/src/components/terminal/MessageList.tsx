import { useEffect, useRef } from 'react';
import type { Message } from '../../types';
import MessageBubble from './MessageBubble';

interface Props {
  messages: Message[];
  roleId: string;
  roleColor: string;
}

export default function MessageList({ messages, roleId, roleColor }: Props) {
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, messages[messages.length - 1]?.content]);

  if (messages.length === 0) {
    return (
      <div className="flex-1 flex items-center justify-center text-[var(--terminal-text-muted)] text-sm">
        Start a conversation with {roleId.toUpperCase()}
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-y-auto p-4 terminal-scrollbar">
      {messages.map((msg) => (
        <MessageBubble
          key={msg.id}
          message={msg}
          roleId={roleId}
          roleColor={roleColor}
        />
      ))}
      <div ref={bottomRef} />
    </div>
  );
}
