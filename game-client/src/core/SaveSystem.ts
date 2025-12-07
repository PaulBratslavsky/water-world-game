/**
 * SaveSystem - Local + Strapi save/load for game state
 *
 * Uses a world ID to identify which Strapi world to save/load from.
 * World ID is stored in localStorage and prompted on first load.
 */

import { emitEvent } from "./EventBus";

// Save data format version (increment when format changes)
const SAVE_VERSION = 1;
const LOCAL_SAVE_KEY = "voxel_game_save_local";       // Your personal local world (single player) - permanent
const EXPLORER_SAVE_KEY = "voxel_game_save_explorer"; // Temp copy of Strapi world (explorer mode) - wiped on leave
const WORLD_ID_KEY = "voxel_game_world_id";

// Strapi configuration
const STRAPI_URL = import.meta.env.VITE_STRAPI_URL || "http://localhost:1337";
const STRAPI_API_TOKEN = import.meta.env.VITE_STRAPI_API_TOKEN || "";
const STRAPI_SAVE_ENDPOINT = `${STRAPI_URL}/api/saves`;

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

// Current world ID (Strapi documentId)
let currentWorldId: string | null = localStorage.getItem(WORLD_ID_KEY);

/**
 * Material properties that can be saved per block
 */
export interface SavedBlockMaterial {
  color?: string;  // Color override (hex string like "#ff5500")
  metalness?: number;
  roughness?: number;
  emissive?: string;
  emissiveIntensity?: number;
  opacity?: number;
  transparent?: boolean;
}

/**
 * Represents a single placed block in the save file
 */
export interface SavedBlock {
  blockId: string;   // Block type ("block_red", "block_gray", etc.)
  x: number;         // Grid X position
  y: number;         // Grid Y position (height level)
  z: number;         // Grid Z position
  material?: SavedBlockMaterial;  // Optional custom material override
}

/**
 * Complete save data structure
 */
export interface SaveData {
  version: number;
  timestamp: string;
  blocks: SavedBlock[];
}

/**
 * Get current world ID
 */
export function getWorldId(): string | null {
  return currentWorldId;
}

/**
 * Set world ID (stores in localStorage)
 */
export function setWorldId(worldId: string): void {
  currentWorldId = worldId;
  localStorage.setItem(WORLD_ID_KEY, worldId);
}

/**
 * Check if world ID is set
 */
export function hasWorldId(): boolean {
  return currentWorldId !== null && currentWorldId.length > 0;
}

/**
 * Clear world ID (for switching worlds)
 */
export function clearWorldId(): void {
  currentWorldId = null;
  localStorage.removeItem(WORLD_ID_KEY);
}

/**
 * Prompt user for world ID
 * Returns the world ID or null if cancelled (will play offline)
 */
export function promptForWorldId(): string | null {
  const savedId = localStorage.getItem(WORLD_ID_KEY);
  const defaultValue = savedId || "";

  const worldId = prompt(
    "Enter Strapi World ID to connect to cloud saves.\n\n" +
    "Find this in Strapi admin: Content Manager > Saves > click entry > copy documentId\n\n" +
    "Leave empty or cancel to play offline (local storage only).",
    defaultValue
  );

  if (worldId && worldId.trim().length > 0) {
    setWorldId(worldId.trim());
    return worldId.trim();
  }

  return null;
}

/**
 * Save the current game state to localStorage
 */
export function saveGame(blocks: SavedBlock[]): boolean {
  try {
    const saveData: SaveData = {
      version: SAVE_VERSION,
      timestamp: new Date().toISOString(),
      blocks: blocks,
    };

    localStorage.setItem(LOCAL_SAVE_KEY, JSON.stringify(saveData));

    emitEvent("game:saved", { blockCount: blocks.length, timestamp: saveData.timestamp });

    return true;
  } catch (error) {
    console.error("Failed to save game:", error);
    return false;
  }
}

/**
 * Load game state from localStorage
 */
export function loadGame(): SaveData | null {
  try {
    const saved = localStorage.getItem(LOCAL_SAVE_KEY);
    if (!saved) {
      return null;
    }

    const saveData: SaveData = JSON.parse(saved);

    // Version check for future migrations
    if (saveData.version !== SAVE_VERSION) {
      console.warn(`Save version mismatch: expected ${SAVE_VERSION}, got ${saveData.version}`);
      // Future: Add migration logic here
    }

    emitEvent("game:loaded", { blockCount: saveData.blocks.length, timestamp: saveData.timestamp });

    return saveData;
  } catch (error) {
    console.error("Failed to load game:", error);
    return null;
  }
}

/**
 * Check if a save exists
 */
export function hasSave(): boolean {
  return localStorage.getItem(LOCAL_SAVE_KEY) !== null;
}

/**
 * Delete the saved game
 */
export function deleteSave(): boolean {
  try {
    localStorage.removeItem(LOCAL_SAVE_KEY);
    emitEvent("game:reset", undefined);
    return true;
  } catch (error) {
    console.error("Failed to delete save:", error);
    return false;
  }
}

// ============================================
// Explorer Mode Temporary Storage
// ============================================

/**
 * Save explorer mode temp data (temporary, wiped on leave)
 */
export function saveExplorerGame(blocks: SavedBlock[]): boolean {
  try {
    const saveData: SaveData = {
      version: SAVE_VERSION,
      timestamp: new Date().toISOString(),
      blocks: blocks,
    };

    localStorage.setItem(EXPLORER_SAVE_KEY, JSON.stringify(saveData));
    console.log(`Explorer mode: Saved ${blocks.length} blocks to temp storage`);
    return true;
  } catch (error) {
    console.error("Failed to save explorer game:", error);
    return false;
  }
}

/**
 * Load explorer mode temp data
 */
export function loadExplorerGame(): SaveData | null {
  try {
    const saved = localStorage.getItem(EXPLORER_SAVE_KEY);
    if (!saved) {
      return null;
    }

    const saveData: SaveData = JSON.parse(saved);
    console.log(`Explorer mode: Loaded ${saveData.blocks.length} blocks from temp storage`);
    return saveData;
  } catch (error) {
    console.error("Failed to load explorer game:", error);
    return null;
  }
}

/**
 * Check if explorer temp save exists
 */
export function hasExplorerSave(): boolean {
  return localStorage.getItem(EXPLORER_SAVE_KEY) !== null;
}

/**
 * Clear explorer mode temp data (called when leaving explorer mode)
 */
export function clearExplorerSave(): void {
  localStorage.removeItem(EXPLORER_SAVE_KEY);
  console.log("Explorer mode: Cleared temp storage");
}

/**
 * Get save info without loading full data
 */
export function getSaveInfo(): { exists: boolean; timestamp?: string; blockCount?: number } {
  try {
    const saved = localStorage.getItem(LOCAL_SAVE_KEY);
    if (!saved) {
      return { exists: false };
    }

    const saveData: SaveData = JSON.parse(saved);
    return {
      exists: true,
      timestamp: saveData.timestamp,
      blockCount: saveData.blocks.length,
    };
  } catch {
    return { exists: false };
  }
}

// ============================================
// STRAPI API FUNCTIONS
// ============================================

/**
 * World info returned when connecting
 */
export interface WorldInfo {
  id: number;
  documentId: string;
  name: string;
  version: string;
  description?: string;
  createdAt: string;
  updatedAt: string;
}

/**
 * Strapi save response structure
 */
interface StrapiSaveResponse {
  data: {
    id: number;
    documentId: string;
    name: string;
    version: string;
    description?: string;
    data: SaveData;
    createdAt: string;
    updatedAt: string;
  };
}

/**
 * Save game to Strapi backend using current world ID
 * Only updates existing world, never creates new one
 */
export async function saveToStrapi(blocks: SavedBlock[]): Promise<boolean> {
  if (!currentWorldId) {
    console.error("No world ID set - cannot save to Strapi");
    return false;
  }

  try {
    const saveData: SaveData = {
      version: SAVE_VERSION,
      timestamp: new Date().toISOString(),
      blocks: blocks,
    };

    const url = `${STRAPI_SAVE_ENDPOINT}/${currentWorldId}`;
    const body = JSON.stringify({ data: { data: saveData } });
    console.log("Saving to Strapi:", url);
    console.log("Payload:", body);

    const response = await fetch(url, {
      method: "PUT",
      headers: getStrapiHeaders(),
      body: body,
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error("Strapi save failed:", response.status, response.statusText, errorText);
      return false;
    }

    // NOTE: Do NOT cache to LOCAL_SAVE_KEY here!
    // LOCAL_SAVE_KEY is the user's personal single-player world and should never be overwritten
    // by cloud data. Explorer mode uses EXPLORER_SAVE_KEY for temporary storage.

    emitEvent("game:saved", { blockCount: blocks.length, timestamp: saveData.timestamp });

    console.log(`Saved ${blocks.length} blocks to world ${currentWorldId}`);
    return true;
  } catch (error) {
    console.error("Failed to save to Strapi:", error);
    return false;
  }
}

/**
 * Load game from Strapi backend using current world ID
 * Falls back to localStorage if Strapi is unavailable
 */
export async function loadFromStrapi(): Promise<SaveData | null> {
  if (!currentWorldId) {
    console.warn("No world ID set - falling back to localStorage");
    return loadGame();
  }

  try {
    const response = await fetch(`${STRAPI_SAVE_ENDPOINT}/${currentWorldId}`, {
      headers: getStrapiHeaders(),
    });

    if (!response.ok) {
      console.warn(`Failed to load world ${currentWorldId}, falling back to localStorage`);
      return loadGame();
    }

    const result: StrapiSaveResponse = await response.json();
    const saveData = result.data.data;

    // NOTE: Do NOT cache to LOCAL_SAVE_KEY here!
    // LOCAL_SAVE_KEY is the user's personal single-player world and should never be overwritten
    // by cloud data. Explorer mode uses EXPLORER_SAVE_KEY for temporary storage.

    emitEvent("game:loaded", { blockCount: saveData.blocks.length, timestamp: saveData.timestamp });

    console.log(`Loaded ${saveData.blocks.length} blocks from world ${currentWorldId}`);
    return saveData;
  } catch (error) {
    console.warn("Failed to load from Strapi, falling back to localStorage:", error);
    return loadGame();
  }
}

/**
 * Validate that the current world ID exists in Strapi
 * Returns world info if valid, null if invalid
 */
export async function validateWorldId(): Promise<WorldInfo | null> {
  if (!currentWorldId) {
    return null;
  }

  try {
    const response = await fetch(`${STRAPI_SAVE_ENDPOINT}/${currentWorldId}`, {
      headers: getStrapiHeaders(),
    });
    if (!response.ok) {
      return null;
    }

    const result: StrapiSaveResponse = await response.json();
    return {
      id: result.data.id,
      documentId: result.data.documentId,
      name: result.data.name,
      version: result.data.version,
      description: result.data.description,
      createdAt: result.data.createdAt,
      updatedAt: result.data.updatedAt,
    };
  } catch {
    return null;
  }
}

/**
 * Check if Strapi is available
 */
export async function isStrapiAvailable(): Promise<boolean> {
  try {
    const response = await fetch(STRAPI_SAVE_ENDPOINT, {
      method: "HEAD",
      headers: getStrapiHeaders(),
    });
    return response.ok;
  } catch {
    return false;
  }
}
