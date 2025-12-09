/**
 * Server-specific type definitions
 */

import { WebSocket } from "ws";
import { PlayerState } from "../shared/PlayerState.js";
import { PlayerInputMessage } from "../shared/NetworkProtocol.js";

/**
 * Block material properties for persistence
 */
export interface SavedBlockMaterial {
  color?: string;
  metalness?: number;
  roughness?: number;
  emissive?: string;
  emissiveIntensity?: number;
  opacity?: number;
  transparent?: boolean;
}

/**
 * Saved block format for Strapi
 */
export interface SavedBlock {
  blockId: string;
  x: number;
  y: number;
  z: number;
  material?: SavedBlockMaterial;
}

/**
 * World save data format
 */
export interface SaveData {
  version: number;
  timestamp: string;
  blocks: SavedBlock[];
}

/**
 * Strapi single save response
 */
export interface StrapiSaveResponse {
  data: {
    id: number;
    documentId: string;
    data: SaveData;
  };
}

/**
 * Strapi save list response
 */
export interface StrapiSaveListResponse {
  data: Array<{
    id: number;
    documentId: string;
    data: SaveData;
  }>;
}

/**
 * Connected player with WebSocket and state
 */
export interface ConnectedPlayer {
  ws: WebSocket;
  playerId: string;
  state: PlayerState;
  color: string;
  inputs: PlayerInputMessage["inputs"] | null;
  lastInputTime: number;
}
