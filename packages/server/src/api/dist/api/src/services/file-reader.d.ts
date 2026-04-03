export declare let COMPANY_ROOT: string;
/** Update COMPANY_ROOT at runtime (e.g. after scaffold picks a new location) */
export declare function setCompanyRoot(root: string): void;
/**
 * Markdown 파일을 읽고 frontmatter와 content를 분리하여 반환한다.
 */
export declare function readMarkdown(filePath: string): {
    frontmatter: Record<string, unknown>;
    content: string;
};
/**
 * 파일의 raw text를 반환한다.
 */
export declare function readFile(filePath: string): string;
/**
 * 디렉토리 내 파일 목록을 반환한다.
 * pattern 미지정 시 *.md 파일만 반환.
 */
export declare function listFiles(dirPath: string, pattern?: string): string[];
/**
 * 파일 존재 여부를 확인한다.
 */
export declare function fileExists(filePath: string): boolean;
export declare class FileNotFoundError extends Error {
    constructor(filePath: string);
}
