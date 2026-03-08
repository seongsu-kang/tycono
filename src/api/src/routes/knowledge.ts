/**
 * knowledge.ts — Knowledge Base API routes
 *
 * GET /api/knowledge     — 전체 문서 목록 (frontmatter, TL;DR, cross-links)
 * GET /api/knowledge/*   — 단일 문서 (full content, wildcard nested path)
 */
import { Router, Request, Response, NextFunction } from 'express';
import fs from 'node:fs';
import path from 'node:path';
import matter from 'gray-matter';
import { glob } from 'glob';
import { COMPANY_ROOT } from '../services/file-reader.js';

export const knowledgeRouter = Router();

function knowledgeDir(): string { return path.join(COMPANY_ROOT, 'knowledge'); }
function companyRoot(): string { return COMPANY_ROOT; }

/* ─── Helpers ─────────────────────────────────────── */

function extractTldr(content: string): string {
  // Try > blockquote on the first few lines
  const blockquoteMatch = content.match(/^>\s+(.+)/m);
  if (blockquoteMatch) return blockquoteMatch[1].trim().slice(0, 160);

  // Try ## TL;DR section
  const tldrSection = content.match(/##\s+TL;DR\s*\n+([^\n#]+)/i);
  if (tldrSection) return tldrSection[1].trim().slice(0, 160);

  // Fallback: first non-heading, non-empty line
  const firstLine = content
    .split('\n')
    .find((l) => l.trim().length > 0 && !l.startsWith('#') && !l.startsWith('---') && !l.startsWith('|'));
  return firstLine?.trim().slice(0, 160) ?? '';
}

function extractLinks(content: string): { text: string; href: string }[] {
  const matches = [...content.matchAll(/\[([^\]]+)\]\(([^)]+\.md[^)]*)\)/g)];
  return matches.map((m) => ({ text: m[1], href: m[2] })).slice(0, 20);
}

function inferCategory(filePath: string, tags: string[]): string {
  // dir name as category
  const parts = filePath.split('/');
  if (parts.length > 1) return parts[0];

  // domain/ tag
  const domainTag = tags.find((t) => t.startsWith('domain/'));
  if (domainTag) return domainTag.replace('domain/', '');

  // keyword fallback from remaining tags
  const knownCategories = ['tech', 'market', 'strategy', 'financial', 'process', 'competitor'];
  for (const tag of tags) {
    if (knownCategories.includes(tag)) return tag;
  }

  return 'general';
}

/* ─── List endpoint ───────────────────────────────── */

knowledgeRouter.get('/', (_req: Request, res: Response, next: NextFunction) => {
  try {
    if (!fs.existsSync(companyRoot())) {
      res.json([]);
      return;
    }

    const files = glob.sync('**/*.{md,html}', {
      cwd: companyRoot(),
      ignore: [
        'node_modules/**', '.claude/**', '.obsidian/**', '.tycono/**', '.git/**',
        '**/node_modules/**',
      ],
    })
      .filter((f) => {
        const base = path.basename(f);
        // Exclude hub files (folder-name.md pattern) and CLAUDE.md
        if (base === 'CLAUDE.md') return false;
        return true;
      })
      .sort();

    const docs = files.map((f) => {
      const absPath = path.join(companyRoot(), f);
      let raw = '';
      try { raw = fs.readFileSync(absPath, 'utf-8'); } catch { return null; }

      const isHtml = f.endsWith('.html');
      const format: 'md' | 'html' = isHtml ? 'html' : 'md';

      if (isHtml) {
        // HTML files: extract <title>, no frontmatter
        const titleMatch = raw.match(/<title>([^<]+)<\/title>/i);
        const title = titleMatch ? titleMatch[1].trim() : path.basename(f, '.html');
        const category = inferCategory(f, []);
        return {
          id: f.replace(/\\/g, '/'),
          title,
          akb_type: 'node' as const,
          status: 'active' as const,
          tags: [] as string[],
          category,
          tldr: '',
          links: [] as { text: string; href: string }[],
          format,
        };
      }

      const { data, content } = matter(raw);

      const tags: string[] = Array.isArray(data.tags) ? data.tags : [];
      const akbType: 'hub' | 'node' = data.akb_type === 'hub' ? 'hub' : 'node';
      const status: 'active' | 'draft' | 'deprecated' =
        data.status === 'draft' ? 'draft' : data.status === 'deprecated' ? 'deprecated' : 'active';

      // Title: frontmatter > first # heading > filename
      let title: string = (data.title as string) ?? '';
      if (!title) {
        const headingMatch = content.match(/^#\s+(.+)/m);
        title = headingMatch ? headingMatch[1].trim() : path.basename(f, '.md');
      }

      const category = inferCategory(f, tags);
      const tldr = extractTldr(content);
      const links = extractLinks(content);

      return {
        id: f.replace(/\\/g, '/'),
        title,
        akb_type: akbType,
        status,
        tags,
        category,
        tldr,
        links,
        format,
      };
    }).filter(Boolean);

    res.json(docs);
  } catch (err) {
    next(err);
  }
});

/* ─── Single document endpoint ────────────────────── */

/* ─── Create document endpoint ───────────────────── */

knowledgeRouter.post('/', (req: Request, res: Response, next: NextFunction) => {
  try {
    const { filename, title, category, content } = req.body as {
      filename?: string;
      title?: string;
      category?: string;
      content?: string;
    };

    if (!filename || !title) {
      res.status(400).json({ error: 'filename and title required' });
      return;
    }

    // Sanitize filename
    const safeName = filename.replace(/[^a-zA-Z0-9가-힣_\-. ]/g, '').replace(/\s+/g, '-');
    const fullName = safeName.endsWith('.md') ? safeName : `${safeName}.md`;
    const absPath = path.join(knowledgeDir(), fullName);

    if (!absPath.startsWith(knowledgeDir())) {
      res.status(403).json({ error: 'Forbidden' });
      return;
    }

    if (fs.existsSync(absPath)) {
      res.status(409).json({ error: 'Document already exists' });
      return;
    }

    // Build file with frontmatter
    const frontmatter = {
      title,
      status: 'draft',
      akb_type: 'node',
      tags: category ? [category] : [],
    };

    const fileContent = matter.stringify(content || `# ${title}\n`, frontmatter);
    fs.mkdirSync(path.dirname(absPath), { recursive: true });
    fs.writeFileSync(absPath, fileContent);

    res.status(201).json({ id: fullName, title });
  } catch (err) {
    next(err);
  }
});

/* ─── Update document endpoint ───────────────────── */

knowledgeRouter.put('/{*path}', (req: Request, res: Response, next: NextFunction) => {
  try {
    const rawPath = (req.params as Record<string, unknown>).path;
    const docId = Array.isArray(rawPath) ? rawPath.join('/') : String(rawPath ?? '');
    if (!docId) {
      res.status(400).json({ error: 'Document ID required' });
      return;
    }

    const absPath = path.resolve(companyRoot(), docId);
    if (!absPath.startsWith(companyRoot() + path.sep) && absPath !== companyRoot()) {
      res.status(403).json({ error: 'Forbidden' });
      return;
    }

    if (!fs.existsSync(absPath)) {
      res.status(404).json({ error: `Document not found: ${docId}` });
      return;
    }

    const { content } = req.body as { content?: string };
    if (content === undefined) {
      res.status(400).json({ error: 'content required' });
      return;
    }

    // Read existing frontmatter
    const raw = fs.readFileSync(absPath, 'utf-8');
    const { data } = matter(raw);

    // Preserve frontmatter, update content
    const updated = matter.stringify(content, data);
    fs.writeFileSync(absPath, updated);

    res.json({ id: docId, status: 'updated' });
  } catch (err) {
    next(err);
  }
});

/* ─── Delete document endpoint ───────────────────── */

knowledgeRouter.delete('/{*path}', (req: Request, res: Response, next: NextFunction) => {
  try {
    const rawPath = (req.params as Record<string, unknown>).path;
    const docId = Array.isArray(rawPath) ? rawPath.join('/') : String(rawPath ?? '');
    if (!docId) {
      res.status(400).json({ error: 'Document ID required' });
      return;
    }

    const absPath = path.resolve(companyRoot(), docId);
    if (!absPath.startsWith(companyRoot() + path.sep) && absPath !== companyRoot()) {
      res.status(403).json({ error: 'Forbidden' });
      return;
    }

    if (!fs.existsSync(absPath)) {
      res.status(404).json({ error: `Document not found: ${docId}` });
      return;
    }

    fs.unlinkSync(absPath);
    res.json({ id: docId, status: 'deleted' });
  } catch (err) {
    next(err);
  }
});

/* ─── Single document endpoint ────────────────────── */

knowledgeRouter.get('/{*path}', (req: Request, res: Response, next: NextFunction) => {
  try {
    const rawPath = (req.params as Record<string, unknown>).path;
    const docId = Array.isArray(rawPath) ? rawPath.join('/') : String(rawPath ?? '');
    if (!docId) {
      res.status(400).json({ error: 'Document ID required' });
      return;
    }

    const absPath = path.join(knowledgeDir(), docId);

    // Security: ensure path stays within knowledgeDir
    if (!absPath.startsWith(knowledgeDir())) {
      res.status(403).json({ error: 'Forbidden' });
      return;
    }

    if (!fs.existsSync(absPath)) {
      res.status(404).json({ error: `Document not found: ${docId}` });
      return;
    }

    const raw = fs.readFileSync(absPath, 'utf-8');
    const isHtml = docId.endsWith('.html');
    const format: 'md' | 'html' = isHtml ? 'html' : 'md';

    if (isHtml) {
      const titleMatch = raw.match(/<title>([^<]+)<\/title>/i);
      const title = titleMatch ? titleMatch[1].trim() : path.basename(docId, '.html');
      const category = inferCategory(docId, []);
      res.json({
        id: docId,
        title,
        akb_type: 'node',
        status: 'active',
        tags: [],
        category,
        tldr: '',
        links: [],
        content: raw,
        format,
      });
      return;
    }

    const { data, content } = matter(raw);

    const tags: string[] = Array.isArray(data.tags) ? data.tags : [];
    const akbType: 'hub' | 'node' = data.akb_type === 'hub' ? 'hub' : 'node';
    const status: 'active' | 'draft' | 'deprecated' =
      data.status === 'draft' ? 'draft' : data.status === 'deprecated' ? 'deprecated' : 'active';

    let title: string = (data.title as string) ?? '';
    if (!title) {
      const headingMatch = content.match(/^#\s+(.+)/m);
      title = headingMatch ? headingMatch[1].trim() : path.basename(docId, '.md');
    }

    const category = inferCategory(docId, tags);
    const tldr = extractTldr(content);
    const links = extractLinks(content);

    res.json({
      id: docId,
      title,
      akb_type: akbType,
      status,
      tags,
      category,
      tldr,
      links,
      content,
      format,
    });
  } catch (err) {
    next(err);
  }
});
