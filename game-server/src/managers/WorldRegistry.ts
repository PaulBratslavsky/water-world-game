/**
 * WorldRegistry - Keeps one WorldManager (and its CollisionSystem) per loaded world
 *
 * A world is loaded from Strapi when the first player joins it, shared by every
 * player in it, and saved then unloaded once the last player leaves.
 */

import { WorldManager } from "./WorldManager.js";
import { CollisionSystem } from "../physics/CollisionSystem.js";
import { StrapiService } from "../services/StrapiService.js";

export interface LoadedWorld {
  world: WorldManager;
  collision: CollisionSystem;
}

export class WorldRegistry {
  private worlds: Map<string, LoadedWorld> = new Map();
  // In-flight Strapi loads, so concurrent joins to the same world share one load
  private loading: Map<string, Promise<LoadedWorld | null>> = new Map();
  // Tail of each world's save queue - saves for a world run one at a time
  private saveQueues: Map<string, Promise<boolean>> = new Map();

  constructor(private strapiService: StrapiService) {}

  /**
   * Get a world that is already in memory
   */
  get(worldId: string): LoadedWorld | undefined {
    return this.worlds.get(worldId);
  }

  /**
   * Get all worlds currently in memory
   */
  getAll(): LoadedWorld[] {
    return Array.from(this.worlds.values());
  }

  /**
   * Get a world, loading it from Strapi if it isn't in memory yet.
   * Returns null if the world doesn't exist in Strapi.
   */
  async acquire(worldId: string): Promise<LoadedWorld | null> {
    const loaded = this.worlds.get(worldId);
    if (loaded) return loaded;

    let pending = this.loading.get(worldId);
    if (!pending) {
      pending = this.load(worldId).finally(() => this.loading.delete(worldId));
      this.loading.set(worldId, pending);
    }
    return pending;
  }

  private async load(worldId: string): Promise<LoadedWorld | null> {
    const result = await this.strapiService.loadWorld(worldId);
    if (!result.success) return null;

    const world = new WorldManager(worldId);
    world.loadBlocks(result.blocks);
    const entry: LoadedWorld = { world, collision: new CollisionSystem(world) };
    this.worlds.set(worldId, entry);
    console.log(`World ${worldId} loaded (${this.worlds.size} in memory)`);
    return entry;
  }

  /**
   * Save a world if it has unsaved changes. Saves for the same world are
   * queued, so an older snapshot can never land after a newer one.
   */
  save(world: WorldManager): Promise<boolean> {
    const previous = this.saveQueues.get(world.worldId) ?? Promise.resolve(true);
    const next = previous
      .catch(() => false)
      .then(async () => {
        if (!world.isDirty()) return true;
        const { blocks, revision } = world.snapshot();
        const success = await this.strapiService.saveWorld(blocks, world.worldId);
        if (success) world.markSaved(revision);
        return success;
      });
    this.saveQueues.set(world.worldId, next);
    return next;
  }

  /**
   * Save every world in memory (used on shutdown)
   */
  async saveAll(): Promise<void> {
    await Promise.all(this.getAll().map(({ world }) => this.save(world)));
  }

  /**
   * Save a world and drop it from memory. `isEmpty` is checked again after the
   * save completes, in case a player joined while it was saving.
   */
  async release(worldId: string, isEmpty: () => boolean): Promise<void> {
    const entry = this.worlds.get(worldId);
    if (!entry) return;

    const saved = await this.save(entry.world);
    if (!saved) {
      console.error(`World ${worldId} failed to save - keeping it in memory to retry`);
      return;
    }

    if (isEmpty() && this.worlds.get(worldId) === entry) {
      this.worlds.delete(worldId);
      this.saveQueues.delete(worldId);
      console.log(`World ${worldId} unloaded (${this.worlds.size} in memory)`);
    }
  }
}
