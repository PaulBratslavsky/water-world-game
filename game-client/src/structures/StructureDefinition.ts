import {
  BlockData,
  BlockMaterial,
  CellOffset,
  getAllBlocks,
  getBlock,
  hexToNumber,
  loadBlocksFromStrapi,
} from "./BlockData";

// Re-export CellOffset and BlockMaterial for backwards compatibility
export type { CellOffset, BlockMaterial };

// Internal structure definition used by the game systems
// Converted from BlockData (Strapi format) to this format
export interface StructureDefinition {
  id: string;
  name: string;
  description: string;
  // Array of cell offsets that make up the shape
  // (0,0) is the anchor point
  cells: CellOffset[];
  // Visual properties
  color: number; // Converted from hex string to number
  height: number;
  // Material properties (optional, for custom materials)
  material?: BlockMaterial;
  // Optional: different heights per cell for more complex structures
  cellHeights?: Map<string, number>;
}

// Helper to create cell key for 2D lookups
export function cellKey(x: number, z: number): string {
  return `${x},${z}`;
}

// Helper to create cell key for 3D lookups (includes Y level)
export function cellKey3D(x: number, y: number, z: number): string {
  return `${x},${y},${z}`;
}

// Convert BlockData (Strapi format) to StructureDefinition (internal format)
function blockToStructure(block: BlockData): StructureDefinition {
  return {
    id: block.blockId,
    name: block.name,
    description: block.description,
    cells: block.cells,
    color: hexToNumber(block.color),
    height: block.height,
    material: block.material, // Pass through material properties
  };
}

// Build STRUCTURES map from BlockData
let STRUCTURES: { [key: string]: StructureDefinition } = {};

// Initialize from default block data
function rebuildStructures(): void {
  STRUCTURES = {};
  for (const block of getAllBlocks()) {
    STRUCTURES[block.blockId] = blockToStructure(block);
  }
}

// Initial build with defaults
rebuildStructures();

// Load structures from Strapi API and rebuild the map
export async function loadStructuresFromStrapi(
  apiUrl?: string
): Promise<void> {
  await loadBlocksFromStrapi(apiUrl);
  rebuildStructures();
}

// Rebuild structures from default block data (for single player mode)
export function rebuildStructuresFromDefaults(): void {
  rebuildStructures();
}

// Get all structure definitions as array
export function getAllStructures(): StructureDefinition[] {
  return Object.values(STRUCTURES);
}

// Get structure by ID (blockId)
export function getStructure(id: string): StructureDefinition | undefined {
  // First check cached STRUCTURES
  if (STRUCTURES[id]) {
    return STRUCTURES[id];
  }
  // Fallback to converting from BlockData (in case of dynamic additions)
  const block = getBlock(id);
  return block ? blockToStructure(block) : undefined;
}

// Update a structure's material properties (for real-time editing)
export function updateStructureMaterial(id: string, material: BlockMaterial): void {
  if (STRUCTURES[id]) {
    STRUCTURES[id].material = { ...STRUCTURES[id].material, ...material };
  }
}

// Calculate bounding box of a structure
export function getStructureBounds(structure: StructureDefinition): { width: number; depth: number } {
  let maxX = 0;
  let maxZ = 0;

  for (const cell of structure.cells) {
    maxX = Math.max(maxX, cell.x + 1);
    maxZ = Math.max(maxZ, cell.z + 1);
  }

  return { width: maxX, depth: maxZ };
}

// Rotate structure 90 degrees clockwise
export function rotateStructure(structure: StructureDefinition): StructureDefinition {
  const bounds = getStructureBounds(structure);

  const rotatedCells = structure.cells.map(cell => ({
    x: bounds.depth - 1 - cell.z,
    z: cell.x,
  }));

  return {
    ...structure,
    cells: rotatedCells,
  };
}
