/* =========================================================
   BLUEPRINT RENDERER — Renders Blueprint data to Canvas

   Handles:
   - Color token resolution (appearance-aware)
   - Layer ordering
   - Bob Y offset for character idle animation
   - Both character (P=2) and facility (variable Q) rendering
   ========================================================= */

import type { CharacterAppearance } from '../../../../types/appearance';
import type { CharacterBlueprint, CharacterLayer, FacilityBlueprint, Pixel } from './blueprint';
import { resolveColor } from './blueprint';

/**
 * Render a character blueprint to a 2D canvas context.
 *
 * @param ctx - Canvas 2D context
 * @param blueprint - Character blueprint data
 * @param bobY - Idle bob offset (0 or 1)
 * @param appearance - Optional color overrides
 * @param scale - Pixel scale factor (default 2, use 1 for mini blueprints)
 */
export function renderCharacter(
  ctx: CanvasRenderingContext2D,
  blueprint: CharacterBlueprint,
  bobY: number,
  appearance?: CharacterAppearance,
  scale = 2,
): void {
  ctx.clearRect(0, 0, blueprint.width * scale, blueprint.height * scale);

  for (const layer of blueprint.layers) {
    renderPixels(ctx, layer.pixels, scale, bobY, appearance);
  }
}

/**
 * Render raw Pixel[] at given position on a canvas.
 * Used by TopDown view for walk animation frames.
 */
export function renderPixelsAt(
  ctx: CanvasRenderingContext2D,
  pixels: Pixel[],
  ox: number,
  oy: number,
  appearance?: CharacterAppearance,
): void {
  for (const p of pixels) {
    const color = resolveColor(p.c, appearance);
    if (p.a !== undefined && p.a !== 1) ctx.globalAlpha = p.a;
    ctx.fillStyle = color;
    ctx.fillRect(ox + p.x, oy + p.y, p.w, p.h);
    if (p.a !== undefined && p.a !== 1) ctx.globalAlpha = 1;
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
 * Render a single layer to its own offscreen canvas.
 * Returns the canvas so it can be composited later.
 */
export function renderLayerToCanvas(
  layer: CharacterLayer,
  width: number,
  height: number,
  scale: number,
  offsetY: number,
  appearance?: CharacterAppearance,
): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = width * scale;
  canvas.height = height * scale;
  const ctx = canvas.getContext('2d')!;
  renderPixels(ctx, layer.pixels, scale, offsetY, appearance);
  return canvas;
}

/**
 * Composite multiple layer canvases onto a destination context.
 * Layers are drawn in order (first = bottom, last = top).
 */
export function composeLayers(
  ctx: CanvasRenderingContext2D,
  layerCanvases: HTMLCanvasElement[],
  width: number,
  height: number,
): void {
  ctx.clearRect(0, 0, width, height);
  for (const lc of layerCanvases) {
    ctx.drawImage(lc, 0, 0);
  }
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
