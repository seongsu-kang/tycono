export interface ConversationLimits {
    /** Harness 레벨 경고 턴 수 (기본 50). 도달 시 turn:warning 이벤트 발생. */
    softLimit: number;
    /** Harness 레벨 강제 종료 턴 수 (기본 200). 도달 시 Runner abort. */
    hardLimit: number;
}
export interface CompanyConfig {
    engine: 'claude-cli' | 'direct-api';
    model?: string;
    apiKey?: string;
    codeRoot?: string;
    conversationLimits?: Partial<ConversationLimits>;
}
export declare const TYCONO_DIR = ".tycono";
/** Resolve conversation limits with defaults. */
export declare function getConversationLimits(config: CompanyConfig): ConversationLimits;
/** Read config from .tycono/config.json. Returns defaults if missing. */
export declare function readConfig(companyRoot: string): CompanyConfig;
/** Write config to .tycono/config.json. Creates dir if needed. */
export declare function writeConfig(companyRoot: string, config: CompanyConfig): void;
/**
 * Load config and apply to process.env.
 * Called once at server startup.
 */
export declare function applyConfig(companyRoot: string): CompanyConfig;
