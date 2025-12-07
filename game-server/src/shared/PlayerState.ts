/**
 * PlayerState - Serializable player state for multiplayer sync
 *
 * This interface represents all the state needed to sync a player
 * across the network. Keep it minimal and serializable.
 */

export interface Vector3 {
  x: number;
  y: number;
  z: number;
}

export interface PlayerState {
  // Position in world space
  position: Vector3;

  // Y-axis rotation in radians (facing direction)
  rotation: number;

  // Current velocity
  velocity: Vector3;

  // Movement flags
  isMoving: boolean;
  isGrounded: boolean;
}

/**
 * Create a default player state
 */
export function createDefaultPlayerState(): PlayerState {
  return {
    position: { x: 0, y: 0, z: 0 },
    rotation: 0,
    velocity: { x: 0, y: 0, z: 0 },
    isMoving: false,
    isGrounded: true,
  };
}

/**
 * Clone a player state (for immutable updates)
 */
export function clonePlayerState(state: PlayerState): PlayerState {
  return {
    position: { ...state.position },
    rotation: state.rotation,
    velocity: { ...state.velocity },
    isMoving: state.isMoving,
    isGrounded: state.isGrounded,
  };
}
