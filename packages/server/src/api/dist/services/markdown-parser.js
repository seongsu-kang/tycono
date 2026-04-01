/**
 * Markdown 테이블을 JSON 배열로 변환하는 파서.
 *
 * roles.md, projects.md, tasks.md 등의 테이블 구조를 파싱한다.
 * 헤더 행 + 구분선(---|---) + 데이터 행 패턴 처리.
 */
/**
 * Markdown 문자열에서 첫 번째 테이블을 찾아 객체 배열로 변환한다.
 */
export function parseMarkdownTable(content) {
    const lines = content.split('\n');
    const result = [];
    let headers = null;
    let inTable = false;
    for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed.startsWith('|')) {
            if (inTable)
                break; // 테이블 끝
            continue;
        }
        const cells = parsePipeLine(trimmed);
        // 구분선 (|---|---|---| 패턴) 건너뛰기
        if (cells.every(c => /^[-: ]+$/.test(c))) {
            inTable = true;
            continue;
        }
        if (!headers) {
            headers = cells.map(normalizeHeader);
            continue;
        }
        if (!inTable)
            continue;
        const row = {};
        headers.forEach((header, i) => {
            row[header] = cleanCellValue(cells[i] ?? '');
        });
        result.push(row);
    }
    return result;
}
/**
 * Markdown 문자열에서 모든 테이블을 객체 배열로 변환한다.
 */
export function parseAllMarkdownTables(content) {
    const lines = content.split('\n');
    const tables = [];
    let headers = null;
    let currentTable = [];
    let inTable = false;
    for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed.startsWith('|')) {
            if (inTable) {
                tables.push(currentTable);
                currentTable = [];
                headers = null;
                inTable = false;
            }
            continue;
        }
        const cells = parsePipeLine(trimmed);
        if (cells.every(c => /^[-: ]+$/.test(c))) {
            inTable = true;
            continue;
        }
        if (!headers) {
            headers = cells.map(normalizeHeader);
            continue;
        }
        if (!inTable)
            continue;
        const row = {};
        headers.forEach((header, i) => {
            row[header] = cleanCellValue(cells[i] ?? '');
        });
        currentTable.push(row);
    }
    if (inTable && currentTable.length > 0) {
        tables.push(currentTable);
    }
    return tables;
}
/**
 * Markdown 본문에서 특정 ## 섹션의 내용을 추출한다.
 */
export function extractSection(content, sectionName) {
    const lines = content.split('\n');
    let capturing = false;
    const captured = [];
    for (const line of lines) {
        if (line.match(new RegExp(`^##\\s+${escapeRegex(sectionName)}`, 'i'))) {
            capturing = true;
            continue;
        }
        if (capturing && /^##\s+/.test(line)) {
            break;
        }
        if (capturing) {
            captured.push(line);
        }
    }
    if (captured.length === 0)
        return null;
    return captured.join('\n').trim();
}
/**
 * Markdown 리스트 아이템을 문자열 배열로 추출한다.
 */
export function extractListItems(content) {
    return content
        .split('\n')
        .filter(line => /^\s*[-*]\s+/.test(line))
        .map(line => line.replace(/^\s*[-*]\s+/, '').trim());
}
/**
 * Markdown bold 패턴에서 key-value를 추출한다.
 * 예: "**도메인**: AI SaaS" → { key: "도메인", value: "AI SaaS" }
 */
export function extractBoldKeyValues(content) {
    const result = {};
    const regex = /\*\*(.+?)\*\*:\s*(.+)/g;
    let match;
    while ((match = regex.exec(content)) !== null) {
        result[match[1].trim()] = match[2].trim();
    }
    return result;
}
// --- Internal helpers ---
function parsePipeLine(line) {
    return line
        .split('|')
        .slice(1, -1) // 양끝 빈 문자열 제거
        .map(cell => cell.trim());
}
function normalizeHeader(header) {
    return header
        .toLowerCase()
        .replace(/\s+/g, '_')
        .replace(/[^a-z0-9_가-힣]/g, '');
}
function cleanCellValue(value) {
    // Markdown 링크 [text](url) → text 추출
    return value.replace(/\[([^\]]+)\]\([^)]+\)/g, '$1').trim();
}
function escapeRegex(str) {
    return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
