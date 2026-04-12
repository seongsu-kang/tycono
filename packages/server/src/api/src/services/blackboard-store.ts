/**
 * Blackboard Store — M4 Memory Bus.
 *
 * Wave-scoped shared memory: roles write discoveries during execution,
 * other roles read them in real-time. Read-all / Write-own.
 *
 * Storage: .tycono/blackboards/{waveId}.jsonl
 * Architecture: architecture/memory-system.md §M4
 */
import fs from 'node:fs';
import path from 'node:path';
import { COMPANY_ROOT } from './file-reader.js';

export interface BlackboardEntry {
  ts: string;
  roleId: string;
  key: string;
  content: string;
  type: 'finding' | 'decision' | 'artifact' | 'warning';
}

const BLACKBOARD_DIR = () => path.join(COMPANY_ROOT, '.tycono', 'blackboards');

function ensureDir(): string {
  const dir = BLACKBOARD_DIR();
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  return dir;
}

function filePath(waveId: string): string {
  return path.join(ensureDir(), `${waveId}.jsonl`);
}

/** Write a new entry to the blackboard */
export function writeEntry(waveId: string, entry: Omit<BlackboardEntry, 'ts'>): BlackboardEntry {
  const full: BlackboardEntry = { ...entry, ts: new Date().toISOString() };
  fs.appendFileSync(filePath(waveId), JSON.stringify(full) + '\n');
  console.log(`[Blackboard] ${entry.roleId} wrote "${entry.key}" (${entry.type}) to wave ${waveId}`);
  return full;
}

/** Read all entries for a wave, optionally filtered by role */
export function readEntries(waveId: string, roleId?: string): BlackboardEntry[] {
  const fp = filePath(waveId);
  if (!fs.existsSync(fp)) return [];

  const lines = fs.readFileSync(fp, 'utf-8').split('\n').filter(Boolean);
  const entries: BlackboardEntry[] = [];
  for (const line of lines) {
    try {
      const e = JSON.parse(line) as BlackboardEntry;
      if (!roleId || e.roleId === roleId) entries.push(e);
    } catch { /* skip malformed */ }
  }
  return entries;
}

/** Get latest state: last entry per key */
export function getLatestState(waveId: string): Map<string, BlackboardEntry> {
  const entries = readEntries(waveId);
  const state = new Map<string, BlackboardEntry>();
  for (const e of entries) {
    state.set(e.key, e);
  }
  return state;
}

/** Format blackboard content for context injection */
export function formatForContext(waveId: string, roleId: string): string | null {
  const state = getLatestState(waveId);
  if (state.size === 0) return null;

  // Exclude own entries (role already knows what it wrote)
  const otherEntries = [...state.values()].filter(e => e.roleId !== roleId);
  if (otherEntries.length === 0) return null;

  const lines = otherEntries.map(e => {
    const icon = { finding: '🔍', decision: '📋', artifact: '📦', warning: '⚠️' }[e.type] || '•';
    return `${icon} [${e.roleId}] ${e.key}: ${e.content}`;
  });

  // Cap at 1500 chars to avoid context bloat
  let result = lines.join('\n');
  if (result.length > 1500) {
    result = result.slice(0, 1500) + '\n... (truncated)';
  }

  return `## Shared Blackboard (Live Findings)

Other team members have shared these findings during this wave:

${result}

Use these to avoid duplicate work. To share your own findings:
\`\`\`bash
curl -s -X POST "$TYCONO_API/api/waves/$TYCONO_WAVE_ID/blackboard" \\
  -H "Content-Type: application/json" \\
  -d '{"roleId":"YOUR_ROLE","key":"short-key","content":"what you found","type":"finding"}'
\`\`\`
Types: finding (discovery), decision (choice made), artifact (file/path), warning (issue found).`;
}
