import { useState, useEffect, useCallback, useRef } from 'react';
import type { CharacterAppearance, OfficeTheme } from '../types/appearance';
import { getDefaultAppearance, OFFICE_THEMES } from '../types/appearance';
import { api } from '../api/client';

const STORAGE_KEY_APPEARANCES = 'the-company-appearances';
const STORAGE_KEY_THEME = 'the-company-theme';

function loadAppearances(): Record<string, CharacterAppearance> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY_APPEARANCES);
    return raw ? JSON.parse(raw) : {};
  } catch { return {}; }
}

function saveAppearancesLocal(data: Record<string, CharacterAppearance>): void {
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
  const seeded = useRef(false);

  // On mount: fetch from server, seed if server has no data
  useEffect(() => {
    if (seeded.current) return;
    seeded.current = true;
    api.getPreferences().then((prefs) => {
      const serverHasData = Object.keys(prefs.appearances ?? {}).length > 0 || prefs.theme !== 'default';
      if (serverHasData) {
        // Server is source of truth
        const ap = prefs.appearances as Record<string, CharacterAppearance>;
        setAppearances(ap);
        saveAppearancesLocal(ap);
        if (prefs.theme && prefs.theme in OFFICE_THEMES) {
          setThemeState(prefs.theme as OfficeTheme);
          localStorage.setItem(STORAGE_KEY_THEME, prefs.theme);
        }
      } else {
        // First load: seed server from localStorage (1-time migration)
        const localAp = loadAppearances();
        const localTheme = loadTheme();
        if (Object.keys(localAp).length > 0 || localTheme !== 'default') {
          api.updatePreferences({ appearances: localAp, theme: localTheme }).catch(() => {});
        }
      }
    }).catch(() => {
      // Server unavailable — keep using localStorage
    });
  }, []);

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
      saveAppearancesLocal(next);
      api.updatePreferences({ appearances: next }).catch(() => {});
      return next;
    });
  }, []);

  const resetAppearance = useCallback((roleId: string) => {
    setAppearances(prev => {
      const next = { ...prev };
      delete next[roleId];
      saveAppearancesLocal(next);
      api.updatePreferences({ appearances: next }).catch(() => {});
      return next;
    });
  }, []);

  const setTheme = useCallback((t: OfficeTheme) => {
    setThemeState(t);
    localStorage.setItem(STORAGE_KEY_THEME, t);
    api.updatePreferences({ theme: t }).catch(() => {});
  }, []);

  return { appearances, getAppearance, setAppearance, resetAppearance, theme, setTheme };
}
