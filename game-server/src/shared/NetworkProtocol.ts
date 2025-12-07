/**
 * NetworkProtocol - Shared message types for client-server communication
 *
 * All messages are JSON-serializable and include a type discriminator.
 */

import { PlayerState, Vector3 } from "./PlayerState.js";

// ============================================
// Player-related messages
// ============================================

export interface PlayerJoinMessage {
  type: "player:join";
  playerId: string;
  state: PlayerState;
  color: string; // Player color for rendering
}

export interface PlayerLeaveMessage {
  type: "player:leave";
  playerId: string;
}

export interface PlayerStateMessage {
  type: "player:state";
  playerId: string;
  state: PlayerState;
  timestamp: number;
}

export interface PlayerInputMessage {
  type: "player:input";
  playerId: string;
  inputs: PlayerInputs;
  timestamp: number;
}

// ============================================
// Block-related messages
// ============================================

export interface BlockPlacedMessage {
  type: "block:placed";
  playerId: string;
  block: NetworkBlock;
}

export interface BlockRemovedMessage {
  type: "block:removed";
  playerId: string;
  position: Vector3;
}

export interface WorldStateMessage {
  type: "world:state";
  blocks: NetworkBlock[];
  players: NetworkPlayer[];
}

export interface WorldResetMessage {
  type: "world:reset";
  playerId: string;
}

export interface WorldSaveRequestMessage {
  type: "world:save";
  playerId: string;
}

export interface WorldSaveResponseMessage {
  type: "world:saved";
  success: boolean;
  message?: string;
}

// ============================================
// Connection messages
// ============================================

export interface ClientJoinMessage {
  type: "client:join";
  worldId: string; // Strapi document ID for the world to join
}

export interface WelcomeMessage {
  type: "welcome";
  playerId: string;
  color: string;
  state: PlayerState; // Player's initial state (position, rotation, etc.)
  worldState: WorldStateMessage;
}

export interface JoinErrorMessage {
  type: "join:error";
  message: string;
}

export interface PingMessage {
  type: "ping";
  timestamp: number;
}

export interface PongMessage {
  type: "pong";
  timestamp: number;
  serverTime: number;
}

// ============================================
// Supporting types
// ============================================

export interface PlayerInputs {
  moveForward: boolean;
  moveBackward: boolean;
  moveLeft: boolean;
  moveRight: boolean;
  jetpackUp: boolean;
  jetpackDown: boolean;
  sprint: boolean;
  hoverMode: boolean;
  cameraYaw: number;
}

export interface NetworkBlock {
  x: number;
  y: number;
  z: number;
  structureId: string;
  rotation: number;
}

export interface NetworkPlayer {
  playerId: string;
  state: PlayerState;
  color: string;
}

// ============================================
// Union type for all messages
// ============================================

export type ClientMessage =
  | ClientJoinMessage
  | PlayerInputMessage
  | BlockPlacedMessage
  | BlockRemovedMessage
  | WorldResetMessage
  | WorldSaveRequestMessage
  | PingMessage;

export type ServerMessage =
  | WelcomeMessage
  | JoinErrorMessage
  | PlayerJoinMessage
  | PlayerLeaveMessage
  | PlayerStateMessage
  | BlockPlacedMessage
  | BlockRemovedMessage
  | WorldStateMessage
  | WorldResetMessage
  | WorldSaveResponseMessage
  | PongMessage;

// ============================================
// Helper functions
// ============================================

export function createPlayerInputs(): PlayerInputs {
  return {
    moveForward: false,
    moveBackward: false,
    moveLeft: false,
    moveRight: false,
    jetpackUp: false,
    jetpackDown: false,
    sprint: false,
    hoverMode: false,
    cameraYaw: 0,
  };
}

// Player colors for multiplayer
export const PLAYER_COLORS = [
  "#e74c3c", // Red
  "#3498db", // Blue
  "#2ecc71", // Green
  "#f39c12", // Orange
  "#9b59b6", // Purple
  "#1abc9c", // Teal
  "#e91e63", // Pink
  "#00bcd4", // Cyan
];

export function getPlayerColor(index: number): string {
  return PLAYER_COLORS[index % PLAYER_COLORS.length];
}
