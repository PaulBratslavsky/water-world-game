/**
 * BlockData - Strapi-compatible block definitions
 *
 * This file contains block data that can be loaded from Strapi API
 * or fall back to hardcoded defaults.
 */

// Cell offset from origin - matches Strapi JSON field structure
export interface CellOffset {
  x: number;
  z: number;
}

/**
 * Material properties for blocks - matches Strapi schema
 * All properties are optional to maintain backwards compatibility
 */
export interface BlockMaterial {
  // Material type (default: "standard")
  type?: "standard" | "phong" | "basic" | "lambert";

  // PBR properties (for standard material)
  roughness?: number; // 0-1, how rough the surface is (default: 0.7)
  metalness?: number; // 0-1, how metallic the surface is (default: 0)

  // Emissive (glow) properties
  emissive?: string; // Hex color for glow effect
  emissiveIntensity?: number; // 0+, intensity of glow (default: 1)

  // Transparency
  opacity?: number; // 0-1, transparency level (default: 1)
  transparent?: boolean; // Enable transparency (default: false)

  // Advanced properties
  flatShading?: boolean; // Use flat shading instead of smooth
  wireframe?: boolean; // Render as wireframe
  side?: "front" | "back" | "double"; // Which sides to render
}

// Default material values
export const DEFAULT_MATERIAL: BlockMaterial = {
  type: "standard",
  roughness: 0.7,
  metalness: 0,
  emissiveIntensity: 1,
  opacity: 1,
  transparent: false,
  flatShading: false,
  wireframe: false,
  side: "front",
};

// Block definition matching Strapi schema
export interface BlockData {
  id: number; // Strapi auto-generated numeric ID
  blockId: string; // Code reference like "block_green"
  name: string; // Display name
  description: string; // UI tooltip/description
  cells: CellOffset[]; // JSON array of cell offsets
  color: string; // Hex color string like "#2ecc71"
  height: number; // Block height
  category: string; // Group for organization
  sortOrder: number; // UI display order
  isActive: boolean; // Enable/disable without deleting
  material?: BlockMaterial; // Optional material properties
  metadata: Record<string, unknown>; // Future extensibility
}

// Strapi response wrapper
interface StrapiResponse<T> {
  data: T[];
  meta: {
    pagination: {
      page: number;
      pageSize: number;
      pageCount: number;
      total: number;
    };
  };
}

// Strapi block includes extra fields we can ignore
interface StrapiBlockData extends BlockData {
  documentId?: string;
  createdAt?: string;
  updatedAt?: string;
  publishedAt?: string;
  material?: BlockMaterial; // Material data from Strapi
}

// Mutable block data - starts with defaults, can be replaced by Strapi fetch
let blockData: BlockData[] = [
  {
    id: 1,
    blockId: "block_gray",
    name: "Gray Block",
    description: "Basic gray building block",
    cells: [{ x: 0, z: 0 }],
    color: "#808080",
    height: 1,
    category: "basic",
    sortOrder: 1,
    isActive: true,
    metadata: {},
  },
  {
    id: 2,
    blockId: "block_red",
    name: "Red Block",
    description: "Red building block",
    cells: [{ x: 0, z: 0 }],
    color: "#e74c3c",
    height: 1,
    category: "basic",
    sortOrder: 2,
    isActive: true,
    metadata: {},
  },
  {
    id: 3,
    blockId: "block_blue",
    name: "Blue Block",
    description: "Blue building block",
    cells: [{ x: 0, z: 0 }],
    color: "#3498db",
    height: 1,
    category: "basic",
    sortOrder: 3,
    isActive: true,
    metadata: {},
  },
  {
    id: 4,
    blockId: "block_green",
    name: "Green Block",
    description: "Green building block",
    cells: [{ x: 0, z: 0 }],
    color: "#2ecc71",
    height: 1,
    category: "basic",
    sortOrder: 4,
    isActive: true,
    metadata: {},
  },
  {
    id: 5,
    blockId: "block_yellow",
    name: "Yellow Block",
    description: "Yellow building block",
    cells: [{ x: 0, z: 0 }],
    color: "#f1c40f",
    height: 1,
    category: "basic",
    sortOrder: 5,
    isActive: true,
    metadata: {},
  },
  {
    id: 6,
    blockId: "block_orange",
    name: "Orange Block",
    description: "Orange building block",
    cells: [{ x: 0, z: 0 }],
    color: "#e67e22",
    height: 1,
    category: "basic",
    sortOrder: 6,
    isActive: true,
    metadata: {},
  },
  {
    id: 7,
    blockId: "block_purple",
    name: "Purple Block",
    description: "Purple building block",
    cells: [{ x: 0, z: 0 }],
    color: "#9b59b6",
    height: 1,
    category: "basic",
    sortOrder: 7,
    isActive: true,
    metadata: {},
  },
  {
    id: 8,
    blockId: "block_cyan",
    name: "Cyan Block",
    description: "Cyan building block",
    cells: [{ x: 0, z: 0 }],
    color: "#1abc9c",
    height: 1,
    category: "basic",
    sortOrder: 8,
    isActive: true,
    metadata: {},
  },
  {
    id: 9,
    blockId: "block_brown",
    name: "Brown Block",
    description: "Brown building block",
    cells: [{ x: 0, z: 0 }],
    color: "#8b4513",
    height: 1,
    category: "basic",
    sortOrder: 9,
    isActive: true,
    metadata: {},
  },
  {
    id: 10,
    blockId: "block_white",
    name: "White Block",
    description: "White building block",
    cells: [{ x: 0, z: 0 }],
    color: "#ecf0f1",
    height: 1,
    category: "basic",
    sortOrder: 10,
    isActive: true,
    metadata: {},
  },
  {
    id: 11,
    blockId: "block_black",
    name: "Dark Block",
    description: "Dark building block",
    cells: [{ x: 0, z: 0 }],
    color: "#2c3e50",
    height: 1,
    category: "basic",
    sortOrder: 11,
    isActive: true,
    metadata: {},
  },
  {
    id: 12,
    blockId: "block_pink",
    name: "Pink Block",
    description: "Pink building block",
    cells: [{ x: 0, z: 0 }],
    color: "#e91e63",
    height: 1,
    category: "basic",
    sortOrder: 12,
    isActive: true,
    metadata: {},
  },
  // Material example blocks
  {
    id: 13,
    blockId: "block_metal",
    name: "Metal Block",
    description: "Shiny metallic block",
    cells: [{ x: 0, z: 0 }],
    color: "#c0c0c0",
    height: 1,
    category: "materials",
    sortOrder: 13,
    isActive: true,
    material: {
      type: "standard",
      roughness: 0.2,
      metalness: 0.9,
    },
    metadata: {},
  },
  {
    id: 14,
    blockId: "block_gold",
    name: "Gold Block",
    description: "Shiny gold block",
    cells: [{ x: 0, z: 0 }],
    color: "#ffd700",
    height: 1,
    category: "materials",
    sortOrder: 14,
    isActive: true,
    material: {
      type: "standard",
      roughness: 0.3,
      metalness: 0.95,
    },
    metadata: {},
  },
  {
    id: 15,
    blockId: "block_glass",
    name: "Glass Block",
    description: "Transparent glass block",
    cells: [{ x: 0, z: 0 }],
    color: "#87ceeb",
    height: 1,
    category: "materials",
    sortOrder: 15,
    isActive: true,
    material: {
      type: "standard",
      roughness: 0.1,
      metalness: 0,
      opacity: 0.4,
      transparent: true,
      side: "double",
    },
    metadata: {},
  },
  {
    id: 16,
    blockId: "block_glow_green",
    name: "Glow Green",
    description: "Glowing green block",
    cells: [{ x: 0, z: 0 }],
    color: "#00ff00",
    height: 1,
    category: "materials",
    sortOrder: 16,
    isActive: true,
    material: {
      type: "standard",
      roughness: 0.5,
      metalness: 0,
      emissive: "#00ff00",
      emissiveIntensity: 0.5,
    },
    metadata: {},
  },
  {
    id: 17,
    blockId: "block_glow_red",
    name: "Glow Red",
    description: "Glowing red block",
    cells: [{ x: 0, z: 0 }],
    color: "#ff0000",
    height: 1,
    category: "materials",
    sortOrder: 17,
    isActive: true,
    material: {
      type: "standard",
      roughness: 0.5,
      metalness: 0,
      emissive: "#ff0000",
      emissiveIntensity: 0.5,
    },
    metadata: {},
  },
  {
    id: 18,
    blockId: "block_matte",
    name: "Matte Block",
    description: "Non-reflective matte block",
    cells: [{ x: 0, z: 0 }],
    color: "#555555",
    height: 1,
    category: "materials",
    sortOrder: 18,
    isActive: true,
    material: {
      type: "standard",
      roughness: 1.0,
      metalness: 0,
    },
    metadata: {},
  },
];

// Track if blocks have been loaded from API
let blocksLoaded = false;

// Convert hex color string to number for Three.js
export function hexToNumber(hex: string): number {
  return parseInt(hex.replace("#", ""), 16);
}

// Strapi configuration from environment
const STRAPI_URL = import.meta.env.VITE_STRAPI_URL || "http://localhost:1337";
const STRAPI_API_TOKEN = import.meta.env.VITE_STRAPI_API_TOKEN || "";

// Helper to get auth headers for Strapi
function getStrapiHeaders(): HeadersInit {
  const headers: HeadersInit = {};
  if (STRAPI_API_TOKEN) {
    headers["Authorization"] = `Bearer ${STRAPI_API_TOKEN}`;
  }
  return headers;
}

// Load blocks from Strapi API
export async function loadBlocksFromStrapi(
  apiUrl?: string
): Promise<BlockData[]> {
  const url = apiUrl || `${STRAPI_URL}/api/blocks`;

  try {
    console.log(`Loading blocks from: ${url}`);
    const response = await fetch(url, {
      headers: getStrapiHeaders(),
    });

    if (!response.ok) {
      throw new Error(`Failed to fetch blocks: ${response.status}`);
    }

    const json: StrapiResponse<StrapiBlockData> = await response.json();

    // Extract block data from Strapi response, stripping extra fields
    const blocks: BlockData[] = json.data.map((strapiBlock) => ({
      id: strapiBlock.id,
      blockId: strapiBlock.blockId,
      name: strapiBlock.name,
      description: strapiBlock.description,
      cells: strapiBlock.cells,
      color: strapiBlock.color,
      height: strapiBlock.height,
      category: strapiBlock.category,
      sortOrder: strapiBlock.sortOrder,
      isActive: strapiBlock.isActive,
      material: strapiBlock.material, // Include material properties from Strapi
      metadata: strapiBlock.metadata || {},
    }));

    // Replace default block data with fetched data
    blockData = blocks;
    blocksLoaded = true;

    console.log(`Loaded ${blocks.length} blocks from Strapi`);
    return blocks;
  } catch (error) {
    console.warn("Failed to load blocks from Strapi, using defaults:", error);
    return blockData;
  }
}

// Check if blocks have been loaded from API
export function isBlocksLoaded(): boolean {
  return blocksLoaded;
}

// Get all active blocks sorted by sortOrder
export function getAllBlocks(): BlockData[] {
  return blockData
    .filter((block) => block.isActive)
    .sort((a, b) => a.sortOrder - b.sortOrder);
}

// Get block by blockId
export function getBlock(blockId: string): BlockData | undefined {
  return blockData.find(
    (block) => block.blockId === blockId && block.isActive
  );
}

// Get blocks by category
export function getBlocksByCategory(category: string): BlockData[] {
  return blockData
    .filter((block) => block.category === category && block.isActive)
    .sort((a, b) => a.sortOrder - b.sortOrder);
}

// Get all unique categories
export function getCategories(): string[] {
  const categories = new Set(
    blockData.filter((block) => block.isActive).map((block) => block.category)
  );
  return Array.from(categories);
}
