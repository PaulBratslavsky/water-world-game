/**
 * PrefabData - Strapi-compatible prefab definitions
 *
 * This file contains prefab data that can be loaded from Strapi API
 * or fall back to hardcoded defaults. Also provides functionality
 * to save custom builds as prefabs.
 */

// Prefab category enum - matches Strapi enumeration field
export enum PrefabCategory {
  BuiltIn = "built-in",
  UserCreated = "user-created",
  Decorative = "decorative",
  Structural = "structural",
  Furniture = "furniture",
}

// Block position within a prefab
export interface PrefabBlockData {
  x: number;
  y: number;
  z: number;
  blockId: string;
}

// Prefab definition matching Strapi schema
export interface PrefabData {
  id: number;
  prefabId: string;
  name: string;
  description: string;
  blocks: PrefabBlockData[];
  category: PrefabCategory;
  sortOrder: number;
  isActive: boolean;
  createdBy: string;
  metadata: Record<string, unknown>;
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

// Strapi prefab - some fields may be missing or null
interface StrapiPrefabData {
  id: number;
  prefabId: string;
  name: string;
  description: string | null;
  blocks: PrefabBlockData[];
  category: string;
  sortOrder: number;
  isActive: boolean;
  createdBy?: string | null;
  metadata: Record<string, unknown> | null;
  // Strapi auto-generated fields
  documentId?: string;
  createdAt?: string;
  updatedAt?: string;
  publishedAt?: string;
}

// Strapi single response wrapper (for create/update)
interface StrapiSingleResponse<T> {
  data: T;
  meta: Record<string, unknown>;
}

// Mutable prefab data - starts with empty, loaded from generators or API
let prefabData: PrefabData[] = [];
let prefabsLoaded = false;

// Strapi configuration from environment
const STRAPI_URL = import.meta.env.VITE_STRAPI_URL || "http://localhost:1337";
const STRAPI_API_TOKEN = import.meta.env.VITE_STRAPI_API_TOKEN || "";
// Request 100 items per page to get all prefabs (Strapi defaults to 25)
const DEFAULT_API_URL = `${STRAPI_URL}/api/prefabs?pagination[pageSize]=100`;

// Helper to get auth headers for Strapi
function getStrapiHeaders(): HeadersInit {
  const headers: HeadersInit = {
    "Content-Type": "application/json",
  };
  if (STRAPI_API_TOKEN) {
    headers["Authorization"] = `Bearer ${STRAPI_API_TOKEN}`;
  }
  return headers;
}

// ============================================
// PREFAB GENERATORS (for default prefabs)
// ============================================

function generateColumn(height: number, blockId: string): PrefabBlockData[] {
  const blocks: PrefabBlockData[] = [];
  for (let y = 0; y < height; y++) {
    blocks.push({ x: 0, y, z: 0, blockId });
  }
  return blocks;
}

function generateStripedColumn(
  height: number,
  blockIds: string[]
): PrefabBlockData[] {
  const blocks: PrefabBlockData[] = [];
  for (let y = 0; y < height; y++) {
    const blockId = blockIds[y % blockIds.length];
    blocks.push({ x: 0, y, z: 0, blockId });
  }
  return blocks;
}

function generateSphere(radius: number, blockId: string): PrefabBlockData[] {
  const blocks: PrefabBlockData[] = [];
  const center = radius;

  for (let x = 0; x <= radius * 2; x++) {
    for (let y = 0; y <= radius * 2; y++) {
      for (let z = 0; z <= radius * 2; z++) {
        const dx = x - center;
        const dy = y - center;
        const dz = z - center;
        const distance = Math.sqrt(dx * dx + dy * dy + dz * dz);

        if (distance <= radius && distance > radius - 1) {
          blocks.push({ x, y, z, blockId });
        }
      }
    }
  }

  return blocks;
}

function generatePyramid(
  baseSize: number,
  blockIds: string[]
): PrefabBlockData[] {
  const blocks: PrefabBlockData[] = [];
  let currentSize = baseSize;
  let y = 0;

  while (currentSize > 0) {
    const offset = Math.floor((baseSize - currentSize) / 2);
    const blockId = blockIds[Math.min(y, blockIds.length - 1)];

    for (let x = 0; x < currentSize; x++) {
      for (let z = 0; z < currentSize; z++) {
        blocks.push({
          x: x + offset,
          y,
          z: z + offset,
          blockId,
        });
      }
    }

    currentSize -= 2;
    y++;
  }

  return blocks;
}

// Default prefabs (used when Strapi is unavailable)
const DEFAULT_PREFABS: PrefabData[] = [
  {
    id: 1,
    prefabId: "column",
    name: "Column",
    description: "A tall stone column (8 blocks high)",
    blocks: generateColumn(8, "block_gray"),
    category: PrefabCategory.BuiltIn,
    sortOrder: 1,
    isActive: true,
    createdBy: "system",
    metadata: {},
  },
  {
    id: 2,
    prefabId: "striped_column",
    name: "Striped Column",
    description: "Alternating red and white column",
    blocks: generateStripedColumn(8, ["block_red", "block_white"]),
    category: PrefabCategory.BuiltIn,
    sortOrder: 2,
    isActive: true,
    createdBy: "system",
    metadata: {},
  },
  {
    id: 3,
    prefabId: "sphere",
    name: "Sphere",
    description: "A hollow spherical structure",
    blocks: generateSphere(3, "block_blue"),
    category: PrefabCategory.BuiltIn,
    sortOrder: 3,
    isActive: true,
    createdBy: "system",
    metadata: {},
  },
  {
    id: 4,
    prefabId: "pyramid",
    name: "Pyramid",
    description: "An Egyptian-style pyramid",
    blocks: generatePyramid(5, ["block_yellow", "block_orange", "block_red"]),
    category: PrefabCategory.BuiltIn,
    sortOrder: 4,
    isActive: true,
    createdBy: "system",
    metadata: {},
  },
];

// Initialize with defaults
prefabData = [...DEFAULT_PREFABS];

// ============================================
// API FUNCTIONS
// ============================================

// Load prefabs from Strapi API
export async function loadPrefabsFromStrapi(
  apiUrl: string = DEFAULT_API_URL
): Promise<PrefabData[]> {
  try {
    console.log(`Loading prefabs from: ${apiUrl}`);
    const response = await fetch(apiUrl, {
      headers: getStrapiHeaders(),
    });

    if (!response.ok) {
      throw new Error(`Failed to fetch prefabs: ${response.status}`);
    }

    const json: StrapiResponse<StrapiPrefabData> = await response.json();

    // Extract prefab data from Strapi response
    const prefabs: PrefabData[] = json.data.map((strapiPrefab) => ({
      id: strapiPrefab.id,
      prefabId: strapiPrefab.prefabId,
      name: strapiPrefab.name,
      description: strapiPrefab.description || "",
      blocks: strapiPrefab.blocks,
      category: strapiPrefab.category as PrefabCategory,
      sortOrder: strapiPrefab.sortOrder,
      isActive: strapiPrefab.isActive,
      createdBy: strapiPrefab.createdBy || "system",
      metadata: strapiPrefab.metadata || {},
    }));

    // Replace default prefab data with fetched data
    prefabData = prefabs;
    prefabsLoaded = true;

    console.log(`Loaded ${prefabs.length} prefabs from Strapi`);
    return prefabs;
  } catch (error) {
    console.warn("Failed to load prefabs from Strapi, using defaults:", error);
    prefabData = [...DEFAULT_PREFABS];
    return prefabData;
  }
}

// Save a new prefab to Strapi
export async function savePrefabToStrapi(
  prefab: Omit<PrefabData, "id">,
  apiUrl: string = DEFAULT_API_URL
): Promise<PrefabData | null> {
  try {
    // Only include fields that exist in Strapi schema
    const payload = {
      data: {
        prefabId: prefab.prefabId,
        name: prefab.name,
        description: prefab.description,
        blocks: prefab.blocks,
        category: prefab.category,
        sortOrder: prefab.sortOrder,
        isActive: prefab.isActive,
        metadata: prefab.metadata,
      }
    };
    const response = await fetch(apiUrl, {
      method: "POST",
      headers: getStrapiHeaders(),
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      const errorBody = await response.text();
      console.error("Strapi error response:", response.status, errorBody);
      throw new Error(`Failed to save prefab: ${response.status}`);
    }

    const json: StrapiSingleResponse<StrapiPrefabData> = await response.json();

    const savedPrefab: PrefabData = {
      id: json.data.id,
      prefabId: json.data.prefabId,
      name: json.data.name,
      description: json.data.description || "",
      blocks: json.data.blocks,
      category: json.data.category as PrefabCategory,
      sortOrder: json.data.sortOrder,
      isActive: json.data.isActive,
      createdBy: json.data.createdBy || "system",
      metadata: json.data.metadata || {},
    };

    // Add to local cache
    prefabData.push(savedPrefab);

    console.log(`Saved prefab "${savedPrefab.name}" to Strapi`);
    return savedPrefab;
  } catch (error) {
    console.error("Failed to save prefab to Strapi:", error);
    return null;
  }
}

// Save prefab locally (when Strapi is unavailable)
export function savePrefabLocally(prefab: Omit<PrefabData, "id">): PrefabData {
  const newPrefab: PrefabData = {
    ...prefab,
    id: Date.now(), // Use timestamp as temporary ID
  };

  prefabData.push(newPrefab);
  console.log(`Saved prefab "${newPrefab.name}" locally`);

  return newPrefab;
}

// ============================================
// QUERY FUNCTIONS
// ============================================

// Check if prefabs have been loaded from API
export function isPrefabsLoaded(): boolean {
  return prefabsLoaded;
}

// Get all active prefabs sorted by sortOrder
export function getAllPrefabData(): PrefabData[] {
  return prefabData
    .filter((prefab) => prefab.isActive)
    .sort((a, b) => a.sortOrder - b.sortOrder);
}

// Get prefab by prefabId
export function getPrefabData(prefabId: string): PrefabData | undefined {
  return prefabData.find(
    (prefab) => prefab.prefabId === prefabId && prefab.isActive
  );
}

// Get prefabs by category
export function getPrefabsByCategory(category: PrefabCategory): PrefabData[] {
  return prefabData
    .filter((prefab) => prefab.category === category && prefab.isActive)
    .sort((a, b) => a.sortOrder - b.sortOrder);
}

// Get all unique categories
export function getPrefabCategories(): PrefabCategory[] {
  const categories = new Set(
    prefabData.filter((prefab) => prefab.isActive).map((prefab) => prefab.category)
  );
  return Array.from(categories);
}

// Generate a unique prefabId for user-created prefabs
export function generatePrefabId(): string {
  return `user_build_${Date.now()}`;
}
