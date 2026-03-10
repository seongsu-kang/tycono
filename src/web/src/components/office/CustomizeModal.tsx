import { useState, useCallback } from 'react';
import type { CharacterAppearance, OfficeTheme } from '../../types/appearance';
import { getDefaultAppearance, OFFICE_THEMES } from '../../types/appearance';
import type { Role } from '../../types';
import type { SpeechSettings } from '../../types/speech';
import CharacterEditor, { randomAppearance } from './CharacterEditor';

/* ─── Main Modal ──────────────────────────── */

interface CustomizeModalProps {
  role: Role;
  appearance: CharacterAppearance;
  onSave: (ap: CharacterAppearance) => void;
  onReset: () => void;
  onClose: () => void;
  theme: OfficeTheme;
  onThemeChange: (t: OfficeTheme) => void;
  onUpdateName?: (roleId: string, name: string) => Promise<void>;
  initialTab?: 'character' | 'office' | 'settings';
  characterOnly?: boolean;
  speechSettings?: SpeechSettings;
  onSpeechSettingsChange?: (s: Partial<SpeechSettings>) => void;
  language?: string;
  onLanguageChange?: (lang: string) => void;
  roleLevel?: number;
  coinBalance?: number;
  purchased?: Set<string>;
  onPurchase?: (itemId: string, cost: number) => void;
}

export default function CustomizeModal({
  role, appearance, onSave, onReset, onClose,
  theme, onThemeChange, onUpdateName, initialTab,
  characterOnly,
  speechSettings, onSpeechSettingsChange,
  language, onLanguageChange, roleLevel,
  coinBalance, purchased, onPurchase,
}: CustomizeModalProps) {
  const [tab, setTab] = useState<'character' | 'office' | 'settings'>(initialTab ?? 'character');
  const [draft, setDraft] = useState<CharacterAppearance>({ ...appearance });
  const [nameValue, setNameValue] = useState(role.name);
  const [nameSaving, setNameSaving] = useState(false);

  const handleRandomize = useCallback(() => setDraft(randomAppearance(roleLevel)), [roleLevel]);

  const handleReset = useCallback(() => {
    const def = getDefaultAppearance(role.id);
    setDraft({ ...def });
    onReset();
  }, [role.id, onReset]);

  const handleSave = useCallback(async () => {
    onSave(draft);
    const trimmed = nameValue.trim();
    if (onUpdateName && trimmed && trimmed !== role.name) {
      setNameSaving(true);
      try { await onUpdateName(role.id, trimmed); } catch { /* handled by parent */ }
      setNameSaving(false);
    }
    onClose();
  }, [draft, onSave, onClose, nameValue, role.name, role.id, onUpdateName]);

  const nameLabel = (
    <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
      <span>{role.id.toUpperCase()} –</span>
      {onUpdateName ? (
        <input
          value={nameValue}
          onChange={(e) => setNameValue(e.target.value)}
          disabled={nameSaving}
          className="customize-name-input"
          style={{
            background: 'rgba(255,255,255,0.08)',
            border: '1px solid rgba(255,255,255,0.15)',
            borderRadius: 4,
            color: 'inherit',
            font: 'inherit',
            padding: '2px 6px',
            flex: 1,
            minWidth: 0,
          }}
        />
      ) : (
        <span>{role.name}</span>
      )}
    </span>
  );

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
            {!characterOnly && (
              <>
                <button
                  className={`customize-tab ${tab === 'office' ? 'active' : ''}`}
                  onClick={() => setTab('office')}
                >
                  OFFICE THEME
                </button>
                <button
                  className={`customize-tab ${tab === 'settings' ? 'active' : ''}`}
                  onClick={() => setTab('settings')}
                >
                  SETTINGS
                </button>
              </>
            )}
          </div>
          <button className="customize-close" onClick={onClose}>X</button>
        </div>

        {tab === 'character' ? (
          <div className="customize-body">
            <CharacterEditor
              roleId={role.id}
              appearance={draft}
              onChange={setDraft}
              onRandomize={handleRandomize}
              onReset={handleReset}
              label={nameLabel}
              roleLevel={roleLevel}
              coinBalance={coinBalance}
              purchased={purchased}
              onPurchase={onPurchase}
            />
          </div>
        ) : tab === 'office' ? (
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
        ) : (
          <div className="customize-body">
            <div style={{ display: 'flex', flexDirection: 'column', gap: 20, padding: '8px 0' }}>
              {/* Speech Mode */}
              <div>
                <div style={{ fontSize: 11, fontWeight: 600, marginBottom: 8, color: 'var(--terminal-text)' }}>
                  AMBIENT SPEECH MODE
                </div>
                <div style={{ display: 'flex', gap: 6 }}>
                  {(['template', 'llm', 'auto'] as const).map(m => (
                    <button
                      key={m}
                      onClick={() => onSpeechSettingsChange?.({ mode: m })}
                      style={{
                        flex: 1,
                        padding: '8px 12px',
                        fontSize: 11,
                        border: `2px solid ${speechSettings?.mode === m ? 'var(--accent)' : 'rgba(255,255,255,0.1)'}`,
                        background: speechSettings?.mode === m ? 'rgba(255,255,255,0.08)' : 'transparent',
                        color: speechSettings?.mode === m ? 'var(--terminal-text)' : 'var(--terminal-text-muted)',
                        borderRadius: 6,
                        cursor: 'pointer',
                        textAlign: 'center',
                      }}
                    >
                      <div style={{ fontWeight: 600, marginBottom: 2 }}>
                        {m === 'template' ? 'TEMPLATE' : m === 'llm' ? 'AI' : 'AUTO'}
                      </div>
                      <div style={{ fontSize: 9, opacity: 0.7 }}>
                        {m === 'template' ? 'Static pool ($0)' : m === 'llm' ? 'LLM generated' : 'Detect engine'}
                      </div>
                    </button>
                  ))}
                </div>
                <div style={{ fontSize: 9, color: 'var(--terminal-text-muted)', marginTop: 4 }}>
                  Auto: CLI Max = AI, BYOK = Template
                </div>
              </div>

              {/* Speech Interval */}
              <div>
                <div style={{ fontSize: 11, fontWeight: 600, marginBottom: 8, color: 'var(--terminal-text)' }}>
                  SPEECH INTERVAL: {speechSettings?.intervalSec ?? 18}s
                </div>
                <input
                  type="range"
                  min={5}
                  max={120}
                  step={5}
                  value={speechSettings?.intervalSec ?? 18}
                  onChange={e => onSpeechSettingsChange?.({ intervalSec: Number(e.target.value) })}
                  style={{ width: '100%', accentColor: 'var(--accent)' }}
                />
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 9, color: 'var(--terminal-text-muted)' }}>
                  <span>5s (frequent)</span>
                  <span>120s (rare)</span>
                </div>
              </div>

              {/* Daily Budget */}
              {speechSettings?.mode !== 'template' && (
                <div>
                  <div style={{ fontSize: 11, fontWeight: 600, marginBottom: 8, color: 'var(--terminal-text)' }}>
                    DAILY LLM BUDGET: ${speechSettings?.dailyBudgetUsd?.toFixed(2) ?? '1.00'}
                  </div>
                  <input
                    type="range"
                    min={0}
                    max={5}
                    step={0.25}
                    value={speechSettings?.dailyBudgetUsd ?? 1.0}
                    onChange={e => onSpeechSettingsChange?.({ dailyBudgetUsd: Number(e.target.value) })}
                    style={{ width: '100%', accentColor: 'var(--accent)' }}
                  />
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 9, color: 'var(--terminal-text-muted)' }}>
                    <span>$0 (unlimited)</span>
                    <span>$5.00/day</span>
                  </div>
                </div>
              )}

              {/* Language */}
              <div>
                <div style={{ fontSize: 11, fontWeight: 600, marginBottom: 8, color: 'var(--terminal-text)' }}>
                  LANGUAGE
                </div>
                <div style={{ display: 'flex', gap: 6 }}>
                  {([
                    { key: 'auto', label: 'Auto' },
                    { key: 'en', label: 'English' },
                    { key: 'ko', label: '한국어' },
                    { key: 'ja', label: '日本語' },
                  ] as const).map(({ key, label }) => (
                    <button
                      key={key}
                      onClick={() => onLanguageChange?.(key)}
                      style={{
                        flex: 1,
                        padding: '8px 12px',
                        fontSize: 11,
                        border: `2px solid ${(language ?? 'auto') === key ? 'var(--accent)' : 'rgba(255,255,255,0.1)'}`,
                        background: (language ?? 'auto') === key ? 'rgba(255,255,255,0.08)' : 'transparent',
                        color: (language ?? 'auto') === key ? 'var(--terminal-text)' : 'var(--terminal-text-muted)',
                        borderRadius: 6,
                        cursor: 'pointer',
                        textAlign: 'center',
                        fontWeight: 600,
                      }}
                    >
                      {label}
                    </button>
                  ))}
                </div>
                <div style={{ fontSize: 9, color: 'var(--terminal-text-muted)', marginTop: 4 }}>
                  Sets language for AI responses and speech bubbles
                </div>
              </div>
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
