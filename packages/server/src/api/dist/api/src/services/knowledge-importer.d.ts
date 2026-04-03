import type { LLMProvider } from '../engine/llm-adapter.js';
export interface ImportCallbacks {
    onScanning: (scanPath: string, fileCount: number) => void;
    onProcessing: (file: string, index: number, total: number) => void;
    onCreated: (filePath: string, title: string, summary: string) => void;
    onSkipped: (file: string, reason: string) => void;
    onDone: (stats: {
        imported: number;
        created: number;
        skipped: number;
    }) => void;
    onError: (message: string) => void;
}
export declare function importKnowledge(paths: string[], companyRoot: string, callbacks: ImportCallbacks, llm?: LLMProvider): Promise<void>;
