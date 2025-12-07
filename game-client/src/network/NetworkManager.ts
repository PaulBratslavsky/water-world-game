/**
 * NetworkManager - Client-side WebSocket manager for multiplayer
 *
 * Handles:
 * - WebSocket connection to game server
 * - Sending local player inputs
 * - Receiving server state updates
 * - Managing remote player data
 */

// EventBus can be used for additional event emission if needed
// import { emitEvent, onEvent } from "../core/EventBus";
import { PlayerState } from "../core/PlayerState";
import {
  ServerMessage,
  ClientMessage,
  PlayerInputs,
  NetworkBlock,
  NetworkPlayer,
  createPlayerInputs,
} from "./NetworkProtocol";

export interface NetworkManagerConfig {
  serverUrl: string;
  worldId?: string; // Strapi world ID to join
  onConnected?: (playerId: string, color: string, state: PlayerState) => void;
  onDisconnected?: () => void;
  onJoinError?: (message: string) => void;
  onPlayerJoined?: (player: NetworkPlayer) => void;
  onPlayerLeft?: (playerId: string) => void;
  onPlayerStateUpdate?: (playerId: string, state: PlayerState, timestamp: number) => void;
  onBlockPlaced?: (playerId: string, block: NetworkBlock) => void;
  onBlockRemoved?: (playerId: string, x: number, y: number, z: number) => void;
  onWorldState?: (blocks: NetworkBlock[], players: NetworkPlayer[]) => void;
  onWorldReset?: (playerId: string) => void;
  onWorldSaved?: (success: boolean, message?: string) => void;
}

export class NetworkManager {
  private ws: WebSocket | null = null;
  private config: NetworkManagerConfig;
  private connected: boolean = false;
  private playerId: string | null = null;
  private playerColor: string | null = null;
  private reconnectAttempts: number = 0;
  private maxReconnectAttempts: number = 5;
  private reconnectDelay: number = 2000;

  // Input state to send to server
  private currentInputs: PlayerInputs = createPlayerInputs();
  private inputSendInterval: number | null = null;
  private readonly INPUT_SEND_RATE = 50; // ms between input sends (20 Hz)

  // Latency tracking
  private latency: number = 0;
  private lastPingTime: number = 0;
  private pingInterval: number | null = null;

  constructor(config: NetworkManagerConfig) {
    this.config = config;
  }

  /**
   * Connect to the game server
   */
  connect(): void {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      console.log("Already connected");
      return;
    }

    console.log(`Connecting to ${this.config.serverUrl}...`);
    this.ws = new WebSocket(this.config.serverUrl);

    this.ws.onopen = () => {
      console.log("Connected to game server");
      this.connected = true;
      this.reconnectAttempts = 0;

      // Send join message with world ID
      if (this.config.worldId) {
        console.log(`Joining world: ${this.config.worldId}`);
        this.send({
          type: "client:join",
          worldId: this.config.worldId,
        });
      }

      this.startInputSending();
      this.startPinging();
    };

    this.ws.onclose = () => {
      console.log("Disconnected from game server");
      this.connected = false;
      this.playerId = null;
      this.stopInputSending();
      this.stopPinging();
      this.config.onDisconnected?.();
      this.attemptReconnect();
    };

    this.ws.onerror = (error) => {
      console.error("WebSocket error:", error);
    };

    this.ws.onmessage = (event) => {
      try {
        const message = JSON.parse(event.data) as ServerMessage;
        this.handleMessage(message);
      } catch (e) {
        console.error("Failed to parse server message:", e);
      }
    };
  }

  /**
   * Disconnect from the server
   */
  disconnect(): void {
    // Prevent auto-reconnect
    this.reconnectAttempts = this.maxReconnectAttempts;
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
    this.connected = false;
    this.playerId = null;
    this.stopInputSending();
    this.stopPinging();
  }

  /**
   * Handle incoming server messages
   */
  private handleMessage(message: ServerMessage): void {
    switch (message.type) {
      case "welcome":
        this.playerId = message.playerId;
        this.playerColor = message.color;
        console.log(`Assigned player ID: ${this.playerId}, color: ${this.playerColor}`);
        console.log(`Initial position: (${message.state.position.x.toFixed(2)}, ${message.state.position.y.toFixed(2)}, ${message.state.position.z.toFixed(2)})`);
        this.config.onConnected?.(message.playerId, message.color, message.state);
        // Process initial world state
        this.config.onWorldState?.(
          message.worldState.blocks,
          message.worldState.players
        );
        break;

      case "join:error":
        console.error(`Failed to join world: ${message.message}`);
        this.config.onJoinError?.(message.message);
        break;

      case "player:join":
        console.log(`Player joined: ${message.playerId}`);
        this.config.onPlayerJoined?.({
          playerId: message.playerId,
          state: message.state,
          color: message.color,
        });
        break;

      case "player:leave":
        console.log(`Player left: ${message.playerId}`);
        this.config.onPlayerLeft?.(message.playerId);
        break;

      case "player:state":
        // Process all state updates (including our own for server reconciliation)
        this.config.onPlayerStateUpdate?.(
          message.playerId,
          message.state,
          message.timestamp
        );
        break;

      case "block:placed":
        this.config.onBlockPlaced?.(message.playerId, message.block);
        break;

      case "block:removed":
        this.config.onBlockRemoved?.(
          message.playerId,
          message.position.x,
          message.position.y,
          message.position.z
        );
        break;

      case "world:reset":
        this.config.onWorldReset?.(message.playerId);
        break;

      case "world:saved":
        this.config.onWorldSaved?.(message.success, message.message);
        break;

      case "pong":
        this.latency = Date.now() - message.timestamp;
        break;
    }
  }

  /**
   * Update local player inputs (called every frame)
   */
  updateInputs(inputs: Partial<PlayerInputs>): void {
    Object.assign(this.currentInputs, inputs);
  }

  /**
   * Set camera yaw for server-side movement calculation
   */
  setCameraYaw(yaw: number): void {
    this.currentInputs.cameraYaw = yaw;
  }

  /**
   * Send current inputs to server
   */
  private sendInputs(): void {
    if (!this.connected || !this.playerId) return;

    const message: ClientMessage = {
      type: "player:input",
      playerId: this.playerId,
      inputs: { ...this.currentInputs },
      timestamp: Date.now(),
    };

    this.send(message);
  }

  /**
   * Send block placement to server
   */
  sendBlockPlaced(block: NetworkBlock): void {
    if (!this.connected || !this.playerId) return;

    const message: ClientMessage = {
      type: "block:placed",
      playerId: this.playerId,
      block,
    };

    this.send(message);
  }

  /**
   * Send block removal to server
   */
  sendBlockRemoved(x: number, y: number, z: number): void {
    if (!this.connected || !this.playerId) return;

    const message: ClientMessage = {
      type: "block:removed",
      playerId: this.playerId,
      position: { x, y, z },
    };

    this.send(message);
  }

  /**
   * Send world reset to server
   */
  sendWorldReset(): void {
    if (!this.connected || !this.playerId) return;

    const message: ClientMessage = {
      type: "world:reset",
      playerId: this.playerId,
    };

    this.send(message);
  }

  /**
   * Request server to save world to Strapi
   */
  sendWorldSave(): void {
    if (!this.connected || !this.playerId) return;

    const message: ClientMessage = {
      type: "world:save",
      playerId: this.playerId,
    };

    this.send(message);
  }

  /**
   * Start sending inputs at regular interval
   */
  private startInputSending(): void {
    this.stopInputSending();
    this.inputSendInterval = window.setInterval(() => {
      this.sendInputs();
    }, this.INPUT_SEND_RATE);
  }

  /**
   * Stop sending inputs
   */
  private stopInputSending(): void {
    if (this.inputSendInterval !== null) {
      clearInterval(this.inputSendInterval);
      this.inputSendInterval = null;
    }
  }

  /**
   * Start pinging server for latency measurement
   */
  private startPinging(): void {
    this.stopPinging();
    this.pingInterval = window.setInterval(() => {
      if (this.connected) {
        this.lastPingTime = Date.now();
        this.send({ type: "ping", timestamp: this.lastPingTime });
      }
    }, 1000);
  }

  /**
   * Stop pinging
   */
  private stopPinging(): void {
    if (this.pingInterval !== null) {
      clearInterval(this.pingInterval);
      this.pingInterval = null;
    }
  }

  /**
   * Attempt to reconnect after disconnect
   */
  private attemptReconnect(): void {
    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      console.log("Max reconnect attempts reached");
      return;
    }

    this.reconnectAttempts++;
    console.log(
      `Attempting to reconnect (${this.reconnectAttempts}/${this.maxReconnectAttempts})...`
    );

    setTimeout(() => {
      this.connect();
    }, this.reconnectDelay);
  }

  /**
   * Send a message to the server
   */
  private send(message: ClientMessage): void {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(message));
    }
  }

  /**
   * Check if connected to server
   */
  isConnected(): boolean {
    return this.connected;
  }

  /**
   * Get local player ID
   */
  getPlayerId(): string | null {
    return this.playerId;
  }

  /**
   * Get local player color
   */
  getPlayerColor(): string | null {
    return this.playerColor;
  }

  /**
   * Get current latency to server
   */
  getLatency(): number {
    return this.latency;
  }
}
