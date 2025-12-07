import * as THREE from "three";

/**
 * Character - Visual representation of the player
 *
 * This class is purely visual - it renders a Minecraft-style blocky character.
 * Position and rotation are controlled by PlayerController.
 */

export interface CharacterConfig {
  color: number;
  // Minecraft-accurate player dimensions (in blocks/units)
  playerHeight: number; // Total height: 2.0 blocks
  playerWidth: number; // Width/depth: 0.6 blocks
}

export class Character {
  private mesh: THREE.Group;
  private config: CharacterConfig;
  private currentPosition: THREE.Vector3;

  constructor(
    scene: THREE.Scene,
    startX: number,
    startZ: number,
    config: Partial<CharacterConfig> = {}
  ) {
    this.config = {
      color: 0x00aaff,
      // Player dimensions - exactly 2 blocks tall for clean grid alignment
      playerHeight: 2.0,
      playerWidth: 0.6,
      ...config,
    };

    this.currentPosition = new THREE.Vector3(startX, 0, startZ);
    this.mesh = this.createMesh();
    this.mesh.position.copy(this.currentPosition);
    scene.add(this.mesh);
  }

  private createMesh(): THREE.Group {
    const group = new THREE.Group();
    const { color, playerHeight, playerWidth } = this.config;

    // Minecraft-style blocky character
    // Proportions based on Minecraft player model:
    // - Head: 8x8x8 pixels = 0.5 blocks
    // - Body: 8x12x4 pixels = 0.5 wide, 0.75 tall, 0.25 deep
    // - Total height: 2.0 blocks (32 pixels at 16px/block)

    const headSize = playerWidth * 0.67; // ~0.4 blocks (8/12 of width)
    const bodyWidth = playerWidth; // 0.6 blocks
    const bodyDepth = playerWidth * 0.5; // 0.3 blocks
    const bodyHeight = playerHeight * 0.42; // ~0.75 blocks
    const legHeight = playerHeight * 0.42; // ~0.75 blocks
    const armWidth = playerWidth * 0.33; // ~0.2 blocks

    const material = new THREE.MeshStandardMaterial({ color });
    const skinMaterial = new THREE.MeshStandardMaterial({ color: 0xffcc99 }); // Skin tone for head

    // Legs (two boxes)
    const legGeometry = new THREE.BoxGeometry(armWidth, legHeight, bodyDepth);
    const leftLeg = new THREE.Mesh(legGeometry, material);
    leftLeg.position.set(-armWidth * 0.6, legHeight / 2, 0);
    group.add(leftLeg);

    const rightLeg = new THREE.Mesh(legGeometry, material);
    rightLeg.position.set(armWidth * 0.6, legHeight / 2, 0);
    group.add(rightLeg);

    // Body (torso)
    const bodyGeometry = new THREE.BoxGeometry(bodyWidth, bodyHeight, bodyDepth);
    const body = new THREE.Mesh(bodyGeometry, material);
    body.position.y = legHeight + bodyHeight / 2;
    group.add(body);

    // Arms (two boxes on sides)
    const armGeometry = new THREE.BoxGeometry(armWidth, bodyHeight, bodyDepth);
    const leftArm = new THREE.Mesh(armGeometry, material);
    leftArm.position.set(-(bodyWidth / 2 + armWidth / 2), legHeight + bodyHeight / 2, 0);
    group.add(leftArm);

    const rightArm = new THREE.Mesh(armGeometry, material);
    rightArm.position.set(bodyWidth / 2 + armWidth / 2, legHeight + bodyHeight / 2, 0);
    group.add(rightArm);

    // Head (cube)
    const headGeometry = new THREE.BoxGeometry(headSize, headSize, headSize);
    const head = new THREE.Mesh(headGeometry, skinMaterial);
    head.position.y = legHeight + bodyHeight + headSize / 2;
    group.add(head);

    // Face indicator (small box on front of head to show direction)
    const faceGeometry = new THREE.BoxGeometry(headSize * 0.3, headSize * 0.15, 0.05);
    const faceMaterial = new THREE.MeshStandardMaterial({ color: 0x333333 });
    const face = new THREE.Mesh(faceGeometry, faceMaterial);
    face.position.set(0, legHeight + bodyHeight + headSize / 2, headSize / 2 + 0.025);
    group.add(face);

    return group;
  }

  /**
   * Get current position
   */
  getPosition(): THREE.Vector3 {
    return this.currentPosition.clone();
  }

  /**
   * Get the mesh group
   */
  getMesh(): THREE.Group {
    return this.mesh;
  }

  /**
   * Set position from PlayerController state
   */
  setPosition(x: number, z: number, y?: number): void {
    this.currentPosition.x = x;
    this.currentPosition.z = z;
    if (y !== undefined) {
      this.currentPosition.y = y;
    }
    this.mesh.position.copy(this.currentPosition);
  }

  /**
   * Set position from Vector3
   */
  setPositionFromVector(position: THREE.Vector3): void {
    this.currentPosition.copy(position);
    this.mesh.position.copy(this.currentPosition);
  }

  /**
   * Set rotation (Y-axis facing direction)
   */
  setRotation(yaw: number): void {
    this.mesh.rotation.y = yaw;
  }

  /**
   * Set visibility (hidden in first-person mode)
   */
  setVisible(visible: boolean): void {
    this.mesh.visible = visible;
  }

  /**
   * Check if character is visible
   */
  isVisible(): boolean {
    return this.mesh.visible;
  }
}
