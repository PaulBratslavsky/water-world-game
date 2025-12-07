import * as THREE from "three";

// Core systems
import { onEvent, emitEvent } from "./core/EventBus";
import { InputManager } from "./core/InputManager";
import { stateManager } from "./core/StateManager";
import { PlayerController } from "./core/PlayerController";
import { PlayerState } from "./core/PlayerState";

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
  PrefabDefinition,
} from "./structures/PrefabDefinition";
import { PrefabCaptureSystem, getClipboard, hasClipboard } from "./structures/PrefabCaptureSystem";

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

// Networking
import { NetworkManager } from "./network/NetworkManager";
import { RemotePlayer } from "./entities/RemotePlayer";
import { NetworkBlock, NetworkPlayer } from "./network/NetworkProtocol";

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

  // Prefab placement state
  private currentPrefab: PrefabDefinition | null = null;
  private prefabPreview: THREE.Group | null = null;
  private prefabBuildLevel = 0; // Build level for prefabs
  private prefabRotation = 0; // 0, 1, 2, 3 = 0°, 90°, 180°, 270°

  // Paste mode state (similar to prefab placement)
  private isPasteMode = false;
  private pastePreview: THREE.Group | null = null;

  // Drag-to-place state for blocks
  private isDraggingToPlace = false;
  private lastPlacedGridX = -Infinity;
  private lastPlacedGridZ = -Infinity;

  // Drag-to-delete state
  private isDraggingToDelete = false;
  private lastDeletedGridX = -Infinity;
  private lastDeletedGridZ = -Infinity;

  // Cursor highlight
  private cursorHighlight: THREE.Group | null = null;
  private lastHighlightGridX = -Infinity;
  private lastHighlightGridZ = -Infinity;

  // Track if mouse moved (vs just camera rotation)
  private mouseMovedSinceLastUpdate = false;
  private lockedGridX = -Infinity;
  private lockedGridZ = -Infinity;

  // Networking
  private networkManager: NetworkManager | null = null;
  private remotePlayers: Map<string, RemotePlayer> = new Map();
  private localPlayerId: string | null = null;
  private isMultiplayer = false;
  private intentionalDisconnect = false;

  // Day/Night mode tracking
  private isNightMode = false;
  private currentVisualPreset: VisualPreset = "default";
  private firstPersonLight: THREE.SpotLight | null = null;
  private firstPersonAmbient: THREE.PointLight | null = null;

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
        } else if (this.currentPrefab) {
          this.rotatePrefabPreview();
        }
      }

      // V to paste clipboard in build mode
      if (key === "v" && stateManager.getMode() === "build" && hasClipboard()) {
        this.handlePaste();
      }

      // Handle level changes in build mode
      // Space = level up, Shift = level down (only in build mode)
      if (stateManager.getMode() === "build") {
        if (key === " ") {
          this.cycleBuildLevel(1);
        } else if (key === "shift") {
          this.cycleBuildLevel(-1);
        }
      }
    });

    // Show/hide level plane when switching modes
    onEvent("state:modeChanged", ({ mode }) => {
      if (mode === "build") {
        // Show level plane in build mode
        this.placementSystem.showLevelPlane();
        this.updateBuildModeLevelPlane();
      } else {
        // Hide level plane in move mode (unless placing something)
        if (!stateManager.isPlacing() && !this.currentPrefab) {
          this.placementSystem.hideLevelPlane();
        }
      }
    });

    // Enable/disable build mode raycasting based on camera mode
    onEvent("state:cameraModeChanged", ({ cameraMode }) => {
      // In build mode, only raycast against the level plane (not blocks)
      this.inputManager.setBuildModeRaycast(cameraMode === "build");

      // Sync InputManager ground plane height when entering build mode
      if (cameraMode === "build") {
        this.inputManager.setGroundPlaneHeight(this.sharedBuildLevel);
      } else {
        // Reset to ground level for explore modes
        this.inputManager.setGroundPlaneHeight(0);
      }
    });

    // Handle structure selection
    onEvent("structure:selected", ({ structureId }) => {
      const structure = getStructure(structureId);
      if (structure) {
        // Cancel any current prefab placement
        this.cancelPrefabPlacement();
        // Set the shared build level before starting placement
        this.placementSystem.setCurrentLevel(this.sharedBuildLevel);
        this.placementSystem.startPlacement(structure);
      }
    });

    // Handle placement cancellation
    onEvent("structure:placementCancelled", () => {
      this.placementSystem.cancelPlacement();
      this.cancelPrefabPlacement();
    });

    // Handle prefab selection
    onEvent("prefab:selected", ({ prefabId }) => {
      const prefab = getPrefab(prefabId);
      if (prefab) {
        // Cancel any current structure placement
        this.placementSystem.cancelPlacement();
        this.startPrefabPlacement(prefab);
      }
    });

    // Handle prefab placement and paste mode cancellation (Escape key)
    onEvent("prefab:cancelPlacement", () => {
      if (this.isPasteMode) {
        this.exitPasteMode();
      } else if (this.currentPrefab) {
        this.cancelPrefabPlacement();
      } else if (stateManager.getCameraMode() === "build") {
        // Nothing to cancel, exit build mode
        stateManager.exitBuildMode();
      }
    });

    // Sync shared build level when structure placement level changes
    onEvent("structure:levelChanged", ({ level }) => {
      this.sharedBuildLevel = level;
      // Update grayscale effect for blocks below the current level
      if (stateManager.getCameraMode() === "build") {
        this.placementSystem.setGrayscaleBelowLevel(level);
      }
    });

    // Initialize capture system level when entering capture mode
    onEvent("state:prefabCaptureChanged", ({ active }) => {
      if (active && this.prefabCaptureSystem) {
        this.prefabCaptureSystem.setLevel(this.sharedBuildLevel);
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

      // Disconnect and reconnect with new world ID
      if (this.networkManager) {
        this.networkManager.disconnect();
      }
      this.initializeNetworking();
    });

    // Handle world disconnection (user clicked "Leave")
    onEvent("world:disconnected", () => {
      console.log("World deselected, switching to single player...");

      // Mark as intentional so onDisconnected knows not to enter explorer mode
      this.intentionalDisconnect = true;

      // Disconnect from server when leaving world
      if (this.networkManager) {
        console.log("Disconnecting from server");
        this.networkManager.disconnect();
        this.isMultiplayer = false;
      }

      // Clear explorer mode temp data (don't keep changes from cloud world)
      clearExplorerSave();

      // Switch to single player mode
      stateManager.setConnectionMode("single-player");

      // Clear the world blocks
      console.log("Clearing all blocks");
      this.placementSystem.clearAll();

      // Remove all remote players
      console.log(`Removing ${this.remotePlayers.size} remote players`);
      for (const [, remotePlayer] of this.remotePlayers) {
        remotePlayer.dispose(this.scene);
      }
      this.remotePlayers.clear();

      // Load personal local saved game from localStorage
      console.log("Loading personal local world for single player mode");
      this.loadLocalGame();

      console.log("World cleared, now in single player mode");
    });

    // Handle camera mode changes
    onEvent("state:cameraModeChanged", ({ cameraMode, previous }) => {
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
        this.sharedBuildLevel = Math.floor(playerPos.y);
        this.cameraSystem.setBuildLevel(this.sharedBuildLevel);
        // Also set the build target position to player's XZ position
        this.cameraSystem.setBuildTargetPosition(playerPos.x, playerPos.z);
        // Sync InputManager ground plane
        this.inputManager.setGroundPlaneHeight(this.sharedBuildLevel);
        // Enable grayscale effect for blocks below build level
        this.placementSystem.setGrayscaleBelowLevel(this.sharedBuildLevel);
        // Emit level changed event for UI
        emitEvent("structure:levelChanged", {
          level: this.sharedBuildLevel,
          maxLevel: 50,
        });
      }

      // When exiting build mode, teleport player to the ghost block position
      if (previous === "build" && cameraMode !== "build") {
        const buildTarget = this.cameraSystem.getBuildTargetPosition();
        // Set player position to the build target (ghost block location)
        // Y is set to the build level (top of where blocks would be placed)
        this.playerController.setPosition(buildTarget.x, this.sharedBuildLevel, buildTarget.z);

        const playerPos = this.playerController.getPosition();
        this.cameraSystem.setPlayerPosition(playerPos);
        // Also update character position to match
        this.character.setPositionFromVector(playerPos);

        // Disable grayscale effect when exiting build mode
        this.placementSystem.setGrayscaleBelowLevel(null);
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
        if (this.currentPrefab) return; // Don't drag prefabs

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
    const isPlacingPrefab = this.currentPrefab !== null;
    let buildHeight: number;
    if (isPlacingPrefab) {
      buildHeight = this.prefabBuildLevel;
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
      this.updateCursorHighlight(gridX, gridZ, buildHeight);
      this.showCursorHighlight();
    } else {
      this.hideCursorHighlight();
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
      this.updatePrefabPreview(this.lastMouseWorldX, this.lastMouseWorldZ);
    }

    // Update paste preview
    if (this.isPasteMode) {
      this.updatePastePreview(gridX, gridZ);
    }

    // Update prefab capture preview
    if (stateManager.isPrefabCaptureMode() && this.prefabCaptureSystem) {
      // For capture, use Y=0 as base - selection will scan all Y levels
      this.prefabCaptureSystem.updatePreview(gridX, 0, gridZ);
    }

    // Update level plane in build mode when not placing anything
    if (isBuildMode && !isPlacingStructure && !isPlacingPrefab && !stateManager.isPrefabCaptureMode() && !this.isPasteMode) {
      this.placementSystem.updateLevelPlaneAt(gridX, gridZ, this.sharedBuildLevel);
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
      if (this.isPasteMode) {
        const cellSize = this.chunkManager.getCellSize();
        const gridX = Math.floor(this.lastMouseWorldX / cellSize);
        const gridZ = Math.floor(this.lastMouseWorldZ / cellSize);
        this.confirmPaste(gridX, gridZ);
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
      if (this.currentPrefab) {
        // Use the same grid position as the preview (calculated from ground plane intersection)
        // This ensures placement matches the visual preview exactly
        const cellSize = this.chunkManager.getCellSize();
        const gridX = Math.floor(this.lastMouseWorldX / cellSize);
        const gridZ = Math.floor(this.lastMouseWorldZ / cellSize);
        this.confirmPrefabPlacement(gridX, gridZ);
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
    if (this.isMultiplayer && this.networkManager) {
      this.networkManager.sendBlockPlaced({
        x,
        y,
        z,
        structureId: blockId,
        rotation: 0,
      });
    }
  }

  /**
   * Send block removal to server (multiplayer)
   */
  private sendBlockRemovedToServer(x: number, y: number, z: number): void {
    if (this.isMultiplayer && this.networkManager) {
      this.networkManager.sendBlockRemoved(x, y, z);
    }
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

  // Cycle build level when in build mode (works even when not placing anything)
  private cycleBuildLevel(direction: number): void {
    let newLevel: number;

    // If placing a structure, use placement system's level cycling
    if (stateManager.isPlacing()) {
      this.placementSystem.cycleLevel(direction);
      newLevel = this.placementSystem.getCurrentBuildLevel();
      // Sync InputManager ground plane for click events
      this.inputManager.setGroundPlaneHeight(newLevel);
      // Update camera to follow the new level
      this.cameraSystem.setBuildLevel(newLevel);
      return;
    }

    // If placing a prefab, use prefab level cycling
    if (this.currentPrefab) {
      this.cyclePrefabLevel(direction);
      newLevel = this.prefabBuildLevel;
      // Sync InputManager ground plane for click events
      this.inputManager.setGroundPlaneHeight(newLevel);
      // Update camera to follow the new level
      this.cameraSystem.setBuildLevel(newLevel);
      return;
    }

    // If in prefab capture mode, update capture system
    // The callback (setOnLevelChanged) handles plane/camera updates
    if (stateManager.isPrefabCaptureMode() && this.prefabCaptureSystem) {
      this.prefabCaptureSystem.adjustLevel(direction);
      return;
    }

    // Otherwise, just update the shared level and show the plane
    const maxLevel = 50;
    if (direction > 0) {
      this.sharedBuildLevel = Math.min(maxLevel, this.sharedBuildLevel + 1);
    } else {
      this.sharedBuildLevel = Math.max(0, this.sharedBuildLevel - 1);
    }
    newLevel = this.sharedBuildLevel;

    // Sync InputManager ground plane for click events
    this.inputManager.setGroundPlaneHeight(newLevel);

    // Update camera to follow the new level
    this.cameraSystem.setBuildLevel(newLevel);

    // Update the level plane position
    this.updateBuildModeLevelPlane();

    // Update cursor highlight to new level
    const cellSize = this.chunkManager.getCellSize();
    const gridX = Math.floor(this.lastMouseWorldX / cellSize);
    const gridZ = Math.floor(this.lastMouseWorldZ / cellSize);
    this.updateCursorHighlight(gridX, gridZ, newLevel);

    // Emit level changed event for UI feedback
    emitEvent("structure:levelChanged", {
      level: newLevel,
      maxLevel: maxLevel,
    });
  }

  // Update level plane position when in build mode without active placement
  private updateBuildModeLevelPlane(): void {
    if (stateManager.getMode() !== "build") return;
    if (stateManager.isPlacing() || this.currentPrefab) return;

    const cellSize = this.chunkManager.getCellSize();
    const gridX = Math.floor(this.lastMouseWorldX / cellSize);
    const gridZ = Math.floor(this.lastMouseWorldZ / cellSize);

    this.placementSystem.updateLevelPlaneAt(gridX, gridZ, this.sharedBuildLevel);
  }

  // Expose scene config for runtime customization
  getSceneConfig(): SceneConfig {
    return this.sceneConfig;
  }

  /**
   * Apply a visual preset (theme) to the entire scene
   */
  private applyVisualPreset(presetName: VisualPreset): void {
    const preset = getPreset(presetName);
    this.currentVisualPreset = presetName;

    // If in night mode, apply night settings instead
    if (this.isNightMode) {
      this.applyNightModeFromPreset(preset);
      return;
    }

    // Update scene config (background, fog)
    this.sceneConfig.applySettings({
      backgroundColor: preset.scene.backgroundColor,
      fog: {
        enabled: true,
        color: preset.scene.fogColor,
        near: preset.scene.fogNear,
        far: preset.scene.fogFar,
      },
    });

    // Update lighting
    if (this.lights) {
      // Clear cached base intensities so brightness slider recalculates
      (this.lights as any)._baseIntensities = null;

      this.lights.ambientLight.color.setHex(preset.lighting.ambientColor);
      this.lights.ambientLight.intensity = preset.lighting.ambientIntensity;

      this.lights.hemisphereLight.color.setHex(preset.lighting.hemisphereColorSky);
      this.lights.hemisphereLight.groundColor.setHex(preset.lighting.hemisphereColorGround);
      this.lights.hemisphereLight.intensity = preset.lighting.hemisphereIntensity;

      this.lights.directionalLight.color.setHex(preset.lighting.directionalColor);
      this.lights.directionalLight.intensity = preset.lighting.directionalIntensity;

      this.lights.fillLight.color.setHex(preset.lighting.fillColor);
      this.lights.fillLight.intensity = preset.lighting.fillIntensity;
    }

    // Update water
    if (this.waterSystem) {
      this.waterSystem.setWaterColor(preset.water.color);
      this.waterSystem.setSunColor(preset.water.sunColor);
      this.waterSystem.setDistortionScale(preset.water.distortionScale);
      this.waterSystem.setAlpha(preset.water.alpha);
    }

    // Update sky
    if (this.skySystem) {
      this.skySystem.setZenithColor(preset.sky.zenithColor);
      this.skySystem.setHorizonColor(preset.sky.horizonColor);
      this.skySystem.setCloudColor(preset.sky.cloudColor);
      this.skySystem.setCloudOpacity(preset.sky.cloudOpacity);
      this.skySystem.setCloudSpeed(preset.sky.cloudSpeed);
      this.skySystem.setCloudDensity(preset.sky.cloudDensity);
      this.skySystem.setSunColor(preset.sky.sunColor);
      this.skySystem.setSunIntensity(preset.sky.sunIntensity);
    }

    // Update post-processing
    if (this.postProcessing) {
      this.postProcessing.setBloomStrength(preset.postProcessing.bloomStrength);
      this.postProcessing.setBloomRadius(preset.postProcessing.bloomRadius);
      this.postProcessing.setBloomThreshold(preset.postProcessing.bloomThreshold);
      this.postProcessing.setGreenTint(preset.postProcessing.greenTint);
      this.postProcessing.setBlueTint(preset.postProcessing.blueTint);
      this.postProcessing.setContrast(preset.postProcessing.contrast);
      this.postProcessing.setSaturation(preset.postProcessing.saturation);
      this.postProcessing.setColorChannels(
        preset.colorGrade.redReduce,
        preset.colorGrade.greenBoost,
        preset.colorGrade.blueReduce
      );
      this.renderer.toneMappingExposure = preset.postProcessing.exposure;

      // Apply retro/pixelation effect
      this.postProcessing.setRetroEnabled(preset.retro.enabled);
      if (preset.retro.enabled) {
        this.postProcessing.setRetroSettings({
          pixelSize: preset.retro.pixelSize,
          colorDepth: preset.retro.colorDepth,
          scanlineIntensity: preset.retro.scanlineIntensity,
          chromaticAberration: preset.retro.chromaticAberration,
        });
      }
    }

    console.log(`Applied visual preset: ${preset.name}`);
  }

  /**
   * Set global brightness multiplier for all lights
   */
  private setGlobalBrightness(brightness: number): void {
    if (!this.lights) return;

    // Store base intensities on first call
    if (!(this.lights as any)._baseIntensities) {
      (this.lights as any)._baseIntensities = {
        ambient: this.lights.ambientLight.intensity,
        hemisphere: this.lights.hemisphereLight.intensity,
        directional: this.lights.directionalLight.intensity,
        fill: this.lights.fillLight.intensity,
      };
    }

    const base = (this.lights as any)._baseIntensities;

    // Apply brightness multiplier to all lights
    this.lights.ambientLight.intensity = base.ambient * brightness;
    this.lights.hemisphereLight.intensity = base.hemisphere * brightness;
    this.lights.directionalLight.intensity = base.directional * brightness;
    this.lights.fillLight.intensity = base.fill * brightness;

    // Also adjust exposure for overall scene brightness
    if (this.postProcessing) {
      this.renderer.toneMappingExposure = brightness;
    }
  }

  /**
   * Toggle night mode - dims lighting and enables player torch
   */
  private setNightMode(isNight: boolean): void {
    this.isNightMode = isNight;
    const preset = getPreset(this.currentVisualPreset);

    if (isNight) {
      this.applyNightModeFromPreset(preset);
    } else {
      // Re-apply full day mode preset
      this.applyVisualPreset(this.currentVisualPreset);

      // Disable player torch light
      this.character.setLightEnabled(false);

      // Remove first-person lights
      this.removeFirstPersonLight();

      // Restore normal vignette and retro state
      if (this.postProcessing) {
        this.postProcessing.setVignetteIntensity(0.3); // Normal vignette
        // Restore retro state based on preset
        const presetConfig = getPreset(this.currentVisualPreset);
        this.postProcessing.setRetroEnabled(presetConfig.retro.enabled);
      }
    }

    // Clear cached base intensities so brightness slider recalculates
    if (this.lights) {
      (this.lights as any)._baseIntensities = null;
    }
  }

  /**
   * Apply night mode settings from a preset config
   */
  private applyNightModeFromPreset(preset: ReturnType<typeof getPreset>): void {
    const night = preset.night;

    // Night mode - dark sky with theme-appropriate colors
    if (this.skySystem) {
      this.skySystem.setZenithColor(night.skyZenithColor);
      this.skySystem.setHorizonColor(night.skyHorizonColor);
      this.skySystem.setSunIntensity(0.05);
      this.skySystem.setCloudOpacity(0.2);
      this.skySystem.setCloudColor(night.skyHorizonColor);
    }

    // Apply dense fog to limit visibility - light illuminates through fog
    this.sceneConfig.applySettings({
      backgroundColor: night.fogColor,
      fog: {
        enabled: true,
        color: night.fogColor,
        near: night.fogNear,
        far: night.fogFar,
      },
    });

    // Dim the scene lights significantly
    if (this.lights) {
      this.lights.ambientLight.intensity = night.ambientIntensity;
      this.lights.ambientLight.color.setHex(night.ambientColor);
      this.lights.hemisphereLight.intensity = night.ambientIntensity * 1.2;
      this.lights.hemisphereLight.color.setHex(night.ambientColor);
      this.lights.hemisphereLight.groundColor.setHex(night.fogColor);
      this.lights.directionalLight.intensity = night.directionalIntensity;
      this.lights.directionalLight.color.setHex(night.directionalColor);
      this.lights.fillLight.intensity = night.ambientIntensity * 0.5;
    }

    // Lower exposure for horror atmosphere
    this.renderer.toneMappingExposure = 0.8;

    // Enable strong vignette for horror effect using retro pass
    if (this.postProcessing) {
      this.postProcessing.setRetroEnabled(true);
      this.postProcessing.setVignetteIntensity(0.6); // Strong edge darkening
    }

    // Enable player torch light with theme-appropriate color (third-person)
    this.character.setLightEnabled(true, {
      color: night.playerLightColor,
      intensity: night.playerLightIntensity,
      distance: night.playerLightDistance,
    });

    // Create first-person light attached to camera
    this.createFirstPersonLight(night.playerLightColor, night.playerLightIntensity, night.playerLightDistance);
  }

  /**
   * Create first-person flashlight attached to camera
   */
  private createFirstPersonLight(color: number, intensity: number, distance: number): void {
    // Remove existing lights
    this.removeFirstPersonLight();

    // Create spotlight for flashlight beam
    this.firstPersonLight = new THREE.SpotLight(color, intensity * 1.5, distance * 1.2, Math.PI / 5, 0.4, 1.0);
    this.firstPersonLight.position.set(0, 0, 0);
    this.camera.add(this.firstPersonLight);
    this.camera.add(this.firstPersonLight.target);
    this.firstPersonLight.target.position.set(0, -0.5, -10); // Point forward and slightly down

    // Create small ambient light for immediate area
    this.firstPersonAmbient = new THREE.PointLight(color, intensity * 0.3, distance * 0.4, 1.0);
    this.firstPersonAmbient.position.set(0, 0, 0);
    this.camera.add(this.firstPersonAmbient);

    // Make sure camera is in scene
    if (!this.camera.parent) {
      this.scene.add(this.camera);
    }
  }

  /**
   * Remove first-person lights
   */
  private removeFirstPersonLight(): void {
    if (this.firstPersonLight) {
      this.camera.remove(this.firstPersonLight.target);
      this.camera.remove(this.firstPersonLight);
      this.firstPersonLight.dispose();
      this.firstPersonLight = null;
    }
    if (this.firstPersonAmbient) {
      this.camera.remove(this.firstPersonAmbient);
      this.firstPersonAmbient.dispose();
      this.firstPersonAmbient = null;
    }
  }

  // ============================================
  // PREFAB PLACEMENT
  // ============================================

  // Shared build level across all placement modes (structures and prefabs)
  private sharedBuildLevel = 0;

  // Track last mouse position for prefab initial placement
  private lastMouseWorldX = 0;
  private lastMouseWorldZ = 0;

  // Track last mouse screen coordinates for continuous raycast updates
  private lastMouseScreenX = 0;
  private lastMouseScreenY = 0;

  private startPrefabPlacement(prefab: PrefabDefinition): void {
    this.cancelPrefabPlacement();
    this.currentPrefab = prefab;
    this.prefabBuildLevel = this.sharedBuildLevel; // Use shared build level
    this.prefabRotation = 0; // Reset rotation
    this.prefabPreview = this.placementSystem.createPrefabPreview(prefab, this.prefabRotation);
    this.scene.add(this.prefabPreview);

    // Show level plane indicator at the correct level
    this.placementSystem.showLevelPlane();
    const cellSize = this.chunkManager.getCellSize();
    const gridX = Math.floor(this.lastMouseWorldX / cellSize);
    const gridZ = Math.floor(this.lastMouseWorldZ / cellSize);
    this.placementSystem.updateLevelPlaneAt(gridX, gridZ, this.prefabBuildLevel);

    // Update camera to the build level
    this.cameraSystem.setBuildLevel(this.prefabBuildLevel);

    // Sync ground plane for raycasting
    this.inputManager.setGroundPlaneHeight(this.prefabBuildLevel);

    // Position at last known mouse position
    this.updatePrefabPreview(this.lastMouseWorldX, this.lastMouseWorldZ);
  }

  private rotatePrefabPreview(): void {
    if (!this.prefabPreview || !this.currentPrefab) return;

    // Remove old preview
    this.scene.remove(this.prefabPreview);
    this.prefabPreview.traverse((child) => {
      if (child instanceof THREE.Mesh || child instanceof THREE.LineSegments) {
        child.geometry.dispose();
        if (child.material instanceof THREE.Material) {
          child.material.dispose();
        }
      }
    });

    // Increment rotation
    this.prefabRotation = (this.prefabRotation + 1) % 4;

    // Create new preview with updated rotation
    this.prefabPreview = this.placementSystem.createPrefabPreview(this.currentPrefab, this.prefabRotation);
    this.scene.add(this.prefabPreview);

    // Reposition at current location
    this.updatePrefabPreview(this.lastMouseWorldX, this.lastMouseWorldZ);
  }

  private cyclePrefabLevel(direction: number): void {
    if (!this.currentPrefab) return;

    const maxLevel = 50;

    if (direction > 0) {
      this.prefabBuildLevel = Math.min(maxLevel, this.prefabBuildLevel + 1);
    } else {
      this.prefabBuildLevel = Math.max(0, this.prefabBuildLevel - 1);
    }

    // Update shared level so it persists when switching placement modes
    this.sharedBuildLevel = this.prefabBuildLevel;

    // Update preview Y position
    if (this.prefabPreview) {
      this.prefabPreview.position.y = this.prefabBuildLevel;
    }

    // Update level plane to show the new level
    const cellSize = this.chunkManager.getCellSize();
    const gridX = Math.floor(this.lastMouseWorldX / cellSize);
    const gridZ = Math.floor(this.lastMouseWorldZ / cellSize);
    this.placementSystem.updateLevelPlaneAt(gridX, gridZ, this.prefabBuildLevel);

    // Emit level changed event
    emitEvent("structure:levelChanged", {
      level: this.prefabBuildLevel,
      maxLevel: maxLevel,
    });
  }

  private cancelPrefabPlacement(): void {
    if (this.prefabPreview) {
      this.scene.remove(this.prefabPreview);
      this.prefabPreview.traverse((child) => {
        if (child instanceof THREE.Mesh) {
          child.geometry.dispose();
          (child.material as THREE.Material).dispose();
        }
        if (child instanceof THREE.LineSegments) {
          child.geometry.dispose();
          (child.material as THREE.Material).dispose();
        }
      });
      this.prefabPreview = null;
    }
    this.currentPrefab = null;

    // Hide level plane indicator
    this.placementSystem.hideLevelPlane();
  }

  private updatePrefabPreview(worldX: number, worldZ: number): void {
    if (!this.prefabPreview || !this.currentPrefab) return;

    const cellSize = this.chunkManager.getCellSize();
    const gridX = Math.floor(worldX / cellSize);
    const gridZ = Math.floor(worldZ / cellSize);

    // Position same as regular structure preview
    this.prefabPreview.position.set(
      gridX * cellSize + cellSize / 2,
      this.prefabBuildLevel,
      gridZ * cellSize + cellSize / 2
    );

    // Update level plane position
    this.placementSystem.updateLevelPlaneAt(gridX, gridZ, this.prefabBuildLevel);

    // Update opacity based on validity (keep original colors)
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

  private confirmPrefabPlacement(gridX: number, gridZ: number): boolean {
    if (!this.currentPrefab) return false;

    const prefab = this.currentPrefab;
    const level = this.prefabBuildLevel;
    const rotation = this.prefabRotation;

    const placed = this.placementSystem.placePrefab(
      prefab,
      gridX,
      gridZ,
      level,
      rotation
    );
    if (placed) {
      // Send each prefab block to the server for multiplayer sync
      if (this.isMultiplayer && this.networkManager) {
        const blockPositions = this.placementSystem.getPrefabBlockPositions(
          prefab,
          gridX,
          gridZ,
          level,
          rotation
        );
        for (const block of blockPositions) {
          this.sendBlockPlacedToServer(block.x, block.y, block.z, block.blockId);
        }
      }

      // Restart placement with same prefab (keep current level, rotation, and position)
      const cellSize = this.chunkManager.getCellSize();

      this.cancelPrefabPlacement();

      // Recreate preview with same rotation
      this.currentPrefab = prefab;
      this.prefabBuildLevel = level;
      this.prefabRotation = rotation;
      this.prefabPreview = this.placementSystem.createPrefabPreview(prefab, rotation);
      this.scene.add(this.prefabPreview);

      // Position at same grid location (where we just placed)
      this.updatePrefabPreview(gridX * cellSize, gridZ * cellSize);
    }
    return placed;
  }

  private createCursorHighlight(): THREE.Group {
    const cellSize = this.chunkManager.getCellSize();
    const group = new THREE.Group();

    // Wireframe box
    const boxGeometry = new THREE.BoxGeometry(cellSize, cellSize, cellSize);
    const edgesGeometry = new THREE.EdgesGeometry(boxGeometry);
    const edgeMaterial = new THREE.LineBasicMaterial({
      color: 0xffffff,
      transparent: true,
      opacity: 0.8
    });
    const edges = new THREE.LineSegments(edgesGeometry, edgeMaterial);
    group.add(edges);

    // Semi-transparent fill
    const fillMaterial = new THREE.MeshBasicMaterial({
      color: 0xffffff,
      transparent: true,
      opacity: 0.15,
      side: THREE.DoubleSide
    });
    const fill = new THREE.Mesh(boxGeometry, fillMaterial);
    group.add(fill);

    return group;
  }

  private lastHighlightBuildLevel = -1;

  private updateCursorHighlight(gridX: number, gridZ: number, buildLevel: number): void {
    // Only update if position or level changed
    if (gridX === this.lastHighlightGridX &&
        gridZ === this.lastHighlightGridZ &&
        buildLevel === this.lastHighlightBuildLevel) {
      return;
    }
    this.lastHighlightGridX = gridX;
    this.lastHighlightGridZ = gridZ;
    this.lastHighlightBuildLevel = buildLevel;

    // Create highlight if it doesn't exist
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

  private hideCursorHighlight(): void {
    if (this.cursorHighlight) {
      this.cursorHighlight.visible = false;
    }
  }

  private showCursorHighlight(): void {
    if (this.cursorHighlight) {
      this.cursorHighlight.visible = true;
    }
  }

  // ============================================
  // SELECTION ACTION HANDLERS
  // ============================================

  private handleSelectionCut(): void {
    if (!this.prefabCaptureSystem) return;

    // Copy to clipboard first
    const copied = this.prefabCaptureSystem.copyToClipboard();
    if (!copied) return;

    // Then delete the blocks
    this.deleteSelectedBlocks();

    // Enter paste mode to place the cut blocks
    this.enterPasteMode();

    // Clear selection and exit mode
    this.prefabCaptureSystem.clearAndExit();
  }

  private handleSelectionCopy(): void {
    if (!this.prefabCaptureSystem) return;

    const copied = this.prefabCaptureSystem.copyToClipboard();
    if (copied) {
      console.log("Selection copied to clipboard - entering paste mode");
      // Enter paste mode to place the copied blocks
      this.enterPasteMode();
    }

    // Clear selection and exit mode
    this.prefabCaptureSystem.clearAndExit();
  }

  private handleSelectionDelete(): void {
    if (!this.prefabCaptureSystem) return;

    this.deleteSelectedBlocks();

    // Clear selection and exit mode
    this.prefabCaptureSystem.clearAndExit();
  }

  private handleSelectionApplyMaterial(material: {
    metalness?: number;
    roughness?: number;
    emissive?: string;
    emissiveIntensity?: number;
    opacity?: number;
    transparent?: boolean;
  }): void {
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

  private deleteSelectedBlocks(): void {
    if (!this.prefabCaptureSystem) return;

    const blocks = this.prefabCaptureSystem.getRawBlocksInSelection();

    for (const block of blocks) {
      const removed = this.placementSystem.removeBlockAt(block.x, block.y, block.z);
      if (removed) {
        this.sendBlockRemovedToServer(block.x, block.y, block.z);
      }
    }

    console.log(`Deleted ${blocks.length} blocks`);
  }

  private handlePaste(): void {
    // Just enter paste mode when V is pressed
    this.enterPasteMode();
  }

  private enterPasteMode(): void {
    const clipboard = getClipboard();
    if (!clipboard || clipboard.blocks.length === 0) return;

    this.isPasteMode = true;
    this.createPastePreview();
    console.log("Entered paste mode - click to place, Escape to cancel");
  }

  private exitPasteMode(): void {
    this.isPasteMode = false;
    if (this.pastePreview) {
      this.scene.remove(this.pastePreview);
      this.pastePreview.traverse((child) => {
        if (child instanceof THREE.Mesh || child instanceof THREE.LineSegments) {
          child.geometry.dispose();
          if (Array.isArray(child.material)) {
            child.material.forEach((m) => m.dispose());
          } else {
            child.material.dispose();
          }
        }
      });
      this.pastePreview = null;
    }
  }

  private createPastePreview(): void {
    const clipboard = getClipboard();
    if (!clipboard || clipboard.blocks.length === 0) return;

    // Remove existing preview
    if (this.pastePreview) {
      this.scene.remove(this.pastePreview);
    }

    this.pastePreview = new THREE.Group();
    const cellSize = this.chunkManager.getCellSize();

    // Create a semi-transparent block for each block in clipboard
    for (const block of clipboard.blocks) {
      const geometry = new THREE.BoxGeometry(
        cellSize * 0.95,
        cellSize,
        cellSize * 0.95
      );

      // Get block color from structure definition
      const structure = getStructure(block.blockId);
      const color = structure?.color || 0x888888;

      const material = new THREE.MeshBasicMaterial({
        color,
        transparent: true,
        opacity: 0.5,
      });

      const mesh = new THREE.Mesh(geometry, material);
      mesh.position.set(
        block.x * cellSize + cellSize / 2,
        block.y * cellSize + cellSize / 2,
        block.z * cellSize + cellSize / 2
      );

      this.pastePreview.add(mesh);
    }

    this.scene.add(this.pastePreview);
  }

  private updatePastePreview(gridX: number, gridZ: number): void {
    if (!this.pastePreview) return;

    const cellSize = this.chunkManager.getCellSize();
    this.pastePreview.position.set(
      gridX * cellSize,
      this.sharedBuildLevel * cellSize,
      gridZ * cellSize
    );
  }

  private confirmPaste(gridX: number, gridZ: number): boolean {
    const clipboard = getClipboard();
    if (!clipboard || clipboard.blocks.length === 0) return false;

    const gridY = this.sharedBuildLevel;

    // Place each block from clipboard at offset from cursor position
    let placedCount = 0;
    for (const block of clipboard.blocks) {
      const x = gridX + block.x;
      const y = gridY + block.y;
      const z = gridZ + block.z;

      // Place the block
      const structure = getStructure(block.blockId);
      if (structure) {
        const placed = this.placementSystem.placeBlockFromNetwork(x, y, z, block.blockId, 0);
        if (placed) {
          this.sendBlockPlacedToServer(x, y, z, block.blockId);
          placedCount++;
        }
      }
    }

    console.log(`Pasted ${placedCount} blocks at (${gridX}, ${gridY}, ${gridZ})`);
    return placedCount > 0;
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

    // Initialize prefab capture system
    this.prefabCaptureSystem = new PrefabCaptureSystem(
      this.scene,
      this.chunkManager.getCellSize(),
      this.placementSystem.getOccupiedCells(),
      (x, y, z) => this.placementSystem.getBlockIdAt(x, y, z)
    );

    // Connect capture system level changes to plane/camera updates
    this.prefabCaptureSystem.setOnLevelChanged((level: number) => {
      this.sharedBuildLevel = level;
      this.inputManager.setGroundPlaneHeight(level);
      this.cameraSystem.setBuildLevel(level);
      // Update level plane
      const cellSize = this.chunkManager.getCellSize();
      const gridX = Math.floor(this.lastMouseWorldX / cellSize);
      const gridZ = Math.floor(this.lastMouseWorldZ / cellSize);
      this.placementSystem.updateLevelPlaneAt(gridX, gridZ, level);
    });

    // Setup save/load buttons first (before UI manager which may trigger world:connected)
    this.setupSaveControls();

    // Initialize UI and connect block getter
    // UIManager will check for saved world ID and emit world:connected if valid
    this.uiManager = new UIManager();
    this.uiManager.setBlockGetter(() => this.prefabCaptureSystem?.getSelectedBlocks() || []);

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
      this.applyVisualPreset(preset);
      // Update retro toggle state based on preset
      if (this.performancePanel) {
        const presetConfig = getPreset(preset);
        this.performancePanel.setRetroState(presetConfig.retro.enabled);
      }
    });

    // Set brightness change handler
    this.performancePanel.setBrightnessChangeHandler((brightness: number) => {
      this.setGlobalBrightness(brightness);
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

    // Set day/night toggle handler
    this.performancePanel.setDayNightToggleHandler((isNight: boolean) => {
      this.setNightMode(isNight);
    });

    // Set selection action callbacks
    this.uiManager.setSelectionCallbacks({
      onCut: () => this.handleSelectionCut(),
      onCopy: () => this.handleSelectionCopy(),
      onDelete: () => this.handleSelectionDelete(),
    });

    // Handle selection material changes
    onEvent("selection:applyMaterial", ({ material }) => {
      this.handleSelectionApplyMaterial(material);
    });

    // Initialize multiplayer first - if server connects, it will provide world state
    // and we skip local loading to avoid sync issues
    this.initializeNetworking();
  }

  /**
   * Initialize networking for multiplayer
   */
  private initializeNetworking(): void {
    // Use WebSocket server URL from environment (empty = no game server)
    const serverUrl = import.meta.env.VITE_SOCKET_URL || "";
    const worldId = getWorldId();
    const isDevMode = import.meta.env.VITE_DEV_MODE === "true";

    // If no world ID, skip server connection and use single player mode
    if (!worldId) {
      console.log("No world ID, entering single player mode");
      stateManager.setConnectionMode("single-player");
      this.loadSavedGame();
      return;
    }

    // If dev mode enabled, skip game server and save directly to Strapi
    if (isDevMode) {
      console.log("Dev mode enabled, entering builder mode (saves directly to Strapi)");
      stateManager.setConnectionMode("dev");
      this.loadSavedGame();
      return;
    }

    // If no game server URL configured, go straight to explorer mode
    if (!serverUrl) {
      console.log("No game server URL configured, entering explorer mode");
      stateManager.setConnectionMode("explorer");
      this.loadSavedGame();
      return;
    }

    this.networkManager = new NetworkManager({
      serverUrl,
      worldId,

      onConnected: (playerId, _color, state) => {
        this.localPlayerId = playerId;
        this.isMultiplayer = true;
        console.log(`Connected as ${playerId}`);
        stateManager.setConnectionMode("online");
        this.uiManager?.showMessage(`Multiplayer connected as ${playerId}`, 3000);

        // Update UI to reflect online status
        this.updateSaveButtonState();

        // Sync local player position with server-assigned position
        this.playerController.setPosition(
          state.position.x,
          state.position.y,
          state.position.z
        );
        this.playerController.setRotation(state.rotation);

        // Update character visual to match
        const pos = this.playerController.getPosition();
        this.character.setPositionFromVector(pos);
        this.character.setRotation(state.rotation);

        // Update camera to follow new position
        this.cameraSystem.setPlayerPosition(pos);

        // Clear local blocks - server world will be loaded via onWorldState
        this.placementSystem.clearAll();
      },

      onDisconnected: async () => {
        const wasIntentional = this.intentionalDisconnect;
        this.isMultiplayer = false;
        this.localPlayerId = null;
        this.intentionalDisconnect = false; // Reset flag
        console.log("Disconnected from server");

        // Remove all remote players
        for (const [, remotePlayer] of this.remotePlayers) {
          remotePlayer.dispose(this.scene);
        }
        this.remotePlayers.clear();

        // If intentional disconnect (user clicked Leave), switch to single player
        if (wasIntentional) {
          console.log("Intentional disconnect, switching to single player mode");
          stateManager.setConnectionMode("single-player");
          return;
        }

        // Check if we have a world ID - if so, enter explorer mode (read-only)
        const worldId = getWorldId();
        if (worldId) {
          // Has world ID but server unavailable - enter Explorer Mode (read-only)
          console.log("Game server unavailable, entering Explorer Mode (read-only)");
          stateManager.setConnectionMode("explorer");
          this.uiManager?.showMessage("Explorer Mode - Changes will be lost on refresh", 5000);
          await this.loadSavedGame();
        } else {
          // No world ID - pure single player mode
          console.log("No world ID, entering single player mode");
          stateManager.setConnectionMode("single-player");
          await this.loadSavedGame();
        }
      },

      onJoinError: (message: string) => {
        this.uiManager?.showMessage(`Failed to join world: ${message}`, 4000);
      },

      onPlayerJoined: (player: NetworkPlayer) => {
        this.addRemotePlayer(player);
        this.uiManager?.showMessage(`${player.playerId} joined`, 2000);
      },

      onPlayerLeft: (playerId: string) => {
        this.removeRemotePlayer(playerId);
        this.uiManager?.showMessage(`${playerId} left`, 2000);
      },

      onPlayerStateUpdate: (playerId: string, state: PlayerState, timestamp: number) => {
        // Check if this is our own state (server reconciliation)
        if (playerId === this.localPlayerId) {
          // Apply server-authoritative position to prevent drift
          this.playerController.setPosition(
            state.position.x,
            state.position.y,
            state.position.z
          );
          this.playerController.setRotation(state.rotation);

          // Update character visual
          const pos = this.playerController.getPosition();
          this.character.setPositionFromVector(pos);
          this.character.setRotation(state.rotation);

          // Update camera to follow
          this.cameraSystem.setPlayerPosition(pos);
          return;
        }

        // Remote player update
        const remotePlayer = this.remotePlayers.get(playerId);
        if (remotePlayer) {
          remotePlayer.receiveState(state, timestamp);
        }
      },

      onBlockPlaced: (playerId: string, block: NetworkBlock) => {
        // Only process blocks from other players
        if (playerId !== this.localPlayerId) {
          this.placementSystem.placeBlockFromNetwork(
            block.x,
            block.y,
            block.z,
            block.structureId,
            block.rotation
          );
        }
      },

      onBlockRemoved: (playerId: string, x: number, y: number, z: number) => {
        // Only process removals from other players
        if (playerId !== this.localPlayerId) {
          this.placementSystem.removeBlockAt(x, y, z);
        }
      },

      onWorldReset: (playerId: string) => {
        // Clear all blocks when another player resets the world
        if (playerId !== this.localPlayerId) {
          this.placementSystem.clearAll();
          this.uiManager?.showMessage(`World reset by ${playerId}`, 3000);
        }
      },

      onWorldState: (blocks: NetworkBlock[], players: NetworkPlayer[]) => {
        // Load existing blocks from server
        for (const block of blocks) {
          this.placementSystem.placeBlockFromNetwork(
            block.x,
            block.y,
            block.z,
            block.structureId,
            block.rotation
          );
        }

        // Add existing players
        for (const player of players) {
          this.addRemotePlayer(player);
        }

        console.log(`Loaded ${blocks.length} blocks and ${players.length} players from server`);
      },

      onWorldSaved: (success: boolean, message?: string) => {
        if (success) {
          const blockCount = this.placementSystem.exportBlocks().length;
          this.uiManager?.showMessage(`Saved ${blockCount} blocks to cloud`, 2000);
        } else {
          this.uiManager?.showMessage(message || "Failed to save to cloud", 3000);
        }
      },
    });

    // Attempt to connect
    this.networkManager.connect();
  }

  /**
   * Add a remote player to the scene
   */
  private addRemotePlayer(player: NetworkPlayer): void {
    if (this.remotePlayers.has(player.playerId)) {
      return; // Already exists
    }

    const remotePlayer = new RemotePlayer(
      this.scene,
      player.playerId,
      player.state,
      { color: player.color }
    );

    this.remotePlayers.set(player.playerId, remotePlayer);
    console.log(`Added remote player: ${player.playerId}`);
  }

  /**
   * Remove a remote player from the scene
   */
  private removeRemotePlayer(playerId: string): void {
    const remotePlayer = this.remotePlayers.get(playerId);
    if (remotePlayer) {
      remotePlayer.dispose(this.scene);
      this.remotePlayers.delete(playerId);
      console.log(`Removed remote player: ${playerId}`);
    }
  }

  /**
   * Send local player inputs to server
   */
  private sendInputsToServer(): void {
    if (!this.networkManager || !this.isMultiplayer) return;

    // Gather current input state
    this.networkManager.updateInputs({
      moveForward: this.inputManager.isActionActive("moveForward"),
      moveBackward: this.inputManager.isActionActive("moveBackward"),
      moveLeft: this.inputManager.isActionActive("moveLeft"),
      moveRight: this.inputManager.isActionActive("moveRight"),
      jetpackUp: this.inputManager.isActionActive("jetpackUp"),
      jetpackDown: this.inputManager.isActionActive("jetpackDown"),
      sprint: this.inputManager.isKeyPressed("shift"),
      hoverMode: this.playerController.isHoverMode(),
    });

    // Send camera yaw for server-side movement calculation
    this.networkManager.setCameraYaw(this.cameraSystem.getYaw());
  }

  /**
   * Update all remote players (interpolation)
   */
  private updateRemotePlayers(deltaTime: number): void {
    for (const [, remotePlayer] of this.remotePlayers) {
      remotePlayer.update(deltaTime);
    }
  }

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
    console.log(`Saving ${blocks.length} blocks, mode=${connectionMode}, isMultiplayer=${this.isMultiplayer}`);

    if (connectionMode === "online" && this.isMultiplayer && this.networkManager) {
      // Online mode: request server to save to Strapi
      console.log("Requesting server to save...");
      this.uiManager?.showMessage("Saving to cloud...", 1000);
      this.networkManager.sendWorldSave();
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
    if (this.isMultiplayer && this.networkManager) {
      this.networkManager.sendWorldReset();
    }

    this.uiManager?.showMessage("World reset", 2000);
    this.updateSaveButtonState();
  }

  private updateSaveButtonState(): void {
    const saveBtn = document.getElementById("save-btn");
    const clearLocalBtn = document.getElementById("clear-local-btn");

    if (saveBtn) {
      // Update button text to show connection status (cloud if multiplayer, local if offline)
      const icon = this.isMultiplayer ? "☁️" : "💾";
      saveBtn.textContent = `${icon} Save`;

      if (hasSave()) {
        saveBtn.classList.add("saved");
      } else {
        saveBtn.classList.remove("saved");
      }
    }

    // Hide clear local button when online
    if (clearLocalBtn) {
      clearLocalBtn.style.display = this.isMultiplayer ? "none" : "block";
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
      const buildLevel = this.currentPrefab
        ? this.prefabBuildLevel
        : stateManager.isPlacing()
          ? this.placementSystem.getCurrentBuildLevel()
          : this.sharedBuildLevel;
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

      // Update camera to follow player
      this.cameraSystem.setPlayerPosition(playerPos);
      this.cameraSystem.update(deltaTime);

      // Send inputs to server for multiplayer
      this.sendInputsToServer();
    }

    // Update remote players (interpolation)
    this.updateRemotePlayers(deltaTime);

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

