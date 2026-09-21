/**
 * GameServer - WebSocket server orchestrator for multiplayer synchronization
 *
 * This is a thin orchestrator that wires up specialized modules:
 * - PlayerManager: Player connections and state
 * - WorldRegistry: One WorldManager + CollisionSystem per loaded world
 * - StrapiService: Persistence to Strapi CMS
 * - MessageHandler: Client message routing
 */

import { WebSocketServer, WebSocket } from "ws";
import { SERVER_CONFIG, STRAPI_CONFIG } from "./config/ServerConfig.js";
import { PlayerManager } from "./managers/PlayerManager.js";
import { WorldRegistry } from "./managers/WorldRegistry.js";
import { StrapiService } from "./services/StrapiService.js";
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
  private worlds: WorldRegistry;
  private strapiService: StrapiService;
  private messageHandler: MessageHandler;

  // State
  private lastTickTime: number = Date.now();
  private shuttingDown: boolean = false;

  constructor() {
    this.wss = new WebSocketServer({ port: SERVER_CONFIG.port });

    // Initialize managers and services
    this.playerManager = new PlayerManager();
    this.strapiService = new StrapiService();
    this.worlds = new WorldRegistry(this.strapiService);

    // Initialize message handler with dependencies
    this.messageHandler = new MessageHandler({
      playerManager: this.playerManager,
      worlds: this.worlds,
      broadcastToWorld: this.broadcastToWorld.bind(this),
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
      let joining = false;
      let joined = false;

      console.log(`WebSocket connected, awaiting join message for ${player.playerId}`);

      ws.on("message", async (data: Buffer) => {
        try {
          const message = JSON.parse(data.toString()) as ClientMessage;

          // Handle join message - must be first message
          if (message.type === "client:join") {
            if (joined || joining) {
              console.log(`${player.playerId} already joined, ignoring duplicate join`);
              return;
            }

            const worldId = message.worldId;
            console.log(`${player.playerId} requesting to join world: ${worldId}`);

            // Reuse the world if it's already in memory, otherwise load it from Strapi
            joining = true;
            const loaded = await this.worlds.acquire(worldId).finally(() => {
              joining = false;
            });
            if (!loaded) {
              this.send(ws, {
                type: "join:error",
                message: `World ${worldId} not found`,
              });
              ws.close();
              return;
            }

            // The socket may have closed while the world was loading
            if (ws.readyState !== WebSocket.OPEN) {
              console.log(`${player.playerId} disconnected while joining ${worldId}`);
              return;
            }

            // Add player to manager
            player.worldId = worldId;
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
                blocks: loaded.world.getAllBlocks(),
                players: this.playerManager.getNetworkPlayers(worldId, player.playerId),
              },
            };
            this.send(ws, welcome);

            // Broadcast new player to others in the same world
            const joinMsg: PlayerJoinMessage = {
              type: "player:join",
              playerId: player.playerId,
              state: player.state,
              color: player.color,
            };
            this.broadcastToWorld(worldId, joinMsg, player.playerId);
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
        const worldId = player.worldId;
        if (!joined || !worldId) {
          console.log(`WebSocket closed before joining: ${player.playerId}`);
          return;
        }

        this.playerManager.removePlayer(player.playerId);

        const leaveMsg: PlayerLeaveMessage = {
          type: "player:leave",
          playerId: player.playerId,
        };
        this.broadcastToWorld(worldId, leaveMsg);

        // Last player out: save the world and drop it from memory
        if (this.isWorldEmpty(worldId)) {
          void this.worlds.release(worldId, () => this.isWorldEmpty(worldId));
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
      if (!player.inputs || !player.worldId) continue;
      const loaded = this.worlds.get(player.worldId);
      if (!loaded) continue;
      loaded.collision.updatePlayerPhysics(player.state, player.inputs, deltaTime);
    }
  }

  private broadcastPlayerStates(): void {
    const now = Date.now();

    for (const player of this.playerManager.getAllPlayers()) {
      if (!player.worldId) continue;
      const stateMsg: PlayerStateMessage = {
        type: "player:state",
        playerId: player.playerId,
        state: player.state,
        timestamp: now,
      };
      this.broadcastToWorld(player.worldId, stateMsg);
    }
  }

  private setupAutoSave(): void {
    setInterval(() => {
      for (const { world } of this.worlds.getAll()) {
        const worldId = world.worldId;
        if (this.isWorldEmpty(worldId)) {
          // Nobody is in it (e.g. an earlier save-on-leave failed): retry and unload
          void this.worlds.release(worldId, () => this.isWorldEmpty(worldId));
        } else {
          void this.worlds.save(world);
        }
      }
    }, STRAPI_CONFIG.saveInterval);

    // Save every loaded world before exiting. Railway stops containers with SIGTERM.
    const shutdown = async (signal: string) => {
      if (this.shuttingDown) return;
      this.shuttingDown = true;
      console.log(`\n${signal} received, saving worlds before shutdown...`);
      await this.worlds.saveAll();
      process.exit(0);
    };
    process.on("SIGINT", () => void shutdown("SIGINT"));
    process.on("SIGTERM", () => void shutdown("SIGTERM"));
  }

  private isWorldEmpty(worldId: string): boolean {
    return this.playerManager.getPlayersInWorld(worldId).length === 0;
  }

  private send(ws: WebSocket, message: ServerMessage): void {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(message));
    }
  }

  private broadcastToWorld(worldId: string, message: ServerMessage, excludeId?: string): void {
    for (const player of this.playerManager.getPlayersInWorld(worldId)) {
      if (player.playerId !== excludeId) {
        this.send(player.ws, message);
      }
    }
  }
}

// Start the server
new GameServer();
