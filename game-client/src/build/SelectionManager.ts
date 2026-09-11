import { PlacementSystem } from "../structures/PlacementSystem";
import { PrefabCaptureSystem } from "../structures/PrefabCaptureSystem";

export interface SelectionMaterial {
  metalness?: number;
  roughness?: number;
  emissive?: string;
  emissiveIntensity?: number;
  opacity?: number;
  transparent?: boolean;
}

export interface SelectionManagerConfig {
  placementSystem: PlacementSystem;
}

export interface SelectionManagerCallbacks {
  onBlockRemoved?: (x: number, y: number, z: number) => void;
  onEnterPasteMode?: () => void;
}

export class SelectionManager {
  private placementSystem: PlacementSystem;
  private prefabCaptureSystem: PrefabCaptureSystem | null = null;

  // Callbacks for external communication
  private onBlockRemoved: ((x: number, y: number, z: number) => void) | null = null;
  private onEnterPasteMode: (() => void) | null = null;

  constructor(config: SelectionManagerConfig) {
    this.placementSystem = config.placementSystem;
  }

  /**
   * Set the prefab capture system reference
   */
  setPrefabCaptureSystem(system: PrefabCaptureSystem | null): void {
    this.prefabCaptureSystem = system;
  }

  /**
   * Set callbacks for external events
   */
  setCallbacks(callbacks: SelectionManagerCallbacks): void {
    if (callbacks.onBlockRemoved) this.onBlockRemoved = callbacks.onBlockRemoved;
    if (callbacks.onEnterPasteMode) this.onEnterPasteMode = callbacks.onEnterPasteMode;
  }

  /**
   * Handle cut operation: copy to clipboard, delete blocks, enter paste mode
   */
  handleCut(): void {
    if (!this.prefabCaptureSystem) return;

    // Copy to clipboard first
    const copied = this.prefabCaptureSystem.copyToClipboard();
    if (!copied) return;

    // Then delete the blocks
    this.deleteSelectedBlocks();

    // Enter paste mode to place the cut blocks
    this.onEnterPasteMode?.();

    // Clear selection and exit mode
    this.prefabCaptureSystem.clearAndExit();
  }

  /**
   * Handle copy operation: copy to clipboard and enter paste mode
   */
  handleCopy(): void {
    if (!this.prefabCaptureSystem) return;

    const copied = this.prefabCaptureSystem.copyToClipboard();
    if (copied) {
      console.log("Selection copied to clipboard - entering paste mode");
      // Enter paste mode to place the copied blocks
      this.onEnterPasteMode?.();
    }

    // Clear selection and exit mode
    this.prefabCaptureSystem.clearAndExit();
  }

  /**
   * Handle delete operation: delete selected blocks
   */
  handleDelete(): void {
    if (!this.prefabCaptureSystem) return;

    this.deleteSelectedBlocks();

    // Clear selection and exit mode
    this.prefabCaptureSystem.clearAndExit();
  }

  /**
   * Handle apply material operation: update material on selected blocks
   */
  handleApplyMaterial(material: SelectionMaterial): void {
    if (!this.prefabCaptureSystem) return;

    const blocks = this.prefabCaptureSystem.getRawBlocksInSelection();
    let updatedCount = 0;

    for (const block of blocks) {
      // Update the block's material in the placement system
      const updated = this.placementSystem.updateBlockMaterial(block.x, block.y, block.z, material);
      if (updated) {
        updatedCount++;
      }
    }

    console.log(`Updated material for ${updatedCount} blocks`);

    // Clear selection and exit mode
    this.prefabCaptureSystem.clearAndExit();
  }

  /**
   * Delete all blocks in the current selection
   */
  private deleteSelectedBlocks(): void {
    if (!this.prefabCaptureSystem) return;

    const blocks = this.prefabCaptureSystem.getRawBlocksInSelection();

    for (const block of blocks) {
      const removed = this.placementSystem.removeBlockAt(block.x, block.y, block.z);
      if (removed) {
        this.onBlockRemoved?.(block.x, block.y, block.z);
      }
    }

    console.log(`Deleted ${blocks.length} blocks`);
  }
}
