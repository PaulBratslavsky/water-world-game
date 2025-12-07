import * as THREE from "three";
import { onEvent, emitEvent } from "../core/EventBus";
import { stateManager } from "../core/StateManager";
import { PrefabBlockData, PrefabBlockMaterial } from "./PrefabData";

/**
 * PrefabCaptureSystem - Handles selecting placed blocks for various actions
 *
 * Flow:
 * 1. Enter selection mode (P key)
 * 2. Use [ and ] to set the starting Y level
 * 3. Click first corner of selection box (at current level)
 * 4. Use ] to expand selection upward, [ to shrink
 * 5. Move mouse to preview X/Z extent
 * 6. Click second corner to complete selection
 * 7. Action menu appears with options: Cut, Copy, Delete, Create Prefab
 */

export interface SelectionBounds {
  minX: number;
  minY: number;
  minZ: number;
  maxX: number;
  maxY: number;
  maxZ: number;
}

// Clipboard for cut/copy operations
export interface ClipboardData {
  blocks: PrefabBlockData[];
  bounds: SelectionBounds;
}

// Singleton clipboard storage
let clipboard: ClipboardData | null = null;

export function getClipboard(): ClipboardData | null {
  return clipboard;
}

export function setClipboard(data: ClipboardData | null): void {
  clipboard = data;
}

export function hasClipboard(): boolean {
  return clipboard !== null && clipboard.blocks.length > 0;
}

export class PrefabCaptureSystem {
  private scene: THREE.Scene;
  private cellSize: number;
  private occupiedCells: Set<string>;
  private getBlockIdAt: (x: number, y: number, z: number) => string | null;

  // Selection state
  private firstCorner: THREE.Vector3 | null = null;
  private secondCorner: THREE.Vector3 | null = null;
  private selectionBox: THREE.Group | null = null;
  private previewBox: THREE.LineSegments | null = null;

  // Level state for 3D bounding box
  private currentLevel: number = 0;
  private topLevel: number = 0;
  private maxLevel: number = 50;

  // Current mouse position for preview
  private currentPreviewX: number = 0;
  private currentPreviewZ: number = 0;

  // Callback to update level plane and camera (set by main.ts)
  private onLevelChanged: ((level: number) => void) | null = null;

  // Callback to get block material at a position (set by main.ts)
  private getBlockMaterialAt: ((x: number, y: number, z: number) => PrefabBlockMaterial | null) | null = null;

  constructor(
    scene: THREE.Scene,
    cellSize: number,
    occupiedCells: Set<string>,
    getBlockIdAt: (x: number, y: number, z: number) => string | null
  ) {
    this.scene = scene;
    this.cellSize = cellSize;
    this.occupiedCells = occupiedCells;
    this.getBlockIdAt = getBlockIdAt;

    this.setupEventListeners();
  }

  /**
   * Set callback to be called when level changes (for plane/camera sync)
   */
  setOnLevelChanged(callback: (level: number) => void): void {
    this.onLevelChanged = callback;
  }

  /**
   * Set callback to get block material at a position
   */
  setBlockMaterialGetter(callback: (x: number, y: number, z: number) => PrefabBlockMaterial | null): void {
    this.getBlockMaterialAt = callback;
  }

  private setupEventListeners(): void {
    onEvent("state:prefabCaptureChanged", ({ active }) => {
      if (active) {
        this.startCapture();
      } else {
        this.cancelCapture();
      }
    });

    onEvent("prefabCapture:cancelled", () => {
      this.cancelCapture();
      stateManager.setPrefabCaptureMode(false);
    });

    // Level changes are now handled by main.ts via cycleBuildLevel()
    // which calls adjustLevelFromParent() to sync the capture system
  }

  /**
   * Adjust the selection level
   * Before first click: adjusts starting level (bottom of box)
   * After first click: adjusts top level (expands/shrinks box height)
   * Called from main.ts when user presses [ or ]
   */
  adjustLevel(direction: number): void {
    if (!this.firstCorner) {
      // Before first click - adjust starting level
      this.currentLevel = Math.max(0, Math.min(this.maxLevel, this.currentLevel + direction));
      this.topLevel = this.currentLevel;

      // Notify main.ts to update plane and camera
      this.onLevelChanged?.(this.currentLevel);

      // Emit event for UI feedback
      emitEvent("prefabCapture:levelChanged", {
        bottomLevel: this.currentLevel,
        topLevel: this.topLevel,
        height: this.topLevel - this.currentLevel + 1,
      });

      // Also emit to sync with shared build level
      emitEvent("structure:levelChanged", {
        level: this.currentLevel,
        maxLevel: this.maxLevel,
      });
    } else {
      // After first click - adjust top level to expand/shrink selection height
      const newTopLevel = this.topLevel + direction;
      // Top level must be >= bottom level (currentLevel)
      if (newTopLevel >= this.currentLevel && newTopLevel <= this.maxLevel) {
        this.topLevel = newTopLevel;

        // Update preview box with new height
        this.updateSelectionBox(
          this.firstCorner.x,
          this.currentLevel,
          this.firstCorner.z,
          this.currentPreviewX,
          this.topLevel,
          this.currentPreviewZ
        );

        // Notify main.ts to update plane and camera (use top level for visibility)
        this.onLevelChanged?.(this.topLevel);

        emitEvent("prefabCapture:levelChanged", {
          bottomLevel: this.currentLevel,
          topLevel: this.topLevel,
          height: this.topLevel - this.currentLevel + 1,
        });
      }
    }
  }

  private startCapture(): void {
    this.firstCorner = null;
    this.secondCorner = null;
    // Keep current level (set from shared build level) instead of resetting to 0
    this.topLevel = this.currentLevel;
    this.clearSelectionVisuals();

    emitEvent("prefabCapture:levelChanged", {
      bottomLevel: this.currentLevel,
      topLevel: this.topLevel,
      height: 1,
    });
  }

  private cancelCapture(): void {
    this.firstCorner = null;
    this.secondCorner = null;
    this.currentLevel = 0;
    this.topLevel = 0;
    this.clearSelectionVisuals();
  }

  private clearSelectionVisuals(): void {
    if (this.selectionBox) {
      this.scene.remove(this.selectionBox);
      this.selectionBox.traverse((child) => {
        if (child instanceof THREE.LineSegments || child instanceof THREE.Mesh) {
          (child as THREE.Mesh).geometry.dispose();
          ((child as THREE.Mesh).material as THREE.Material).dispose();
        }
      });
      this.selectionBox = null;
    }
    if (this.previewBox) {
      this.scene.remove(this.previewBox);
      this.previewBox.geometry.dispose();
      (this.previewBox.material as THREE.Material).dispose();
      this.previewBox = null;
    }
  }

  // Called when user clicks during capture mode
  handleClick(gridX: number, _gridY: number, gridZ: number): boolean {
    if (!stateManager.isPrefabCaptureMode()) return false;

    if (!this.firstCorner) {
      // Set first corner at current level
      this.firstCorner = new THREE.Vector3(gridX, this.currentLevel, gridZ);
      this.updateSelectionVisual();

      // Keep level indicator visible - it will now follow the selection bounds

      return true;
    } else {
      // Set second corner using the preview coordinates to ensure visual matches selection
      // This prevents discrepancies between what's shown and what's captured
      this.secondCorner = new THREE.Vector3(this.currentPreviewX, this.topLevel, this.currentPreviewZ);
      this.completeSelection();
      return true;
    }
  }

  // Called on mouse move to show preview of selection
  updatePreview(gridX: number, _gridY: number, gridZ: number): void {
    if (!stateManager.isPrefabCaptureMode()) return;

    this.currentPreviewX = gridX;
    this.currentPreviewZ = gridZ;

    if (!this.firstCorner) {
      // Before first click - level plane is handled by PlacementSystem via main.ts
      return;
    }

    // After first click - show selection box preview
    this.updateSelectionBox(
      this.firstCorner.x,
      this.currentLevel,
      this.firstCorner.z,
      gridX,
      this.topLevel,
      gridZ
    );
  }

  private updateSelectionVisual(): void {
    if (!this.firstCorner) return;

    // Show a marker at the first corner
    this.clearSelectionVisuals();

    // Create corner marker showing the starting point
    const height = (this.topLevel - this.currentLevel + 1) * this.cellSize;
    const geometry = new THREE.BoxGeometry(
      this.cellSize * 1.1,
      height * 1.02,
      this.cellSize * 1.1
    );
    const edges = new THREE.EdgesGeometry(geometry);
    const material = new THREE.LineBasicMaterial({ color: 0x00ff00, linewidth: 2 });
    const cornerMarker = new THREE.LineSegments(edges, material);
    cornerMarker.position.set(
      this.firstCorner.x * this.cellSize + this.cellSize / 2,
      this.currentLevel * this.cellSize + height / 2,
      this.firstCorner.z * this.cellSize + this.cellSize / 2
    );

    this.selectionBox = new THREE.Group();
    this.selectionBox.add(cornerMarker);
    this.scene.add(this.selectionBox);
  }

  private updateSelectionBox(
    x1: number, y1: number, z1: number,
    x2: number, y2: number, z2: number
  ): void {
    // Clear previous preview
    if (this.previewBox) {
      this.scene.remove(this.previewBox);
      this.previewBox.geometry.dispose();
      (this.previewBox.material as THREE.Material).dispose();
    }

    // Calculate bounds
    const minX = Math.min(x1, x2);
    const maxX = Math.max(x1, x2);
    const minY = Math.min(y1, y2);
    const maxY = Math.max(y1, y2);
    const minZ = Math.min(z1, z2);
    const maxZ = Math.max(z1, z2);

    // Create box showing selection area
    const width = (maxX - minX + 1) * this.cellSize;
    const height = (maxY - minY + 1) * this.cellSize;
    const depth = (maxZ - minZ + 1) * this.cellSize;

    const geometry = new THREE.BoxGeometry(width, height, depth);
    const edges = new THREE.EdgesGeometry(geometry);
    const material = new THREE.LineBasicMaterial({ color: 0x00ffff, linewidth: 2 });
    this.previewBox = new THREE.LineSegments(edges, material);

    // Position at center of selection
    this.previewBox.position.set(
      minX * this.cellSize + width / 2,
      minY * this.cellSize + height / 2,
      minZ * this.cellSize + depth / 2
    );

    this.scene.add(this.previewBox);

    // Also update the corner marker to match the full height
    if (this.selectionBox && this.firstCorner) {
      this.scene.remove(this.selectionBox);
      this.selectionBox.traverse((child) => {
        if (child instanceof THREE.LineSegments) {
          child.geometry.dispose();
          (child.material as THREE.Material).dispose();
        }
      });

      const cornerGeometry = new THREE.BoxGeometry(
        this.cellSize * 1.1,
        height * 1.02,
        this.cellSize * 1.1
      );
      const cornerEdges = new THREE.EdgesGeometry(cornerGeometry);
      const cornerMaterial = new THREE.LineBasicMaterial({ color: 0x00ff00, linewidth: 2 });
      const cornerMarker = new THREE.LineSegments(cornerEdges, cornerMaterial);
      cornerMarker.position.set(
        this.firstCorner.x * this.cellSize + this.cellSize / 2,
        minY * this.cellSize + height / 2,
        this.firstCorner.z * this.cellSize + this.cellSize / 2
      );

      this.selectionBox = new THREE.Group();
      this.selectionBox.add(cornerMarker);
      this.scene.add(this.selectionBox);
    }
  }

  private completeSelection(): void {
    if (!this.firstCorner || !this.secondCorner) return;

    const bounds = this.getSelectionBounds();
    const blocks = this.getBlocksInSelection(bounds);

    if (blocks.length === 0) {
      // No blocks selected, cancel
      emitEvent("selection:cancelled", undefined);
      emitEvent("prefabCapture:cancelled", undefined); // Legacy
      return;
    }

    // Emit selection complete event with bounds and block count
    const eventData = {
      ...bounds,
      blockCount: blocks.length,
    };
    emitEvent("selection:complete", eventData);
    emitEvent("prefabCapture:selectionComplete", eventData); // Legacy
  }

  getSelectionBounds(): SelectionBounds {
    if (!this.firstCorner || !this.secondCorner) {
      return { minX: 0, minY: 0, minZ: 0, maxX: 0, maxY: 0, maxZ: 0 };
    }

    // Use the actual Y levels set by the user
    return {
      minX: Math.min(this.firstCorner.x, this.secondCorner.x),
      minY: this.currentLevel, // Bottom level set by user
      minZ: Math.min(this.firstCorner.z, this.secondCorner.z),
      maxX: Math.max(this.firstCorner.x, this.secondCorner.x),
      maxY: this.topLevel, // Top level set by user
      maxZ: Math.max(this.firstCorner.z, this.secondCorner.z),
    };
  }

  getBlocksInSelection(bounds: SelectionBounds): PrefabBlockData[] {
    const blocks: PrefabBlockData[] = [];
    let minFoundX = Infinity;
    let minFoundY = Infinity;
    let minFoundZ = Infinity;

    // First pass: find all blocks and track the minimum coordinates
    const foundBlocks: Array<{ x: number; y: number; z: number; blockId: string; material?: PrefabBlockMaterial }> = [];

    for (let x = bounds.minX; x <= bounds.maxX; x++) {
      for (let y = bounds.minY; y <= bounds.maxY; y++) {
        for (let z = bounds.minZ; z <= bounds.maxZ; z++) {
          const key = `${x},${y},${z}`;
          if (this.occupiedCells.has(key)) {
            const blockId = this.getBlockIdAt(x, y, z);
            if (blockId) {
              // Get material if callback is set
              const material = this.getBlockMaterialAt?.(x, y, z) || undefined;
              foundBlocks.push({ x, y, z, blockId, material });
              minFoundX = Math.min(minFoundX, x);
              minFoundY = Math.min(minFoundY, y);
              minFoundZ = Math.min(minFoundZ, z);
            }
          }
        }
      }
    }

    // If no blocks found, return empty array
    if (foundBlocks.length === 0) {
      return blocks;
    }

    // Second pass: normalize coordinates relative to the actual min block positions
    for (const block of foundBlocks) {
      const blockData: PrefabBlockData = {
        x: block.x - minFoundX,
        y: block.y - minFoundY,
        z: block.z - minFoundZ,
        blockId: block.blockId,
      };
      // Only include material if it has properties (to keep JSON clean)
      if (block.material && Object.keys(block.material).length > 0) {
        blockData.material = block.material;
      }
      blocks.push(blockData);
    }

    return blocks;
  }

  // Get the current selection as prefab block data
  getSelectedBlocks(): PrefabBlockData[] {
    const bounds = this.getSelectionBounds();
    return this.getBlocksInSelection(bounds);
  }

  // Get current capture level info
  getLevelInfo(): { bottomLevel: number; topLevel: number; height: number } {
    return {
      bottomLevel: this.currentLevel,
      topLevel: this.topLevel,
      height: this.topLevel - this.currentLevel + 1,
    };
  }

  // Set the current level (used to sync with shared build level)
  setLevel(level: number): void {
    this.currentLevel = Math.max(0, Math.min(this.maxLevel, level));
    this.topLevel = this.currentLevel;
    if (stateManager.isPrefabCaptureMode() && !this.firstCorner) {
      emitEvent("prefabCapture:levelChanged", {
        bottomLevel: this.currentLevel,
        topLevel: this.topLevel,
        height: 1,
      });
    }
  }

  // Get current level
  getLevel(): number {
    return this.currentLevel;
  }

  // Reset after save or cancel
  reset(): void {
    this.cancelCapture();
    stateManager.setPrefabCaptureMode(false);
  }

  // Copy current selection to clipboard
  copyToClipboard(): boolean {
    const bounds = this.getSelectionBounds();
    const blocks = this.getBlocksInSelection(bounds);

    if (blocks.length === 0) {
      return false;
    }

    setClipboard({ blocks, bounds });
    return true;
  }

  // Get the raw (non-normalized) blocks in selection for delete operations
  getRawBlocksInSelection(): Array<{ x: number; y: number; z: number; blockId: string }> {
    const bounds = this.getSelectionBounds();
    const blocks: Array<{ x: number; y: number; z: number; blockId: string }> = [];

    for (let x = bounds.minX; x <= bounds.maxX; x++) {
      for (let y = bounds.minY; y <= bounds.maxY; y++) {
        for (let z = bounds.minZ; z <= bounds.maxZ; z++) {
          const key = `${x},${y},${z}`;
          if (this.occupiedCells.has(key)) {
            const blockId = this.getBlockIdAt(x, y, z);
            if (blockId) {
              blocks.push({ x, y, z, blockId });
            }
          }
        }
      }
    }

    return blocks;
  }

  // Check if there's an active selection (both corners set)
  hasSelection(): boolean {
    return this.firstCorner !== null && this.secondCorner !== null;
  }

  // Get the first block in selection (at the starting corner)
  getFirstBlockId(): string | null {
    if (!this.firstCorner) return null;

    // Check if there's a block at the first corner position
    const x = Math.floor(this.firstCorner.x);
    const y = this.currentLevel;
    const z = Math.floor(this.firstCorner.z);

    return this.getBlockIdAt(x, y, z);
  }

  // Keep selection visuals visible (don't clear them yet)
  keepSelectionVisible(): void {
    // Selection box is already visible, just don't clear it
  }

  // Clear selection and exit mode
  clearAndExit(): void {
    this.cancelCapture();
    stateManager.setSelectionMode(false);
  }
}
