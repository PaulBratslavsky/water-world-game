# Prefab Capture System

This document explains how the prefab selection and capture system works, including the 3D bounding box selection, block detection, coordinate normalization, and data storage.

## Overview

The prefab capture system allows players to select a region of placed blocks and save them as a reusable prefab. The system uses a **3D bounding box selection** where users define both the horizontal extent (X/Z) and vertical range (Y levels).

## How 3D Grid Selection Works

### The Grid Coordinate System

Blocks exist on a 3D integer grid. Each block occupies exactly one cell:

```
Grid Position (2, 3, 5) means:
  - X = 2 (horizontal position)
  - Y = 3 (vertical level/height)
  - Z = 5 (horizontal depth)

World Position = Grid Position × cellSize
  - For cellSize = 1: grid (2, 3, 5) → world (2, 3, 5)
  - For cellSize = 2: grid (2, 3, 5) → world (4, 6, 10)
```

### Block Storage Reference

Blocks are stored in a `Set<string>` using 3D keys (see `grid-based-collision.md` for details):

```typescript
// Storage format: "x,y,z"
occupiedCells: Set<string>

// Examples:
"5,0,8"   // Block at ground level
"5,1,8"   // Block stacked on top
"5,2,8"   // Third level
"6,0,8"   // Adjacent block at ground
```

This allows O(1) lookup to check if any position contains a block.

## Selection Flow

### Step 1: Enter Capture Mode (P key)

When capture mode activates:

```typescript
private startCapture(): void {
  this.firstCorner = null;
  this.secondCorner = null;
  this.currentLevel = 0;    // Bottom Y level
  this.topLevel = 0;        // Top Y level (same initially)
  this.clearSelectionVisuals();
  this.updateLevelIndicator();
}
```

A green grid plane appears at Y=0 showing the current selection level.

### Step 2: Set Starting Level ([ and ] keys)

Before clicking, use `[` and `]` to adjust the bottom level:

```typescript
private adjustLevel(direction: number): void {
  if (!this.firstCorner) {
    // Before first click - adjust starting level
    this.currentLevel = Math.max(0, Math.min(this.maxLevel, this.currentLevel + direction));
    this.topLevel = this.currentLevel;  // Top matches bottom initially
    this.updateLevelIndicator();
  }
}
```

**Visual feedback**: Green grid plane moves up/down with level changes.

### Step 3: Click First Corner

The first click sets one corner of the selection box at the current level:

```typescript
handleClick(gridX: number, _gridY: number, gridZ: number): boolean {
  if (!this.firstCorner) {
    // Set first corner at current level (ignores clicked Y, uses user-set level)
    this.firstCorner = new THREE.Vector3(gridX, this.currentLevel, gridZ);
    this.updateSelectionVisual();
    return true;
  }
  // ...
}
```

**Note**: The `gridY` from the click is ignored - we use the level set by `[`/`]` keys.

### Step 4: Expand Selection Height (] key)

After the first click, `]` expands upward, `[` shrinks:

```typescript
private adjustLevel(direction: number): void {
  // ...
  } else {
    // After first click - adjust top level
    const newTopLevel = this.topLevel + direction;
    if (newTopLevel >= this.currentLevel && newTopLevel <= this.maxLevel) {
      this.topLevel = newTopLevel;

      // Update preview box with new height
      this.updateSelectionBox(
        this.firstCorner.x, this.currentLevel, this.firstCorner.z,
        this.currentPreviewX, this.topLevel, this.currentPreviewZ
      );
    }
  }
}
```

**Constraint**: `topLevel` must always be >= `currentLevel` (can't have negative height).

### Step 5: Preview Selection (Mouse Move)

As you move the mouse, a cyan wireframe box shows the full selection:

```typescript
updatePreview(gridX: number, _gridY: number, gridZ: number): void {
  this.currentPreviewX = gridX;
  this.currentPreviewZ = gridZ;

  if (this.firstCorner) {
    this.updateSelectionBox(
      this.firstCorner.x, this.currentLevel, this.firstCorner.z,
      gridX, this.topLevel, gridZ
    );
  }
}
```

### Step 6: Click Second Corner

The second click completes the selection:

```typescript
handleClick(gridX: number, _gridY: number, gridZ: number): boolean {
  // ...
  } else {
    // Set second corner and complete selection
    this.secondCorner = new THREE.Vector3(gridX, this.topLevel, gridZ);
    this.completeSelection();
    return true;
  }
}
```

## Calculating Selection Bounds

The bounding box is defined by two corners with user-controlled Y range:

```typescript
getSelectionBounds(): SelectionBounds {
  return {
    minX: Math.min(this.firstCorner.x, this.secondCorner.x),
    minY: this.currentLevel,  // Bottom level (user-set)
    minZ: Math.min(this.firstCorner.z, this.secondCorner.z),
    maxX: Math.max(this.firstCorner.x, this.secondCorner.x),
    maxY: this.topLevel,      // Top level (user-set)
    maxZ: Math.max(this.firstCorner.z, this.secondCorner.z),
  };
}
```

### Example Bounds Calculation

```
First click at grid (2, _, 3) with currentLevel = 1
Move mouse to grid (5, _, 7)
Press ] twice to set topLevel = 3
Second click at grid (5, _, 7)

Result:
  minX = min(2, 5) = 2
  maxX = max(2, 5) = 5
  minY = 1 (currentLevel)
  maxY = 3 (topLevel)
  minZ = min(3, 7) = 3
  maxZ = max(3, 7) = 7

Selection box: 4×3×5 cells (X × Y × Z)
  - X range: 2, 3, 4, 5 (4 cells)
  - Y range: 1, 2, 3 (3 levels)
  - Z range: 3, 4, 5, 6, 7 (5 cells)
```

## Finding Blocks in Selection

### The Scanning Algorithm

The system iterates through every cell in the bounding box and checks if a block exists:

```typescript
getBlocksInSelection(bounds: SelectionBounds): PrefabBlockData[] {
  const blocks: PrefabBlockData[] = [];
  let minFoundX = Infinity;
  let minFoundY = Infinity;
  let minFoundZ = Infinity;

  // First pass: find all blocks
  const foundBlocks: Array<{ x: number; y: number; z: number; blockId: string }> = [];

  for (let x = bounds.minX; x <= bounds.maxX; x++) {
    for (let y = bounds.minY; y <= bounds.maxY; y++) {
      for (let z = bounds.minZ; z <= bounds.maxZ; z++) {
        const key = `${x},${y},${z}`;

        if (this.occupiedCells.has(key)) {
          const blockId = this.getBlockIdAt(x, y, z);
          if (blockId) {
            foundBlocks.push({ x, y, z, blockId });

            // Track minimum coordinates for normalization
            minFoundX = Math.min(minFoundX, x);
            minFoundY = Math.min(minFoundY, y);
            minFoundZ = Math.min(minFoundZ, z);
          }
        }
      }
    }
  }
  // ...
}
```

### Visual Representation

```
Selection bounds: X[2-5], Y[1-3], Z[3-7]

Scanning pattern (for each Y level):

Y=1:        Y=2:        Y=3:
  34567       34567       34567
2 □□□□□     2 □□□□□     2 □□□□□
3 □■□□□     3 □□□□□     3 □□□□□
4 □■■□□     4 □■□□□     4 □□□□□
5 □□□□□     5 □□□□□     5 □□□□□

□ = empty cell (not in occupiedCells)
■ = block found (added to foundBlocks)

Found blocks: (3,1,4), (3,1,5), (4,1,4), (4,2,4)
```

### Block ID Lookup

Each block has an ID indicating its type (color/material):

```typescript
// getBlockIdAt is passed in from PlacementSystem
private getBlockIdAt: (x: number, y: number, z: number) => string | null;

// PlacementSystem stores block IDs in a Map
cellBlockIds: Map<string, string>  // "x,y,z" -> "block_red"

// Example block IDs:
"block_red"
"block_blue"
"block_gray"
"block_green"
```

## Coordinate Normalization

### Why Normalize?

Prefabs need to be placement-agnostic. A structure built at (100, 5, 200) should be placeable at (0, 0, 0) or anywhere else.

### The Normalization Process

```typescript
getBlocksInSelection(bounds: SelectionBounds): PrefabBlockData[] {
  // ... (first pass finds blocks and tracks minimums)

  // Second pass: normalize coordinates
  for (const block of foundBlocks) {
    blocks.push({
      x: block.x - minFoundX,  // Relative to leftmost block
      y: block.y - minFoundY,  // Relative to lowest block
      z: block.z - minFoundZ,  // Relative to frontmost block
      blockId: block.blockId,
    });
  }

  return blocks;
}
```

### Normalization Example

```
Original block positions:
  (3, 1, 4) block_red
  (3, 1, 5) block_blue
  (4, 1, 4) block_red
  (4, 2, 4) block_gray

Minimum found: minX=3, minY=1, minZ=4

Normalized (subtract minimums):
  (3-3, 1-1, 4-4) = (0, 0, 0) block_red
  (3-3, 1-1, 5-4) = (0, 0, 1) block_blue
  (4-3, 1-1, 4-4) = (1, 0, 0) block_red
  (4-3, 2-1, 4-4) = (1, 1, 0) block_gray

Result: Prefab origin is at (0,0,0)
```

### Visual: Before and After Normalization

```
BEFORE (world coordinates):     AFTER (prefab coordinates):

    Z                               Z
    ↑                               ↑
  7 □□□□                          1 □■
  6 □□□□                          0 ■■ ← origin
  5 □■□□                            0 1 → X
  4 ■■□□    →  normalize  →
    3 4 5 6 → X                   (much simpler!)

    Y=1 shown                     Y=0 shown
```

## Data Storage

### PrefabBlockData Structure

Each block in a prefab:

```typescript
interface PrefabBlockData {
  x: number;      // 0-relative X position
  y: number;      // 0-relative Y position (height)
  z: number;      // 0-relative Z position
  blockId: string; // Block type ("block_red", etc.)
}
```

### PrefabData Structure (Full Prefab)

```typescript
interface PrefabData {
  id: number;                      // Database ID
  prefabId: string;                // Unique identifier (e.g., "prefab_abc123")
  name: string;                    // User-given name
  description: string;             // Optional description
  blocks: PrefabBlockData[];       // All blocks in the prefab
  category: PrefabCategory;        // "user-created" | "decorative" | etc.
  sortOrder: number;               // Display order in menu
  isActive: boolean;               // Enable/disable
  createdBy: string;               // Creator identifier
  metadata: Record<string, unknown>; // Extra data
}
```

### Example Saved Prefab

```json
{
  "id": 42,
  "prefabId": "prefab_tower_001",
  "name": "Small Tower",
  "description": "A 2x2 tower with window",
  "blocks": [
    { "x": 0, "y": 0, "z": 0, "blockId": "block_gray" },
    { "x": 1, "y": 0, "z": 0, "blockId": "block_gray" },
    { "x": 0, "y": 0, "z": 1, "blockId": "block_gray" },
    { "x": 1, "y": 0, "z": 1, "blockId": "block_gray" },
    { "x": 0, "y": 1, "z": 0, "blockId": "block_gray" },
    { "x": 1, "y": 1, "z": 0, "blockId": "block_blue" },
    { "x": 0, "y": 1, "z": 1, "blockId": "block_gray" },
    { "x": 1, "y": 1, "z": 1, "blockId": "block_gray" },
    { "x": 0, "y": 2, "z": 0, "blockId": "block_red" },
    { "x": 1, "y": 2, "z": 0, "blockId": "block_red" },
    { "x": 0, "y": 2, "z": 1, "blockId": "block_red" },
    { "x": 1, "y": 2, "z": 1, "blockId": "block_red" }
  ],
  "category": "user-created",
  "sortOrder": 100,
  "isActive": true,
  "createdBy": "player",
  "metadata": {}
}
```

### Visual of the Saved Prefab

```
Layer Y=2 (top):     Layer Y=1:          Layer Y=0 (bottom):
    Z                    Z                    Z
    ↑                    ↑                    ↑
  1 🟥🟥                1 ⬜🟦                1 ⬜⬜
  0 🟥🟥                0 ⬜⬜                0 ⬜⬜
    0 1 → X              0 1 → X              0 1 → X

🟥 = block_red
🟦 = block_blue (window)
⬜ = block_gray
```

## Storage Backends

### Primary: Strapi API

```typescript
async function savePrefabToStrapi(prefab: PrefabData): Promise<PrefabData | null> {
  const response = await fetch(`${STRAPI_URL}/api/prefabs`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ data: prefab }),
  });
  // ...
}
```

### Fallback: Local Storage

If Strapi is unavailable:

```typescript
function savePrefabLocally(prefab: PrefabData): void {
  const stored = localStorage.getItem("localPrefabs");
  const prefabs: PrefabData[] = stored ? JSON.parse(stored) : [];
  prefabs.push(prefab);
  localStorage.setItem("localPrefabs", JSON.stringify(prefabs));
}
```

### Loading Prefabs

On game start, both sources are checked:

```typescript
async function loadPrefabsFromAPI(): Promise<void> {
  // 1. Load from Strapi
  const apiPrefabs = await fetchFromStrapi();

  // 2. Load from localStorage
  const localPrefabs = loadFromLocalStorage();

  // 3. Merge and register all
  [...apiPrefabs, ...localPrefabs].forEach(prefab => {
    registerPrefab(convertToPrefabDefinition(prefab));
  });
}
```

## Visual Feedback Summary

| State | Visual |
|-------|--------|
| Before first click | Green grid plane at current Y level |
| After first click | Green wireframe at first corner |
| Mouse moving | Cyan wireframe box showing full selection |
| Level changed | Box height updates in real-time |
| Level display | UI shows "Capture Y: 0-5 (6h)" |

## Controls Reference

| Key | Before First Click | After First Click |
|-----|-------------------|-------------------|
| `[` | Lower starting level | Shrink selection height |
| `]` | Raise starting level | Expand selection height |
| Click | Set first corner | Complete selection |
| P | Exit capture mode | Exit capture mode |
| Escape | Cancel capture | Cancel capture |

## Data Flow Diagram

```
┌─────────────────────────────────────────────────────────────────┐
│                      User Actions                                │
│  P key → [ ] keys → Click → Mouse Move → [ ] keys → Click       │
└─────────────────────────────────────────────────────────────────┘
                                │
                                ▼
┌─────────────────────────────────────────────────────────────────┐
│                   PrefabCaptureSystem                            │
│                                                                 │
│  ┌──────────────┐    ┌──────────────┐    ┌──────────────┐      │
│  │ currentLevel │    │ firstCorner  │    │ secondCorner │      │
│  │ topLevel     │    │ (x, y, z)    │    │ (x, y, z)    │      │
│  └──────────────┘    └──────────────┘    └──────────────┘      │
│         │                   │                   │               │
│         └───────────────────┴───────────────────┘               │
│                             │                                   │
│                             ▼                                   │
│                   getSelectionBounds()                          │
│                   { minX, minY, minZ, maxX, maxY, maxZ }       │
│                             │                                   │
│                             ▼                                   │
│                   getBlocksInSelection()                        │
│                             │                                   │
│              ┌──────────────┴──────────────┐                   │
│              ▼                              ▼                   │
│     occupiedCells.has()            getBlockIdAt()              │
│     (check if block exists)        (get block type)            │
│              │                              │                   │
│              └──────────────┬──────────────┘                   │
│                             ▼                                   │
│                   Normalize Coordinates                         │
│                   (subtract minimums)                           │
│                             │                                   │
│                             ▼                                   │
│                   PrefabBlockData[]                             │
└─────────────────────────────────────────────────────────────────┘
                                │
                                ▼
┌─────────────────────────────────────────────────────────────────┐
│                      Save Modal                                  │
│  User enters: name, description, category                       │
└─────────────────────────────────────────────────────────────────┘
                                │
                                ▼
┌─────────────────────────────────────────────────────────────────┐
│                      Storage                                     │
│                                                                 │
│  ┌─────────────────┐         ┌─────────────────┐               │
│  │   Strapi API    │ ──or──▶ │  localStorage   │               │
│  │   (primary)     │         │   (fallback)    │               │
│  └─────────────────┘         └─────────────────┘               │
└─────────────────────────────────────────────────────────────────┘
```

## Related Files

- `src/structures/PrefabCaptureSystem.ts` - Selection and capture logic
- `src/structures/PrefabData.ts` - Data structures and API calls
- `src/structures/PrefabDefinition.ts` - Runtime prefab format
- `src/structures/PlacementSystem.ts` - Block storage (occupiedCells, cellBlockIds)
- `src/ui/UIManager.ts` - Save modal and UI feedback
- `src/core/EventBus.ts` - Event definitions
- `docs/grid-based-collision.md` - Grid system reference
