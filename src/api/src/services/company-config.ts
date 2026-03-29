/**
 * company-config.ts — .tycono/config.json 관리
 *
 * AKB 디렉토리의 영구 설정을 읽고 쓴다.
 * scaffold 시 생성되고, 서버 시작 시 로드된다.
 */
import { execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

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
  codeRoot?: string;  // 코드 프로젝트 경로 (AKB와 분리된 코드 repo)
  defaultAgency?: string;  // 기본 agency — /tycono에서 --agency 없을 때 사용
  conversationLimits?: Partial<ConversationLimits>;
  supervision?: {
    mode: 'supervisor' | 'direct';
  };
}

export const TYCONO_DIR = '.tycono';
const CONFIG_DIR = TYCONO_DIR;
const CONFIG_FILE = 'config.json';
const DEFAULT_CONVERSATION_LIMITS: ConversationLimits = {
  softLimit: 50,
  hardLimit: 200,
};

const DEFAULT_CONFIG: CompanyConfig = { engine: 'claude-cli' };

/** Resolve conversation limits with defaults. */
export function getConversationLimits(config: CompanyConfig): ConversationLimits {
  return {
    ...DEFAULT_CONVERSATION_LIMITS,
    ...config.conversationLimits,
  };
}

function configPath(companyRoot: string): string {
  return path.join(companyRoot, CONFIG_DIR, CONFIG_FILE);
}

/**
 * Resolve codeRoot: explicit config > auto-generated sibling directory.
 * When codeRoot is not configured, defaults to `../{dirname}-code/` next to companyRoot.
 * Auto-creates the directory if it doesn't exist.
 */
export function resolveCodeRoot(companyRoot: string): string {
  const config = readConfig(companyRoot);
  const codeRoot = config.codeRoot ?? (() => {
    // Auto-generate: ../{folder-name}-code/
    const dirName = path.basename(companyRoot);
    const auto = path.join(path.dirname(companyRoot), `${dirName}-code`);
    if (!fs.existsSync(auto)) {
      fs.mkdirSync(auto, { recursive: true });
    }
    // Persist so it's stable across restarts
    writeConfig(companyRoot, { ...config, codeRoot: auto });
    return auto;
  })();

  // Auto-init git if not already a repo (even if codeRoot was already configured)
  const gitDir = path.join(codeRoot, '.git');
  if (fs.existsSync(codeRoot) && !fs.existsSync(gitDir)) {
    try {
      execSync('git init', { cwd: codeRoot, stdio: 'pipe' });
      execSync('git commit --allow-empty -m "Initial commit by Tycono"', { cwd: codeRoot, stdio: 'pipe' });
    } catch { /* ignore — git may not be installed */ }
  }

  return codeRoot;
}

/** Read config from .tycono/config.json. Returns defaults if missing. */
export function readConfig(companyRoot: string): CompanyConfig {
  const p = configPath(companyRoot);
  if (!fs.existsSync(p)) return { ...DEFAULT_CONFIG };
  try {
    return { ...DEFAULT_CONFIG, ...JSON.parse(fs.readFileSync(p, 'utf-8')) };
  } catch {
    return { ...DEFAULT_CONFIG };
  }
}

/** Write config to .tycono/config.json. Creates dir if needed. */
export function writeConfig(companyRoot: string, config: CompanyConfig): void {
  const dir = path.join(companyRoot, CONFIG_DIR);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(configPath(companyRoot), JSON.stringify(config, null, 2) + '\n');
}

/**
 * Load config and apply to process.env.
 * Called once at server startup.
 */
export function applyConfig(companyRoot: string): CompanyConfig {
  const config = readConfig(companyRoot);

  if (config.apiKey && !process.env.ANTHROPIC_API_KEY) {
    process.env.ANTHROPIC_API_KEY = config.apiKey;
  }
  if (!process.env.EXECUTION_ENGINE) {
    process.env.EXECUTION_ENGINE = config.engine;
  }

  return config;
}
