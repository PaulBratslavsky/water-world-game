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
  private playerLight: THREE.PointLight | null = null;
  private playerSpotlight: THREE.SpotLight | null = null;
  private fogParticles: THREE.Points | null = null;
  private particleVelocities: Float32Array | null = null;

  constructor(
    scene: THREE.Scene,
    startX: number,
    startZ: number,
    config: Partial<CharacterConfig> = {}
  ) {
    this.config = {
      color: 0x00aaff,
      // Player dimensions - exactly 2 blocks tall for clean grid alignment
      playerHeight: 4.0,
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

  /**
   * Enable/disable the player's torch light (for night mode)
   */
  setLightEnabled(enabled: boolean, config?: { color?: number; intensity?: number; distance?: number }): void {
    if (enabled) {
      const color = config?.color ?? 0xffaa44;
      const intensity = config?.intensity ?? 2.5;
      const distance = config?.distance ?? 12;

      // Create ambient point light for immediate surroundings
      if (!this.playerLight) {
        this.playerLight = new THREE.PointLight(color, intensity * 0.5, distance * 0.6, 1.0);
        this.playerLight.position.set(0, 1.5, 0);
        this.mesh.add(this.playerLight);
      } else {
        this.playerLight.color.setHex(color);
        this.playerLight.intensity = intensity * 0.5;
        this.playerLight.distance = distance * 0.6;
      }

      // Create spotlight for forward-facing torch beam
      if (!this.playerSpotlight) {
        this.playerSpotlight = new THREE.SpotLight(color, intensity * 1.5, distance, Math.PI / 5, 0.3, 1.0);
        this.playerSpotlight.position.set(0, 1.6, 0.2);
        // Target is in front of the character
        this.playerSpotlight.target.position.set(0, 0.5, 10);
        this.mesh.add(this.playerSpotlight);
        this.mesh.add(this.playerSpotlight.target);
      } else {
        this.playerSpotlight.color.setHex(color);
        this.playerSpotlight.intensity = intensity * 1.5;
        this.playerSpotlight.distance = distance;
      }

      // Create fog particles in the light beam
      this.createFogParticles(color, distance);

    } else if (!enabled) {
      if (this.playerLight) {
        this.mesh.remove(this.playerLight);
        this.playerLight.dispose();
        this.playerLight = null;
      }
      if (this.playerSpotlight) {
        this.mesh.remove(this.playerSpotlight.target);
        this.mesh.remove(this.playerSpotlight);
        this.playerSpotlight.dispose();
        this.playerSpotlight = null;
      }
      this.removeFogParticles();
    }
  }

  /**
   * Create floating fog particles in the light beam
   */
  private createFogParticles(color: number, distance: number): void {
    this.removeFogParticles();

    const particleCount = 80;
    const positions = new Float32Array(particleCount * 3);
    const sizes = new Float32Array(particleCount);
    this.particleVelocities = new Float32Array(particleCount * 3);

    // Distribute particles in a cone shape
    for (let i = 0; i < particleCount; i++) {
      const t = Math.random(); // 0 to 1 along the cone
      const z = t * distance * 0.6 + 0.5; // Distance from player
      const radius = t * distance * 0.25; // Cone gets wider further out
      const angle = Math.random() * Math.PI * 2;

      positions[i * 3] = Math.cos(angle) * radius * Math.random();
      positions[i * 3 + 1] = Math.sin(angle) * radius * Math.random() - 0.3; // Slightly below center
      positions[i * 3 + 2] = z;

      sizes[i] = 0.1 + Math.random() * 0.15;

      // Random drift velocities
      this.particleVelocities[i * 3] = (Math.random() - 0.5) * 0.02;
      this.particleVelocities[i * 3 + 1] = (Math.random() - 0.5) * 0.015;
      this.particleVelocities[i * 3 + 2] = (Math.random() - 0.5) * 0.01;
    }

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geometry.setAttribute('size', new THREE.BufferAttribute(sizes, 1));

    // Create particle material
    const material = new THREE.PointsMaterial({
      color: color,
      size: 0.15,
      transparent: true,
      opacity: 0.4,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      sizeAttenuation: true,
    });

    this.fogParticles = new THREE.Points(geometry, material);
    this.fogParticles.position.set(0, 1.6, 0.2);
    this.mesh.add(this.fogParticles);
  }

  /**
   * Remove fog particles
   */
  private removeFogParticles(): void {
    if (this.fogParticles) {
      this.mesh.remove(this.fogParticles);
      this.fogParticles.geometry.dispose();
      (this.fogParticles.material as THREE.Material).dispose();
      this.fogParticles = null;
      this.particleVelocities = null;
    }
  }

  /**
   * Update fog particles animation (call each frame)
   */
  updateFogParticles(deltaTime: number): void {
    if (!this.fogParticles || !this.particleVelocities) return;

    const positions = this.fogParticles.geometry.attributes.position as THREE.BufferAttribute;
    const count = positions.count;

    for (let i = 0; i < count; i++) {
      // Update position with velocity
      positions.array[i * 3] += this.particleVelocities[i * 3] * deltaTime * 60;
      positions.array[i * 3 + 1] += this.particleVelocities[i * 3 + 1] * deltaTime * 60;
      positions.array[i * 3 + 2] += this.particleVelocities[i * 3 + 2] * deltaTime * 60;

      // Get current position
      const x = positions.array[i * 3];
      const y = positions.array[i * 3 + 1];
      const z = positions.array[i * 3 + 2];

      // Reset if particle drifts too far
      const distance = Math.sqrt(x * x + y * y);
      const maxRadius = z * 0.4;

      if (distance > maxRadius || z < 0.3 || z > 15) {
        // Reset to random position in cone
        const t = Math.random();
        const newZ = t * 10 + 0.5;
        const radius = t * 3 * Math.random();
        const angle = Math.random() * Math.PI * 2;

        positions.array[i * 3] = Math.cos(angle) * radius;
        positions.array[i * 3 + 1] = Math.sin(angle) * radius - 0.3;
        positions.array[i * 3 + 2] = newZ;
      }
    }

    positions.needsUpdate = true;
  }

  /**
   * Update player light configuration (when switching themes in night mode)
   */
  updateLightConfig(config: { color: number; intensity: number; distance: number }): void {
    if (this.playerLight) {
      this.playerLight.color.setHex(config.color);
      this.playerLight.intensity = config.intensity * 0.4;
      this.playerLight.distance = config.distance * 0.5;
    }
    if (this.playerSpotlight) {
      this.playerSpotlight.color.setHex(config.color);
      this.playerSpotlight.intensity = config.intensity;
      this.playerSpotlight.distance = config.distance;
    }
  }

  /**
   * Check if player light is enabled
   */
  isLightEnabled(): boolean {
    return this.playerLight !== null;
  }
}
