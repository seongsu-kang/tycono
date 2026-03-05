/**
 * knowledge-importer.ts — AI-powered document import service
 *
 * Scans directories for documents, uses claude -p to summarize/categorize them,
 * and creates AKB-formatted knowledge files.
 */
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

/* ─── Types ──────────────────────────────────── */

export interface ImportCallbacks {
  onScanning: (scanPath: string, fileCount: number) => void;
  onProcessing: (file: string, index: number, total: number) => void;
  onCreated: (filePath: string, title: string, summary: string) => void;
  onSkipped: (file: string, reason: string) => void;
  onDone: (stats: { imported: number; created: number; skipped: number }) => void;
  onError: (message: string) => void;
}

interface DocumentResult {
  category: string;
  title: string;
  summary: string;
  content: string;
}

/* ─── Constants ──────────────────────────────── */

const SUPPORTED_EXTENSIONS = new Set(['.md', '.txt', '.json', '.yaml', '.yml', '.csv']);
const MAX_FILE_SIZE = 100_000; // 100KB
const MAX_CONTENT_FOR_LLM = 8_000; // chars to send to LLM

const CLASSIFY_PROMPT = `You are a knowledge organizer. Given a document, respond ONLY in JSON (no markdown fences):
{
  "category": "market|tech|process|domain|competitor|financial|general",
  "title": "Short Title (max 60 chars)",
  "summary": "One-line TL;DR (max 120 chars)",
  "content": "# Title\\n\\n> TL;DR summary\\n\\n---\\n\\n(reformatted content in markdown)"
}`;

/* ─── File Collection ────────────────────────── */

function collectFiles(dirPath: string): string[] {
  const files: string[] = [];

  function walk(dir: string) {
    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      if (entry.name.startsWith('.') || entry.name === 'node_modules') continue;
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        walk(full);
      } else if (entry.isFile()) {
        const ext = path.extname(entry.name).toLowerCase();
        if (SUPPORTED_EXTENSIONS.has(ext)) {
          try {
            const stat = fs.statSync(full);
            if (stat.size <= MAX_FILE_SIZE && stat.size > 0) {
              files.push(full);
            }
          } catch { /* skip */ }
        }
      }
    }
  }

  walk(dirPath);
  return files;
}

/* ─── LLM Processing via claude -p ───────────── */

function processDocumentWithCli(filePath: string): DocumentResult | null {
  let content: string;
  try {
    content = fs.readFileSync(filePath, 'utf-8');
  } catch {
    return null;
  }

  if (content.trim().length < 20) return null;

  const truncated = content.length > MAX_CONTENT_FOR_LLM
    ? content.slice(0, MAX_CONTENT_FOR_LLM) + '\n\n[... truncated]'
    : content;

  const fileName = path.basename(filePath);
  const userMessage = `File: ${fileName}\n\n${truncated}`;

  try {
    // Remove CLAUDECODE to avoid nested session issues
    const env = { ...process.env };
    delete env.CLAUDECODE;

    const result = execFileSync('claude', [
      '-p',
      '--system-prompt', CLASSIFY_PROMPT,
      '--output-format', 'text',
      '--model', 'claude-haiku-4-5-20251001',
      '--max-turns', '1',
      userMessage,
    ], {
      timeout: 30_000,
      env,
      encoding: 'utf-8',
      maxBuffer: 1024 * 1024,
    });

    const jsonMatch = result.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return null;

    const parsed = JSON.parse(jsonMatch[0]);
    return {
      category: parsed.category || 'general',
      title: parsed.title || fileName.replace(/\.[^.]+$/, ''),
      summary: parsed.summary || '',
      content: parsed.content || content,
    };
  } catch {
    // CLI failed — fallback to simple import
    return null;
  }
}

/** Fallback: import without LLM classification */
function processDocumentSimple(filePath: string): DocumentResult | null {
  let content: string;
  try {
    content = fs.readFileSync(filePath, 'utf-8');
  } catch {
    return null;
  }

  if (content.trim().length < 20) return null;

  const fileName = path.basename(filePath, path.extname(filePath));
  const title = fileName.replace(/[-_]+/g, ' ').replace(/\b\w/g, c => c.toUpperCase());

  // Extract first non-empty line as summary
  const firstLine = content.split('\n').find(l => l.trim().length > 0 && !l.startsWith('#'))?.trim() ?? '';
  const summary = firstLine.slice(0, 120);

  return {
    category: 'general',
    title,
    summary,
    content: content,
  };
}

/* ─── Check if claude CLI is available ───────── */

function isClaudeCliAvailable(): boolean {
  try {
    const env = { ...process.env };
    delete env.CLAUDECODE;
    execFileSync('claude', ['--version'], { timeout: 5000, env, encoding: 'utf-8' });
    return true;
  } catch {
    return false;
  }
}

/* ─── Main Import Function ───────────────────── */

export async function importKnowledge(
  paths: string[],
  companyRoot: string,
  callbacks: ImportCallbacks,
): Promise<void> {
  const useCli = isClaudeCliAvailable();
  const allFiles: string[] = [];

  // Phase 1: Scan
  for (const p of paths) {
    const resolved = path.resolve(p);
    if (!fs.existsSync(resolved)) {
      callbacks.onError(`Path not found: ${p}`);
      continue;
    }

    const stat = fs.statSync(resolved);
    if (stat.isDirectory()) {
      const found = collectFiles(resolved);
      allFiles.push(...found);
      callbacks.onScanning(p, found.length);
    } else if (stat.isFile()) {
      allFiles.push(resolved);
      callbacks.onScanning(p, 1);
    }
  }

  if (allFiles.length === 0) {
    callbacks.onDone({ imported: 0, created: 0, skipped: 0 });
    return;
  }

  // Phase 2: Process each file
  const knowledgeDir = path.join(companyRoot, 'knowledge');
  fs.mkdirSync(knowledgeDir, { recursive: true });

  let created = 0;
  let skipped = 0;
  const hubEntries: { category: string; title: string; summary: string; filePath: string }[] = [];

  for (let i = 0; i < allFiles.length; i++) {
    const file = allFiles[i];
    callbacks.onProcessing(path.basename(file), i + 1, allFiles.length);

    // Try CLI first, fallback to simple import
    let result: DocumentResult | null = null;
    if (useCli) {
      result = processDocumentWithCli(file);
    }
    if (!result) {
      result = processDocumentSimple(file);
    }

    if (!result) {
      skipped++;
      callbacks.onSkipped(path.basename(file), 'Too short or unreadable');
      continue;
    }

    // Ensure category directory exists
    const categoryDir = path.join(knowledgeDir, result.category);
    fs.mkdirSync(categoryDir, { recursive: true });

    // Generate safe filename
    const baseName = path.basename(file, path.extname(file));
    const safeName = baseName.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '');
    const outPath = path.join(categoryDir, `${safeName}.md`);
    const relativePath = `knowledge/${result.category}/${safeName}.md`;

    // Add source info to content
    const finalContent = result.content + `\n\n---\n\n*Source: ${path.basename(file)}*\n*Imported: ${new Date().toISOString().slice(0, 10)}*\n`;

    fs.writeFileSync(outPath, finalContent);
    created++;

    hubEntries.push({
      category: result.category,
      title: result.title,
      summary: result.summary,
      filePath: relativePath,
    });

    callbacks.onCreated(relativePath, result.title, result.summary);
  }

  // Phase 3: Update knowledge.md hub
  updateKnowledgeHub(companyRoot, hubEntries);

  callbacks.onDone({ imported: allFiles.length, created, skipped });
}

/* ─── Hub Updater ────────────────────────────── */

function updateKnowledgeHub(
  companyRoot: string,
  entries: { category: string; title: string; summary: string; filePath: string }[],
) {
  const hubPath = path.join(companyRoot, 'knowledge', 'knowledge.md');
  let content = '';

  if (fs.existsSync(hubPath)) {
    content = fs.readFileSync(hubPath, 'utf-8');
  } else {
    content = '# Knowledge Base\n\nDomain knowledge.\n';
  }

  // Group by category
  const byCategory = new Map<string, typeof entries>();
  for (const entry of entries) {
    const list = byCategory.get(entry.category) || [];
    list.push(entry);
    byCategory.set(entry.category, list);
  }

  content += '\n## Imported Knowledge\n\n';

  for (const [category, items] of byCategory) {
    content += `### ${category.charAt(0).toUpperCase() + category.slice(1)}\n\n`;
    for (const item of items) {
      content += `- [${item.title}](${item.filePath}) — ${item.summary}\n`;
    }
    content += '\n';
  }

  fs.writeFileSync(hubPath, content);
}
