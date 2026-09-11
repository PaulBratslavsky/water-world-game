/**
 * WorldManager - Manages block storage and state for a single world
 */

import { NetworkBlock } from "../shared/NetworkProtocol.js";

export class WorldManager {
  private blocks: Map<string, NetworkBlock> = new Map();

  // Bumped on every change. A save records the revision it captured, so edits
  // made while that save is in flight still count as unsaved afterwards.
  private revision: number = 0;
  private savedRevision: number = 0;

  constructor(readonly worldId: string) {}

  /**
   * Generate a key for block position
   */
  private getKey(x: number, y: number, z: number): string {
    return `${x},${y},${z}`;
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
    this.savedRevision = this.revision;
  }

  /**
   * Add or update a block
   */
  setBlock(block: NetworkBlock): void {
    const key = this.getKey(block.x, block.y, block.z);
    this.blocks.set(key, block);
    this.revision++;
  }

  /**
   * Remove a block at position
   */
  removeBlock(x: number, y: number, z: number): boolean {
    const key = this.getKey(x, y, z);
    if (this.blocks.has(key)) {
      this.blocks.delete(key);
      this.revision++;
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
    this.revision++;
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
    return this.revision !== this.savedRevision;
  }

  /**
   * Capture the current blocks together with the revision they represent
   */
  snapshot(): { blocks: NetworkBlock[]; revision: number } {
    return { blocks: this.getAllBlocks(), revision: this.revision };
  }

  /**
   * Record that a snapshot taken at `revision` has been persisted
   */
  markSaved(revision: number): void {
    if (revision > this.savedRevision) {
      this.savedRevision = revision;
    }
  }
}
