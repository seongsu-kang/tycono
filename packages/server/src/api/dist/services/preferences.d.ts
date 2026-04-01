export interface CharacterAppearance {
    skinColor: string;
    hairColor: string;
    shirtColor: string;
    pantsColor: string;
    shoeColor: string;
}
export interface SpeechSettings {
    /** 'template' = static pool only, 'llm' = AI generation, 'auto' = detect engine */
    mode: 'template' | 'llm' | 'auto';
    /** Interval between ambient speech in seconds */
    intervalSec: number;
    /** Daily budget for LLM speech in USD (0 = unlimited) */
    dailyBudgetUsd: number;
}
export interface FurnitureOverride {
    offsetX: number;
    offsetY: number;
}
export interface DeskOverride {
    dx: number;
    dy: number;
}
export interface AddedFurniture {
    id: string;
    type: string;
    room: string;
    zone: 'wall' | 'floor';
    anchorX?: 'left' | 'right';
    offsetX: number;
    offsetY: number;
    accent?: string;
}
export interface OfficeExpansion {
    /** Each entry = one floor. floors[0] = 1F, floors[1] = 2F, etc. Max 3 floors. */
    floors: Array<{
        rooms: 4 | 6;
    }>;
    purchaseHistory: Array<{
        type: string;
        cost: number;
        ts: string;
    }>;
}
export interface Preferences {
    instanceId?: string;
    appearances: Record<string, CharacterAppearance>;
    theme: string;
    speech?: SpeechSettings;
    language?: string;
    furnitureOverrides?: Record<string, FurnitureOverride>;
    deskOverrides?: Record<string, DeskOverride>;
    removedFurniture?: string[];
    addedFurniture?: AddedFurniture[];
    officeExpansion?: OfficeExpansion;
}
/** Read preferences from .tycono/preferences.json. Returns defaults if missing.
 *  Auto-generates instanceId on first access and persists it. */
export declare function readPreferences(companyRoot: string): Preferences;
/** Write preferences to .tycono/preferences.json. Creates dir if needed. */
export declare function writePreferences(companyRoot: string, prefs: Preferences): void;
/** Merge partial preferences into existing. instanceId is never overwritten by client. */
export declare function mergePreferences(companyRoot: string, partial: Partial<Preferences>): Preferences;
