import * as THREE from "three";
import { PlayerState, createDefaultPlayerState } from "./PlayerState";
import { InputManager } from "./InputManager";

/**
 * PlayerController - Unified movement controller for FP and TP modes
 *
 * Handles WASD movement relative to camera facing direction.
 * Exposes PlayerState for rendering and network sync.
 */

export interface PlayerControllerConfig {
  inputManager: InputManager;
  moveSpeed?: number;
  sprintMultiplier?: number;
  gravity?: number;
  jumpForce?: number;
  playerHeight?: number;
  maxStepHeight?: number;
  cellSize?: number;
}

// Collision check callback type - checks if a grid cell is occupied
export type CollisionChecker3D = (
  gridX: number,
  gridY: number,
  gridZ: number
) => boolean;

export class PlayerController {
  private inputManager: InputManager;
  private state: PlayerState;

  // Movement parameters
  private moveSpeed: number;
  private sprintMultiplier: number;
  private gravity: number;
  private jumpForce: number;
  private playerHeight: number;
  private maxStepHeight: number;
  private cellSize: number;

  // Hover mode - when enabled, jetpack controls work
  private hoverMode: boolean = false;
  private _hoverModeKeyWasPressed: boolean = false;

  // Collision checker (optional, set by game)
  private collisionChecker: CollisionChecker3D | null = null;

  // Reusable THREE objects to avoid GC pressure
  private readonly _forward = new THREE.Vector3();
  private readonly _right = new THREE.Vector3();
  private readonly _movement = new THREE.Vector3();

  constructor(config: PlayerControllerConfig) {
    this.inputManager = config.inputManager;
    this.state = createDefaultPlayerState();

    this.moveSpeed = config.moveSpeed ?? 5;
    this.sprintMultiplier = config.sprintMultiplier ?? 2.0;
    this.gravity = config.gravity ?? 20;
    this.jumpForce = config.jumpForce ?? 8;
    this.playerHeight = config.playerHeight ?? 2.0;
    this.maxStepHeight = config.maxStepHeight ?? 1.0;
    this.cellSize = config.cellSize ?? 1;
  }

  /**
   * Set collision checker callback (grid-based)
   */
  setCollisionChecker(checker: CollisionChecker3D): void {
    this.collisionChecker = checker;
  }

  /**
   * Update player movement based on input and camera direction
   * @param deltaTime Time since last frame in seconds
   * @param cameraYaw Camera's Y-axis rotation in radians
   */
  update(deltaTime: number, cameraYaw: number): void {
    // Calculate movement direction based on input
    let moveX = 0;
    let moveZ = 0;

    if (this.inputManager.isActionActive("moveForward")) {
      moveZ -= 1;
    }
    if (this.inputManager.isActionActive("moveBackward")) {
      moveZ += 1;
    }
    if (this.inputManager.isActionActive("moveLeft")) {
      moveX -= 1;
    }
    if (this.inputManager.isActionActive("moveRight")) {
      moveX += 1;
    }

    // Normalize diagonal movement
    const length = Math.sqrt(moveX * moveX + moveZ * moveZ);
    if (length > 0) {
      moveX /= length;
      moveZ /= length;
    }

    // Calculate forward and right vectors from camera yaw
    this._forward.set(
      -Math.sin(cameraYaw),
      0,
      -Math.cos(cameraYaw)
    );
    this._right.set(
      Math.cos(cameraYaw),
      0,
      -Math.sin(cameraYaw)
    );

    // Calculate world-space movement
    this._movement.set(0, 0, 0);
    this._movement.addScaledVector(this._forward, -moveZ);
    this._movement.addScaledVector(this._right, moveX);

    // Check if sprinting (shift key)
    const isSprinting = this.inputManager.isKeyPressed("shift");
    const currentSpeed = isSprinting
      ? this.moveSpeed * this.sprintMultiplier
      : this.moveSpeed;

    // Apply horizontal velocity
    this.state.velocity.x = this._movement.x * currentSpeed;
    this.state.velocity.z = this._movement.z * currentSpeed;

    // Update moving state
    this.state.isMoving = length > 0;

    // Update rotation to face movement direction
    if (this.state.isMoving) {
      this.state.rotation = Math.atan2(
        this.state.velocity.x,
        this.state.velocity.z
      );
    }

    // Toggle hover mode with H key
    if (this.inputManager.isActionActive("toggleHoverMode")) {
      // Only toggle on key press, not hold
      if (!this._hoverModeKeyWasPressed) {
        this.hoverMode = !this.hoverMode;
        this._hoverModeKeyWasPressed = true;
      }
    } else {
      this._hoverModeKeyWasPressed = false;
    }

    // Jetpack up (Space) - always works
    if (this.inputManager.isActionActive("jetpackUp")) {
      this.state.velocity.y = this.jumpForce;
      this.state.isGrounded = false;
    }
    // Jetpack down (C) - always works
    else if (this.inputManager.isActionActive("jetpackDown")) {
      this.state.velocity.y = -this.jumpForce;
      this.state.isGrounded = false;
    }
    // No jetpack input
    else {
      if (this.hoverMode) {
        // Hover mode: no gravity, stay in place
        this.state.velocity.y = 0;
      } else if (!this.state.isGrounded) {
        // Normal mode: apply gravity
        this.state.velocity.y -= this.gravity * deltaTime;
      } else {
        // On ground: no vertical velocity
        this.state.velocity.y = 0;
      }
    }

    // Calculate movement delta
    let deltaX = this.state.velocity.x * deltaTime;
    let deltaZ = this.state.velocity.z * deltaTime;
    const deltaY = this.state.velocity.y * deltaTime;

    // Limit horizontal movement per frame to avoid skipping cells when sprinting
    // Maximum movement should be less than cell size to ensure collision detection works
    const maxMove = this.cellSize * 0.8; // 80% of cell size max per frame
    const horizontalDist = Math.sqrt(deltaX * deltaX + deltaZ * deltaZ);

    if (horizontalDist > maxMove) {
      const scale = maxMove / horizontalDist;
      deltaX *= scale;
      deltaZ *= scale;
    }

    const newX = this.state.position.x + deltaX;
    const newY = this.state.position.y + deltaY;
    const newZ = this.state.position.z + deltaZ;

    // Check collisions and update position
    this.applyMovementWithCollision(newX, newY, newZ);

    // Ground check - find ground level at current position
    const groundLevel = this.findGroundAtPosition(
      this.state.position.x,
      this.state.position.z,
      this.state.position.y + 0.1
    );

    if (this.state.position.y <= groundLevel) {
      this.state.position.y = groundLevel;
      this.state.velocity.y = 0;
      this.state.isGrounded = true;
    } else if (this.state.position.y <= groundLevel + 0.01) {
      // Very close to ground, consider grounded
      this.state.isGrounded = true;
    } else {
      this.state.isGrounded = false;
    }
  }

  /**
   * Check if there's a block at grid position
   */
  private hasBlockAt(gridX: number, gridY: number, gridZ: number): boolean {
    if (!this.collisionChecker) return false;
    return this.collisionChecker(gridX, gridY, gridZ);
  }

  /**
   * Get the grid cell for a world position
   */
  private worldToGrid(x: number, z: number): { gridX: number; gridZ: number } {
    return {
      gridX: Math.floor(x / this.cellSize),
      gridZ: Math.floor(z / this.cellSize),
    };
  }

  /**
   * Find the ground level (top of highest block) at a grid position
   */
  private getGroundLevel(gridX: number, gridZ: number, maxY: number): number {
    if (!this.collisionChecker) return 0;

    for (let y = Math.floor(maxY); y >= 0; y--) {
      if (this.hasBlockAt(gridX, y, gridZ)) {
        return y + 1; // Top of this block
      }
    }
    return 0;
  }

  /**
   * Check if there's head clearance at a position
   * groundY is the ground level (top of block player stands on)
   * We check if there are blocks from groundY to groundY + playerHeight
   */
  private hasHeadClearance(gridX: number, gridZ: number, groundY: number): boolean {
    if (!this.collisionChecker) return true;

    // Check from where feet would be to where head would be
    const startY = Math.floor(groundY);
    const endY = Math.floor(groundY + this.playerHeight - 0.1);

    for (let y = startY; y <= endY; y++) {
      if (this.hasBlockAt(gridX, y, gridZ)) {
        return false;
      }
    }
    return true;
  }

  /**
   * Check if we can move to a target position
   * Returns the ground level we'd stand on, or -1 if blocked
   */
  private canMoveTo(targetX: number, targetZ: number, currentY: number): number {
    const grid = this.worldToGrid(targetX, targetZ);

    // Find ground level at target
    const groundLevel = this.getGroundLevel(grid.gridX, grid.gridZ, currentY + this.maxStepHeight + 1);

    // Calculate step needed
    const stepNeeded = groundLevel - currentY;

    // Check if step is within limits (can step up maxStepHeight, can step down any amount)
    if (stepNeeded > this.maxStepHeight) {
      return -1; // Too high to step up
    }

    // Check head clearance at the ground level
    if (!this.hasHeadClearance(grid.gridX, grid.gridZ, groundLevel)) {
      return -1; // Something blocking head/body
    }

    return groundLevel;
  }

  /**
   * Simple movement with automatic step-up
   */
  private applyMovementWithCollision(
    newX: number,
    newY: number,
    newZ: number
  ): void {
    if (!this.collisionChecker) {
      this.state.position.x = newX;
      this.state.position.y = newY;
      this.state.position.z = newZ;
      return;
    }

    // Apply vertical movement first (gravity/jetpack)
    this.state.position.y = newY;
    const currentY = this.state.position.y;

    // Try to move to target position
    const groundAtTarget = this.canMoveTo(newX, newZ, currentY);
    if (groundAtTarget >= 0) {
      this.state.position.x = newX;
      this.state.position.z = newZ;
      // Step up if needed
      if (groundAtTarget > currentY + 0.01) {
        this.state.position.y = groundAtTarget;
        this.state.isGrounded = true;
        this.state.velocity.y = 0;
      }
      return;
    }

    // Blocked - try sliding along X axis only
    const groundAtX = this.canMoveTo(newX, this.state.position.z, currentY);
    if (groundAtX >= 0) {
      this.state.position.x = newX;
      if (groundAtX > currentY + 0.01) {
        this.state.position.y = groundAtX;
        this.state.isGrounded = true;
        this.state.velocity.y = 0;
      }
      this.state.velocity.z = 0;
      return;
    }

    // Try sliding along Z axis only
    const groundAtZ = this.canMoveTo(this.state.position.x, newZ, currentY);
    if (groundAtZ >= 0) {
      this.state.position.z = newZ;
      if (groundAtZ > currentY + 0.01) {
        this.state.position.y = groundAtZ;
        this.state.isGrounded = true;
        this.state.velocity.y = 0;
      }
      this.state.velocity.x = 0;
      return;
    }

    // Completely blocked
    this.state.velocity.x = 0;
    this.state.velocity.z = 0;
  }

  /**
   * Find ground level at current position for gravity
   */
  private findGroundAtPosition(x: number, z: number, fromY: number): number {
    const grid = this.worldToGrid(x, z);
    return this.getGroundLevel(grid.gridX, grid.gridZ, fromY);
  }

  /**
   * Get current player state (for rendering/sync)
   */
  getState(): PlayerState {
    return this.state;
  }

  /**
   * Get position as THREE.Vector3
   */
  getPosition(): THREE.Vector3 {
    return new THREE.Vector3(
      this.state.position.x,
      this.state.position.y,
      this.state.position.z
    );
  }

  /**
   * Apply state (for multiplayer sync)
   */
  setState(newState: PlayerState): void {
    this.state = {
      position: { ...newState.position },
      rotation: newState.rotation,
      velocity: { ...newState.velocity },
      isMoving: newState.isMoving,
      isGrounded: newState.isGrounded,
    };
  }

  /**
   * Set position directly (teleport)
   */
  setPosition(x: number, y: number, z: number): void {
    this.state.position.x = x;
    this.state.position.y = y;
    this.state.position.z = z;
    this.state.velocity.x = 0;
    this.state.velocity.y = 0;
    this.state.velocity.z = 0;
  }

  /**
   * Set rotation directly
   */
  setRotation(rotation: number): void {
    this.state.rotation = rotation;
  }

  /**
   * Get current Y rotation
   */
  getRotation(): number {
    return this.state.rotation;
  }

  /**
   * Check if player is moving
   */
  isMoving(): boolean {
    return this.state.isMoving;
  }

  /**
   * Set move speed
   */
  setMoveSpeed(speed: number): void {
    this.moveSpeed = speed;
  }

  /**
   * Check if hover mode is active
   */
  isHoverMode(): boolean {
    return this.hoverMode;
  }
}
