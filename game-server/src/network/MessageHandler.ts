/**
 * MessageHandler - Routes and handles incoming client messages
 */

import { WebSocket } from "ws";
import { PlayerManager } from "../managers/PlayerManager.js";
import { WorldManager } from "../managers/WorldManager.js";
import { StrapiService } from "../services/StrapiService.js";
import {
  ClientMessage,
  ServerMessage,
  BlockPlacedMessage,
  BlockRemovedMessage,
} from "../shared/NetworkProtocol.js";

export interface MessageHandlerDeps {
  playerManager: PlayerManager;
  worldManager: WorldManager;
  strapiService: StrapiService;
  broadcast: (msg: ServerMessage, excludeId?: string) => void;
  send: (ws: WebSocket, msg: ServerMessage) => void;
}

export class MessageHandler {
  private playerManager: PlayerManager;
  private worldManager: WorldManager;
  private strapiService: StrapiService;
  private broadcast: (msg: ServerMessage, excludeId?: string) => void;
  private send: (ws: WebSocket, msg: ServerMessage) => void;

  constructor(deps: MessageHandlerDeps) {
    this.playerManager = deps.playerManager;
    this.worldManager = deps.worldManager;
    this.strapiService = deps.strapiService;
    this.broadcast = deps.broadcast;
    this.send = deps.send;
  }

  /**
   * Route and handle incoming message
   */
  handleMessage(playerId: string, message: ClientMessage): void {
    const player = this.playerManager.getPlayer(playerId);
    if (!player) return;

    switch (message.type) {
      case "player:input":
        this.playerManager.updatePlayerInputs(playerId, message.inputs);
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

  /**
   * Handle block placement
   */
  private handleBlockPlaced(playerId: string, message: BlockPlacedMessage): void {
    const { block } = message;

    // Store block
    this.worldManager.setBlock(block);

    console.log(`Block placed by ${playerId} at (${block.x}, ${block.y}, ${block.z})`);

    // Broadcast to all players (including sender for confirmation)
    const broadcastMsg: BlockPlacedMessage = {
      type: "block:placed",
      playerId,
      block,
    };
    this.broadcast(broadcastMsg);
  }

  /**
   * Handle block removal
   */
  private handleBlockRemoved(playerId: string, message: BlockRemovedMessage): void {
    const { position } = message;

    // Remove block
    const removed = this.worldManager.removeBlock(position.x, position.y, position.z);
    if (removed) {
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

  /**
   * Handle world reset
   */
  private handleWorldReset(playerId: string): void {
    const blockCount = this.worldManager.clearAll();

    console.log(`World reset by ${playerId} - cleared ${blockCount} blocks`);

    // Broadcast reset to all players
    const resetMsg = {
      type: "world:reset" as const,
      playerId,
    };
    this.broadcast(resetMsg);
  }

  /**
   * Handle world save request
   */
  private async handleWorldSave(playerId: string): Promise<void> {
    const player = this.playerManager.getPlayer(playerId);
    if (!player) return;

    const worldId = this.worldManager.getWorldId();
    if (!worldId) {
      this.send(player.ws, {
        type: "world:saved",
        success: false,
        message: "No world ID set",
      });
      return;
    }

    console.log(`World save requested by ${playerId}`);

    const blocks = this.worldManager.getAllBlocks();
    const success = await this.strapiService.saveWorld(blocks, worldId);

    if (success) {
      this.worldManager.markClean();
    }

    // Send response to the requesting player
    this.send(player.ws, {
      type: "world:saved",
      success,
      message: success ? undefined : "Failed to save to Strapi",
    });
  }
}
