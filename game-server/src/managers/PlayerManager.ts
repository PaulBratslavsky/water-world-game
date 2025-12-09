/**
 * PlayerManager - Manages connected players and their state
 */

import { WebSocket } from "ws";
import { ConnectedPlayer } from "../types/ServerTypes.js";
import { createDefaultPlayerState } from "../shared/PlayerState.js";
import { NetworkPlayer, getPlayerColor } from "../shared/NetworkProtocol.js";

export class PlayerManager {
  private players: Map<string, ConnectedPlayer> = new Map();
  private nextPlayerId: number = 1;

  /**
   * Create a new player with a unique ID and random spawn position
   */
  createPlayer(ws: WebSocket): ConnectedPlayer {
    const playerId = `player_${this.nextPlayerId++}`;
    const color = getPlayerColor(this.players.size);

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

    return player;
  }

  /**
   * Add a player to the active players map
   */
  addPlayer(player: ConnectedPlayer): void {
    this.players.set(player.playerId, player);
    console.log(`Player joined: ${player.playerId} (${this.players.size} total)`);
  }

  /**
   * Remove a player from the active players map
   */
  removePlayer(playerId: string): void {
    this.players.delete(playerId);
    console.log(`Player disconnected: ${playerId} (${this.players.size} total)`);
  }

  /**
   * Get a player by ID
   */
  getPlayer(playerId: string): ConnectedPlayer | undefined {
    return this.players.get(playerId);
  }

  /**
   * Get all connected players
   */
  getAllPlayers(): ConnectedPlayer[] {
    return Array.from(this.players.values());
  }

  /**
   * Get player count
   */
  getPlayerCount(): number {
    return this.players.size;
  }

  /**
   * Get network-serializable player list (for sending to clients)
   */
  getNetworkPlayers(excludeId?: string): NetworkPlayer[] {
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

  /**
   * Check if a player exists
   */
  hasPlayer(playerId: string): boolean {
    return this.players.has(playerId);
  }

  /**
   * Update player inputs
   */
  updatePlayerInputs(playerId: string, inputs: ConnectedPlayer["inputs"]): void {
    const player = this.players.get(playerId);
    if (player) {
      player.inputs = inputs;
      player.lastInputTime = Date.now();
    }
  }
}
