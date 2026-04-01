/**
 * company-config.ts — .tycono/config.json 관리
 *
 * AKB 디렉토리의 영구 설정을 읽고 쓴다.
 * scaffold 시 생성되고, 서버 시작 시 로드된다.
 */
import fs from 'node:fs';
import path from 'node:path';
export const TYCONO_DIR = '.tycono';
const CONFIG_DIR = TYCONO_DIR;
const CONFIG_FILE = 'config.json';
const DEFAULT_CONVERSATION_LIMITS = {
    softLimit: 50,
    hardLimit: 200,
};
const DEFAULT_CONFIG = { engine: 'claude-cli' };
/** Resolve conversation limits with defaults. */
export function getConversationLimits(config) {
    return {
        ...DEFAULT_CONVERSATION_LIMITS,
        ...config.conversationLimits,
    };
}
function configPath(companyRoot) {
    return path.join(companyRoot, CONFIG_DIR, CONFIG_FILE);
}
/** Read config from .tycono/config.json. Returns defaults if missing. */
export function readConfig(companyRoot) {
    const p = configPath(companyRoot);
    if (!fs.existsSync(p))
        return { ...DEFAULT_CONFIG };
    try {
        return { ...DEFAULT_CONFIG, ...JSON.parse(fs.readFileSync(p, 'utf-8')) };
    }
    catch {
        return { ...DEFAULT_CONFIG };
    }
}
/** Write config to .tycono/config.json. Creates dir if needed. */
export function writeConfig(companyRoot, config) {
    const dir = path.join(companyRoot, CONFIG_DIR);
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(configPath(companyRoot), JSON.stringify(config, null, 2) + '\n');
}
/**
 * Load config and apply to process.env.
 * Called once at server startup.
 */
export function applyConfig(companyRoot) {
    const config = readConfig(companyRoot);
    if (config.apiKey && !process.env.ANTHROPIC_API_KEY) {
        process.env.ANTHROPIC_API_KEY = config.apiKey;
    }
    if (!process.env.EXECUTION_ENGINE) {
        process.env.EXECUTION_ENGINE = config.engine;
    }
    return config;
}
