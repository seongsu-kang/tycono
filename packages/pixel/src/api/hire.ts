/* ─── Character Store Hire API ──────────────────── */

import type { CreateRoleInput } from '../types';
import type { StoreCharacter, SkillExport } from '../types/store';
import { api } from './client';

function isSkillExport(skills: unknown): skills is SkillExport {
  return skills != null && typeof skills === 'object' && 'primary' in (skills as object);
}

/**
 * Convert a StoreCharacter to CreateRoleInput and hire (create) the role.
 * Generates a unique role ID to avoid conflicts.
 */
export async function hireCharacter(
  character: StoreCharacter,
  reportsTo: string,
  overrides?: {
    id?: string;
    name?: string;
  },
): Promise<{ ok: boolean; roleId: string }> {
  const roleId = overrides?.id ?? character.id;

  const input: CreateRoleInput = {
    id: roleId,
    name: overrides?.name ?? character.name,
    level: character.level === 'c-level' ? 'c-level' : 'member',
    reportsTo,
    persona: character.persona,
    authority: character.authority,
    knowledge: {
      reads: levelBasedReads(character.level),
      writes: levelBasedWrites(character.level),
    },
    reports: { daily: 'standup', weekly: 'summary' },
    source: {
      id: `tycono/${character.id}`,
      sync: 'manual',
      forked_at: '1.0.0',
      upstream_version: '1.0.0',
    },
    skillContent: isSkillExport(character.skills) ? character.skills : undefined,
  };

  return api.createRole(input);
}

function levelBasedReads(level: string): string[] {
  switch (level) {
    case 'c-level': return ['architecture/', 'projects/', 'knowledge/', 'operations/'];
    default: return ['projects/'];
  }
}

function levelBasedWrites(level: string): string[] {
  switch (level) {
    case 'c-level': return ['architecture/', 'projects/', 'knowledge/'];
    default: return ['projects/'];
  }
}
