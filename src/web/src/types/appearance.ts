/* ─── Character Appearance ─────────────────────── */

export interface CharacterAppearance {
  skinColor: string;
  hairColor: string;
  shirtColor: string;
  pantsColor: string;
  shoeColor: string;
}

export const DEFAULT_APPEARANCES: Record<string, CharacterAppearance> = {
  cto:      { skinColor: '#F5CBA7', hairColor: '#2C1810', shirtColor: '#1565C0', pantsColor: '#37474F', shoeColor: '#212121' },
  cbo:      { skinColor: '#FDEBD0', hairColor: '#1A0A00', shirtColor: '#E65100', pantsColor: '#37474F', shoeColor: '#1A1A1A' },
  pm:       { skinColor: '#FDEBD0', hairColor: '#6D4C41', shirtColor: '#2E7D32', pantsColor: '#37474F', shoeColor: '#212121' },
  engineer: { skinColor: '#F5CBA7', hairColor: '#1A1A1A', shirtColor: '#4A148C', pantsColor: '#37474F', shoeColor: '#7B1FA2' },
  designer: { skinColor: '#FDEBD0', hairColor: '#AD1457', shirtColor: '#AD1457', pantsColor: '#37474F', shoeColor: '#212121' },
  qa:       { skinColor: '#F5CBA7', hairColor: '#4E342E', shirtColor: '#00695C', pantsColor: '#37474F', shoeColor: '#212121' },
};

export function getDefaultAppearance(roleId: string): CharacterAppearance {
  return DEFAULT_APPEARANCES[roleId] ?? {
    skinColor: '#B0BEC5', hairColor: '#78909C', shirtColor: '#607D8B',
    pantsColor: '#455A64', shoeColor: '#37474F',
  };
}

/* ─── Color Presets ────────────────────────────── */

export const SKIN_PRESETS = [
  '#FDEBD0', '#F5CBA7', '#D4A07A', '#C68642', '#8D5524',
  '#5C3A1E', '#F3D1C7', '#E8BEAC', '#B07D62', '#704214',
];

export const HAIR_PRESETS = [
  '#1A0A00', '#2C1810', '#4E342E', '#6D4C41', '#8D6E63',
  '#D4A574', '#F5E6CA', '#FFD700', '#B71C1C', '#AD1457',
  '#4A148C', '#1A237E', '#004D40', '#1A1A1A', '#78909C',
  '#E0E0E0',
];

export const SHIRT_PRESETS = [
  '#1565C0', '#E65100', '#2E7D32', '#4A148C', '#AD1457',
  '#00695C', '#D32F2F', '#F57F17', '#1B5E20', '#283593',
  '#4E342E', '#37474F', '#880E4F', '#00838F', '#6A1B9A',
  '#FF6F00',
];

export const PANTS_PRESETS = [
  '#37474F', '#1A237E', '#3E2723', '#263238', '#1B5E20',
  '#455A64', '#212121', '#4E342E', '#0D47A1', '#311B92',
];

export const SHOE_PRESETS = [
  '#212121', '#1A1A1A', '#37474F', '#4E342E', '#7B1FA2',
  '#D32F2F', '#1565C0', '#F57F17', '#2E7D32', '#FFFFFF',
];

/* ─── Office Themes ────────────────────────────── */

export type OfficeTheme = 'default' | 'light' | 'retro' | 'cyberpunk' | 'forest' | 'ocean';

export interface ThemeColors {
  name: string;
  icon: string;
  vars: Record<string, string>;
}

export const OFFICE_THEMES: Record<OfficeTheme, ThemeColors> = {
  default: {
    name: 'MIDNIGHT',
    icon: '\u{1F303}',
    vars: {
      '--floor-light': '#0d1117',
      '--floor-dark': '#0a0e14',
      '--hud-bg': '#0d1117',
      '--hud-bg-alt': '#161b22',
      '--pixel-border': '#30363d',
      '--terminal-bg': '#0d1117',
      '--terminal-border': '#21262d',
      '--terminal-border-hover': '#388bfd',
      '--terminal-text': '#e6edf3',
      '--terminal-text-secondary': '#8b949e',
      '--terminal-text-muted': '#484f58',
      '--accent': '#388bfd',
      '--active-green': '#3fb950',
      '--idle-amber': '#d29922',
    },
  },
  light: {
    name: 'DAYLIGHT',
    icon: '\u2600\uFE0F',
    vars: {
      '--floor-light': '#f6f8fa',
      '--floor-dark': '#eaeef2',
      '--hud-bg': '#24292f',
      '--hud-bg-alt': '#32383f',
      '--pixel-border': '#d0d7de',
      '--terminal-bg': '#ffffff',
      '--terminal-border': '#d0d7de',
      '--terminal-border-hover': '#0969da',
      '--terminal-text': '#1f2328',
      '--terminal-text-secondary': '#656d76',
      '--terminal-text-muted': '#8c959f',
      '--accent': '#0969da',
      '--active-green': '#1a7f37',
      '--idle-amber': '#9a6700',
    },
  },
  retro: {
    name: 'RETRO',
    icon: '\u{1F3AE}',
    vars: {
      '--floor-light': '#1a1410',
      '--floor-dark': '#140f0a',
      '--hud-bg': '#1a1410',
      '--hud-bg-alt': '#2a2018',
      '--pixel-border': '#5c4a32',
      '--terminal-bg': '#1a1410',
      '--terminal-border': '#3a2e20',
      '--terminal-border-hover': '#d4a44e',
      '--terminal-text': '#e8d5b0',
      '--terminal-text-secondary': '#a08860',
      '--terminal-text-muted': '#6b5840',
      '--accent': '#d4a44e',
      '--active-green': '#8bba4a',
      '--idle-amber': '#e8a030',
    },
  },
  cyberpunk: {
    name: 'NEON',
    icon: '\u{1F30C}',
    vars: {
      '--floor-light': '#0a0014',
      '--floor-dark': '#06000e',
      '--hud-bg': '#0a0014',
      '--hud-bg-alt': '#14002a',
      '--pixel-border': '#4a1a80',
      '--terminal-bg': '#0a0014',
      '--terminal-border': '#2a0a50',
      '--terminal-border-hover': '#e040fb',
      '--terminal-text': '#e0d0ff',
      '--terminal-text-secondary': '#9070c0',
      '--terminal-text-muted': '#5a3a80',
      '--accent': '#e040fb',
      '--active-green': '#00ff88',
      '--idle-amber': '#ffab00',
    },
  },
  forest: {
    name: 'FOREST',
    icon: '\u{1F332}',
    vars: {
      '--floor-light': '#0a1410',
      '--floor-dark': '#060e0a',
      '--hud-bg': '#0a1410',
      '--hud-bg-alt': '#142a1e',
      '--pixel-border': '#2a5a3a',
      '--terminal-bg': '#0a1410',
      '--terminal-border': '#1a3a26',
      '--terminal-border-hover': '#4ade80',
      '--terminal-text': '#d0f0d8',
      '--terminal-text-secondary': '#70a880',
      '--terminal-text-muted': '#3a6848',
      '--accent': '#4ade80',
      '--active-green': '#86efac',
      '--idle-amber': '#fcd34d',
    },
  },
  ocean: {
    name: 'OCEAN',
    icon: '\u{1F30A}',
    vars: {
      '--floor-light': '#0a1420',
      '--floor-dark': '#060e18',
      '--hud-bg': '#0a1420',
      '--hud-bg-alt': '#142a40',
      '--pixel-border': '#1e4a6a',
      '--terminal-bg': '#0a1420',
      '--terminal-border': '#163050',
      '--terminal-border-hover': '#38bdf8',
      '--terminal-text': '#d0e8f8',
      '--terminal-text-secondary': '#6090b0',
      '--terminal-text-muted': '#305070',
      '--accent': '#38bdf8',
      '--active-green': '#34d399',
      '--idle-amber': '#fbbf24',
    },
  },
};
