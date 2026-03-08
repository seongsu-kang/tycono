/* =========================================================
   TyconoForge — Standalone Entry Point for IIFE Build

   Produces a zero-dependency standalone JS bundle for use
   in landing pages, Store HTML, and external embeds.

   Only exports the 'down' direction (front-facing) which is
   all that's needed for static/landing contexts.

   Usage (after build):
     <script src="tyconoforge.js"></script>
     const canvas = TyconoForge.render(appearance, { scale: 3 });

   Built via: npm run build:forge
   ========================================================= */

// Import registries — side-effect: registers all built-in assets
import './hairstyles';
import './outfits';
import './accessories';

// Import engine functions
import { darken, lighten, resolveColor } from './blueprint';
import type { Pixel } from './blueprint';
import { getAllHairStyles, getHairStyle } from './hairstyles';
import { getAllOutfitStyles, getOutfitStyle } from './outfits';
import { getAllAccessories, getAccessory } from './accessories';

/* ── Types (inlined for standalone — no external deps) ── */

interface StandaloneAppearance {
  skinColor: string;
  hairColor: string;
  shirtColor: string;
  pantsColor: string;
  shoeColor: string;
  hairStyle?: string;
  outfitStyle?: string;
  accessory?: string;
}

interface RenderOpts {
  scale?: number;
  padX?: number;
  padY?: number;
}

/* ── Base Blueprint Layers (12x22 mini, down direction) ── */

const BASE_LOWER: Pixel[] = [
  { x: 1, y: 19, w: 10, h: 2, c: '#100A06', a: 0.15 },
  { x: 2, y: 15, w: 3, h: 4, c: '$pants' },
  { x: 7, y: 15, w: 3, h: 4, c: '$pants' },
  { x: 2, y: 19, w: 3, h: 2, c: '$shoes' },
  { x: 7, y: 19, w: 3, h: 2, c: '$shoes' },
  { x: 2, y: 19, w: 3, h: 1, c: 'lighten($shoes, 20)', a: 0.4 },
  { x: 7, y: 19, w: 3, h: 1, c: 'lighten($shoes, 20)', a: 0.4 },
];

const BASE_HEAD: Pixel[] = [
  { x: 4, y: 8, w: 4, h: 3, c: '$skin' },
  { x: 1, y: 1, w: 10, h: 8, c: '$skin' },
  { x: 3, y: 4, w: 2, h: 2, c: '#1A1A2E' },
  { x: 7, y: 4, w: 2, h: 2, c: '#1A1A2E' },
  { x: 3, y: 4, w: 1, h: 1, c: '#FFF', a: 0.35 },
  { x: 7, y: 4, w: 1, h: 1, c: '#FFF', a: 0.35 },
  { x: 5, y: 7, w: 2, h: 1, c: 'darken($skin, 25)', a: 0.4 },
  { x: 0, y: 4, w: 1, h: 1, c: '$skin' },
  { x: 11, y: 4, w: 1, h: 1, c: '$skin' },
];

/* ── Renderer ── */

function renderPixels(
  ctx: CanvasRenderingContext2D,
  pixels: Pixel[],
  scale: number,
  offsetX: number,
  offsetY: number,
  appearance: StandaloneAppearance,
): void {
  for (const p of pixels) {
    const color = resolveColor(p.c, appearance as any);
    if (p.a !== undefined && p.a !== 1) ctx.globalAlpha = p.a;
    ctx.fillStyle = color;
    ctx.fillRect(
      (p.x + offsetX) * scale,
      (p.y + offsetY) * scale,
      p.w * scale,
      p.h * scale,
    );
    if (p.a !== undefined && p.a !== 1) ctx.globalAlpha = 1;
  }
}

/* ── Helper: get down-direction pixels from registry ── */

function getHairPixels(id: string): Pixel[] {
  const meta = getHairStyle(id);
  if (!meta) return getHairStyle('short')!.layer.pixels;
  // Prefer explicit down direction if available
  if (meta.directions?.down) return meta.directions.down.pixels;
  return meta.layer.pixels;
}

function getOutfitPixels(id: string): Pixel[] {
  const meta = getOutfitStyle(id);
  if (!meta) return getOutfitStyle('tshirt')!.layer.pixels;
  if (meta.directions?.down) return meta.directions.down.pixels;
  return meta.layer.pixels;
}

function getAccessoryPixels(id: string): Pixel[] {
  const meta = getAccessory(id);
  if (!meta) return [];
  if (meta.directions?.down) return meta.directions.down.pixels;
  return meta.layer.pixels;
}

/* ── Public API ── */

/**
 * Render a character to a new canvas element.
 * @param appearance - Character appearance object
 * @param opts - { scale, padX, padY }
 * @returns HTMLCanvasElement
 */
function render(appearance: StandaloneAppearance, opts?: RenderOpts): HTMLCanvasElement {
  const scale = opts?.scale ?? 3;
  const padX = opts?.padX ?? 2;
  const padTop = opts?.padY ?? 4;
  const padBottom = 1;
  const logW = 12 + padX * 2;
  const logH = 22 + padTop + padBottom;

  const canvas = document.createElement('canvas');
  canvas.width = logW * scale;
  canvas.height = logH * scale;
  canvas.style.imageRendering = 'pixelated';
  const ctx = canvas.getContext('2d')!;

  const ox = padX;
  const oy = padTop;

  // Layers: lower -> torso -> head -> hair -> accessory
  renderPixels(ctx, BASE_LOWER, scale, ox, oy, appearance);

  const outfitStyle = appearance.outfitStyle || 'tshirt';
  renderPixels(ctx, getOutfitPixels(outfitStyle), scale, ox, oy, appearance);

  renderPixels(ctx, BASE_HEAD, scale, ox, oy, appearance);

  const hairStyle = appearance.hairStyle || 'short';
  renderPixels(ctx, getHairPixels(hairStyle), scale, ox, oy, appearance);

  const accessory = appearance.accessory || 'none';
  renderPixels(ctx, getAccessoryPixels(accessory), scale, ox, oy, appearance);

  return canvas;
}

/**
 * Render to an existing canvas element.
 */
function renderTo(canvas: HTMLCanvasElement, appearance: StandaloneAppearance, opts?: RenderOpts): void {
  const scale = opts?.scale ?? 3;
  const padX = opts?.padX ?? 2;
  const padTop = opts?.padY ?? 4;
  const ctx = canvas.getContext('2d')!;
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  const ox = padX;
  const oy = padTop;

  renderPixels(ctx, BASE_LOWER, scale, ox, oy, appearance);
  renderPixels(ctx, getOutfitPixels(appearance.outfitStyle || 'tshirt'), scale, ox, oy, appearance);
  renderPixels(ctx, BASE_HEAD, scale, ox, oy, appearance);
  renderPixels(ctx, getHairPixels(appearance.hairStyle || 'short'), scale, ox, oy, appearance);
  renderPixels(ctx, getAccessoryPixels(appearance.accessory || 'none'), scale, ox, oy, appearance);
}

/**
 * Render and return as a PNG data URL.
 */
function renderToDataURL(appearance: StandaloneAppearance, opts?: RenderOpts): string {
  const canvas = render(appearance, opts);
  return canvas.toDataURL('image/png');
}

/* ── Exported Module (becomes TyconoForge global via IIFE) ── */

export {
  render,
  renderTo,
  renderToDataURL,
  darken,
  lighten,
  resolveColor,
};

/** Available hair style IDs */
export const HAIRSTYLES = getAllHairStyles().map(h => h.id);

/** Available outfit style IDs (named OUTFIT_STYLES for backward compat, also as OUTFITS) */
export const OUTFIT_STYLES = getAllOutfitStyles().map(o => o.id);
export const OUTFITS = OUTFIT_STYLES;

/** Available accessory IDs */
export const ACCESSORIES = getAllAccessories().map(a => a.id);

/** Available hair style IDs (alias for backward compat) */
export const HAIR_STYLES = HAIRSTYLES;
