# Game Math: A Practical Guide

This document explains the mathematical concepts used in our grid-based 3D builder game. Each section breaks down the math with examples and visual explanations.

## Table of Contents

1. [Grid Systems and Coordinate Mapping](#grid-systems-and-coordinate-mapping)
2. [Raycasting and Plane Intersection](#raycasting-and-plane-intersection)
3. [2D Rotation in 3D Space](#2d-rotation-in-3d-space)
4. [Bounding Box Calculations](#bounding-box-calculations)
5. [Coordinate Normalization](#coordinate-normalization)
6. [Camera Perspective and Screen-to-World Conversion](#camera-perspective-and-screen-to-world-conversion)

---

## Grid Systems and Coordinate Mapping

### The Problem

We have a continuous 3D world (where positions can be any decimal number like 3.7, 12.456), but we want blocks to snap to a discrete grid (whole number positions like 3, 12).

### The Math

To convert a world position to a grid cell, we use **floor division**:

```
gridX = floor(worldX / cellSize)
gridZ = floor(worldZ / cellSize)
```

**Why `floor` and not `round`?**

- `floor` always rounds down, giving us the cell that *contains* the point
- `round` would give us the *nearest* cell, which could be the wrong one near cell boundaries

### Example

```
cellSize = 1
worldX = 2.7

floor(2.7 / 1) = floor(2.7) = 2  ✓ (point is in cell 2)
round(2.7 / 1) = round(2.7) = 3  ✗ (wrong cell!)
```

### Converting Back: Grid to World

To get the world position of a grid cell's center:

```
worldX = gridX * cellSize + cellSize / 2
worldZ = gridZ * cellSize + cellSize / 2
```

The `+ cellSize / 2` moves us from the cell's corner to its center.

```
Cell 2 with cellSize 1:
├─────────┤
0    0.5   1    1.5   2    2.5   3
     │                      │
   center                 center
   of 0                   of 2

gridX = 2
worldX = 2 * 1 + 0.5 = 2.5 (center of cell 2)
```

---

## Raycasting and Plane Intersection

### The Problem

When the user clicks on the screen, we need to figure out which grid cell they clicked on in 3D space.

### The Concept

A **ray** is a line that starts at a point and extends infinitely in one direction. We cast a ray from the camera through the mouse position and find where it hits our ground plane.

```
    Camera
       \
        \  ← Ray
         \
          \
───────────●─────────── Ground Plane (Y = 0)
           │
        Hit Point
```

### The Math

A ray is defined as:

```
Point(t) = Origin + t * Direction
```

Where `t` is how far along the ray we've traveled.

A plane is defined as:

```
Normal · Point + Distance = 0
```

For a horizontal ground plane at Y = 0:
- Normal = (0, 1, 0) — pointing up
- Distance = 0

To find intersection, we solve for `t`:

```
t = -(Normal · Origin + Distance) / (Normal · Direction)
```

Then plug `t` back to get the hit point.

### In Three.js

```javascript
const raycaster = new THREE.Raycaster();
raycaster.setFromCamera(mousePosition, camera);

const groundPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
const intersectPoint = new THREE.Vector3();

raycaster.ray.intersectPlane(groundPlane, intersectPoint);
// intersectPoint now contains the X, Y, Z where the ray hits the plane
```

### Why We Use Y=0 Regardless of Build Level

When building at higher levels, you might think we should move the plane up. But this causes problems:

```
Camera looking at angle:
         ●  Camera
          \
           \
            \   ← Same screen position
             \
──────────────●────── Y = 1 (hits here if plane at Y=1)
               \
────────────────●──── Y = 0 (hits here if plane at Y=0)
```

The same screen click maps to **different grid cells** depending on plane height! This feels wrong to the user. So we always raycast to Y=0 for consistent grid selection, then just render the preview at the correct height.

---

## 2D Rotation in 3D Space

### The Problem

We want to rotate prefabs (groups of blocks) by 90-degree increments while keeping them aligned to the grid.

### Why "2D" Rotation?

We're only rotating around the Y-axis (vertical), so the math is actually 2D rotation in the X-Z plane:

```
       Z
       │
       │    ○ Block
       │   /
       │  /
       │ /
       └─────────── X

Rotating around Y-axis = spinning this top-down view
```

### The Math

For a 90° clockwise rotation, the transformation is:

```
newX = -oldZ
newZ = oldX
```

Here's the full rotation formulas for our 4 orientations:

| Rotation | Angle | Formula |
|----------|-------|---------|
| 0 | 0° | (x, z) → (x, z) |
| 1 | 90° CW | (x, z) → (-z, x) |
| 2 | 180° | (x, z) → (-x, -z) |
| 3 | 270° CW | (x, z) → (z, -x) |

### Rotating Around a Center Point

If we just apply the rotation formula, blocks rotate around (0, 0). But we want them to rotate around the prefab's center so it "spins in place."

**Step 1: Translate to origin**
```
relX = x - centerX
relZ = z - centerZ
```

**Step 2: Apply rotation**
```
rotatedX = -relZ  (for 90° clockwise)
rotatedZ = relX
```

**Step 3: Translate back**
```
finalX = rotatedX + centerX
finalZ = rotatedZ + centerZ
```

### Example

Prefab with blocks at (0,0), (1,0), (2,0) — a horizontal line:

```
Before rotation:    After 90° CW rotation:

    Z                   Z
    │                   │
    │                   │ ○ (1,2)
    │                   │ ○ (1,1)
    └─○─○─○── X         │ ○ (1,0)
     0 1 2              └───── X
```

Calculation:
- Center = ((0+2)/2, (0+0)/2) = (1, 0)
- Block (0,0): rel=(-1,0) → rotated=(0,-1) → final=(0+1, -1+0) = (1,-1)
- Block (1,0): rel=(0,0) → rotated=(0,0) → final=(1,0)
- Block (2,0): rel=(1,0) → rotated=(0,1) → final=(1,1)

### Maintaining Grid Alignment

When the center has fractional values (like 1.5), the rotated coordinates might also be fractional. We round to the nearest integer to keep blocks on the grid:

```javascript
return {
  x: Math.round(rotatedX + centerX),
  z: Math.round(rotatedZ + centerZ),
};
```

---

## Bounding Box Calculations

### The Problem

We need to find the "bounds" of a prefab — the minimum and maximum coordinates in each dimension. This helps us find the center for rotation and check if placement is valid.

### The Math

For a set of blocks, iterate through all of them tracking min/max:

```javascript
let minX = Infinity, maxX = -Infinity;
let minZ = Infinity, maxZ = -Infinity;

for (const block of blocks) {
  minX = Math.min(minX, block.x);
  maxX = Math.max(maxX, block.x);
  minZ = Math.min(minZ, block.z);
  maxZ = Math.max(maxZ, block.z);
}
```

### Finding the Center

```javascript
centerX = (minX + maxX) / 2;
centerZ = (minZ + maxZ) / 2;
```

### Example

Blocks at: (0,0), (1,0), (2,0), (2,1), (2,2)

```
    Z
    2 │     ○
    1 │     ○
    0 │ ○ ○ ○
      └─────── X
        0 1 2
```

- minX = 0, maxX = 2
- minZ = 0, maxZ = 2
- centerX = (0 + 2) / 2 = 1
- centerZ = (0 + 2) / 2 = 1
- Width = maxX - minX + 1 = 3 blocks
- Depth = maxZ - minZ + 1 = 3 blocks

---

## Coordinate Normalization

### The Problem

When capturing blocks to save as a prefab, they might be placed anywhere in the world (like at position 47, 12, 89). We want to save them starting from (0, 0, 0) so they can be placed anywhere later.

### The Math

Find the minimum coordinates actually used by blocks, then subtract:

```javascript
// Find minimums
let minFoundX = Infinity, minFoundY = Infinity, minFoundZ = Infinity;
for (const block of blocks) {
  minFoundX = Math.min(minFoundX, block.x);
  minFoundY = Math.min(minFoundY, block.y);
  minFoundZ = Math.min(minFoundZ, block.z);
}

// Normalize
const normalizedBlocks = blocks.map(block => ({
  x: block.x - minFoundX,
  y: block.y - minFoundY,
  z: block.z - minFoundZ,
}));
```

### Example

Original blocks at: (47, 3, 89), (48, 3, 89), (48, 4, 89)

```
minFoundX = 47
minFoundY = 3
minFoundZ = 89

Normalized:
(47-47, 3-3, 89-89) = (0, 0, 0)
(48-47, 3-3, 89-89) = (1, 0, 0)
(48-47, 4-3, 89-89) = (1, 1, 0)
```

Now the prefab is stored as blocks at (0,0,0), (1,0,0), (1,1,0) — ready to be placed anywhere!

---

## Camera Perspective and Screen-to-World Conversion

### The Problem

A 2D mouse position (pixels on screen) needs to be converted to a 3D world position.

### Normalized Device Coordinates (NDC)

First, convert pixel coordinates to NDC (range -1 to +1):

```javascript
ndcX = (pixelX / screenWidth) * 2 - 1;
ndcY = -(pixelY / screenHeight) * 2 + 1;  // Note: Y is flipped!
```

Why the formulas work:
- `pixelX / screenWidth` gives 0 to 1
- `* 2` gives 0 to 2
- `- 1` gives -1 to +1

Y is negated because:
- Screen coordinates: Y increases downward (0 at top)
- 3D coordinates: Y increases upward

### Example

Screen is 800×600 pixels. Mouse at (600, 150):

```
ndcX = (600 / 800) * 2 - 1 = 0.75 * 2 - 1 = 0.5
ndcY = -(150 / 600) * 2 + 1 = -0.25 * 2 + 1 = 0.5

NDC position: (0.5, 0.5) — upper right quadrant
```

### From NDC to Ray

The camera's projection matrix maps 3D points to 2D screen. We need the inverse operation — Three.js handles this for us:

```javascript
const mouse = new THREE.Vector2(ndcX, ndcY);
const raycaster = new THREE.Raycaster();
raycaster.setFromCamera(mouse, camera);
// raycaster.ray now contains the ray from camera through mouse position
```

---

## Putting It All Together

Here's how these concepts combine when the user clicks to place a prefab:

1. **Screen to NDC**: Convert mouse pixels to -1..+1 range
2. **Raycast**: Create ray from camera, find where it hits Y=0 plane
3. **World to Grid**: `floor(hitPoint / cellSize)` to get grid cell
4. **Rotation**: Apply 2D rotation around prefab center
5. **Placement**: Position each block at `gridCell + rotatedOffset`

```
Mouse Click (400, 300)
        ↓
   NDC (0, 0)
        ↓
   Raycast → hits (5.7, 0, 8.2)
        ↓
   Grid cell (5, 8)
        ↓
   + Rotated block offsets
        ↓
   Final block positions
```

---

## Quick Reference

| Operation | Formula |
|-----------|---------|
| World → Grid | `grid = floor(world / cellSize)` |
| Grid → World (center) | `world = grid * cellSize + cellSize/2` |
| 90° CW rotation | `(x,z) → (-z, x)` |
| 180° rotation | `(x,z) → (-x, -z)` |
| 270° CW rotation | `(x,z) → (z, -x)` |
| Center of bounds | `center = (min + max) / 2` |
| Normalize coords | `normalized = coord - minFound` |
| Pixel → NDC | `ndc = (pixel / screen) * 2 - 1` |
