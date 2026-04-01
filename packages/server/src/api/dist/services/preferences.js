/**
 * preferences.ts — .tycono/preferences.json 관리
 *
 * 캐릭터 외모, 오피스 테마 등 사용자 설정을 서버 파일로 영속화한다.
 * company-config.ts의 readConfig/writeConfig 패턴을 따른다.
 */
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
const CONFIG_DIR = '.tycono';
const PREFS_FILE = 'preferences.json';
const DEFAULT = { appearances: {}, theme: 'default' };
function prefsPath(companyRoot) {
    return path.join(companyRoot, CONFIG_DIR, PREFS_FILE);
}
/** Read preferences from .tycono/preferences.json. Returns defaults if missing.
 *  Auto-generates instanceId on first access and persists it. */
export function readPreferences(companyRoot) {
    const p = prefsPath(companyRoot);
    let data = {};
    if (fs.existsSync(p)) {
        try {
            data = JSON.parse(fs.readFileSync(p, 'utf-8'));
        }
        catch { /* use defaults */ }
    }
    const prefs = {
        instanceId: data.instanceId ?? undefined,
        appearances: data.appearances ?? {},
        theme: data.theme ?? 'default',
        speech: data.speech ?? undefined,
        language: data.language ?? undefined,
        furnitureOverrides: data.furnitureOverrides ?? undefined,
        deskOverrides: data.deskOverrides ?? undefined,
        removedFurniture: data.removedFurniture ?? undefined,
        addedFurniture: data.addedFurniture ?? undefined,
        officeExpansion: data.officeExpansion ?? undefined,
    };
    // Auto-generate instanceId on first access
    if (!prefs.instanceId) {
        prefs.instanceId = crypto.randomUUID();
        writePreferences(companyRoot, prefs);
    }
    return prefs;
}
/** Write preferences to .tycono/preferences.json. Creates dir if needed. */
export function writePreferences(companyRoot, prefs) {
    const dir = path.join(companyRoot, CONFIG_DIR);
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(prefsPath(companyRoot), JSON.stringify(prefs, null, 2) + '\n');
}
/** Merge partial preferences into existing. instanceId is never overwritten by client. */
export function mergePreferences(companyRoot, partial) {
    const current = readPreferences(companyRoot);
    const merged = {
        instanceId: current.instanceId, // preserve — never overwrite from client
        appearances: partial.appearances !== undefined
            ? { ...current.appearances, ...partial.appearances }
            : current.appearances,
        theme: partial.theme ?? current.theme,
        speech: partial.speech !== undefined
            ? { ...current.speech, ...partial.speech }
            : current.speech,
        language: partial.language !== undefined ? partial.language : current.language,
        furnitureOverrides: partial.furnitureOverrides !== undefined
            ? { ...current.furnitureOverrides, ...partial.furnitureOverrides }
            : current.furnitureOverrides,
        deskOverrides: partial.deskOverrides !== undefined
            ? { ...current.deskOverrides, ...partial.deskOverrides }
            : current.deskOverrides,
        removedFurniture: partial.removedFurniture !== undefined
            ? partial.removedFurniture
            : current.removedFurniture,
        addedFurniture: partial.addedFurniture !== undefined
            ? partial.addedFurniture
            : current.addedFurniture,
        officeExpansion: partial.officeExpansion !== undefined
            ? partial.officeExpansion
            : current.officeExpansion,
    };
    writePreferences(companyRoot, merged);
    return merged;
}
