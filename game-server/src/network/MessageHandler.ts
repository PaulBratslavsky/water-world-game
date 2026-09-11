/**
 * MessageHandler - Routes and handles incoming client messages
 */

import { WebSocket } from "ws";
import { PlayerManager } from "../managers/PlayerManager.js";
import { WorldManager } from "../managers/WorldManager.js";
import { WorldRegistry } from "../managers/WorldRegistry.js";
import { ConnectedPlayer } from "../types/ServerTypes.js";
import {
  ClientMessage,
  ServerMessage,
  BlockPlacedMessage,
  BlockRemovedMessage,
} from "../shared/NetworkProtocol.js";

export interface MessageHandlerDeps {
  playerManager: PlayerManager;
  worlds: WorldRegistry;
  broadcastToWorld: (worldId: string, msg: ServerMessage, excludeId?: string) => void;
  send: (ws: WebSocket, msg: ServerMessage) => void;
}

export class MessageHandler {
  private playerManager: PlayerManager;
  private worlds: WorldRegistry;
  private broadcastToWorld: (worldId: string, msg: ServerMessage, excludeId?: string) => void;
  private send: (ws: WebSocket, msg: ServerMessage) => void;

  constructor(deps: MessageHandlerDeps) {
    this.playerManager = deps.playerManager;
    this.worlds = deps.worlds;
    this.broadcastToWorld = deps.broadcastToWorld;
    this.send = deps.send;
  }

  /**
   * Route and handle incoming message
   */
  handleMessage(playerId: string, message: ClientMessage): void {
    const player = this.playerManager.getPlayer(playerId);
    if (!player?.worldId) return;

    const world = this.worlds.get(player.worldId)?.world;
    if (!world) return;

    switch (message.type) {
      case "player:input":
        this.playerManager.updatePlayerInputs(playerId, message.inputs);
        break;

      case "block:placed":
        this.handleBlockPlaced(playerId, world, message);
        break;

      case "block:removed":
        this.handleBlockRemoved(playerId, world, message);
        break;

      case "world:reset":
        this.handleWorldReset(playerId, world);
        break;

      case "world:save":
        this.handleWorldSave(player, world);
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
  private handleBlockPlaced(playerId: string, world: WorldManager, message: BlockPlacedMessage): void {
    const { block } = message;

    // Store block
    world.setBlock(block);

    console.log(`Block placed by ${playerId} in ${world.worldId} at (${block.x}, ${block.y}, ${block.z})`);

    // Broadcast to all players in the world (including sender for confirmation)
    const broadcastMsg: BlockPlacedMessage = {
      type: "block:placed",
      playerId,
      block,
    };
    this.broadcastToWorld(world.worldId, broadcastMsg);
  }

  /**
   * Handle block removal
   */
  private handleBlockRemoved(playerId: string, world: WorldManager, message: BlockRemovedMessage): void {
    const { position } = message;

    // Remove block
    const removed = world.removeBlock(position.x, position.y, position.z);
    if (removed) {
      console.log(`Block removed by ${playerId} in ${world.worldId} at (${position.x}, ${position.y}, ${position.z})`);
    }

    // Broadcast to all players in the world
    const broadcastMsg: BlockRemovedMessage = {
      type: "block:removed",
      playerId,
      position,
    };
    this.broadcastToWorld(world.worldId, broadcastMsg);
  }

  /**
   * Handle world reset
   */
  private handleWorldReset(playerId: string, world: WorldManager): void {
    const blockCount = world.clearAll();

    console.log(`World ${world.worldId} reset by ${playerId} - cleared ${blockCount} blocks`);

    // Broadcast reset to all players in the world
    const resetMsg = {
      type: "world:reset" as const,
      playerId,
    };
    this.broadcastToWorld(world.worldId, resetMsg);
  }

  /**
   * Handle world save request
   */
  private async handleWorldSave(player: ConnectedPlayer, world: WorldManager): Promise<void> {
    console.log(`World ${world.worldId} save requested by ${player.playerId}`);

    const success = await this.worlds.save(world);

    // Send response to the requesting player
    this.send(player.ws, {
      type: "world:saved",
      success,
      message: success ? undefined : "Failed to save to Strapi",
    });
  }
}
