import { useCallback, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import type { CharacterAppearance } from '../../types/appearance';
import {
  SKIN_PRESETS, HAIR_PRESETS, SHIRT_PRESETS, PANTS_PRESETS, SHOE_PRESETS,
} from '../../types/appearance';
import { getAllHairStyles, getAllOutfitStyles, getAllAccessories, extractAppearance } from './sprites/engine';
import { getAccessoryRequiredLevel, isAccessoryUnlocked, getAccessoryCost } from './sprites/engine/accessories';
import { getHairRequiredLevel, isHairUnlocked, getHairCost } from './sprites/engine/hairstyles';
import { getOutfitRequiredLevel, isOutfitUnlocked, getOutfitCost } from './sprites/engine/outfits';
import './sprites/engine/hairstyles'; // ensure registration
import './sprites/engine/outfits';
import './sprites/engine/accessories';
import TopDownCharCanvas from './TopDownCharCanvas';

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

/* ─── Style Picker Row (text buttons, with optional lock support) ────── */

interface LockInfo {
  roleLevel: number;
  getLockLevel: (id: string) => number;
  getCost?: (id: string) => number;
  purchased?: Set<string>;
  onPurchase?: (id: string, cost: number) => void;
  coinBalance?: number;
}

function StyleRow({ label, items, value, onChange, lockInfo }: {
  label: string;
  items: { id: string; name: string }[];
  value?: string;
  onChange: (id: string | undefined) => void;
  lockInfo?: LockInfo;
}) {
  return (
    <div className="customize-row">
      <div className="customize-row-header">
        <span className="customize-row-label">{label}</span>
      </div>
      <div className="customize-swatches" style={{ gap: 4 }}>
        {items.map(s => {
          const reqLevel = lockInfo ? lockInfo.getLockLevel(s.id) : 1;
          const cost = lockInfo?.getCost ? lockInfo.getCost(s.id) : 0;
          const isCurrentlyEquipped = s.id === value;
          const levelLocked = lockInfo ? reqLevel > lockInfo.roleLevel && !isCurrentlyEquipped : false;
          const needsPurchase = cost > 0 && lockInfo?.purchased && !lockInfo.purchased.has(s.id) && !isCurrentlyEquipped;
          const canAfford = lockInfo?.coinBalance !== undefined ? lockInfo.coinBalance >= cost : true;
          const locked = levelLocked || false;
          const equippedButLocked = lockInfo ? isCurrentlyEquipped && reqLevel > lockInfo.roleLevel : false;

          return (
            <button
              key={s.id}
              onClick={() => {
                if (locked) return;
                if (needsPurchase && !levelLocked) {
                  if (canAfford && lockInfo?.onPurchase) {
                    lockInfo.onPurchase(s.id, cost);
                  }
                  return;
                }
                onChange(s.id === value ? undefined : s.id);
              }}
              className="customize-swatch"
              style={{
                width: 'auto',
                height: 'auto',
                padding: (locked || needsPurchase) ? '2px 6px 12px 6px' : '2px 6px',
                fontSize: 9,
                fontFamily: 'var(--font-pixel, monospace)',
                background: isCurrentlyEquipped
                  ? 'rgba(255,255,255,0.15)'
                  : locked
                    ? 'rgba(255,255,255,0.02)'
                    : needsPurchase
                      ? 'rgba(255,200,0,0.04)'
                      : 'rgba(255,255,255,0.04)',
                outline: isCurrentlyEquipped
                  ? equippedButLocked
                    ? '2px solid #F59E0B'
                    : '2px solid #fff'
                  : needsPurchase && !locked
                    ? '2px solid rgba(255,200,0,0.3)'
                    : '2px solid transparent',
                color: locked
                  ? 'rgba(255,255,255,0.25)'
                  : needsPurchase
                    ? 'rgba(255,255,255,0.45)'
                    : isCurrentlyEquipped ? '#fff' : 'rgba(255,255,255,0.5)',
                borderRadius: 4,
                cursor: locked ? 'not-allowed' : needsPurchase ? (canAfford ? 'pointer' : 'not-allowed') : 'pointer',
                opacity: locked ? 0.35 : 1,
                position: 'relative' as const,
              }}
            >
              {s.name}
              {locked && (
                <span style={{
                  position: 'absolute',
                  bottom: 1,
                  left: '50%',
                  transform: 'translateX(-50%)',
                  fontSize: 8,
                  color: 'rgba(255,255,255,0.5)',
                  whiteSpace: 'nowrap',
                }}>
                  {'\uD83D\uDD12'} Lv.{reqLevel}
                </span>
              )}
              {!locked && needsPurchase && (
                <span style={{
                  position: 'absolute',
                  bottom: 1,
                  left: '50%',
                  transform: 'translateX(-50%)',
                  fontSize: 8,
                  color: canAfford ? '#FFD700' : '#F87171',
                  whiteSpace: 'nowrap',
                }}>
                  {'\uD83E\uDE99'} {cost}
                </span>
              )}
              {equippedButLocked && (
                <span style={{
                  position: 'absolute',
                  bottom: -8,
                  left: '50%',
                  transform: 'translateX(-50%)',
                  fontSize: 7,
                  color: '#F59E0B',
                  whiteSpace: 'nowrap',
                }}>
                  {'\u26A0'} Lv.{reqLevel}
                </span>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}

/* ─── Sub-tab Button ─────────────────────── */

function SubTab({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      style={{
        flex: 1,
        padding: '6px 0',
        fontSize: 10,
        fontFamily: 'var(--font-pixel, monospace)',
        fontWeight: 'bold',
        letterSpacing: 1,
        background: active ? 'rgba(255,255,255,0.08)' : 'transparent',
        color: active ? '#fff' : 'rgba(255,255,255,0.35)',
        border: 'none',
        borderBottom: active ? '2px solid #3B82F6' : '2px solid transparent',
        cursor: 'pointer',
        transition: 'all 0.15s',
      }}
    >
      {label}
    </button>
  );
}

/* ─── Character Editor ────────────────────── */

export function pick<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

export function randomAppearance(level?: number): CharacterAppearance {
  const hairStyles = getAllHairStyles().filter(h =>
    !level || isHairUnlocked(h.id, level)
  );
  const outfitStyles = getAllOutfitStyles().filter(o =>
    !level || isOutfitUnlocked(o.id, level)
  );
  const accessories = getAllAccessories().filter(a =>
    !level || isAccessoryUnlocked(a.id, level)
  );
  return {
    skinColor: pick(SKIN_PRESETS),
    hairColor: pick(HAIR_PRESETS),
    shirtColor: pick(SHIRT_PRESETS),
    pantsColor: pick(PANTS_PRESETS),
    shoeColor: pick(SHOE_PRESETS),
    hairStyle: pick(hairStyles)?.id,
    outfitStyle: pick(outfitStyles)?.id,
    accessory: pick(accessories)?.id,
  };
}

interface CharacterEditorProps {
  roleId: string;
  appearance: CharacterAppearance;
  onChange: (ap: CharacterAppearance) => void;
  onRandomize: () => void;
  onReset: () => void;
  label?: ReactNode;
  roleLevel?: number;
  coinBalance?: number;
  purchased?: Set<string>;
  onPurchase?: (itemId: string, cost: number) => void;
}

type EditorTab = 'look' | 'outfit' | 'accessory';

export default function CharacterEditor({
  roleId, appearance, onChange, onRandomize, onReset, label, roleLevel,
  coinBalance, purchased, onPurchase,
}: CharacterEditorProps) {
  const [tab, setTab] = useState<EditorTab>('look');

  const update = useCallback((key: keyof CharacterAppearance, value: string | undefined) => {
    onChange({ ...appearance, [key]: value });
  }, [appearance, onChange]);

  const fileRef = useRef<HTMLInputElement>(null);

  const handlePhotoUpload = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const img = new Image();
    img.onload = () => {
      const extracted = extractAppearance(img);
      onChange({
        ...extracted,
        hairStyle: appearance.hairStyle,
        outfitStyle: appearance.outfitStyle,
        accessory: appearance.accessory,
      });
      URL.revokeObjectURL(img.src);
    };
    img.src = URL.createObjectURL(file);
    e.target.value = '';
  }, [appearance.hairStyle, appearance.outfitStyle, appearance.accessory, onChange]);

  const hairStyles = getAllHairStyles();
  const outfitStyles = getAllOutfitStyles();
  const accessories = getAllAccessories();

  const unlockedHairCount = roleLevel !== undefined
    ? hairStyles.filter(h => isHairUnlocked(h.id, roleLevel)).length
    : hairStyles.length;
  const unlockedOutfitCount = roleLevel !== undefined
    ? outfitStyles.filter(o => isOutfitUnlocked(o.id, roleLevel)).length
    : outfitStyles.length;
  const unlockedCount = roleLevel !== undefined
    ? accessories.filter(a => isAccessoryUnlocked(a.id, roleLevel)).length
    : accessories.length;

  const makeLockInfo = (getLockLevel: (id: string) => number, getCost: (id: string) => number): LockInfo | undefined =>
    roleLevel !== undefined ? { roleLevel, getLockLevel, getCost, purchased, onPurchase, coinBalance } : undefined;

  return (
    <>
      {/* Preview */}
      <div className="customize-preview">
        <div className="customize-preview-bg">
          <TopDownCharCanvas roleId={roleId} appearance={appearance} scale={12} />
        </div>
        {label && <div className="customize-preview-name">{label}</div>}
        <div className="customize-preview-actions">
          <button className="customize-btn customize-btn--random" onClick={onRandomize}>
            RANDOM
          </button>
          <button className="customize-btn customize-btn--reset" onClick={onReset}>
            RESET
          </button>
          <button
            className="customize-btn"
            onClick={() => fileRef.current?.click()}
            style={{ fontSize: 9, opacity: 0.7 }}
          >
            PHOTO
          </button>
          <input ref={fileRef} type="file" accept="image/*" onChange={handlePhotoUpload} style={{ display: 'none' }} />
        </div>
      </div>

      {/* Sub-tabs + content */}
      <div className="customize-colors">
        <div style={{ display: 'flex', borderBottom: '1px solid rgba(255,255,255,0.06)', marginBottom: 4 }}>
          <SubTab label="LOOK" active={tab === 'look'} onClick={() => setTab('look')} />
          <SubTab label="OUTFIT" active={tab === 'outfit'} onClick={() => setTab('outfit')} />
          <SubTab label="ACCESSORY" active={tab === 'accessory'} onClick={() => setTab('accessory')} />
        </div>

        {tab === 'look' && (
          <>
            <ColorRow label="SKIN" presets={SKIN_PRESETS} value={appearance.skinColor} onChange={v => update('skinColor', v)} />
            <ColorRow label="HAIR COLOR" presets={HAIR_PRESETS} value={appearance.hairColor} onChange={v => update('hairColor', v)} />
            {roleLevel !== undefined && (
              <div style={{
                padding: '4px 8px',
                marginBottom: 4,
                background: 'rgba(255,255,255,0.04)',
                borderRadius: 4,
                fontSize: 9,
                fontFamily: 'var(--font-pixel, monospace)',
                color: 'rgba(255,255,255,0.5)',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
              }}>
                <span>Lv.{roleLevel}</span>
                <span>{unlockedHairCount}/{hairStyles.length} unlocked</span>
              </div>
            )}
            <StyleRow label="HAIR STYLE" items={hairStyles} value={appearance.hairStyle} onChange={v => update('hairStyle', v)}
              lockInfo={makeLockInfo(getHairRequiredLevel, getHairCost)} />
          </>
        )}
        {tab === 'outfit' && (
          <>
            {roleLevel !== undefined && (
              <div style={{
                padding: '4px 8px',
                marginBottom: 4,
                background: 'rgba(255,255,255,0.04)',
                borderRadius: 4,
                fontSize: 9,
                fontFamily: 'var(--font-pixel, monospace)',
                color: 'rgba(255,255,255,0.5)',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
              }}>
                <span>Lv.{roleLevel}</span>
                <span>{unlockedOutfitCount}/{outfitStyles.length} unlocked</span>
              </div>
            )}
            <StyleRow label="STYLE" items={outfitStyles} value={appearance.outfitStyle} onChange={v => update('outfitStyle', v)}
              lockInfo={makeLockInfo(getOutfitRequiredLevel, getOutfitCost)} />
            <ColorRow label="TOP" presets={SHIRT_PRESETS} value={appearance.shirtColor} onChange={v => update('shirtColor', v)} />
            <ColorRow label="PANTS" presets={PANTS_PRESETS} value={appearance.pantsColor} onChange={v => update('pantsColor', v)} />
            <ColorRow label="SHOES" presets={SHOE_PRESETS} value={appearance.shoeColor} onChange={v => update('shoeColor', v)} />
          </>
        )}
        {tab === 'accessory' && (
          <>
            {roleLevel !== undefined && (
              <div style={{
                padding: '4px 8px',
                marginBottom: 4,
                background: 'rgba(255,255,255,0.04)',
                borderRadius: 4,
                fontSize: 9,
                fontFamily: 'var(--font-pixel, monospace)',
                color: 'rgba(255,255,255,0.5)',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
              }}>
                <span>Lv.{roleLevel}</span>
                <span>{unlockedCount}/{accessories.length} unlocked</span>
              </div>
            )}
            <StyleRow
              label="ACCESSORY"
              items={accessories}
              value={appearance.accessory}
              onChange={v => update('accessory', v)}
              lockInfo={makeLockInfo(getAccessoryRequiredLevel, getAccessoryCost)}
            />
            <div style={{
              marginTop: 12,
              padding: '8px 10px',
              background: 'rgba(255,255,255,0.03)',
              borderRadius: 6,
              border: '1px dashed rgba(255,255,255,0.08)',
              color: 'rgba(255,255,255,0.25)',
              fontSize: 9,
              fontFamily: 'var(--font-pixel, monospace)',
              textAlign: 'center',
            }}>
              {roleLevel !== undefined && roleLevel < 10
                ? `Level up to unlock more accessories`
                : 'More accessories coming soon'}
            </div>
          </>
        )}
      </div>
    </>
  );
}
