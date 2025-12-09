/**
 * GameServer - WebSocket server orchestrator for multiplayer synchronization
 *
 * This is a thin orchestrator that wires up specialized modules:
 * - PlayerManager: Player connections and state
 * - WorldManager: Block storage and operations
 * - StrapiService: Persistence to Strapi CMS
 * - CollisionSystem: Physics and collision detection
 * - MessageHandler: Client message routing
 */

import { WebSocketServer, WebSocket } from "ws";
import { SERVER_CONFIG, STRAPI_CONFIG } from "./config/ServerConfig.js";
import { PlayerManager } from "./managers/PlayerManager.js";
import { WorldManager } from "./managers/WorldManager.js";
import { StrapiService } from "./services/StrapiService.js";
import { CollisionSystem } from "./physics/CollisionSystem.js";
import { MessageHandler } from "./network/MessageHandler.js";
import {
  ServerMessage,
  ClientMessage,
  WelcomeMessage,
  PlayerJoinMessage,
  PlayerLeaveMessage,
  PlayerStateMessage,
} from "./shared/NetworkProtocol.js";

class GameServer {
  private wss: WebSocketServer;

  // Managers and services
  private playerManager: PlayerManager;
  private worldManager: WorldManager;
  private strapiService: StrapiService;
  private collisionSystem: CollisionSystem;
  private messageHandler: MessageHandler;

  // State
  private lastTickTime: number = Date.now();

  constructor() {
    this.wss = new WebSocketServer({ port: SERVER_CONFIG.port });

    // Initialize managers and services
    this.playerManager = new PlayerManager();
    this.worldManager = new WorldManager();
    this.strapiService = new StrapiService();
    this.collisionSystem = new CollisionSystem(this.worldManager);

    // Initialize message handler with dependencies
    this.messageHandler = new MessageHandler({
      playerManager: this.playerManager,
      worldManager: this.worldManager,
      strapiService: this.strapiService,
      broadcast: this.broadcast.bind(this),
      send: this.send.bind(this),
    });

    this.initialize();
  }

  private async initialize(): Promise<void> {
    this.setupServer();
    this.startGameLoop();
    this.setupAutoSave();

    console.log(`Game server running on ws://localhost:${SERVER_CONFIG.port}`);
    await this.strapiService.testConnection();
    console.log("Waiting for client to specify world ID...");
  }

  private setupServer(): void {
    this.wss.on("connection", (ws: WebSocket) => {
      const player = this.playerManager.createPlayer(ws);
      let joined = false;

      console.log(`WebSocket connected, awaiting join message for ${player.playerId}`);

      ws.on("message", async (data: Buffer) => {
        try {
          const message = JSON.parse(data.toString()) as ClientMessage;

          // Handle join message - must be first message
          if (message.type === "client:join") {
            if (joined) {
              console.log(`${player.playerId} already joined, ignoring duplicate join`);
              return;
            }

            const worldId = message.worldId;
            console.log(`${player.playerId} requesting to join world: ${worldId}`);

            // Load world from Strapi
            const result = await this.strapiService.loadWorld(worldId);
            if (!result.success) {
              this.send(ws, {
                type: "join:error",
                message: `World ${worldId} not found`,
              });
              ws.close();
              return;
            }

            // Load blocks into world manager
            this.worldManager.setWorldId(worldId);
            this.worldManager.loadBlocks(result.blocks);

            // Add player to manager
            this.playerManager.addPlayer(player);
            joined = true;

            // Send welcome message with current world state
            const welcome: WelcomeMessage = {
              type: "welcome",
              playerId: player.playerId,
              color: player.color,
              state: player.state,
              worldState: {
                type: "world:state",
                blocks: this.worldManager.getAllBlocks(),
                players: this.playerManager.getNetworkPlayers(player.playerId),
              },
            };
            this.send(ws, welcome);

            // Broadcast new player to others
            const joinMsg: PlayerJoinMessage = {
              type: "player:join",
              playerId: player.playerId,
              state: player.state,
              color: player.color,
            };
            this.broadcast(joinMsg, player.playerId);
            return;
          }

          // All other messages require being joined first
          if (!joined) {
            console.log(`${player.playerId} sent message before joining, ignoring`);
            return;
          }

          this.messageHandler.handleMessage(player.playerId, message);
        } catch (e) {
          console.error("Failed to parse message:", e);
        }
      });

      ws.on("close", () => {
        if (joined) {
          this.playerManager.removePlayer(player.playerId);

          const leaveMsg: PlayerLeaveMessage = {
            type: "player:leave",
            playerId: player.playerId,
          };
          this.broadcast(leaveMsg);
        } else {
          console.log(`WebSocket closed before joining: ${player.playerId}`);
        }
      });
    });
  }

  private startGameLoop(): void {
    setInterval(() => {
      const now = Date.now();
      const deltaTime = (now - this.lastTickTime) / 1000;
      this.lastTickTime = now;

      this.updatePlayers(deltaTime);
      this.broadcastPlayerStates();
    }, SERVER_CONFIG.tickInterval);
  }

  private updatePlayers(deltaTime: number): void {
    for (const player of this.playerManager.getAllPlayers()) {
      if (!player.inputs) continue;
      this.collisionSystem.updatePlayerPhysics(player.state, player.inputs, deltaTime);
    }
  }

  private broadcastPlayerStates(): void {
    const now = Date.now();

    for (const player of this.playerManager.getAllPlayers()) {
      const stateMsg: PlayerStateMessage = {
        type: "player:state",
        playerId: player.playerId,
        state: player.state,
        timestamp: now,
      };
      this.broadcast(stateMsg);
    }
  }

  private setupAutoSave(): void {
    setInterval(async () => {
      if (!this.worldManager.isDirty()) return;

      const worldId = this.worldManager.getWorldId();
      if (!worldId) return;

      const blocks = this.worldManager.getAllBlocks();
      const success = await this.strapiService.saveWorld(blocks, worldId);
      if (success) {
        this.worldManager.markClean();
      }
    }, STRAPI_CONFIG.saveInterval);

    // Save on process exit
    process.on("SIGINT", async () => {
      console.log("\nShutting down...");
      this.worldManager.markDirty(); // Force save

      const worldId = this.worldManager.getWorldId();
      if (worldId) {
        const blocks = this.worldManager.getAllBlocks();
        await this.strapiService.saveWorld(blocks, worldId);
      }

      process.exit(0);
    });
  }

  private send(ws: WebSocket, message: ServerMessage): void {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(message));
    }
  }

  private broadcast(message: ServerMessage, excludeId?: string): void {
    for (const player of this.playerManager.getAllPlayers()) {
      if (player.playerId !== excludeId) {
        this.send(player.ws, message);
      }
    }
  }
}

// Start the server
new GameServer();
