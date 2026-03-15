import { useRef, useEffect, useMemo } from 'react';
import type { CharacterAppearance } from '../../types/appearance';
import {
  getCharacterBlueprint, renderCharacter,
  swapHairLayer, getHairStyle,
  swapLayer, getOutfitStyle, getAccessory,
} from 'tyconoforge';
import './sprites/data'; // trigger blueprint registration

/**
 * TopDown-style pixel art character canvas using TyconoForge mini blueprints.
 * Renders a 12x22 mini blueprint at scale=1 on a 16x24 canvas (centered).
 */

const CW = 16, CH = 24;

const BOB_PERIOD = 60;
const PHASE_OFFSET: Record<string, number> = {
  cbo: 0, cto: 8, pm: 15, engineer: 22, designer: 5, qa: 12,
};

interface Props {
  roleId: string;
  className?: string;
  appearance?: CharacterAppearance;
  scale?: number;
}

/** Apply all style overrides (hair, outfit, accessory) to a base blueprint */
function applyStyles(
  base: ReturnType<typeof getCharacterBlueprint>,
  ap?: CharacterAppearance,
) {
  if (!base) return base;
  let bp = base;

  // Hair style
  if (ap?.hairStyle) {
    const hs = getHairStyle(ap.hairStyle);
    if (hs) bp = swapHairLayer(bp, hs.layer);
  }

  // Outfit style
  if (ap?.outfitStyle) {
    const os = getOutfitStyle(ap.outfitStyle);
    if (os) bp = swapLayer(bp, 'torso', os.layer, 1);
  }

  // Accessory
  if (ap?.accessory && ap.accessory !== 'none') {
    const acc = getAccessory(ap.accessory);
    if (acc) bp = swapLayer(bp, 'accessory', acc.layer);
  }

  return bp;
}

export { applyStyles };

export default function TopDownCharCanvas({ roleId, className, appearance, scale }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rafRef = useRef(0);
  const frameRef = useRef(0);
  const apRef = useRef(appearance);
  apRef.current = appearance;

  const s = scale ?? 4;
  const w = CW * s;
  const h = CH * s;

  // Resolve blueprint with all styles applied
  const bp = useMemo(() => {
    const base = getCharacterBlueprint(`mini:${roleId}`) ?? getCharacterBlueprint('mini:default');
    return applyStyles(base, appearance);
  }, [roleId, appearance?.hairStyle, appearance?.outfitStyle, appearance?.accessory]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const phase = PHASE_OFFSET[roleId] ?? 0;

    const tick = () => {
      frameRef.current++;
      const ap = apRef.current;
      if (!ap || !bp) { rafRef.current = requestAnimationFrame(tick); return; }

      const cycleFrame = (frameRef.current + phase) % BOB_PERIOD;
      const bobY = cycleFrame < 30 ? 1 : 0;

      // Clear full canvas, then render blueprint offset to center it
      ctx.clearRect(0, 0, CW, CH);
      // Mini blueprint is 12x22, canvas is 16x24 → offset (2, 1)
      ctx.save();
      ctx.translate(2, 1);
      renderCharacter(ctx, bp, bobY, ap, 1);
      ctx.restore();

      rafRef.current = requestAnimationFrame(tick);
    };

    rafRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafRef.current);
  }, [roleId, bp]);

  return (
    <canvas
      ref={canvasRef}
      width={CW}
      height={CH}
      className={className}
      style={{ imageRendering: 'pixelated', display: 'block', width: w, height: h }}
    />
  );
}
