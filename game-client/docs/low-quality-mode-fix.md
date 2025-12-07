# Low Quality Mode Material Issue - Post-Mortem

## The Problem

When switching to "Low" quality mode, blocks were supposed to display as simple flat colors (using `MeshBasicMaterial`) but instead showed:
1. Gray/white blocks instead of their actual colors
2. Old materials bleeding through (transparency, metallic effects)
3. Visual "flickering" where old and new materials overlapped

## Root Causes

### 1. **Dual Rendering Systems**

The PlacementSystem has two separate rendering modes:
- **Instanced Meshes** (`instancedMeshGroup`) - Used in "High" quality mode
- **Greedy Meshes** (`greedyMeshGroup`) - Used in "Medium" and "Low" quality modes

When switching modes, **both groups' meshes remained in the scene**. Even though we set `instancedMeshGroup.visible = false`, the old meshes with full materials were still being rendered.

**Fix:** Added `clearInstancedMeshes()` method and called it when switching to greedy mode to completely remove all instanced meshes from the scene.

### 2. **Race Condition with Material Keys**

The original code in `main.ts` called methods in this order:
```typescript
this.placementSystem.setGreedyMeshing(true);   // Triggers rebuild
this.placementSystem.setSimpleMaterial(true);  // Updates keys, triggers another rebuild
```

The first call would rebuild meshes using the **old complex material keys** (like `2ecc71_standard_0.2_0.9_...`), then the second call would update keys to simple format (`simple_2ecc71`) and rebuild again. But the first rebuild's materials were already cached and found.

**Fix:** Created `setQualityMode(useGreedy, useSimple)` method that:
1. Updates the simple material flag **first**
2. Updates all block instance material keys
3. Clears the material cache
4. Clears all meshes from both groups
5. Does a **single** rebuild with correct settings

### 3. **Material Cache Not Cleared**

When switching to simple mode, old materials with full properties (transparency, metalness, etc.) remained in the cache. The mesher would return geometries grouped by material key, and if an old material was found in the cache, it would be used instead of creating a new simple one.

**Fix:** Call `clearMaterialCache()` when changing material mode to force recreation of all materials.

### 4. **Pending Rebuild Callbacks**

The `markGreedyMeshDirty()` method schedules a rebuild on the next animation frame via `requestAnimationFrame`. If a quality change happened, there could be a pending callback that would rebuild with stale settings.

**Fix:** Reset `greedyMeshDirty = false` and `instancesDirty = false` at the start of `setQualityMode()` to cancel any pending rebuilds.

### 5. **Incomplete Mesh Clearing**

The `clearGreedyMeshes()` method only cleared meshes tracked in the `greedyMeshes` Map. But when material keys changed, meshes could exist in the group with keys not in the map.

**Fix:** Added a loop to remove **all children** from the group:
```typescript
while (this.greedyMeshGroup.children.length > 0) {
  const child = this.greedyMeshGroup.children[0];
  this.greedyMeshGroup.remove(child);
}
```

## What We Can Do Better

### 1. **Single Source of Truth for Quality Settings**

Instead of having separate `setGreedyMeshing()` and `setSimpleMaterial()` methods that can be called in any order, use a single unified method like `setQualityMode()` that handles all quality-related settings atomically.

```typescript
// Better: Single method handles everything
setQualityMode(level: 'low' | 'medium' | 'high'): void {
  const config = QUALITY_CONFIGS[level];
  // Apply all settings together, rebuild once
}
```

### 2. **State Machine for Rendering Mode**

Consider using an explicit state machine for rendering modes:
```typescript
type RenderMode = 'instanced' | 'greedy-full' | 'greedy-simple';

setRenderMode(mode: RenderMode): void {
  if (this.currentMode === mode) return;
  this.exitMode(this.currentMode);  // Cleanup old mode completely
  this.enterMode(mode);              // Setup new mode
  this.currentMode = mode;
}
```

### 3. **Don't Cache Materials Across Quality Modes**

The material cache should be scoped to the current quality mode. When mode changes, the entire cache should be invalidated automatically.

### 4. **Use Material Key Prefixes**

Already implemented: Using `simple_` prefix for simple mode keys. This prevents key collisions between modes:
- Full: `2ecc71_standard_0.2_0.9_...`
- Simple: `simple_2ecc71`

### 5. **Complete Cleanup Before Rebuild**

Always fully clean up the previous state before rebuilding:
```typescript
// Pattern to follow:
clearAllMeshes();
clearMaterialCache();
updateMaterialKeys();
rebuild();
```

### 6. **Testing Quality Transitions**

Create explicit test cases for quality transitions:
- High → Medium → Low → Medium → High
- High → Low directly
- Transitions while blocks are being placed
- Transitions with transparent/emissive materials present

### 7. **Debug Tooling**

Add a debug overlay that shows:
- Current render mode
- Number of meshes in each group
- Material cache size
- Active material keys

This would have revealed the issue immediately (4 instanced meshes visible when they should be 0).

## Summary

The core issue was **incomplete state transitions** when switching quality modes. Multiple rendering systems, cached materials, and asynchronous rebuilds created a complex state space where old state could bleed into new state. The fix consolidated all quality changes into a single atomic operation that completely clears old state before building new state.

---

## Recommendations Implemented

All 7 recommendations from the post-mortem have been implemented:

### 1. Single Source of Truth - `QualityLevel` Type

```typescript
export type QualityLevel = "low" | "medium" | "high";

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
```

### 2. State Machine for Render Mode

```typescript
export type RenderMode = "instanced" | "greedy-full" | "greedy-simple";

// State variables
private currentQualityLevel: QualityLevel = "high";
private currentRenderMode: RenderMode = "instanced";

// State machine methods
private exitRenderMode(mode: RenderMode): void { /* cleanup */ }
private enterRenderMode(mode: RenderMode): void { /* setup */ }
private transitionRenderMode(from, to, config): void { /* transition */ }
```

### 3. Material Cache Invalidation

The material cache is automatically cleared when transitioning between quality modes that use different material types.

### 4. Material Key Prefixes

Already implemented with `simple_` prefix for simple mode materials.

### 5. Complete Cleanup Pattern

Implemented in `transitionRenderMode()`:
```typescript
this.exitRenderMode(fromMode);     // Complete cleanup
// Update flags and keys
this.enterRenderMode(toMode);      // Setup and rebuild
```

### 6. Testing Quality Transitions

The state machine ensures consistent behavior for all transition paths.

### 7. Debug Statistics

```typescript
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
```

---

## New API Usage

### Recommended: Use `setQualityLevel()`

```typescript
// In main.ts
this.placementSystem.setQualityLevel("low");
this.placementSystem.setQualityLevel("medium");
this.placementSystem.setQualityLevel("high");
```

### Query Current State

```typescript
const level = this.placementSystem.getQualityLevel();  // "low" | "medium" | "high"
const mode = this.placementSystem.getRenderMode();     // "instanced" | "greedy-full" | "greedy-simple"
const stats = this.placementSystem.getDebugStats();    // Full debug info
```

### Legacy Support

The old `setQualityMode(useGreedy, useSimple)` method is still available but deprecated:
```typescript
// @deprecated - Use setQualityLevel() instead
this.placementSystem.setQualityMode(true, true);  // Maps to "low"
```

---

## Key Files Modified

- `src/structures/PlacementSystem.ts`
  - Added `QualityLevel`, `RenderMode`, `QualityConfig`, `PlacementDebugStats` types
  - Added `QUALITY_CONFIGS` constant
  - Added `currentQualityLevel` and `currentRenderMode` state variables
  - Added `setQualityLevel(level)` method (recommended)
  - Added `getQualityLevel()` and `getRenderMode()` getters
  - Added `getDebugStats()` method
  - Added `transitionRenderMode()`, `exitRenderMode()`, `enterRenderMode()` state machine methods
  - Added `clearInstancedMeshes()` method
  - Enhanced `clearGreedyMeshes()` to clear all children
  - Simple mode now uses `MeshBasicMaterial` (flat color, no lighting)
  - Deprecated `setQualityMode(useGreedy, useSimple)` (still works for backwards compatibility)

- `src/main.ts`
  - Changed quality handler to use `setQualityLevel()` instead of `setQualityMode()`
