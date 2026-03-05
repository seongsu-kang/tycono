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

const knowledgeDir = path.join(COMPANY_ROOT, 'knowledge');

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
    if (!fs.existsSync(knowledgeDir)) {
      res.json([]);
      return;
    }

    const files = glob.sync('**/*.md', { cwd: knowledgeDir })
      .filter((f) => f !== 'knowledge.md')
      .sort();

    const docs = files.map((f) => {
      const absPath = path.join(knowledgeDir, f);
      let raw = '';
      try { raw = fs.readFileSync(absPath, 'utf-8'); } catch { return null; }

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
      };
    }).filter(Boolean);

    res.json(docs);
  } catch (err) {
    next(err);
  }
});

/* ─── Single document endpoint ────────────────────── */

knowledgeRouter.get('/*', (req: Request, res: Response, next: NextFunction) => {
  try {
    // req.params[0] captures the wildcard after /api/knowledge/
    const docId = (req.params as Record<string, string>)[0];
    if (!docId) {
      res.status(400).json({ error: 'Document ID required' });
      return;
    }

    const absPath = path.join(knowledgeDir, docId);

    // Security: ensure path stays within knowledgeDir
    if (!absPath.startsWith(knowledgeDir)) {
      res.status(403).json({ error: 'Forbidden' });
      return;
    }

    if (!fs.existsSync(absPath)) {
      res.status(404).json({ error: `Document not found: ${docId}` });
      return;
    }

    const raw = fs.readFileSync(absPath, 'utf-8');
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
    });
  } catch (err) {
    next(err);
  }
});
