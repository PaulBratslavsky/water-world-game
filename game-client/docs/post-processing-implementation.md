# Post-Processing Implementation Guide

## Overview

This document covers the post-processing system added to enhance the visual quality of the game. The system uses Three.js's EffectComposer to apply real-time effects like bloom, tone mapping, and improved lighting.

## Architecture

### PostProcessing Class

Location: `src/systems/PostProcessing.ts`

The `PostProcessing` class wraps Three.js's EffectComposer and provides a clean API for managing render effects.

```typescript
import { PostProcessing, createEnhancedLighting } from "./systems/PostProcessing";

// Initialize post-processing
const postProcessing = new PostProcessing(renderer, scene, camera, {
  bloom: {
    enabled: true,
    strength: 0.35,
    radius: 0.4,
    threshold: 0.8,
  },
  toneMapping: {
    enabled: true,
    exposure: 1.0,
    type: THREE.ACESFilmicToneMapping,
  },
});

// In render loop
postProcessing.render();
```

### Render Pipeline

The post-processing pipeline consists of three passes:

1. **RenderPass** - Renders the scene normally to a framebuffer
2. **UnrealBloomPass** - Applies bloom effect to bright areas
3. **OutputPass** - Handles color space conversion for final output

```
Scene → RenderPass → BloomPass → OutputPass → Screen
```

## Effects

### Bloom

Bloom creates a glow effect around bright objects, simulating how real cameras capture intense light sources.

**Parameters:**
- `strength` (0.35): Intensity of the bloom effect
- `radius` (0.4): How far the bloom spreads
- `threshold` (0.8): Brightness level above which bloom is applied

```typescript
// Adjust bloom at runtime
postProcessing.setBloomStrength(0.5);
postProcessing.setBloomRadius(0.6);
postProcessing.setBloomThreshold(0.7);
postProcessing.setBloomEnabled(true);
```

### Tone Mapping

Tone mapping converts HDR (High Dynamic Range) colors to displayable LDR (Low Dynamic Range) while preserving visual detail.

**Available Types:**
- `THREE.NoToneMapping` - No conversion (fastest)
- `THREE.LinearToneMapping` - Simple linear conversion
- `THREE.ReinhardToneMapping` - Soft highlights
- `THREE.CineonToneMapping` - Film-like response
- `THREE.ACESFilmicToneMapping` - Industry standard cinematic look (default)

```typescript
// Configure tone mapping
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.0;

// Adjust exposure at runtime
postProcessing.setToneMappingExposure(1.2);
```

## Enhanced Lighting

The `createEnhancedLighting()` function sets up a professional lighting rig:

```typescript
const lights = createEnhancedLighting(scene);
// Returns: { ambientLight, hemisphereLight, directionalLight, fillLight }
```

### Light Setup

| Light Type | Color | Intensity | Purpose |
|------------|-------|-----------|---------|
| Ambient | 0x404050 | 0.3 | Base illumination |
| Hemisphere | Sky: 0x87ceeb, Ground: 0x3d5c5c | 0.6 | Natural outdoor gradient |
| Directional | 0xfff5e6 (warm) | 1.0 | Sun-like key light |
| Fill | 0xb4c8e0 (cool) | 0.3 | Reduces harsh shadows |

### Hemisphere Light

The hemisphere light creates a gradient between sky and ground colors, simulating natural outdoor lighting where light bounces off the ground.

```typescript
const hemisphereLight = new THREE.HemisphereLight(
  0x87ceeb, // Sky color (light blue)
  0x3d5c5c, // Ground color (dark green-gray)
  0.6       // Intensity
);
```

### Three-Point Lighting Concept

The lighting follows a simplified three-point setup:
1. **Key Light** (Directional) - Main light source, warm sun color
2. **Fill Light** (Directional) - Opposite side, cool blue to reduce shadows
3. **Ambient/Hemisphere** - Overall scene illumination

## Quality Levels

Post-processing automatically adjusts based on quality settings:

### Low Quality
- Bloom: **Disabled**
- Tone Mapping: **None**
- Best for older hardware

### Medium Quality
- Bloom: **Enabled** (strength: 0.2)
- Tone Mapping: **Linear**
- Balanced performance/quality

### High Quality
- Bloom: **Enabled** (strength: 0.35)
- Tone Mapping: **ACES Filmic**
- Full visual fidelity

```typescript
// Quality change handler
performancePanel.setQualityChangeHandler((level) => {
  switch (level) {
    case "low":
      postProcessing.setBloomEnabled(false);
      renderer.toneMapping = THREE.NoToneMapping;
      break;
    case "medium":
      postProcessing.setBloomEnabled(true);
      postProcessing.setBloomStrength(0.2);
      renderer.toneMapping = THREE.LinearToneMapping;
      break;
    case "high":
      postProcessing.setBloomEnabled(true);
      postProcessing.setBloomStrength(0.35);
      renderer.toneMapping = THREE.ACESFilmicToneMapping;
      break;
  }
});
```

## Renderer Configuration

The renderer is configured for optimal visual quality:

```typescript
const renderer = new THREE.WebGLRenderer({
  antialias: true,
  powerPreference: "high-performance",
});
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2)); // Cap at 2x
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.0;
```

### Key Settings

| Setting | Value | Purpose |
|---------|-------|---------|
| `antialias` | true | Smooth edges |
| `powerPreference` | "high-performance" | Use dedicated GPU |
| `pixelRatio` | min(devicePixelRatio, 2) | Balance quality/performance |
| `outputColorSpace` | SRGBColorSpace | Correct color display |
| `toneMapping` | ACESFilmicToneMapping | Cinematic colors |

## Window Resize Handling

Always update the composer when the window resizes:

```typescript
window.addEventListener("resize", () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
  postProcessing.onResize(window.innerWidth, window.innerHeight);
});
```

## Scene Configuration

The scene background and fog were updated to complement the new lighting:

```typescript
// SceneConfig defaults
const settings = {
  backgroundColor: 0x1a1a2e, // Deep blue-purple sky
  fog: {
    enabled: true,
    color: 0x1a1a2e,
    near: 50,
    far: 150,
  },
};
```

## Performance Considerations

### Memory
- EffectComposer creates additional render targets
- Each pass adds memory overhead
- Dispose when not needed: `postProcessing.dispose()`

### GPU
- Bloom is the most expensive effect
- Lower `radius` reduces blur samples
- Higher `threshold` means fewer pixels processed

### Tips
1. Cap pixel ratio at 2x for high-DPI displays
2. Disable bloom on low-end devices
3. Use `powerPreference: "high-performance"` to prefer dedicated GPUs
4. Consider disabling post-processing entirely in "low" quality mode

## API Reference

### PostProcessing

```typescript
class PostProcessing {
  constructor(
    renderer: WebGLRenderer,
    scene: Scene,
    camera: Camera,
    config?: PostProcessingConfig
  );

  render(): void;
  setEnabled(enabled: boolean): void;
  isEnabled(): boolean;

  // Bloom controls
  setBloomEnabled(enabled: boolean): void;
  setBloomStrength(strength: number): void;
  setBloomRadius(radius: number): void;
  setBloomThreshold(threshold: number): void;
  getBloomSettings(): { strength, radius, threshold };

  // Tone mapping
  setToneMappingExposure(exposure: number): void;
  setToneMapping(type: ToneMapping): void;

  // Lifecycle
  onResize(width: number, height: number): void;
  dispose(): void;
}
```

### createEnhancedLighting

```typescript
function createEnhancedLighting(scene: Scene): {
  ambientLight: AmbientLight;
  hemisphereLight: HemisphereLight;
  directionalLight: DirectionalLight;
  fillLight: DirectionalLight;
};
```

### configureRendererForQuality

```typescript
function configureRendererForQuality(
  renderer: WebGLRenderer,
  quality: "low" | "medium" | "high"
): void;
```

## Files Modified

- `src/systems/PostProcessing.ts` - New post-processing system
- `src/systems/SceneConfig.ts` - Updated background/fog colors
- `src/main.ts` - Integrated post-processing and enhanced lighting
