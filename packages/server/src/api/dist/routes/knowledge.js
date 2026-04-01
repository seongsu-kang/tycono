/**
 * knowledge.ts — Knowledge Base API routes
 *
 * GET /api/knowledge     — 전체 문서 목록 (frontmatter, TL;DR, cross-links)
 * GET /api/knowledge/*   — 단일 문서 (full content, wildcard nested path)
 */
import { Router } from 'express';
import fs from 'node:fs';
import path from 'node:path';
import matter from 'gray-matter';
import { glob } from 'glob';
import { COMPANY_ROOT } from '../services/file-reader.js';
import { detectDecay, searchRelatedDocs, extractKeywords } from '../engine/knowledge-gate.js';
export const knowledgeRouter = Router();
function knowledgeDir() { return path.join(COMPANY_ROOT, 'knowledge'); }
function companyRoot() { return COMPANY_ROOT; }
/* ─── Helpers ─────────────────────────────────────── */
function extractTldr(content) {
    // Try > blockquote on the first few lines
    const blockquoteMatch = content.match(/^>\s+(.+)/m);
    if (blockquoteMatch)
        return blockquoteMatch[1].trim().slice(0, 160);
    // Try ## TL;DR section
    const tldrSection = content.match(/##\s+TL;DR\s*\n+([^\n#]+)/i);
    if (tldrSection)
        return tldrSection[1].trim().slice(0, 160);
    // Fallback: first non-heading, non-empty line
    const firstLine = content
        .split('\n')
        .find((l) => l.trim().length > 0 && !l.startsWith('#') && !l.startsWith('---') && !l.startsWith('|'));
    return firstLine?.trim().slice(0, 160) ?? '';
}
function extractLinks(content) {
    const matches = [...content.matchAll(/\[([^\]]+)\]\(([^)]+\.md[^)]*)\)/g)];
    return matches.map((m) => ({ text: m[1], href: m[2] })).slice(0, 20);
}
function inferCategory(filePath, tags) {
    // dir name as category
    const parts = filePath.split('/');
    if (parts.length > 1)
        return parts[0];
    // domain/ tag
    const domainTag = tags.find((t) => t.startsWith('domain/'));
    if (domainTag)
        return domainTag.replace('domain/', '');
    // keyword fallback from remaining tags
    const knownCategories = ['tech', 'market', 'strategy', 'financial', 'process', 'competitor'];
    for (const tag of tags) {
        if (knownCategories.includes(tag))
            return tag;
    }
    return 'general';
}
/* ─── List endpoint ───────────────────────────────── */
knowledgeRouter.get('/', (_req, res, next) => {
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
            if (base === 'CLAUDE.md')
                return false;
            return true;
        })
            .sort();
        const docs = files.map((f) => {
            const absPath = path.join(companyRoot(), f);
            let raw = '';
            try {
                raw = fs.readFileSync(absPath, 'utf-8');
            }
            catch {
                return null;
            }
            const isHtml = f.endsWith('.html');
            const format = isHtml ? 'html' : 'md';
            if (isHtml) {
                // HTML files: extract <title>, no frontmatter
                const titleMatch = raw.match(/<title>([^<]+)<\/title>/i);
                const title = titleMatch ? titleMatch[1].trim() : path.basename(f, '.html');
                const category = inferCategory(f, []);
                return {
                    id: f.replace(/\\/g, '/'),
                    title,
                    akb_type: 'node',
                    status: 'active',
                    tags: [],
                    category,
                    tldr: '',
                    links: [],
                    format,
                };
            }
            const { data, content } = matter(raw);
            const tags = Array.isArray(data.tags) ? data.tags : [];
            const akbType = data.akb_type === 'hub' ? 'hub' : 'node';
            const status = data.status === 'draft' ? 'draft' : data.status === 'deprecated' ? 'deprecated' : 'active';
            // Title: frontmatter > first # heading > filename
            let title = data.title ?? '';
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
    }
    catch (err) {
        next(err);
    }
});
/* ─── Knowledge Health endpoint ──────────────────── */
knowledgeRouter.get('/health', (_req, res, next) => {
    try {
        const report = detectDecay(companyRoot());
        res.json(report);
    }
    catch (err) {
        next(err);
    }
});
/* ─── Related docs search endpoint ──────────────── */
knowledgeRouter.get('/related', (req, res, next) => {
    try {
        const query = String(req.query.q ?? '');
        if (!query) {
            res.status(400).json({ error: 'q parameter required' });
            return;
        }
        const keywords = extractKeywords(query);
        const docs = searchRelatedDocs(companyRoot(), keywords);
        res.json({ keywords, docs });
    }
    catch (err) {
        next(err);
    }
});
/* ─── Single document endpoint ────────────────────── */
/* ─── Create document endpoint ───────────────────── */
knowledgeRouter.post('/', (req, res, next) => {
    try {
        const { filename, title, category, content } = req.body;
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
    }
    catch (err) {
        next(err);
    }
});
/* ─── Update document endpoint ───────────────────── */
knowledgeRouter.put('/{*path}', (req, res, next) => {
    try {
        const rawPath = req.params.path;
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
        const { content } = req.body;
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
    }
    catch (err) {
        next(err);
    }
});
/* ─── Delete document endpoint ───────────────────── */
knowledgeRouter.delete('/{*path}', (req, res, next) => {
    try {
        const rawPath = req.params.path;
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
    }
    catch (err) {
        next(err);
    }
});
/* ─── Single document endpoint ────────────────────── */
knowledgeRouter.get('/{*path}', (req, res, next) => {
    try {
        const rawPath = req.params.path;
        const docId = Array.isArray(rawPath) ? rawPath.join('/') : String(rawPath ?? '');
        if (!docId) {
            res.status(400).json({ error: 'Document ID required' });
            return;
        }
        const absPath = path.resolve(companyRoot(), docId);
        // Security: ensure path stays within companyRoot
        if (!absPath.startsWith(companyRoot() + path.sep) && absPath !== companyRoot()) {
            res.status(403).json({ error: 'Forbidden' });
            return;
        }
        if (!fs.existsSync(absPath)) {
            res.status(404).json({ error: `Document not found: ${docId}` });
            return;
        }
        const raw = fs.readFileSync(absPath, 'utf-8');
        const isHtml = docId.endsWith('.html');
        const format = isHtml ? 'html' : 'md';
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
        const tags = Array.isArray(data.tags) ? data.tags : [];
        const akbType = data.akb_type === 'hub' ? 'hub' : 'node';
        const status = data.status === 'draft' ? 'draft' : data.status === 'deprecated' ? 'deprecated' : 'active';
        let title = data.title ?? '';
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
    }
    catch (err) {
        next(err);
    }
});
