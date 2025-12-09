/**
 * WorldManager - Manages block storage and world state
 */

import { NetworkBlock } from "../shared/NetworkProtocol.js";

export class WorldManager {
  private blocks: Map<string, NetworkBlock> = new Map();
  private dirty: boolean = false;
  private currentWorldId: string | null = null;

  /**
   * Generate a key for block position
   */
  private getKey(x: number, y: number, z: number): string {
    return `${x},${y},${z}`;
  }

  /**
   * Set the current world ID
   */
  setWorldId(worldId: string): void {
    this.currentWorldId = worldId;
  }

  /**
   * Get the current world ID
   */
  getWorldId(): string | null {
    return this.currentWorldId;
  }

  /**
   * Load blocks into the world (replaces existing blocks)
   */
  loadBlocks(blocks: NetworkBlock[]): void {
    this.blocks.clear();
    for (const block of blocks) {
      const key = this.getKey(block.x, block.y, block.z);
      this.blocks.set(key, block);
    }
    this.dirty = false;
  }

  /**
   * Add or update a block
   */
  setBlock(block: NetworkBlock): void {
    const key = this.getKey(block.x, block.y, block.z);
    this.blocks.set(key, block);
    this.dirty = true;
  }

  /**
   * Remove a block at position
   */
  removeBlock(x: number, y: number, z: number): boolean {
    const key = this.getKey(x, y, z);
    if (this.blocks.has(key)) {
      this.blocks.delete(key);
      this.dirty = true;
      return true;
    }
    return false;
  }

  /**
   * Check if a block exists at position
   */
  hasBlock(x: number, y: number, z: number): boolean {
    const key = this.getKey(x, y, z);
    return this.blocks.has(key);
  }

  /**
   * Get a block at position
   */
  getBlock(x: number, y: number, z: number): NetworkBlock | undefined {
    const key = this.getKey(x, y, z);
    return this.blocks.get(key);
  }

  /**
   * Clear all blocks
   */
  clearAll(): number {
    const count = this.blocks.size;
    this.blocks.clear();
    this.dirty = true;
    return count;
  }

  /**
   * Get all blocks as an array
   */
  getAllBlocks(): NetworkBlock[] {
    return Array.from(this.blocks.values());
  }

  /**
   * Get block count
   */
  getBlockCount(): number {
    return this.blocks.size;
  }

  /**
   * Check if world has unsaved changes
   */
  isDirty(): boolean {
    return this.dirty;
  }

  /**
   * Mark world as saved (clean)
   */
  markClean(): void {
    this.dirty = false;
  }

  /**
   * Mark world as needing save (dirty)
   */
  markDirty(): void {
    this.dirty = true;
  }
}
