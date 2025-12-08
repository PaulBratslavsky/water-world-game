/**
 * Centralized game configuration constants
 */

export const WORLD_CONFIG = {
  chunkSize: 32,
  cellSize: 1,
  renderDistance: 3,
  startPosition: { x: 8, z: 8 },
} as const;

export const BUILD_CONFIG = {
  maxLevel: 50,
  defaultLevel: 0,
} as const;

export const PLAYER_CONFIG = {
  moveSpeed: 5,
  sprintMultiplier: 2.0,
  gravity: 20,
  jumpForce: 8,
  playerHeight: 2.0,
  maxStepHeight: 1.0,
} as const;

export const CAMERA_CONFIG = {
  fov: 60,
  near: 0.1,
  far: 1000,
  maxPixelRatio: 2,
} as const;

export const PARTICLES_CONFIG = {
  count: 100,
  size: 0.12,
  opacity: 0.35,
  maxConeRadius: 0.35,
  minZ: -18,
  maxZ: -0.5,
} as const;

export const RENDERER_CONFIG = {
  toneMappingExposure: 1.0,
} as const;
