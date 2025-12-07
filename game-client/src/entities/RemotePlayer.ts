/**
 * RemotePlayer - Visual representation of other players in multiplayer
 *
 * Extends the character model with:
 * - Interpolation for smooth movement between server updates
 * - Player ID tracking
 * - Name label (optional)
 */

import * as THREE from "three";
import { PlayerState } from "../core/PlayerState";

export interface RemotePlayerConfig {
  color: string; // Hex color string like "#ff0000"
  playerHeight: number;
  playerWidth: number;
  interpolationTime: number; // Time to interpolate between states (ms)
}

const DEFAULT_CONFIG: RemotePlayerConfig = {
  color: "#00aaff",
  playerHeight: 2.0,
  playerWidth: 0.6,
  interpolationTime: 100, // 100ms interpolation buffer
};

interface StateSnapshot {
  state: PlayerState;
  timestamp: number;
}

export class RemotePlayer {
  private mesh: THREE.Group;
  private config: RemotePlayerConfig;
  private playerId: string;

  // Interpolation state
  private stateBuffer: StateSnapshot[] = [];
  private readonly MAX_BUFFER_SIZE = 10;
  private renderTime: number = 0;

  // Current interpolated position/rotation
  private currentPosition: THREE.Vector3 = new THREE.Vector3();
  private currentRotation: number = 0;

  constructor(
    scene: THREE.Scene,
    playerId: string,
    initialState: PlayerState,
    config: Partial<RemotePlayerConfig> = {}
  ) {
    this.playerId = playerId;
    this.config = { ...DEFAULT_CONFIG, ...config };

    // Initialize position
    this.currentPosition.set(
      initialState.position.x,
      initialState.position.y,
      initialState.position.z
    );
    this.currentRotation = initialState.rotation;

    // Create mesh
    this.mesh = this.createMesh();
    this.mesh.position.copy(this.currentPosition);
    this.mesh.rotation.y = this.currentRotation;
    scene.add(this.mesh);

    // Initialize state buffer with initial state
    this.stateBuffer.push({
      state: { ...initialState },
      timestamp: Date.now(),
    });
  }

  private createMesh(): THREE.Group {
    const group = new THREE.Group();
    const { playerHeight, playerWidth } = this.config;

    // Parse hex color string to number
    const colorNum = parseInt(this.config.color.replace("#", ""), 16);

    // Same proportions as local Character
    const headSize = playerWidth * 0.67;
    const bodyWidth = playerWidth;
    const bodyDepth = playerWidth * 0.5;
    const bodyHeight = playerHeight * 0.42;
    const legHeight = playerHeight * 0.42;
    const armWidth = playerWidth * 0.33;

    const material = new THREE.MeshStandardMaterial({ color: colorNum });
    const skinMaterial = new THREE.MeshStandardMaterial({ color: 0xffcc99 });

    // Legs
    const legGeometry = new THREE.BoxGeometry(armWidth, legHeight, bodyDepth);
    const leftLeg = new THREE.Mesh(legGeometry, material);
    leftLeg.position.set(-armWidth * 0.6, legHeight / 2, 0);
    group.add(leftLeg);

    const rightLeg = new THREE.Mesh(legGeometry, material);
    rightLeg.position.set(armWidth * 0.6, legHeight / 2, 0);
    group.add(rightLeg);

    // Body
    const bodyGeometry = new THREE.BoxGeometry(bodyWidth, bodyHeight, bodyDepth);
    const body = new THREE.Mesh(bodyGeometry, material);
    body.position.y = legHeight + bodyHeight / 2;
    group.add(body);

    // Arms
    const armGeometry = new THREE.BoxGeometry(armWidth, bodyHeight, bodyDepth);
    const leftArm = new THREE.Mesh(armGeometry, material);
    leftArm.position.set(-(bodyWidth / 2 + armWidth / 2), legHeight + bodyHeight / 2, 0);
    group.add(leftArm);

    const rightArm = new THREE.Mesh(armGeometry, material);
    rightArm.position.set(bodyWidth / 2 + armWidth / 2, legHeight + bodyHeight / 2, 0);
    group.add(rightArm);

    // Head
    const headGeometry = new THREE.BoxGeometry(headSize, headSize, headSize);
    const head = new THREE.Mesh(headGeometry, skinMaterial);
    head.position.y = legHeight + bodyHeight + headSize / 2;
    group.add(head);

    // Face indicator
    const faceGeometry = new THREE.BoxGeometry(headSize * 0.3, headSize * 0.15, 0.05);
    const faceMaterial = new THREE.MeshStandardMaterial({ color: 0x333333 });
    const face = new THREE.Mesh(faceGeometry, faceMaterial);
    face.position.set(0, legHeight + bodyHeight + headSize / 2, headSize / 2 + 0.025);
    group.add(face);

    return group;
  }

  /**
   * Receive a state update from the server
   */
  receiveState(state: PlayerState, timestamp: number): void {
    // Add to buffer
    this.stateBuffer.push({
      state: {
        position: { ...state.position },
        rotation: state.rotation,
        velocity: { ...state.velocity },
        isMoving: state.isMoving,
        isGrounded: state.isGrounded,
      },
      timestamp,
    });

    // Sort by timestamp (in case of out-of-order delivery)
    this.stateBuffer.sort((a, b) => a.timestamp - b.timestamp);

    // Trim old states
    while (this.stateBuffer.length > this.MAX_BUFFER_SIZE) {
      this.stateBuffer.shift();
    }
  }

  /**
   * Update interpolation and mesh position
   * Called every frame
   */
  update(_deltaTime: number): void {
    if (this.stateBuffer.length < 2) {
      // Not enough data to interpolate, just use latest state
      if (this.stateBuffer.length === 1) {
        const state = this.stateBuffer[0].state;
        this.currentPosition.set(state.position.x, state.position.y, state.position.z);
        this.currentRotation = state.rotation;
      }
      this.applyToMesh();
      return;
    }

    // Calculate render time (slightly behind current time for interpolation buffer)
    const now = Date.now();
    this.renderTime = now - this.config.interpolationTime;

    // Find the two states to interpolate between
    let fromState: StateSnapshot | null = null;
    let toState: StateSnapshot | null = null;

    for (let i = 0; i < this.stateBuffer.length - 1; i++) {
      if (
        this.stateBuffer[i].timestamp <= this.renderTime &&
        this.stateBuffer[i + 1].timestamp >= this.renderTime
      ) {
        fromState = this.stateBuffer[i];
        toState = this.stateBuffer[i + 1];
        break;
      }
    }

    if (fromState && toState) {
      // Interpolate between states
      const duration = toState.timestamp - fromState.timestamp;
      const elapsed = this.renderTime - fromState.timestamp;
      const t = Math.max(0, Math.min(1, elapsed / duration));

      // Lerp position
      this.currentPosition.x = this.lerp(fromState.state.position.x, toState.state.position.x, t);
      this.currentPosition.y = this.lerp(fromState.state.position.y, toState.state.position.y, t);
      this.currentPosition.z = this.lerp(fromState.state.position.z, toState.state.position.z, t);

      // Lerp rotation (handle wrap-around)
      this.currentRotation = this.lerpAngle(fromState.state.rotation, toState.state.rotation, t);
    } else if (this.stateBuffer.length > 0) {
      // Use most recent state if we're ahead of buffer
      const lastState = this.stateBuffer[this.stateBuffer.length - 1].state;
      this.currentPosition.set(lastState.position.x, lastState.position.y, lastState.position.z);
      this.currentRotation = lastState.rotation;
    }

    this.applyToMesh();
  }

  /**
   * Apply current interpolated state to mesh
   */
  private applyToMesh(): void {
    this.mesh.position.copy(this.currentPosition);
    this.mesh.rotation.y = this.currentRotation;
  }

  /**
   * Linear interpolation
   */
  private lerp(a: number, b: number, t: number): number {
    return a + (b - a) * t;
  }

  /**
   * Angle interpolation (handles wrap-around at PI/-PI)
   */
  private lerpAngle(a: number, b: number, t: number): number {
    let diff = b - a;

    // Normalize to [-PI, PI]
    while (diff > Math.PI) diff -= Math.PI * 2;
    while (diff < -Math.PI) diff += Math.PI * 2;

    return a + diff * t;
  }

  /**
   * Get player ID
   */
  getPlayerId(): string {
    return this.playerId;
  }

  /**
   * Get current position
   */
  getPosition(): THREE.Vector3 {
    return this.currentPosition.clone();
  }

  /**
   * Get mesh
   */
  getMesh(): THREE.Group {
    return this.mesh;
  }

  /**
   * Remove from scene and cleanup
   */
  dispose(scene: THREE.Scene): void {
    scene.remove(this.mesh);
    // Dispose geometries and materials
    this.mesh.traverse((child) => {
      if (child instanceof THREE.Mesh) {
        child.geometry.dispose();
        if (child.material instanceof THREE.Material) {
          child.material.dispose();
        }
      }
    });
  }
}
