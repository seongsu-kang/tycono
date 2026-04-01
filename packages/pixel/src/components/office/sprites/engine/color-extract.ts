/* =========================================================
   K-MEANS COLOR EXTRACTION — Extract dominant colors from images

   Uses K-Means++ seeding for better initial centroids.
   Intended for: photo upload -> dominant colors -> CharacterAppearance mapping.
   ========================================================= */

import type { CharacterAppearance } from '../../../../types/appearance';

interface RGB { r: number; g: number; b: number }

function rgbToHex({ r, g, b }: RGB): string {
  return `#${((r << 16) | (g << 8) | b).toString(16).padStart(6, '0')}`;
}

function hexToRgb(hex: string): RGB {
  const n = parseInt(hex.replace('#', ''), 16);
  return { r: (n >> 16) & 0xFF, g: (n >> 8) & 0xFF, b: n & 0xFF };
}

function dist2(a: RGB, b: RGB): number {
  const dr = a.r - b.r, dg = a.g - b.g, db = a.b - b.b;
  return dr * dr + dg * dg + db * db;
}

/** K-Means++ seeding: pick k centroids with weighted probability */
function kMeansPlusPlusInit(pixels: RGB[], k: number): RGB[] {
  const centroids: RGB[] = [];
  // First centroid: random
  centroids.push(pixels[Math.floor(Math.random() * pixels.length)]);

  for (let i = 1; i < k; i++) {
    const distances = pixels.map((p) => {
      let minD = Infinity;
      for (const c of centroids) minD = Math.min(minD, dist2(p, c));
      return minD;
    });
    const total = distances.reduce((s, d) => s + d, 0);
    let r = Math.random() * total;
    for (let j = 0; j < pixels.length; j++) {
      r -= distances[j];
      if (r <= 0) {
        centroids.push(pixels[j]);
        break;
      }
    }
    if (centroids.length <= i) centroids.push(pixels[Math.floor(Math.random() * pixels.length)]);
  }
  return centroids;
}

/**
 * Run K-Means clustering on RGB pixel data.
 * Returns k cluster centroids sorted by cluster size (largest first).
 */
function kMeans(pixels: RGB[], k: number, maxIter = 20): RGB[] {
  if (pixels.length === 0) return [];
  const centroids = kMeansPlusPlusInit(pixels, k);

  for (let iter = 0; iter < maxIter; iter++) {
    const clusters: RGB[][] = Array.from({ length: k }, () => []);

    for (const p of pixels) {
      let minD = Infinity, minIdx = 0;
      for (let i = 0; i < k; i++) {
        const d = dist2(p, centroids[i]);
        if (d < minD) { minD = d; minIdx = i; }
      }
      clusters[minIdx].push(p);
    }

    let converged = true;
    for (let i = 0; i < k; i++) {
      if (clusters[i].length === 0) continue;
      const avg: RGB = { r: 0, g: 0, b: 0 };
      for (const p of clusters[i]) { avg.r += p.r; avg.g += p.g; avg.b += p.b; }
      const n = clusters[i].length;
      const newC: RGB = {
        r: Math.round(avg.r / n),
        g: Math.round(avg.g / n),
        b: Math.round(avg.b / n),
      };
      if (dist2(newC, centroids[i]) > 1) converged = false;
      centroids[i] = newC;
    }
    if (converged) break;
  }

  // Sort by cluster size (recompute assignments)
  const counts = new Array(k).fill(0);
  for (const p of pixels) {
    let minD = Infinity, minIdx = 0;
    for (let i = 0; i < k; i++) {
      const d = dist2(p, centroids[i]);
      if (d < minD) { minD = d; minIdx = i; }
    }
    counts[minIdx]++;
  }

  return centroids
    .map((c, i) => ({ c, count: counts[i] }))
    .sort((a, b) => b.count - a.count)
    .map((x) => x.c);
}

/**
 * Extract pixel data from an image element or canvas.
 * Samples at most maxSamples pixels for performance.
 */
function samplePixels(source: HTMLImageElement | HTMLCanvasElement, maxSamples = 10000): RGB[] {
  const canvas = document.createElement('canvas');
  const w = source instanceof HTMLImageElement ? source.naturalWidth : source.width;
  const h = source instanceof HTMLImageElement ? source.naturalHeight : source.height;
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d')!;
  ctx.drawImage(source, 0, 0);

  const data = ctx.getImageData(0, 0, w, h).data;
  const totalPixels = w * h;
  const step = Math.max(1, Math.floor(totalPixels / maxSamples));
  const pixels: RGB[] = [];

  for (let i = 0; i < totalPixels; i += step) {
    const idx = i * 4;
    const a = data[idx + 3];
    if (a < 128) continue; // skip transparent
    pixels.push({ r: data[idx], g: data[idx + 1], b: data[idx + 2] });
  }
  return pixels;
}

/** Brightness of a color (0-255) */
function brightness(c: RGB): number {
  return 0.299 * c.r + 0.587 * c.g + 0.114 * c.b;
}

/** Saturation approximation (0-255) */
function saturation(c: RGB): number {
  const max = Math.max(c.r, c.g, c.b);
  const min = Math.min(c.r, c.g, c.b);
  return max === 0 ? 0 : ((max - min) / max) * 255;
}

/**
 * Extract dominant colors from an image and map them to CharacterAppearance.
 *
 * Heuristic mapping:
 * - Skin: brightest warm-toned color
 * - Hair: darkest color
 * - Shirt: most saturated color
 * - Pants: second darkest
 * - Shoes: darkest
 */
export function extractAppearance(
  source: HTMLImageElement | HTMLCanvasElement,
  k = 8,
): CharacterAppearance {
  const pixels = samplePixels(source);
  const centroids = kMeans(pixels, k);

  if (centroids.length < 5) {
    return {
      skinColor: '#F5CBA7', hairColor: '#2C1810', shirtColor: '#1565C0',
      pantsColor: '#37474F', shoeColor: '#212121',
    };
  }

  // Sort by brightness
  const byBright = [...centroids].sort((a, b) => brightness(b) - brightness(a));
  // Sort by saturation
  const bySat = [...centroids].sort((a, b) => saturation(b) - saturation(a));

  const skin = byBright[0]; // brightest
  const hair = byBright[byBright.length - 1]; // darkest
  const shirt = bySat[0]; // most saturated
  const pants = byBright[byBright.length - 2]; // second darkest
  const shoes = byBright[byBright.length - 1]; // darkest

  return {
    skinColor: rgbToHex(skin),
    hairColor: rgbToHex(hair),
    shirtColor: rgbToHex(shirt),
    pantsColor: rgbToHex(pants),
    shoeColor: rgbToHex(shoes),
  };
}

export { rgbToHex, hexToRgb, kMeans };
