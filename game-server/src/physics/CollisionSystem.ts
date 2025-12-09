/**
 * CollisionSystem - Handles player movement and collision detection
 */

import { PHYSICS_CONFIG } from "../config/ServerConfig.js";
import { WorldManager } from "../managers/WorldManager.js";
import { PlayerState } from "../shared/PlayerState.js";

export class CollisionSystem {
  constructor(private worldManager: WorldManager) {}

  /**
   * Convert world position to grid coordinates
   */
  worldToGrid(x: number, z: number): { gridX: number; gridZ: number } {
    return {
      gridX: Math.floor(x / PHYSICS_CONFIG.cellSize),
      gridZ: Math.floor(z / PHYSICS_CONFIG.cellSize),
    };
  }

  /**
   * Find the ground level (top of highest block) at a grid position
   */
  getGroundLevel(gridX: number, gridZ: number, maxY: number): number {
    for (let y = Math.floor(maxY); y >= 0; y--) {
      if (this.worldManager.hasBlock(gridX, y, gridZ)) {
        return y + 1; // Top of this block
      }
    }
    return 0;
  }

  /**
   * Check if there's head clearance at a position
   */
  hasHeadClearance(gridX: number, gridZ: number, groundY: number): boolean {
    const startY = Math.floor(groundY);
    const endY = Math.floor(groundY + PHYSICS_CONFIG.playerHeight - 0.1);

    for (let y = startY; y <= endY; y++) {
      if (this.worldManager.hasBlock(gridX, y, gridZ)) {
        return false;
      }
    }
    return true;
  }

  /**
   * Check if we can move to a target position
   * Returns the ground level we'd stand on, or -1 if blocked
   */
  canMoveTo(targetX: number, targetZ: number, currentY: number): number {
    const grid = this.worldToGrid(targetX, targetZ);

    // Find ground level at target
    const groundLevel = this.getGroundLevel(
      grid.gridX,
      grid.gridZ,
      currentY + PHYSICS_CONFIG.maxStepHeight + 1
    );

    // Calculate step needed
    const stepNeeded = groundLevel - currentY;

    // Check if step is within limits
    if (stepNeeded > PHYSICS_CONFIG.maxStepHeight) {
      return -1; // Too high to step up
    }

    // Check head clearance at the ground level
    if (!this.hasHeadClearance(grid.gridX, grid.gridZ, groundLevel)) {
      return -1; // Something blocking head/body
    }

    return groundLevel;
  }

  /**
   * Find ground level at current position for gravity
   */
  findGroundAtPosition(x: number, z: number, fromY: number): number {
    const grid = this.worldToGrid(x, z);
    return this.getGroundLevel(grid.gridX, grid.gridZ, fromY);
  }

  /**
   * Find ceiling level above position (lowest block above player's head)
   * Returns the Y position where player's head would hit, or Infinity if no ceiling
   */
  findCeilingAtPosition(x: number, z: number, fromY: number): number {
    const grid = this.worldToGrid(x, z);
    const headY = Math.floor(fromY + PHYSICS_CONFIG.playerHeight);

    // Search upward for a block
    for (let y = headY; y < headY + 50; y++) {
      if (this.worldManager.hasBlock(grid.gridX, y, grid.gridZ)) {
        // Return the Y position where feet would be when head hits this block
        return y - PHYSICS_CONFIG.playerHeight;
      }
    }
    return Infinity; // No ceiling found
  }

  /**
   * Apply movement with collision detection and sliding
   */
  applyMovementWithCollision(
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
   * Update player state with physics simulation
   */
  updatePlayerPhysics(state: PlayerState, inputs: {
    moveForward: boolean;
    moveBackward: boolean;
    moveLeft: boolean;
    moveRight: boolean;
    jetpackUp: boolean;
    jetpackDown: boolean;
    sprint: boolean;
    hoverMode: boolean;
    cameraYaw: number;
  }, deltaTime: number): void {
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
      ? PHYSICS_CONFIG.moveSpeed * PHYSICS_CONFIG.sprintMultiplier
      : PHYSICS_CONFIG.moveSpeed;
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
        state.velocity.y = PHYSICS_CONFIG.jumpForce;
      } else if (inputs.jetpackDown) {
        state.velocity.y = -PHYSICS_CONFIG.jumpForce;
      } else {
        state.velocity.y = 0; // Hover in place
      }
      state.isGrounded = false;
    } else if (inputs.jetpackUp) {
      state.velocity.y = PHYSICS_CONFIG.jumpForce;
      state.isGrounded = false;
    } else if (inputs.jetpackDown) {
      state.velocity.y = -PHYSICS_CONFIG.jumpForce;
      state.isGrounded = false;
    } else if (!state.isGrounded) {
      state.velocity.y -= PHYSICS_CONFIG.gravity * deltaTime;
    } else {
      state.velocity.y = 0;
    }

    // Calculate movement delta
    let deltaX = state.velocity.x * deltaTime;
    let deltaZ = state.velocity.z * deltaTime;
    const deltaY = state.velocity.y * deltaTime;

    // Limit horizontal movement per frame to avoid skipping cells when sprinting
    const maxMove = PHYSICS_CONFIG.cellSize * 0.8;
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
