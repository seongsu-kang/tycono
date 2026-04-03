/**
 * Markdown 테이블을 JSON 배열로 변환하는 파서.
 *
 * roles.md, projects.md, tasks.md 등의 테이블 구조를 파싱한다.
 * 헤더 행 + 구분선(---|---) + 데이터 행 패턴 처리.
 */
/**
 * Markdown 문자열에서 첫 번째 테이블을 찾아 객체 배열로 변환한다.
 */
export declare function parseMarkdownTable(content: string): Record<string, string>[];
/**
 * Markdown 문자열에서 모든 테이블을 객체 배열로 변환한다.
 */
export declare function parseAllMarkdownTables(content: string): Record<string, string>[][];
/**
 * Markdown 본문에서 특정 ## 섹션의 내용을 추출한다.
 */
export declare function extractSection(content: string, sectionName: string): string | null;
/**
 * Markdown 리스트 아이템을 문자열 배열로 추출한다.
 */
export declare function extractListItems(content: string): string[];
/**
 * Markdown bold 패턴에서 key-value를 추출한다.
 * 예: "**도메인**: AI SaaS" → { key: "도메인", value: "AI SaaS" }
 */
export declare function extractBoldKeyValues(content: string): Record<string, string>;
