/**
 * preset-loader.ts — Company Preset 로더
 *
 * preset.yaml 파일을 파싱하고 PresetSpec 타입으로 검증한다.
 * Wave-scoped Preset (company-preset-marketplace.md §10) 인프라.
 */
import fs from 'node:fs';
import path from 'node:path';
import { parse as parseYaml } from 'yaml';
import type { PresetSpec } from '../../../shared/types.js';
import { COMPANY_ROOT } from './file-reader.js';

/**
 * preset.yaml 파일을 읽어서 PresetSpec으로 파싱
 * @param presetPath - preset.yaml 파일의 절대 경로
 * @throws Error - 파일이 없거나 스키마가 맞지 않으면
 */
export function loadPresetSpec(presetPath: string): PresetSpec {
  if (!fs.existsSync(presetPath)) {
    throw new Error(`Preset file not found: ${presetPath}`);
  }

  const content = fs.readFileSync(presetPath, 'utf-8');
  const data = parseYaml(content);

  // 필수 필드 검증
  if (!data || typeof data !== 'object') {
    throw new Error('Invalid preset.yaml: must be an object');
  }

  if (data.spec !== 'preset/v1') {
    throw new Error(`Invalid spec version: ${data.spec} (expected: preset/v1)`);
  }

  if (!data.id || typeof data.id !== 'string') {
    throw new Error('Invalid preset.yaml: missing or invalid "id"');
  }

  if (!data.name || typeof data.name !== 'string') {
    throw new Error('Invalid preset.yaml: missing or invalid "name"');
  }

  if (!data.version || typeof data.version !== 'string') {
    throw new Error('Invalid preset.yaml: missing or invalid "version"');
  }

  if (!Array.isArray(data.roles) || data.roles.length === 0) {
    throw new Error('Invalid preset.yaml: "roles" must be a non-empty array');
  }

  // 타입 캐스팅 (런타임 검증 완료)
  return data as PresetSpec;
}

/**
 * 프리셋 ID로 preset.yaml 검색
 * @param presetId - 프리셋 ID (예: saas-plg-growth)
 * @param searchDirs - 검색 디렉토리 목록 (기본: company/presets/)
 * @returns PresetSpec 또는 null (못 찾으면)
 */
export function findPreset(presetId: string, searchDirs: string[]): PresetSpec | null {
  for (const dir of searchDirs) {
    if (!fs.existsSync(dir)) continue;

    try {
      const entries = fs.readdirSync(dir, { withFileTypes: true });
      for (const entry of entries) {
        if (!entry.isDirectory()) continue;

        const presetYamlPath = path.join(dir, entry.name, 'preset.yaml');
        if (!fs.existsSync(presetYamlPath)) continue;

        try {
          const spec = loadPresetSpec(presetYamlPath);
          if (spec.id === presetId) {
            return spec;
          }
        } catch {
          // 파싱 실패 시 스킵
          continue;
        }
      }
    } catch {
      // 디렉토리 읽기 실패 시 스킵
      continue;
    }
  }

  return null;
}

/**
 * 모든 프리셋 목록 조회 (마켓플레이스 UI용)
 * @param searchDirs - 검색 디렉토리 목록
 * @returns PresetSpec 배열
 */
export function listPresets(searchDirs: string[]): PresetSpec[] {
  const presets: PresetSpec[] = [];

  for (const dir of searchDirs) {
    if (!fs.existsSync(dir)) continue;

    try {
      const entries = fs.readdirSync(dir, { withFileTypes: true });
      for (const entry of entries) {
        if (!entry.isDirectory()) continue;

        const presetYamlPath = path.join(dir, entry.name, 'preset.yaml');
        if (!fs.existsSync(presetYamlPath)) continue;

        try {
          const spec = loadPresetSpec(presetYamlPath);
          presets.push(spec);
        } catch {
          // 파싱 실패 시 스킵
          continue;
        }
      }
    } catch {
      // 디렉토리 읽기 실패 시 스킵
      continue;
    }
  }

  return presets;
}

/**
 * 프리셋 ID로 preset.yaml 검색 (COMPANY_ROOT 기준)
 * execute.ts에서 사용 — COMPANY_ROOT 기반 검색 디렉토리
 * @param presetId - 프리셋 ID
 * @returns PresetSpec 또는 null
 */
export function loadPreset(presetId: string): PresetSpec | null {
  const searchDirs = [
    path.resolve(COMPANY_ROOT, 'company', 'presets'),
    path.resolve(COMPANY_ROOT, '.tycono', 'presets'),
  ];
  return findPreset(presetId, searchDirs);
}

/**
 * 프리셋의 knowledge 문서 경로 목록 반환
 * @param presetId - 프리셋 ID
 * @returns knowledge 문서 경로 배열 (절대 경로)
 */
export function getPresetKnowledge(presetId: string): string[] {
  const searchDirs = [
    path.resolve(COMPANY_ROOT, 'company', 'presets'),
    path.resolve(COMPANY_ROOT, '.tycono', 'presets'),
  ];

  // 프리셋 디렉토리 찾기
  for (const dir of searchDirs) {
    if (!fs.existsSync(dir)) continue;

    try {
      const entries = fs.readdirSync(dir, { withFileTypes: true });
      for (const entry of entries) {
        if (!entry.isDirectory()) continue;

        const presetYamlPath = path.join(dir, entry.name, 'preset.yaml');
        if (!fs.existsSync(presetYamlPath)) continue;

        try {
          const spec = loadPresetSpec(presetYamlPath);
          if (spec.id === presetId) {
            // knowledge 디렉토리 스캔
            const knowledgeDir = path.join(dir, entry.name, 'knowledge');
            if (!fs.existsSync(knowledgeDir)) return [];

            const mdFiles: string[] = [];
            const scanRecursive = (dirPath: string) => {
              const items = fs.readdirSync(dirPath, { withFileTypes: true });
              for (const item of items) {
                const fullPath = path.join(dirPath, item.name);
                if (item.isDirectory()) {
                  scanRecursive(fullPath);
                } else if (item.name.endsWith('.md')) {
                  mdFiles.push(fullPath);
                }
              }
            };

            scanRecursive(knowledgeDir);
            return mdFiles;
          }
        } catch {
          continue;
        }
      }
    } catch {
      continue;
    }
  }

  return [];
}
