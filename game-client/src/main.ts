import * as THREE from "three";

// Core systems
import { onEvent, emitEvent } from "./core/EventBus";
import { InputManager } from "./core/InputManager";
import { stateManager } from "./core/StateManager";
import { PlayerController } from "./core/PlayerController";

// Game systems
import { ChunkManager } from "./grid/ChunkManager";
import { CameraSystem } from "./systems/CameraSystem";
import { SceneConfig } from "./systems/SceneConfig";
import { PostProcessing, createEnhancedLighting } from "./systems/PostProcessing";
import { WaterSystem } from "./systems/WaterSystem";
import { SkySystem } from "./systems/SkySystem";
import { VisualPreset, getPreset } from "./systems/VisualPresets";
import { Character } from "./entities/Character";
import { PlacementSystem } from "./structures/PlacementSystem";
import {
  getStructure,
  loadStructuresFromStrapi,
  rebuildStructuresFromDefaults,
} from "./structures/StructureDefinition";
import {
  getPrefab,
  loadPrefabsFromAPI,
  rebuildPrefabsFromDefaults,
} from "./structures/PrefabDefinition";
import { PrefabCaptureSystem, hasClipboard } from "./structures/PrefabCaptureSystem";

// UI
import { UIManager } from "./ui/UIManager";
import { PerformancePanel } from "./ui/PerformancePanel";
import { QualityManager } from "./systems/QualityManager";

// Save system
import {
  saveGame,
  loadGame,
  deleteSave,
  hasSave,
  SavedBlock,
  getWorldId,
  loadFromStrapi,
  saveToStrapi,
  saveExplorerGame,
  clearExplorerSave,
} from "./core/SaveSystem";


// Managers (refactored)
import { LightingManager } from "./lighting/LightingManager";
import { BuildModeManager } from "./build/BuildModeManager";
import { SelectionManager } from "./build/SelectionManager";
import { MultiplayerManager } from "./network/MultiplayerManager";

/**
 * Game - Main application class
 *
 * Orchestrates all game systems using event-driven architecture.
 * Features an infinitely expanding world based on exploration.
 */
class Game {
  // Three.js core
  private scene: THREE.Scene;
  private camera: THREE.PerspectiveCamera;
  private renderer: THREE.WebGLRenderer;
  private clock: THREE.Clock;

  // Systems
  private sceneConfig: SceneConfig;
  private chunkManager: ChunkManager;
  private inputManager: InputManager;
  private cameraSystem: CameraSystem;
  private playerController: PlayerController;
  private character: Character;
  private placementSystem: PlacementSystem;
  private prefabCaptureSystem: PrefabCaptureSystem | null = null;
  private uiManager: UIManager | null = null;
  private performancePanel: PerformancePanel | null = null;
  private qualityManager: QualityManager;
  private postProcessing: PostProcessing | null = null;
  private waterSystem: WaterSystem | null = null;
  private skySystem: SkySystem | null = null;
  private lights: {
    ambientLight: THREE.AmbientLight;
    hemisphereLight: THREE.HemisphereLight;
    directionalLight: THREE.DirectionalLight;
    fillLight: THREE.DirectionalLight;
  } | null = null;

  // Managers (new refactored modules)
  private lightingManager: LightingManager | null = null;
  private buildModeManager: BuildModeManager | null = null;
  private selectionManager: SelectionManager | null = null;
  private multiplayerManager: MultiplayerManager | null = null;

  // Drag-to-place state for blocks
  private isDraggingToPlace = false;
  private lastPlacedGridX = -Infinity;
  private lastPlacedGridZ = -Infinity;

  // Drag-to-delete state
  private isDraggingToDelete = false;
  private lastDeletedGridX = -Infinity;
  private lastDeletedGridZ = -Infinity;

  // Track if mouse moved (vs just camera rotation)
  private mouseMovedSinceLastUpdate = false;
  private lockedGridX = -Infinity;
  private lockedGridZ = -Infinity;

  // Reusable THREE objects to avoid GC pressure (see r3f pitfalls)
  private readonly _mouse = new THREE.Vector2();
  private readonly _raycaster = new THREE.Raycaster();
  private readonly _groundPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
  private readonly _intersectPoint = new THREE.Vector3();

  constructor() {
    // Initialize Three.js
    this.scene = new THREE.Scene();
    this.camera = this.createCamera();
    this.renderer = this.createRenderer();
    this.clock = new THREE.Clock();

    // Initialize scene configuration (fog, background, etc.)
    this.sceneConfig = new SceneConfig(this.scene, this.renderer);

    // Initialize chunk-based world
    this.chunkManager = new ChunkManager({
      chunkSize: 32,
      cellSize: 1,
      renderDistance: 3,
    });

    const cellSize = this.chunkManager.getCellSize();

    // Start at origin (will generate initial chunks around this position)
    const startX = 8; // Center of first chunk
    const startZ = 8;
    const startPosition = new THREE.Vector3(startX, 0, startZ);

    // Initialize input manager
    this.inputManager = new InputManager({
      domElement: this.renderer.domElement,
      camera: this.camera,
    });

    // Initialize camera system
    this.cameraSystem = new CameraSystem(
      this.camera,
      this.renderer.domElement,
      this.inputManager,
      startPosition
    );

    // Initialize player controller for movement
    this.playerController = new PlayerController({
      inputManager: this.inputManager,
      moveSpeed: 5,
      sprintMultiplier: 2.0,
      gravity: 20,
      jumpForce: 8,
      playerHeight: 2.0,
      maxStepHeight: 1.0,
      cellSize: cellSize,
    });
    this.playerController.setPosition(startX, 0, startZ);

    // Connect collision detection to player controller (grid-based)
    this.playerController.setCollisionChecker((gridX, gridY, gridZ) =>
      this.placementSystem.isCellOccupiedAtHeight(gridX, gridY, gridZ)
    );

    // Initialize character (visual only)
    this.character = new Character(this.scene, startX, startZ, {});

    // Initialize quality manager
    this.qualityManager = new QualityManager();

    // Initialize placement system
    this.placementSystem = new PlacementSystem(this.scene, { cellSize });
    this.placementSystem.setCamera(this.camera);

    // Connect block mesh provider for accurate raycasting on raised blocks
    this.inputManager.setBlockMeshProvider(() =>
      this.placementSystem.getBlockMeshes()
    );

    // Setup event listeners
    this.setupEventListeners();
  }

  private createCamera(): THREE.PerspectiveCamera {
    return new THREE.PerspectiveCamera(
      60,
      window.innerWidth / window.innerHeight,
      0.1,
      1000
    );
  }

  private createRenderer(): THREE.WebGLRenderer {
    const renderer = new THREE.WebGLRenderer({
      antialias: true,
      powerPreference: "high-performance",
    });
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2)); // Cap at 2x for performance
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.0;
    document.body.appendChild(renderer.domElement);
    return renderer;
  }

  private setupEventListeners(): void {
    // Window resize
    window.addEventListener("resize", () => this.onWindowResize());

    // Handle clicks based on current mode
    onEvent("input:click", (data) => this.handleClick(data));
    onEvent("input:rightClick", (data) => this.handleRightClick(data));

    // Handle key events for structure/prefab rotation and level changes
    onEvent("input:keyDown", ({ key }) => {
      if (key === "r") {
        if (stateManager.isPlacing()) {
          this.placementSystem.rotatePreview();
        } else if (this.buildModeManager?.getCurrentPrefab()) {
          this.buildModeManager?.rotatePrefabPreview();
        } else if (this.buildModeManager?.isPasteModeActive()) {
          this.buildModeManager?.rotatePastePreview();
        }
      }

      // V to paste clipboard in build mode
      if (key === "v" && stateManager.getMode() === "build" && hasClipboard()) {
        this.buildModeManager?.enterPasteMode();
      }

      // Handle level changes in build mode
      // Space = level up, Shift = level down (only in build mode)
      if (stateManager.getMode() === "build") {
        if (key === " ") {
          this.buildModeManager?.cycleBuildLevel(1);
        } else if (key === "shift") {
          this.buildModeManager?.cycleBuildLevel(-1);
        }
      }
    });

    // Show/hide level plane when switching modes
    onEvent("state:modeChanged", ({ mode }) => {
      if (mode === "build") {
        // Show level plane in build mode
        this.placementSystem.showLevelPlane();
        this.buildModeManager?.updateBuildModeLevelPlane();
      } else {
        // Hide level plane in move mode (unless placing something)
        if (!stateManager.isPlacing() && !this.buildModeManager?.getCurrentPrefab()) {
          this.placementSystem.hideLevelPlane();
        }
      }
    });

    // Handle structure selection
    onEvent("structure:selected", ({ structureId }) => {
      const structure = getStructure(structureId);
      if (structure) {
        // Cancel any current prefab placement
        this.buildModeManager?.cancelPrefabPlacement();
        // Set the shared build level before starting placement
        const level = this.buildModeManager?.getSharedBuildLevel() ?? 0;
        this.placementSystem.setCurrentLevel(level);
        this.placementSystem.startPlacement(structure);
      }
    });

    // Handle placement cancellation
    onEvent("structure:placementCancelled", () => {
      this.placementSystem.cancelPlacement();
      this.buildModeManager?.cancelPrefabPlacement();
    });

    // Handle prefab selection
    onEvent("prefab:selected", ({ prefabId }) => {
      const prefab = getPrefab(prefabId);
      if (prefab) {
        // Cancel any current structure placement
        this.placementSystem.cancelPlacement();
        this.buildModeManager?.startPrefabPlacement(prefab);
      }
    });

    // Handle prefab placement and paste mode cancellation (Escape key)
    onEvent("prefab:cancelPlacement", () => {
      if (this.buildModeManager?.isPasteModeActive()) {
        this.buildModeManager?.exitPasteMode();
      } else if (this.buildModeManager?.getCurrentPrefab()) {
        this.buildModeManager?.cancelPrefabPlacement();
      } else if (stateManager.getCameraMode() === "build") {
        // Nothing to cancel, exit build mode
        stateManager.exitBuildMode();
      }
    });

    // Sync shared build level when structure placement level changes
    onEvent("structure:levelChanged", ({ level }) => {
      this.buildModeManager?.setSharedBuildLevel(level);
      // Update grayscale effect for blocks below the current level
      if (stateManager.getCameraMode() === "build") {
        this.placementSystem.setGrayscaleBelowLevel(level);
      }
    });

    // Initialize capture system level when entering capture mode
    onEvent("state:prefabCaptureChanged", ({ active }) => {
      if (active) {
        // Exit paste mode when entering selection mode to avoid conflicts
        if (this.buildModeManager?.isPasteModeActive()) {
          this.buildModeManager?.exitPasteMode();
        }
        // Cancel any prefab placement
        if (this.buildModeManager?.getCurrentPrefab()) {
          this.buildModeManager?.cancelPrefabPlacement();
        }
        if (this.prefabCaptureSystem) {
          const level = this.buildModeManager?.getSharedBuildLevel() ?? 0;
          this.prefabCaptureSystem.setLevel(level);
        }
      }
    });

    // Handle world connection (from Join World modal)
    // Reconnect to server with new world ID
    onEvent("world:connected", async ({ worldId }) => {
      console.log(`World selected: ${worldId}, loading from Strapi...`);
      this.updateSaveButtonState();

      // Load blocks and prefabs from Strapi for online mode
      await Promise.all([loadStructuresFromStrapi(), loadPrefabsFromAPI()]);

      // Refresh UI with new blocks/prefabs
      this.uiManager?.refreshBlockMenu();
      this.uiManager?.refreshPrefabMenu();

      // Reconnect with new world ID via MultiplayerManager
      this.multiplayerManager?.reconnect(worldId);
    });

    // Handle world disconnection (user clicked "Leave")
    onEvent("world:disconnected", () => {
      console.log("World deselected, switching to single player...");

      // Disconnect from server (MultiplayerManager handles cleanup)
      this.multiplayerManager?.disconnect();

      // Clear explorer mode temp data (don't keep changes from cloud world)
      clearExplorerSave();

      // Clear the world blocks
      console.log("Clearing all blocks");
      this.placementSystem.clearAll();

      // Load personal local saved game from localStorage
      console.log("Loading personal local world for single player mode");
      this.loadLocalGame();

      console.log("World cleared, now in single player mode");
    });

    // Handle camera mode changes
    onEvent("state:cameraModeChanged", ({ cameraMode, previous }) => {
      // Enable/disable build mode raycasting
      this.inputManager.setBuildModeRaycast(cameraMode === "build");

      // Update character visibility based on camera mode
      if (cameraMode === "first-person" || cameraMode === "build") {
        this.character.setVisible(false);
      } else {
        this.character.setVisible(true);
      }

      // When entering build mode, set build level to player's current Y position
      if (cameraMode === "build" && previous !== "build") {
        const playerPos = this.playerController.getPosition();
        // Set build level to player's current floor level (rounded down)
        const buildLevel = Math.floor(playerPos.y);
        this.buildModeManager?.setSharedBuildLevel(buildLevel);
        this.cameraSystem.setBuildLevel(buildLevel);
        // Also set the build target position to player's XZ position
        this.cameraSystem.setBuildTargetPosition(playerPos.x, playerPos.z);
        // Sync InputManager ground plane
        this.inputManager.setGroundPlaneHeight(buildLevel);
        // Enable wireframe effect for blocks below build level
        this.placementSystem.setGrayscaleBelowLevel(buildLevel);
        // Emit level changed event for UI
        emitEvent("structure:levelChanged", {
          level: buildLevel,
          maxLevel: 50,
        });

        // Force day mode in build mode (save night state to restore later)
        this.lightingManager?.saveNightStateForBuild();
      }

      // When exiting build mode, teleport player to the ghost block position
      if (previous === "build" && cameraMode !== "build") {
        const buildTarget = this.cameraSystem.getBuildTargetPosition();
        const buildLevel = this.buildModeManager?.getSharedBuildLevel() ?? 0;
        // Set player position to the build target (ghost block location)
        // Y is set to the build level (top of where blocks would be placed)
        this.playerController.setPosition(buildTarget.x, buildLevel, buildTarget.z);

        const playerPos = this.playerController.getPosition();
        this.cameraSystem.setPlayerPosition(playerPos);
        // Also update character position to match
        this.character.setPositionFromVector(playerPos);

        // Disable wireframe effect when exiting build mode
        this.placementSystem.setGrayscaleBelowLevel(null);

        // Reset ground plane height to ground level for explore modes
        this.inputManager.setGroundPlaneHeight(0);

        // Restore night mode if it was active before entering build mode
        this.lightingManager?.restoreNightStateAfterBuild();
      }
    });

    // Handle mouse move for placement preview (structures and prefabs)
    this.renderer.domElement.addEventListener("mousemove", (e) => {
      if (stateManager.getCameraMode() !== "build") return;

      // Store screen coordinates for continuous raycast updates during camera movement
      this.lastMouseScreenX = e.clientX;
      this.lastMouseScreenY = e.clientY;

      // Mark that mouse actually moved (not just camera rotation)
      this.mouseMovedSinceLastUpdate = true;

      // Update preview using the shared method
      this.updatePreviewFromScreenPosition();
    });

    // Handle mousedown for drag-to-place (left click) and drag-to-delete (right click)
    this.renderer.domElement.addEventListener("mousedown", (e) => {
      if (stateManager.getCameraMode() !== "build") return;

      if (e.button === 0) {
        // Left click - drag to place
        if (!stateManager.isPlacing()) return;
        if (this.buildModeManager?.getCurrentPrefab()) return; // Don't drag prefabs

        this.isDraggingToPlace = true;
        this.lastPlacedGridX = -Infinity;
        this.lastPlacedGridZ = -Infinity;
      } else if (e.button === 2) {
        // Right click - drag to delete
        this.isDraggingToDelete = true;
        this.lastDeletedGridX = -Infinity;
        this.lastDeletedGridZ = -Infinity;
      }
    });

    // Handle mouseup to stop dragging
    this.renderer.domElement.addEventListener("mouseup", (e) => {
      if (e.button === 0) {
        this.isDraggingToPlace = false;
      } else if (e.button === 2) {
        this.isDraggingToDelete = false;
      }
    });

    // Also stop dragging if mouse leaves the canvas
    this.renderer.domElement.addEventListener("mouseleave", () => {
      this.isDraggingToPlace = false;
      this.isDraggingToDelete = false;
    });

  }

  /**
   * Update preview positions based on screen coordinates
   * This is called both from mousemove and from the game loop to keep preview in sync
   */
  private updatePreviewFromScreenPosition(): void {
    if (stateManager.getCameraMode() !== "build") return;

    // Get build height for visual positioning
    // Use shared level when not actively placing, otherwise use the specific placement level
    const isPlacingStructure = stateManager.isPlacing();
    const isPlacingPrefab = this.buildModeManager?.getCurrentPrefab() !== null;
    let buildHeight: number;
    if (isPlacingPrefab) {
      buildHeight = this.buildModeManager?.getSharedBuildLevel() ?? 0;
    } else if (isPlacingStructure) {
      buildHeight = this.placementSystem.getCurrentBuildLevel();
    } else {
      buildHeight = this.buildModeManager?.getSharedBuildLevel() ?? 0;
    }

    const cellSize = this.chunkManager.getCellSize();
    let gridX: number;
    let gridZ: number;

    // Only recalculate grid position if mouse actually moved
    // This prevents placement from shifting when rotating camera with Q/E
    if (this.mouseMovedSinceLastUpdate || this.lockedGridX === -Infinity) {
      // Reuse objects to avoid GC pressure (r3f pitfall #9)
      this._mouse.set(
        (this.lastMouseScreenX / window.innerWidth) * 2 - 1,
        -(this.lastMouseScreenY / window.innerHeight) * 2 + 1
      );

      this._raycaster.setFromCamera(this._mouse, this.camera);

      // Update ground plane to match current build level
      this._groundPlane.constant = -buildHeight;

      if (this._raycaster.ray.intersectPlane(this._groundPlane, this._intersectPoint)) {
        // Track mouse world position for initial prefab placement
        this.lastMouseWorldX = this._intersectPoint.x;
        this.lastMouseWorldZ = this._intersectPoint.z;

        gridX = Math.floor(this._intersectPoint.x / cellSize);
        gridZ = Math.floor(this._intersectPoint.z / cellSize);

        // Lock the grid position
        this.lockedGridX = gridX;
        this.lockedGridZ = gridZ;
      } else {
        // No intersection, use locked position
        gridX = this.lockedGridX;
        gridZ = this.lockedGridZ;
      }

      // Reset flag after processing
      this.mouseMovedSinceLastUpdate = false;
    } else {
      // Mouse didn't move, use locked grid position
      gridX = this.lockedGridX;
      gridZ = this.lockedGridZ;

      // Update world position to match locked grid (for prefab placement)
      this.lastMouseWorldX = gridX * cellSize + cellSize / 2;
      this.lastMouseWorldZ = gridZ * cellSize + cellSize / 2;
    }

    // Skip if no valid grid position
    if (gridX === -Infinity || gridZ === -Infinity) return;

    const isBuildMode = stateManager.getMode() === "build";

    // Update cursor highlight in build mode
    if (isBuildMode) {
      this.buildModeManager?.updateCursorHighlight(gridX, gridZ, buildHeight);
      this.buildModeManager?.showCursorHighlight();
    } else {
      this.buildModeManager?.hideCursorHighlight();
    }

    if (isPlacingStructure) {
      // Use world position for preview (uses lastMouseWorldX/Z which are updated correctly)
      this.placementSystem.updatePreview(this.lastMouseWorldX, this.lastMouseWorldZ);

      // Drag-to-place: place blocks while dragging
      if (this.isDraggingToPlace) {
        // Only place if we moved to a new cell
        if (gridX !== this.lastPlacedGridX || gridZ !== this.lastPlacedGridZ) {
          const placed = this.placementSystem.confirmPlacement();
          if (placed) {
            // Send to server if multiplayer
            this.sendBlockPlacedToServer(
              placed.gridX,
              placed.gridY,
              placed.gridZ,
              placed.definition.id
            );
            this.lastPlacedGridX = gridX;
            this.lastPlacedGridZ = gridZ;
            this.placementSystem.startPlacement(placed.definition);
          }
        }
      }
    }
    if (isPlacingPrefab) {
      this.buildModeManager?.updatePrefabPreview(this.lastMouseWorldX, this.lastMouseWorldZ);
    }

    // Update paste preview
    if (this.buildModeManager?.isPasteModeActive()) {
      this.buildModeManager?.updatePastePreview(gridX, gridZ);
    }

    // Update prefab capture preview
    if (stateManager.isPrefabCaptureMode() && this.prefabCaptureSystem) {
      // For capture, use Y=0 as base - selection will scan all Y levels
      this.prefabCaptureSystem.updatePreview(gridX, 0, gridZ);
    }

    // Update level plane in build mode when not placing anything
    const sharedLevel = this.buildModeManager?.getSharedBuildLevel() ?? 0;
    if (isBuildMode && !isPlacingStructure && !isPlacingPrefab && !stateManager.isPrefabCaptureMode() && !this.buildModeManager?.isPasteModeActive()) {
      this.placementSystem.updateLevelPlaneAt(gridX, gridZ, sharedLevel);
    }

    // Drag-to-delete: remove blocks while dragging with right mouse
    if (this.isDraggingToDelete && stateManager.getMode() === "build") {
      if (gridX !== this.lastDeletedGridX || gridZ !== this.lastDeletedGridZ) {
        // Remove block only on the current build level
        const blockY = Math.floor(buildHeight);
        const removed = this.placementSystem.removeBlockAt(gridX, blockY, gridZ);
        if (removed) {
          this.sendBlockRemovedToServer(gridX, blockY, gridZ);
        }
        this.lastDeletedGridX = gridX;
        this.lastDeletedGridZ = gridZ;
      }
    }
  }

  private handleClick(_data: { worldX: number; worldY: number; worldZ: number; gridX: number; gridY: number; gridZ: number }): void {
    // Only process clicks in build mode
    if (stateManager.getCameraMode() !== "build") return;

    const mode = stateManager.getMode();

    if (mode === "build") {
      // Check for paste mode first
      if (this.buildModeManager?.isPasteModeActive()) {
        const cellSize = this.chunkManager.getCellSize();
        const gridX = Math.floor(this.lastMouseWorldX / cellSize);
        const gridZ = Math.floor(this.lastMouseWorldZ / cellSize);
        this.buildModeManager?.confirmPaste(gridX, gridZ);
        // Stay in paste mode for multiple pastes - press Escape to exit
        return;
      }

      // Check for prefab capture mode first
      if (stateManager.isPrefabCaptureMode() && this.prefabCaptureSystem) {
        // Use the same grid calculation as mousemove preview for consistency
        // This ensures click matches the visual preview exactly
        const cellSize = this.chunkManager.getCellSize();
        const gridX = Math.floor(this.lastMouseWorldX / cellSize);
        const gridZ = Math.floor(this.lastMouseWorldZ / cellSize);
        const handled = this.prefabCaptureSystem.handleClick(gridX, 0, gridZ);
        if (handled) return;
      }

      // Check for prefab placement
      if (this.buildModeManager?.getCurrentPrefab()) {
        // Use the same grid position as the preview (calculated from ground plane intersection)
        // This ensures placement matches the visual preview exactly
        const cellSize = this.chunkManager.getCellSize();
        const gridX = Math.floor(this.lastMouseWorldX / cellSize);
        const gridZ = Math.floor(this.lastMouseWorldZ / cellSize);
        this.buildModeManager?.confirmPrefabPlacement(gridX, gridZ);
        return;
      }

      // Then check for structure placement
      if (stateManager.isPlacing()) {
        const placed = this.placementSystem.confirmPlacement();
        if (placed) {
          // Send block to server if multiplayer
          this.sendBlockPlacedToServer(
            placed.gridX,
            placed.gridY,
            placed.gridZ,
            placed.definition.id
          );

          // Keep placing - restart with same structure
          this.placementSystem.startPlacement(placed.definition);
        }
      }
    }
    // Note: In move mode, clicking no longer moves the character
    // Movement is now handled via WASD + PlayerController
  }

  /**
   * Send block placement to server (multiplayer)
   */
  private sendBlockPlacedToServer(x: number, y: number, z: number, blockId: string): void {
    this.multiplayerManager?.sendBlockPlaced(x, y, z, blockId);
  }

  /**
   * Send block removal to server (multiplayer)
   */
  private sendBlockRemovedToServer(x: number, y: number, z: number): void {
    this.multiplayerManager?.sendBlockRemoved(x, y, z);
  }

  private handleRightClick(data: { gridX: number; gridY: number; gridZ: number }): void {
    // Only process right clicks in build mode
    if (stateManager.getCameraMode() !== "build") return;

    // Remove block only on the current build level
    const removed = this.placementSystem.removeBlockAt(data.gridX, data.gridY, data.gridZ);
    if (removed) {
      this.sendBlockRemovedToServer(data.gridX, data.gridY, data.gridZ);
      // Track this deletion so drag-to-delete doesn't try to delete the same position
      this.lastDeletedGridX = data.gridX;
      this.lastDeletedGridZ = data.gridZ;
    }
  }

  private onWindowResize(): void {
    this.camera.aspect = window.innerWidth / window.innerHeight;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.postProcessing?.onResize(window.innerWidth, window.innerHeight);
  }

  // Expose scene config for runtime customization
  getSceneConfig(): SceneConfig {
    return this.sceneConfig;
  }

  // ============================================
  // BUILD MODE STATE
  // ============================================

  // Track last mouse position for prefab initial placement
  private lastMouseWorldX = 0;
  private lastMouseWorldZ = 0;

  // Track last mouse screen coordinates for continuous raycast updates
  private lastMouseScreenX = 0;
  private lastMouseScreenY = 0;

  // Prefab placement, paste mode, and cursor highlight are now handled by BuildModeManager

  /**
   * Initialize the refactored manager modules
   */
  private initializeManagers(): void {
    // Initialize LightingManager
    this.lightingManager = new LightingManager({
      scene: this.scene,
      camera: this.camera,
      renderer: this.renderer,
      sceneConfig: this.sceneConfig,
    });
    // Note: LightingManager.createLighting() is called later, using existing lights for now

    // Initialize BuildModeManager
    this.buildModeManager = new BuildModeManager({
      scene: this.scene,
      placementSystem: this.placementSystem,
      chunkManager: this.chunkManager,
      cameraSystem: this.cameraSystem,
      inputManager: this.inputManager,
    });
    this.buildModeManager.setCallbacks({
      onBlockPlaced: (x, y, z, blockId) => this.multiplayerManager?.sendBlockPlaced(x, y, z, blockId),
    });

    // Initialize SelectionManager
    this.selectionManager = new SelectionManager({
      placementSystem: this.placementSystem,
    });
    this.selectionManager.setCallbacks({
      onBlockRemoved: (x, y, z) => this.multiplayerManager?.sendBlockRemoved(x, y, z),
      onEnterPasteMode: () => this.buildModeManager?.enterPasteMode(),
    });

    // Initialize MultiplayerManager
    this.multiplayerManager = new MultiplayerManager({
      scene: this.scene,
      placementSystem: this.placementSystem,
      playerController: this.playerController,
      cameraSystem: this.cameraSystem,
      character: this.character,
      inputManager: this.inputManager,
    });
    this.multiplayerManager.setCallbacks({
      onLoadSavedGame: () => this.loadSavedGame(),
      onUpdateSaveButtonState: () => this.updateSaveButtonState(),
    });
  }

  /**
   * Complete manager setup after all systems are initialized
   */
  private completeManagerSetup(): void {
    // Wire up prefab capture system to managers
    if (this.prefabCaptureSystem) {
      this.buildModeManager?.setPrefabCaptureSystem(this.prefabCaptureSystem);
      this.selectionManager?.setPrefabCaptureSystem(this.prefabCaptureSystem);
    }

    // Wire up lighting manager with optional systems
    this.lightingManager?.setSystems({
      postProcessing: this.postProcessing,
      waterSystem: this.waterSystem,
      skySystem: this.skySystem,
      character: this.character,
      performancePanel: this.performancePanel,
    });

    // Wire up multiplayer manager with UI
    this.multiplayerManager?.setUIManager(this.uiManager);
  }

  async initialize(): Promise<void> {
    // Add chunk manager's group to scene
    this.scene.add(this.chunkManager.getGroup());

    // Generate initial chunks around starting position
    this.chunkManager.updateForPosition(8, 8);

    // Setup enhanced lighting for better visuals (pass renderer for environment map)
    this.lights = createEnhancedLighting(this.scene, this.renderer);

    // Initialize water system - water world at level 0.5 (half block high)
    // Green Matrix-style water
    this.waterSystem = new WaterSystem(this.scene, {
      size: 1000,
      waterLevel: 0.5,
      waterColor: 0x003300, // Dark green for Matrix look
      sunColor: 0x00ff00, // Green sun reflections
      distortionScale: 4.0,
      alpha: 0.8,
    });

    // Sync water sun direction with main directional light
    this.waterSystem.setSunDirection(this.lights.directionalLight.position);

    // Initialize sky system
    this.skySystem = new SkySystem(this.scene, {
      zenithColor: 0x0077be,
      horizonColor: 0x87ceeb,
      cloudColor: 0xffffff,
      cloudOpacity: 0.8,
      cloudSpeed: 0.02,
      cloudDensity: 0.5,
      sunColor: 0xffffee,
      sunIntensity: 1.0,
    });

    // Sync sky sun direction with main directional light
    this.skySystem.setSunDirection(this.lights.directionalLight.position);

    // Initialize post-processing with green LUT color grading
    this.postProcessing = new PostProcessing(
      this.renderer,
      this.scene,
      this.camera,
      {
        bloom: {
          enabled: true,
          strength: 0.35,
          radius: 0.4,
          threshold: 0.85,
        },
        toneMapping: {
          enabled: true,
          exposure: 1.0,
          type: THREE.ACESFilmicToneMapping,
        },
        colorGrade: {
          enabled: true,
          greenTint: 0.4,
          contrast: 1.08,
          saturation: 0.95,
        },
      }
    );

    // Initialize managers (new refactored modules)
    this.initializeManagers();

    // Initialize prefab capture system
    this.prefabCaptureSystem = new PrefabCaptureSystem(
      this.scene,
      this.chunkManager.getCellSize(),
      this.placementSystem.getOccupiedCells(),
      (x, y, z) => this.placementSystem.getBlockIdAt(x, y, z)
    );

    // Connect capture system level changes to plane/camera updates
    this.prefabCaptureSystem.setOnLevelChanged((level: number) => {
      this.buildModeManager?.setSharedBuildLevel(level);
      this.inputManager.setGroundPlaneHeight(level);
      this.cameraSystem.setBuildLevel(level);
      // Update level plane
      const cellSize = this.chunkManager.getCellSize();
      const lastMousePos = this.buildModeManager?.getLastMouseWorldPosition() ?? { x: 0, z: 0 };
      const gridX = Math.floor(lastMousePos.x / cellSize);
      const gridZ = Math.floor(lastMousePos.z / cellSize);
      this.placementSystem.updateLevelPlaneAt(gridX, gridZ, level);
    });

    // Connect capture system to get block materials for copy/paste
    this.prefabCaptureSystem.setBlockMaterialGetter((x, y, z) => {
      const blockInfo = this.placementSystem.getBlockAt(x, y, z);
      return blockInfo?.material || null;
    });

    // Setup save/load buttons first (before UI manager which may trigger world:connected)
    this.setupSaveControls();

    // Initialize UI and connect block getter
    // UIManager will check for saved world ID and emit world:connected if valid
    this.uiManager = new UIManager();
    this.uiManager.setBlockGetter(() => this.prefabCaptureSystem?.getSelectedBlocks() || []);

    // Connect first block material getter for pre-filling the selection editor
    this.uiManager.setFirstBlockMaterialGetter(() => {
      const firstBlockId = this.prefabCaptureSystem?.getFirstBlockId();
      if (!firstBlockId) return null;

      // Get the selection bounds to find the first block's position
      const bounds = this.prefabCaptureSystem?.getSelectionBounds();
      if (!bounds) return null;

      // Find the first block with this ID in the selection
      for (let y = bounds.minY; y <= bounds.maxY; y++) {
        for (let x = bounds.minX; x <= bounds.maxX; x++) {
          for (let z = bounds.minZ; z <= bounds.maxZ; z++) {
            const blockInfo = this.placementSystem.getBlockAt(x, y, z);
            if (blockInfo) {
              return blockInfo;
            }
          }
        }
      }
      return null;
    });

    // Initialize performance panel
    this.performancePanel = new PerformancePanel();
    this.performancePanel.setStatsProvider(() => this.placementSystem.getRenderingStats());
    this.performancePanel.setBenchmarkRunner(async () => {
      const settings = await this.qualityManager.runQuickBenchmark(this.renderer);
      return {
        fps: this.qualityManager.getLastBenchmarkFPS(),
        qualityLevel: settings.level,
        gpuInfo: this.qualityManager.getGPUInfo(),
      };
    });
    this.performancePanel.setQualityChangeHandler((level) => {
      // Apply quality settings using the unified quality level API
      this.placementSystem.setQualityLevel(level);

      // Update greedy mesh toggle UI to match quality preset
      // (user can still manually override after)
      const greedyEnabled = this.placementSystem.isGreedyMeshingEnabled();
      this.performancePanel?.setGreedyState(greedyEnabled);

      // Adjust post-processing based on quality
      if (this.postProcessing) {
        switch (level) {
          case "low":
            // Minimal effects for low quality
            this.postProcessing.setBloomEnabled(false);
            this.postProcessing.setColorGradeEnabled(false);
            this.renderer.toneMapping = THREE.NoToneMapping;
            break;
          case "medium":
            // Reduced effects for medium quality
            this.postProcessing.setBloomEnabled(true);
            this.postProcessing.setBloomStrength(0.25);
            this.postProcessing.setColorGradeEnabled(true);
            this.postProcessing.setGreenTint(0.3);
            this.renderer.toneMapping = THREE.LinearToneMapping;
            break;
          case "high":
            // Full color grading for high quality
            this.postProcessing.setBloomEnabled(true);
            this.postProcessing.setBloomStrength(0.35);
            this.postProcessing.setColorGradeEnabled(true);
            this.postProcessing.setGreenTint(0.4);
            this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
            break;
        }
      }

      // Also update chunk manager settings based on quality
      switch (level) {
        case "low":
          this.chunkManager.setRenderDistance(2);
          this.chunkManager.setGridVisible(false);
          break;
        case "medium":
          this.chunkManager.setRenderDistance(3);
          this.chunkManager.setGridVisible(true);
          break;
        case "high":
          this.chunkManager.setRenderDistance(4);
          this.chunkManager.setGridVisible(true);
          break;
      }
    });

    // Set preset change handler for visual themes
    this.performancePanel.setPresetChangeHandler((preset: VisualPreset) => {
      this.lightingManager?.applyVisualPreset(preset);
      // Update retro toggle state based on preset
      if (this.performancePanel) {
        const presetConfig = getPreset(preset);
        this.performancePanel.setRetroState(presetConfig.retro.enabled);
      }
    });

    // Set brightness change handler
    this.performancePanel.setBrightnessChangeHandler((brightness: number) => {
      this.lightingManager?.setGlobalBrightness(brightness);
    });

    // Set retro toggle handler
    this.performancePanel.setRetroToggleHandler((enabled: boolean) => {
      if (this.postProcessing) {
        this.postProcessing.setRetroEnabled(enabled);
      }
    });

    // Set post-processing toggle handler
    this.performancePanel.setPostFxToggleHandler((enabled: boolean) => {
      if (this.postProcessing) {
        this.postProcessing.setEnabled(enabled);
      }
    });

    // Set sky toggle handler
    this.performancePanel.setSkyToggleHandler((enabled: boolean) => {
      if (this.skySystem) {
        this.skySystem.setVisible(enabled);
      }
    });

    // Set water toggle handler
    this.performancePanel.setWaterToggleHandler((enabled: boolean) => {
      if (this.waterSystem) {
        this.waterSystem.setVisible(enabled);
      }
    });

    // Set greedy mesh toggle handler
    this.performancePanel.setGreedyToggleHandler((enabled: boolean) => {
      this.placementSystem.setGreedyMeshing(enabled);
      console.log(`Greedy meshing ${enabled ? "enabled" : "disabled"}`);
    });

    // Set day/night toggle handler
    this.performancePanel.setDayNightToggleHandler((isNight: boolean) => {
      this.lightingManager?.setNightMode(isNight);
    });

    // Set selection action callbacks (using SelectionManager)
    this.uiManager.setSelectionCallbacks({
      onCut: () => this.selectionManager?.handleCut(),
      onCopy: () => this.selectionManager?.handleCopy(),
      onDelete: () => this.selectionManager?.handleDelete(),
    });

    // Handle selection material changes (using SelectionManager)
    onEvent("selection:applyMaterial", ({ material }) => {
      this.selectionManager?.handleApplyMaterial(material);
    });

    // Apply initial quality settings (default is "high" with greedy meshing enabled)
    this.placementSystem.setQualityLevel("high");

    // Complete manager setup now that all systems are initialized
    this.completeManagerSetup();

    // Initialize multiplayer first - if server connects, it will provide world state
    // and we skip local loading to avoid sync issues
    this.multiplayerManager?.initialize();
  }

  // Networking is now handled by MultiplayerManager

  private setupSaveControls(): void {
    const saveBtn = document.getElementById("save-btn");
    const resetBtn = document.getElementById("reset-btn");
    const clearLocalBtn = document.getElementById("clear-local-btn");

    saveBtn?.addEventListener("click", () => {
      this.saveCurrentGame();
    });

    resetBtn?.addEventListener("click", () => {
      if (confirm("Are you sure you want to reset? This will delete all placed blocks.")) {
        this.resetGame();
      }
    });

    clearLocalBtn?.addEventListener("click", () => {
      if (confirm("Clear locally saved data? This cannot be undone.")) {
        deleteSave();
        this.placementSystem.clearAll();
        this.uiManager?.showMessage("Local save data cleared", 2000);
        this.updateSaveButtonState();
      }
    });

    // Update button state based on save existence
    this.updateSaveButtonState();
  }

  private async saveCurrentGame(): Promise<void> {
    const blocks = this.placementSystem.exportBlocks() as SavedBlock[];
    const connectionMode = stateManager.getConnectionMode();
    const isMultiplayer = this.multiplayerManager?.isInMultiplayerMode() ?? false;
    console.log(`Saving ${blocks.length} blocks, mode=${connectionMode}, isMultiplayer=${isMultiplayer}`);

    if (connectionMode === "online" && isMultiplayer) {
      // Online mode: request server to save to Strapi
      console.log("Requesting server to save...");
      this.uiManager?.showMessage("Saving to cloud...", 1000);
      this.multiplayerManager?.sendWorldSave();
      return;
    }

    if (connectionMode === "dev") {
      // Dev mode: save directly to Strapi (no game server needed)
      console.log("Dev mode, saving directly to Strapi");
      this.uiManager?.showMessage("Saving to Strapi...", 1000);
      const success = await saveToStrapi(blocks);
      if (success) {
        this.uiManager?.showMessage(`Saved ${blocks.length} blocks to Strapi`, 2000);
      } else {
        this.uiManager?.showMessage("Failed to save to Strapi", 2000);
      }
      return;
    }

    if (connectionMode === "explorer") {
      // Explorer mode: save to temp localStorage (will be wiped on leave)
      console.log("Explorer mode, saving to temp storage");
      const success = saveExplorerGame(blocks);
      if (success) {
        this.uiManager?.showMessage(`Saved ${blocks.length} blocks (temporary)`, 2000);
      } else {
        this.uiManager?.showMessage("Failed to save", 2000);
      }
      return;
    }

    // Single player mode: save to personal localStorage
    console.log("Single player mode, saving to localStorage");
    const success = saveGame(blocks);
    if (success) {
      this.uiManager?.showMessage(`Saved ${blocks.length} blocks locally`, 2000);
    } else {
      this.uiManager?.showMessage("Failed to save", 2000);
    }
  }

  private async loadSavedGame(): Promise<void> {
    // When connected to multiplayer, server sends world state via onWorldState callback
    // For explorer mode (has world ID but no server), try to load from Strapi first
    const worldId = getWorldId();

    if (worldId) {
      // Has a world ID - try to load from Strapi (explorer mode)
      console.log(`Explorer mode with world ID ${worldId} - loading from Strapi...`);
      const saveData = await loadFromStrapi();
      if (saveData && saveData.blocks.length > 0) {
        // Clear existing blocks before loading cloud world
        this.placementSystem.clearAll();

        const count = this.placementSystem.importBlocks(saveData.blocks);
        console.log(`Loaded ${count} blocks from Strapi`);

        // Save initial copy to explorer temp storage
        saveExplorerGame(saveData.blocks);

        this.uiManager?.showMessage(`Explorer Mode: Loaded ${count} blocks from cloud`, 3000);
        this.updateSaveButtonState();
        return;
      }
    }

    // No world ID or Strapi load failed - load from localStorage
    this.loadLocalGame();
  }

  /**
   * Load game from localStorage only (used for single player mode)
   */
  private loadLocalGame(): void {
    if (hasSave()) {
      const saveData = loadGame();
      if (saveData && saveData.blocks.length > 0) {
        const count = this.placementSystem.importBlocks(saveData.blocks);
        console.log(`Loaded ${count} blocks from localStorage`);
        this.uiManager?.showMessage(`Loaded ${count} blocks from local storage`, 3000);
      } else {
        this.uiManager?.showMessage("Single player: No saved data", 2000);
      }
    } else {
      this.uiManager?.showMessage("Single player: No saved data", 2000);
    }
    this.updateSaveButtonState();
  }

  private async resetGame(): Promise<void> {
    // Clear all placed blocks
    this.placementSystem.clearAll();

    // Only clear localStorage (Strapi world is not deleted)
    deleteSave();

    // If multiplayer, tell server to reset too
    this.multiplayerManager?.sendWorldReset();

    this.uiManager?.showMessage("World reset", 2000);
    this.updateSaveButtonState();
  }

  private updateSaveButtonState(): void {
    const saveBtn = document.getElementById("save-btn");
    const clearLocalBtn = document.getElementById("clear-local-btn");
    const isMultiplayer = this.multiplayerManager?.isInMultiplayerMode() ?? false;

    if (saveBtn) {
      // Update button text to show connection status (cloud if multiplayer, local if offline)
      const icon = isMultiplayer ? "☁️" : "💾";
      saveBtn.textContent = `${icon} Save`;

      if (hasSave()) {
        saveBtn.classList.add("saved");
      } else {
        saveBtn.classList.remove("saved");
      }
    }

    // Hide clear local button when online
    if (clearLocalBtn) {
      clearLocalBtn.style.display = isMultiplayer ? "none" : "block";
    }
  }

  run(): void {
    this.gameLoop();
  }

  private gameLoop = (): void => {
    requestAnimationFrame(this.gameLoop);

    const deltaTime = this.clock.getDelta();
    const cameraMode = stateManager.getCameraMode();

    // Update based on camera mode
    if (cameraMode === "build") {
      // Build mode: camera moves independently, player stays put
      // Update build level for camera
      const buildLevel = this.buildModeManager?.getCurrentPrefab()
        ? this.buildModeManager?.getSharedBuildLevel() ?? 0
        : stateManager.isPlacing()
          ? this.placementSystem.getCurrentBuildLevel()
          : this.buildModeManager?.getSharedBuildLevel() ?? 0;
      this.cameraSystem.setBuildLevel(buildLevel);
      this.cameraSystem.update(deltaTime);
    } else {
      // First-person or third-person: player controller handles movement
      // Get camera yaw for movement direction
      const cameraYaw = this.cameraSystem.getYaw();

      // Update player controller
      this.playerController.update(deltaTime, cameraYaw);

      // Get player position
      const playerPos = this.playerController.getPosition();

      // Update character visual
      this.character.setPositionFromVector(playerPos);
      this.character.setRotation(this.playerController.getRotation());

      // Update night mode particles (handled by LightingManager)
      this.lightingManager?.updateNightParticles(deltaTime, cameraMode);

      // Update camera to follow player
      this.cameraSystem.setPlayerPosition(playerPos);
      this.cameraSystem.update(deltaTime);

      // Send inputs to server for multiplayer
      this.multiplayerManager?.sendInputsToServer();
    }

    // Update remote players (interpolation)
    this.multiplayerManager?.updateRemotePlayers(deltaTime);

    // Update water animation
    this.waterSystem?.update(deltaTime);

    // Update sky animation (clouds)
    this.skySystem?.update(deltaTime);

    // Update chunks based on camera position (generates new chunks as you explore)
    const cameraPos = this.cameraSystem.getPosition();
    this.chunkManager.updateForPosition(cameraPos.x, cameraPos.z);

    // Update hover mode indicator
    const hoverIndicator = document.getElementById("hover-indicator");
    if (hoverIndicator) {
      if (this.playerController.isHoverMode()) {
        hoverIndicator.classList.add("visible");
      } else {
        hoverIndicator.classList.remove("visible");
      }
    }

    // Update preview position continuously to keep it in sync with camera movement
    // This ensures the ghost preview stays under the mouse cursor even when WASD moves the camera
    if (cameraMode === "build") {
      this.updatePreviewFromScreenPosition();
    }

    // Update frustum culling for performance (only render visible blocks)
    this.placementSystem.updateFrustumCulling();

    // Update greedy mesh LOD if enabled
    this.placementSystem.updateGreedyMeshLOD();

    // Track FPS for performance panel
    this.performancePanel?.tick();

    // Render with post-processing
    if (this.postProcessing) {
      this.postProcessing.render();
    } else {
      this.renderer.render(this.scene, this.camera);
    }
  };
}

// Bootstrap - load data and start game
async function bootstrap(): Promise<void> {
  const worldId = getWorldId();

  if (worldId) {
    // Has world ID - load blocks and prefabs from Strapi
    // Connection mode (online vs explorer) will be determined when NetworkManager connects/fails
    console.log("World ID found: Loading blocks and prefabs from Strapi...");
    await Promise.all([loadStructuresFromStrapi(), loadPrefabsFromAPI()]);
  } else {
    // Single player mode: Use local defaults
    console.log("Single player mode: Using local block and prefab defaults");
    stateManager.setConnectionMode("single-player");
    rebuildStructuresFromDefaults();
    rebuildPrefabsFromDefaults();
  }

  const game = new Game();
  await game.initialize();
  game.run();
}

bootstrap();

