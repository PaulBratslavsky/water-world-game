import * as THREE from "three";
import {
  StructureDefinition,
  BlockMaterial,
  rotateStructure,
  cellKey3D,
  getStructure,
} from "./StructureDefinition";
import { PrefabDefinition, getPrefabBlockColor, getPrefabBlockMaterial } from "./PrefabDefinition";
import { emitEvent, onEvent } from "../core/EventBus";
import { stateManager } from "../core/StateManager";
import { DEFAULT_MATERIAL, hexToNumber } from "./BlockData";
import { GreedyMesher, BlockData as MesherBlockData, LODManager } from "../systems/GreedyMesher";

// ============================================
// QUALITY MODE TYPES AND CONFIGURATION
// ============================================

/** Quality level presets */
export type QualityLevel = "low" | "medium" | "high";

/** Render mode determines which mesh system is active */
export type RenderMode = "instanced" | "greedy-full" | "greedy-simple";

/** Configuration for each quality level */
export interface QualityConfig {
  renderMode: RenderMode;
  useGreedyMeshing: boolean;
  useSimpleMaterial: boolean;
  description: string;
}

/** Quality level configurations */
export const QUALITY_CONFIGS: Record<QualityLevel, QualityConfig> = {
  low: {
    renderMode: "greedy-simple",
    useGreedyMeshing: true,
    useSimpleMaterial: true,
    description: "Greedy meshing with flat colors (MeshBasicMaterial)",
  },
  medium: {
    renderMode: "greedy-full",
    useGreedyMeshing: true,
    useSimpleMaterial: false,
    description: "Greedy meshing with full materials",
  },
  high: {
    renderMode: "instanced",
    useGreedyMeshing: false,
    useSimpleMaterial: false,
    description: "Instanced rendering with full materials",
  },
};

/** Debug statistics for the placement system */
export interface PlacementDebugStats {
  currentQualityLevel: QualityLevel;
  currentRenderMode: RenderMode;
  instancedMeshCount: number;
  greedyMeshCount: number;
  materialCacheSize: number;
  blockInstanceCount: number;
  instancedGroupChildren: number;
  greedyGroupChildren: number;
  instancedGroupVisible: boolean;
  greedyGroupVisible: boolean;
}

export interface PlacedStructure {
  id: string;
  definition: StructureDefinition;
  gridX: number;
  gridY: number; // Y level (0 = ground, 1 = first stack, etc.)
  gridZ: number;
  mesh: THREE.Group;
}

// Block data for instanced rendering
interface BlockInstance {
  cellKey: string;  // 3D cell key "x,y,z"
  blockId: string;
  gridX: number;
  gridY: number;
  gridZ: number;
  materialKey: string;  // Key for grouping by material
  color: number;  // Store color for material recreation
  blockMaterial?: BlockMaterial;  // Store material properties for recreation
}

export interface PlacementConfig {
  cellSize: number;
  useInstancing?: boolean;  // Enable instanced rendering (default: true)
  useGreedyMeshing?: boolean;  // Enable greedy meshing for hidden face culling (default: false)
  lodDistances?: { near: number; medium: number; far: number };  // LOD distance thresholds
}

export class PlacementSystem {
  private scene: THREE.Scene;
  private cellSize: number;
  private placedStructures: Map<string, PlacedStructure> = new Map();
  private occupiedCells: Set<string> = new Set(); // Now uses 3D keys (x,y,z)
  private cellBlockIds: Map<string, string> = new Map(); // Maps 3D cell key to blockId
  private heightMap: Map<string, number> = new Map(); // Tracks max height at each x,z

  // Preview state
  private previewMesh: THREE.Group | null = null;
  private currentStructure: StructureDefinition | null = null;
  private previewGridX = 0;
  private previewGridY = 0; // Current Y level for preview (manually controlled)
  private previewGridZ = 0;
  private isValidPlacement = false;
  private currentBuildLevel = 0; // Manually controlled build level with [ and ]

  // Frustum culling
  private frustum: THREE.Frustum = new THREE.Frustum();
  private frustumMatrix: THREE.Matrix4 = new THREE.Matrix4();
  private camera: THREE.Camera | null = null;

  // Performance caches
  private geometryCache: Map<string, THREE.BoxGeometry> = new Map();
  private materialCache: Map<string, THREE.Material> = new Map();

  // ============================================
  // INSTANCED RENDERING
  // ============================================
  private useInstancing: boolean = true;
  private blockInstances: Map<string, BlockInstance> = new Map(); // cellKey -> BlockInstance
  private instancedMeshes: Map<string, THREE.InstancedMesh> = new Map(); // materialKey -> InstancedMesh
  private instancedMeshGroup: THREE.Group = new THREE.Group();
  private instancesDirty: boolean = false;
  private rebuildScheduled: boolean = false;

  // Dim overlay for blocks below build level (performance-friendly approach)
  private dimOverlay: THREE.Mesh | null = null;

  // ============================================
  // GREEDY MESHING (Hidden Face Culling)
  // ============================================
  private useGreedyMeshing: boolean = false;
  private greedyMesher: GreedyMesher;
  private lodManager: LODManager;
  private greedyMeshGroup: THREE.Group = new THREE.Group();
  private greedyMeshes: Map<string, THREE.Mesh> = new Map(); // materialKey -> merged mesh
  private greedyMeshDirty: boolean = false;
  private greedyRebuildScheduled: boolean = false;

  // ============================================
  // QUALITY MODE STATE MACHINE
  // ============================================
  private currentQualityLevel: QualityLevel = "high";
  private currentRenderMode: RenderMode = "instanced";

  constructor(scene: THREE.Scene, config: PlacementConfig) {
    this.scene = scene;
    this.cellSize = config.cellSize;
    this.useInstancing = config.useInstancing !== false; // Default to true
    this.useGreedyMeshing = config.useGreedyMeshing ?? false;
    this.greedyMesher = new GreedyMesher(config.cellSize);
    this.lodManager = new LODManager(config.lodDistances);
    this.setupEventListeners();

    // Add mesh groups to scene - only the active one is visible
    // Both are added so we can toggle between them without add/remove overhead
    this.instancedMeshGroup.visible = false;
    this.greedyMeshGroup.visible = false;
    this.scene.add(this.instancedMeshGroup);
    this.scene.add(this.greedyMeshGroup);

    // Set initial visibility based on mode
    if (this.useGreedyMeshing) {
      this.greedyMeshGroup.visible = true;
    } else if (this.useInstancing) {
      this.instancedMeshGroup.visible = true;
    }
  }

  /**
   * Get or create a cached BoxGeometry
   */
  private getCachedGeometry(width: number, height: number, depth: number): THREE.BoxGeometry {
    const key = `${width.toFixed(3)}_${height.toFixed(3)}_${depth.toFixed(3)}`;
    let geometry = this.geometryCache.get(key);
    if (!geometry) {
      geometry = new THREE.BoxGeometry(width, height, depth);
      this.geometryCache.set(key, geometry);
    }
    return geometry;
  }

  /**
   * Generate a cache key for material properties
   */
  private getMaterialCacheKey(
    color: number,
    blockMaterial?: BlockMaterial,
    isPreview: boolean = false
  ): string {
    const mat = blockMaterial || {};

    // In simple mode, only color matters (no transparency, no material properties)
    if (this.useSimpleMaterial && !isPreview) {
      return "simple_" + color.toString(16);
    }

    return [
      color.toString(16),
      mat.type || "standard",
      mat.roughness ?? 0.7,
      mat.metalness ?? 0,
      mat.emissive || "none",
      mat.emissiveIntensity ?? 1,
      mat.opacity ?? 1,
      mat.transparent ?? false,
      mat.flatShading ?? false,
      mat.wireframe ?? false,
      mat.side || "front",
      isPreview ? "preview" : "solid"
    ].join("_");
  }

  /**
   * Get or create a cached material
   */
  private getCachedMaterial(
    color: number,
    blockMaterial?: BlockMaterial,
    isPreview: boolean = false
  ): THREE.Material {
    const key = this.getMaterialCacheKey(color, blockMaterial, isPreview);
    let material = this.materialCache.get(key);
    if (!material) {
      material = this.createMaterialFromBlock(color, blockMaterial, isPreview);
      this.materialCache.set(key, material);
    }
    return material;
  }

  /**
   * Clear material cache - forces recreation of materials on next use.
   * Call this if material properties need to change globally.
   */
  clearMaterialCache(): void {
    for (const material of this.materialCache.values()) {
      material.dispose();
    }
    this.materialCache.clear();
  }

  /**
   * Set camera for frustum culling
   */
  setCamera(camera: THREE.Camera): void {
    this.camera = camera;
  }

  /**
   * Setup event listeners for render mode changes
   */
  private setupEventListeners(): void {
    onEvent("state:renderModeChanged", ({ renderMode }) => {
      this.updateAllBlocksRenderMode(renderMode === "wireframe");
    });

    onEvent("state:showMaterialsChanged", ({ show }) => {
      this.updateAllBlocksMaterials(show);
    });
  }

  /**
   * Update all placed blocks to wireframe or solid mode
   */
  private updateAllBlocksRenderMode(wireframe: boolean): void {
    if (this.useInstancing) {
      // Update all instanced mesh materials
      for (const instancedMesh of this.instancedMeshes.values()) {
        const material = instancedMesh.material as THREE.Material;
        if ("wireframe" in material) {
          (material as THREE.MeshStandardMaterial).wireframe = wireframe;
        }
      }
      // Also update cached materials so new blocks get the right mode
      for (const material of this.materialCache.values()) {
        if ("wireframe" in material) {
          (material as THREE.MeshStandardMaterial).wireframe = wireframe;
        }
      }
    } else {
      // Non-instanced mode
      for (const structure of this.placedStructures.values()) {
        structure.mesh.traverse((child) => {
          if (child instanceof THREE.Mesh && child.material) {
            const material = child.material as THREE.Material;
            if ("wireframe" in material) {
              (material as THREE.MeshStandardMaterial).wireframe = wireframe;
            }
          }
        });
      }
    }
  }

  /**
   * Update all placed blocks to show/hide material properties
   */
  private updateAllBlocksMaterials(showMaterials: boolean): void {
    if (this.useInstancing) {
      // For instanced rendering, we need to update the cached materials
      // and rebuild if necessary. For simplicity, just update existing materials.
      for (const material of this.materialCache.values()) {
        if (material instanceof THREE.MeshStandardMaterial) {
          if (showMaterials) {
            // Materials already have their properties from creation
            // Just ensure they're applied
            material.needsUpdate = true;
          } else {
            // Reset to basic look
            material.roughness = 0.7;
            material.metalness = 0;
            material.emissive.setHex(0x000000);
            material.emissiveIntensity = 0;
            material.needsUpdate = true;
          }
        }
      }
    } else {
      // Non-instanced mode
      for (const structure of this.placedStructures.values()) {
        structure.mesh.traverse((child) => {
          if (child instanceof THREE.Mesh && child.material) {
            const mat = child.material as THREE.MeshStandardMaterial;
            if (showMaterials) {
              // Restore material properties from block definition
              const blockMaterial = structure.definition.material;
              if (blockMaterial) {
                mat.roughness = blockMaterial.roughness ?? 0.7;
                mat.metalness = blockMaterial.metalness ?? 0;
                if (blockMaterial.emissive) {
                  mat.emissive.setHex(hexToNumber(blockMaterial.emissive));
                  mat.emissiveIntensity = blockMaterial.emissiveIntensity ?? 1;
                }
              }
            } else {
              // Reset to basic material look
              mat.roughness = 0.7;
              mat.metalness = 0;
              mat.emissive.setHex(0x000000);
              mat.emissiveIntensity = 0;
            }
            mat.needsUpdate = true;
          }
        });
      }
    }
  }

  /**
   * Update frustum culling - call this each frame for performance
   */
  updateFrustumCulling(): void {
    if (!this.camera) return;

    // Update frustum from camera
    this.camera.updateMatrixWorld();
    this.frustumMatrix.multiplyMatrices(
      this.camera.projectionMatrix,
      this.camera.matrixWorldInverse
    );
    this.frustum.setFromProjectionMatrix(this.frustumMatrix);

    if (this.useInstancing) {
      // For instanced meshes, Three.js handles frustum culling per-instance automatically
      // when frustumCulled is true (which we set during creation)
      // We just need to ensure the instanced mesh group is visible
      this.instancedMeshGroup.visible = true;
    } else {
      // Non-instanced: check each placed structure against frustum
      for (const structure of this.placedStructures.values()) {
        const isVisible = this.isInFrustum(structure.mesh);
        structure.mesh.visible = isVisible;
      }
    }
  }

  /**
   * Check if a mesh group is within the camera frustum
   */
  private isInFrustum(mesh: THREE.Group): boolean {
    // Create a bounding sphere for the mesh
    const box = new THREE.Box3().setFromObject(mesh);
    const sphere = new THREE.Sphere();
    box.getBoundingSphere(sphere);

    return this.frustum.intersectsSphere(sphere);
  }

  // ============================================
  // INSTANCED MESH RENDERING METHODS
  // ============================================

  /**
   * Add a block to the instanced rendering system
   */
  private addBlockInstance(
    cellKey: string,
    blockId: string,
    gridX: number,
    gridY: number,
    gridZ: number,
    color: number,
    blockMaterial?: BlockMaterial
  ): void {
    const materialKey = this.getMaterialCacheKey(color, blockMaterial, false);

    const instance: BlockInstance = {
      cellKey,
      blockId,
      gridX,
      gridY,
      gridZ,
      materialKey,
      color,
      blockMaterial,
    };

    this.blockInstances.set(cellKey, instance);

    // Ensure material exists in cache
    this.getCachedMaterial(color, blockMaterial, false);

    this.markInstancesDirty();
  }

  /**
   * Remove a block from the instanced rendering system
   */
  private removeBlockInstance(cellKey: string): void {
    if (this.blockInstances.delete(cellKey)) {
      this.markInstancesDirty();
    }
  }

  /**
   * Mark instances as dirty, scheduling a rebuild
   */
  private markInstancesDirty(): void {
    this.instancesDirty = true;

    // Also mark greedy mesh as dirty if using greedy meshing
    if (this.useGreedyMeshing) {
      this.markGreedyMeshDirty();
      return;
    }

    // Schedule rebuild on next frame to batch multiple changes
    if (!this.rebuildScheduled) {
      this.rebuildScheduled = true;
      requestAnimationFrame(() => {
        this.rebuildScheduled = false;
        if (this.instancesDirty) {
          this.rebuildInstancedMeshes();
          this.instancesDirty = false;
        }
      });
    }
  }

  /**
   * Rebuild all instanced meshes from block instances
   * Groups blocks by material and creates one InstancedMesh per group
   */
  private rebuildInstancedMeshes(): void {
    // Clear existing instanced meshes
    for (const mesh of this.instancedMeshes.values()) {
      this.instancedMeshGroup.remove(mesh);
      mesh.geometry.dispose();
      // Don't dispose material - it's cached
    }
    this.instancedMeshes.clear();

    // Group blocks by material key
    const groups = new Map<string, BlockInstance[]>();
    for (const instance of this.blockInstances.values()) {
      const group = groups.get(instance.materialKey) || [];
      group.push(instance);
      groups.set(instance.materialKey, group);
    }

    // Create one InstancedMesh per material group
    const geometry = this.getCachedGeometry(
      this.cellSize * 0.95,
      1,
      this.cellSize * 0.95
    );

    const matrix = new THREE.Matrix4();

    for (const [materialKey, instances] of groups) {
      // Get or create material
      let material = this.materialCache.get(materialKey);
      if (!material) {
        // Create material using first instance's data
        const firstInstance = instances[0];
        material = this.getCachedMaterial(firstInstance.color, firstInstance.blockMaterial, false);
      }
      if (!material) continue;

      // Create instanced mesh
      const instancedMesh = new THREE.InstancedMesh(
        geometry,
        material,
        instances.length
      );

      // Set transform for each instance
      for (let i = 0; i < instances.length; i++) {
        const inst = instances[i];
        matrix.setPosition(
          inst.gridX * this.cellSize + this.cellSize / 2,
          inst.gridY + 0.5,
          inst.gridZ * this.cellSize + this.cellSize / 2
        );
        instancedMesh.setMatrixAt(i, matrix);
      }

      instancedMesh.instanceMatrix.needsUpdate = true;
      instancedMesh.frustumCulled = true;

      this.instancedMeshes.set(materialKey, instancedMesh);
      this.instancedMeshGroup.add(instancedMesh);
    }
  }

  /**
   * Force immediate rebuild of instanced meshes (useful after bulk operations)
   */
  rebuildInstancedMeshesNow(): void {
    if (this.useInstancing) {
      this.rebuildInstancedMeshes();
      this.instancesDirty = false;
    }
  }

  /**
   * Get instancing statistics for debugging
   */
  getInstancingStats(): { totalBlocks: number; materialGroups: number; drawCalls: number } {
    return {
      totalBlocks: this.blockInstances.size,
      materialGroups: this.instancedMeshes.size,
      drawCalls: this.instancedMeshes.size, // One draw call per instanced mesh
    };
  }

  // ============================================
  // GREEDY MESHING METHODS (Hidden Face Culling)
  // ============================================

  /**
   * Enable or disable greedy meshing at runtime
   */
  setGreedyMeshing(enabled: boolean): void {
    if (this.useGreedyMeshing === enabled) return;

    this.useGreedyMeshing = enabled;

    if (enabled) {
      // Switch from instancing to greedy meshing
      this.instancedMeshGroup.visible = false;
      this.greedyMeshGroup.visible = true;
      this.rebuildGreedyMeshesNow();
    } else {
      // Switch from greedy meshing to instancing
      this.greedyMeshGroup.visible = false;
      this.clearGreedyMeshes();
      this.instancedMeshGroup.visible = true;
      this.rebuildInstancedMeshesNow();
    }
  }

  /**
   * Check if greedy meshing is enabled
   */
  isGreedyMeshingEnabled(): boolean {
    return this.useGreedyMeshing;
  }

  private useSimpleMaterial: boolean = false;

  /**
   * Switch to simple materials (just color, no roughness/metalness/emissive)
   * This simplifies rendering for low quality mode
   */
  setSimpleMaterial(useSimple: boolean): void {
    if (this.useSimpleMaterial === useSimple) return;

    this.useSimpleMaterial = useSimple;

    // Update materialKey for all block instances to use new cache key format
    for (const instance of this.blockInstances.values()) {
      instance.materialKey = this.getMaterialCacheKey(instance.color, instance.blockMaterial, false);
    }

    // Clear material cache to force recreation with new material type
    this.clearMaterialCache();

    // Rebuild meshes - new materials will be created with new keys
    if (this.useGreedyMeshing) {
      this.rebuildGreedyMeshesNow();
    } else {
      this.rebuildInstancedMeshesNow();
    }
  }

  /**
   * Check if simple materials are enabled
   */
  isSimpleMaterialEnabled(): boolean {
    return this.useSimpleMaterial;
  }

  /**
   * Get the current quality level
   */
  getQualityLevel(): QualityLevel {
    return this.currentQualityLevel;
  }

  /**
   * Get the current render mode
   */
  getRenderMode(): RenderMode {
    return this.currentRenderMode;
  }

  /**
   * Set quality level using a preset.
   * This is the recommended way to change quality settings.
   */
  setQualityLevel(level: QualityLevel): void {
    if (this.currentQualityLevel === level) {
      return;
    }

    const config = QUALITY_CONFIGS[level];
    const previousMode = this.currentRenderMode;

    // Update state
    this.currentQualityLevel = level;
    this.currentRenderMode = config.renderMode;

    // Transition from old mode to new mode
    this.transitionRenderMode(previousMode, config.renderMode, config);
  }

  /**
   * Transition between render modes with proper cleanup.
   * Implements the state machine pattern for render mode changes.
   */
  private transitionRenderMode(
    fromMode: RenderMode,
    toMode: RenderMode,
    config: QualityConfig
  ): void {
    // Cancel any pending rebuilds
    this.greedyMeshDirty = false;
    this.instancesDirty = false;

    // Exit the old mode (cleanup)
    this.exitRenderMode(fromMode);

    // Update internal flags
    this.useGreedyMeshing = config.useGreedyMeshing;

    // Handle simple material change
    if (this.useSimpleMaterial !== config.useSimpleMaterial) {
      this.useSimpleMaterial = config.useSimpleMaterial;

      // Update materialKey for all block instances
      for (const instance of this.blockInstances.values()) {
        instance.materialKey = this.getMaterialCacheKey(instance.color, instance.blockMaterial, false);
      }

      // Clear material cache to force new materials
      this.clearMaterialCache();
    }

    // Enter the new mode (setup and rebuild)
    this.enterRenderMode(toMode);
  }

  /**
   * Exit a render mode - performs complete cleanup
   */
  private exitRenderMode(mode: RenderMode): void {
    switch (mode) {
      case "instanced":
        this.instancedMeshGroup.visible = false;
        this.clearInstancedMeshes();
        break;
      case "greedy-full":
      case "greedy-simple":
        this.greedyMeshGroup.visible = false;
        this.clearGreedyMeshes();
        break;
    }
  }

  /**
   * Enter a render mode - sets visibility and triggers rebuild
   */
  private enterRenderMode(mode: RenderMode): void {
    switch (mode) {
      case "instanced":
        this.instancedMeshGroup.visible = true;
        this.rebuildInstancedMeshesNow();
        break;
      case "greedy-full":
      case "greedy-simple":
        this.greedyMeshGroup.visible = true;
        this.rebuildGreedyMeshesNow();
        break;
    }
  }

  /**
   * Legacy method for backwards compatibility.
   * Prefer using setQualityLevel() instead.
   * @deprecated Use setQualityLevel() instead
   */
  setQualityMode(useGreedy: boolean, useSimple: boolean): void {
    // Map to quality level
    let level: QualityLevel;
    if (useGreedy && useSimple) {
      level = "low";
    } else if (useGreedy && !useSimple) {
      level = "medium";
    } else {
      level = "high";
    }
    this.setQualityLevel(level);
  }

  /**
   * Mark greedy meshes as needing rebuild
   */
  private markGreedyMeshDirty(): void {
    this.greedyMeshDirty = true;

    if (!this.greedyRebuildScheduled) {
      this.greedyRebuildScheduled = true;
      requestAnimationFrame(() => {
        this.greedyRebuildScheduled = false;
        if (this.greedyMeshDirty) {
          this.rebuildGreedyMeshes();
          this.greedyMeshDirty = false;
        }
      });
    }
  }

  /**
   * Convert block instances to format needed by greedy mesher
   */
  private getBlocksForMesher(): MesherBlockData[] {
    const blocks: MesherBlockData[] = [];
    for (const instance of this.blockInstances.values()) {
      blocks.push({
        x: instance.gridX,
        y: instance.gridY,
        z: instance.gridZ,
        materialKey: instance.materialKey,
      });
    }
    return blocks;
  }

  /**
   * Rebuild all greedy meshes using hidden face culling
   */
  private rebuildGreedyMeshes(): void {
    // Clear existing greedy meshes
    this.clearGreedyMeshes();

    // Get blocks in mesher format
    const blocks = this.getBlocksForMesher();
    if (blocks.length === 0) return;

    // Build optimized geometry with hidden face culling
    const meshedGeometries = this.greedyMesher.buildMesh(blocks);

    // Build a map of materialKey -> block instance for material creation
    const keyToInstance = new Map<string, BlockInstance>();
    for (const instance of this.blockInstances.values()) {
      keyToInstance.set(instance.materialKey, instance);
    }

    // Create meshes for each material group
    for (const { geometry, materialKey } of meshedGeometries) {
      let material = this.materialCache.get(materialKey);

      // Create material if not in cache
      if (!material) {
        const instance = keyToInstance.get(materialKey);
        if (instance) {
          material = this.getCachedMaterial(instance.color, instance.blockMaterial, false);
        } else {
          // Fallback: extract color from simple key format "simple_<hexcolor>"
          if (materialKey.startsWith("simple_")) {
            const hexColor = parseInt(materialKey.substring(7), 16);
            material = this.getCachedMaterial(hexColor, undefined, false);
          }
        }
      }
      if (!material) continue;

      const mesh = new THREE.Mesh(geometry, material);
      mesh.frustumCulled = true;

      this.greedyMeshes.set(materialKey, mesh);
      this.greedyMeshGroup.add(mesh);
    }
  }

  /**
   * Force immediate rebuild of greedy meshes
   */
  rebuildGreedyMeshesNow(): void {
    if (this.useGreedyMeshing) {
      this.rebuildGreedyMeshes();
      this.greedyMeshDirty = false;
    }
  }

  /**
   * Clear all greedy meshes
   */
  private clearGreedyMeshes(): void {
    // Clear meshes from the Map
    for (const mesh of this.greedyMeshes.values()) {
      mesh.geometry.dispose();
    }
    this.greedyMeshes.clear();

    // Also clear ALL children from the group (in case any weren't in the Map)
    while (this.greedyMeshGroup.children.length > 0) {
      const child = this.greedyMeshGroup.children[0];
      this.greedyMeshGroup.remove(child);
    }
  }

  /**
   * Clear all instanced meshes
   */
  private clearInstancedMeshes(): void {
    for (const mesh of this.instancedMeshes.values()) {
      this.instancedMeshGroup.remove(mesh);
      mesh.geometry.dispose();
    }
    this.instancedMeshes.clear();

    // Also clear ALL children from the group
    while (this.instancedMeshGroup.children.length > 0) {
      const child = this.instancedMeshGroup.children[0];
      this.instancedMeshGroup.remove(child);
    }
  }

  /**
   * Update LOD for greedy meshes based on camera position
   */
  updateGreedyMeshLOD(): void {
    if (!this.useGreedyMeshing || !this.camera) return;

    const cameraPos = this.camera.position;

    for (const mesh of this.greedyMeshes.values()) {
      // Calculate distance to mesh center
      const boundingBox = new THREE.Box3().setFromObject(mesh);
      const center = new THREE.Vector3();
      boundingBox.getCenter(center);

      const distance = cameraPos.distanceTo(center);
      const lodLevel = this.lodManager.getLODLevel(distance);

      // Apply LOD visibility
      mesh.visible = lodLevel !== "culled";
    }
  }

  /**
   * Get greedy meshing statistics for debugging
   */
  getGreedyMeshingStats(): {
    enabled: boolean;
    totalBlocks: number;
    meshCount: number;
    culledFaces: number;
    cullPercentage: number;
    estimatedTriangles: number;
  } {
    if (!this.useGreedyMeshing) {
      return {
        enabled: false,
        totalBlocks: this.blockInstances.size,
        meshCount: 0,
        culledFaces: 0,
        cullPercentage: 0,
        estimatedTriangles: this.blockInstances.size * 12, // 6 faces * 2 triangles each
      };
    }

    const blocks = this.getBlocksForMesher();
    const stats = this.greedyMesher.getStats(blocks);

    // Count actual triangles in greedy meshes
    let totalTriangles = 0;
    for (const mesh of this.greedyMeshes.values()) {
      const posAttr = mesh.geometry.getAttribute("position");
      if (posAttr) {
        totalTriangles += posAttr.count / 3;
      }
    }

    return {
      enabled: true,
      totalBlocks: stats.totalBlocks,
      meshCount: this.greedyMeshes.size,
      culledFaces: stats.culledFaces,
      cullPercentage: stats.cullPercentage,
      estimatedTriangles: totalTriangles,
    };
  }

  /**
   * Get combined rendering statistics
   */
  getRenderingStats(): {
    totalBlocks: number;
    renderMode: "instancing" | "greedy" | "individual";
    drawCalls: number;
    estimatedTriangles: number;
    culledFaces?: number;
    cullPercentage?: number;
  } {
    const totalBlocks = this.blockInstances.size;

    if (this.useGreedyMeshing) {
      const greedyStats = this.getGreedyMeshingStats();
      return {
        totalBlocks,
        renderMode: "greedy",
        drawCalls: greedyStats.meshCount,
        estimatedTriangles: greedyStats.estimatedTriangles,
        culledFaces: greedyStats.culledFaces,
        cullPercentage: greedyStats.cullPercentage,
      };
    } else if (this.useInstancing) {
      return {
        totalBlocks,
        renderMode: "instancing",
        drawCalls: this.instancedMeshes.size,
        estimatedTriangles: totalBlocks * 12, // 6 faces * 2 triangles each
      };
    } else {
      return {
        totalBlocks,
        renderMode: "individual",
        drawCalls: totalBlocks,
        estimatedTriangles: totalBlocks * 12,
      };
    }
  }

  /**
   * Get detailed debug statistics for the placement system.
   * Useful for debugging quality mode transitions and mesh management.
   */
  getDebugStats(): PlacementDebugStats {
    return {
      currentQualityLevel: this.currentQualityLevel,
      currentRenderMode: this.currentRenderMode,
      instancedMeshCount: this.instancedMeshes.size,
      greedyMeshCount: this.greedyMeshes.size,
      materialCacheSize: this.materialCache.size,
      blockInstanceCount: this.blockInstances.size,
      instancedGroupChildren: this.instancedMeshGroup.children.length,
      greedyGroupChildren: this.greedyMeshGroup.children.length,
      instancedGroupVisible: this.instancedMeshGroup.visible,
      greedyGroupVisible: this.greedyMeshGroup.visible,
    };
  }

  /**
   * Set blocks below the specified level to wireframe mode.
   * Blocks at or above the level render normally (solid).
   * Pass null to restore all blocks to solid.
   *
   * Performance: Creates separate instanced meshes for wireframe vs solid,
   * only rebuilds when entering/exiting build mode (not on level change).
   */
  setGrayscaleBelowLevel(level: number | null): void {
    const previousLevel = this.dimOverlay?.userData?.level as number | null | undefined;
    const wasActive = previousLevel !== null && previousLevel !== undefined;
    const willBeActive = level !== null;

    // Track level in a dummy object
    if (!this.dimOverlay) {
      this.dimOverlay = new THREE.Mesh();
      this.dimOverlay.visible = false;
    }
    this.dimOverlay.userData.level = level;

    // Only rebuild when entering or exiting wireframe mode
    if (wasActive !== willBeActive) {
      this.rebuildWithWireframeSupport(level);
    } else if (willBeActive && previousLevel !== level) {
      // Level changed - update which meshes are visible
      this.updateWireframeVisibility(level);
    }
  }

  /**
   * Rebuild instanced meshes with separate solid/wireframe versions
   */
  private rebuildWithWireframeSupport(wireframeBelowLevel: number | null): void {
    // Clear existing instanced meshes
    for (const mesh of this.instancedMeshes.values()) {
      this.instancedMeshGroup.remove(mesh);
      mesh.geometry.dispose();
    }
    this.instancedMeshes.clear();

    if (wireframeBelowLevel === null) {
      // Normal mode - just rebuild standard meshes
      this.rebuildInstancedMeshes();
      return;
    }

    // Build mode - create two sets of meshes per material: solid (at/above level) and wireframe (below)
    const geometry = this.getCachedGeometry(
      this.cellSize * 0.95,
      1,
      this.cellSize * 0.95
    );

    // Group blocks by material AND by whether they're above/below the level
    const solidGroups = new Map<string, BlockInstance[]>();
    const wireframeGroups = new Map<string, BlockInstance[]>();

    for (const instance of this.blockInstances.values()) {
      if (instance.gridY >= wireframeBelowLevel) {
        const group = solidGroups.get(instance.materialKey) || [];
        group.push(instance);
        solidGroups.set(instance.materialKey, group);
      } else {
        const group = wireframeGroups.get(instance.materialKey) || [];
        group.push(instance);
        wireframeGroups.set(instance.materialKey, group);
      }
    }

    const matrix = new THREE.Matrix4();

    // Create solid meshes
    for (const [materialKey, instances] of solidGroups) {
      const material = this.materialCache.get(materialKey);
      if (!material) continue;

      const instancedMesh = new THREE.InstancedMesh(geometry, material, instances.length);

      for (let i = 0; i < instances.length; i++) {
        const inst = instances[i];
        matrix.setPosition(
          inst.gridX * this.cellSize + this.cellSize / 2,
          inst.gridY + 0.5,
          inst.gridZ * this.cellSize + this.cellSize / 2
        );
        instancedMesh.setMatrixAt(i, matrix);
      }

      instancedMesh.instanceMatrix.needsUpdate = true;
      instancedMesh.frustumCulled = true;
      instancedMesh.userData.isSolid = true;
      instancedMesh.userData.level = wireframeBelowLevel;

      this.instancedMeshes.set(materialKey + "_solid", instancedMesh);
      this.instancedMeshGroup.add(instancedMesh);
    }

    // Create wireframe meshes
    for (const [materialKey, instances] of wireframeGroups) {
      const wireframeMaterial = this.getWireframeMaterial(materialKey);

      const instancedMesh = new THREE.InstancedMesh(geometry, wireframeMaterial, instances.length);

      for (let i = 0; i < instances.length; i++) {
        const inst = instances[i];
        matrix.setPosition(
          inst.gridX * this.cellSize + this.cellSize / 2,
          inst.gridY + 0.5,
          inst.gridZ * this.cellSize + this.cellSize / 2
        );
        instancedMesh.setMatrixAt(i, matrix);
      }

      instancedMesh.instanceMatrix.needsUpdate = true;
      instancedMesh.frustumCulled = true;
      instancedMesh.userData.isSolid = false;
      instancedMesh.userData.level = wireframeBelowLevel;

      this.instancedMeshes.set(materialKey + "_wireframe", instancedMesh);
      this.instancedMeshGroup.add(instancedMesh);
    }
  }

  /**
   * Update wireframe visibility when level changes (without full rebuild)
   */
  private updateWireframeVisibility(newLevel: number): void {
    // Need to rebuild since blocks move between solid/wireframe groups
    this.rebuildWithWireframeSupport(newLevel);
  }

  /**
   * Get or create a wireframe version of a material
   */
  private getWireframeMaterial(originalMaterialKey: string): THREE.Material {
    const wireframeKey = originalMaterialKey + "_wireframe";

    let material = this.materialCache.get(wireframeKey);
    if (!material) {
      const originalMaterial = this.materialCache.get(originalMaterialKey);
      if (originalMaterial && originalMaterial instanceof THREE.MeshStandardMaterial) {
        material = new THREE.MeshBasicMaterial({
          color: originalMaterial.color,
          wireframe: true,
          transparent: true,
          opacity: 0.4,
        });
      } else {
        material = new THREE.MeshBasicMaterial({
          color: 0x888888,
          wireframe: true,
          transparent: true,
          opacity: 0.4,
        });
      }
      this.materialCache.set(wireframeKey, material);
    }
    return material;
  }

  /**
   * Create a Three.js material from BlockMaterial properties
   */
  private createMaterialFromBlock(
    color: number,
    blockMaterial?: BlockMaterial,
    isPreview: boolean = false
  ): THREE.Material {
    const mat = blockMaterial || DEFAULT_MATERIAL;

    // Determine side rendering
    let side: THREE.Side = THREE.FrontSide;
    if (mat.side === "back") side = THREE.BackSide;
    else if (mat.side === "double") side = THREE.DoubleSide;

    // Calculate opacity - preview gets reduced opacity
    const baseOpacity = mat.opacity ?? 1;
    const opacity = isPreview ? Math.min(baseOpacity, 0.6) : baseOpacity;
    const transparent = isPreview || (mat.transparent ?? false) || opacity < 1;

    // Simple mode: just flat color, no lighting calculations at all
    if (this.useSimpleMaterial && !isPreview) {
      return new THREE.MeshBasicMaterial({
        color,
      });
    }

    // Create material based on type
    switch (mat.type) {
      case "basic":
        return new THREE.MeshBasicMaterial({
          color,
          transparent,
          opacity,
          wireframe: mat.wireframe ?? false,
          side,
        });

      case "lambert":
        return new THREE.MeshLambertMaterial({
          color,
          transparent,
          opacity,
          wireframe: mat.wireframe ?? false,
          side,
          emissive: mat.emissive ? hexToNumber(mat.emissive) : 0x000000,
          emissiveIntensity: mat.emissiveIntensity ?? 1,
        });

      case "phong":
        return new THREE.MeshPhongMaterial({
          color,
          transparent,
          opacity,
          wireframe: mat.wireframe ?? false,
          side,
          flatShading: mat.flatShading ?? false,
          emissive: mat.emissive ? hexToNumber(mat.emissive) : 0x000000,
          emissiveIntensity: mat.emissiveIntensity ?? 1,
        });

      case "standard":
      default:
        return new THREE.MeshStandardMaterial({
          color,
          transparent,
          opacity,
          wireframe: mat.wireframe ?? false,
          side,
          flatShading: mat.flatShading ?? false,
          roughness: mat.roughness ?? 0.7,
          metalness: mat.metalness ?? 0,
          emissive: mat.emissive ? hexToNumber(mat.emissive) : 0x000000,
          emissiveIntensity: mat.emissiveIntensity ?? 1,
        });
    }
  }

  // Get the height at a specific grid position (top of highest block, or 0 for ground)
  getHeightAt(gridX: number, gridZ: number): number {
    const key = `${gridX},${gridZ}`;
    return this.heightMap.get(key) || 0;
  }

  // Update the height map when placing/removing blocks
  private updateHeightAt(gridX: number, gridZ: number, height: number): void {
    const key = `${gridX},${gridZ}`;
    if (height <= 0) {
      this.heightMap.delete(key);
    } else {
      this.heightMap.set(key, height);
    }
  }

  // Start placing a structure (shows preview)
  startPlacement(structure: StructureDefinition): void {
    this.cancelPlacement();
    this.currentStructure = structure;
    this.previewMesh = this.createStructureMesh(structure, true);
    this.scene.add(this.previewMesh);

    // Create level indicator plane
    this.createLevelPlane();

    // Initialize preview at last known position
    this.updatePreviewAtGrid(this.previewGridX, this.previewGridZ);
  }

  // Level grid group (contains grid lines and infinite plane)
  private levelGrid: THREE.Group | null = null;

  // Create the level indicator grid - infinite with horizontal and vertical lines
  private createLevelPlane(): void {
    this.levelGrid = new THREE.Group();

    const gridSize = 500; // Large enough to appear infinite

    // Custom shader material for infinite grid with both H and V lines
    const gridShaderMaterial = new THREE.ShaderMaterial({
      uniforms: {
        uColor: { value: new THREE.Color(0x00ffff) }, // Cyan - distinct from ground
        uGridSize: { value: 1.0 }, // Cell size
      },
      vertexShader: `
        varying vec3 vWorldPos;
        void main() {
          vec4 worldPos = modelMatrix * vec4(position, 1.0);
          vWorldPos = worldPos.xyz;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: `
        uniform vec3 uColor;
        uniform float uGridSize;
        varying vec3 vWorldPos;

        void main() {
          // Create grid pattern - both horizontal (X) and vertical (Z) lines
          vec2 gridPos = vWorldPos.xz;

          // Minor grid lines (every cell)
          vec2 grid = abs(fract(gridPos / uGridSize - 0.5) - 0.5) / fwidth(gridPos / uGridSize);
          float minorLineX = 1.0 - min(grid.x, 1.0); // Vertical lines (along X)
          float minorLineZ = 1.0 - min(grid.y, 1.0); // Horizontal lines (along Z)
          float minorLine = max(minorLineX, minorLineZ);

          // Major grid lines (every 10 cells) - brighter
          vec2 majorGrid = abs(fract(gridPos / (uGridSize * 10.0) - 0.5) - 0.5) / fwidth(gridPos / (uGridSize * 10.0));
          float majorLineX = 1.0 - min(majorGrid.x, 1.0);
          float majorLineZ = 1.0 - min(majorGrid.y, 1.0);
          float majorLine = max(majorLineX, majorLineZ);

          // Combine: minor lines dimmer, major lines brighter
          float finalLine = max(minorLine * 0.3, majorLine * 0.7);

          // Subtle background fill
          float fill = 0.05;
          float alpha = finalLine + fill;

          gl_FragColor = vec4(uColor, alpha);
        }
      `,
      transparent: true,
      side: THREE.DoubleSide,
      depthWrite: false,
    });

    // Create the large grid plane
    const planeGeometry = new THREE.PlaneGeometry(gridSize, gridSize, 1, 1);
    const gridPlane = new THREE.Mesh(planeGeometry, gridShaderMaterial);
    gridPlane.rotation.x = -Math.PI / 2;
    this.levelGrid.add(gridPlane);

    this.scene.add(this.levelGrid);
  }

  // Update level grid position (for structure placement)
  private updateLevelPlane(): void {
    if (!this.levelGrid || !this.currentStructure) return;

    // Stationary at origin, only Y changes with build level
    const worldY = this.previewGridY * this.currentStructure.height + 0.02;
    this.levelGrid.position.set(0, worldY, 0);
  }

  // Public method to update level plane position (for prefab placement)
  updateLevelPlaneAt(_gridX: number, _gridZ: number, buildLevel: number): void {
    if (!this.levelGrid) {
      this.createLevelPlane();
    }
    if (!this.levelGrid) return;

    // Stationary at origin, only Y changes with build level
    const worldY = buildLevel + 0.02;
    this.levelGrid.position.set(0, worldY, 0);
  }

  // Show the level plane (for prefab placement)
  showLevelPlane(): void {
    if (!this.levelGrid) {
      this.createLevelPlane();
    }
  }

  // Hide the level plane
  hideLevelPlane(): void {
    this.removeLevelPlane();
  }

  // Remove level grid
  private removeLevelPlane(): void {
    if (this.levelGrid) {
      this.scene.remove(this.levelGrid);
      this.levelGrid.traverse((child) => {
        if (child instanceof THREE.Line) {
          child.geometry.dispose();
          (child.material as THREE.Material).dispose();
        }
        if (child instanceof THREE.Mesh) {
          child.geometry.dispose();
          (child.material as THREE.Material).dispose();
        }
      });
      this.levelGrid = null;
    }
  }

  // Update preview at specific grid coordinates
  private updatePreviewAtGrid(gridX: number, gridZ: number): void {
    if (!this.previewMesh || !this.currentStructure) return;

    this.previewGridX = gridX;
    this.previewGridZ = gridZ;
    this.previewGridY = this.currentBuildLevel;

    // Check if placement is valid at the current fixed build level
    this.isValidPlacement = this.canPlace(this.currentStructure, gridX, this.currentBuildLevel, gridZ);

    // Update preview position (Y is based on fixed build level)
    const worldY = this.currentBuildLevel * this.currentStructure.height;
    this.previewMesh.position.set(
      gridX * this.cellSize + this.cellSize / 2,
      worldY,
      gridZ * this.cellSize + this.cellSize / 2
    );

    // Update level plane position
    this.updateLevelPlane();

    // Update preview color based on validity
    this.updatePreviewColor(this.isValidPlacement);
  }

  // Update preview position based on world coordinates
  updatePreview(worldX: number, worldZ: number): void {
    if (!this.previewMesh || !this.currentStructure) return;

    // Snap to grid (no wrapping - infinite world)
    const gridX = Math.floor(worldX / this.cellSize);
    const gridZ = Math.floor(worldZ / this.cellSize);

    this.updatePreviewAtGrid(gridX, gridZ);
  }

  // Change build level with [ and ] keys
  cycleLevel(direction: number): void {
    const maxLevel = 50; // Maximum build height

    if (direction > 0) {
      // Up - increase level
      this.currentBuildLevel = Math.min(maxLevel, this.currentBuildLevel + 1);
    } else {
      // Down - decrease level
      this.currentBuildLevel = Math.max(0, this.currentBuildLevel - 1);
    }

    // Update preview position at new level (if we have a structure)
    if (this.currentStructure) {
      this.updatePreviewAtGrid(this.previewGridX, this.previewGridZ);
    }

    // Update level plane position
    this.updateLevelPlane();

    // Emit level changed event
    emitEvent("structure:levelChanged", {
      level: this.currentBuildLevel,
      maxLevel: maxLevel,
    });
  }

  // Get current build level for UI display
  getCurrentLevel(): number {
    return this.currentBuildLevel;
  }

  // Set build level (used to sync with shared level)
  setCurrentLevel(level: number): void {
    this.currentBuildLevel = Math.max(0, Math.min(50, level));
  }

  // Rotate the current preview
  rotatePreview(): void {
    if (!this.currentStructure) return;

    this.currentStructure = rotateStructure(this.currentStructure);

    emitEvent("structure:rotated", undefined);

    // Recreate preview mesh with rotated structure
    if (this.previewMesh) {
      this.scene.remove(this.previewMesh);
      this.disposeMesh(this.previewMesh);
    }

    this.previewMesh = this.createStructureMesh(this.currentStructure, true);
    this.scene.add(this.previewMesh);

    // Update position
    this.updatePreviewAtGrid(this.previewGridX, this.previewGridZ);
  }

  // Confirm placement at current preview position
  confirmPlacement(): PlacedStructure | null {
    if (!this.currentStructure || !this.previewMesh || !this.isValidPlacement) {
      return null;
    }

    const structureId = `${this.currentStructure.id}_${Date.now()}`;
    let mesh: THREE.Group;

    if (this.useInstancing) {
      // For instanced rendering, add to block instances (no individual mesh)
      for (const cell of this.currentStructure.cells) {
        const cellX = this.previewGridX + cell.x;
        const cellZ = this.previewGridZ + cell.z;
        const key = cellKey3D(cellX, this.previewGridY, cellZ);

        // Pre-cache the material to ensure it exists for instancing
        this.getCachedMaterial(
          this.currentStructure.color,
          this.currentStructure.material,
          false
        );

        this.addBlockInstance(
          key,
          this.currentStructure.id,
          cellX,
          this.previewGridY,
          cellZ,
          this.currentStructure.color,
          this.currentStructure.material
        );
      }

      // Create an empty group as placeholder (instanced mesh handles actual rendering)
      mesh = new THREE.Group();
    } else {
      // Non-instanced: create individual mesh
      mesh = this.createStructureMesh(this.currentStructure, false);
      mesh.position.copy(this.previewMesh.position);
      this.scene.add(mesh);
    }

    // Create placed structure record
    const placedStructure: PlacedStructure = {
      id: structureId,
      definition: this.currentStructure,
      gridX: this.previewGridX,
      gridY: this.previewGridY,
      gridZ: this.previewGridZ,
      mesh,
    };

    // Mark cells as occupied and update height map
    this.markCellsOccupied(this.currentStructure, this.previewGridX, this.previewGridY, this.previewGridZ);

    // Store placed structure
    this.placedStructures.set(structureId, placedStructure);

    // Emit event
    emitEvent("structure:placed", {
      id: structureId,
      gridX: this.previewGridX,
      gridZ: this.previewGridZ,
    });

    // Clean up preview
    this.cancelPlacement();

    return placedStructure;
  }

  // Cancel current placement
  cancelPlacement(): void {
    if (this.previewMesh) {
      this.scene.remove(this.previewMesh);
      this.disposeMesh(this.previewMesh);
      this.previewMesh = null;
    }
    this.removeLevelPlane();
    this.currentStructure = null;
    this.isValidPlacement = false;
  }

  // Check if structure can be placed at position (3D check)
  canPlace(structure: StructureDefinition, gridX: number, gridY: number, gridZ: number): boolean {
    // Free placement mode allows overlapping
    if (stateManager.isFreePlacement()) {
      return true;
    }

    for (const cell of structure.cells) {
      const cellX = gridX + cell.x;
      const cellZ = gridZ + cell.z;
      const key = cellKey3D(cellX, gridY, cellZ);

      if (this.occupiedCells.has(key)) {
        return false;
      }
    }

    return true;
  }

  // Mark cells as occupied (3D) and update height map
  private markCellsOccupied(structure: StructureDefinition, gridX: number, gridY: number, gridZ: number): void {
    for (const cell of structure.cells) {
      const cellX = gridX + cell.x;
      const cellZ = gridZ + cell.z;
      const key = cellKey3D(cellX, gridY, cellZ);

      // Mark this 3D cell as occupied and store blockId
      this.occupiedCells.add(key);
      this.cellBlockIds.set(key, structure.id);

      // Update height map (new height is gridY + 1 since we placed a block at gridY)
      const newHeight = gridY + 1;
      const currentHeight = this.getHeightAt(cellX, cellZ);
      if (newHeight > currentHeight) {
        this.updateHeightAt(cellX, cellZ, newHeight);
      }
    }
  }

  // Remove a placed structure
  removeStructure(structureId: string): boolean {
    const structure = this.placedStructures.get(structureId);
    if (!structure) return false;

    const { gridX, gridY, gridZ } = structure;

    // Free up cells (3D) and remove from instanced rendering
    for (const cell of structure.definition.cells) {
      const cellX = structure.gridX + cell.x;
      const cellZ = structure.gridZ + cell.z;
      const key = cellKey3D(cellX, gridY, cellZ);
      this.occupiedCells.delete(key);
      this.cellBlockIds.delete(key);

      // Remove from instanced rendering
      if (this.useInstancing) {
        this.removeBlockInstance(key);
      }

      // Recalculate height at this position
      this.recalculateHeightAt(cellX, cellZ);
    }

    // Remove mesh (only relevant for non-instanced mode)
    if (!this.useInstancing) {
      this.scene.remove(structure.mesh);
      this.disposeMesh(structure.mesh);
    }

    this.placedStructures.delete(structureId);

    // Emit event
    emitEvent("structure:removed", { id: structureId, gridX, gridZ });

    return true;
  }

  // Recalculate height at a position after removing a block
  private recalculateHeightAt(gridX: number, gridZ: number): void {
    let maxHeight = 0;

    // Check all Y levels to find the highest occupied cell
    for (let y = 0; y < 100; y++) {
      if (this.occupiedCells.has(cellKey3D(gridX, y, gridZ))) {
        maxHeight = y + 1;
      }
    }

    this.updateHeightAt(gridX, gridZ, maxHeight);
  }

  // Create mesh for a structure (uses cached geometry and materials for performance)
  private createStructureMesh(structure: StructureDefinition, isPreview: boolean): THREE.Group {
    const group = new THREE.Group();

    // Get cached geometry and material
    const geometry = this.getCachedGeometry(
      this.cellSize * 0.95,
      structure.height,
      this.cellSize * 0.95
    );
    const material = this.getCachedMaterial(
      structure.color,
      structure.material,
      isPreview
    );

    // Create a box for each cell (reusing cached geometry/material)
    for (const cell of structure.cells) {
      const mesh = new THREE.Mesh(geometry, material);
      mesh.position.set(
        cell.x * this.cellSize,
        structure.height / 2,
        cell.z * this.cellSize
      );

      group.add(mesh);
    }

    // Add edge highlight for preview
    if (isPreview) {
      // Cache edge geometry too
      const edgeBoxGeometry = this.getCachedGeometry(
        this.cellSize,
        structure.height,
        this.cellSize
      );
      const edgeGeometry = new THREE.EdgesGeometry(edgeBoxGeometry);
      const edgeMaterial = new THREE.LineBasicMaterial({ color: 0xffffff });

      for (const cell of structure.cells) {
        const edges = new THREE.LineSegments(edgeGeometry, edgeMaterial);
        edges.position.set(
          cell.x * this.cellSize,
          structure.height / 2,
          cell.z * this.cellSize
        );
        group.add(edges);
      }
    }

    return group;
  }

  // Update preview opacity based on validity (keeps original color)
  private updatePreviewColor(isValid: boolean): void {
    if (!this.previewMesh) return;

    this.previewMesh.traverse((child) => {
      if (child instanceof THREE.Mesh) {
        (child.material as THREE.MeshStandardMaterial).opacity = isValid ? 0.8 : 0.3;
      }
    });
  }

  // Dispose of mesh and materials
  private disposeMesh(mesh: THREE.Group): void {
    mesh.traverse((child) => {
      if (child instanceof THREE.Mesh) {
        child.geometry.dispose();
        if (child.material instanceof THREE.Material) {
          child.material.dispose();
        }
      }
      if (child instanceof THREE.LineSegments) {
        child.geometry.dispose();
        if (child.material instanceof THREE.Material) {
          child.material.dispose();
        }
      }
    });
  }

  // Get all placed structures
  getPlacedStructures(): PlacedStructure[] {
    return Array.from(this.placedStructures.values());
  }

  // Check if a cell is occupied at ground level (Y=0) - used for character collision
  isCellOccupied(gridX: number, gridZ: number): boolean {
    return this.occupiedCells.has(cellKey3D(gridX, 0, gridZ));
  }

  // Check if a cell is occupied at any height
  isCellOccupiedAtHeight(gridX: number, gridY: number, gridZ: number): boolean {
    return this.occupiedCells.has(cellKey3D(gridX, gridY, gridZ));
  }

  // Find structure at a grid position (no wrapping)
  getStructureAt(gridX: number, gridZ: number): PlacedStructure | null {
    for (const structure of this.placedStructures.values()) {
      for (const cell of structure.definition.cells) {
        const cellX = structure.gridX + cell.x;
        const cellZ = structure.gridZ + cell.z;
        if (cellX === gridX && cellZ === gridZ) {
          return structure;
        }
      }
    }
    return null;
  }

  // Remove structure at a grid position (any Y level)
  removeStructureAt(gridX: number, gridZ: number): boolean {
    const structure = this.getStructureAt(gridX, gridZ);
    if (structure) {
      return this.removeStructure(structure.id);
    }
    return false;
  }

  // Remove block at a specific 3D grid position (level-restricted)
  removeBlockAt(gridX: number, gridY: number, gridZ: number): boolean {
    const key = cellKey3D(gridX, gridY, gridZ);

    // Check if there's a block at this exact position
    if (!this.occupiedCells.has(key)) {
      return false;
    }

    // Find the placed structure that contains this cell
    for (const [structureId, structure] of this.placedStructures) {
      // Check if this structure occupies the target cell
      for (const cell of structure.definition.cells) {
        const cellX = structure.gridX + cell.x;
        const cellZ = structure.gridZ + cell.z;

        if (cellX === gridX && structure.gridY === gridY && cellZ === gridZ) {
          return this.removeStructure(structureId);
        }
      }
    }

    // If no matching structure found but cell is occupied (orphaned block),
    // clean up the cell data directly
    this.occupiedCells.delete(key);
    this.cellBlockIds.delete(key);

    if (this.useInstancing) {
      this.removeBlockInstance(key);
    }

    this.recalculateHeightAt(gridX, gridZ);

    return true;
  }

  // Update material for a block at a specific position
  updateBlockMaterial(gridX: number, gridY: number, gridZ: number, material: BlockMaterial): boolean {
    const key = cellKey3D(gridX, gridY, gridZ);

    // Check if there's a block at this exact position
    if (!this.occupiedCells.has(key)) {
      return false;
    }

    if (this.useInstancing) {
      // Get existing instance
      const instance = this.blockInstances.get(key);
      if (!instance) return false;

      // Remove old instance
      this.removeBlockInstance(key);

      // Merge new material with existing
      const newMaterial: BlockMaterial = {
        ...instance.blockMaterial,
        ...material,
      };

      // Re-add with new material
      this.addBlockInstance(
        key,
        instance.blockId,
        instance.gridX,
        instance.gridY,
        instance.gridZ,
        instance.color,
        newMaterial
      );

      // Mark dirty and trigger immediate rebuild
      this.instancesDirty = true;
      this.rebuildInstancedMeshesNow();
    }

    return true;
  }

  // Is currently in placement mode
  isPlacing(): boolean {
    return this.currentStructure !== null;
  }

  // Get current structure being placed
  getCurrentStructure(): StructureDefinition | null {
    return this.currentStructure;
  }

  // Get the occupied cells set (for prefab capture)
  getOccupiedCells(): Set<string> {
    return this.occupiedCells;
  }

  // Get blockId at a specific 3D position (for prefab capture)
  getBlockIdAt(x: number, y: number, z: number): string | null {
    const key = cellKey3D(x, y, z);
    return this.cellBlockIds.get(key) || null;
  }

  // Get current build level
  getCurrentBuildLevel(): number {
    return this.currentBuildLevel;
  }

  // Get all block meshes for raycasting (used for click detection on raised blocks)
  getBlockMeshes(): THREE.Object3D[] {
    const meshes: THREE.Object3D[] = [];

    if (this.useInstancing) {
      // Return all instanced meshes for raycasting
      for (const instancedMesh of this.instancedMeshes.values()) {
        meshes.push(instancedMesh);
      }
    } else {
      // Non-instanced: return individual meshes
      for (const structure of this.placedStructures.values()) {
        structure.mesh.traverse((child) => {
          if (child instanceof THREE.Mesh) {
            meshes.push(child);
          }
        });
      }
    }
    return meshes;
  }

  // ============================================
  // PREFAB PLACEMENT
  // ============================================

  // Calculate prefab bounds for centering
  private getPrefabBounds(prefab: PrefabDefinition): {
    minX: number;
    maxX: number;
    minZ: number;
    maxZ: number;
    centerX: number;
    centerZ: number;
  } {
    let minX = Infinity,
      maxX = -Infinity;
    let minZ = Infinity,
      maxZ = -Infinity;

    for (const block of prefab.blocks) {
      minX = Math.min(minX, block.x);
      maxX = Math.max(maxX, block.x);
      minZ = Math.min(minZ, block.z);
      maxZ = Math.max(maxZ, block.z);
    }

    return {
      minX,
      maxX,
      minZ,
      maxZ,
      centerX: (minX + maxX) / 2,
      centerZ: (minZ + maxZ) / 2,
    };
  }

  // Rotate block coordinates around the prefab center
  // Returns integer grid offsets to maintain alignment
  private rotateBlockCoords(
    x: number,
    z: number,
    rotation: number,
    centerX: number,
    centerZ: number
  ): { x: number; z: number } {
    if (rotation === 0) {
      return { x, z };
    }

    // Translate to center
    const relX = x - centerX;
    const relZ = z - centerZ;

    let rotatedX: number, rotatedZ: number;

    switch (rotation) {
      case 1: // 90° clockwise
        rotatedX = -relZ;
        rotatedZ = relX;
        break;
      case 2: // 180°
        rotatedX = -relX;
        rotatedZ = -relZ;
        break;
      case 3: // 270° clockwise
        rotatedX = relZ;
        rotatedZ = -relX;
        break;
      default:
        rotatedX = relX;
        rotatedZ = relZ;
    }

    // Translate back and round to maintain grid alignment
    return {
      x: Math.round(rotatedX + centerX),
      z: Math.round(rotatedZ + centerZ),
    };
  }

  /**
   * Get the world positions for each block in a prefab after rotation
   * Used for sending prefab blocks to the server
   */
  getPrefabBlockPositions(
    prefab: PrefabDefinition,
    gridX: number,
    gridZ: number,
    baseY: number,
    rotation: number
  ): Array<{ blockId: string; x: number; y: number; z: number }> {
    const bounds = this.getPrefabBounds(prefab);
    const positions: Array<{ blockId: string; x: number; y: number; z: number }> = [];

    for (const block of prefab.blocks) {
      const rotated = this.rotateBlockCoords(
        block.x,
        block.z,
        rotation,
        bounds.centerX,
        bounds.centerZ
      );
      positions.push({
        blockId: block.blockId,
        x: gridX + rotated.x,
        y: baseY + block.y,
        z: gridZ + rotated.z,
      });
    }

    return positions;
  }

  // Check if a prefab can be placed at position
  canPlacePrefab(
    prefab: PrefabDefinition,
    gridX: number,
    gridZ: number,
    baseY: number = 0,
    rotation: number = 0
  ): boolean {
    // Free placement mode allows overlapping
    if (stateManager.isFreePlacement()) {
      return true;
    }

    const bounds = this.getPrefabBounds(prefab);

    for (const block of prefab.blocks) {
      const rotated = this.rotateBlockCoords(
        block.x,
        block.z,
        rotation,
        bounds.centerX,
        bounds.centerZ
      );
      const cellX = gridX + rotated.x;
      const cellY = baseY + block.y;
      const cellZ = gridZ + rotated.z;
      const key = cellKey3D(cellX, cellY, cellZ);

      if (this.occupiedCells.has(key)) {
        return false;
      }
    }
    return true;
  }

  // Place a prefab (multiple blocks at once)
  placePrefab(
    prefab: PrefabDefinition,
    gridX: number,
    gridZ: number,
    baseY: number = 0,
    rotation: number = 0
  ): boolean {
    if (!this.canPlacePrefab(prefab, gridX, gridZ, baseY, rotation)) {
      return false;
    }

    const bounds = this.getPrefabBounds(prefab);

    // Place each block in the prefab individually at exact grid positions
    for (const block of prefab.blocks) {
      // Calculate which grid cell this block occupies
      const rotated = this.rotateBlockCoords(
        block.x,
        block.z,
        rotation,
        bounds.centerX,
        bounds.centerZ
      );
      const cellX = gridX + rotated.x;
      const cellY = baseY + block.y;
      const cellZ = gridZ + rotated.z;
      const key = cellKey3D(cellX, cellY, cellZ);

      // Mark cell as occupied and store blockId
      this.occupiedCells.add(key);
      this.cellBlockIds.set(key, block.blockId);

      // Update height map
      const newHeight = cellY + 1;
      const currentHeight = this.getHeightAt(cellX, cellZ);
      if (newHeight > currentHeight) {
        this.updateHeightAt(cellX, cellZ, newHeight);
      }

      const color = getPrefabBlockColor(block);
      const blockMaterial = getPrefabBlockMaterial(block);

      if (this.useInstancing) {
        // Add to instanced rendering
        this.getCachedMaterial(color, blockMaterial, false); // Pre-cache material
        this.addBlockInstance(key, block.blockId, cellX, cellY, cellZ, color, blockMaterial);

        // Store minimal placedStructure for tracking
        const structureId = `prefab_block_${key}_${Date.now()}`;
        const blockStructure = getStructure(block.blockId);
        if (blockStructure) {
          this.placedStructures.set(structureId, {
            id: structureId,
            definition: blockStructure,
            gridX: cellX,
            gridY: cellY,
            gridZ: cellZ,
            mesh: new THREE.Group(), // Empty placeholder
          });
        }
      } else {
        // Non-instanced: create individual mesh
        const geometry = this.getCachedGeometry(
          this.cellSize * 0.95,
          1,
          this.cellSize * 0.95
        );
        const material = this.getCachedMaterial(color, blockMaterial, false);
        const mesh = new THREE.Mesh(geometry, material);
        mesh.position.set(
          cellX * this.cellSize + this.cellSize / 2,
          cellY + 0.5,
          cellZ * this.cellSize + this.cellSize / 2
        );

        // Wrap in group for consistency with placedStructures
        const meshGroup = new THREE.Group();
        meshGroup.add(mesh);
        this.scene.add(meshGroup);

        // Store in placedStructures so clearAll() can remove it
        const structureId = `prefab_block_${key}_${Date.now()}`;
        const blockStructure = getStructure(block.blockId);
        if (blockStructure) {
          this.placedStructures.set(structureId, {
            id: structureId,
            definition: blockStructure,
            gridX: cellX,
            gridY: cellY,
            gridZ: cellZ,
            mesh: meshGroup,
          });
        }
      }
    }

    // Emit event
    emitEvent("structure:placed", {
      id: `prefab_${prefab.id}_${Date.now()}`,
      gridX,
      gridZ,
    });

    return true;
  }

  // ============================================
  // SAVE/LOAD SUPPORT
  // ============================================

  /**
   * Export all placed blocks as an array for saving
   */
  exportBlocks(): Array<{ blockId: string; x: number; y: number; z: number; material?: BlockMaterial }> {
    const blocks: Array<{ blockId: string; x: number; y: number; z: number; material?: BlockMaterial }> = [];

    // Iterate through all occupied cells and export their data
    for (const key of this.occupiedCells) {
      const blockId = this.cellBlockIds.get(key);
      if (blockId) {
        const [x, y, z] = key.split(",").map(Number);

        // Get custom material if any from block instances
        const instance = this.blockInstances.get(key);
        const material = instance?.blockMaterial;

        // Only include material if it has custom properties
        if (material && Object.keys(material).length > 0) {
          blocks.push({ blockId, x, y, z, material });
        } else {
          blocks.push({ blockId, x, y, z });
        }
      }
    }

    return blocks;
  }

  /**
   * Import blocks from saved data, recreating meshes
   */
  importBlocks(blocks: Array<{ blockId: string; x: number; y: number; z: number; material?: BlockMaterial }>): number {
    let importedCount = 0;

    for (const block of blocks) {
      const structure = getStructure(block.blockId);
      if (!structure) {
        console.warn(`Unknown block type: ${block.blockId}`);
        continue;
      }

      // Check if cell is already occupied (skip duplicates)
      const key = cellKey3D(block.x, block.y, block.z);
      if (this.occupiedCells.has(key)) {
        continue;
      }

      // Track in data structures
      this.occupiedCells.add(key);
      this.cellBlockIds.set(key, block.blockId);

      // Use custom material if provided, otherwise use structure's default material
      const blockMaterial = block.material || structure.material;

      // Update height map
      const heightKey = `${block.x},${block.z}`;
      const currentHeight = this.heightMap.get(heightKey) || 0;
      this.heightMap.set(heightKey, Math.max(currentHeight, block.y + 1));

      let mesh: THREE.Group;

      if (this.useInstancing) {
        // Add to instanced rendering with custom material if provided
        this.getCachedMaterial(structure.color, blockMaterial, false);
        this.addBlockInstance(
          key,
          block.blockId,
          block.x,
          block.y,
          block.z,
          structure.color,
          blockMaterial
        );
        mesh = new THREE.Group(); // Empty placeholder
      } else {
        // Create mesh for the block
        // Note: createStructureMesh already positions internal mesh at height/2
        // So group position Y should be gridY * height (not gridY + 0.5)
        mesh = this.createStructureMesh(structure, false);
        mesh.position.set(
          block.x * this.cellSize + this.cellSize / 2,
          block.y * structure.height,
          block.z * this.cellSize + this.cellSize / 2
        );
        this.scene.add(mesh);
      }

      // Store as placed structure
      const structureId = `${block.blockId}_${Date.now()}_${importedCount}`;
      this.placedStructures.set(structureId, {
        id: structureId,
        definition: structure,
        gridX: block.x,
        gridY: block.y,
        gridZ: block.z,
        mesh,
      });

      importedCount++;
    }

    // Force immediate rebuild for bulk import
    if (this.useInstancing && importedCount > 0) {
      this.rebuildInstancedMeshesNow();
    }

    return importedCount;
  }

  /**
   * Place a single block from network (multiplayer sync)
   * Similar to importBlocks but for individual real-time placement
   */
  placeBlockFromNetwork(
    x: number,
    y: number,
    z: number,
    blockId: string,
    _rotation: number = 0
  ): boolean {
    const structure = getStructure(blockId);
    if (!structure) {
      console.warn(`Unknown block type from network: ${blockId}`);
      return false;
    }

    // Check if cell is already occupied (skip duplicates)
    const key = cellKey3D(x, y, z);
    if (this.occupiedCells.has(key)) {
      return false;
    }

    // Track in data structures
    this.occupiedCells.add(key);
    this.cellBlockIds.set(key, blockId);

    // Update height map
    const heightKey = `${x},${z}`;
    const currentHeight = this.heightMap.get(heightKey) || 0;
    this.heightMap.set(heightKey, Math.max(currentHeight, y + 1));

    let mesh: THREE.Group;

    if (this.useInstancing) {
      // Add to instanced rendering
      this.getCachedMaterial(structure.color, structure.material, false);
      this.addBlockInstance(
        key,
        blockId,
        x,
        y,
        z,
        structure.color,
        structure.material
      );
      mesh = new THREE.Group(); // Empty placeholder
    } else {
      // Create mesh for the block
      mesh = this.createStructureMesh(structure, false);
      mesh.position.set(
        x * this.cellSize + this.cellSize / 2,
        y * structure.height,
        z * this.cellSize + this.cellSize / 2
      );
      this.scene.add(mesh);
    }

    // Store as placed structure
    const structureId = `network_${blockId}_${Date.now()}`;
    this.placedStructures.set(structureId, {
      id: structureId,
      definition: structure,
      gridX: x,
      gridY: y,
      gridZ: z,
      mesh,
    });

    // Trigger rebuild for instanced meshes
    if (this.useInstancing) {
      this.rebuildInstancedMeshesNow();
    }

    return true;
  }

  /**
   * Clear all placed blocks (for reset)
   */
  clearAll(): void {
    // Clear instanced meshes
    if (this.useInstancing) {
      for (const mesh of this.instancedMeshes.values()) {
        this.instancedMeshGroup.remove(mesh);
        mesh.geometry.dispose();
      }
      this.instancedMeshes.clear();
      this.blockInstances.clear();
    }

    // Remove all individual meshes from scene (non-instanced mode)
    if (!this.useInstancing) {
      for (const structure of this.placedStructures.values()) {
        this.scene.remove(structure.mesh);
        structure.mesh.traverse((child) => {
          if (child instanceof THREE.Mesh) {
            child.geometry.dispose();
            if (child.material instanceof THREE.Material) {
              child.material.dispose();
            }
          }
        });
      }
    }

    // Clear all tracking data
    this.placedStructures.clear();
    this.occupiedCells.clear();
    this.cellBlockIds.clear();
    this.heightMap.clear();
  }

  // Create preview mesh for a prefab with optional rotation (uses cached geometry/materials)
  createPrefabPreview(prefab: PrefabDefinition, rotation: number = 0): THREE.Group {
    const group = new THREE.Group();
    const bounds = this.getPrefabBounds(prefab);

    // Cache geometry and edge geometry for all blocks
    const geometry = this.getCachedGeometry(
      this.cellSize * 0.95,
      1,
      this.cellSize * 0.95
    );
    const edgeBoxGeometry = this.getCachedGeometry(this.cellSize, 1, this.cellSize);
    const edgeGeometry = new THREE.EdgesGeometry(edgeBoxGeometry);
    const edgeMaterial = new THREE.LineBasicMaterial({ color: 0xffffff });

    for (const block of prefab.blocks) {
      // Apply rotation to get final position
      const rotated = this.rotateBlockCoords(
        block.x,
        block.z,
        rotation,
        bounds.centerX,
        bounds.centerZ
      );

      const color = getPrefabBlockColor(block);
      const blockMaterial = getPrefabBlockMaterial(block);
      const material = this.getCachedMaterial(color, blockMaterial, true);
      const mesh = new THREE.Mesh(geometry, material);
      // Position at grid-aligned offsets (same pattern as regular structures)
      mesh.position.set(
        rotated.x * this.cellSize,
        block.y + 0.5,
        rotated.z * this.cellSize
      );
      group.add(mesh);

      // Add edge highlight (reuse edge geometry and material)
      const edges = new THREE.LineSegments(edgeGeometry, edgeMaterial);
      edges.position.copy(mesh.position);
      group.add(edges);
    }

    return group;
  }
}
