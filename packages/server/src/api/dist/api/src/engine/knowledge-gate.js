import fs from 'node:fs';
import path from 'node:path';
import { glob } from 'glob';
/* ─── Pre-Knowledging: Keyword Extraction ────── */
/** Extract meaningful keywords from task directive for knowledge search */
export function extractKeywords(text) {
    // Remove common stop words and short words
    const stopWords = new Set([
        // English
        'the', 'a', 'an', 'is', 'are', 'was', 'were', 'be', 'been', 'being',
        'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would', 'could',
        'should', 'may', 'might', 'shall', 'can', 'need', 'must', 'to', 'of',
        'in', 'for', 'on', 'with', 'at', 'by', 'from', 'as', 'into', 'through',
        'and', 'but', 'or', 'not', 'no', 'if', 'then', 'else', 'when', 'up',
        'all', 'each', 'every', 'both', 'few', 'more', 'most', 'other', 'some',
        'such', 'than', 'too', 'very', 'just', 'about', 'above', 'after',
        'this', 'that', 'these', 'those', 'it', 'its', 'my', 'your', 'our',
        'what', 'which', 'who', 'how', 'use', 'make', 'get', 'set',
        // Korean common particles/verbs
        '해', '하고', '하는', '해줘', '해라', '하세요', '합니다', '된', '되는',
        '이', '그', '저', '것', '거', '을', '를', '에', '에서', '으로', '로',
        '와', '과', '는', '은', '가', '의', '도', '만', '좀', '더',
        // Task-specific
        'ceo', 'wave', 'continuation', 'previous', 'context', 'response',
        'read', 'write', 'file', 'update', 'check', 'implement',
    ]);
    // Strip markdown, brackets, special chars
    const cleaned = text
        .replace(/\[.*?\]/g, ' ')
        .replace(/[#*`_\->\[\](){}|]/g, ' ')
        .replace(/https?:\/\/\S+/g, ' ')
        .replace(/[^\w\sㄱ-힣]/g, ' ');
    const words = cleaned
        .split(/\s+/)
        .map(w => w.toLowerCase().trim())
        .filter(w => w.length >= 3 && !stopWords.has(w));
    // Deduplicate and take top keywords by frequency
    const freq = new Map();
    for (const w of words) {
        freq.set(w, (freq.get(w) ?? 0) + 1);
    }
    return [...freq.entries()]
        .sort((a, b) => b[1] - a[1])
        .slice(0, 8)
        .map(([word]) => word);
}
/* ─── Pre-Knowledging: Related Doc Search ────── */
/** Search knowledge/ and architecture/ for docs related to given keywords */
export function searchRelatedDocs(companyRoot, keywords) {
    if (keywords.length === 0)
        return [];
    const searchDirs = ['knowledge', 'knowledge/architecture', 'knowledge/projects'];
    const results = [];
    for (const dir of searchDirs) {
        const dirPath = path.join(companyRoot, dir);
        if (!fs.existsSync(dirPath))
            continue;
        const files = glob.sync('**/*.md', {
            cwd: dirPath,
            ignore: ['**/journal/**'],
        });
        for (const file of files) {
            const filePath = path.join(dirPath, file);
            try {
                const content = fs.readFileSync(filePath, 'utf-8');
                const lowerContent = content.toLowerCase();
                let matches = 0;
                for (const kw of keywords) {
                    // Count occurrences (case insensitive)
                    const regex = new RegExp(kw.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi');
                    const found = lowerContent.match(regex);
                    if (found)
                        matches += found.length;
                }
                if (matches >= 2) {
                    // Extract title from first heading
                    const titleMatch = content.match(/^#\s+(.+)/m);
                    const title = titleMatch ? titleMatch[1].trim() : file;
                    const relativePath = path.join(dir, file);
                    results.push({
                        path: relativePath,
                        matches,
                        preview: title,
                    });
                }
            }
            catch {
                // Skip unreadable files
            }
        }
    }
    // Sort by match count descending, take top 5
    return results
        .sort((a, b) => b.matches - a.matches)
        .slice(0, 5);
}
/* ─── Knowledge Gate: Auto-search on new .md ─── */
/** Build an enhanced AKB warning with auto-search results for a new .md file */
export function buildKnowledgeGateWarning(companyRoot, filePath, content) {
    // Extract keywords from file name + first 5 lines
    const fileName = path.basename(filePath, '.md').replace(/[-_]/g, ' ');
    const firstLines = content.split('\n').slice(0, 5).join(' ');
    const keywords = extractKeywords(`${fileName} ${firstLines}`);
    const related = searchRelatedDocs(companyRoot, keywords);
    let warning = '\n\n[AKB Knowledge Gate] 새 .md 파일입니다.\n';
    if (related.length > 0) {
        warning += '\n📚 관련 문서 발견:\n';
        for (const doc of related) {
            warning += `  - ${doc.path} — "${doc.preview}" (${doc.matches} matches)\n`;
        }
        warning += '\n→ 70%+ 중복이면 기존 문서에 추가하세요.\n';
        warning += '→ 새 문서라면 반드시:\n';
    }
    else {
        warning += '\n관련 문서를 찾지 못했습니다. 새 문서 생성이 적절합니다.\n';
        warning += '반드시:\n';
    }
    warning += '  (1) 관련 문서 섹션에 cross-link를 추가하세요\n';
    warning += '  (2) 해당 폴더의 Hub 파일에 등록하세요\n';
    return warning;
}
/* ─── Post-Knowledging: Verification ─────────── */
/** Check if a .md file has a cross-link section with at least 1 link */
export function hasCrossLinks(content) {
    // Look for "관련 문서" or "Related" section with markdown links
    const crossLinkSection = content.match(/##\s*(관련 문서|Related|References|See Also)/i);
    if (!crossLinkSection)
        return false;
    // Check for at least one markdown link after the section header
    const sectionStart = content.indexOf(crossLinkSection[0]);
    const afterSection = content.slice(sectionStart);
    return /\[.+?\]\(.+?\)/.test(afterSection);
}
/** Check if a file is registered in its folder's Hub document */
export function isRegisteredInHub(companyRoot, filePath) {
    const dir = path.dirname(filePath);
    const dirName = path.basename(dir);
    const hubPath = path.join(companyRoot, dir, `${dirName}.md`);
    if (!fs.existsSync(hubPath))
        return true; // No hub = no enforcement
    const hubContent = fs.readFileSync(hubPath, 'utf-8');
    const fileName = path.basename(filePath);
    // Check if the file is mentioned in the hub (by filename or relative path)
    return hubContent.includes(fileName) || hubContent.includes(`./${fileName}`);
}
/** Run Post-Knowledging checks on changed files */
export function postKnowledgingCheck(companyRoot, changedFiles) {
    const debt = [];
    const newDocs = [];
    const modifiedDocs = [];
    for (const file of changedFiles) {
        // Only check .md files (skip journals)
        if (!file.endsWith('.md') || file.includes('journal/'))
            continue;
        const absolute = path.resolve(companyRoot, file);
        if (!fs.existsSync(absolute))
            continue;
        const content = fs.readFileSync(absolute, 'utf-8');
        // Categorize
        // We can't tell new vs modified from just file list, so check if it's a knowledge/architecture doc
        if (file.startsWith('knowledge/') || file.startsWith('knowledge/architecture/') || file.startsWith('knowledge/projects/')) {
            modifiedDocs.push(file);
        }
        // Check cross-links
        if (!hasCrossLinks(content)) {
            debt.push({
                type: 'missing-crosslink',
                file,
                message: `"${file}" has no cross-link section (## 관련 문서)`,
            });
        }
        // Check Hub registration
        if (!isRegisteredInHub(companyRoot, file)) {
            debt.push({
                type: 'missing-hub',
                file,
                message: `"${file}" is not registered in its Hub document`,
            });
        }
    }
    return {
        pass: debt.length === 0,
        debt,
        newDocs,
        modifiedDocs,
    };
}
/* ─── Decay Detection ────────────────────────── */
/** Scan for orphan docs (not registered in Hub) and broken links */
export function detectDecay(companyRoot) {
    const searchDirs = ['knowledge', 'knowledge/architecture'];
    const orphanDocs = [];
    const staleDocs = [];
    const brokenLinks = [];
    let totalDocs = 0;
    let linkedDocs = 0;
    for (const dir of searchDirs) {
        const dirPath = path.join(companyRoot, dir);
        if (!fs.existsSync(dirPath))
            continue;
        const hubName = `${dir}.md`;
        const hubPath = path.join(dirPath, hubName);
        const hubContent = fs.existsSync(hubPath) ? fs.readFileSync(hubPath, 'utf-8') : '';
        const files = glob.sync('*.md', { cwd: dirPath });
        for (const file of files) {
            if (file === hubName)
                continue; // Skip hub itself
            totalDocs++;
            // Check if registered in hub
            if (hubContent && !hubContent.includes(file) && !hubContent.includes(`./${file}`)) {
                orphanDocs.push(path.join(dir, file));
            }
            else {
                linkedDocs++;
            }
            // Check for broken links and stale status in the file
            const filePath = path.join(dirPath, file);
            try {
                const content = fs.readFileSync(filePath, 'utf-8');
                // Check for deprecated/stale status in frontmatter
                const frontmatterMatch = content.match(/^---\n([\s\S]*?)\n---/);
                if (frontmatterMatch) {
                    const frontmatter = frontmatterMatch[1];
                    if (/status:\s*(deprecated|stale)/i.test(frontmatter)) {
                        staleDocs.push(path.join(dir, file));
                    }
                }
                const linkRegex = /\[.*?\]\(\.\/(.*?\.md)\)/g;
                let match;
                while ((match = linkRegex.exec(content)) !== null) {
                    const linkedFile = match[1];
                    const linkedPath = path.join(dirPath, linkedFile);
                    if (!fs.existsSync(linkedPath)) {
                        // Also check if it's a relative path from parent
                        const parentLinkedPath = path.join(companyRoot, dir, linkedFile);
                        if (!fs.existsSync(parentLinkedPath)) {
                            brokenLinks.push({
                                file: path.join(dir, file),
                                link: linkedFile,
                            });
                        }
                    }
                }
                // Also check ../relative links
                const parentLinkRegex = /\[.*?\]\(\.\.\/(.*?\.md)\)/g;
                while ((match = parentLinkRegex.exec(content)) !== null) {
                    const linkedFile = match[1];
                    const linkedPath = path.join(companyRoot, linkedFile);
                    if (!fs.existsSync(linkedPath)) {
                        brokenLinks.push({
                            file: path.join(dir, file),
                            link: `../${linkedFile}`,
                        });
                    }
                }
            }
            catch {
                // Skip unreadable
            }
        }
    }
    const health = totalDocs > 0
        ? Math.round(((totalDocs - orphanDocs.length - staleDocs.length - brokenLinks.length) / totalDocs) * 100)
        : 100;
    // Build suggestions
    const suggestions = [];
    if (orphanDocs.length > 0) {
        suggestions.push(`${orphanDocs.length}개의 고아 문서를 Hub에 등록하세요`);
    }
    if (staleDocs.length > 0) {
        suggestions.push(`${staleDocs.length}개의 오래된 문서를 업데이트하거나 삭제하세요`);
    }
    if (brokenLinks.length > 0) {
        suggestions.push(`${brokenLinks.length}개의 깨진 링크를 수정하세요`);
    }
    if (orphanDocs.length === 0 && staleDocs.length === 0 && brokenLinks.length === 0) {
        suggestions.push('모든 문서가 건강합니다! 🎉');
    }
    return {
        health: Math.max(0, Math.min(100, health)),
        orphanDocs,
        staleDocs,
        brokenLinks,
        suggestions,
        totalDocs,
        linkedDocs,
    };
}
