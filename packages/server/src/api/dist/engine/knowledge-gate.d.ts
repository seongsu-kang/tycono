export interface RelatedDoc {
    path: string;
    matches: number;
    preview: string;
}
export interface KnowledgeDebtItem {
    type: 'missing-crosslink' | 'missing-hub' | 'stale-doc' | 'orphan-doc' | 'broken-link';
    file: string;
    message: string;
}
export interface PostKnowledgingResult {
    pass: boolean;
    debt: KnowledgeDebtItem[];
    newDocs: string[];
    modifiedDocs: string[];
}
export interface DecayReport {
    health: number;
    orphanDocs: string[];
    brokenLinks: Array<{
        file: string;
        link: string;
    }>;
    totalDocs: number;
    linkedDocs: number;
}
/** Extract meaningful keywords from task directive for knowledge search */
export declare function extractKeywords(text: string): string[];
/** Search knowledge/ and architecture/ for docs related to given keywords */
export declare function searchRelatedDocs(companyRoot: string, keywords: string[]): RelatedDoc[];
/** Build an enhanced AKB warning with auto-search results for a new .md file */
export declare function buildKnowledgeGateWarning(companyRoot: string, filePath: string, content: string): string;
/** Check if a .md file has a cross-link section with at least 1 link */
export declare function hasCrossLinks(content: string): boolean;
/** Check if a file is registered in its folder's Hub document */
export declare function isRegisteredInHub(companyRoot: string, filePath: string): boolean;
/** Run Post-Knowledging checks on changed files */
export declare function postKnowledgingCheck(companyRoot: string, changedFiles: string[]): PostKnowledgingResult;
/** Scan for orphan docs (not registered in Hub) and broken links */
export declare function detectDecay(companyRoot: string): DecayReport;
