/**
 * Asset Loader - Loads furniture assets from per-folder manifests.
 * Scans assets/furniture/ subdirectories, reads each manifest.json,
 * and loads all PNG files into SpriteData format.
 */

import * as fs from 'fs';
import * as path from 'path';

import { LAYOUT_REVISION_KEY } from './constants.js';
import { pngToSpriteData } from './pngUtils.js';
import type { FurnitureAsset } from './types.js';

// ── Manifest types ──────────────────────────────────────────

interface ManifestAsset {
  readonly type: 'asset';
  readonly id: string;
  readonly file: string;
  readonly width: number;
  readonly height: number;
  readonly footprintW: number;
  readonly footprintH: number;
  readonly orientation?: string;
  readonly state?: string;
  readonly frame?: number;
  readonly mirrorSide?: boolean;
}

interface ManifestGroup {
  readonly type: 'group';
  readonly groupType: 'rotation' | 'state' | 'animation';
  readonly rotationScheme?: string;
  readonly orientation?: string;
  readonly state?: string;
  readonly members: readonly ManifestNode[];
}

type ManifestNode = ManifestAsset | ManifestGroup;

interface FurnitureManifest {
  readonly id: string;
  readonly name: string;
  readonly category: string;
  readonly canPlaceOnWalls: boolean;
  readonly canPlaceOnSurfaces: boolean;
  readonly backgroundTiles: number;
  readonly type: 'asset' | 'group';
  readonly file?: string;
  readonly width?: number;
  readonly height?: number;
  readonly footprintW?: number;
  readonly footprintH?: number;
  readonly groupType?: string;
  readonly rotationScheme?: string;
  readonly members?: readonly ManifestNode[];
}

interface InheritedProps {
  readonly groupId: string;
  readonly name: string;
  readonly category: string;
  readonly canPlaceOnWalls: boolean;
  readonly canPlaceOnSurfaces: boolean;
  readonly backgroundTiles: number;
  readonly orientation?: string;
  readonly state?: string;
  readonly rotationScheme?: string;
  readonly animationGroup?: string;
}

/**
 * Recursively flatten a manifest node into FurnitureAsset[].
 */
function flattenManifest(node: ManifestNode, inherited: InheritedProps): FurnitureAsset[] {
  if (node.type === 'asset') {
    const asset = node as ManifestAsset;
    const orientation = asset.orientation ?? inherited.orientation;
    const state = asset.state ?? inherited.state;
    return [
      {
        id: asset.id,
        name: inherited.name,
        label: inherited.name,
        category: inherited.category,
        file: asset.file,
        width: asset.width,
        height: asset.height,
        footprintW: asset.footprintW,
        footprintH: asset.footprintH,
        isDesk: inherited.category === 'desks',
        canPlaceOnWalls: inherited.canPlaceOnWalls,
        canPlaceOnSurfaces: inherited.canPlaceOnSurfaces,
        backgroundTiles: inherited.backgroundTiles,
        groupId: inherited.groupId,
        ...(orientation ? { orientation } : {}),
        ...(state ? { state } : {}),
        ...(asset.mirrorSide ? { mirrorSide: true } : {}),
        ...(inherited.rotationScheme ? { rotationScheme: inherited.rotationScheme } : {}),
        ...(inherited.animationGroup ? { animationGroup: inherited.animationGroup } : {}),
        ...(asset.frame !== undefined ? { frame: asset.frame } : {}),
      },
    ];
  }

  const group = node as ManifestGroup;
  const results: FurnitureAsset[] = [];

  for (const member of group.members) {
    const childProps = buildChildProps(group, inherited);
    results.push(...flattenManifest(member, childProps));
  }

  return results;
}

function buildChildProps(group: ManifestGroup, inherited: InheritedProps): InheritedProps {
  let result = { ...inherited };

  if (group.groupType === 'rotation' && group.rotationScheme) {
    result = { ...result, rotationScheme: group.rotationScheme };
  }

  if (group.groupType === 'state') {
    if (group.orientation) {
      result = { ...result, orientation: group.orientation };
    }
    if (group.state) {
      result = { ...result, state: group.state };
    }
  }

  if (group.groupType === 'animation') {
    const orient = group.orientation ?? inherited.orientation ?? '';
    const st = group.state ?? inherited.state ?? '';
    result = {
      ...result,
      animationGroup: `${inherited.groupId}_${orient}_${st}`.toUpperCase(),
    };
    if (group.state) {
      result = { ...result, state: group.state };
    }
  }

  if (group.orientation && !result.orientation) {
    result = { ...result, orientation: group.orientation };
  }

  return result;
}

/**
 * Load furniture assets from per-folder manifests.
 */
export async function loadFurnitureAssets(
  assetsRoot: string,
): Promise<{ catalog: FurnitureAsset[]; sprites: Map<string, string[][]> } | null> {
  try {
    const furnitureDir = path.join(assetsRoot, 'assets', 'furniture');
    console.log(`[AssetLoader] Scanning furniture directory: ${furnitureDir}`);

    if (!fs.existsSync(furnitureDir)) {
      console.log('[AssetLoader] No furniture directory found at:', furnitureDir);
      return null;
    }

    const entries = fs.readdirSync(furnitureDir, { withFileTypes: true });
    const dirs = entries.filter((e) => e.isDirectory());

    if (dirs.length === 0) {
      console.log('[AssetLoader] No furniture subdirectories found');
      return null;
    }

    console.log(`[AssetLoader] Found ${dirs.length} furniture folders`);

    const catalog: FurnitureAsset[] = [];
    const sprites = new Map<string, string[][]>();

    for (const dir of dirs) {
      loadFurnitureDir(path.join(furnitureDir, dir.name), dir.name, catalog, sprites);
    }

    console.log(`[AssetLoader] Loaded ${sprites.size} / ${catalog.length} assets`);
    return { catalog, sprites };
  } catch (err) {
    console.error(
      `[AssetLoader] Error loading furniture assets: ${err instanceof Error ? err.message : err}`,
    );
    return null;
  }
}

function loadFurnitureDir(
  itemDir: string,
  dirName: string,
  catalog: FurnitureAsset[],
  sprites: Map<string, string[][]>,
): void {
  const manifestPath = path.join(itemDir, 'manifest.json');
  if (!fs.existsSync(manifestPath)) {
    console.warn(`[AssetLoader] No manifest.json in ${dirName}`);
    return;
  }

  try {
    const manifestContent = fs.readFileSync(manifestPath, 'utf-8');
    const manifest = JSON.parse(manifestContent) as FurnitureManifest;

    const inherited: InheritedProps = {
      groupId: manifest.id,
      name: manifest.name,
      category: manifest.category,
      canPlaceOnWalls: manifest.canPlaceOnWalls,
      canPlaceOnSurfaces: manifest.canPlaceOnSurfaces,
      backgroundTiles: manifest.backgroundTiles,
    };

    let assets: FurnitureAsset[];

    if (manifest.type === 'asset') {
      assets = [
        {
          id: manifest.id,
          name: manifest.name,
          label: manifest.name,
          category: manifest.category,
          file: manifest.file ?? `${manifest.id}.png`,
          width: manifest.width!,
          height: manifest.height!,
          footprintW: manifest.footprintW!,
          footprintH: manifest.footprintH!,
          isDesk: manifest.category === 'desks',
          canPlaceOnWalls: manifest.canPlaceOnWalls,
          canPlaceOnSurfaces: manifest.canPlaceOnSurfaces,
          backgroundTiles: manifest.backgroundTiles,
          groupId: manifest.id,
        },
      ];
    } else {
      const rootInherited: InheritedProps = manifest.rotationScheme
        ? { ...inherited, rotationScheme: manifest.rotationScheme }
        : inherited;
      const rootGroup: ManifestGroup = {
        type: 'group',
        groupType: manifest.groupType as 'rotation' | 'state' | 'animation',
        rotationScheme: manifest.rotationScheme,
        members: manifest.members!,
      };
      assets = flattenManifest(rootGroup, rootInherited);
    }

    for (const asset of assets) {
      try {
        const assetPath = path.join(itemDir, asset.file);
        if (!fs.existsSync(assetPath)) {
          console.warn(`[AssetLoader] Asset file not found: ${asset.file} in ${dirName}`);
          continue;
        }
        const pngBuffer = fs.readFileSync(assetPath);
        const spriteData = pngToSpriteData(pngBuffer, asset.width, asset.height);
        sprites.set(asset.id, spriteData);
      } catch (err) {
        console.warn(
          `[AssetLoader] Error loading ${asset.id}: ${err instanceof Error ? err.message : err}`,
        );
      }
    }

    catalog.push(...assets);
  } catch (err) {
    console.warn(
      `[AssetLoader] Error processing ${dirName}: ${err instanceof Error ? err.message : err}`,
    );
  }
}

/**
 * Load the bundled default layout with the highest revision.
 */
export function loadDefaultLayout(assetsRoot: string): Record<string, unknown> | null {
  const assetsDir = path.join(assetsRoot, 'assets');
  try {
    let bestRevision = 0;
    let bestPath: string | null = null;

    if (fs.existsSync(assetsDir)) {
      for (const file of fs.readdirSync(assetsDir)) {
        const match = /^default-layout-(\d+)\.json$/.exec(file);
        if (match) {
          const rev = parseInt(match[1], 10);
          if (rev > bestRevision) {
            bestRevision = rev;
            bestPath = path.join(assetsDir, file);
          }
        }
      }
    }

    if (!bestPath) {
      const fallback = path.join(assetsDir, 'default-layout.json');
      if (fs.existsSync(fallback)) {
        bestPath = fallback;
      }
    }

    if (!bestPath) {
      console.log('[AssetLoader] No default layout found in:', assetsDir);
      return null;
    }

    const content = fs.readFileSync(bestPath, 'utf-8');
    const layout = JSON.parse(content) as Record<string, unknown>;
    if (bestRevision > 0 && !layout[LAYOUT_REVISION_KEY]) {
      return { ...layout, [LAYOUT_REVISION_KEY]: bestRevision };
    }
    console.log(
      `[AssetLoader] Loaded default layout (revision ${layout[LAYOUT_REVISION_KEY] ?? 0}) from ${path.basename(bestPath)}`,
    );
    return layout;
  } catch (err) {
    console.error(
      `[AssetLoader] Error loading default layout: ${err instanceof Error ? err.message : err}`,
    );
    return null;
  }
}
