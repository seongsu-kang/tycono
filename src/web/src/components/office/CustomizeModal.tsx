import { useState, useCallback } from 'react';
import type { CharacterAppearance, OfficeTheme } from '../../types/appearance';
import {
  getDefaultAppearance,
  SKIN_PRESETS, HAIR_PRESETS, SHIRT_PRESETS, PANTS_PRESETS, SHOE_PRESETS,
  OFFICE_THEMES,
} from '../../types/appearance';
import type { Role } from '../../types';
import SpriteCanvas from './SpriteCanvas';

/* ─── Color Swatch ────────────────────────── */

function Swatch({ color, selected, onClick }: { color: string; selected: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="customize-swatch"
      style={{
        background: color,
        outline: selected ? '2px solid #fff' : '2px solid transparent',
        boxShadow: selected ? `0 0 0 1px ${color}, 0 0 6px ${color}88` : 'none',
      }}
    />
  );
}

/* ─── Color Row ───────────────────────────── */

function ColorRow({ label, presets, value, onChange }: {
  label: string;
  presets: string[];
  value: string;
  onChange: (color: string) => void;
}) {
  return (
    <div className="customize-row">
      <div className="customize-row-header">
        <span className="customize-row-label">{label}</span>
        <div className="customize-row-current" style={{ background: value }} />
      </div>
      <div className="customize-swatches">
        {presets.map(c => (
          <Swatch key={c} color={c} selected={c === value} onClick={() => onChange(c)} />
        ))}
      </div>
    </div>
  );
}

/* ─── Main Modal ──────────────────────────── */

interface CustomizeModalProps {
  role: Role;
  appearance: CharacterAppearance;
  onSave: (ap: CharacterAppearance) => void;
  onReset: () => void;
  onClose: () => void;
  theme: OfficeTheme;
  onThemeChange: (t: OfficeTheme) => void;
  /** Which tab to show initially */
  initialTab?: 'character' | 'office';
}

export default function CustomizeModal({
  role, appearance, onSave, onReset, onClose,
  theme, onThemeChange, initialTab,
}: CustomizeModalProps) {
  const [tab, setTab] = useState<'character' | 'office'>(initialTab ?? 'character');
  const [draft, setDraft] = useState<CharacterAppearance>({ ...appearance });

  const update = useCallback((key: keyof CharacterAppearance, value: string) => {
    setDraft(prev => ({ ...prev, [key]: value }));
  }, []);

  const randomize = useCallback(() => {
    setDraft({
      skinColor: pick(SKIN_PRESETS),
      hairColor: pick(HAIR_PRESETS),
      shirtColor: pick(SHIRT_PRESETS),
      pantsColor: pick(PANTS_PRESETS),
      shoeColor: pick(SHOE_PRESETS),
    });
  }, []);

  const handleReset = useCallback(() => {
    const def = getDefaultAppearance(role.id);
    setDraft({ ...def });
    onReset();
  }, [role.id, onReset]);

  const handleSave = useCallback(() => {
    onSave(draft);
    onClose();
  }, [draft, onSave, onClose]);

  return (
    <div className="customize-overlay" onClick={onClose}>
      <div className="customize-modal" onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div className="customize-header">
          <div className="customize-tabs">
            <button
              className={`customize-tab ${tab === 'character' ? 'active' : ''}`}
              onClick={() => setTab('character')}
            >
              CHARACTER
            </button>
            <button
              className={`customize-tab ${tab === 'office' ? 'active' : ''}`}
              onClick={() => setTab('office')}
            >
              OFFICE THEME
            </button>
          </div>
          <button className="customize-close" onClick={onClose}>X</button>
        </div>

        {tab === 'character' ? (
          <div className="customize-body">
            {/* Preview */}
            <div className="customize-preview">
              <div className="customize-preview-bg">
                <SpriteCanvas roleId={role.id} appearance={draft} scale={3} />
              </div>
              <div className="customize-preview-name">
                {role.id.toUpperCase()} - {role.name}
              </div>
              <div className="customize-preview-actions">
                <button className="customize-btn customize-btn--random" onClick={randomize}>
                  RANDOM
                </button>
                <button className="customize-btn customize-btn--reset" onClick={handleReset}>
                  RESET
                </button>
              </div>
            </div>

            {/* Color Pickers */}
            <div className="customize-colors">
              <ColorRow label="SKIN" presets={SKIN_PRESETS} value={draft.skinColor} onChange={v => update('skinColor', v)} />
              <ColorRow label="HAIR" presets={HAIR_PRESETS} value={draft.hairColor} onChange={v => update('hairColor', v)} />
              <ColorRow label="OUTFIT" presets={SHIRT_PRESETS} value={draft.shirtColor} onChange={v => update('shirtColor', v)} />
              <ColorRow label="PANTS" presets={PANTS_PRESETS} value={draft.pantsColor} onChange={v => update('pantsColor', v)} />
              <ColorRow label="SHOES" presets={SHOE_PRESETS} value={draft.shoeColor} onChange={v => update('shoeColor', v)} />
            </div>
          </div>
        ) : (
          <div className="customize-body">
            <div className="customize-themes">
              {(Object.entries(OFFICE_THEMES) as [OfficeTheme, typeof OFFICE_THEMES[OfficeTheme]][]).map(([key, t]) => (
                <button
                  key={key}
                  className={`customize-theme-card ${theme === key ? 'active' : ''}`}
                  onClick={() => onThemeChange(key)}
                >
                  <div className="customize-theme-preview" style={{
                    background: t.vars['--floor-light'],
                    borderColor: t.vars['--pixel-border'],
                  }}>
                    <div style={{ background: t.vars['--hud-bg'], height: 8, borderBottom: `2px solid ${t.vars['--pixel-border']}` }} />
                    <div className="flex-1 flex items-center justify-center gap-1 p-1">
                      <div style={{ width: 10, height: 14, background: t.vars['--accent'], borderRadius: 1 }} />
                      <div style={{ width: 10, height: 14, background: t.vars['--active-green'], borderRadius: 1 }} />
                      <div style={{ width: 10, height: 14, background: t.vars['--idle-amber'], borderRadius: 1 }} />
                    </div>
                    <div style={{ background: t.vars['--hud-bg'], height: 6, borderTop: `2px solid ${t.vars['--pixel-border']}` }} />
                  </div>
                  <div className="customize-theme-name">
                    {t.icon} {t.name}
                  </div>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Footer */}
        {tab === 'character' && (
          <div className="customize-footer">
            <button className="customize-btn customize-btn--cancel" onClick={onClose}>CANCEL</button>
            <button className="customize-btn customize-btn--save" onClick={handleSave}>SAVE</button>
          </div>
        )}
      </div>
    </div>
  );
}

function pick<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}
