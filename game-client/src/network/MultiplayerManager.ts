import * as THREE from "three";
import { NetworkManager } from "./NetworkManager";
import { NetworkBlock, NetworkPlayer, NetworkBlockMaterial } from "./NetworkProtocol";
import { PlayerState } from "../core/PlayerState";
import { PlacementSystem } from "../structures/PlacementSystem";
import { PlayerController } from "../core/PlayerController";
import { CameraSystem } from "../systems/CameraSystem";
import { Character } from "../entities/Character";
import { RemotePlayer } from "../entities/RemotePlayer";
import { InputManager } from "../core/InputManager";
import { stateManager } from "../core/StateManager";
import { getWorldId } from "../core/SaveSystem";
import { UIManager } from "../ui/UIManager";

export interface MultiplayerManagerConfig {
  scene: THREE.Scene;
  placementSystem: PlacementSystem;
  playerController: PlayerController;
  cameraSystem: CameraSystem;
  character: Character;
  inputManager: InputManager;
}

export interface MultiplayerManagerCallbacks {
  onLoadSavedGame?: () => Promise<void>;
  onUpdateSaveButtonState?: () => void;
}

export class MultiplayerManager {
  private scene: THREE.Scene;
  private placementSystem: PlacementSystem;
  private playerController: PlayerController;
  private cameraSystem: CameraSystem;
  private character: Character;
  private inputManager: InputManager;

  // Optional references
  private uiManager: UIManager | null = null;

  // Network state
  private networkManager: NetworkManager | null = null;
  private remotePlayers: Map<string, RemotePlayer> = new Map();
  private localPlayerId: string | null = null;
  private isMultiplayer = false;
  private intentionalDisconnect = false;

  // Callbacks
  private onLoadSavedGame: (() => Promise<void>) | null = null;
  private onUpdateSaveButtonState: (() => void) | null = null;

  constructor(config: MultiplayerManagerConfig) {
    this.scene = config.scene;
    this.placementSystem = config.placementSystem;
    this.playerController = config.playerController;
    this.cameraSystem = config.cameraSystem;
    this.character = config.character;
    this.inputManager = config.inputManager;
  }

  /**
   * Set optional UI manager reference
   */
  setUIManager(uiManager: UIManager | null): void {
    this.uiManager = uiManager;
  }

  /**
   * Set callbacks for external events
   */
  setCallbacks(callbacks: MultiplayerManagerCallbacks): void {
    if (callbacks.onLoadSavedGame) this.onLoadSavedGame = callbacks.onLoadSavedGame;
    if (callbacks.onUpdateSaveButtonState) this.onUpdateSaveButtonState = callbacks.onUpdateSaveButtonState;
  }

  /**
   * Check if currently in multiplayer mode
   */
  isInMultiplayerMode(): boolean {
    return this.isMultiplayer;
  }

  /**
   * Get the local player ID
   */
  getLocalPlayerId(): string | null {
    return this.localPlayerId;
  }

  /**
   * Get the network manager instance
   */
  getNetworkManager(): NetworkManager | null {
    return this.networkManager;
  }

  /**
   * Initialize networking for multiplayer
   */
  initialize(): void {
    // Use WebSocket server URL from environment (empty = no game server)
    const serverUrl = import.meta.env.VITE_SOCKET_URL || "";
    const worldId = getWorldId();
    const isDevMode = import.meta.env.VITE_DEV_MODE === "true";

    // If no world ID, skip server connection and use single player mode
    if (!worldId) {
      console.log("No world ID, entering single player mode");
      stateManager.setConnectionMode("single-player");
      this.onLoadSavedGame?.();
      return;
    }

    // If dev mode enabled, skip game server and save directly to Strapi
    if (isDevMode) {
      console.log("Dev mode enabled, entering builder mode (saves directly to Strapi)");
      stateManager.setConnectionMode("dev");
      this.onLoadSavedGame?.();
      return;
    }

    // If no game server URL configured, go straight to explorer mode
    if (!serverUrl) {
      console.log("No game server URL configured, entering explorer mode");
      stateManager.setConnectionMode("explorer");
      this.onLoadSavedGame?.();
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
        this.onUpdateSaveButtonState?.();

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
          await this.onLoadSavedGame?.();
        } else {
          // No world ID - pure single player mode
          console.log("No world ID, entering single player mode");
          stateManager.setConnectionMode("single-player");
          await this.onLoadSavedGame?.();
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
            block.rotation,
            block.material
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
            block.rotation,
            block.material
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
   * Disconnect from the server intentionally
   */
  disconnect(): void {
    this.intentionalDisconnect = true;
    this.networkManager?.disconnect();
  }

  /**
   * Reconnect to a world
   */
  reconnect(_worldId: string): void {
    // Disconnect first if connected
    if (this.networkManager) {
      this.networkManager.disconnect();
      this.networkManager = null;
    }
    // Re-initialize will pick up the new world ID
    this.initialize();
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
  sendInputsToServer(): void {
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
   * Send block placement to server
   */
  sendBlockPlaced(x: number, y: number, z: number, blockId: string, material?: NetworkBlockMaterial): void {
    if (this.isMultiplayer && this.networkManager) {
      this.networkManager.sendBlockPlaced({
        x,
        y,
        z,
        structureId: blockId,
        rotation: 0,
        material,
      });
    }
  }

  /**
   * Send block removal to server
   */
  sendBlockRemoved(x: number, y: number, z: number): void {
    if (this.isMultiplayer && this.networkManager) {
      this.networkManager.sendBlockRemoved(x, y, z);
    }
  }

  /**
   * Send world save request to server
   */
  sendWorldSave(): void {
    if (this.isMultiplayer && this.networkManager) {
      this.networkManager.sendWorldSave();
    }
  }

  /**
   * Send world reset request to server
   */
  sendWorldReset(): void {
    if (this.isMultiplayer && this.networkManager) {
      this.networkManager.sendWorldReset();
    }
  }

  /**
   * Update all remote players (call in game loop)
   */
  updateRemotePlayers(deltaTime: number): void {
    for (const [, remotePlayer] of this.remotePlayers) {
      remotePlayer.update(deltaTime);
    }
  }

  /**
   * Clean up all resources
   */
  dispose(): void {
    // Remove all remote players
    for (const [, remotePlayer] of this.remotePlayers) {
      remotePlayer.dispose(this.scene);
    }
    this.remotePlayers.clear();

    // Disconnect from server
    this.networkManager?.disconnect();
    this.networkManager = null;
  }
}
