import * as THREE from "three";
import { PlacementSystem } from "../structures/PlacementSystem";
import { ChunkManager } from "../grid/ChunkManager";
import { CameraSystem } from "../systems/CameraSystem";
import { InputManager } from "../core/InputManager";
import { stateManager } from "../core/StateManager";
import { PrefabDefinition } from "../structures/PrefabDefinition";
import { PrefabCaptureSystem, getClipboard } from "../structures/PrefabCaptureSystem";
import { getStructure } from "../structures/StructureDefinition";
import { emitEvent } from "../core/EventBus";
import { disposeGroup, worldToGrid, rotateBlockPosition } from "../utils/ThreeUtils";
import { BUILD_CONFIG } from "../config/GameConfig";
import { NetworkBlockMaterial } from "../network/NetworkProtocol";

export interface BuildModeManagerConfig {
  scene: THREE.Scene;
  placementSystem: PlacementSystem;
  chunkManager: ChunkManager;
  cameraSystem: CameraSystem;
  inputManager: InputManager;
}

export interface BuildModeManagerCallbacks {
  onBlockPlaced?: (x: number, y: number, z: number, blockId: string, material?: NetworkBlockMaterial) => void;
  onBlockRemoved?: (x: number, y: number, z: number) => void;
}

export class BuildModeManager {
  private scene: THREE.Scene;
  private placementSystem: PlacementSystem;
  private chunkManager: ChunkManager;
  private cameraSystem: CameraSystem;
  private inputManager: InputManager;

  // Optional systems
  private prefabCaptureSystem: PrefabCaptureSystem | null = null;

  // Prefab placement state
  private currentPrefab: PrefabDefinition | null = null;
  private prefabPreview: THREE.Group | null = null;
  private prefabBuildLevel = 0;
  private prefabRotation = 0;

  // Paste mode state
  private isPasteMode = false;
  private pastePreview: THREE.Group | null = null;
  private pasteRotation = 0;

  // Cursor highlight state
  private cursorHighlight: THREE.Group | null = null;
  private lastHighlightGridX = -Infinity;
  private lastHighlightGridZ = -Infinity;
  private lastHighlightBuildLevel = -1;

  // Shared state
  private sharedBuildLevel = 0;
  private lastMouseWorldX = 0;
  private lastMouseWorldZ = 0;
  private lastMouseScreenX = 0;
  private lastMouseScreenY = 0;

  // Drag-to-place state
  private isDraggingToPlace = false;
  private lastPlacedGridX = -Infinity;
  private lastPlacedGridZ = -Infinity;

  // Drag-to-delete state
  private isDraggingToDelete = false;
  private lastDeletedGridX = -Infinity;
  private lastDeletedGridZ = -Infinity;

  // Mouse movement tracking (prevents drift during camera rotation)
  private mouseMovedSinceLastUpdate = false;
  private lockedGridX = -Infinity;
  private lockedGridZ = -Infinity;

  // Reusable THREE objects to avoid GC pressure
  private readonly _mouse = new THREE.Vector2();
  private readonly _raycaster = new THREE.Raycaster();
  private readonly _groundPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
  private readonly _intersectPoint = new THREE.Vector3();

  // Camera reference for raycasting
  private camera: THREE.Camera | null = null;

  // Callbacks
  private onBlockPlaced: ((x: number, y: number, z: number, blockId: string, material?: NetworkBlockMaterial) => void) | null = null;
  private onBlockRemoved: ((x: number, y: number, z: number) => void) | null = null;

  constructor(config: BuildModeManagerConfig) {
    this.scene = config.scene;
    this.placementSystem = config.placementSystem;
    this.chunkManager = config.chunkManager;
    this.cameraSystem = config.cameraSystem;
    this.inputManager = config.inputManager;
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
  setCallbacks(callbacks: BuildModeManagerCallbacks): void {
    if (callbacks.onBlockPlaced) this.onBlockPlaced = callbacks.onBlockPlaced;
    if (callbacks.onBlockRemoved) this.onBlockRemoved = callbacks.onBlockRemoved;
  }

  /**
   * Set camera reference for raycasting
   */
  setCamera(camera: THREE.Camera): void {
    this.camera = camera;
  }

  // ============================================
  // STATE GETTERS
  // ============================================

  getSharedBuildLevel(): number {
    return this.sharedBuildLevel;
  }

  setSharedBuildLevel(level: number): void {
    this.sharedBuildLevel = level;
  }

  isPasteModeActive(): boolean {
    return this.isPasteMode;
  }

  getCurrentPrefab(): PrefabDefinition | null {
    return this.currentPrefab;
  }

  getLastMouseWorldPosition(): { x: number; z: number } {
    return { x: this.lastMouseWorldX, z: this.lastMouseWorldZ };
  }

  setLastMouseWorldPosition(x: number, z: number): void {
    this.lastMouseWorldX = x;
    this.lastMouseWorldZ = z;
  }

  getLastMouseScreenPosition(): { x: number; y: number } {
    return { x: this.lastMouseScreenX, y: this.lastMouseScreenY };
  }

  setLastMouseScreenPosition(x: number, y: number): void {
    this.lastMouseScreenX = x;
    this.lastMouseScreenY = y;
  }

  // ============================================
  // BUILD LEVEL MANAGEMENT
  // ============================================

  /**
   * Cycle build level when in build mode
   */
  cycleBuildLevel(direction: number): void {
    let newLevel: number;

    // If placing a structure, use placement system's level cycling
    if (stateManager.isPlacing()) {
      this.placementSystem.cycleLevel(direction);
      newLevel = this.placementSystem.getCurrentBuildLevel();
      this.inputManager.setGroundPlaneHeight(newLevel);
      this.cameraSystem.setBuildLevel(newLevel);
      return;
    }

    // If placing a prefab, use prefab level cycling
    if (this.currentPrefab) {
      this.cyclePrefabLevel(direction);
      newLevel = this.prefabBuildLevel;
      this.inputManager.setGroundPlaneHeight(newLevel);
      this.cameraSystem.setBuildLevel(newLevel);
      return;
    }

    // If in prefab capture mode, update capture system
    if (stateManager.isPrefabCaptureMode() && this.prefabCaptureSystem) {
      this.prefabCaptureSystem.adjustLevel(direction);
      return;
    }

    // Otherwise, just update the shared level
    const maxLevel = BUILD_CONFIG.maxLevel;
    if (direction > 0) {
      this.sharedBuildLevel = Math.min(maxLevel, this.sharedBuildLevel + 1);
    } else {
      this.sharedBuildLevel = Math.max(0, this.sharedBuildLevel - 1);
    }
    newLevel = this.sharedBuildLevel;

    this.inputManager.setGroundPlaneHeight(newLevel);
    this.cameraSystem.setBuildLevel(newLevel);
    this.updateBuildModeLevelPlane();

    // Update cursor highlight to new level
    const cellSize = this.chunkManager.getCellSize();
    const { gridX, gridZ } = worldToGrid(this.lastMouseWorldX, this.lastMouseWorldZ, cellSize);
    this.updateCursorHighlight(gridX, gridZ, newLevel);

    emitEvent("structure:levelChanged", {
      level: newLevel,
      maxLevel: maxLevel,
    });
  }

  /**
   * Update level plane position when in build mode without active placement
   */
  updateBuildModeLevelPlane(): void {
    if (stateManager.getMode() !== "build") return;
    if (stateManager.isPlacing() || this.currentPrefab) return;

    const cellSize = this.chunkManager.getCellSize();
    const { gridX, gridZ } = worldToGrid(this.lastMouseWorldX, this.lastMouseWorldZ, cellSize);
    this.placementSystem.updateLevelPlaneAt(gridX, gridZ, this.sharedBuildLevel);
  }

  // ============================================
  // PREFAB PLACEMENT
  // ============================================

  startPrefabPlacement(prefab: PrefabDefinition): void {
    this.cancelPrefabPlacement();
    this.currentPrefab = prefab;
    this.prefabBuildLevel = this.sharedBuildLevel;
    this.prefabRotation = 0;
    this.prefabPreview = this.placementSystem.createPrefabPreview(prefab, this.prefabRotation);
    this.scene.add(this.prefabPreview);

    this.placementSystem.showLevelPlane();
    const cellSize = this.chunkManager.getCellSize();
    const { gridX, gridZ } = worldToGrid(this.lastMouseWorldX, this.lastMouseWorldZ, cellSize);
    this.placementSystem.updateLevelPlaneAt(gridX, gridZ, this.prefabBuildLevel);

    this.cameraSystem.setBuildLevel(this.prefabBuildLevel);
    this.inputManager.setGroundPlaneHeight(this.prefabBuildLevel);
    this.updatePrefabPreview(this.lastMouseWorldX, this.lastMouseWorldZ);
  }

  rotatePrefabPreview(): void {
    if (!this.prefabPreview || !this.currentPrefab) return;

    this.scene.remove(this.prefabPreview);
    disposeGroup(this.prefabPreview);

    this.prefabRotation = (this.prefabRotation + 1) % 4;
    this.prefabPreview = this.placementSystem.createPrefabPreview(this.currentPrefab, this.prefabRotation);
    this.scene.add(this.prefabPreview);
    this.updatePrefabPreview(this.lastMouseWorldX, this.lastMouseWorldZ);
  }

  private cyclePrefabLevel(direction: number): void {
    if (!this.currentPrefab) return;

    const maxLevel = BUILD_CONFIG.maxLevel;
    if (direction > 0) {
      this.prefabBuildLevel = Math.min(maxLevel, this.prefabBuildLevel + 1);
    } else {
      this.prefabBuildLevel = Math.max(0, this.prefabBuildLevel - 1);
    }

    this.sharedBuildLevel = this.prefabBuildLevel;

    if (this.prefabPreview) {
      this.prefabPreview.position.y = this.prefabBuildLevel;
    }

    const cellSize = this.chunkManager.getCellSize();
    const { gridX, gridZ } = worldToGrid(this.lastMouseWorldX, this.lastMouseWorldZ, cellSize);
    this.placementSystem.updateLevelPlaneAt(gridX, gridZ, this.prefabBuildLevel);

    emitEvent("structure:levelChanged", {
      level: this.prefabBuildLevel,
      maxLevel: maxLevel,
    });
  }

  cancelPrefabPlacement(): void {
    if (this.prefabPreview) {
      this.scene.remove(this.prefabPreview);
      disposeGroup(this.prefabPreview);
      this.prefabPreview = null;
    }
    this.currentPrefab = null;
    this.placementSystem.hideLevelPlane();
  }

  updatePrefabPreview(worldX: number, worldZ: number): void {
    if (!this.prefabPreview || !this.currentPrefab) return;

    const cellSize = this.chunkManager.getCellSize();
    const { gridX, gridZ } = worldToGrid(worldX, worldZ, cellSize);

    this.prefabPreview.position.set(
      gridX * cellSize + cellSize / 2,
      this.prefabBuildLevel,
      gridZ * cellSize + cellSize / 2
    );

    this.placementSystem.updateLevelPlaneAt(gridX, gridZ, this.prefabBuildLevel);

    const canPlace = this.placementSystem.canPlacePrefab(
      this.currentPrefab,
      gridX,
      gridZ,
      this.prefabBuildLevel,
      this.prefabRotation
    );

    this.prefabPreview.traverse((child) => {
      if (child instanceof THREE.Mesh) {
        const material = child.material as THREE.MeshStandardMaterial;
        material.opacity = canPlace ? 0.8 : 0.3;
      }
    });
  }

  confirmPrefabPlacement(gridX: number, gridZ: number): boolean {
    if (!this.currentPrefab) return false;

    const prefab = this.currentPrefab;
    const level = this.prefabBuildLevel;
    const rotation = this.prefabRotation;

    const placed = this.placementSystem.placePrefab(prefab, gridX, gridZ, level, rotation);
    if (placed) {
      // Send each prefab block to the server (including material)
      const blockPositions = this.placementSystem.getPrefabBlockPositions(prefab, gridX, gridZ, level, rotation);
      for (const block of blockPositions) {
        this.onBlockPlaced?.(block.x, block.y, block.z, block.blockId, block.material);
      }

      // Restart placement with same prefab
      const cellSize = this.chunkManager.getCellSize();
      this.cancelPrefabPlacement();

      this.currentPrefab = prefab;
      this.prefabBuildLevel = level;
      this.prefabRotation = rotation;
      this.prefabPreview = this.placementSystem.createPrefabPreview(prefab, rotation);
      this.scene.add(this.prefabPreview);
      this.updatePrefabPreview(gridX * cellSize, gridZ * cellSize);
    }
    return placed;
  }

  // ============================================
  // PASTE MODE
  // ============================================

  enterPasteMode(): void {
    const clipboard = getClipboard();
    if (!clipboard || clipboard.blocks.length === 0) return;

    this.isPasteMode = true;
    this.pasteRotation = 0;
    this.createPastePreview();
    console.log("Entered paste mode - click to place, R to rotate, Escape to cancel");
  }

  exitPasteMode(): void {
    this.isPasteMode = false;
    if (this.pastePreview) {
      this.scene.remove(this.pastePreview);
      disposeGroup(this.pastePreview);
      this.pastePreview = null;
    }
  }

  rotatePastePreview(): void {
    if (!this.isPasteMode) return;

    this.pasteRotation = (this.pasteRotation + 1) % 4;
    this.createPastePreview();

    const cellSize = this.chunkManager.getCellSize();
    const { gridX, gridZ } = worldToGrid(this.lastMouseWorldX, this.lastMouseWorldZ, cellSize);
    this.updatePastePreview(gridX, gridZ);
  }

  private createPastePreview(): void {
    const clipboard = getClipboard();
    if (!clipboard || clipboard.blocks.length === 0) return;

    if (this.pastePreview) {
      this.scene.remove(this.pastePreview);
      disposeGroup(this.pastePreview);
    }

    this.pastePreview = new THREE.Group();
    const cellSize = this.chunkManager.getCellSize();

    for (const block of clipboard.blocks) {
      const geometry = new THREE.BoxGeometry(cellSize * 0.95, cellSize, cellSize * 0.95);

      const structure = getStructure(block.blockId);
      let color: number | string = structure?.color || 0x888888;
      if (block.material?.color) {
        color = block.material.color;
      }

      const material = new THREE.MeshBasicMaterial({
        color,
        transparent: true,
        opacity: 0.5,
      });

      const mesh = new THREE.Mesh(geometry, material);
      const rotated = rotateBlockPosition(block.x, block.z, this.pasteRotation);

      mesh.position.set(
        rotated.x * cellSize + cellSize / 2,
        block.y * cellSize + cellSize / 2,
        rotated.z * cellSize + cellSize / 2
      );

      this.pastePreview.add(mesh);
    }

    this.scene.add(this.pastePreview);
  }

  updatePastePreview(gridX: number, gridZ: number): void {
    if (!this.pastePreview) return;

    const cellSize = this.chunkManager.getCellSize();
    this.pastePreview.position.set(
      gridX * cellSize,
      this.sharedBuildLevel * cellSize,
      gridZ * cellSize
    );
  }

  confirmPaste(gridX: number, gridZ: number): boolean {
    const clipboard = getClipboard();
    if (!clipboard || clipboard.blocks.length === 0) return false;

    const gridY = this.sharedBuildLevel;
    let placedCount = 0;

    for (const block of clipboard.blocks) {
      const rotated = rotateBlockPosition(block.x, block.z, this.pasteRotation);
      const x = gridX + rotated.x;
      const y = gridY + block.y;
      const z = gridZ + rotated.z;

      const structure = getStructure(block.blockId);
      if (structure) {
        const placed = this.placementSystem.placeBlockFromNetwork(x, y, z, block.blockId, 0, block.material);
        if (placed) {
          this.onBlockPlaced?.(x, y, z, block.blockId, block.material);
          placedCount++;
        }
      }
    }

    console.log(`Pasted ${placedCount} blocks at (${gridX}, ${gridY}, ${gridZ}) with rotation ${this.pasteRotation * 90}°`);
    return placedCount > 0;
  }

  // ============================================
  // CURSOR HIGHLIGHT
  // ============================================

  private createCursorHighlight(): THREE.Group {
    const cellSize = this.chunkManager.getCellSize();
    const group = new THREE.Group();

    const boxGeometry = new THREE.BoxGeometry(cellSize, cellSize, cellSize);
    const edgesGeometry = new THREE.EdgesGeometry(boxGeometry);
    const edgeMaterial = new THREE.LineBasicMaterial({
      color: 0xffffff,
      transparent: true,
      opacity: 0.8,
    });
    const edges = new THREE.LineSegments(edgesGeometry, edgeMaterial);
    group.add(edges);

    const fillMaterial = new THREE.MeshBasicMaterial({
      color: 0xffffff,
      transparent: true,
      opacity: 0.15,
      side: THREE.DoubleSide,
    });
    const fill = new THREE.Mesh(boxGeometry, fillMaterial);
    group.add(fill);

    return group;
  }

  updateCursorHighlight(gridX: number, gridZ: number, buildLevel: number): void {
    if (
      gridX === this.lastHighlightGridX &&
      gridZ === this.lastHighlightGridZ &&
      buildLevel === this.lastHighlightBuildLevel
    ) {
      return;
    }
    this.lastHighlightGridX = gridX;
    this.lastHighlightGridZ = gridZ;
    this.lastHighlightBuildLevel = buildLevel;

    if (!this.cursorHighlight) {
      this.cursorHighlight = this.createCursorHighlight();
      this.scene.add(this.cursorHighlight);
    }

    const cellSize = this.chunkManager.getCellSize();
    this.cursorHighlight.position.set(
      gridX * cellSize + cellSize / 2,
      buildLevel + cellSize / 2,
      gridZ * cellSize + cellSize / 2
    );
  }

  hideCursorHighlight(): void {
    if (this.cursorHighlight) {
      this.cursorHighlight.visible = false;
    }
  }

  showCursorHighlight(): void {
    if (this.cursorHighlight) {
      this.cursorHighlight.visible = true;
    }
  }

  // ============================================
  // RAYCASTING & INPUT HANDLING
  // ============================================

  /**
   * Handle mouse move event - store screen position and mark movement
   */
  handleMouseMove(screenX: number, screenY: number): void {
    if (stateManager.getCameraMode() !== "build") return;

    this.lastMouseScreenX = screenX;
    this.lastMouseScreenY = screenY;
    this.mouseMovedSinceLastUpdate = true;

    this.updatePreviewFromScreenPosition();
  }

  /**
   * Handle mouse down event - start drag operations
   */
  handleMouseDown(button: number): void {
    if (stateManager.getCameraMode() !== "build") return;

    if (button === 0) {
      // Left click - drag to place
      if (!stateManager.isPlacing()) return;
      if (this.currentPrefab) return; // Don't drag prefabs

      this.isDraggingToPlace = true;
      this.lastPlacedGridX = -Infinity;
      this.lastPlacedGridZ = -Infinity;
    } else if (button === 2) {
      // Right click - drag to delete
      this.isDraggingToDelete = true;
      this.lastDeletedGridX = -Infinity;
      this.lastDeletedGridZ = -Infinity;
    }
  }

  /**
   * Handle mouse up event - stop drag operations
   */
  handleMouseUp(button: number): void {
    if (button === 0) {
      this.isDraggingToPlace = false;
    } else if (button === 2) {
      this.isDraggingToDelete = false;
    }
  }

  /**
   * Handle mouse leave event - stop all drag operations
   */
  handleMouseLeave(): void {
    this.isDraggingToPlace = false;
    this.isDraggingToDelete = false;
  }

  /**
   * Handle left click - place blocks/prefabs or confirm paste
   */
  handleClick(): boolean {
    if (stateManager.getCameraMode() !== "build") return false;

    const mode = stateManager.getMode();
    if (mode !== "build") return false;

    const cellSize = this.chunkManager.getCellSize();
    const gridX = Math.floor(this.lastMouseWorldX / cellSize);
    const gridZ = Math.floor(this.lastMouseWorldZ / cellSize);

    // Check for paste mode first
    if (this.isPasteMode) {
      this.confirmPaste(gridX, gridZ);
      // Stay in paste mode for multiple pastes - press Escape to exit
      return true;
    }

    // Check for prefab capture mode
    if (stateManager.isPrefabCaptureMode() && this.prefabCaptureSystem) {
      return this.prefabCaptureSystem.handleClick(gridX, 0, gridZ);
    }

    // Check for prefab placement
    if (this.currentPrefab) {
      this.confirmPrefabPlacement(gridX, gridZ);
      return true;
    }

    // Check for structure placement
    if (stateManager.isPlacing()) {
      const placed = this.placementSystem.confirmPlacement();
      if (placed) {
        this.onBlockPlaced?.(placed.gridX, placed.gridY, placed.gridZ, placed.definition.id);
        // Keep placing - restart with same structure
        this.placementSystem.startPlacement(placed.definition);
        return true;
      }
    }

    return false;
  }

  /**
   * Handle right click - remove block at cursor position
   */
  handleRightClick(gridX: number, gridY: number, gridZ: number): boolean {
    if (stateManager.getCameraMode() !== "build") return false;

    const removed = this.placementSystem.removeBlockAt(gridX, gridY, gridZ);
    if (removed) {
      this.onBlockRemoved?.(gridX, gridY, gridZ);
      // Track deletion to prevent drag-to-delete repeating
      this.lastDeletedGridX = gridX;
      this.lastDeletedGridZ = gridZ;
      return true;
    }
    return false;
  }

  /**
   * Update preview positions based on screen coordinates
   * Called from mousemove and game loop to keep preview in sync with camera
   */
  updatePreviewFromScreenPosition(): void {
    if (stateManager.getCameraMode() !== "build") return;
    if (!this.camera) return;

    // Get build height for visual positioning
    const isPlacingStructure = stateManager.isPlacing();
    const isPlacingPrefab = this.currentPrefab !== null;
    let buildHeight: number;
    if (isPlacingPrefab) {
      buildHeight = this.sharedBuildLevel;
    } else if (isPlacingStructure) {
      buildHeight = this.placementSystem.getCurrentBuildLevel();
    } else {
      buildHeight = this.sharedBuildLevel;
    }

    const cellSize = this.chunkManager.getCellSize();
    let gridX: number;
    let gridZ: number;

    // Only recalculate grid position if mouse actually moved
    // This prevents placement from shifting when rotating camera with Q/E
    if (this.mouseMovedSinceLastUpdate || this.lockedGridX === -Infinity) {
      this._mouse.set(
        (this.lastMouseScreenX / window.innerWidth) * 2 - 1,
        -(this.lastMouseScreenY / window.innerHeight) * 2 + 1
      );

      this._raycaster.setFromCamera(this._mouse, this.camera);

      // Update ground plane to match current build level
      this._groundPlane.constant = -buildHeight;

      if (this._raycaster.ray.intersectPlane(this._groundPlane, this._intersectPoint)) {
        this.lastMouseWorldX = this._intersectPoint.x;
        this.lastMouseWorldZ = this._intersectPoint.z;

        gridX = Math.floor(this._intersectPoint.x / cellSize);
        gridZ = Math.floor(this._intersectPoint.z / cellSize);

        this.lockedGridX = gridX;
        this.lockedGridZ = gridZ;
      } else {
        gridX = this.lockedGridX;
        gridZ = this.lockedGridZ;
      }

      this.mouseMovedSinceLastUpdate = false;
    } else {
      gridX = this.lockedGridX;
      gridZ = this.lockedGridZ;

      this.lastMouseWorldX = gridX * cellSize + cellSize / 2;
      this.lastMouseWorldZ = gridZ * cellSize + cellSize / 2;
    }

    if (gridX === -Infinity || gridZ === -Infinity) return;

    const isBuildMode = stateManager.getMode() === "build";

    // Update cursor highlight
    if (isBuildMode) {
      this.updateCursorHighlight(gridX, gridZ, buildHeight);
      this.showCursorHighlight();
    } else {
      this.hideCursorHighlight();
    }

    // Update structure preview
    if (isPlacingStructure) {
      this.placementSystem.updatePreview(this.lastMouseWorldX, this.lastMouseWorldZ);

      // Drag-to-place: place blocks while dragging
      if (this.isDraggingToPlace) {
        if (gridX !== this.lastPlacedGridX || gridZ !== this.lastPlacedGridZ) {
          const placed = this.placementSystem.confirmPlacement();
          if (placed) {
            this.onBlockPlaced?.(placed.gridX, placed.gridY, placed.gridZ, placed.definition.id);
            this.lastPlacedGridX = gridX;
            this.lastPlacedGridZ = gridZ;
            this.placementSystem.startPlacement(placed.definition);
          }
        }
      }
    }

    // Update prefab preview
    if (isPlacingPrefab) {
      this.updatePrefabPreview(this.lastMouseWorldX, this.lastMouseWorldZ);
    }

    // Update paste preview
    if (this.isPasteMode) {
      this.updatePastePreview(gridX, gridZ);
    }

    // Update prefab capture preview
    if (stateManager.isPrefabCaptureMode() && this.prefabCaptureSystem) {
      this.prefabCaptureSystem.updatePreview(gridX, 0, gridZ);
    }

    // Update level plane when not placing anything
    if (isBuildMode && !isPlacingStructure && !isPlacingPrefab && !stateManager.isPrefabCaptureMode() && !this.isPasteMode) {
      this.placementSystem.updateLevelPlaneAt(gridX, gridZ, this.sharedBuildLevel);
    }

    // Drag-to-delete: remove blocks while dragging with right mouse
    if (this.isDraggingToDelete && stateManager.getMode() === "build") {
      if (gridX !== this.lastDeletedGridX || gridZ !== this.lastDeletedGridZ) {
        const blockY = Math.floor(buildHeight);
        const removed = this.placementSystem.removeBlockAt(gridX, blockY, gridZ);
        if (removed) {
          this.onBlockRemoved?.(gridX, blockY, gridZ);
        }
        this.lastDeletedGridX = gridX;
        this.lastDeletedGridZ = gridZ;
      }
    }
  }

  // ============================================
  // CLEANUP
  // ============================================

  dispose(): void {
    this.cancelPrefabPlacement();
    this.exitPasteMode();
    if (this.cursorHighlight) {
      this.scene.remove(this.cursorHighlight);
      disposeGroup(this.cursorHighlight);
      this.cursorHighlight = null;
    }
  }
}
