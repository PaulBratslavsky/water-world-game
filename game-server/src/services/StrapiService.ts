/**
 * StrapiService - Handles all Strapi CMS communication
 */

import { STRAPI_CONFIG, getStrapiHeaders } from "../config/ServerConfig.js";
import { SaveData, StrapiSaveResponse } from "../types/ServerTypes.js";
import { NetworkBlock } from "../shared/NetworkProtocol.js";

export interface LoadWorldResult {
  success: boolean;
  blocks: NetworkBlock[];
}

export class StrapiService {
  /**
   * Test Strapi connection at startup
   */
  async testConnection(): Promise<void> {
    console.log(`Strapi configured: ${STRAPI_CONFIG.url}`);
    console.log(`API Token: ${STRAPI_CONFIG.apiToken ? "configured" : "NOT SET"}`);
  }

  /**
   * Load a specific world by ID from Strapi
   */
  async loadWorld(worldId: string): Promise<LoadWorldResult> {
    try {
      const response = await fetch(`${STRAPI_CONFIG.saveEndpoint}/${worldId}`, {
        headers: getStrapiHeaders(),
      });

      if (!response.ok) {
        console.log(`World ${worldId} not found in Strapi (status: ${response.status})`);
        return { success: false, blocks: [] };
      }

      const result = (await response.json()) as StrapiSaveResponse;
      const saveData = result.data.data;

      const blocks: NetworkBlock[] = [];

      if (saveData.blocks && Array.isArray(saveData.blocks)) {
        for (const block of saveData.blocks) {
          blocks.push({
            x: block.x,
            y: block.y,
            z: block.z,
            structureId: block.blockId,
            rotation: 0,
            material: block.material,
          });
        }
      }

      // Debug: log sample block
      if (blocks.length > 0) {
        console.log(`Loaded world ${worldId}: ${blocks.length} blocks`);
        console.log(`Sample block:`, JSON.stringify(blocks[0]));
      } else {
        console.log(`Loaded world ${worldId}: empty`);
      }

      return { success: true, blocks };
    } catch (e) {
      console.error(`Failed to load world ${worldId} from Strapi:`, e);
      return { success: false, blocks: [] };
    }
  }

  /**
   * Save world to Strapi
   */
  async saveWorld(blocks: NetworkBlock[], documentId: string): Promise<boolean> {
    if (!documentId) {
      console.error("No world ID set - cannot save to Strapi");
      return false;
    }

    try {
      const saveBlocks = blocks.map((b) => ({
        blockId: b.structureId,
        x: b.x,
        y: b.y,
        z: b.z,
        material: b.material,
      }));

      const saveData: SaveData = {
        version: 1,
        timestamp: new Date().toISOString(),
        blocks: saveBlocks,
      };

      const response = await fetch(`${STRAPI_CONFIG.saveEndpoint}/${documentId}`, {
        method: "PUT",
        headers: getStrapiHeaders(),
        body: JSON.stringify({ data: { data: saveData } }),
      });

      if (response.ok) {
        console.log(`Saved ${blocks.length} blocks to world ${documentId}`);
        return true;
      } else {
        console.error("Failed to save to Strapi:", response.status);
        return false;
      }
    } catch (e) {
      console.error("Failed to save to Strapi:", e);
      return false;
    }
  }
}
