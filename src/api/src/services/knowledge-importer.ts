/**
 * knowledge-importer.ts — AKB-aware document import service
 *
 * Scans directories for documents and creates AKB-formatted knowledge files.
 * Processing priority: frontmatter → LLMProvider → claude -p CLI → simple fallback
 */
import fs from 'node:fs';
import path from 'node:path';
import { execFile, execFileSync } from 'node:child_process';
import matter from 'gray-matter';
import type { LLMProvider } from '../engine/llm-adapter.js';

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
  akbType: 'hub' | 'node';
  tags: string[];
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
  "content": "# Title\\n\\n> TL;DR summary\\n\\n---\\n\\n(reformatted content in markdown)",
  "akb_type": "hub|node",
  "tags": ["tag1", "tag2"]
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

/* ─── Frontmatter-based processing (highest priority) ─── */

function extractTldr(content: string): string {
  const blockquote = content.match(/^>\s+(.+)/m);
  if (blockquote) return blockquote[1].trim().slice(0, 120);

  const tldrSection = content.match(/##\s+TL;DR\s*\n+([^\n#]+)/i);
  if (tldrSection) return tldrSection[1].trim().slice(0, 120);

  const firstLine = content.split('\n').find(
    (l) => l.trim().length > 0 && !l.startsWith('#') && !l.startsWith('---') && !l.startsWith('|')
  );
  return firstLine?.trim().slice(0, 120) ?? '';
}

function extractFrontmatterCategory(filePath: string): DocumentResult | null {
  let raw: string;
  try {
    raw = fs.readFileSync(filePath, 'utf-8');
  } catch {
    return null;
  }

  if (raw.trim().length < 20) return null;

  // Only parse if has frontmatter
  if (!raw.startsWith('---')) return null;

  const { data, content } = matter(raw);

  // Need at least one AKB field
  if (!data.title && !data.akb_type && !data.tags && !data.domain) return null;

  const tags: string[] = Array.isArray(data.tags) ? data.tags : [];

  // Determine category from tags or domain field
  const domainTag = tags.find((t: string) => t.startsWith('domain/'));
  const category: string = domainTag
    ? domainTag.replace('domain/', '')
    : (data.domain as string) || 'general';

  // Title from frontmatter > first heading
  let title: string = (data.title as string) ?? '';
  if (!title) {
    const match = content.match(/^#\s+(.+)/m);
    title = match ? match[1].trim() : path.basename(filePath, path.extname(filePath));
  }

  const akbType: 'hub' | 'node' = data.akb_type === 'hub' ? 'hub' : 'node';
  const summary = (data.summary as string) || (data.tldr as string) || extractTldr(content);

  return {
    category,
    title,
    summary,
    content: raw, // preserve original content with frontmatter
    akbType,
    tags,
  };
}

/* ─── LLM Processing via claude -p ───────────── */

async function processDocumentWithCli(filePath: string): Promise<DocumentResult | null> {
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
    const env = { ...process.env };
    delete env.CLAUDECODE;

    const result = await new Promise<string>((resolve, reject) => {
      execFile('claude', [
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
      }, (err, stdout) => {
        if (err) reject(err);
        else resolve(stdout);
      });
    });

    const jsonMatch = result.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return null;

    const parsed = JSON.parse(jsonMatch[0]);
    const akbType: 'hub' | 'node' = parsed.akb_type === 'hub' ? 'hub' : 'node';
    const tags: string[] = Array.isArray(parsed.tags) ? parsed.tags : [];

    return {
      category: parsed.category || 'general',
      title: parsed.title || fileName.replace(/\.[^.]+$/, ''),
      summary: parsed.summary || '',
      content: parsed.content || content,
      akbType,
      tags,
    };
  } catch {
    return null;
  }
}

/* ─── LLM Processing via LLMProvider interface ── */

async function processDocumentWithLLM(filePath: string, llm: LLMProvider): Promise<DocumentResult | null> {
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
    const response = await llm.chat(
      CLASSIFY_PROMPT,
      [{ role: 'user', content: userMessage }],
      undefined,
    );

    const textBlock = response.content.find((b) => b.type === 'text');
    if (!textBlock || textBlock.type !== 'text') return null;

    const jsonMatch = (textBlock as { type: 'text'; text: string }).text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return null;

    const parsed = JSON.parse(jsonMatch[0]);
    const akbType: 'hub' | 'node' = parsed.akb_type === 'hub' ? 'hub' : 'node';
    const tags: string[] = Array.isArray(parsed.tags) ? parsed.tags : [];

    return {
      category: parsed.category || 'general',
      title: parsed.title || fileName.replace(/\.[^.]+$/, ''),
      summary: parsed.summary || '',
      content: parsed.content || content,
      akbType,
      tags,
    };
  } catch {
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
  const summary = extractTldr(content);

  return {
    category: 'general',
    title,
    summary,
    content,
    akbType: 'node',
    tags: [],
  };
}

/* ─── Build AKB frontmatter content ─────────── */

function buildAkbContent(result: DocumentResult, sourceFile: string): string {
  const date = new Date().toISOString().slice(0, 10);

  // If content already has frontmatter, keep it as-is (just add source footer)
  if (result.content.startsWith('---')) {
    return result.content + `\n\n---\n\n*Source: ${path.basename(sourceFile)}*\n*Imported: ${date}*\n`;
  }

  // Build AKB frontmatter
  const fm = [
    '---',
    `title: "${result.title.replace(/"/g, "'")}"`,
    `akb_type: ${result.akbType}`,
    `status: active`,
    `tags: [${result.tags.map(t => `"${t}"`).join(', ')}]`,
    `domain: ${result.category}`,
    '---',
    '',
  ].join('\n');

  const body = result.content.startsWith('#')
    ? result.content
    : `# ${result.title}\n\n${result.summary ? `> ${result.summary}\n\n` : ''}${result.content}`;

  return fm + body + `\n\n---\n\n*Source: ${path.basename(sourceFile)}*\n*Imported: ${date}*\n`;
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
  llm?: LLMProvider,
): Promise<void> {
  const useCli = !llm && isClaudeCliAvailable();
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

  // Load existing hub to skip duplicates
  const hubPath = path.join(knowledgeDir, 'knowledge.md');
  const existingHubContent = fs.existsSync(hubPath) ? fs.readFileSync(hubPath, 'utf-8') : '';

  let created = 0;
  let skipped = 0;
  const hubEntries: { category: string; title: string; summary: string; filePath: string }[] = [];

  for (let i = 0; i < allFiles.length; i++) {
    const file = allFiles[i];
    callbacks.onProcessing(path.basename(file), i + 1, allFiles.length);

    // Processing priority: frontmatter → LLMProvider → CLI → simple fallback
    let result: DocumentResult | null = extractFrontmatterCategory(file);
    if (!result && llm) {
      result = await processDocumentWithLLM(file, llm);
    }
    if (!result && useCli) {
      result = await processDocumentWithCli(file);
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

    // Skip if already linked in hub (duplicate prevention)
    if (existingHubContent.includes(relativePath)) {
      skipped++;
      callbacks.onSkipped(path.basename(file), 'Already imported');
      continue;
    }

    const finalContent = buildAkbContent(result, file);
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
  updateKnowledgeHub(companyRoot, hubEntries, existingHubContent);

  callbacks.onDone({ imported: allFiles.length, created, skipped });
}

/* ─── Hub Updater ────────────────────────────── */

function updateKnowledgeHub(
  companyRoot: string,
  entries: { category: string; title: string; summary: string; filePath: string }[],
  existingContent: string,
) {
  if (entries.length === 0) return;

  const hubPath = path.join(companyRoot, 'knowledge', 'knowledge.md');
  let content = existingContent || '# Knowledge Base\n\nDomain knowledge.\n';

  // Remove previous "## Imported Knowledge" section to avoid duplication
  const importedIdx = content.indexOf('\n## Imported Knowledge');
  if (importedIdx !== -1) {
    content = content.slice(0, importedIdx);
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
      content += `- [${item.title}](${item.filePath})${item.summary ? ` — ${item.summary}` : ''}\n`;
    }
    content += '\n';
  }

  fs.writeFileSync(hubPath, content);
}
