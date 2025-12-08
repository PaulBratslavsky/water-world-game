import * as THREE from "three";

/**
 * Convert world coordinates to grid cell coordinates
 */
export function worldToGrid(
  worldX: number,
  worldZ: number,
  cellSize: number
): { gridX: number; gridZ: number } {
  return {
    gridX: Math.floor(worldX / cellSize),
    gridZ: Math.floor(worldZ / cellSize),
  };
}

/**
 * Dispose all geometry and materials in a THREE.Group
 * Handles both single materials and material arrays
 */
export function disposeGroup(group: THREE.Group): void {
  group.traverse((child) => {
    if (child instanceof THREE.Mesh || child instanceof THREE.LineSegments) {
      child.geometry.dispose();
      if (Array.isArray(child.material)) {
        child.material.forEach((m) => m.dispose());
      } else if (child.material instanceof THREE.Material) {
        child.material.dispose();
      }
    }
  });
}

/**
 * Rotate a block position by 90-degree increments
 * @param x - Original X offset
 * @param z - Original Z offset
 * @param rotation - Rotation step (0-3, representing 0°, 90°, 180°, 270° clockwise)
 * @returns Rotated position
 */
export function rotateBlockPosition(
  x: number,
  z: number,
  rotation: number
): { x: number; z: number } {
  switch (rotation % 4) {
    case 0:
      return { x, z }; // 0°
    case 1:
      return { x: -z, z: x }; // 90° clockwise
    case 2:
      return { x: -x, z: -z }; // 180°
    case 3:
      return { x: z, z: -x }; // 270° clockwise
    default:
      return { x, z };
  }
}
