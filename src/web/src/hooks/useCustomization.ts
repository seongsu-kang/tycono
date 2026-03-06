import { useState, useEffect, useCallback } from 'react';
import type { CharacterAppearance, OfficeTheme } from '../types/appearance';
import { getDefaultAppearance, OFFICE_THEMES } from '../types/appearance';

const STORAGE_KEY_APPEARANCES = 'the-company-appearances';
const STORAGE_KEY_THEME = 'the-company-theme';

function loadAppearances(): Record<string, CharacterAppearance> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY_APPEARANCES);
    return raw ? JSON.parse(raw) : {};
  } catch { return {}; }
}

function saveAppearances(data: Record<string, CharacterAppearance>): void {
  localStorage.setItem(STORAGE_KEY_APPEARANCES, JSON.stringify(data));
}

function loadTheme(): OfficeTheme {
  try {
    const raw = localStorage.getItem(STORAGE_KEY_THEME);
    if (raw && raw in OFFICE_THEMES) return raw as OfficeTheme;
  } catch {}
  return 'default';
}

function applyThemeVars(theme: OfficeTheme): void {
  const vars = OFFICE_THEMES[theme]?.vars;
  if (!vars) return;
  const root = document.documentElement;
  for (const [key, value] of Object.entries(vars)) {
    root.style.setProperty(key, value);
  }
}

export function useCustomization() {
  const [appearances, setAppearances] = useState<Record<string, CharacterAppearance>>(loadAppearances);
  const [theme, setThemeState] = useState<OfficeTheme>(loadTheme);

  // Apply theme on mount and change
  useEffect(() => {
    applyThemeVars(theme);
  }, [theme]);

  const getAppearance = useCallback((roleId: string): CharacterAppearance => {
    return appearances[roleId] ?? getDefaultAppearance(roleId);
  }, [appearances]);

  const setAppearance = useCallback((roleId: string, ap: CharacterAppearance) => {
    setAppearances(prev => {
      const next = { ...prev, [roleId]: ap };
      saveAppearances(next);
      return next;
    });
  }, []);

  const resetAppearance = useCallback((roleId: string) => {
    setAppearances(prev => {
      const next = { ...prev };
      delete next[roleId];
      saveAppearances(next);
      return next;
    });
  }, []);

  const setTheme = useCallback((t: OfficeTheme) => {
    setThemeState(t);
    localStorage.setItem(STORAGE_KEY_THEME, t);
  }, []);

  return { appearances, getAppearance, setAppearance, resetAppearance, theme, setTheme };
}
