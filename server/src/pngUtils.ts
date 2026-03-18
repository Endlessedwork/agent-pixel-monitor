import { PNG } from 'pngjs';

import { PNG_ALPHA_THRESHOLD } from './constants.js';

/**
 * Convert RGBA values to hex color string.
 * Returns '' for transparent pixels, '#RRGGBB' for opaque, '#RRGGBBAA' for semi-transparent.
 */
export function rgbaToHex(r: number, g: number, b: number, a: number): string {
  if (a < PNG_ALPHA_THRESHOLD) return '';
  const rgb =
    `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`.toUpperCase();
  if (a >= 255) return rgb;
  return `${rgb}${a.toString(16).padStart(2, '0').toUpperCase()}`;
}

/**
 * Convert PNG buffer to SpriteData (2D array of hex color strings).
 */
export function pngToSpriteData(pngBuffer: Buffer, width: number, height: number): string[][] {
  try {
    const png = PNG.sync.read(pngBuffer);

    if (png.width !== width || png.height !== height) {
      console.warn(
        `PNG dimensions mismatch: expected ${width}x${height}, got ${png.width}x${png.height}`,
      );
    }

    const sprite: string[][] = [];
    const data = png.data;

    for (let y = 0; y < height; y++) {
      const row: string[] = [];
      for (let x = 0; x < width; x++) {
        const pixelIndex = (y * png.width + x) * 4;
        const r = data[pixelIndex];
        const g = data[pixelIndex + 1];
        const b = data[pixelIndex + 2];
        const a = data[pixelIndex + 3];
        row.push(rgbaToHex(r, g, b, a));
      }
      sprite.push(row);
    }

    return sprite;
  } catch (err) {
    console.warn(`Failed to parse PNG: ${err instanceof Error ? err.message : err}`);
    const sprite: string[][] = [];
    for (let y = 0; y < height; y++) {
      sprite.push(new Array(width).fill(''));
    }
    return sprite;
  }
}

/**
 * Parse a PNG buffer and return the raw PNG object.
 */
export function parsePng(pngBuffer: Buffer): PNG {
  return PNG.sync.read(pngBuffer);
}
