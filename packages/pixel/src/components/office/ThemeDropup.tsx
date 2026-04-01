import { useEffect, useRef } from 'react';
import type { OfficeTheme } from '../../types/appearance';
import { OFFICE_THEMES } from '../../types/appearance';

interface Props {
  theme: OfficeTheme;
  onThemeChange: (t: OfficeTheme) => void;
  onClose: () => void;
}

export default function ThemeDropup({ theme, onThemeChange, onClose }: Props) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [onClose]);

  return (
    <div ref={ref} className="theme-dropup">
      {(Object.entries(OFFICE_THEMES) as [OfficeTheme, typeof OFFICE_THEMES[OfficeTheme]][]).map(([key, t]) => (
        <button
          key={key}
          className={`theme-dropup__item${theme === key ? ' theme-dropup__item--active' : ''}`}
          onClick={() => { onThemeChange(key); onClose(); }}
          title={t.name}
        >
          <span className="theme-dropup__swatch" style={{
            background: t.vars['--hud-bg'],
            borderColor: t.vars['--pixel-border'],
          }}>
            <span style={{ background: t.vars['--accent'], width: 5, height: 5, borderRadius: 1 }} />
            <span style={{ background: t.vars['--active-green'], width: 5, height: 5, borderRadius: 1 }} />
            <span style={{ background: t.vars['--idle-amber'], width: 5, height: 5, borderRadius: 1 }} />
          </span>
          <span className="theme-dropup__name">{t.icon}</span>
        </button>
      ))}
    </div>
  );
}
