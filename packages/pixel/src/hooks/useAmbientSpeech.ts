/* =========================================================
   useAmbientSpeech — Speech Pipeline (template-only, $0)

   Office view speech bubbles. Template pool based.
   NO LLM calls. NO chat routing. Pure client-side.

   3-Layer selection:
   Layer 1: Work speech (active task, standup data)
   Layer 2: Personality speech (idle monologue from persona)
   Layer 3: Social speech (inter-role template conversations)

   + Relationship history (localStorage persistence)
   ========================================================= */

import { useCallback, useEffect, useRef, useState } from 'react';
import { CONVERSATIONS, GUILT_SPEECH, PERSONALITY_SPEECH } from '../data/ambient-speech';
import type { ConversationTemplate, RoleRelationship, Speech } from '../types/speech';
import { type RoleStatus, isRoleActive } from '../types';

/* ─── Constants ─── */

const DEFAULT_INTERVAL_MS = 18_000; // 18s between ambient speech cycles
const SPEECH_DURATION_MS = 6_000;  // 6s display per speech
const CONV_TURN_DELAY_MS = 2_500;  // 2.5s between conversation turns
const GUILT_IDLE_MS = 30 * 60_000; // 30 min idle → guilt speech
const LS_KEY = 'tycono:relationships';

/* ─── Relationship Storage ─── */

function loadRelationships(): RoleRelationship[] {
  try {
    const raw = localStorage.getItem(LS_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch { return []; }
}

function saveRelationships(rels: RoleRelationship[]) {
  localStorage.setItem(LS_KEY, JSON.stringify(rels));
}

function getOrCreateRelationship(
  rels: RoleRelationship[],
  a: string,
  b: string,
): RoleRelationship {
  const [roleA, roleB] = a < b ? [a, b] : [b, a];
  let rel = rels.find(r => r.roleA === roleA && r.roleB === roleB);
  if (!rel) {
    rel = {
      roleA, roleB,
      dispatches: 0, wavesTogether: 0, conversations: 0,
      familiarity: 0, lastInteraction: new Date().toISOString(),
    };
    rels.push(rel);
  }
  return rel;
}

function computeFamiliarity(rel: RoleRelationship): number {
  return Math.min(100,
    rel.dispatches * 5 +
    rel.wavesTogether * 10 +
    rel.conversations * 2,
  );
}

/* ─── Helpers ─── */

function pickRandom<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

function getRelationType(
  roleA: string,
  roleB: string,
  roles: Array<{ id: string; level: string; reportsTo: string }>,
): 'superior-subordinate' | 'peer' | 'c-level' | null {
  const ra = roles.find(r => r.id === roleA);
  const rb = roles.find(r => r.id === roleB);
  if (!ra || !rb) return null;

  const aIsC = ra.level === 'c-level';
  const bIsC = rb.level === 'c-level';

  if (aIsC && bIsC) return 'c-level';
  if (ra.reportsTo === roleB || rb.reportsTo === roleA) return 'superior-subordinate';
  if (ra.reportsTo === rb.reportsTo) return 'peer';
  // Different branches — treat as peer
  return 'peer';
}

function matchesRelation(
  template: ConversationTemplate,
  actual: 'superior-subordinate' | 'peer' | 'c-level',
): boolean {
  if (template.relation === 'any') return true;
  return template.relation === actual;
}

/* ─── Hook ─── */

interface UseAmbientSpeechProps {
  roles: Array<{ id: string; name: string; level: string; reportsTo: string }>;
  roleStatuses: Record<string, string>;
  activeExecs: Array<{ roleId: string; task: string }>;
  getStandupSpeech: (roleId: string) => string;
}

export interface UseAmbientSpeechReturn {
  /** Current speech for each role (key=roleId) */
  speeches: Map<string, Speech>;
  /** Get the best speech text for a role (for TopDownOfficeView) */
  getSpeech: (roleId: string) => string;
  /** Relationship data */
  relationships: RoleRelationship[];
  /** Notify dispatch event (increments relationship) */
  notifyDispatch: (fromRole: string, toRole: string) => void;
  /** Notify wave completion (increments relationship for all participants) */
  notifyWave: (roleIds: string[]) => void;
}

export function useAmbientSpeech({
  roles,
  roleStatuses,
  activeExecs,
  getStandupSpeech,
}: UseAmbientSpeechProps): UseAmbientSpeechReturn {

  const [speeches, setSpeeches] = useState<Map<string, Speech>>(new Map());
  const [relationships, setRelationships] = useState<RoleRelationship[]>(loadRelationships);

  // Track when each role last had work
  const lastWorkTime = useRef<Record<string, number>>({});
  // Track conversation state
  const activeConv = useRef<{
    templateId: string;
    roleA: string;
    roleB: string;
    turnIdx: number;
    timer: ReturnType<typeof setTimeout> | null;
  } | null>(null);
  // Stable refs for interval callback
  const rolesRef = useRef(roles);
  const statusRef = useRef(roleStatuses);
  const execsRef = useRef(activeExecs);
  const standupRef = useRef(getStandupSpeech);
  const relsRef = useRef(relationships);

  rolesRef.current = roles;
  statusRef.current = roleStatuses;
  execsRef.current = activeExecs;
  standupRef.current = getStandupSpeech;
  relsRef.current = relationships;

  // Update lastWorkTime when roles are working
  useEffect(() => {
    const now = Date.now();
    for (const [id, status] of Object.entries(roleStatuses)) {
      if (isRoleActive(status as RoleStatus)) {
        lastWorkTime.current[id] = now;
      }
    }
  }, [roleStatuses]);

  // Save relationships to localStorage
  useEffect(() => {
    saveRelationships(relationships);
  }, [relationships]);

  /** Select ambient speech for a single idle role */
  const selectSpeech = useCallback((roleId: string): Speech | null => {
    const status = statusRef.current[roleId];
    const exec = execsRef.current.find(e => e.roleId === roleId);

    // Layer 1: Working → show task (handled in TopDownOfficeView directly)
    if (isRoleActive(status as RoleStatus) && exec?.task) return null;

    // Layer 1: Standup speech
    const standup = standupRef.current(roleId);
    if (standup && Math.random() < 0.3) {
      return { text: standup, type: 'work', ts: Date.now() };
    }

    // Guilt trigger: 30+ min idle
    const now = Date.now();
    const lastWork = lastWorkTime.current[roleId] ?? 0;
    if (now - lastWork > GUILT_IDLE_MS && Math.random() < 0.5) {
      const pool = GUILT_SPEECH[roleId] ?? GUILT_SPEECH.engineer;
      return { text: pickRandom(pool), type: 'guilt', ts: now };
    }

    // Layer 2: Personality speech
    const pool = PERSONALITY_SPEECH[roleId] ?? PERSONALITY_SPEECH.engineer;
    return { text: pickRandom(pool), type: 'personality', ts: now };
  }, []);

  /** Try to start a conversation between two roles */
  const tryConversation = useCallback((roles_: typeof roles): boolean => {
    if (activeConv.current) return false;

    // Find idle, sitting roles (not working)
    const idleRoles = roles_.filter(r =>
      !isRoleActive(statusRef.current[r.id] as RoleStatus),
    );
    if (idleRoles.length < 2) return false;

    // Pick two random idle roles
    const shuffled = [...idleRoles].sort(() => Math.random() - 0.5);
    const roleA = shuffled[0];
    const roleB = shuffled[1];

    const relType = getRelationType(roleA.id, roleB.id, roles_);
    if (!relType) return false;

    const rel = getOrCreateRelationship(relsRef.current, roleA.id, roleB.id);
    const fam = computeFamiliarity(rel);

    // Find matching conversation templates
    const matching = CONVERSATIONS.filter(t =>
      matchesRelation(t, relType) && fam >= t.minFamiliarity,
    );
    if (matching.length === 0) return false;

    const template = pickRandom(matching);

    // Determine who is A (superior) and B (subordinate) for sup-sub
    let actualA = roleA.id;
    let actualB = roleB.id;
    if (template.relation === 'superior-subordinate') {
      // A should be the superior
      if (roleB.reportsTo === roleA.id || roleA.level === 'c-level') {
        actualA = roleA.id;
        actualB = roleB.id;
      } else {
        actualA = roleB.id;
        actualB = roleA.id;
      }
    }

    activeConv.current = {
      templateId: template.id,
      roleA: actualA,
      roleB: actualB,
      turnIdx: 0,
      timer: null,
    };

    // Play turns sequentially
    const playTurn = (idx: number) => {
      if (!activeConv.current || idx >= template.turns.length) {
        // Conversation done — increment relationship
        activeConv.current = null;
        setRelationships(prev => {
          const next = [...prev];
          const r = getOrCreateRelationship(next, actualA, actualB);
          r.conversations++;
          r.familiarity = computeFamiliarity(r);
          r.lastInteraction = new Date().toISOString();
          return next;
        });
        // Clear speech after last turn
        setTimeout(() => {
          setSpeeches(prev => {
            const next = new Map(prev);
            next.delete(actualA);
            next.delete(actualB);
            return next;
          });
        }, SPEECH_DURATION_MS);
        return;
      }

      const turn = template.turns[idx];
      const speakerId = turn.speaker === 'A' ? actualA : actualB;
      const partnerId = turn.speaker === 'A' ? actualB : actualA;

      setSpeeches(prev => {
        const next = new Map(prev);
        next.set(speakerId, {
          text: turn.text,
          type: 'social',
          partnerId,
          ts: Date.now(),
        });
        // Clear partner's bubble while this one speaks
        if (idx > 0) {
          const prevSpeaker = template.turns[idx - 1].speaker === 'A' ? actualA : actualB;
          if (prevSpeaker !== speakerId) {
            next.delete(prevSpeaker);
          }
        }
        return next;
      });

      activeConv.current!.turnIdx = idx;
      activeConv.current!.timer = setTimeout(() => playTurn(idx + 1), CONV_TURN_DELAY_MS);
    };

    playTurn(0);
    return true;
  }, []);

  // Main scheduling interval
  useEffect(() => {
    const interval = setInterval(() => {
      const rs = rolesRef.current;
      if (rs.length === 0) return;

      // Skip if conversation is active
      if (activeConv.current) return;

      // 35% chance: try template conversation between two roles
      if (Math.random() < 0.35) {
        if (tryConversation(rs)) return;
      }

      // Otherwise: pick a random idle role for monologue
      const idleRoles = rs.filter(r => !isRoleActive(statusRef.current[r.id] as RoleStatus));
      if (idleRoles.length === 0) return;

      const role = pickRandom(idleRoles);
      const speech = selectSpeech(role.id);
      if (!speech) return;

      setSpeeches(prev => {
        const next = new Map(prev);
        next.set(role.id, speech);
        return next;
      });

      // Auto-clear after duration
      setTimeout(() => {
        setSpeeches(prev => {
          const next = new Map(prev);
          const current = next.get(role.id);
          if (current && current.ts === speech.ts) {
            next.delete(role.id);
          }
          return next;
        });
      }, SPEECH_DURATION_MS);
    }, DEFAULT_INTERVAL_MS);

    return () => {
      clearInterval(interval);
      if (activeConv.current?.timer) clearTimeout(activeConv.current.timer);
    };
  }, [selectSpeech, tryConversation]);

  /** Get speech text for a role — used by TopDownOfficeView */
  const getSpeech = useCallback((roleId: string): string => {
    const speech = speeches.get(roleId);
    return speech?.text ?? '';
  }, [speeches]);

  /** External event: dispatch happened */
  const notifyDispatch = useCallback((fromRole: string, toRole: string) => {
    setRelationships(prev => {
      const next = [...prev];
      const rel = getOrCreateRelationship(next, fromRole, toRole);
      rel.dispatches++;
      rel.familiarity = computeFamiliarity(rel);
      rel.lastInteraction = new Date().toISOString();
      return next;
    });
  }, []);

  /** External event: wave completed with these roles */
  const notifyWave = useCallback((roleIds: string[]) => {
    if (roleIds.length < 2) return;
    setRelationships(prev => {
      const next = [...prev];
      for (let i = 0; i < roleIds.length; i++) {
        for (let j = i + 1; j < roleIds.length; j++) {
          const rel = getOrCreateRelationship(next, roleIds[i], roleIds[j]);
          rel.wavesTogether++;
          rel.familiarity = computeFamiliarity(rel);
          rel.lastInteraction = new Date().toISOString();
        }
      }
      return next;
    });
  }, []);

  return { speeches, getSpeech, relationships, notifyDispatch, notifyWave };
}
