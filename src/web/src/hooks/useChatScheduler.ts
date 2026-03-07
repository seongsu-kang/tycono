/* =========================================================
   useChatScheduler — Chat Pipeline (LLM-powered)

   Independent from Speech Pipeline (useAmbientSpeech).
   Schedules idle roles to participate in chat channels
   via POST /api/speech/chat. Supports reaction chains.
   ========================================================= */

import { useCallback, useEffect, useRef } from 'react';
import type { ChatChannel, ChatMessage } from '../types/chat';
import type { SpeechSettings } from '../types/speech';
import type { RoleRelationship } from '../types/speech';
import { api } from '../api/client';

const DEFAULT_INTERVAL_MS = 45_000; // 45s default chat interval
const REACTION_DELAY_MS = 3_000;    // 3s before reaction
const MAX_CHAIN_LENGTH = 3;         // max consecutive reactions
const HISTORY_WINDOW = 20;          // last N messages as context

interface UseChatSchedulerProps {
  roles: Array<{ id: string; name: string; level: string; reportsTo: string }>;
  roleStatuses: Record<string, string>;
  activeExecs: Array<{ roleId: string; task: string }>;
  channels: ChatChannel[];
  relationships: RoleRelationship[];
  pushMessage: (msg: Omit<ChatMessage, 'id'>) => void;
  speechSettings?: SpeechSettings;
  engineType?: string;
  /** Whether ANTHROPIC_API_KEY is configured on the server */
  hasApiKey?: boolean;
}

export function useChatScheduler({
  roles,
  roleStatuses,
  activeExecs,
  channels,
  relationships,
  pushMessage,
  speechSettings,
  engineType,
  hasApiKey,
}: UseChatSchedulerProps): void {

  // Determine if chat is active
  const effectiveMode = speechSettings?.mode === 'auto'
    ? (engineType === 'claude-cli' ? 'llm'
       : engineType === 'local' ? 'llm'
       : 'template')
    : (speechSettings?.mode ?? 'template');
  // Chat requires LLM mode AND either an API key or claude-cli engine
  const chatEnabled = effectiveMode === 'llm' && (hasApiKey !== false || engineType === 'claude-cli');
  const intervalMs = (speechSettings?.intervalSec ?? DEFAULT_INTERVAL_MS / 1000) * 1000;

  // Stable refs
  const rolesRef = useRef(roles);
  const statusRef = useRef(roleStatuses);
  const execsRef = useRef(activeExecs);
  const channelsRef = useRef(channels);
  const relsRef = useRef(relationships);
  const pushRef = useRef(pushMessage);
  const chainCount = useRef(0);
  const pendingRef = useRef(false);

  rolesRef.current = roles;
  statusRef.current = roleStatuses;
  execsRef.current = activeExecs;
  channelsRef.current = channels;
  relsRef.current = relationships;
  pushRef.current = pushMessage;

  /** Send a chat message for a role in a channel */
  const generateChat = useCallback(async (roleId: string, channel: ChatChannel): Promise<boolean> => {
    if (pendingRef.current) return false;
    pendingRef.current = true;

    try {
      const role = rolesRef.current.find(r => r.id === roleId);
      if (!role) return false;

      // Build history from channel messages
      const history = channel.messages
        .slice(-HISTORY_WINDOW)
        .map(m => ({ roleId: m.roleId, text: m.text, ts: m.ts }));

      // Build members list
      const memberRoles = rolesRef.current.filter(r => channel.members.includes(r.id));

      // Build relationships for this role
      const rels = relsRef.current
        .filter(r => r.roleA === roleId || r.roleB === roleId)
        .map(r => ({
          partnerId: r.roleA === roleId ? r.roleB : r.roleA,
          familiarity: r.familiarity,
        }));

      // Build work context
      const exec = execsRef.current.find(e => e.roleId === roleId);
      const workContext = exec
        ? { currentTask: exec.task, taskProgress: null }
        : { currentTask: null, taskProgress: null };

      const result = await api.chatInChannel({
        channelId: channel.name.replace('#', ''),
        channelTopic: channel.topic,
        roleId,
        history,
        members: memberRoles.map(r => ({ id: r.id, name: r.name, level: r.level })),
        relationships: rels,
        workContext,
      });

      if (result.message) {
        pushRef.current({
          ts: Date.now(),
          roleId,
          text: result.message,
          type: 'chat',
          channelId: channel.id,
        });
        return true;
      }
      return false;
    } catch {
      return false;
    } finally {
      pendingRef.current = false;
    }
  }, []);

  /** Trigger a reaction from another idle member in the channel */
  const triggerReaction = useCallback(async (channel: ChatChannel, excludeRoleId: string) => {
    if (chainCount.current >= MAX_CHAIN_LENGTH) {
      chainCount.current = 0;
      return;
    }

    // Find other idle members
    const otherMembers = channel.members.filter(id =>
      id !== excludeRoleId &&
      statusRef.current[id] !== 'working',
    );
    if (otherMembers.length === 0) {
      chainCount.current = 0;
      return;
    }

    // Pick a random idle member
    const reactorId = otherMembers[Math.floor(Math.random() * otherMembers.length)];

    // 60% chance to react (not every message triggers a response)
    if (Math.random() > 0.6) {
      chainCount.current = 0;
      return;
    }

    setTimeout(async () => {
      chainCount.current++;
      // Re-read channel to get latest messages
      const freshChannel = channelsRef.current.find(c => c.id === channel.id);
      if (!freshChannel) return;

      const replied = await generateChat(reactorId, freshChannel);
      if (replied) {
        // Continue chain
        triggerReaction(freshChannel, reactorId);
      } else {
        chainCount.current = 0;
      }
    }, REACTION_DELAY_MS + Math.random() * 2000);
  }, [generateChat]);

  // Main scheduling interval
  useEffect(() => {
    if (!chatEnabled) return;

    const interval = setInterval(async () => {
      const rs = rolesRef.current;
      if (rs.length === 0) return;
      if (pendingRef.current) return;

      // Find idle roles that are members of custom channels
      const idleRoles = rs.filter(r => statusRef.current[r.id] !== 'working');
      if (idleRoles.length === 0) return;

      // Pick a random idle role
      const role = idleRoles[Math.floor(Math.random() * idleRoles.length)];

      // Find channels this role is a member of (exclude #office)
      const memberChannels = channelsRef.current.filter(ch =>
        !ch.isDefault && ch.members.includes(role.id),
      );
      if (memberChannels.length === 0) return;

      // Pick a random channel
      const channel = memberChannels[Math.floor(Math.random() * memberChannels.length)];

      chainCount.current = 0;
      const sent = await generateChat(role.id, channel);
      if (sent) {
        triggerReaction(channel, role.id);
      }
    }, intervalMs);

    return () => clearInterval(interval);
  }, [chatEnabled, intervalMs, generateChat, triggerReaction]);
}
