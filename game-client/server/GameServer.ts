/**
 * GameServer - WebSocket server for multiplayer synchronization
 *
 * Handles:
 * - Player connections and disconnections
 * - Input processing and state updates
 * - Block placement synchronization
 * - Broadcasting state to all clients
 */

import { WebSocketServer, WebSocket } from "ws";
import {
  ServerMessage,
  ClientMessage,
  PlayerInputMessage,
  NetworkBlock,
  NetworkPlayer,
  WelcomeMessage,
  PlayerJoinMessage,
  PlayerLeaveMessage,
  PlayerStateMessage,
  BlockPlacedMessage,
  BlockRemovedMessage,
  getPlayerColor,
} from "../src/network/NetworkProtocol.js";
import {
  PlayerState,
  createDefaultPlayerState,
} from "../src/core/PlayerState.js";

const PORT = 3001;
const TICK_RATE = 20; // Server ticks per second
const TICK_INTERVAL = 1000 / TICK_RATE;

// Strapi configuration
const STRAPI_URL = "http://localhost:1337";
const STRAPI_SAVE_ENDPOINT = `${STRAPI_URL}/api/saves`;
const SAVE_INTERVAL = 10000; // Auto-save every 10 seconds

// Strapi response types
interface SaveData {
  version: number;
  timestamp: string;
  blocks: Array<{ blockId: string; x: number; y: number; z: number }>;
}

interface StrapiSaveResponse {
  data: {
    id: number;
    documentId: string;
    data: SaveData;
  };
}

interface StrapiSaveListResponse {
  data: Array<{
    id: number;
    documentId: string;
    data: SaveData;
  }>;
}

interface ConnectedPlayer {
  ws: WebSocket;
  playerId: string;
  state: PlayerState;
  color: string;
  inputs: PlayerInputMessage["inputs"] | null;
  lastInputTime: number;
}

class GameServer {
  private wss: WebSocketServer;
  private players: Map<string, ConnectedPlayer> = new Map();
  private blocks: Map<string, NetworkBlock> = new Map(); // key: "x,y,z"
  private nextPlayerId: number = 1;
  private lastTickTime: number = Date.now();
  private worldDirty: boolean = false; // Track if world needs saving
  private strapiDocumentId: string | null = null; // Strapi save document ID

  // Physics constants (matching client)
  private moveSpeed = 5;
  private sprintMultiplier = 2.0;
  private gravity = 20;
  private jumpForce = 8;

  // Collision constants (matching client)
  private playerHeight = 2.0;
  private maxStepHeight = 1.0;
  private cellSize = 1;

  constructor() {
    this.wss = new WebSocketServer({ port: PORT });
    // Load world asynchronously, then start server
    this.initialize();
  }

  private async initialize(): Promise<void> {
    this.setupServer();
    this.startGameLoop();
    this.startAutoSave();
    console.log(`Game server running on ws://localhost:${PORT}`);
    console.log("Waiting for client to specify world ID...");
  }

  /**
   * Load a specific world by ID from Strapi
   * Returns true if successful, false if world not found or Strapi unavailable
   */
  private async loadWorldById(worldId: string): Promise<boolean> {
    // If same world is already loaded, skip reload
    if (this.strapiDocumentId === worldId) {
      console.log(`World ${worldId} already loaded`);
      return true;
    }

    try {
      const response = await fetch(`${STRAPI_SAVE_ENDPOINT}/${worldId}`);

      if (!response.ok) {
        console.log(`World ${worldId} not found in Strapi (status: ${response.status})`);
        return false;
      }

      const result = (await response.json()) as StrapiSaveResponse;
      const saveData = result.data.data;

      // Clear existing blocks and load new world
      this.blocks.clear();
      this.strapiDocumentId = worldId;

      // Load blocks into memory
      if (saveData.blocks && Array.isArray(saveData.blocks)) {
        for (const block of saveData.blocks) {
          const key = `${block.x},${block.y},${block.z}`;
          this.blocks.set(key, {
            x: block.x,
            y: block.y,
            z: block.z,
            structureId: block.blockId,
            rotation: 0,
          });
        }
      }

      console.log(`Loaded world ${worldId}: ${this.blocks.size} blocks`);
      return true;
    } catch (e) {
      console.error(`Failed to load world ${worldId} from Strapi:`, e);
      return false;
    }
  }

  /**
   * Save world to Strapi (auto-save, only if dirty)
   */
  private async saveWorldToStrapi(): Promise<void> {
    if (!this.worldDirty || !this.strapiDocumentId) return;
    await this.saveToStrapi();
  }

  /**
   * Save world to Strapi (forced, returns success status)
   */
  private async saveToStrapi(): Promise<boolean> {
    if (!this.strapiDocumentId) {
      console.error("No world ID set - cannot save to Strapi");
      return false;
    }

    try {
      const blocks = Array.from(this.blocks.values()).map((b) => ({
        blockId: b.structureId,
        x: b.x,
        y: b.y,
        z: b.z,
      }));

      const saveData: SaveData = {
        version: 1,
        timestamp: new Date().toISOString(),
        blocks,
      };

      const response = await fetch(
        `${STRAPI_SAVE_ENDPOINT}/${this.strapiDocumentId}`,
        {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ data: { data: saveData } }),
        }
      );

      if (response.ok) {
        this.worldDirty = false;
        console.log(`Saved ${this.blocks.size} blocks to world ${this.strapiDocumentId}`);
        return true;
      } else {
        console.error("Failed to save to Strapi:", response.status);
        return false;
      }
    } catch (e) {
      console.error("Failed to save to Strapi:", e);
      return false;
    }
  }

  /**
   * Start auto-save interval
   */
  private startAutoSave(): void {
    setInterval(() => {
      this.saveWorldToStrapi();
    }, SAVE_INTERVAL);

    // Also save on process exit
    process.on("SIGINT", async () => {
      console.log("\nShutting down...");
      this.worldDirty = true; // Force save
      await this.saveWorldToStrapi();
      process.exit(0);
    });
  }

  private setupServer(): void {
    this.wss.on("connection", (ws: WebSocket) => {
      const playerId = `player_${this.nextPlayerId++}`;
      const color = getPlayerColor(this.players.size);
      let joined = false;

      console.log(`WebSocket connected, awaiting join message for ${playerId}`);

      // Handle messages
      ws.on("message", async (data: Buffer) => {
        try {
          const message = JSON.parse(data.toString()) as ClientMessage;

          // Handle join message specially - must be first message
          if (message.type === "client:join") {
            if (joined) {
              console.log(`${playerId} already joined, ignoring duplicate join`);
              return;
            }

            const worldId = message.worldId;
            console.log(`${playerId} requesting to join world: ${worldId}`);

            // Load world from Strapi if different from current
            const loadSuccess = await this.loadWorldById(worldId);
            if (!loadSuccess) {
              this.send(ws, {
                type: "join:error",
                message: `World ${worldId} not found`,
              });
              ws.close();
              return;
            }

            // Create player with spawn position
            const state = createDefaultPlayerState();
            state.position.x = Math.random() * 10 - 5;
            state.position.z = Math.random() * 10 - 5;

            const player: ConnectedPlayer = {
              ws,
              playerId,
              state,
              color,
              inputs: null,
              lastInputTime: Date.now(),
            };

            this.players.set(playerId, player);
            joined = true;
            console.log(`Player joined: ${playerId} (${this.players.size} total)`);

            // Send welcome message with current world state
            const welcome: WelcomeMessage = {
              type: "welcome",
              playerId,
              color,
              state: player.state,
              worldState: {
                type: "world:state",
                blocks: Array.from(this.blocks.values()),
                players: this.getNetworkPlayers(playerId),
              },
            };
            this.send(ws, welcome);

            // Broadcast new player to others
            const joinMsg: PlayerJoinMessage = {
              type: "player:join",
              playerId,
              state: player.state,
              color,
            };
            this.broadcast(joinMsg, playerId);
            return;
          }

          // All other messages require being joined first
          if (!joined) {
            console.log(`${playerId} sent message before joining, ignoring`);
            return;
          }

          this.handleMessage(playerId, message);
        } catch (e) {
          console.error("Failed to parse message:", e);
        }
      });

      // Handle disconnect
      ws.on("close", () => {
        if (joined) {
          this.players.delete(playerId);
          console.log(
            `Player disconnected: ${playerId} (${this.players.size} total)`
          );

          const leaveMsg: PlayerLeaveMessage = {
            type: "player:leave",
            playerId,
          };
          this.broadcast(leaveMsg);
        } else {
          console.log(`WebSocket closed before joining: ${playerId}`);
        }
      });
    });
  }

  private handleMessage(playerId: string, message: ClientMessage): void {
    const player = this.players.get(playerId);
    if (!player) return;

    switch (message.type) {
      case "player:input":
        player.inputs = message.inputs;
        player.lastInputTime = Date.now();
        break;

      case "block:placed":
        this.handleBlockPlaced(playerId, message);
        break;

      case "block:removed":
        this.handleBlockRemoved(playerId, message);
        break;

      case "world:reset":
        this.handleWorldReset(playerId);
        break;

      case "world:save":
        this.handleWorldSave(playerId);
        break;

      case "ping":
        this.send(player.ws, {
          type: "pong",
          timestamp: message.timestamp,
          serverTime: Date.now(),
        });
        break;
    }
  }

  private handleBlockPlaced(
    playerId: string,
    message: BlockPlacedMessage
  ): void {
    const { block } = message;
    const key = `${block.x},${block.y},${block.z}`;

    // Store block
    this.blocks.set(key, block);
    this.worldDirty = true; // Mark for saving

    console.log(`Block placed by ${playerId} at (${block.x}, ${block.y}, ${block.z})`);

    // Broadcast to all players (including sender for confirmation)
    const broadcastMsg: BlockPlacedMessage = {
      type: "block:placed",
      playerId,
      block,
    };
    this.broadcast(broadcastMsg);
  }

  private handleBlockRemoved(
    playerId: string,
    message: BlockRemovedMessage
  ): void {
    const { position } = message;
    const key = `${position.x},${position.y},${position.z}`;

    // Remove block
    if (this.blocks.has(key)) {
      this.blocks.delete(key);
      this.worldDirty = true; // Mark for saving
      console.log(`Block removed by ${playerId} at (${position.x}, ${position.y}, ${position.z})`);
    }

    // Broadcast to all players
    const broadcastMsg: BlockRemovedMessage = {
      type: "block:removed",
      playerId,
      position,
    };
    this.broadcast(broadcastMsg);
  }

  private handleWorldReset(playerId: string): void {
    const blockCount = this.blocks.size;
    this.blocks.clear();
    this.worldDirty = true; // Will save empty state to Strapi

    console.log(`World reset by ${playerId} - cleared ${blockCount} blocks`);

    // Broadcast reset to all players
    const resetMsg = {
      type: "world:reset" as const,
      playerId,
    };
    this.broadcast(resetMsg);
  }

  private async handleWorldSave(playerId: string): Promise<void> {
    const player = this.players.get(playerId);
    if (!player) return;

    console.log(`World save requested by ${playerId}`);

    const success = await this.saveToStrapi();

    // Send response to the requesting player
    this.send(player.ws, {
      type: "world:saved",
      success,
      message: success ? undefined : "Failed to save to Strapi",
    });
  }

  private startGameLoop(): void {
    setInterval(() => {
      const now = Date.now();
      const deltaTime = (now - this.lastTickTime) / 1000;
      this.lastTickTime = now;

      this.updatePlayers(deltaTime);
      this.broadcastPlayerStates();
    }, TICK_INTERVAL);
  }

  // ============================================
  // Collision Detection Methods
  // ============================================

  /**
   * Check if there's a block at grid position
   */
  private hasBlockAt(gridX: number, gridY: number, gridZ: number): boolean {
    const key = `${gridX},${gridY},${gridZ}`;
    return this.blocks.has(key);
  }

  /**
   * Convert world position to grid coordinates
   */
  private worldToGrid(x: number, z: number): { gridX: number; gridZ: number } {
    return {
      gridX: Math.floor(x / this.cellSize),
      gridZ: Math.floor(z / this.cellSize),
    };
  }

  /**
   * Find the ground level (top of highest block) at a grid position
   */
  private getGroundLevel(gridX: number, gridZ: number, maxY: number): number {
    for (let y = Math.floor(maxY); y >= 0; y--) {
      if (this.hasBlockAt(gridX, y, gridZ)) {
        return y + 1; // Top of this block
      }
    }
    return 0;
  }

  /**
   * Check if there's head clearance at a position
   */
  private hasHeadClearance(gridX: number, gridZ: number, groundY: number): boolean {
    const startY = Math.floor(groundY);
    const endY = Math.floor(groundY + this.playerHeight - 0.1);

    for (let y = startY; y <= endY; y++) {
      if (this.hasBlockAt(gridX, y, gridZ)) {
        return false;
      }
    }
    return true;
  }

  /**
   * Check if we can move to a target position
   * Returns the ground level we'd stand on, or -1 if blocked
   */
  private canMoveTo(targetX: number, targetZ: number, currentY: number): number {
    const grid = this.worldToGrid(targetX, targetZ);

    // Find ground level at target
    const groundLevel = this.getGroundLevel(
      grid.gridX,
      grid.gridZ,
      currentY + this.maxStepHeight + 1
    );

    // Calculate step needed
    const stepNeeded = groundLevel - currentY;

    // Check if step is within limits
    if (stepNeeded > this.maxStepHeight) {
      return -1; // Too high to step up
    }

    // Check head clearance at the ground level
    if (!this.hasHeadClearance(grid.gridX, grid.gridZ, groundLevel)) {
      return -1; // Something blocking head/body
    }

    return groundLevel;
  }

  /**
   * Apply movement with collision detection and sliding
   */
  private applyMovementWithCollision(
    state: PlayerState,
    newX: number,
    newY: number,
    newZ: number
  ): void {
    const oldY = state.position.y;

    // Check ceiling collision when moving upward
    if (newY > oldY) {
      const ceiling = this.findCeilingAtPosition(state.position.x, state.position.z, oldY);
      if (newY >= ceiling) {
        // Hit ceiling - stop at ceiling and kill upward velocity
        newY = ceiling - 0.01;
        state.velocity.y = 0;
      }
    }

    // Apply vertical movement
    state.position.y = newY;
    const currentY = state.position.y;

    // Try to move to target position
    const groundAtTarget = this.canMoveTo(newX, newZ, currentY);
    if (groundAtTarget >= 0) {
      state.position.x = newX;
      state.position.z = newZ;
      // Step up if needed
      if (groundAtTarget > currentY + 0.01) {
        state.position.y = groundAtTarget;
        state.isGrounded = true;
        state.velocity.y = 0;
      }
      return;
    }

    // Blocked - try sliding along X axis only
    const groundAtX = this.canMoveTo(newX, state.position.z, currentY);
    if (groundAtX >= 0) {
      state.position.x = newX;
      if (groundAtX > currentY + 0.01) {
        state.position.y = groundAtX;
        state.isGrounded = true;
        state.velocity.y = 0;
      }
      state.velocity.z = 0;
      return;
    }

    // Try sliding along Z axis only
    const groundAtZ = this.canMoveTo(state.position.x, newZ, currentY);
    if (groundAtZ >= 0) {
      state.position.z = newZ;
      if (groundAtZ > currentY + 0.01) {
        state.position.y = groundAtZ;
        state.isGrounded = true;
        state.velocity.y = 0;
      }
      state.velocity.x = 0;
      return;
    }

    // Completely blocked
    state.velocity.x = 0;
    state.velocity.z = 0;
  }

  /**
   * Find ground level at current position for gravity
   */
  private findGroundAtPosition(x: number, z: number, fromY: number): number {
    const grid = this.worldToGrid(x, z);
    return this.getGroundLevel(grid.gridX, grid.gridZ, fromY);
  }

  /**
   * Find ceiling level above position (lowest block above player's head)
   * Returns the Y position where player's head would hit, or Infinity if no ceiling
   */
  private findCeilingAtPosition(x: number, z: number, fromY: number): number {
    const grid = this.worldToGrid(x, z);
    const headY = Math.floor(fromY + this.playerHeight);

    // Search upward for a block
    for (let y = headY; y < headY + 50; y++) {
      if (this.hasBlockAt(grid.gridX, y, grid.gridZ)) {
        // Return the Y position where feet would be when head hits this block
        return y - this.playerHeight;
      }
    }
    return Infinity; // No ceiling found
  }

  private updatePlayers(deltaTime: number): void {
    for (const player of this.players.values()) {
      if (!player.inputs) continue;

      const state = player.state;
      const inputs = player.inputs;

      // Calculate movement direction
      let moveX = 0;
      let moveZ = 0;

      if (inputs.moveForward) moveZ -= 1;
      if (inputs.moveBackward) moveZ += 1;
      if (inputs.moveLeft) moveX -= 1;
      if (inputs.moveRight) moveX += 1;

      // Normalize diagonal movement
      const length = Math.sqrt(moveX * moveX + moveZ * moveZ);
      if (length > 0) {
        moveX /= length;
        moveZ /= length;
      }

      // Calculate world-space movement from camera yaw
      const yaw = inputs.cameraYaw;
      const forwardX = -Math.sin(yaw);
      const forwardZ = -Math.cos(yaw);
      const rightX = Math.cos(yaw);
      const rightZ = -Math.sin(yaw);

      const worldMoveX = forwardX * -moveZ + rightX * moveX;
      const worldMoveZ = forwardZ * -moveZ + rightZ * moveX;

      // Apply speed
      const speed = inputs.sprint
        ? this.moveSpeed * this.sprintMultiplier
        : this.moveSpeed;
      state.velocity.x = worldMoveX * speed;
      state.velocity.z = worldMoveZ * speed;
      state.isMoving = length > 0;

      // Update rotation to face movement
      if (state.isMoving) {
        state.rotation = Math.atan2(state.velocity.x, state.velocity.z);
      }

      // Vertical movement (jetpack/hover)
      if (inputs.hoverMode) {
        // Hover mode: no gravity, use jetpack for vertical movement
        if (inputs.jetpackUp) {
          state.velocity.y = this.jumpForce;
        } else if (inputs.jetpackDown) {
          state.velocity.y = -this.jumpForce;
        } else {
          state.velocity.y = 0; // Hover in place
        }
        state.isGrounded = false;
      } else if (inputs.jetpackUp) {
        state.velocity.y = this.jumpForce;
        state.isGrounded = false;
      } else if (inputs.jetpackDown) {
        state.velocity.y = -this.jumpForce;
        state.isGrounded = false;
      } else if (!state.isGrounded) {
        state.velocity.y -= this.gravity * deltaTime;
      } else {
        state.velocity.y = 0;
      }

      // Calculate movement delta
      let deltaX = state.velocity.x * deltaTime;
      let deltaZ = state.velocity.z * deltaTime;
      const deltaY = state.velocity.y * deltaTime;

      // Limit horizontal movement per frame to avoid skipping cells when sprinting
      const maxMove = this.cellSize * 0.8;
      const horizontalDist = Math.sqrt(deltaX * deltaX + deltaZ * deltaZ);

      if (horizontalDist > maxMove) {
        const scale = maxMove / horizontalDist;
        deltaX *= scale;
        deltaZ *= scale;
      }

      const newX = state.position.x + deltaX;
      const newY = state.position.y + deltaY;
      const newZ = state.position.z + deltaZ;

      // Apply movement with collision detection
      this.applyMovementWithCollision(state, newX, newY, newZ);

      // Ground check - find ground level at current position
      const groundLevel = this.findGroundAtPosition(
        state.position.x,
        state.position.z,
        state.position.y + 0.1
      );

      if (state.position.y <= groundLevel) {
        state.position.y = groundLevel;
        state.velocity.y = 0;
        state.isGrounded = true;
      } else if (state.position.y <= groundLevel + 0.01) {
        // Very close to ground, consider grounded
        state.isGrounded = true;
      } else {
        state.isGrounded = false;
      }
    }
  }

  private broadcastPlayerStates(): void {
    const now = Date.now();

    for (const player of this.players.values()) {
      const stateMsg: PlayerStateMessage = {
        type: "player:state",
        playerId: player.playerId,
        state: player.state,
        timestamp: now,
      };

      // Send to ALL players (including owner for server reconciliation)
      this.broadcast(stateMsg);
    }
  }

  private getNetworkPlayers(excludeId?: string): NetworkPlayer[] {
    const players: NetworkPlayer[] = [];
    for (const player of this.players.values()) {
      if (player.playerId !== excludeId) {
        players.push({
          playerId: player.playerId,
          state: player.state,
          color: player.color,
        });
      }
    }
    return players;
  }

  private send(ws: WebSocket, message: ServerMessage): void {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(message));
    }
  }

  private broadcast(message: ServerMessage, excludeId?: string): void {
    for (const player of this.players.values()) {
      if (player.playerId !== excludeId) {
        this.send(player.ws, message);
      }
    }
  }
}

// Start the server
new GameServer();
