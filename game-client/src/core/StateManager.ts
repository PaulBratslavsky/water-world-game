import { emitEvent, onEvent } from "./EventBus";

/**
 * StateManager - Single source of truth for game state
 *
 * Manages camera modes and other global state.
 * Emits events when state changes so other systems can react.
 *
 * Camera Modes:
 * - first-person: WASD + mouse look, character hidden
 * - third-person: WASD + mouse look, camera behind player, character visible
 * - build: Free-flying camera, WASD + mouse look, Y locked to build level
 */

export type CameraMode = "first-person" | "third-person" | "build";

// Legacy types for backwards compatibility during transition
export type GameMode = "move" | "build";
export type ViewMode = "third-person" | "first-person";

export type RenderMode = "solid" | "wireframe";

// Connection modes for online worlds
// - "single-player": No world ID, local saves only
// - "online": Connected to game server, can save to cloud
// - "explorer": Has world ID but game server unavailable, read-only view
export type ConnectionMode = "single-player" | "online" | "explorer";

export interface GameState {
  cameraMode: CameraMode;
  previousCameraMode: CameraMode; // For returning from build mode
  selectedStructureId: string | null;
  isPlacing: boolean;
  freePlacement: boolean; // Allow overlapping/intersecting blocks
  selectionMode: boolean; // Selecting blocks for cut/copy/delete/prefab
  renderMode: RenderMode; // Solid or wireframe rendering
  showMaterials: boolean; // Show material properties or basic colors
  connectionMode: ConnectionMode; // Single player, online, or explorer mode
  // Legacy fields for compatibility
  mode: GameMode;
  viewMode: ViewMode;
}

class StateManagerClass {
  private state: GameState = {
    cameraMode: "third-person",
    previousCameraMode: "third-person",
    selectedStructureId: null,
    isPlacing: false,
    freePlacement: false,
    selectionMode: false,
    renderMode: "solid",
    showMaterials: true,
    connectionMode: "single-player",
    // Legacy fields
    mode: "move",
    viewMode: "third-person",
  };

  constructor() {
    this.setupEventListeners();
  }

  private setupEventListeners(): void {
    // Listen for input events and update state accordingly
    onEvent("input:keyDown", ({ key }) => {
      switch (key) {
        case "b":
          // Enter build mode from any mode
          this.setCameraMode("build");
          break;
        case "v":
          // Toggle between FP and TP (only in non-build mode)
          if (this.state.cameraMode !== "build") {
            this.toggleFPTP();
          }
          break;
        case "escape":
          // Emit cancel event - main.ts handles paste mode and prefab placement
          // If those are active, they will handle it and we shouldn't exit build mode
          // We check for selection mode and structure placement here
          if (this.state.selectionMode) {
            this.setSelectionMode(false);
          } else if (this.state.isPlacing) {
            this.cancelPlacement();
          } else {
            // Emit event for paste/prefab cancellation or build mode exit
            // main.ts will handle paste/prefab, and if neither is active,
            // it will emit "escape:unhandled" to exit build mode
            emitEvent("prefab:cancelPlacement", undefined);
          }
          break;
        case "f":
          if (this.state.cameraMode === "build") {
            this.toggleFreePlacement();
          }
          break;
        case "p":
          if (this.state.cameraMode === "build") {
            this.toggleSelectionMode();
          }
          break;
      }
    });

    // Listen for structure selection
    onEvent("structure:selected", ({ structureId }) => {
      this.state.selectedStructureId = structureId;
      this.state.isPlacing = true;
    });

    // Listen for placement events
    onEvent("structure:placed", () => {
      // Keep placing mode active for continuous placement
    });

    onEvent("structure:placementCancelled", () => {
      this.state.selectedStructureId = null;
      this.state.isPlacing = false;
    });
  }

  // Getters
  getCameraMode(): CameraMode {
    return this.state.cameraMode;
  }

  // Legacy getter - maps camera mode to game mode
  getMode(): GameMode {
    return this.state.cameraMode === "build" ? "build" : "move";
  }

  // Legacy getter - maps camera mode to view mode
  getViewMode(): ViewMode {
    if (this.state.cameraMode === "build") {
      return "third-person"; // Build mode is like TP for legacy code
    }
    return this.state.cameraMode as ViewMode;
  }

  getSelectedStructureId(): string | null {
    return this.state.selectedStructureId;
  }

  isPlacing(): boolean {
    return this.state.isPlacing;
  }

  isFreePlacement(): boolean {
    return this.state.freePlacement;
  }

  isSelectionMode(): boolean {
    return this.state.selectionMode;
  }

  // Alias for backward compatibility
  isPrefabCaptureMode(): boolean {
    return this.state.selectionMode;
  }

  getRenderMode(): RenderMode {
    return this.state.renderMode;
  }

  isWireframe(): boolean {
    return this.state.renderMode === "wireframe";
  }

  showMaterials(): boolean {
    return this.state.showMaterials;
  }

  isBuildMode(): boolean {
    return this.state.cameraMode === "build";
  }

  isFirstPerson(): boolean {
    return this.state.cameraMode === "first-person";
  }

  isThirdPerson(): boolean {
    return this.state.cameraMode === "third-person";
  }

  getConnectionMode(): ConnectionMode {
    return this.state.connectionMode;
  }

  isSinglePlayer(): boolean {
    return this.state.connectionMode === "single-player";
  }

  isOnline(): boolean {
    return this.state.connectionMode === "online";
  }

  isExplorerMode(): boolean {
    return this.state.connectionMode === "explorer";
  }

  canSave(): boolean {
    // Can save in all modes:
    // - single-player: saves to personal localStorage
    // - online: saves to cloud via game server
    // - explorer: saves to temp localStorage (wiped on leave)
    return true;
  }

  getState(): Readonly<GameState> {
    return { ...this.state };
  }

  // Setters with event emission
  setCameraMode(cameraMode: CameraMode): void {
    if (this.state.cameraMode === cameraMode) return;

    const previous = this.state.cameraMode;

    // Save current mode before entering build mode
    if (cameraMode === "build" && previous !== "build") {
      this.state.previousCameraMode = previous;
    }

    this.state.cameraMode = cameraMode;

    // Update legacy fields for compatibility
    this.state.mode = cameraMode === "build" ? "build" : "move";
    this.state.viewMode = cameraMode === "build" ? "third-person" : cameraMode;

    // Cancel placement when exiting build mode
    if (previous === "build" && cameraMode !== "build" && this.state.isPlacing) {
      this.cancelPlacement();
    }

    emitEvent("state:cameraModeChanged", { cameraMode, previous });
    // Legacy events for compatibility
    emitEvent("state:modeChanged", { mode: this.state.mode });
    emitEvent("state:viewModeChanged", { viewMode: this.state.viewMode, previous: previous === "build" ? "third-person" : previous });
  }

  /**
   * Toggle between first-person and third-person (not build mode)
   */
  toggleFPTP(): void {
    if (this.state.cameraMode === "build") return;
    this.setCameraMode(
      this.state.cameraMode === "first-person" ? "third-person" : "first-person"
    );
  }

  /**
   * Exit build mode and return to previous FP/TP mode
   */
  exitBuildMode(): void {
    if (this.state.cameraMode !== "build") return;
    this.setCameraMode(this.state.previousCameraMode);
  }

  // Legacy setters for compatibility
  setMode(mode: GameMode): void {
    if (mode === "build") {
      this.setCameraMode("build");
    } else {
      // Exit build mode if we're in it
      if (this.state.cameraMode === "build") {
        this.exitBuildMode();
      }
    }
  }

  setViewMode(viewMode: ViewMode): void {
    if (this.state.cameraMode === "build") return;
    this.setCameraMode(viewMode);
  }

  toggleMode(): void {
    if (this.state.cameraMode === "build") {
      this.exitBuildMode();
    } else {
      this.setCameraMode("build");
    }
  }

  toggleViewMode(): void {
    this.toggleFPTP();
  }

  cancelPlacement(): void {
    this.state.selectedStructureId = null;
    this.state.isPlacing = false;
    emitEvent("structure:placementCancelled", undefined);
  }

  selectStructure(structureId: string): void {
    // Only allow structure selection in build mode
    if (this.state.cameraMode !== "build") {
      // Auto-enter build mode when selecting a structure
      this.setCameraMode("build");
    }

    this.state.selectedStructureId = structureId;
    this.state.isPlacing = true;
    emitEvent("structure:selected", { structureId });
  }

  setFreePlacement(enabled: boolean): void {
    if (this.state.freePlacement === enabled) return;

    this.state.freePlacement = enabled;
    emitEvent("state:freePlacementChanged", { enabled });
  }

  toggleFreePlacement(): void {
    this.setFreePlacement(!this.state.freePlacement);
  }

  setSelectionMode(active: boolean): void {
    if (this.state.selectionMode === active) return;

    this.state.selectionMode = active;

    // Cancel any active placement when entering selection mode
    if (active && this.state.isPlacing) {
      this.cancelPlacement();
    }

    emitEvent("state:selectionModeChanged", { active });
    // Also emit old event for backward compatibility
    emitEvent("state:prefabCaptureChanged", { active });
  }

  toggleSelectionMode(): void {
    this.setSelectionMode(!this.state.selectionMode);
  }

  // Aliases for backward compatibility
  setPrefabCaptureMode(active: boolean): void {
    this.setSelectionMode(active);
  }

  togglePrefabCaptureMode(): void {
    this.toggleSelectionMode();
  }

  setRenderMode(renderMode: RenderMode): void {
    if (this.state.renderMode === renderMode) return;

    this.state.renderMode = renderMode;
    emitEvent("state:renderModeChanged", { renderMode });
  }

  toggleRenderMode(): void {
    this.setRenderMode(this.state.renderMode === "solid" ? "wireframe" : "solid");
  }

  setShowMaterials(show: boolean): void {
    if (this.state.showMaterials === show) return;

    this.state.showMaterials = show;
    emitEvent("state:showMaterialsChanged", { show });
  }

  toggleShowMaterials(): void {
    this.setShowMaterials(!this.state.showMaterials);
  }

  setConnectionMode(connectionMode: ConnectionMode): void {
    if (this.state.connectionMode === connectionMode) return;

    const previous = this.state.connectionMode;
    this.state.connectionMode = connectionMode;
    emitEvent("state:connectionModeChanged", { connectionMode, previous });
  }
}

// Singleton instance
export const stateManager = new StateManagerClass();
