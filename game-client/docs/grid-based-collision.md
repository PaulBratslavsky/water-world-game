# Grid-Based 3D Collision System

This document explains the grid-based collision detection system used for first-person movement, including the jetpack mechanics and block collision.

## Overview

Instead of using a physics engine with rigid bodies, this game uses a **grid-based collision system**. This approach is ideal for voxel/block-based games because:

- **Blocks are axis-aligned**: All blocks sit on a uniform grid, no rotation
- **Simple physics needs**: No bouncing, friction, or complex forces
- **O(1) lookups**: Checking if a cell is occupied is a simple hash lookup
- **Memory efficient**: Only store occupied cells, not empty space

## Core Concepts

### World Space vs Grid Space

The world uses continuous coordinates (floats), but blocks exist on a discrete grid (integers).

```
World Position: (2.7, 1.3, 5.2)
     ↓ Convert using floor(position / cellSize)
Grid Position:  (2, 1, 5)
```

```typescript
// Converting world to grid coordinates
const gridX = Math.floor(worldX / cellSize);  // cellSize is typically 1
const gridY = Math.floor(worldY / cellSize);
const gridZ = Math.floor(worldZ / cellSize);
```

### Block Storage

Blocks are stored in a `Set<string>` using 3D keys:

```typescript
// Key format: "x,y,z"
occupiedCells.add("2,0,5");  // Block at grid position (2, 0, 5)
occupiedCells.add("2,1,5");  // Block stacked on top

// Check if occupied
occupiedCells.has("2,0,5");  // true
occupiedCells.has("3,0,5");  // false (empty)
```

This gives O(1) lookup time regardless of how many blocks exist.

### Block Geometry

Each block occupies one grid cell. A block at grid position `(x, y, z)` occupies the world space volume:

```
X: from x*cellSize to (x+1)*cellSize
Y: from y*cellSize to (y+1)*cellSize  (this is the "top" of the block)
Z: from z*cellSize to (z+1)*cellSize
```

For `cellSize = 1`:
- Block at grid `(2, 0, 5)` occupies world Y from `0` to `1`
- Block at grid `(2, 1, 5)` occupies world Y from `1` to `2`
- The "top" of a block at gridY is at world Y = `(gridY + 1) * cellSize`

## Collision Detection Methods

### 1. Point Collision (`checkCollision3D`)

Check if a single world point is inside a block:

```typescript
private checkCollision3D(x: number, y: number, z: number): boolean {
  const gridX = Math.floor(x / this.cellSize);
  const gridY = Math.floor(y / this.cellSize);
  const gridZ = Math.floor(z / this.cellSize);
  return this.collisionChecker3D(gridX, gridY, gridZ);
}
```

**Use case**: Checking if player's head hits a ceiling block.

### 2. Horizontal Collision (`checkHorizontalCollision`)

Check if moving to a position would collide with blocks at the player's body height:

```typescript
private checkHorizontalCollision(x: number, z: number, playerY: number): boolean {
  const gridX = Math.floor(x / this.cellSize);
  const gridZ = Math.floor(z / this.cellSize);

  // Player is ~1.7 units tall, check from feet to head
  const feetY = Math.floor(playerY / this.cellSize);
  const headY = Math.floor((playerY + 1.5) / this.cellSize);

  // Check all grid levels the player body occupies
  for (let y = feetY; y <= headY; y++) {
    if (this.collisionChecker3D(gridX, y, gridZ)) {
      return true;  // Collision!
    }
  }
  return false;
}
```

**Visual representation**:

```
Player at Y=2.0 (standing on block at gridY=1)

     HEAD ----→ ┌───┐  gridY=3: Check for collision
                │   │
     BODY       │ P │  gridY=2: Check for collision
                │   │
     FEET ----→ └───┘  gridY=2: Check for collision
                ═════  Block top at Y=2.0
                █████  Block at gridY=1
```

### 3. Ground Detection (`findGroundBetween`)

Find the highest block top between two Y positions. Used when falling to detect what to land on:

```typescript
private findGroundBetween(x: number, z: number, fromY: number, toY: number): number {
  const gridX = Math.floor(x / this.cellSize);
  const gridZ = Math.floor(z / this.cellSize);

  // Scan from high to low
  const highY = Math.max(fromY, toY);
  const lowY = Math.min(fromY, toY);

  const startGridY = Math.floor(highY / this.cellSize);
  const endGridY = Math.max(0, Math.floor(lowY / this.cellSize) - 1);

  // Find highest block whose top is at or below starting position
  for (let y = startGridY; y >= endGridY; y--) {
    if (this.collisionChecker3D(gridX, y, gridZ)) {
      const blockTop = (y + 1) * this.cellSize;
      if (blockTop <= fromY + 0.01) {  // Small epsilon for float comparison
        return blockTop;
      }
    }
  }
  return 0;  // No blocks found, ground is at Y=0
}
```

**Why scan between two positions?**

When falling at high speed, the player might move several units per frame. Without checking the range, they could "phase through" blocks:

```
Frame 1: Player at Y=5.0
         ↓ Falls 3 units this frame
Frame 2: Player at Y=2.0  ← Passed through block at Y=3-4!

With findGroundBetween(5.0, 2.0):
  - Checks gridY=5,4,3,2,1,0
  - Finds block at gridY=3 (top at Y=4)
  - Returns 4.0 as ground level
  - Player lands at Y=4.0 instead of falling through
```

## Movement Logic

### Horizontal Movement with Step-Up

Players can automatically step up onto blocks that are less than 0.6 units higher (about half a block):

```typescript
// In updateFirstPerson():
if (movement.length() > 0) {
  const nextX = this.fpPosition.x + movement.x;
  const nextZ = this.fpPosition.z + movement.z;

  const hasCollision = this.checkHorizontalCollision(nextX, nextZ, this.fpPosition.y);

  if (!hasCollision) {
    // No collision, move normally
    this.fpPosition.x = nextX;
    this.fpPosition.z = nextZ;
  } else {
    // Try stepping up
    const stepHeight = 0.6;
    const steppedY = this.fpPosition.y + stepHeight;
    const canStepUp = !this.checkHorizontalCollision(nextX, nextZ, steppedY);

    if (canStepUp) {
      // Find actual ground level at new position
      const newGroundLevel = this.findGroundAtPosition(nextX, nextZ, steppedY);
      if (newGroundLevel <= steppedY && newGroundLevel > this.fpPosition.y) {
        // Step up onto the block
        this.fpPosition.x = nextX;
        this.fpPosition.z = nextZ;
        this.fpPosition.y = newGroundLevel;
      }
    }
    // If can't step up, movement is blocked
  }
}
```

**Visual example**:

```
BLOCKED (block too tall):      STEP UP (block short enough):

  ████                           ┌───┐
  ████  ← 2 blocks tall          │ P │ → stepped up
  ████                           └───┘
  ════                           ═════
┌───┐                          ┌───┐
│ P │ → blocked                │   │ (was here)
└───┘                          └───┘
═════                          ═════
```

### Vertical Movement (Jetpack)

The jetpack has two modes:

#### Normal Mode (Space to thrust)
```typescript
if (this.inputManager.isActionActive("jetpackUp")) {
  this.velocityY = jetpackThrust;  // Instant upward velocity
} else {
  this.velocityY -= gravity * deltaTime;  // Gravity pulls down
}

// Clamp fall speed
if (this.velocityY < -maxFallSpeed) {
  this.velocityY = -maxFallSpeed;
}

// Apply velocity
const nextY = this.fpPosition.y + this.velocityY * deltaTime;
```

#### Hover Mode (H to toggle)
```typescript
if (this.isHoverMode) {
  // No gravity, direct control
  if (this.inputManager.isActionActive("jetpackUp")) {
    this.fpPosition.y += jetpackHoverSpeed * deltaTime;
  }
  if (this.inputManager.isActionActive("jetpackDown")) {
    this.fpPosition.y -= jetpackHoverSpeed * deltaTime;
  }
}
```

### Ceiling Collision

When moving upward, check if head would hit a block:

```typescript
if (this.velocityY > 0) {
  const headY = nextY + 1.7;  // Player height
  if (this.checkCollision3D(this.fpPosition.x, headY, this.fpPosition.z)) {
    this.velocityY = 0;  // Stop upward movement, don't update Y
  } else {
    this.fpPosition.y = nextY;
  }
}
```

### Landing Detection

When falling, find ground and land on it:

```typescript
if (this.velocityY <= 0) {  // Falling or stationary
  const groundLevel = this.findGroundBetween(
    this.fpPosition.x,
    this.fpPosition.z,
    this.fpPosition.y,  // From current position
    nextY               // To where we'd fall
  );

  if (nextY < groundLevel) {
    // Would fall through block - land on it instead
    this.fpPosition.y = groundLevel;
    this.velocityY = 0;
  } else {
    this.fpPosition.y = nextY;
  }
}
```

## Configuration

Default values in `CameraSystemConfig`:

```typescript
{
  // Movement
  firstPersonMoveSpeed: 5,     // Units per second
  firstPersonEyeHeight: 0.64,  // Camera offset from feet

  // Jetpack physics
  gravity: 15,                 // Downward acceleration
  jetpackThrust: 12,           // Upward velocity when thrusting
  jetpackHoverSpeed: 5,        // Vertical speed in hover mode
  maxFallSpeed: 20,            // Terminal velocity
}
```

## Data Flow Diagram

```
┌─────────────────────────────────────────────────────────────────┐
│                        Game Loop (60 FPS)                       │
└─────────────────────────────────────────────────────────────────┘
                                │
                                ▼
┌─────────────────────────────────────────────────────────────────┐
│                      Input Manager                               │
│  - Reads keyboard state                                         │
│  - Maps keys to actions (WASD, Space, Shift, H)                │
└─────────────────────────────────────────────────────────────────┘
                                │
                                ▼
┌─────────────────────────────────────────────────────────────────┐
│                   CameraSystem.updateFirstPerson()              │
│                                                                 │
│  1. Handle hover mode toggle (H key)                           │
│  2. Calculate movement direction from WASD                      │
│  3. Check horizontal collision → move or step-up               │
│  4. Apply jetpack thrust or gravity                            │
│  5. Check ceiling collision (moving up)                        │
│  6. Check ground collision (falling)                           │
│  7. Update camera position                                      │
└─────────────────────────────────────────────────────────────────┘
                                │
                    ┌───────────┴───────────┐
                    ▼                       ▼
┌───────────────────────────┐  ┌───────────────────────────┐
│   collisionChecker3D()    │  │    PlacementSystem        │
│   (passed from main.ts)   │  │    .occupiedCells         │
│                           │◄─│    Set<"x,y,z">           │
│   Returns true if         │  │                           │
│   block exists at         │  │    O(1) lookup            │
│   grid position           │  │                           │
└───────────────────────────┘  └───────────────────────────┘
```

## Key Insights

### Why Grid-Based Works Well

1. **Predictable geometry**: Every block is exactly `cellSize` units in each dimension
2. **Integer grid positions**: No floating-point accumulated errors
3. **Sparse storage**: Only occupied cells are stored, empty space is free
4. **Fast queries**: `Set.has()` is O(1) average case

### Limitations

1. **Axis-aligned only**: Can't have rotated blocks (use physics engine if needed)
2. **Uniform size**: All blocks must be the same size (or multiples)
3. **No physics forces**: No bouncing, pushing, or momentum transfer between objects

### When to Use Physics Engine Instead

Consider Rapier, Cannon-es, or Ammo.js if you need:
- Non-axis-aligned colliders (spheres, rotated boxes)
- Physics simulation (bouncing, stacking, falling objects)
- Complex collision shapes
- Multiple moving physics objects interacting

## Controls Reference

| Key | Action |
|-----|--------|
| W/A/S/D | Move horizontally |
| Space | Jetpack thrust (normal) / Move up (hover) |
| Shift | Move down (hover mode only) |
| H | Toggle hover mode |
| Mouse | Look around (when pointer locked) |

## Related Files

- `src/systems/CameraSystem.ts` - All collision and movement logic
- `src/core/InputManager.ts` - Key bindings and input handling
- `src/structures/PlacementSystem.ts` - Block storage (`occupiedCells`)
- `src/main.ts` - Connects collision checker to camera system
