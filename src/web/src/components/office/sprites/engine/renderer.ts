/* =========================================================
   BLUEPRINT RENDERER — Renders Blueprint data to Canvas

   Handles:
   - Color token resolution (appearance-aware)
   - Layer ordering
   - Bob Y offset for character idle animation
   - Both character (P=2) and facility (variable Q) rendering
   ========================================================= */

import type { CharacterAppearance } from '../../../../types/appearance';
import type { CharacterBlueprint, FacilityBlueprint, Pixel } from './blueprint';
import { resolveColor } from './blueprint';

/**
 * Render a character blueprint to a 2D canvas context.
 * Canvas should be sized at blueprint.width*2 x blueprint.height*2 (P=2 scale).
 *
 * @param ctx - Canvas 2D context
 * @param blueprint - Character blueprint data
 * @param bobY - Idle bob offset (0 or 1)
 * @param appearance - Optional color overrides
 */
export function renderCharacter(
  ctx: CanvasRenderingContext2D,
  blueprint: CharacterBlueprint,
  bobY: number,
  appearance?: CharacterAppearance,
): void {
  const P = 2;
  ctx.clearRect(0, 0, blueprint.width * P, blueprint.height * P);

  for (const layer of blueprint.layers) {
    renderPixels(ctx, layer.pixels, P, bobY, appearance);
  }
}

/**
 * Render a facility blueprint to a 2D canvas context.
 * Canvas should be sized at blueprint.canvasWidth x blueprint.canvasHeight.
 */
export function renderFacility(
  ctx: CanvasRenderingContext2D,
  blueprint: FacilityBlueprint,
): void {
  const Q = blueprint.scale;
  ctx.clearRect(0, 0, blueprint.canvasWidth, blueprint.canvasHeight);

  renderPixels(ctx, blueprint.pixels, Q, 0);
}

/**
 * Low-level pixel array renderer.
 */
function renderPixels(
  ctx: CanvasRenderingContext2D,
  pixels: Pixel[],
  scale: number,
  offsetY: number,
  appearance?: CharacterAppearance,
): void {
  for (const p of pixels) {
    const color = resolveColor(p.c, appearance);

    if (p.a !== undefined && p.a !== 1) {
      ctx.globalAlpha = p.a;
    }

    ctx.fillStyle = color;
    ctx.fillRect(
      p.x * scale,
      (p.y + offsetY) * scale,
      p.w * scale,
      p.h * scale,
    );

    if (p.a !== undefined && p.a !== 1) {
      ctx.globalAlpha = 1;
    }
  }
}
