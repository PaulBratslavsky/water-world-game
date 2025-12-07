import * as THREE from "three";

/**
 * SceneConfig - Centralized scene configuration
 *
 * Handles fog, background, and other scene-level settings.
 * Easy to customize and extend.
 */

export interface FogConfig {
  enabled: boolean;
  color: number;
  near: number; // Distance where fog starts
  far: number; // Distance where fog fully obscures
}

export interface SceneSettings {
  backgroundColor: number;
  fog: FogConfig;
}

const DEFAULT_SETTINGS: SceneSettings = {
  backgroundColor: 0x2a3a2a, // Lighter green-gray
  fog: {
    enabled: true,
    color: 0x3a4a3a, // Lighter green fog
    near: 80,
    far: 250,
  },
};

export class SceneConfig {
  private scene: THREE.Scene;
  private renderer: THREE.WebGLRenderer;
  private settings: SceneSettings;

  constructor(
    scene: THREE.Scene,
    renderer: THREE.WebGLRenderer,
    settings: Partial<SceneSettings> = {}
  ) {
    this.scene = scene;
    this.renderer = renderer;
    this.settings = { ...DEFAULT_SETTINGS, ...settings };

    // Merge fog settings if partially provided
    if (settings.fog) {
      this.settings.fog = { ...DEFAULT_SETTINGS.fog, ...settings.fog };
    }

    this.applySettingsInternal();
  }

  private applySettingsInternal(): void {
    // Background color
    this.renderer.setClearColor(this.settings.backgroundColor);

    // Fog
    if (this.settings.fog.enabled) {
      this.scene.fog = new THREE.Fog(
        this.settings.fog.color,
        this.settings.fog.near,
        this.settings.fog.far
      );
    } else {
      this.scene.fog = null;
    }
  }

  // Update fog settings at runtime
  setFog(config: Partial<FogConfig>): void {
    this.settings.fog = { ...this.settings.fog, ...config };
    this.applySettingsInternal();
  }

  // Toggle fog on/off
  toggleFog(enabled?: boolean): void {
    this.settings.fog.enabled = enabled ?? !this.settings.fog.enabled;
    this.applySettingsInternal();
  }

  // Update background color
  setBackgroundColor(color: number): void {
    this.settings.backgroundColor = color;
    this.renderer.setClearColor(color);
  }

  // Get current settings
  getSettings(): SceneSettings {
    return { ...this.settings };
  }

  // Apply full settings update (for presets)
  applySettings(settings: Partial<SceneSettings>): void {
    if (settings.backgroundColor !== undefined) {
      this.settings.backgroundColor = settings.backgroundColor;
    }
    if (settings.fog) {
      this.settings.fog = { ...this.settings.fog, ...settings.fog };
    }
    this.applySettingsInternal();
  }
}
