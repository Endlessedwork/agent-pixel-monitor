import { useEffect, useState } from 'react';

import { setFloorSprites } from '../office/floorTiles.js';
import type { FurnitureAsset } from './useExtensionMessages.js';
import { buildDynamicCatalog } from '../office/layout/furnitureCatalog.js';
import { setCharacterTemplates } from '../office/sprites/spriteData.js';
import { setWallSprites } from '../office/wallTiles.js';

/** Base URL for the asset HTTP API served by the monitor backend */
const API_BASE = '/api/assets';

export interface AssetLoadState {
  /** True once all required assets (characters, floors, walls, furniture) are loaded */
  ready: boolean;
  /** Error message if any asset failed to load */
  error: string | null;
  /** Loaded furniture catalog + sprites for editor UI */
  loadedAssets?: { catalog: FurnitureAsset[]; sprites: Record<string, string[][]> };
}

/**
 * Fetches all game assets (character sprites, floor tiles, wall tiles, furniture)
 * from the HTTP API instead of receiving them via VS Code extension messages.
 *
 * Each asset type is fetched independently so the ones that load first can be
 * used immediately while waiting for the rest.
 */
export function useAssets(): AssetLoadState {
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loadedAssets, setLoadedAssets] = useState<
    { catalog: FurnitureAsset[]; sprites: Record<string, string[][]> } | undefined
  >();

  useEffect(() => {
    let cancelled = false;

    async function loadAllAssets(): Promise<void> {
      try {
        const results = await Promise.all([
          fetchJson<{
            characters: Array<{ down: string[][][]; up: string[][][]; right: string[][][] }>;
          }>(`${API_BASE}/characters`),
          fetchJson<{ sprites: string[][][] }>(`${API_BASE}/floors`),
          fetchJson<{ sets: string[][][][] }>(`${API_BASE}/walls`),
          fetchJson<{ catalog: FurnitureAsset[]; sprites: Record<string, string[][]> }>(
            `${API_BASE}/furniture`,
          ),
        ]);

        if (cancelled) return;

        const [charData, floorData, wallData, furnitureData] = results;

        // Apply character sprites
        setCharacterTemplates(charData.characters);

        // Apply floor tiles
        setFloorSprites(floorData.sprites);

        // Apply wall tiles
        setWallSprites(wallData.sets);

        // Apply furniture catalog
        buildDynamicCatalog({
          catalog: furnitureData.catalog,
          sprites: furnitureData.sprites,
        });
        setLoadedAssets({
          catalog: furnitureData.catalog,
          sprites: furnitureData.sprites,
        });

        setReady(true);
      } catch (err) {
        if (cancelled) return;
        const message = err instanceof Error ? err.message : 'Failed to load assets';
        console.error('[Assets] Load error:', message);
        setError(message);
      }
    }

    loadAllAssets();

    return () => {
      cancelled = true;
    };
  }, []);

  return { ready, error, loadedAssets };
}

/** Type-safe JSON fetcher with error handling */
async function fetchJson<T>(url: string): Promise<T> {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Asset fetch failed: ${url} (${response.status} ${response.statusText})`);
  }
  return response.json() as Promise<T>;
}
