import { onEvent, emitEvent } from "../core/EventBus";
import { stateManager, GameMode, ViewMode, ConnectionMode } from "../core/StateManager";
import { getAllStructures, StructureDefinition, BlockMaterial, updateStructureMaterial } from "../structures/StructureDefinition";
import { getAllPrefabs, PrefabDefinition, refreshPrefabs } from "../structures/PrefabDefinition";
import { savePrefabToStrapi, savePrefabLocally, generatePrefabId, PrefabCategory, PrefabBlockData } from "../structures/PrefabData";
import { getBlock, updateBlockLocally, DEFAULT_MATERIAL } from "../structures/BlockData";
import { DebugPanel } from "./DebugPanel";
import { setWorldId, validateWorldId, getWorldId, clearWorldId, WorldInfo } from "../core/SaveSystem";

/**
 * UIManager - Handles all UI updates and user interactions
 *
 * Listens to state changes and updates the DOM accordingly.
 * Separates UI logic from game logic.
 */

export class UIManager {
  private modeToggleContainer: HTMLElement | null;
  private structureMenuContainer: HTMLElement | null;
  private prefabMenuContainer: HTMLElement | null;
  private buildOptionsContainer: HTMLElement | null;
  private prefabModal: HTMLElement | null;
  private joinWorldModal: HTMLElement | null;
  private selectionActionMenu: HTMLElement | null;
  private blockEditorModal: HTMLElement | null;

  // Prefab capture state
  private pendingPrefabBlocks: PrefabBlockData[] = [];
  private getSelectedBlocks: (() => PrefabBlockData[]) | null = null;
  private pendingBlockCount: number = 0;

  // Selection action callbacks (set by main.ts)
  private onSelectionCut: (() => void) | null = null;
  private onSelectionCopy: (() => void) | null = null;
  private onSelectionDelete: (() => void) | null = null;

  // Prevent button spam - track if action is processing
  private isActionProcessing: boolean = false;

  // Block editor state
  private currentEditingBlockId: string | null = null;
  private currentEditingMaterial: BlockMaterial = {};

  constructor() {
    this.modeToggleContainer = document.getElementById("mode-toggle");
    this.structureMenuContainer = document.getElementById("structure-menu");
    this.prefabMenuContainer = document.getElementById("prefab-menu");
    this.buildOptionsContainer = document.getElementById("build-options");
    this.prefabModal = document.getElementById("prefab-modal");
    this.joinWorldModal = document.getElementById("join-world-modal");
    this.selectionActionMenu = document.getElementById("selection-action-menu");
    this.blockEditorModal = document.getElementById("block-editor-modal");

    this.setupUI();
    this.setupEventListeners();

    // Initialize debug panel (self-managing)
    new DebugPanel();
  }

  // Allow external systems to provide block getter
  setBlockGetter(getter: () => PrefabBlockData[]): void {
    this.getSelectedBlocks = getter;
  }

  // Set selection action callbacks
  setSelectionCallbacks(callbacks: {
    onCut: () => void;
    onCopy: () => void;
    onDelete: () => void;
  }): void {
    this.onSelectionCut = callbacks.onCut;
    this.onSelectionCopy = callbacks.onCopy;
    this.onSelectionDelete = callbacks.onDelete;
  }

  private setupUI(): void {
    this.setupModeToggle();
    this.setupViewToggle();
    this.setupStructureMenu();
    this.setupPrefabMenu();
    this.setupBuildOptions();
    this.setupSelectionActionMenu();
    this.setupPrefabModal();
    this.setupJoinWorldModal();
    this.setupBlockEditorModal();
    this.checkExistingWorldConnection();
  }

  /**
   * Check if we have a saved world ID on startup
   * Note: This only validates the world exists in Strapi.
   * The actual connection mode (online vs explorer) is determined by
   * NetworkManager when it tries to connect to the game server.
   */
  private async checkExistingWorldConnection(): Promise<void> {
    const savedWorldId = getWorldId();
    if (!savedWorldId) {
      // No world ID - single player mode (already set by bootstrap)
      return;
    }

    // Validate the saved world ID still exists in Strapi
    console.log("Checking saved world ID:", savedWorldId);
    const worldInfo = await validateWorldId();

    if (!worldInfo) {
      // World no longer exists in Strapi - clear and go to single player
      console.log("Saved world ID is no longer valid, clearing");
      clearWorldId();
      this.updateWorldStatus("offline", "Single Player");
    }
    // If world is valid, don't set status here - wait for NetworkManager
    // to determine if we're online (server connected) or explorer (server unavailable)
  }

  private setupModeToggle(): void {
    const moveBtn = document.getElementById("mode-move");
    const buildBtn = document.getElementById("mode-build");

    moveBtn?.addEventListener("click", () => stateManager.setMode("move"));
    buildBtn?.addEventListener("click", () => stateManager.setMode("build"));
  }

  private setupViewToggle(): void {
    const thirdBtn = document.getElementById("view-third");
    const firstBtn = document.getElementById("view-first");

    thirdBtn?.addEventListener("click", () => stateManager.setViewMode("third-person"));
    firstBtn?.addEventListener("click", () => stateManager.setViewMode("first-person"));
  }

  private setupBuildOptions(): void {
    const freePlacementBtn = document.getElementById("free-placement-btn");
    const capturePrefabBtn = document.getElementById("capture-prefab-btn");
    const wireframeBtn = document.getElementById("wireframe-btn");
    const materialsBtn = document.getElementById("materials-btn");

    freePlacementBtn?.addEventListener("click", () => {
      stateManager.toggleFreePlacement();
    });

    capturePrefabBtn?.addEventListener("click", () => {
      stateManager.togglePrefabCaptureMode();
    });

    wireframeBtn?.addEventListener("click", () => {
      stateManager.toggleRenderMode();
    });

    materialsBtn?.addEventListener("click", () => {
      stateManager.toggleShowMaterials();
    });
  }

  private setupSelectionActionMenu(): void {
    const cutBtn = document.getElementById("selection-cut-btn");
    const copyBtn = document.getElementById("selection-copy-btn");
    const deleteBtn = document.getElementById("selection-delete-btn");
    const prefabBtn = document.getElementById("selection-prefab-btn");
    const cancelBtn = document.getElementById("selection-cancel-btn");

    cutBtn?.addEventListener("click", () => {
      if (this.isActionProcessing) return;
      this.isActionProcessing = true;
      this.hideSelectionActionMenu();
      this.onSelectionCut?.();
      // Reset after a short delay to allow action to complete
      setTimeout(() => { this.isActionProcessing = false; }, 300);
    });

    copyBtn?.addEventListener("click", () => {
      if (this.isActionProcessing) return;
      this.isActionProcessing = true;
      this.hideSelectionActionMenu();
      this.onSelectionCopy?.();
      setTimeout(() => { this.isActionProcessing = false; }, 300);
    });

    deleteBtn?.addEventListener("click", () => {
      if (this.isActionProcessing) return;
      this.isActionProcessing = true;
      this.hideSelectionActionMenu();
      this.onSelectionDelete?.();
      setTimeout(() => { this.isActionProcessing = false; }, 300);
    });

    prefabBtn?.addEventListener("click", () => {
      if (this.isActionProcessing) return;
      this.isActionProcessing = true;
      this.hideSelectionActionMenu();
      this.showPrefabModal(this.pendingBlockCount);
      setTimeout(() => { this.isActionProcessing = false; }, 300);
    });

    cancelBtn?.addEventListener("click", () => {
      if (this.isActionProcessing) return;
      this.isActionProcessing = true;
      this.hideSelectionActionMenu();
      emitEvent("selection:cancelled", undefined);
      setTimeout(() => { this.isActionProcessing = false; }, 300);
    });
  }

  private showSelectionActionMenu(blockCount: number): void {
    if (!this.selectionActionMenu) return;

    // Reset processing flag when showing menu for new selection
    this.isActionProcessing = false;
    this.pendingBlockCount = blockCount;
    const blockCountSpan = document.getElementById("selection-block-count");
    if (blockCountSpan) {
      blockCountSpan.textContent = `${blockCount} blocks selected`;
    }

    this.selectionActionMenu.classList.add("visible");
  }

  private hideSelectionActionMenu(): void {
    this.selectionActionMenu?.classList.remove("visible");
  }

  private setupPrefabModal(): void {
    const cancelBtn = document.getElementById("prefab-cancel-btn");
    const saveBtn = document.getElementById("prefab-save-btn");
    const nameInput = document.getElementById("prefab-name") as HTMLInputElement;

    cancelBtn?.addEventListener("click", () => {
      this.hidePrefabModal();
      emitEvent("prefabCapture:cancelled", undefined);
    });

    saveBtn?.addEventListener("click", () => {
      this.savePrefab();
    });

    // Enable/disable save button based on name input
    nameInput?.addEventListener("input", () => {
      if (saveBtn) {
        (saveBtn as HTMLButtonElement).disabled = !nameInput.value.trim();
      }
    });
  }

  private setupJoinWorldModal(): void {
    const joinWorldBtn = document.getElementById("join-world-btn");
    const cancelBtn = document.getElementById("join-world-cancel-btn");
    const connectBtn = document.getElementById("join-world-connect-btn");
    const worldIdInput = document.getElementById("world-id-input") as HTMLInputElement;

    joinWorldBtn?.addEventListener("click", () => {
      this.showJoinWorldModal();
    });

    cancelBtn?.addEventListener("click", () => {
      this.hideJoinWorldModal();
    });

    connectBtn?.addEventListener("click", () => {
      this.connectToWorld();
    });

    // Enable/disable connect button based on input
    worldIdInput?.addEventListener("input", () => {
      if (connectBtn) {
        (connectBtn as HTMLButtonElement).disabled = !worldIdInput.value.trim();
      }
    });

    // Allow Enter key to submit
    worldIdInput?.addEventListener("keydown", (e) => {
      if (e.key === "Enter" && worldIdInput.value.trim()) {
        this.connectToWorld();
      }
    });
  }

  private showJoinWorldModal(): void {
    if (!this.joinWorldModal) return;

    const worldIdInput = document.getElementById("world-id-input") as HTMLInputElement;
    const connectBtn = document.getElementById("join-world-connect-btn") as HTMLButtonElement;

    if (worldIdInput) worldIdInput.value = "";
    if (connectBtn) connectBtn.disabled = true;

    this.joinWorldModal.classList.add("visible");
    worldIdInput?.focus();
  }

  private hideJoinWorldModal(): void {
    this.joinWorldModal?.classList.remove("visible");
  }

  private async connectToWorld(): Promise<void> {
    const worldIdInput = document.getElementById("world-id-input") as HTMLInputElement;
    const connectBtn = document.getElementById("join-world-connect-btn") as HTMLButtonElement;

    const worldId = worldIdInput?.value.trim();
    console.log("connectToWorld called with:", worldId);
    if (!worldId) return;

    // Disable button while connecting
    if (connectBtn) {
      connectBtn.disabled = true;
      connectBtn.textContent = "Connecting...";
    }

    // Validate the world ID exists in Strapi
    console.log("Setting world ID and validating...");
    setWorldId(worldId);
    const worldInfo = await validateWorldId();
    console.log("World ID validation result:", worldInfo);

    if (worldInfo) {
      this.hideJoinWorldModal();
      // Don't set status here - wait for NetworkManager to determine online vs explorer
      // The world:connected event will trigger initializeNetworking which sets the mode
      console.log("Emitting world:connected event");
      emitEvent("world:connected", { worldId });
    } else {
      this.updateWorldStatus("error", "World not found in cloud.");
      clearWorldId(); // Clear invalid world ID
      if (connectBtn) {
        connectBtn.disabled = false;
        connectBtn.textContent = "Connect";
      }
    }
  }

  private updateWorldStatus(status: "connected" | "error" | "offline" | "none", info?: WorldInfo | string): void {
    const statusEl = document.getElementById("world-status");
    const joinBtn = document.getElementById("join-world-btn");

    if (!statusEl) return;

    // Clear all status classes
    statusEl.classList.remove("connected", "error", "offline");

    if (status === "none") {
      statusEl.style.display = "none";
      if (joinBtn) joinBtn.style.display = "block";
      return;
    }

    statusEl.classList.add(status);

    if (status === "connected" && typeof info === "object") {
      // Show world name and version (e.g., "My World v1.0")
      const displayName = `${info.name} v${info.version}`;
      statusEl.innerHTML = `☁️ ${displayName} <button id="leave-world-btn" class="leave-btn">Leave</button>`;
      statusEl.style.display = "flex";

      // Hide join button when connected
      if (joinBtn) joinBtn.style.display = "none";

      // Wire up leave button
      const leaveBtn = document.getElementById("leave-world-btn");
      leaveBtn?.addEventListener("click", () => this.leaveWorld());
    } else if (status === "offline") {
      // Single player mode - show with icon
      statusEl.innerHTML = `🎮 Single Player`;
      statusEl.style.display = "flex";
      if (joinBtn) joinBtn.style.display = "block";
    } else {
      // Error status - info is a string message
      statusEl.textContent = (typeof info === "string" ? info : null) || status;
      statusEl.style.display = "block";
      if (joinBtn) joinBtn.style.display = "block";
    }
  }

  private leaveWorld(): void {
    clearWorldId();
    this.updateWorldStatus("offline", "Single Player");
    emitEvent("world:disconnected", undefined);
    this.showMessage("Switched to single player", 2000);
  }

  private showPrefabModal(blockCount: number): void {
    if (!this.prefabModal) return;

    // Reset form
    const nameInput = document.getElementById("prefab-name") as HTMLInputElement;
    const descInput = document.getElementById("prefab-description") as HTMLInputElement;
    const categorySelect = document.getElementById("prefab-category") as HTMLSelectElement;
    const blockCountSpan = document.getElementById("prefab-block-count");
    const saveBtn = document.getElementById("prefab-save-btn") as HTMLButtonElement;

    if (nameInput) nameInput.value = "";
    if (descInput) descInput.value = "";
    if (categorySelect) categorySelect.value = "user-created";
    if (blockCountSpan) blockCountSpan.textContent = `${blockCount} blocks selected`;
    if (saveBtn) saveBtn.disabled = true;

    this.prefabModal.classList.add("visible");

    // Focus name input
    nameInput?.focus();
  }

  private hidePrefabModal(): void {
    this.prefabModal?.classList.remove("visible");
    this.pendingPrefabBlocks = [];
  }

  private async savePrefab(): Promise<void> {
    const nameInput = document.getElementById("prefab-name") as HTMLInputElement;
    const descInput = document.getElementById("prefab-description") as HTMLInputElement;
    const categorySelect = document.getElementById("prefab-category") as HTMLSelectElement;

    const name = nameInput?.value.trim();
    if (!name) return;

    // Get blocks from capture system
    if (this.getSelectedBlocks) {
      this.pendingPrefabBlocks = this.getSelectedBlocks();
    }

    if (this.pendingPrefabBlocks.length === 0) {
      this.showMessage("No blocks selected", 2000);
      return;
    }

    const prefabId = generatePrefabId();
    const description = descInput?.value.trim() || "";
    const category = (categorySelect?.value || "user-created") as PrefabCategory;

    const prefabPayload = {
      prefabId,
      name,
      description,
      blocks: this.pendingPrefabBlocks,
      category,
      sortOrder: 100,
      isActive: true,
      createdBy: "player",
      metadata: {},
    };

    // Try to save to Strapi first
    const savedPrefab = await savePrefabToStrapi(prefabPayload);

    if (savedPrefab) {
      this.showMessage(`Prefab "${name}" saved to server!`, 2000);
      emitEvent("prefabCapture:saved", { prefabId, name });
    } else {
      // Fallback to local save if Strapi fails
      savePrefabLocally(prefabPayload);
      this.showMessage(`Prefab "${name}" saved locally (server unavailable)`, 3000);
      emitEvent("prefabCapture:saved", { prefabId, name });
    }

    // Refresh prefabs data and menu
    refreshPrefabs();
    this.refreshPrefabMenu();

    this.hidePrefabModal();
    stateManager.setPrefabCaptureMode(false);
  }

  public refreshPrefabMenu(): void {
    if (!this.prefabMenuContainer) return;

    // Clear existing prefabs (keep title)
    const title = this.prefabMenuContainer.querySelector(".menu-title");
    this.prefabMenuContainer.innerHTML = "";
    if (title) {
      this.prefabMenuContainer.appendChild(title);
    } else {
      const newTitle = document.createElement("div");
      newTitle.className = "menu-title";
      newTitle.textContent = "Prefabs";
      this.prefabMenuContainer.appendChild(newTitle);
    }

    // Re-add prefabs
    const prefabs = getAllPrefabs();
    prefabs.forEach((prefab) => {
      const button = this.createPrefabButton(prefab);
      this.prefabMenuContainer!.appendChild(button);
    });
  }

  private setupStructureMenu(): void {
    if (!this.structureMenuContainer) return;

    // Add title
    const title = document.createElement("div");
    title.className = "menu-title";
    title.textContent = "Blocks";
    this.structureMenuContainer.appendChild(title);

    // Add grid container for blocks
    const grid = document.createElement("div");
    grid.className = "menu-grid";
    this.structureMenuContainer.appendChild(grid);

    // Enable horizontal scrolling with mouse wheel
    grid.addEventListener("wheel", (e) => {
      if (e.deltaY !== 0) {
        e.preventDefault();
        grid.scrollLeft += e.deltaY;
      }
    }, { passive: false });

    const structures = getAllStructures();

    structures.forEach((structure) => {
      const button = this.createStructureButton(structure);
      grid.appendChild(button);
    });
  }

  public refreshBlockMenu(): void {
    if (!this.structureMenuContainer) return;

    // Clear existing blocks (keep title)
    const title = this.structureMenuContainer.querySelector(".menu-title");
    this.structureMenuContainer.innerHTML = "";

    if (title) {
      this.structureMenuContainer.appendChild(title);
    } else {
      const newTitle = document.createElement("div");
      newTitle.className = "menu-title";
      newTitle.textContent = "Blocks";
      this.structureMenuContainer.appendChild(newTitle);
    }

    // Add grid container for blocks
    const grid = document.createElement("div");
    grid.className = "menu-grid";
    this.structureMenuContainer.appendChild(grid);

    // Enable horizontal scrolling with mouse wheel
    grid.addEventListener("wheel", (e) => {
      if (e.deltaY !== 0) {
        e.preventDefault();
        grid.scrollLeft += e.deltaY;
      }
    }, { passive: false });

    // Re-add blocks
    const structures = getAllStructures();
    structures.forEach((structure) => {
      const button = this.createStructureButton(structure);
      grid.appendChild(button);
    });
  }

  private setupPrefabMenu(): void {
    if (!this.prefabMenuContainer) return;

    // Add title
    const title = document.createElement("div");
    title.className = "menu-title";
    title.textContent = "Prefabs";
    this.prefabMenuContainer.appendChild(title);

    const prefabs = getAllPrefabs();

    prefabs.forEach((prefab) => {
      const button = this.createPrefabButton(prefab);
      this.prefabMenuContainer!.appendChild(button);
    });
  }

  private createPrefabButton(prefab: PrefabDefinition): HTMLButtonElement {
    const button = document.createElement("button");
    button.className = "prefab-btn";
    button.dataset.prefabId = prefab.id;
    button.innerHTML = `
      <span class="prefab-name">${prefab.name}</span>
      <span class="prefab-desc">${prefab.description}</span>
    `;

    button.addEventListener("click", () => {
      emitEvent("prefab:selected", { prefabId: prefab.id });
    });

    return button;
  }

  private createStructureButton(structure: StructureDefinition): HTMLButtonElement {
    const button = document.createElement("button");
    button.className = "structure-btn";
    button.dataset.structureId = structure.id;
    button.innerHTML = `
      <span class="structure-icon" style="background-color: #${structure.color.toString(16).padStart(6, "0")}"></span>
      <span class="structure-name">${structure.name}</span>
    `;

    button.addEventListener("click", () => {
      stateManager.selectStructure(structure.id);
    });

    // Right-click to edit block material properties
    button.addEventListener("contextmenu", (e) => {
      e.preventDefault();
      this.openBlockEditor(structure.id);
    });

    return button;
  }

  private setupEventListeners(): void {
    // Listen to state changes
    onEvent("state:modeChanged", ({ mode }) => {
      this.updateModeUI(mode);
    });

    onEvent("state:viewModeChanged", ({ viewMode }) => {
      this.updateViewModeUI(viewMode);
    });

    onEvent("structure:selected", ({ structureId }) => {
      this.updateStructureSelection(structureId);
    });

    onEvent("structure:placementCancelled", () => {
      this.clearStructureSelection();
    });

    onEvent("structure:placed", () => {
      // Structure menu stays visible for continuous placement
    });

    onEvent("state:freePlacementChanged", ({ enabled }) => {
      this.updateFreePlacementUI(enabled);
    });

    onEvent("state:prefabCaptureChanged", ({ active }) => {
      this.updatePrefabCaptureUI(active);
    });

    // Show selection action menu when selection completes
    onEvent("selection:complete", ({ blockCount }) => {
      this.showSelectionActionMenu(blockCount);
    });

    // Also listen to legacy event for backward compatibility
    onEvent("prefabCapture:selectionComplete", ({ blockCount }) => {
      // Only show if selection action menu isn't already visible
      if (!this.selectionActionMenu?.classList.contains("visible")) {
        this.showSelectionActionMenu(blockCount);
      }
    });

    onEvent("structure:levelChanged", ({ level }) => {
      this.updateBuildLevelUI(level);
    });

    onEvent("state:renderModeChanged", ({ renderMode }) => {
      this.updateRenderModeUI(renderMode === "wireframe");
    });

    onEvent("state:showMaterialsChanged", ({ show }) => {
      this.updateMaterialsUI(show);
    });

    onEvent("state:connectionModeChanged", ({ connectionMode }) => {
      this.updateConnectionModeUI(connectionMode);
    });

    // Capture mode also uses the same level display via structure:levelChanged event
  }

  private async updateConnectionModeUI(connectionMode: ConnectionMode): Promise<void> {
    // Update save button state based on connection mode
    const saveBtn = document.getElementById("save-btn") as HTMLButtonElement;
    if (saveBtn) {
      if (connectionMode === "explorer") {
        saveBtn.disabled = false;
        saveBtn.title = "Save temporarily (will be lost when leaving)";
        saveBtn.textContent = "⏳ Save";
      } else if (connectionMode === "online" || connectionMode === "dev") {
        saveBtn.disabled = false;
        saveBtn.title = connectionMode === "dev" ? "Save to Strapi (dev mode)" : "Save to cloud";
        saveBtn.textContent = "☁️ Save";
      } else {
        saveBtn.disabled = false;
        saveBtn.title = "Save locally";
        saveBtn.textContent = "💾 Save";
      }
    }

    // Update world status display based on connection mode
    const statusEl = document.getElementById("world-status");
    const joinBtn = document.getElementById("join-world-btn");

    if (statusEl) {
      // Clear all status classes
      statusEl.classList.remove("connected", "error", "offline", "explorer", "online", "dev");

      if (connectionMode === "single-player") {
        statusEl.classList.add("offline");
        statusEl.innerHTML = `🎮 Single Player`;
        statusEl.style.display = "flex";
        if (joinBtn) joinBtn.style.display = "block";
      } else if (connectionMode === "dev") {
        // Dev/Builder mode - can save directly to Strapi
        const worldInfo = await validateWorldId();
        const worldName = worldInfo?.name || "World";
        statusEl.classList.add("dev");
        statusEl.innerHTML = `🔧 Builder: ${worldName} <button id="leave-world-btn" class="leave-btn">Leave</button>`;
        statusEl.style.display = "flex";
        if (joinBtn) joinBtn.style.display = "none";
        // Wire up leave button
        document.getElementById("leave-world-btn")?.addEventListener("click", () => this.leaveWorld());
      } else if (connectionMode === "explorer") {
        statusEl.classList.add("explorer");
        statusEl.innerHTML = `👁️ Explorer <button id="leave-world-btn" class="leave-btn">Leave</button>`;
        statusEl.style.display = "flex";
        if (joinBtn) joinBtn.style.display = "none";
        // Wire up leave button
        document.getElementById("leave-world-btn")?.addEventListener("click", () => this.leaveWorld());
      } else if (connectionMode === "online") {
        // Get world info to show the name
        const worldInfo = await validateWorldId();
        const worldName = worldInfo?.name || "Online World";
        statusEl.classList.add("online");
        statusEl.innerHTML = `☁️ ${worldName} <button id="leave-world-btn" class="leave-btn">Leave</button>`;
        statusEl.style.display = "flex";
        if (joinBtn) joinBtn.style.display = "none";
        // Wire up leave button
        document.getElementById("leave-world-btn")?.addEventListener("click", () => this.leaveWorld());
      }
    }
  }

  private updateBuildLevelUI(level: number): void {
    const levelDisplay = document.getElementById("build-level-display");
    if (levelDisplay) {
      // Display 1-based level (internal is 0-based)
      levelDisplay.textContent = `Level: ${level + 1}`;
    }
  }

  private updateModeUI(mode: GameMode): void {
    const moveBtn = document.getElementById("mode-move");
    const buildBtn = document.getElementById("mode-build");

    moveBtn?.classList.toggle("active", mode === "move");
    buildBtn?.classList.toggle("active", mode === "build");

    this.structureMenuContainer?.classList.toggle("visible", mode === "build");
    this.prefabMenuContainer?.classList.toggle("visible", mode === "build");
    this.buildOptionsContainer?.classList.toggle("visible", mode === "build");
  }

  private updateFreePlacementUI(enabled: boolean): void {
    const freePlacementBtn = document.getElementById("free-placement-btn");
    freePlacementBtn?.classList.toggle("active", enabled);
  }

  private updateRenderModeUI(wireframe: boolean): void {
    const wireframeBtn = document.getElementById("wireframe-btn");
    wireframeBtn?.classList.toggle("active", wireframe);
  }

  private updateMaterialsUI(showMaterials: boolean): void {
    const materialsBtn = document.getElementById("materials-btn");
    materialsBtn?.classList.toggle("active", showMaterials);
  }

  private updatePrefabCaptureUI(active: boolean): void {
    const capturePrefabBtn = document.getElementById("capture-prefab-btn");
    capturePrefabBtn?.classList.toggle("active", active);

    // Reset level display when exiting capture mode
    if (!active) {
      const levelDisplay = document.getElementById("build-level-display");
      if (levelDisplay) {
        levelDisplay.textContent = "Level: 0";
      }
    }
  }

  private updateViewModeUI(viewMode: ViewMode): void {
    const thirdBtn = document.getElementById("view-third");
    const firstBtn = document.getElementById("view-first");

    thirdBtn?.classList.toggle("active", viewMode === "third-person");
    firstBtn?.classList.toggle("active", viewMode === "first-person");

    // Hide mode toggle in first-person
    if (this.modeToggleContainer) {
      this.modeToggleContainer.style.display = viewMode === "first-person" ? "none" : "flex";
    }

    // Update controls hints based on view mode
    this.updateControlsHints(viewMode);
  }

  private updateControlsHints(_viewMode: ViewMode): void {
    // Could dynamically update the controls panel based on current mode
    // For now, the static HTML covers both modes
  }

  private updateStructureSelection(structureId: string): void {
    document.querySelectorAll(".structure-btn").forEach((btn) => {
      const btnElement = btn as HTMLElement;
      btn.classList.toggle("selected", btnElement.dataset.structureId === structureId);
    });
  }

  private clearStructureSelection(): void {
    document.querySelectorAll(".structure-btn").forEach((btn) => {
      btn.classList.remove("selected");
    });
  }

  /**
   * Update to show single player mode (called when server connection fails)
   */
  showSinglePlayerMode(): void {
    this.updateWorldStatus("offline", "Single Player");
  }

  /**
   * Show a temporary message on screen
   */
  showMessage(message: string, duration: number = 2000): void {
    const messageEl = document.createElement("div");
    messageEl.className = "ui-message";
    messageEl.textContent = message;
    messageEl.style.cssText = `
      position: fixed;
      top: 50%;
      left: 50%;
      transform: translate(-50%, -50%);
      background: rgba(0, 0, 0, 0.8);
      color: white;
      padding: 15px 30px;
      border-radius: 8px;
      font-family: sans-serif;
      z-index: 1000;
    `;

    document.body.appendChild(messageEl);

    setTimeout(() => {
      messageEl.remove();
    }, duration);
  }

  // ==================== Block Editor ====================

  private setupBlockEditorModal(): void {
    const cancelBtn = document.getElementById("block-editor-cancel-btn");
    const applyBtn = document.getElementById("block-editor-apply-btn");

    cancelBtn?.addEventListener("click", () => {
      this.hideBlockEditor();
    });

    applyBtn?.addEventListener("click", () => {
      this.applyBlockMaterial();
    });

    // Setup slider input handlers
    this.setupSlider("block-metalness", (value) => {
      this.currentEditingMaterial.metalness = value;
      this.updateBlockPreview();
    });

    this.setupSlider("block-roughness", (value) => {
      this.currentEditingMaterial.roughness = value;
      this.updateBlockPreview();
    });

    this.setupSlider("block-emissive-intensity", (value) => {
      this.currentEditingMaterial.emissiveIntensity = value;
      this.updateBlockPreview();
    });

    this.setupSlider("block-opacity", (value) => {
      this.currentEditingMaterial.opacity = value;
      this.updateBlockPreview();
    });

    // Color picker
    const emissiveColorInput = document.getElementById("block-emissive-color") as HTMLInputElement;
    const emissiveColorValue = document.getElementById("block-emissive-color-value");
    emissiveColorInput?.addEventListener("input", () => {
      this.currentEditingMaterial.emissive = emissiveColorInput.value;
      if (emissiveColorValue) emissiveColorValue.textContent = emissiveColorInput.value;
      this.updateBlockPreview();
    });

    // Checkbox
    const transparentCheckbox = document.getElementById("block-transparent") as HTMLInputElement;
    transparentCheckbox?.addEventListener("change", () => {
      this.currentEditingMaterial.transparent = transparentCheckbox.checked;
      this.updateBlockPreview();
    });
  }

  private setupSlider(id: string, onChange: (value: number) => void): void {
    const slider = document.getElementById(id) as HTMLInputElement;
    const valueDisplay = document.getElementById(`${id}-value`);

    slider?.addEventListener("input", () => {
      const value = parseFloat(slider.value);
      if (valueDisplay) {
        valueDisplay.textContent = value.toFixed(value < 1 ? 2 : 1);
      }
      onChange(value);
    });
  }

  private openBlockEditor(blockId: string): void {
    if (!this.blockEditorModal) return;

    const block = getBlock(blockId);
    if (!block) return;

    this.currentEditingBlockId = blockId;

    // Get current material or defaults
    const material = block.material || {};
    this.currentEditingMaterial = {
      metalness: material.metalness ?? DEFAULT_MATERIAL.metalness ?? 0,
      roughness: material.roughness ?? DEFAULT_MATERIAL.roughness ?? 0.7,
      emissive: material.emissive || "#000000",
      emissiveIntensity: material.emissiveIntensity ?? 0,
      opacity: material.opacity ?? DEFAULT_MATERIAL.opacity ?? 1,
      transparent: material.transparent ?? DEFAULT_MATERIAL.transparent ?? false,
    };

    // Update UI with current values
    const nameEl = document.getElementById("block-editor-name");
    if (nameEl) nameEl.textContent = block.name;

    this.updateSliderValue("block-metalness", this.currentEditingMaterial.metalness!);
    this.updateSliderValue("block-roughness", this.currentEditingMaterial.roughness!);
    this.updateSliderValue("block-emissive-intensity", this.currentEditingMaterial.emissiveIntensity!);
    this.updateSliderValue("block-opacity", this.currentEditingMaterial.opacity!);

    const emissiveColorInput = document.getElementById("block-emissive-color") as HTMLInputElement;
    const emissiveColorValue = document.getElementById("block-emissive-color-value");
    if (emissiveColorInput) emissiveColorInput.value = this.currentEditingMaterial.emissive || "#000000";
    if (emissiveColorValue) emissiveColorValue.textContent = this.currentEditingMaterial.emissive || "#000000";

    const transparentCheckbox = document.getElementById("block-transparent") as HTMLInputElement;
    if (transparentCheckbox) transparentCheckbox.checked = this.currentEditingMaterial.transparent || false;

    // Update preview
    this.updateBlockPreview();

    // Show modal
    this.blockEditorModal.classList.add("visible");
  }

  private updateSliderValue(id: string, value: number): void {
    const slider = document.getElementById(id) as HTMLInputElement;
    const valueDisplay = document.getElementById(`${id}-value`);

    if (slider) slider.value = String(value);
    if (valueDisplay) valueDisplay.textContent = value.toFixed(value < 1 ? 2 : 1);
  }

  private updateBlockPreview(): void {
    const previewEl = document.getElementById("block-editor-preview");
    if (!previewEl || !this.currentEditingBlockId) return;

    const block = getBlock(this.currentEditingBlockId);
    if (!block) return;

    // Build CSS for preview
    const baseColor = block.color;
    const metalness = this.currentEditingMaterial.metalness || 0;
    const roughness = this.currentEditingMaterial.roughness || 0.7;
    const emissive = this.currentEditingMaterial.emissive || "#000000";
    const emissiveIntensity = this.currentEditingMaterial.emissiveIntensity || 0;
    const opacity = this.currentEditingMaterial.opacity || 1;

    // Create a visual representation
    let background = baseColor;

    // Add metallic sheen effect
    if (metalness > 0.5) {
      const sheen = Math.round(metalness * 60);
      background = `linear-gradient(135deg, ${baseColor} 0%, rgba(255,255,255,${sheen/100}) 50%, ${baseColor} 100%)`;
    }

    // Add emissive glow
    let boxShadow = "";
    if (emissiveIntensity > 0 && emissive !== "#000000") {
      const glowSize = Math.round(emissiveIntensity * 10);
      boxShadow = `0 0 ${glowSize}px ${glowSize/2}px ${emissive}, inset 0 0 ${glowSize}px ${emissive}`;
    }

    previewEl.style.cssText = `
      width: 80px;
      height: 80px;
      border-radius: 8px;
      border: 2px solid rgba(255, 255, 255, 0.2);
      background: ${background};
      opacity: ${opacity};
      box-shadow: ${boxShadow};
      filter: ${roughness < 0.3 ? 'brightness(1.1)' : 'none'};
    `;
  }

  private hideBlockEditor(): void {
    this.blockEditorModal?.classList.remove("visible");
    this.currentEditingBlockId = null;
  }

  private applyBlockMaterial(): void {
    if (!this.currentEditingBlockId) return;

    // Update block in local cache (BlockData)
    updateBlockLocally(this.currentEditingBlockId, this.currentEditingMaterial);

    // Update structure cache (StructureDefinition)
    updateStructureMaterial(this.currentEditingBlockId, this.currentEditingMaterial);

    // Emit event so placed blocks can be updated
    emitEvent("block:materialChanged", {
      blockId: this.currentEditingBlockId,
      material: this.currentEditingMaterial,
    });

    this.showMessage("Material applied! New blocks will use these settings.", 2000);
    this.hideBlockEditor();
  }
}
