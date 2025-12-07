/**
 * PrefabDefinition - Internal prefab format used by game systems
 *
 * Converts PrefabData (Strapi format) to PrefabDefinition (internal format).
 * Similar pattern to StructureDefinition/BlockData.
 */

import { getBlock, hexToNumber, BlockMaterial } from "./BlockData";
import {
  PrefabData,
  PrefabBlockData,
  getAllPrefabData,
  getPrefabData,
  loadPrefabsFromStrapi,
} from "./PrefabData";

// Re-export PrefabBlockData as PrefabBlock for backwards compatibility
export type PrefabBlock = PrefabBlockData;

// Internal prefab definition used by game systems
export interface PrefabDefinition {
  id: string;
  name: string;
  description: string;
  icon: string;
  blocks: PrefabBlock[];
}

// Get the color for a prefab block (checks block's material.color override first, then blockId)
export function getPrefabBlockColor(block: PrefabBlock): number {
  // Check for color override in block's material first
  if (block.material?.color) {
    return hexToNumber(block.material.color);
  }
  // Fall back to block definition color
  const blockData = getBlock(block.blockId);
  if (blockData) {
    return hexToNumber(blockData.color);
  }
  // Fallback to gray if block not found
  return 0x808080;
}

// Get the material for a prefab block (merges block's material override with base material)
export function getPrefabBlockMaterial(block: PrefabBlock): BlockMaterial | undefined {
  const blockData = getBlock(block.blockId);
  const baseMaterial = blockData?.material;

  // If block has material override, merge with base material (override takes precedence)
  if (block.material) {
    return { ...baseMaterial, ...block.material };
  }
  return baseMaterial;
}

// Convert PrefabData (Strapi format) to PrefabDefinition (internal format)
function prefabDataToDefinition(data: PrefabData): PrefabDefinition {
  return {
    id: data.prefabId,
    name: data.name,
    description: data.description,
    icon: "🏗️", // Default icon, could be added to PrefabData later
    blocks: data.blocks,
  };
}

// Build PREFABS map from PrefabData
let PREFABS: { [key: string]: PrefabDefinition } = {};

// Rebuild prefabs from data
function rebuildPrefabs(): void {
  PREFABS = {};
  for (const prefab of getAllPrefabData()) {
    PREFABS[prefab.prefabId] = prefabDataToDefinition(prefab);
  }
}

// Initial build with defaults
rebuildPrefabs();

// Load prefabs from Strapi API and rebuild the map
export async function loadPrefabsFromAPI(apiUrl?: string): Promise<void> {
  await loadPrefabsFromStrapi(apiUrl);
  rebuildPrefabs();
}

// Rebuild prefabs (call after saving new prefabs)
export function refreshPrefabs(): void {
  rebuildPrefabs();
}

// Rebuild prefabs from default data (for single player mode)
export function rebuildPrefabsFromDefaults(): void {
  rebuildPrefabs();
}

// Get all prefab definitions as array
export function getAllPrefabs(): PrefabDefinition[] {
  return Object.values(PREFABS);
}

// Get prefab by ID (prefabId)
export function getPrefab(id: string): PrefabDefinition | undefined {
  if (PREFABS[id]) {
    return PREFABS[id];
  }
  // Fallback to converting from PrefabData
  const data = getPrefabData(id);
  return data ? prefabDataToDefinition(data) : undefined;
}

// Get prefab dimensions (bounding box)
export function getPrefabBounds(prefab: PrefabDefinition): {
  width: number;
  height: number;
  depth: number;
} {
  let maxX = 0;
  let maxY = 0;
  let maxZ = 0;

  for (const block of prefab.blocks) {
    maxX = Math.max(maxX, block.x + 1);
    maxY = Math.max(maxY, block.y + 1);
    maxZ = Math.max(maxZ, block.z + 1);
  }

  return { width: maxX, height: maxY, depth: maxZ };
}
