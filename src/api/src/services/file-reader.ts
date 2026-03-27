import fs from 'node:fs';
import path from 'node:path';
import matter from 'gray-matter';
import { glob } from 'glob';

function findCompanyRoot(): string {
  if (process.env.COMPANY_ROOT) return process.env.COMPANY_ROOT;
  // Walk up from cwd to find knowledge/CLAUDE.md (project root marker)
  let dir = process.cwd();
  while (dir !== path.dirname(dir)) {
    if (fs.existsSync(path.join(dir, 'knowledge', 'CLAUDE.md'))) return dir;
    dir = path.dirname(dir);
  }
  return process.cwd();
}

export let COMPANY_ROOT = findCompanyRoot();

/** Update COMPANY_ROOT at runtime (e.g. after scaffold picks a new location) */
export function setCompanyRoot(root: string): void {
  COMPANY_ROOT = root;
  process.env.COMPANY_ROOT = root;
}

function resolve(...segments: string[]): string {
  return path.resolve(COMPANY_ROOT, ...segments);
}

/**
 * Markdown 파일을 읽고 frontmatter와 content를 분리하여 반환한다.
 */
export function readMarkdown(filePath: string): { frontmatter: Record<string, unknown>; content: string } {
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
export function readFile(filePath: string): string {
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
export function listFiles(dirPath: string, pattern = '*.md'): string[] {
  const absolute = resolve(dirPath);
  if (!fs.existsSync(absolute)) {
    return [];
  }
  return glob.sync(pattern, { cwd: absolute }).sort();
}

/**
 * 파일 존재 여부를 확인한다.
 */
export function fileExists(filePath: string): boolean {
  return fs.existsSync(resolve(filePath));
}

export class FileNotFoundError extends Error {
  constructor(filePath: string) {
    super(`File not found: ${filePath}`);
    this.name = 'FileNotFoundError';
  }
}
