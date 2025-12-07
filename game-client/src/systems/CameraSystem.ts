import * as THREE from "three";
import { onEvent, emitEvent } from "../core/EventBus";
import { stateManager, CameraMode } from "../core/StateManager";
import { InputManager } from "../core/InputManager";

/**
 * CameraSystem - Unified camera management for all camera modes
 *
 * Three camera modes:
 * - first-person: Camera at player position, follows player movement
 * - third-person: Camera behind player, follows player movement
 * - build: Free-flying camera, Y locked to build level
 *
 * Mouse look is handled via pointer lock for smooth rotation.
 * Movement in FP/TP is handled by PlayerController.
 */

export interface CameraSystemConfig {
  // Third-person settings
  thirdPersonDistance: number;
  minDistance: number;
  maxDistance: number;
  zoomSpeed: number;
  thirdPersonHeight: number; // Height offset above player

  // First-person settings
  eyeHeight: number;

  // Build mode settings
  buildCameraSpeed: number;
  buildCameraHeight: number; // Height above build level

  // Mouse look
  lookSpeed: number;

  // Common
  smoothing: number;
}

const DEFAULT_CONFIG: CameraSystemConfig = {
  thirdPersonDistance: 15,
  minDistance: 5,
  maxDistance: 50,
  zoomSpeed: 3,
  thirdPersonHeight: 3,
  eyeHeight: 1.7,
  buildCameraSpeed: 15,
  buildCameraHeight: 10, // Height above build level for better overview
  lookSpeed: 0.002,
  smoothing: 0.15,
};

export class CameraSystem {
  private camera: THREE.PerspectiveCamera;
  private inputManager: InputManager;
  private config: CameraSystemConfig;
  private domElement: HTMLElement;

  // Camera state
  private yaw: number = 0; // Horizontal rotation (radians)
  private pitch: number = 0; // Vertical rotation (radians)

  // Third-person state
  private targetDistance: number;
  private currentDistance: number;

  // Build mode state
  private buildPosition: THREE.Vector3;
  private buildLevel: number = 0;
  private buildTargetPosition: THREE.Vector3; // Ghost block position to orbit around
  private buildDistance: number = 15; // Distance from ghost block

  // Player tracking (set by PlayerController)
  private playerPosition: THREE.Vector3;

  // Pointer lock state
  private isPointerLocked: boolean = false;

  // Reusable objects to avoid GC pressure
  private readonly _forward = new THREE.Vector3();
  private readonly _right = new THREE.Vector3();
  private readonly _movement = new THREE.Vector3();
  private readonly _cameraPosition = new THREE.Vector3();
  private readonly _lookTarget = new THREE.Vector3();
  private readonly _quaternion = new THREE.Quaternion();
  private readonly _euler = new THREE.Euler(0, 0, 0, "YXZ");

  constructor(
    camera: THREE.PerspectiveCamera,
    domElement: HTMLElement,
    inputManager: InputManager,
    startPosition: THREE.Vector3,
    config: Partial<CameraSystemConfig> = {}
  ) {
    this.camera = camera;
    this.domElement = domElement;
    this.inputManager = inputManager;
    this.config = { ...DEFAULT_CONFIG, ...config };

    // Initialize state
    this.playerPosition = startPosition.clone();
    this.buildPosition = startPosition.clone();
    this.buildTargetPosition = startPosition.clone();
    this.targetDistance = this.config.thirdPersonDistance;
    this.currentDistance = this.config.thirdPersonDistance;
    this.buildDistance = this.config.thirdPersonDistance;

    // Initial camera pitch for third-person (looking down at player)
    this.pitch = -0.5; // About 30 degrees down

    this.setupEventListeners();
    // Initial camera update
    this.updateThirdPerson(0);
  }

  private setupEventListeners(): void {
    // Camera mode changes
    onEvent("state:cameraModeChanged", ({ cameraMode, previous }) => {
      this.onCameraModeChanged(cameraMode, previous);
    });

    // Mouse wheel for zoom (third-person and build mode)
    this.domElement.addEventListener("wheel", (e) => {
      const mode = stateManager.getCameraMode();
      if (mode === "third-person" || mode === "build") {
        e.preventDefault();
        this.zoom(e.deltaY > 0 ? 1 : -1);
      }
    });

    // Pointer lock request on click (for first-person and third-person modes)
    this.domElement.addEventListener("click", () => {
      const mode = stateManager.getCameraMode();
      if ((mode === "first-person" || mode === "third-person") && !this.isPointerLocked) {
        this.domElement.requestPointerLock();
      }
    });

    document.addEventListener("pointerlockchange", () => {
      this.isPointerLocked = document.pointerLockElement === this.domElement;
    });

    // Prevent context menu on right click (build mode uses right-click for deleting blocks)
    this.domElement.addEventListener("contextmenu", (e) => {
      const mode = stateManager.getCameraMode();
      if (mode === "build") {
        e.preventDefault();
      }
    });

    // Mouse movement for look
    document.addEventListener("mousemove", (e) => {
      const mode = stateManager.getCameraMode();

      // First-person: requires pointer lock
      if (mode === "first-person" && this.isPointerLocked) {
        this.yaw -= e.movementX * this.config.lookSpeed;
        this.pitch -= e.movementY * this.config.lookSpeed;

        // Clamp pitch to prevent flipping
        const maxPitch = Math.PI / 2 - 0.1;
        this.pitch = Math.max(-maxPitch, Math.min(maxPitch, this.pitch));
      }

      // Third-person: free mouse look (like first-person but with pointer lock)
      if (mode === "third-person" && this.isPointerLocked) {
        this.yaw -= e.movementX * this.config.lookSpeed;
        this.pitch -= e.movementY * this.config.lookSpeed;

        // Clamp pitch
        const maxPitch = Math.PI / 2 - 0.1;
        this.pitch = Math.max(-maxPitch, Math.min(maxPitch, this.pitch));
      }

      // Build mode: fixed isometric view, no mouse rotation
      // Use Q/E keys to rotate camera around target
    });
  }

  private onCameraModeChanged(cameraMode: CameraMode, previous: CameraMode): void {
    if (cameraMode === "build") {
      // Entering build mode - position camera at player location but higher for overview
      this.buildPosition.copy(this.playerPosition);
      this.buildPosition.y = this.buildLevel + this.config.buildCameraHeight;
      // Tilt down slightly to see the build area
      this.pitch = -0.5; // About 30 degrees down

      // Release pointer lock when entering build mode (need free mouse for placing blocks)
      if (this.isPointerLocked) {
        document.exitPointerLock();
      }
    } else if (previous === "build") {
      // Exiting build mode - could sync position back, but player hasn't moved
      // Reset to a reasonable third-person pitch
      if (cameraMode === "third-person") {
        this.pitch = -0.5;
      }
    }
  }

  /**
   * Set the current build level (Y position for build mode camera)
   */
  setBuildLevel(level: number): void {
    this.buildLevel = level;
    this.buildTargetPosition.y = level;
  }

  /**
   * Get the current build level
   */
  getBuildLevel(): number {
    return this.buildLevel;
  }

  /**
   * Set the ghost block position (build mode target to orbit around)
   */
  setBuildTargetPosition(x: number, z: number): void {
    this.buildTargetPosition.x = x;
    this.buildTargetPosition.z = z;
  }

  /**
   * Update player position (called from game loop after PlayerController update)
   */
  setPlayerPosition(position: THREE.Vector3): void {
    this.playerPosition.copy(position);
  }

  /**
   * Zoom in/out (third-person and build mode)
   */
  zoom(direction: number): void {
    if (stateManager.getCameraMode() === "build") {
      // In build mode, zoom adjusts distance from ghost block (like third-person)
      this.buildDistance += direction * this.config.zoomSpeed;
      this.buildDistance = Math.max(
        this.config.minDistance,
        Math.min(this.config.maxDistance, this.buildDistance)
      );
    } else {
      // Third-person zoom adjusts distance
      this.targetDistance += direction * this.config.zoomSpeed;
      this.targetDistance = Math.max(
        this.config.minDistance,
        Math.min(this.config.maxDistance, this.targetDistance)
      );
    }
  }

  /**
   * Update camera based on current mode
   */
  update(deltaTime: number): void {
    const mode = stateManager.getCameraMode();

    switch (mode) {
      case "first-person":
        this.updateFirstPerson();
        break;
      case "third-person":
        this.updateThirdPerson(deltaTime);
        break;
      case "build":
        this.updateBuildMode(deltaTime);
        break;
    }

    emitEvent("camera:moved", {
      x: this.camera.position.x,
      z: this.camera.position.z,
    });
  }

  private updateFirstPerson(): void {
    // Camera is at player position + eye height
    this.camera.position.set(
      this.playerPosition.x,
      this.playerPosition.y + this.config.eyeHeight,
      this.playerPosition.z
    );

    // Apply rotation from mouse look
    this._euler.set(this.pitch, this.yaw, 0);
    this._quaternion.setFromEuler(this._euler);
    this.camera.quaternion.copy(this._quaternion);
  }

  private updateThirdPerson(deltaTime: number): void {
    const rotateSpeed = 2.0; // Radians per second

    // Handle Q/E rotation around player
    if (this.inputManager.isActionActive("rotateLeft")) {
      this.yaw += rotateSpeed * deltaTime;
    }
    if (this.inputManager.isActionActive("rotateRight")) {
      this.yaw -= rotateSpeed * deltaTime;
    }

    // Smooth distance interpolation
    this.currentDistance += (this.targetDistance - this.currentDistance) * this.config.smoothing;

    // Calculate camera position behind and above player
    const horizontalDist = this.currentDistance * Math.cos(-this.pitch);
    const verticalDist = this.currentDistance * Math.sin(-this.pitch);

    this._cameraPosition.set(
      this.playerPosition.x + horizontalDist * Math.sin(this.yaw),
      this.playerPosition.y + this.config.thirdPersonHeight + verticalDist,
      this.playerPosition.z + horizontalDist * Math.cos(this.yaw)
    );

    // Look at player
    this._lookTarget.set(
      this.playerPosition.x,
      this.playerPosition.y + this.config.eyeHeight,
      this.playerPosition.z
    );

    this.camera.position.copy(this._cameraPosition);
    this.camera.lookAt(this._lookTarget);
  }

  private updateBuildMode(deltaTime: number): void {
    // Orbit camera around ghost block position (like third-person around character)
    // WASD moves the target (ghost block), camera follows
    // Q/E rotates camera around target, scroll zooms

    const speed = this.config.buildCameraSpeed;
    const rotateSpeed = 2.0; // Radians per second

    // Handle Q/E rotation around target
    if (this.inputManager.isActionActive("rotateLeft")) {
      this.yaw += rotateSpeed * deltaTime;
    }
    if (this.inputManager.isActionActive("rotateRight")) {
      this.yaw -= rotateSpeed * deltaTime;
    }

    // Calculate forward/right vectors from yaw for target movement
    this._forward.set(-Math.sin(this.yaw), 0, -Math.cos(this.yaw));
    this._right.set(Math.cos(this.yaw), 0, -Math.sin(this.yaw));

    this._movement.set(0, 0, 0);

    if (this.inputManager.isActionActive("moveForward")) {
      this._movement.add(this._forward);
    }
    if (this.inputManager.isActionActive("moveBackward")) {
      this._movement.sub(this._forward);
    }
    if (this.inputManager.isActionActive("moveLeft")) {
      this._movement.sub(this._right);
    }
    if (this.inputManager.isActionActive("moveRight")) {
      this._movement.add(this._right);
    }

    // Move the target position (ghost block follows camera movement)
    if (this._movement.length() > 0) {
      this._movement.normalize().multiplyScalar(speed * deltaTime);
      this.buildTargetPosition.x += this._movement.x;
      this.buildTargetPosition.z += this._movement.z;
    }

    // Calculate camera position orbiting around target (like third-person)
    const horizontalDist = this.buildDistance * Math.cos(-this.pitch);
    const verticalDist = this.buildDistance * Math.sin(-this.pitch);

    this._cameraPosition.set(
      this.buildTargetPosition.x + horizontalDist * Math.sin(this.yaw),
      this.buildTargetPosition.y + this.config.thirdPersonHeight + verticalDist,
      this.buildTargetPosition.z + horizontalDist * Math.cos(this.yaw)
    );

    // Look at target (ghost block position)
    this._lookTarget.set(
      this.buildTargetPosition.x,
      this.buildTargetPosition.y + 0.5, // Center of block
      this.buildTargetPosition.z
    );

    this.camera.position.copy(this._cameraPosition);
    this.camera.lookAt(this._lookTarget);
  }

  /**
   * Get current camera yaw (used by PlayerController for movement direction)
   */
  getYaw(): number {
    return this.yaw;
  }

  /**
   * Get current camera pitch
   */
  getPitch(): number {
    return this.pitch;
  }

  /**
   * Get camera world position
   */
  getPosition(): THREE.Vector3 {
    return this.camera.position.clone();
  }

  /**
   * Get build mode camera position
   */
  getBuildPosition(): THREE.Vector3 {
    return this.buildPosition.clone();
  }

  /**
   * Get build target position (ghost block location)
   */
  getBuildTargetPosition(): THREE.Vector3 {
    return this.buildTargetPosition.clone();
  }

  /**
   * Check if pointer is locked
   */
  hasPointerLock(): boolean {
    return this.isPointerLocked;
  }

  /**
   * Set yaw directly (for syncing)
   */
  setYaw(yaw: number): void {
    this.yaw = yaw;
  }

  /**
   * Set pitch directly (for syncing)
   */
  setPitch(pitch: number): void {
    this.pitch = pitch;
  }
}
