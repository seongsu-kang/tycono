/* =========================================================
   useOfficeChat — Office Chat channel management

   Manages chat channels + routes ambient speech & dispatch
   events to appropriate channels. Persists to localStorage.
   ========================================================= */

import { useCallback, useEffect, useState } from 'react';
import type { ChatChannel, ChatMessage } from '../types/chat';

const LS_KEY = 'tycono:office-chat';
const MAX_MESSAGES = 200; // per channel

let _msgId = 0;
function nextMsgId(): string {
  return `chat-${Date.now()}-${++_msgId}`;
}

/** Default channels created on first load */
function makeDefaultChannels(): ChatChannel[] {
  return [
    {
      id: 'general',
      name: '#general',
      members: [],            // empty = all roles
      isDefault: true,
      messages: [],
      topic: 'Company-wide announcements and general discussion',
    },
    {
      id: 'watercooler',
      name: '#watercooler',
      members: [],            // populated later with non-C-level roles
      isDefault: true,
      messages: [],
      topic: 'No managers allowed. Vent, gossip, joke around. Talk freely about work frustrations, complain about directives you disagree with, share hot takes.',
    },
  ];
}

function loadChannels(): ChatChannel[] {
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as ChatChannel[];

      // Migration: replace old #office with new defaults
      if (parsed.find(c => c.id === 'office') && !parsed.find(c => c.id === 'general')) {
        const custom = parsed.filter(c => c.id !== 'office');
        return [...makeDefaultChannels(), ...custom];
      }

      // Ensure default channels exist
      const defaults = makeDefaultChannels();
      for (const def of defaults) {
        if (!parsed.find(c => c.id === def.id)) {
          parsed.unshift(def);
        }
      }

      return parsed;
    }
  } catch { /* ignore */ }
  return makeDefaultChannels();
}

function saveChannels(channels: ChatChannel[]) {
  // Trim messages before saving
  const trimmed = channels.map(ch => ({
    ...ch,
    messages: ch.messages.slice(-MAX_MESSAGES),
  }));
  localStorage.setItem(LS_KEY, JSON.stringify(trimmed));
}

export interface UseOfficeChatReturn {
  channels: ChatChannel[];
  activeChannelId: string | null;
  setActiveChannelId: (id: string | null) => void;
  /** Push a chat message to relevant channels */
  pushMessage: (msg: Omit<ChatMessage, 'id'>) => void;
  /** Create a new channel */
  createChannel: (name: string, members: string[], topic?: string) => void;
  /** Delete a channel (not #office) */
  deleteChannel: (id: string) => void;
  /** Add/remove members from a channel */
  updateMembers: (channelId: string, members: string[]) => void;
  /** Update channel topic */
  updateTopic: (channelId: string, topic: string) => void;
  /** Channels with unread messages (set of channel ids) */
  unreadChannels: Set<string>;
  /** Sync default channel members when roles are loaded */
  syncDefaultMembers: (roles: Array<{ id: string; level: string }>) => void;
}

export function useOfficeChat(): UseOfficeChatReturn {
  const [channels, setChannels] = useState<ChatChannel[]>(loadChannels);
  const [activeChannelId, setActiveChannelId] = useState<string | null>(null);
  const [unreadChannels, setUnreadChannels] = useState<Set<string>>(new Set());

  // Save on change
  useEffect(() => {
    saveChannels(channels);
  }, [channels]);

  // Clear unread when switching to a channel
  const handleSetActiveChannelId = useCallback((id: string | null) => {
    setActiveChannelId(id);
    if (id) {
      setUnreadChannels(prev => {
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
    }
  }, []);

  const pushMessage = useCallback((msg: Omit<ChatMessage, 'id'>) => {
    const fullMsg: ChatMessage = { ...msg, id: nextMsgId() };

    setChannels(prev => {
      const updated = prev.map(ch => {
        // #general: dispatch events (system logs)
        if (ch.id === 'general') {
          if (msg.type === 'dispatch') {
            return { ...ch, messages: [...ch.messages, fullMsg].slice(-MAX_MESSAGES) };
          }
          return ch;
        }
        // Chat messages: route to specific channel only
        if (msg.channelId) {
          if (ch.id === msg.channelId) {
            return { ...ch, messages: [...ch.messages, fullMsg].slice(-MAX_MESSAGES) };
          }
          return ch;
        }
        // Fallback (no channelId): only if sender is a member
        if (ch.members.length > 0 && ch.members.includes(msg.roleId)) {
          return { ...ch, messages: [...ch.messages, fullMsg].slice(-MAX_MESSAGES) };
        }
        return ch;
      });

      // Mark unread for channels that received the message (if not currently viewing)
      setUnreadChannels(prevUnread => {
        const next = new Set(prevUnread);
        for (const ch of updated) {
          const oldCh = prev.find(c => c.id === ch.id);
          if (oldCh && ch.messages.length > oldCh.messages.length) {
            // This channel got a new message
            next.add(ch.id);
          }
        }
        return next;
      });

      return updated;
    });
  }, []);

  const createChannel = useCallback((name: string, members: string[], topic?: string) => {
    const id = `ch-${Date.now()}`;
    const channel: ChatChannel = {
      id,
      name: name.startsWith('#') ? name : `#${name}`,
      members,
      isDefault: false,
      messages: [],
      topic,
    };
    setChannels(prev => [...prev, channel]);
    setActiveChannelId(id);
  }, []);

  const deleteChannel = useCallback((id: string) => {
    setChannels(prev => prev.filter(ch => ch.id !== id || ch.isDefault));
    setActiveChannelId(prev => prev === id ? 'general' : prev);
  }, []);

  const updateMembers = useCallback((channelId: string, members: string[]) => {
    setChannels(prev => prev.map(ch =>
      ch.id === channelId && !ch.isDefault ? { ...ch, members } : ch,
    ));
  }, []);

  const updateTopic = useCallback((channelId: string, topic: string) => {
    setChannels(prev => prev.map(ch =>
      ch.id === channelId && !ch.isDefault ? { ...ch, topic: topic || undefined } : ch,
    ));
  }, []);

  /** Sync default channel members based on loaded roles */
  const syncDefaultMembers = useCallback((roles: Array<{ id: string; level: string }>) => {
    setChannels(prev => prev.map(ch => {
      if (ch.id === 'watercooler') {
        // Non-C-level only
        const nonCLevel = roles.filter(r => r.level !== 'c-level').map(r => r.id);
        if (ch.members.length !== nonCLevel.length || !nonCLevel.every(id => ch.members.includes(id))) {
          return { ...ch, members: nonCLevel };
        }
      }
      return ch;
    }));
  }, []);

  return {
    channels,
    activeChannelId,
    setActiveChannelId: handleSetActiveChannelId,
    pushMessage,
    createChannel,
    deleteChannel,
    updateMembers,
    updateTopic,
    unreadChannels,
    syncDefaultMembers,
  };
}
