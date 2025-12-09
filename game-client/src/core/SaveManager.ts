import { stateManager } from "./StateManager";
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
} from "./SaveSystem";
import { PlacementSystem } from "../structures/PlacementSystem";

export interface SaveManagerConfig {
  placementSystem: PlacementSystem;
}

export interface SaveManagerCallbacks {
  onShowMessage?: (message: string, duration: number) => void;
  onSendWorldSave?: () => void;
  onSendWorldReset?: () => void;
  isMultiplayer?: () => boolean;
}

export class SaveManager {
  private placementSystem: PlacementSystem;

  // Callbacks
  private onShowMessage: ((message: string, duration: number) => void) | null = null;
  private onSendWorldSave: (() => void) | null = null;
  private onSendWorldReset: (() => void) | null = null;
  private isMultiplayer: (() => boolean) | null = null;

  constructor(config: SaveManagerConfig) {
    this.placementSystem = config.placementSystem;
  }

  /**
   * Set callbacks for external communication
   */
  setCallbacks(callbacks: SaveManagerCallbacks): void {
    if (callbacks.onShowMessage) this.onShowMessage = callbacks.onShowMessage;
    if (callbacks.onSendWorldSave) this.onSendWorldSave = callbacks.onSendWorldSave;
    if (callbacks.onSendWorldReset) this.onSendWorldReset = callbacks.onSendWorldReset;
    if (callbacks.isMultiplayer) this.isMultiplayer = callbacks.isMultiplayer;
  }

  /**
   * Setup save control buttons
   */
  setupSaveControls(): void {
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
        this.onShowMessage?.("Local save data cleared", 2000);
        this.updateSaveButtonState();
      }
    });

    // Update button state based on save existence
    this.updateSaveButtonState();
  }

  /**
   * Save the current game based on connection mode
   */
  async saveCurrentGame(): Promise<void> {
    const blocks = this.placementSystem.exportBlocks() as SavedBlock[];
    const connectionMode = stateManager.getConnectionMode();
    const multiplayer = this.isMultiplayer?.() ?? false;
    console.log(`Saving ${blocks.length} blocks, mode=${connectionMode}, isMultiplayer=${multiplayer}`);

    if (connectionMode === "online" && multiplayer) {
      // Online mode: request server to save to Strapi
      console.log("Requesting server to save...");
      this.onShowMessage?.("Saving to cloud...", 1000);
      this.onSendWorldSave?.();
      return;
    }

    if (connectionMode === "dev") {
      // Dev mode: save directly to Strapi (no game server needed)
      console.log("Dev mode, saving directly to Strapi");
      this.onShowMessage?.("Saving to Strapi...", 1000);
      const success = await saveToStrapi(blocks);
      if (success) {
        this.onShowMessage?.(`Saved ${blocks.length} blocks to Strapi`, 2000);
      } else {
        this.onShowMessage?.("Failed to save to Strapi", 2000);
      }
      return;
    }

    if (connectionMode === "explorer") {
      // Explorer mode: save to temp localStorage (will be wiped on leave)
      console.log("Explorer mode, saving to temp storage");
      const success = saveExplorerGame(blocks);
      if (success) {
        this.onShowMessage?.(`Saved ${blocks.length} blocks (temporary)`, 2000);
      } else {
        this.onShowMessage?.("Failed to save", 2000);
      }
      return;
    }

    // Single player mode: save to personal localStorage
    console.log("Single player mode, saving to localStorage");
    const success = saveGame(blocks);
    if (success) {
      this.onShowMessage?.(`Saved ${blocks.length} blocks locally`, 2000);
    } else {
      this.onShowMessage?.("Failed to save", 2000);
    }
  }

  /**
   * Load saved game based on connection mode
   */
  async loadSavedGame(): Promise<void> {
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

        this.onShowMessage?.(`Explorer Mode: Loaded ${count} blocks from cloud`, 3000);
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
  loadLocalGame(): void {
    if (hasSave()) {
      const saveData = loadGame();
      if (saveData && saveData.blocks.length > 0) {
        const count = this.placementSystem.importBlocks(saveData.blocks);
        console.log(`Loaded ${count} blocks from localStorage`);
        this.onShowMessage?.(`Loaded ${count} blocks from local storage`, 3000);
      } else {
        this.onShowMessage?.("Single player: No saved data", 2000);
      }
    } else {
      this.onShowMessage?.("Single player: No saved data", 2000);
    }
    this.updateSaveButtonState();
  }

  /**
   * Reset the game world
   */
  async resetGame(): Promise<void> {
    // Clear all placed blocks
    this.placementSystem.clearAll();

    // Only clear localStorage (Strapi world is not deleted)
    deleteSave();

    // If multiplayer, tell server to reset too
    this.onSendWorldReset?.();

    this.onShowMessage?.("World reset", 2000);
    this.updateSaveButtonState();
  }

  /**
   * Update save button state based on connection status
   */
  updateSaveButtonState(): void {
    const saveBtn = document.getElementById("save-btn");
    const clearLocalBtn = document.getElementById("clear-local-btn");
    const multiplayer = this.isMultiplayer?.() ?? false;

    if (saveBtn) {
      // Update button text to show connection status (cloud if multiplayer, local if offline)
      const icon = multiplayer ? "☁️" : "💾";
      saveBtn.textContent = `${icon} Save`;

      if (hasSave()) {
        saveBtn.classList.add("saved");
      } else {
        saveBtn.classList.remove("saved");
      }
    }

    // Hide clear local button when online
    if (clearLocalBtn) {
      clearLocalBtn.style.display = multiplayer ? "none" : "block";
    }
  }
}
