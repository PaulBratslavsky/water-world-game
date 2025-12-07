import * as THREE from "three";

export interface GridConfig {
  size: number;
  cellSize: number;
  gridColor: number;
  lightColor: number;
  darkColor: number;
}

export class Grid {
  private group: THREE.Group;
  private config: GridConfig;
  private tileGroups: THREE.Group[] = [];

  constructor(config: Partial<GridConfig> = {}) {
    this.config = {
      size: 100,
      cellSize: 1,
      gridColor: 0x333333,
      lightColor: 0x2a2a3e,
      darkColor: 0x1a1a2e,
      ...config,
    };

    this.group = new THREE.Group();
    this.createInfiniteGrid();
  }

  private createInfiniteGrid(): void {
    // Create a 3x3 grid of tile groups for seamless wrapping
    // This ensures you never see edges - there's always grid in all directions
    for (let offsetX = -1; offsetX <= 1; offsetX++) {
      for (let offsetZ = -1; offsetZ <= 1; offsetZ++) {
        const tileGroup = this.createTileGroup(offsetX, offsetZ);
        this.tileGroups.push(tileGroup);
        this.group.add(tileGroup);
      }
    }
  }

  private createTileGroup(offsetX: number, offsetZ: number): THREE.Group {
    const { size, cellSize } = this.config;
    const totalSize = size * cellSize;

    const tileGroup = new THREE.Group();
    tileGroup.position.set(offsetX * totalSize, 0, offsetZ * totalSize);

    const ground = this.createGround();
    const gridLines = this.createGridLines();

    tileGroup.add(ground);
    tileGroup.add(gridLines);

    return tileGroup;
  }

  private createGround(): THREE.Mesh {
    const { size, cellSize, lightColor, darkColor } = this.config;
    const totalSize = size * cellSize;

    // Create checkered texture programmatically
    const canvas = document.createElement("canvas");
    const textureSize = 512;
    canvas.width = textureSize;
    canvas.height = textureSize;
    const ctx = canvas.getContext("2d")!;

    const cellsPerTexture = 8; // 8x8 cells per texture tile
    const cellPixelSize = textureSize / cellsPerTexture;

    const lightColorStr = `#${lightColor.toString(16).padStart(6, "0")}`;
    const darkColorStr = `#${darkColor.toString(16).padStart(6, "0")}`;

    for (let x = 0; x < cellsPerTexture; x++) {
      for (let y = 0; y < cellsPerTexture; y++) {
        ctx.fillStyle = (x + y) % 2 === 0 ? lightColorStr : darkColorStr;
        ctx.fillRect(x * cellPixelSize, y * cellPixelSize, cellPixelSize, cellPixelSize);
      }
    }

    const texture = new THREE.CanvasTexture(canvas);
    texture.wrapS = THREE.RepeatWrapping;
    texture.wrapT = THREE.RepeatWrapping;
    texture.repeat.set(size / cellsPerTexture, size / cellsPerTexture);

    const geometry = new THREE.PlaneGeometry(totalSize, totalSize);
    const material = new THREE.MeshStandardMaterial({
      map: texture,
      side: THREE.DoubleSide,
    });

    const ground = new THREE.Mesh(geometry, material);
    ground.rotation.x = -Math.PI / 2;
    ground.position.set(totalSize / 2, 0, totalSize / 2);

    return ground;
  }

  private createGridLines(): THREE.LineSegments {
    const { size, cellSize, gridColor } = this.config;
    const totalSize = size * cellSize;

    const points: THREE.Vector3[] = [];

    // Vertical lines (along Z axis)
    for (let i = 0; i <= size; i++) {
      const x = i * cellSize;
      points.push(new THREE.Vector3(x, 0.01, 0));
      points.push(new THREE.Vector3(x, 0.01, totalSize));
    }

    // Horizontal lines (along X axis)
    for (let i = 0; i <= size; i++) {
      const z = i * cellSize;
      points.push(new THREE.Vector3(0, 0.01, z));
      points.push(new THREE.Vector3(totalSize, 0.01, z));
    }

    const geometry = new THREE.BufferGeometry().setFromPoints(points);
    const material = new THREE.LineBasicMaterial({ color: gridColor });

    return new THREE.LineSegments(geometry, material);
  }

  // Update grid position based on camera to maintain infinite illusion
  updateForCamera(cameraX: number, cameraZ: number): void {
    const { size, cellSize } = this.config;
    const totalSize = size * cellSize;

    // Calculate which "tile" the camera is currently over
    const tileX = Math.floor(cameraX / totalSize);
    const tileZ = Math.floor(cameraZ / totalSize);

    // Reposition the 3x3 grid of tiles to always surround the camera
    let index = 0;
    for (let offsetX = -1; offsetX <= 1; offsetX++) {
      for (let offsetZ = -1; offsetZ <= 1; offsetZ++) {
        this.tileGroups[index].position.set(
          (tileX + offsetX) * totalSize,
          0,
          (tileZ + offsetZ) * totalSize
        );
        index++;
      }
    }
  }

  getGroup(): THREE.Group {
    return this.group;
  }

  getConfig(): GridConfig {
    return this.config;
  }

  // Convert world position to grid coordinates (with wrapping)
  worldToGrid(worldX: number, worldZ: number): { x: number; z: number } {
    const { size, cellSize } = this.config;

    let gridX = Math.floor(worldX / cellSize);
    let gridZ = Math.floor(worldZ / cellSize);

    // Wrap-around logic
    gridX = ((gridX % size) + size) % size;
    gridZ = ((gridZ % size) + size) % size;

    return { x: gridX, z: gridZ };
  }

  // Convert grid coordinates to world position (center of cell)
  gridToWorld(gridX: number, gridZ: number): { x: number; z: number } {
    const { cellSize } = this.config;

    return {
      x: gridX * cellSize + cellSize / 2,
      z: gridZ * cellSize + cellSize / 2,
    };
  }

  // Check if grid coordinates are valid
  isValidCell(gridX: number, gridZ: number): boolean {
    const { size } = this.config;
    return gridX >= 0 && gridX < size && gridZ >= 0 && gridZ < size;
  }
}
