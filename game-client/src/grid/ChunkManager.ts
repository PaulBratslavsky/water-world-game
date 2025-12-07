import * as THREE from "three";
import { emitEvent } from "../core/EventBus";

/**
 * ChunkManager - Manages dynamic world chunk generation
 *
 * Generates new chunks as the player explores, creating an
 * infinitely expanding world based on exploration.
 */

export interface ChunkConfig {
  chunkSize: number; // Number of cells per chunk (e.g., 16x16)
  cellSize: number; // Size of each cell in world units
  renderDistance: number; // How many chunks around player to keep loaded
  lightColor: number;
  darkColor: number;
  gridColor: number;
}

export interface Chunk {
  x: number; // Chunk coordinate (not world coordinate)
  z: number;
  group: THREE.Group;
  generated: boolean;
}

const DEFAULT_CONFIG: ChunkConfig = {
  chunkSize: 16,
  cellSize: 1,
  renderDistance: 3,
  lightColor: 0x2a2a3e,
  darkColor: 0x1a1a2e,
  gridColor: 0x333333,
};

export class ChunkManager {
  private config: ChunkConfig;
  private chunks: Map<string, Chunk> = new Map();
  private parentGroup: THREE.Group;
  private sharedTexture: THREE.CanvasTexture | null = null;

  // Cached shared resources for performance
  private sharedGridMaterial: THREE.LineBasicMaterial | null = null;
  private sharedGridGeometry: THREE.BufferGeometry | null = null;
  private sharedGroundGeometry: THREE.PlaneGeometry | null = null;

  constructor(config: Partial<ChunkConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.parentGroup = new THREE.Group();
    this.createSharedTexture();
    this.createSharedResources();
  }

  /**
   * Create shared resources that can be reused across all chunks
   */
  private createSharedResources(): void {
    const { chunkSize, cellSize, gridColor } = this.config;
    const chunkWorldSize = chunkSize * cellSize;

    // Shared grid material
    this.sharedGridMaterial = new THREE.LineBasicMaterial({ color: gridColor });

    // Shared grid geometry (same for every chunk)
    const points: THREE.Vector3[] = [];

    // Vertical lines (along Z axis)
    for (let i = 0; i <= chunkSize; i++) {
      const x = i * cellSize;
      points.push(new THREE.Vector3(x, 0.01, 0));
      points.push(new THREE.Vector3(x, 0.01, chunkWorldSize));
    }

    // Horizontal lines (along X axis)
    for (let i = 0; i <= chunkSize; i++) {
      const z = i * cellSize;
      points.push(new THREE.Vector3(0, 0.01, z));
      points.push(new THREE.Vector3(chunkWorldSize, 0.01, z));
    }

    this.sharedGridGeometry = new THREE.BufferGeometry().setFromPoints(points);

    // Shared ground geometry
    this.sharedGroundGeometry = new THREE.PlaneGeometry(chunkWorldSize, chunkWorldSize);
  }

  private chunkKey(chunkX: number, chunkZ: number): string {
    return `${chunkX},${chunkZ}`;
  }

  private createSharedTexture(): void {
    const { lightColor, darkColor } = this.config;

    const canvas = document.createElement("canvas");
    const textureSize = 512;
    canvas.width = textureSize;
    canvas.height = textureSize;
    const ctx = canvas.getContext("2d")!;

    const cellsPerTexture = 8;
    const cellPixelSize = textureSize / cellsPerTexture;

    const lightColorStr = `#${lightColor.toString(16).padStart(6, "0")}`;
    const darkColorStr = `#${darkColor.toString(16).padStart(6, "0")}`;

    for (let x = 0; x < cellsPerTexture; x++) {
      for (let y = 0; y < cellsPerTexture; y++) {
        ctx.fillStyle = (x + y) % 2 === 0 ? lightColorStr : darkColorStr;
        ctx.fillRect(
          x * cellPixelSize,
          y * cellPixelSize,
          cellPixelSize,
          cellPixelSize
        );
      }
    }

    this.sharedTexture = new THREE.CanvasTexture(canvas);
    this.sharedTexture.wrapS = THREE.RepeatWrapping;
    this.sharedTexture.wrapT = THREE.RepeatWrapping;
  }

  /**
   * Set render distance (number of chunks around player)
   */
  setRenderDistance(distance: number): void {
    this.config.renderDistance = Math.max(1, Math.min(10, distance));
  }

  /**
   * Get current render distance
   */
  getRenderDistance(): number {
    return this.config.renderDistance;
  }

  /**
   * Show or hide grid lines
   */
  setGridVisible(visible: boolean): void {
    for (const chunk of this.chunks.values()) {
      chunk.group.traverse((child) => {
        if (child instanceof THREE.LineSegments) {
          child.visible = visible;
        }
      });
    }
    this.gridVisible = visible;
  }

  private createTexturedMaterial(chunkX: number, chunkZ: number): THREE.MeshStandardMaterial {
    const { chunkSize } = this.config;

    const texture = this.sharedTexture!.clone();
    texture.needsUpdate = true;
    texture.repeat.set(chunkSize / 8, chunkSize / 8);

    const offsetX = ((chunkX % 2) + 2) % 2;
    const offsetZ = ((chunkZ % 2) + 2) % 2;
    texture.offset.set((offsetX * chunkSize) / 8, (offsetZ * chunkSize) / 8);

    return new THREE.MeshStandardMaterial({
      map: texture,
      side: THREE.DoubleSide,
    });
  }

  private gridVisible: boolean = true;

  /**
   * Update chunks based on player position
   * Generates new chunks and optionally unloads distant ones
   */
  updateForPosition(worldX: number, worldZ: number): void {
    const { chunkSize, cellSize, renderDistance } = this.config;
    const chunkWorldSize = chunkSize * cellSize;

    // Determine which chunk the player is in
    const playerChunkX = Math.floor(worldX / chunkWorldSize);
    const playerChunkZ = Math.floor(worldZ / chunkWorldSize);

    // Generate chunks within render distance
    for (let dx = -renderDistance; dx <= renderDistance; dx++) {
      for (let dz = -renderDistance; dz <= renderDistance; dz++) {
        const chunkX = playerChunkX + dx;
        const chunkZ = playerChunkZ + dz;
        const key = this.chunkKey(chunkX, chunkZ);

        if (!this.chunks.has(key)) {
          this.generateChunk(chunkX, chunkZ);
        }
      }
    }

    // Optionally unload very distant chunks to save memory
    // (keeping them for now since structures may be placed there)
  }

  private generateChunk(chunkX: number, chunkZ: number): Chunk {
    const { chunkSize, cellSize } = this.config;
    const chunkWorldSize = chunkSize * cellSize;

    const group = new THREE.Group();
    group.position.set(chunkX * chunkWorldSize, 0, chunkZ * chunkWorldSize);

    // Create ground
    const ground = this.createChunkGround(chunkX, chunkZ);
    group.add(ground);

    // Create grid lines (using shared geometry and material)
    const gridLines = this.createChunkGridLines();
    gridLines.visible = this.gridVisible;
    group.add(gridLines);

    const chunk: Chunk = {
      x: chunkX,
      z: chunkZ,
      group,
      generated: true,
    };

    const key = this.chunkKey(chunkX, chunkZ);
    this.chunks.set(key, chunk);
    this.parentGroup.add(group);

    // Emit event for new chunk generation
    emitEvent("chunk:generated", { chunkX, chunkZ });

    return chunk;
  }

  private createChunkGround(chunkX: number, chunkZ: number): THREE.Mesh {
    const { cellSize, chunkSize } = this.config;
    const chunkWorldSize = chunkSize * cellSize;

    // Always use textured material for ground (keeps checkered pattern)
    const material = this.createTexturedMaterial(chunkX, chunkZ);

    const ground = new THREE.Mesh(this.sharedGroundGeometry!, material);
    ground.rotation.x = -Math.PI / 2;
    ground.position.set(chunkWorldSize / 2, 0, chunkWorldSize / 2);

    return ground;
  }

  private createChunkGridLines(): THREE.LineSegments {
    // Use shared geometry and material for all grid lines
    return new THREE.LineSegments(this.sharedGridGeometry!, this.sharedGridMaterial!);
  }

  /**
   * Check if a chunk exists at the given chunk coordinates
   */
  hasChunk(chunkX: number, chunkZ: number): boolean {
    return this.chunks.has(this.chunkKey(chunkX, chunkZ));
  }

  /**
   * Get chunk at world position
   */
  getChunkAtWorld(worldX: number, worldZ: number): Chunk | undefined {
    const { chunkSize, cellSize } = this.config;
    const chunkWorldSize = chunkSize * cellSize;
    const chunkX = Math.floor(worldX / chunkWorldSize);
    const chunkZ = Math.floor(worldZ / chunkWorldSize);
    return this.chunks.get(this.chunkKey(chunkX, chunkZ));
  }

  /**
   * Convert world coordinates to grid coordinates
   */
  worldToGrid(worldX: number, worldZ: number): { x: number; z: number } {
    const { cellSize } = this.config;
    return {
      x: Math.floor(worldX / cellSize),
      z: Math.floor(worldZ / cellSize),
    };
  }

  /**
   * Convert grid coordinates to world position (center of cell)
   */
  gridToWorld(gridX: number, gridZ: number): { x: number; z: number } {
    const { cellSize } = this.config;
    return {
      x: gridX * cellSize + cellSize / 2,
      z: gridZ * cellSize + cellSize / 2,
    };
  }

  getGroup(): THREE.Group {
    return this.parentGroup;
  }

  getConfig(): ChunkConfig {
    return this.config;
  }

  getCellSize(): number {
    return this.config.cellSize;
  }

  getChunkCount(): number {
    return this.chunks.size;
  }

  /**
   * Get all generated chunk coordinates
   */
  getGeneratedChunks(): Array<{ x: number; z: number }> {
    return Array.from(this.chunks.values()).map((chunk) => ({
      x: chunk.x,
      z: chunk.z,
    }));
  }
}
