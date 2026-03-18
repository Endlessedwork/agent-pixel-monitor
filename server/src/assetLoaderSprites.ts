/**
 * Asset Loader - Sprite loading for walls, floors, and characters.
 * Split from assetLoader.ts for file size management.
 */

import * as fs from 'fs';
import * as path from 'path';

import {
  CHAR_COUNT,
  CHAR_FRAME_H,
  CHAR_FRAME_W,
  CHAR_FRAMES_PER_ROW,
  CHARACTER_DIRECTIONS,
  FLOOR_TILE_SIZE,
  WALL_BITMASK_COUNT,
  WALL_GRID_COLS,
  WALL_PIECE_HEIGHT,
  WALL_PIECE_WIDTH,
} from './constants.js';
import { parsePng, pngToSpriteData, rgbaToHex } from './pngUtils.js';

// ── Wall tile loading ────────────────────────────────────────

export interface LoadedWallTiles {
  readonly sets: string[][][][];
}

/**
 * Parse a single wall PNG (64x128, 4x4 grid of 16x32 pieces) into 16 bitmask sprites.
 */
function parseWallPng(pngBuffer: Buffer): string[][][] {
  const png = parsePng(pngBuffer);
  const sprites: string[][][] = [];
  for (let mask = 0; mask < WALL_BITMASK_COUNT; mask++) {
    const ox = (mask % WALL_GRID_COLS) * WALL_PIECE_WIDTH;
    const oy = Math.floor(mask / WALL_GRID_COLS) * WALL_PIECE_HEIGHT;
    const sprite: string[][] = [];
    for (let r = 0; r < WALL_PIECE_HEIGHT; r++) {
      const row: string[] = [];
      for (let c = 0; c < WALL_PIECE_WIDTH; c++) {
        const idx = ((oy + r) * png.width + (ox + c)) * 4;
        const rv = png.data[idx];
        const gv = png.data[idx + 1];
        const bv = png.data[idx + 2];
        const av = png.data[idx + 3];
        row.push(rgbaToHex(rv, gv, bv, av));
      }
      sprite.push(row);
    }
    sprites.push(sprite);
  }
  return sprites;
}

/**
 * Load wall tile sets from assets/walls/ folder.
 * Each file is named wall_N.png. Files are loaded in numeric order.
 */
export async function loadWallTiles(assetsRoot: string): Promise<LoadedWallTiles | null> {
  try {
    const wallsDir = path.join(assetsRoot, 'assets', 'walls');
    if (!fs.existsSync(wallsDir)) {
      console.log('[AssetLoader] No walls/ directory found at:', wallsDir);
      return null;
    }

    console.log('[AssetLoader] Loading wall tiles from:', wallsDir);

    const entries = fs.readdirSync(wallsDir);
    const wallFiles: { index: number; filename: string }[] = [];
    for (const entry of entries) {
      const match = /^wall_(\d+)\.png$/i.exec(entry);
      if (match) {
        wallFiles.push({ index: parseInt(match[1], 10), filename: entry });
      }
    }

    if (wallFiles.length === 0) {
      console.log('[AssetLoader] No wall_N.png files found in walls/');
      return null;
    }

    wallFiles.sort((a, b) => a.index - b.index);

    const sets: string[][][][] = [];
    for (const { filename } of wallFiles) {
      const filePath = path.join(wallsDir, filename);
      const pngBuffer = fs.readFileSync(filePath);
      const sprites = parseWallPng(pngBuffer);
      sets.push(sprites);
    }

    console.log(
      `[AssetLoader] Loaded ${sets.length} wall tile set(s) (${sets.length * WALL_BITMASK_COUNT} pieces total)`,
    );
    return { sets };
  } catch (err) {
    console.error(
      `[AssetLoader] Error loading wall tiles: ${err instanceof Error ? err.message : err}`,
    );
    return null;
  }
}

// ── Floor tile loading ───────────────────────────────────────

export interface LoadedFloorTiles {
  readonly sprites: string[][][];
}

/**
 * Load floor tile patterns from assets/floors/ folder.
 * Each file is named floor_N.png. Files are loaded in numeric order.
 */
export async function loadFloorTiles(assetsRoot: string): Promise<LoadedFloorTiles | null> {
  try {
    const floorsDir = path.join(assetsRoot, 'assets', 'floors');
    if (!fs.existsSync(floorsDir)) {
      console.log('[AssetLoader] No floors/ directory found at:', floorsDir);
      return null;
    }

    console.log('[AssetLoader] Loading floor tiles from:', floorsDir);

    const entries = fs.readdirSync(floorsDir);
    const floorFiles: { index: number; filename: string }[] = [];
    for (const entry of entries) {
      const match = /^floor_(\d+)\.png$/i.exec(entry);
      if (match) {
        floorFiles.push({ index: parseInt(match[1], 10), filename: entry });
      }
    }

    if (floorFiles.length === 0) {
      console.log('[AssetLoader] No floor_N.png files found in floors/');
      return null;
    }

    floorFiles.sort((a, b) => a.index - b.index);

    const sprites: string[][][] = [];
    for (const { filename } of floorFiles) {
      const filePath = path.join(floorsDir, filename);
      const pngBuffer = fs.readFileSync(filePath);
      const sprite = pngToSpriteData(pngBuffer, FLOOR_TILE_SIZE, FLOOR_TILE_SIZE);
      sprites.push(sprite);
    }

    console.log(`[AssetLoader] Loaded ${sprites.length} floor tile patterns from floors/`);
    return { sprites };
  } catch (err) {
    console.error(
      `[AssetLoader] Error loading floor tiles: ${err instanceof Error ? err.message : err}`,
    );
    return null;
  }
}

// ── Character sprite loading ────────────────────────────────

export interface CharacterDirectionSprites {
  down: string[][][];
  up: string[][][];
  right: string[][][];
}

export interface LoadedCharacterSprites {
  readonly characters: CharacterDirectionSprites[];
}

/**
 * Load pre-colored character sprites from assets/characters/ (6 PNGs, each 112x96).
 * Each PNG has 3 direction rows (down, up, right) x 7 frames (16x32 each).
 */
export async function loadCharacterSprites(
  assetsRoot: string,
): Promise<LoadedCharacterSprites | null> {
  try {
    const charDir = path.join(assetsRoot, 'assets', 'characters');
    const characters: CharacterDirectionSprites[] = [];

    for (let ci = 0; ci < CHAR_COUNT; ci++) {
      const filePath = path.join(charDir, `char_${ci}.png`);
      if (!fs.existsSync(filePath)) {
        console.log(`[AssetLoader] No character sprite found at: ${filePath}`);
        return null;
      }

      const pngBuffer = fs.readFileSync(filePath);
      const png = parsePng(pngBuffer);

      const directions = CHARACTER_DIRECTIONS;
      const charData: CharacterDirectionSprites = { down: [], up: [], right: [] };

      for (let dirIdx = 0; dirIdx < directions.length; dirIdx++) {
        const dir = directions[dirIdx];
        const rowOffsetY = dirIdx * CHAR_FRAME_H;
        const frames: string[][][] = [];

        for (let f = 0; f < CHAR_FRAMES_PER_ROW; f++) {
          const sprite: string[][] = [];
          const frameOffsetX = f * CHAR_FRAME_W;
          for (let y = 0; y < CHAR_FRAME_H; y++) {
            const row: string[] = [];
            for (let x = 0; x < CHAR_FRAME_W; x++) {
              const idx = ((rowOffsetY + y) * png.width + (frameOffsetX + x)) * 4;
              const r = png.data[idx];
              const g = png.data[idx + 1];
              const b = png.data[idx + 2];
              const a = png.data[idx + 3];
              row.push(rgbaToHex(r, g, b, a));
            }
            sprite.push(row);
          }
          frames.push(sprite);
        }
        charData[dir] = frames;
      }
      characters.push(charData);
    }

    console.log(
      `[AssetLoader] Loaded ${characters.length} character sprites (${CHAR_FRAMES_PER_ROW} frames x 3 directions each)`,
    );
    return { characters };
  } catch (err) {
    console.error(
      `[AssetLoader] Error loading character sprites: ${err instanceof Error ? err.message : err}`,
    );
    return null;
  }
}
