import * as THREE from "three";
import { emitEvent } from "./EventBus";

/**
 * InputManager - Centralized input handling with action mapping
 *
 * Handles all keyboard and mouse input, converts to game actions,
 * and emits events for other systems to consume.
 */

export interface InputConfig {
  domElement: HTMLElement;
  camera: THREE.PerspectiveCamera;
}

// Action types that can be bound to keys
export type InputAction =
  | "moveForward"
  | "moveBackward"
  | "moveLeft"
  | "moveRight"
  | "rotateLeft"
  | "rotateRight"
  | "toggleBuildMode"
  | "rotateStructure"
  | "cancel"
  | "toggleViewMode"
  | "levelUp"
  | "levelDown"
  | "jetpackUp"
  | "jetpackDown"
  | "toggleHoverMode";

// Default key bindings
const DEFAULT_KEY_BINDINGS: Record<string, InputAction> = {
  w: "moveForward",
  s: "moveBackward",
  a: "moveLeft",
  d: "moveRight",
  arrowup: "moveForward",
  arrowdown: "moveBackward",
  arrowleft: "moveLeft",
  arrowright: "moveRight",
  q: "rotateLeft",
  e: "rotateRight",
  b: "toggleBuildMode",
  r: "rotateStructure",
  escape: "cancel",
  v: "toggleViewMode",
  "[": "levelDown",
  "]": "levelUp",
  pageup: "levelUp",
  pagedown: "levelDown",
  " ": "jetpackUp",
  c: "jetpackDown",  // Changed from shift - shift is used for sprint
  h: "toggleHoverMode",
};

// Block mesh provider callback type - returns all block meshes for raycasting
export type BlockMeshProvider = () => THREE.Object3D[];

export class InputManager {
  private camera: THREE.PerspectiveCamera;
  private domElement: HTMLElement;
  private raycaster: THREE.Raycaster;
  private keyBindings: Record<string, InputAction>;

  // Track currently pressed keys/actions
  private keysPressed: Set<string> = new Set();
  private actionsActive: Set<InputAction> = new Set();

  // Ground plane for raycasting
  private groundPlane: THREE.Plane;

  // Optional block mesh provider for accurate raycasting against placed blocks
  private blockMeshProvider: BlockMeshProvider | null = null;

  // Build mode flag - when true, only raycast against ground plane (not blocks)
  private buildModeRaycast: boolean = false;

  constructor(config: InputConfig) {
    this.camera = config.camera;
    this.domElement = config.domElement;
    this.raycaster = new THREE.Raycaster();
    this.groundPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
    this.keyBindings = { ...DEFAULT_KEY_BINDINGS };

    this.setupEventListeners();
  }

  /**
   * Set a callback to get all block meshes for raycasting
   */
  setBlockMeshProvider(provider: BlockMeshProvider): void {
    this.blockMeshProvider = provider;
  }

  private setupEventListeners(): void {
    // Keyboard
    window.addEventListener("keydown", this.onKeyDown);
    window.addEventListener("keyup", this.onKeyUp);

    // Mouse
    this.domElement.addEventListener("click", this.onClick);
    this.domElement.addEventListener("contextmenu", this.onRightClick);
  }

  /**
   * Check if user is typing in an input field or modal is open
   */
  private isInputFocused(): boolean {
    const activeElement = document.activeElement;
    const isTyping =
      activeElement instanceof HTMLInputElement ||
      activeElement instanceof HTMLTextAreaElement ||
      activeElement instanceof HTMLSelectElement;

    // Also check if prefab modal is visible
    const modal = document.getElementById("prefab-modal");
    const isModalOpen = modal?.classList.contains("visible") ?? false;

    return isTyping || isModalOpen;
  }

  private onKeyDown = (event: KeyboardEvent): void => {
    // Ignore input when typing in form fields or modal is open
    if (this.isInputFocused()) return;

    const key = event.key.toLowerCase();

    if (this.keysPressed.has(key)) return; // Prevent repeat
    this.keysPressed.add(key);

    // Map to action
    const action = this.keyBindings[key];
    if (action) {
      this.actionsActive.add(action);
    }

    emitEvent("input:keyDown", { key });
  };

  private onKeyUp = (event: KeyboardEvent): void => {
    const key = event.key.toLowerCase();
    this.keysPressed.delete(key);

    // Unmap action
    const action = this.keyBindings[key];
    if (action) {
      this.actionsActive.delete(action);
    }

    emitEvent("input:keyUp", { key });
  };

  private onClick = (event: MouseEvent): void => {
    const intersection = this.getGroundIntersection(event);
    if (!intersection) return;

    emitEvent("input:click", intersection);
  };

  private onRightClick = (event: MouseEvent): void => {
    event.preventDefault();

    const intersection = this.getGroundIntersection(event);
    if (!intersection) return;

    emitEvent("input:rightClick", intersection);
  };

  private getGroundIntersection(event: MouseEvent): {
    worldX: number;
    worldY: number;
    worldZ: number;
    gridX: number;
    gridY: number;
    gridZ: number;
  } | null {
    const mouse = new THREE.Vector2(
      (event.clientX / window.innerWidth) * 2 - 1,
      -(event.clientY / window.innerHeight) * 2 + 1
    );

    this.raycaster.setFromCamera(mouse, this.camera);

    // In build mode, only use the ground plane at the current build level
    // This prevents "bleeding through" to blocks on other levels
    if (!this.buildModeRaycast && this.blockMeshProvider) {
      // First, try raycasting against actual block meshes
      const blockMeshes = this.blockMeshProvider();
      if (blockMeshes.length > 0) {
        const intersects = this.raycaster.intersectObjects(blockMeshes, false);
        if (intersects.length > 0) {
          const hit = intersects[0];
          const point = hit.point;
          const face = hit.face;

          // Calculate grid position
          const gridX = Math.floor(point.x);
          const gridZ = Math.floor(point.z);

          // Determine the Y level based on which face was hit
          // If we hit the top face (normal pointing up), character stands on top
          // If we hit a side face, character stands at the base level of that block
          let worldY: number;

          if (face && face.normal.y > 0.5) {
            // Hit the top face - stand on top of this block
            // point.y is at the top surface (e.g., 1.0 for a block at gridY=0)
            worldY = Math.round(point.y);
          } else {
            // Hit a side or bottom face - stand at ground level next to the block
            // For InstancedMesh, we can't use object.position (it's the group position)
            // Instead, derive the Y level from the hit point
            // The block center is at gridY + 0.5, so if point.y is 0.7, block is at level 0
            // If point.y is 1.3, block is at level 1, etc.
            const blockGridY = Math.floor(point.y);
            worldY = blockGridY; // Stand at the base of this block
          }

          const gridY = worldY;

          return {
            worldX: point.x,
            worldY,
            worldZ: point.z,
            gridX,
            gridY,
            gridZ,
          };
        }
      }
    }

    // Fall back to ground plane intersection (always used in build mode)
    const intersectPoint = new THREE.Vector3();
    if (this.raycaster.ray.intersectPlane(this.groundPlane, intersectPoint)) {
      const gridX = Math.floor(intersectPoint.x);
      const gridZ = Math.floor(intersectPoint.z);
      // Use the ground plane height as the Y level (set via setGroundPlaneHeight)
      const groundY = -this.groundPlane.constant;

      return {
        worldX: intersectPoint.x,
        worldY: groundY,
        worldZ: intersectPoint.z,
        gridX,
        gridY: Math.floor(groundY),
        gridZ,
      };
    }

    return null;
  }

  /**
   * Check if an action is currently active (key held down)
   */
  isActionActive(action: InputAction): boolean {
    return this.actionsActive.has(action);
  }

  /**
   * Check if a specific key is pressed
   */
  isKeyPressed(key: string): boolean {
    return this.keysPressed.has(key.toLowerCase());
  }

  /**
   * Update key binding
   */
  setKeyBinding(key: string, action: InputAction): void {
    this.keyBindings[key.toLowerCase()] = action;
  }

  /**
   * Get current key bindings
   */
  getKeyBindings(): Record<string, InputAction> {
    return { ...this.keyBindings };
  }

  /**
   * Set the ground plane height for raycasting (used in build mode)
   */
  setGroundPlaneHeight(height: number): void {
    this.groundPlane.constant = -height;
  }

  /**
   * Set build mode raycast behavior
   * When true, only raycast against the ground plane (ignores block meshes)
   * This prevents "bleeding through" to blocks on other levels
   */
  setBuildModeRaycast(enabled: boolean): void {
    this.buildModeRaycast = enabled;
  }

  /**
   * Cleanup event listeners
   */
  dispose(): void {
    window.removeEventListener("keydown", this.onKeyDown);
    window.removeEventListener("keyup", this.onKeyUp);
    this.domElement.removeEventListener("click", this.onClick);
    this.domElement.removeEventListener("contextmenu", this.onRightClick);
  }
}
