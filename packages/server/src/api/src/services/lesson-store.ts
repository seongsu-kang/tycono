import fs from 'node:fs';
import path from 'node:path';
import { COMPANY_ROOT } from './file-reader.js';
import { ActivityStream } from './activity-stream.js';

/* ─── Types ──────────────────────────── */

export interface Lesson {
  ts: string;
  waveId: string;
  agencyId: string;
  roleId: string;
  type: 'failure' | 'success' | 'discovery';
  summary: string;
  /** How many times this pattern has been seen */
  occurrences: number;
}

/* ─── Paths ──────────────────────────── */

function lessonsDir(): string {
  return path.join(COMPANY_ROOT, '.tycono', 'lessons');
}

function lessonsPath(agencyId: string): string {
  return path.join(lessonsDir(), `${agencyId}.jsonl`);
}

/* ─── Extract lessons from a completed wave ── */

/**
 * Analyze activity-streams from a completed wave and extract lessons.
 * Looks for:
 * - Tool failures (repeated Bash errors, file not found, connection refused)
 * - Successful patterns (what worked after failures)
 * - Discovered infrastructure (DB paths, API endpoints, config locations)
 */
export function extractLessons(waveId: string, agencyId: string): Lesson[] {
  const streamsDir = ActivityStream.getStreamDir();
  if (!fs.existsSync(streamsDir)) return [];

  const lessons: Lesson[] = [];
  const streamFiles = fs.readdirSync(streamsDir).filter(f => f.endsWith('.jsonl'));

  for (const file of streamFiles) {
    const sessionId = file.replace('.jsonl', '');
    const events = ActivityStream.readAll(sessionId);
    if (events.length === 0) continue;

    // Only process events from this wave (check traceId or parentSessionId chain)
    const firstEvent = events[0];
    const roleId = firstEvent.roleId || '';
    if (!roleId || roleId === 'ceo') continue;

    // Track tool failures
    const failures = new Map<string, number>();
    const lastToolName: string[] = [];

    for (const e of events) {
      if (e.type === 'tool:start') {
        lastToolName.push((e.data?.name as string) || '');
      }

      if (e.type === 'tool:result') {
        const output = (e.data?.output as string || e.data?.result as string || '').slice(0, 300);
        const toolName = lastToolName.pop() || '';
        const isError = output.includes('error') || output.includes('Error')
          || output.includes('ENOENT') || output.includes('not found')
          || output.includes('Connection refused') || output.includes('command not found')
          || output.includes('Permission denied') || output.includes('ECONNREFUSED');

        if (isError && toolName === 'Bash') {
          const cmd = (e.data?.command as string || '').slice(0, 80);
          const key = `${roleId}:${cmd.split(' ')[0]}`;
          failures.set(key, (failures.get(key) || 0) + 1);

          // Extract lesson from repeated failures (3+ times = worth learning)
          if ((failures.get(key) || 0) === 3) {
            const errorSnippet = output.slice(0, 100).replace(/\n/g, ' ');
            lessons.push({
              ts: new Date().toISOString(),
              waveId,
              agencyId,
              roleId,
              type: 'failure',
              summary: `${roleId}: "${cmd}" fails repeatedly (${errorSnippet}). Try alternative approach.`,
              occurrences: 1,
            });
          }
        }
      }

      // Detect discovery patterns (successful curl, DB connection, etc.)
      if (e.type === 'tool:result') {
        const output = (e.data?.output as string || '').slice(0, 200);
        const toolName = lastToolName.length > 0 ? lastToolName[lastToolName.length - 1] : '';

        // Successful API/DB discovery
        if (toolName === 'Bash' && output.includes('"status":"ok"')) {
          const cmd = (e.data?.command as string || '');
          const urlMatch = cmd.match(/https?:\/\/[^\s"']+/);
          if (urlMatch) {
            lessons.push({
              ts: new Date().toISOString(),
              waveId,
              agencyId,
              roleId,
              type: 'discovery',
              summary: `${roleId}: API endpoint confirmed working: ${urlMatch[0]}`,
              occurrences: 1,
            });
          }
        }
      }
    }
  }

  return lessons;
}

/* ─── Save lessons ──────────────────── */

export function saveLessons(agencyId: string, newLessons: Lesson[]): void {
  if (newLessons.length === 0) return;

  const dir = lessonsDir();
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

  const fp = lessonsPath(agencyId);

  // Load existing lessons and deduplicate
  const existing = loadLessons(agencyId);
  for (const newLesson of newLessons) {
    const match = existing.find(e =>
      e.roleId === newLesson.roleId && e.summary === newLesson.summary
    );
    if (match) {
      match.occurrences++;
      match.ts = newLesson.ts;
    } else {
      existing.push(newLesson);
    }
  }

  // Keep only last 50 lessons per agency (prevent unbounded growth)
  const trimmed = existing.slice(-50);

  // Rewrite file
  const content = trimmed.map(l => JSON.stringify(l)).join('\n') + '\n';
  fs.writeFileSync(fp, content);
}

/* ─── Load lessons ──────────────────── */

export function loadLessons(agencyId: string): Lesson[] {
  const fp = lessonsPath(agencyId);
  if (!fs.existsSync(fp)) return [];

  const lines = fs.readFileSync(fp, 'utf-8').split('\n').filter(Boolean);
  const lessons: Lesson[] = [];
  for (const line of lines) {
    try {
      lessons.push(JSON.parse(line));
    } catch { /* skip malformed */ }
  }
  return lessons;
}

/* ─── Format lessons for context injection ── */

/**
 * Format relevant lessons for injection into agent context.
 * Returns empty string if no lessons found.
 * Budget: max ~500 chars.
 */
export function formatLessonsForContext(agencyId: string, roleId?: string): string {
  const lessons = loadLessons(agencyId);
  if (lessons.length === 0) return '';

  // Filter by role if specified, otherwise show all
  const relevant = roleId
    ? lessons.filter(l => l.roleId === roleId || l.type === 'discovery')
    : lessons;

  if (relevant.length === 0) return '';

  // Sort by occurrences (most frequent first) then by recency
  relevant.sort((a, b) => b.occurrences - a.occurrences || b.ts.localeCompare(a.ts));

  // Take top 5
  const top = relevant.slice(0, 5);
  let budget = 500;
  const lines: string[] = [];

  for (const l of top) {
    if (budget <= 0) break;
    const icon = l.type === 'failure' ? '⚠️' : l.type === 'discovery' ? '💡' : '✅';
    const freq = l.occurrences > 1 ? ` (${l.occurrences}x)` : '';
    const line = `${icon} ${l.summary}${freq}`;
    lines.push(line);
    budget -= line.length;
  }

  return `# Lessons Learned (from previous waves)

${lines.join('\n')}

> These are patterns discovered in past waves. Avoid known failures. Use known working paths.`;
}
