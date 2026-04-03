import fs from 'node:fs';
import path from 'node:path';
import matter from 'gray-matter';
import { glob } from 'glob';
function findCompanyRoot() {
    if (process.env.COMPANY_ROOT)
        return process.env.COMPANY_ROOT;
    // Walk up from cwd to find CLAUDE.md (supports both layouts)
    //   - Claude Code standard: CLAUDE.md at project root
    //   - Tycono scaffold: knowledge/CLAUDE.md
    let dir = process.cwd();
    while (dir !== path.dirname(dir)) {
        if (fs.existsSync(path.join(dir, 'CLAUDE.md')))
            return dir;
        if (fs.existsSync(path.join(dir, 'knowledge', 'CLAUDE.md')))
            return dir;
        dir = path.dirname(dir);
    }
    return process.cwd();
}
export let COMPANY_ROOT = findCompanyRoot();
/** Update COMPANY_ROOT at runtime (e.g. after scaffold picks a new location) */
export function setCompanyRoot(root) {
    COMPANY_ROOT = root;
    process.env.COMPANY_ROOT = root;
}
function resolve(...segments) {
    return path.resolve(COMPANY_ROOT, ...segments);
}
/**
 * Markdown 파일을 읽고 frontmatter와 content를 분리하여 반환한다.
 */
export function readMarkdown(filePath) {
    const absolute = resolve(filePath);
    if (!fs.existsSync(absolute)) {
        throw new FileNotFoundError(filePath);
    }
    const raw = fs.readFileSync(absolute, 'utf-8');
    const { data, content } = matter(raw);
    return { frontmatter: data, content };
}
/**
 * 파일의 raw text를 반환한다.
 */
export function readFile(filePath) {
    const absolute = resolve(filePath);
    if (!fs.existsSync(absolute)) {
        throw new FileNotFoundError(filePath);
    }
    return fs.readFileSync(absolute, 'utf-8');
}
/**
 * 디렉토리 내 파일 목록을 반환한다.
 * pattern 미지정 시 *.md 파일만 반환.
 */
export function listFiles(dirPath, pattern = '*.md') {
    const absolute = resolve(dirPath);
    if (!fs.existsSync(absolute)) {
        return [];
    }
    return glob.sync(pattern, { cwd: absolute }).sort();
}
/**
 * 파일 존재 여부를 확인한다.
 */
export function fileExists(filePath) {
    return fs.existsSync(resolve(filePath));
}
export class FileNotFoundError extends Error {
    constructor(filePath) {
        super(`File not found: ${filePath}`);
        this.name = 'FileNotFoundError';
    }
}
