import * as THREE from "three";
import { SceneConfig } from "../systems/SceneConfig";
import { PostProcessing, createEnhancedLighting } from "../systems/PostProcessing";
import { WaterSystem } from "../systems/WaterSystem";
import { SkySystem } from "../systems/SkySystem";
import { VisualPreset, getPreset } from "../systems/VisualPresets";
import { Character } from "../entities/Character";
import { PerformancePanel } from "../ui/PerformancePanel";
import { PARTICLES_CONFIG } from "../config/GameConfig";

export interface LightsObject {
  ambientLight: THREE.AmbientLight;
  hemisphereLight: THREE.HemisphereLight;
  directionalLight: THREE.DirectionalLight;
  fillLight: THREE.DirectionalLight;
  _baseIntensities?: {
    ambient: number;
    hemisphere: number;
    directional: number;
    fill: number;
  };
}

export interface LightingManagerConfig {
  scene: THREE.Scene;
  camera: THREE.Camera;
  renderer: THREE.WebGLRenderer;
  sceneConfig: SceneConfig;
}

export interface LightingManagerSystems {
  postProcessing?: PostProcessing | null;
  waterSystem?: WaterSystem | null;
  skySystem?: SkySystem | null;
  character?: Character | null;
  performancePanel?: PerformancePanel | null;
}

export class LightingManager {
  private scene: THREE.Scene;
  private camera: THREE.Camera;
  private renderer: THREE.WebGLRenderer;
  private sceneConfig: SceneConfig;

  // External systems (optional, set via setSystems)
  private postProcessing: PostProcessing | null = null;
  private waterSystem: WaterSystem | null = null;
  private skySystem: SkySystem | null = null;
  private character: Character | null = null;
  private performancePanel: PerformancePanel | null = null;

  // Lighting objects
  private lights: LightsObject | null = null;

  // Day/Night state
  private isNightMode = false;
  private wasNightModeBeforeBuild = false;
  private currentVisualPreset: VisualPreset = "default";

  // First-person lighting (flashlight effect)
  private firstPersonLight: THREE.SpotLight | null = null;
  private firstPersonAmbient: THREE.PointLight | null = null;
  private firstPersonParticles: THREE.Points | null = null;
  private firstPersonParticleVelocities: Float32Array | null = null;

  constructor(config: LightingManagerConfig) {
    this.scene = config.scene;
    this.camera = config.camera;
    this.renderer = config.renderer;
    this.sceneConfig = config.sceneConfig;
  }

  /**
   * Set optional external systems that lighting interacts with
   */
  setSystems(systems: LightingManagerSystems): void {
    if (systems.postProcessing !== undefined) this.postProcessing = systems.postProcessing;
    if (systems.waterSystem !== undefined) this.waterSystem = systems.waterSystem;
    if (systems.skySystem !== undefined) this.skySystem = systems.skySystem;
    if (systems.character !== undefined) this.character = systems.character;
    if (systems.performancePanel !== undefined) this.performancePanel = systems.performancePanel;
  }

  /**
   * Initialize scene lighting (call during game initialization)
   */
  createLighting(): LightsObject {
    this.lights = createEnhancedLighting(this.scene, this.renderer);
    return this.lights;
  }

  /**
   * Get the lights object
   */
  getLights(): LightsObject | null {
    return this.lights;
  }

  /**
   * Get the directional light (for sun direction sync)
   */
  getDirectionalLight(): THREE.DirectionalLight | null {
    return this.lights?.directionalLight || null;
  }

  /**
   * Get current visual preset name
   */
  getCurrentPreset(): VisualPreset {
    return this.currentVisualPreset;
  }

  /**
   * Check if night mode is active
   */
  isNight(): boolean {
    return this.isNightMode;
  }

  /**
   * Save night mode state before entering build mode
   */
  saveNightStateForBuild(): void {
    if (this.isNightMode) {
      this.wasNightModeBeforeBuild = true;
      this.isNightMode = false;
      this.applyDayMode();
      this.performancePanel?.setDayNightState(false);
    }
  }

  /**
   * Restore night mode state after exiting build mode
   */
  restoreNightStateAfterBuild(): void {
    if (this.wasNightModeBeforeBuild) {
      this.wasNightModeBeforeBuild = false;
      this.setNightMode(true);
      this.performancePanel?.setDayNightState(true);
    }
  }

  /**
   * Apply a visual preset (theme) to the entire scene
   */
  applyVisualPreset(presetName: VisualPreset): void {
    const preset = getPreset(presetName);
    this.currentVisualPreset = presetName;

    // If in night mode, apply night settings instead
    if (this.isNightMode) {
      this.applyNightMode();
      return;
    }

    // Update scene config (background, fog)
    this.sceneConfig.applySettings({
      backgroundColor: preset.scene.backgroundColor,
      fog: {
        enabled: true,
        color: preset.scene.fogColor,
        near: preset.scene.fogNear,
        far: preset.scene.fogFar,
      },
    });

    // Update lighting
    if (this.lights) {
      // Clear cached base intensities so brightness slider recalculates
      this.lights._baseIntensities = undefined;

      this.lights.ambientLight.color.setHex(preset.lighting.ambientColor);
      this.lights.ambientLight.intensity = preset.lighting.ambientIntensity;

      this.lights.hemisphereLight.color.setHex(preset.lighting.hemisphereColorSky);
      this.lights.hemisphereLight.groundColor.setHex(preset.lighting.hemisphereColorGround);
      this.lights.hemisphereLight.intensity = preset.lighting.hemisphereIntensity;

      this.lights.directionalLight.color.setHex(preset.lighting.directionalColor);
      this.lights.directionalLight.intensity = preset.lighting.directionalIntensity;

      this.lights.fillLight.color.setHex(preset.lighting.fillColor);
      this.lights.fillLight.intensity = preset.lighting.fillIntensity;
    }

    // Update water
    if (this.waterSystem) {
      this.waterSystem.setWaterColor(preset.water.color);
      this.waterSystem.setSunColor(preset.water.sunColor);
      this.waterSystem.setDistortionScale(preset.water.distortionScale);
      this.waterSystem.setAlpha(preset.water.alpha);
    }

    // Update sky
    if (this.skySystem) {
      this.skySystem.setZenithColor(preset.sky.zenithColor);
      this.skySystem.setHorizonColor(preset.sky.horizonColor);
      this.skySystem.setCloudColor(preset.sky.cloudColor);
      this.skySystem.setCloudOpacity(preset.sky.cloudOpacity);
      this.skySystem.setCloudSpeed(preset.sky.cloudSpeed);
      this.skySystem.setCloudDensity(preset.sky.cloudDensity);
      this.skySystem.setSunColor(preset.sky.sunColor);
      this.skySystem.setSunIntensity(preset.sky.sunIntensity);
    }

    // Update post-processing
    if (this.postProcessing) {
      this.postProcessing.setBloomStrength(preset.postProcessing.bloomStrength);
      this.postProcessing.setBloomRadius(preset.postProcessing.bloomRadius);
      this.postProcessing.setBloomThreshold(preset.postProcessing.bloomThreshold);
      this.postProcessing.setGreenTint(preset.postProcessing.greenTint);
      this.postProcessing.setBlueTint(preset.postProcessing.blueTint);
      this.postProcessing.setContrast(preset.postProcessing.contrast);
      this.postProcessing.setSaturation(preset.postProcessing.saturation);
      this.postProcessing.setColorChannels(
        preset.colorGrade.redReduce,
        preset.colorGrade.greenBoost,
        preset.colorGrade.blueReduce
      );
      this.renderer.toneMappingExposure = preset.postProcessing.exposure;

      // Apply retro/pixelation effect
      this.postProcessing.setRetroEnabled(preset.retro.enabled);
      if (preset.retro.enabled) {
        this.postProcessing.setRetroSettings({
          pixelSize: preset.retro.pixelSize,
          colorDepth: preset.retro.colorDepth,
          scanlineIntensity: preset.retro.scanlineIntensity,
          chromaticAberration: preset.retro.chromaticAberration,
        });
      }
    }

    console.log(`Applied visual preset: ${preset.name}`);
  }

  /**
   * Set global brightness multiplier for all lights
   */
  setGlobalBrightness(brightness: number): void {
    if (!this.lights) return;

    // Store base intensities on first call
    if (!this.lights._baseIntensities) {
      this.lights._baseIntensities = {
        ambient: this.lights.ambientLight.intensity,
        hemisphere: this.lights.hemisphereLight.intensity,
        directional: this.lights.directionalLight.intensity,
        fill: this.lights.fillLight.intensity,
      };
    }

    const base = this.lights._baseIntensities;

    // Apply brightness multiplier to all lights
    this.lights.ambientLight.intensity = base.ambient * brightness;
    this.lights.hemisphereLight.intensity = base.hemisphere * brightness;
    this.lights.directionalLight.intensity = base.directional * brightness;
    this.lights.fillLight.intensity = base.fill * brightness;

    // Also adjust exposure for overall scene brightness
    if (this.postProcessing) {
      this.renderer.toneMappingExposure = brightness;
    }
  }

  /**
   * Toggle night mode - completely resets scene to day or night settings
   */
  setNightMode(isNight: boolean): void {
    this.isNightMode = isNight;

    if (isNight) {
      this.applyNightMode();
    } else {
      this.applyDayMode();
    }

    // Clear cached base intensities so brightness slider recalculates
    if (this.lights) {
      this.lights._baseIntensities = undefined;
    }
  }

  /**
   * Apply full day mode settings - resets everything to daytime
   */
  private applyDayMode(): void {
    const preset = getPreset(this.currentVisualPreset);

    // === FIRST: Remove all night mode objects (lights, particles) ===
    // Remove character torch light and fog particles
    this.character?.setLightEnabled(false);
    // Remove first-person flashlight and particles
    this.removeFirstPersonLight();

    // === SKY ===
    if (this.skySystem) {
      this.skySystem.setZenithColor(preset.sky.zenithColor);
      this.skySystem.setHorizonColor(preset.sky.horizonColor);
      this.skySystem.setCloudColor(preset.sky.cloudColor);
      this.skySystem.setCloudOpacity(preset.sky.cloudOpacity);
      this.skySystem.setCloudSpeed(preset.sky.cloudSpeed);
      this.skySystem.setCloudDensity(preset.sky.cloudDensity);
      this.skySystem.setSunColor(preset.sky.sunColor);
      this.skySystem.setSunIntensity(preset.sky.sunIntensity);
    }

    // === FOG & BACKGROUND ===
    this.sceneConfig.applySettings({
      backgroundColor: preset.scene.backgroundColor,
      fog: {
        enabled: true,
        color: preset.scene.fogColor,
        near: preset.scene.fogNear,
        far: preset.scene.fogFar,
      },
    });

    // === LIGHTING ===
    if (this.lights) {
      this.lights.ambientLight.color.setHex(preset.lighting.ambientColor);
      this.lights.ambientLight.intensity = preset.lighting.ambientIntensity;
      this.lights.hemisphereLight.color.setHex(preset.lighting.hemisphereColorSky);
      this.lights.hemisphereLight.groundColor.setHex(preset.lighting.hemisphereColorGround);
      this.lights.hemisphereLight.intensity = preset.lighting.hemisphereIntensity;
      this.lights.directionalLight.color.setHex(preset.lighting.directionalColor);
      this.lights.directionalLight.intensity = preset.lighting.directionalIntensity;
      this.lights.fillLight.color.setHex(preset.lighting.fillColor);
      this.lights.fillLight.intensity = preset.lighting.fillIntensity;
    }

    // === EXPOSURE ===
    this.renderer.toneMappingExposure = preset.postProcessing.exposure;

    // === POST-PROCESSING - Reset ALL settings ===
    if (this.postProcessing) {
      // First, completely disable retro pass
      this.postProcessing.setRetroEnabled(false);

      // Reset bloom
      this.postProcessing.setBloomStrength(preset.postProcessing.bloomStrength);
      this.postProcessing.setBloomRadius(preset.postProcessing.bloomRadius);
      this.postProcessing.setBloomThreshold(preset.postProcessing.bloomThreshold);

      // Reset color grading
      this.postProcessing.setGreenTint(preset.postProcessing.greenTint);
      this.postProcessing.setBlueTint(preset.postProcessing.blueTint);
      this.postProcessing.setContrast(preset.postProcessing.contrast);
      this.postProcessing.setSaturation(preset.postProcessing.saturation);
      this.postProcessing.setColorChannels(
        preset.colorGrade.redReduce,
        preset.colorGrade.greenBoost,
        preset.colorGrade.blueReduce
      );

      // Reset retro shader uniforms to preset defaults (even while disabled)
      this.postProcessing.setRetroSettings({
        pixelSize: preset.retro.pixelSize,
        colorDepth: preset.retro.colorDepth,
        scanlineIntensity: preset.retro.scanlineIntensity,
        chromaticAberration: preset.retro.chromaticAberration,
      });
      // Vignette to 0 (no edge darkening in day mode)
      this.postProcessing.setVignetteIntensity(0.0);

      // Only enable retro if preset specifically wants it (e.g., Tron)
      if (preset.retro.enabled) {
        this.postProcessing.setRetroEnabled(true);
      }
    }

    // === RESET BRIGHTNESS TO DEFAULT ===
    // Clear any cached base intensities (will be recalculated from current preset values)
    if (this.lights) {
      this.lights._baseIntensities = undefined;
    }
    // Reset brightness slider to 1.0
    this.performancePanel?.setBrightness(1.0);

    // === UPDATE UI ===
    this.performancePanel?.setRetroState(preset.retro.enabled);
  }

  /**
   * Apply full night mode settings - dark atmosphere with player torch
   */
  private applyNightMode(): void {
    const preset = getPreset(this.currentVisualPreset);
    const night = preset.night;

    // === SKY - Dark ===
    if (this.skySystem) {
      this.skySystem.setZenithColor(night.skyZenithColor);
      this.skySystem.setHorizonColor(night.skyHorizonColor);
      this.skySystem.setSunIntensity(0.05);
      this.skySystem.setCloudOpacity(0.2);
      this.skySystem.setCloudColor(night.skyHorizonColor);
    }

    // === FOG - Dense and dark ===
    this.sceneConfig.applySettings({
      backgroundColor: night.fogColor,
      fog: {
        enabled: true,
        color: night.fogColor,
        near: night.fogNear,
        far: night.fogFar,
      },
    });

    // === LIGHTING - Dimmed ===
    if (this.lights) {
      this.lights.ambientLight.intensity = night.ambientIntensity;
      this.lights.ambientLight.color.setHex(night.ambientColor);
      this.lights.hemisphereLight.intensity = night.ambientIntensity * 1.2;
      this.lights.hemisphereLight.color.setHex(night.ambientColor);
      this.lights.hemisphereLight.groundColor.setHex(night.fogColor);
      this.lights.directionalLight.intensity = night.directionalIntensity;
      this.lights.directionalLight.color.setHex(night.directionalColor);
      this.lights.fillLight.intensity = night.ambientIntensity * 0.5;
    }

    // === EXPOSURE - Lower for horror atmosphere ===
    this.renderer.toneMappingExposure = 0.8;

    // === POST-PROCESSING - Vignette effect ===
    if (this.postProcessing) {
      this.postProcessing.setRetroEnabled(true);
      this.postProcessing.setVignetteIntensity(0.6);
    }

    // === PLAYER LIGHTS - ON ===
    this.character?.setLightEnabled(true, {
      color: night.playerLightColor,
      intensity: night.playerLightIntensity,
      distance: night.playerLightDistance,
    });
    this.createFirstPersonLight(night.playerLightColor, night.playerLightIntensity, night.playerLightDistance);

    // === UPDATE UI ===
    this.performancePanel?.setRetroState(true);
  }

  /**
   * Create first-person flashlight attached to camera
   */
  createFirstPersonLight(color: number, intensity: number, distance: number): void {
    // Remove existing lights
    this.removeFirstPersonLight();

    // Create spotlight for flashlight beam
    this.firstPersonLight = new THREE.SpotLight(color, intensity * 1.5, distance * 1.2, Math.PI / 5, 0.4, 1.0);
    this.firstPersonLight.position.set(0, 0, 0);
    this.camera.add(this.firstPersonLight);
    this.camera.add(this.firstPersonLight.target);
    this.firstPersonLight.target.position.set(0, -0.5, -10); // Point forward and slightly down

    // Create small ambient light for immediate area
    this.firstPersonAmbient = new THREE.PointLight(color, intensity * 0.3, distance * 0.4, 1.0);
    this.firstPersonAmbient.position.set(0, 0, 0);
    this.camera.add(this.firstPersonAmbient);

    // Create fog particles for first-person view
    this.createFirstPersonParticles(color, distance);

    // Make sure camera is in scene
    if (!this.camera.parent) {
      this.scene.add(this.camera);
    }
  }

  /**
   * Create fog particles for first-person flashlight
   */
  private createFirstPersonParticles(color: number, distance: number): void {
    const particleCount = PARTICLES_CONFIG.count;
    const positions = new Float32Array(particleCount * 3);
    this.firstPersonParticleVelocities = new Float32Array(particleCount * 3);

    // Distribute particles in front of camera in a cone shape
    for (let i = 0; i < particleCount; i++) {
      const t = Math.random();
      const z = -(t * distance * 0.8 + 1); // Negative Z is forward
      const radius = Math.abs(z) * 0.3;
      const angle = Math.random() * Math.PI * 2;

      positions[i * 3] = Math.cos(angle) * radius * Math.random();
      positions[i * 3 + 1] = Math.sin(angle) * radius * Math.random() - 0.2;
      positions[i * 3 + 2] = z;

      // Random drift velocities
      this.firstPersonParticleVelocities[i * 3] = (Math.random() - 0.5) * 0.015;
      this.firstPersonParticleVelocities[i * 3 + 1] = (Math.random() - 0.5) * 0.012;
      this.firstPersonParticleVelocities[i * 3 + 2] = (Math.random() - 0.5) * 0.008;
    }

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));

    const material = new THREE.PointsMaterial({
      color: color,
      size: PARTICLES_CONFIG.size,
      transparent: true,
      opacity: PARTICLES_CONFIG.opacity,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      sizeAttenuation: true,
    });

    this.firstPersonParticles = new THREE.Points(geometry, material);
    this.camera.add(this.firstPersonParticles);
  }

  /**
   * Update night mode particles based on camera mode (call in game loop)
   * Handles switching between first-person and third-person particle systems
   */
  updateNightParticles(deltaTime: number, cameraMode: string): void {
    if (!this.isNightMode) {
      // Day mode - ensure all fog particles are hidden
      if (this.firstPersonParticles) {
        this.firstPersonParticles.visible = false;
      }
      return;
    }

    // Night mode - show appropriate particles based on camera mode
    if (cameraMode === "first-person") {
      // First-person: show first-person particles, update them
      this.updateFirstPersonParticles(deltaTime);
      if (this.firstPersonParticles) {
        this.firstPersonParticles.visible = true;
      }
    } else {
      // Third-person: show character's fog particles, hide first-person particles
      this.character?.updateFogParticles(deltaTime);
      if (this.firstPersonParticles) {
        this.firstPersonParticles.visible = false;
      }
    }
  }

  /**
   * Update first-person fog particles (internal use)
   */
  private updateFirstPersonParticles(deltaTime: number): void {
    if (!this.firstPersonParticles || !this.firstPersonParticleVelocities) return;

    const positions = this.firstPersonParticles.geometry.attributes.position as THREE.BufferAttribute;
    const count = positions.count;

    for (let i = 0; i < count; i++) {
      // Update position with velocity
      positions.array[i * 3] += this.firstPersonParticleVelocities[i * 3] * deltaTime * 60;
      positions.array[i * 3 + 1] += this.firstPersonParticleVelocities[i * 3 + 1] * deltaTime * 60;
      positions.array[i * 3 + 2] += this.firstPersonParticleVelocities[i * 3 + 2] * deltaTime * 60;

      const x = positions.array[i * 3];
      const y = positions.array[i * 3 + 1];
      const z = positions.array[i * 3 + 2];

      // Reset if particle drifts too far
      const dist = Math.sqrt(x * x + y * y);
      const maxRadius = Math.abs(z) * PARTICLES_CONFIG.maxConeRadius;

      if (dist > maxRadius || z > PARTICLES_CONFIG.maxZ || z < PARTICLES_CONFIG.minZ) {
        const t = Math.random();
        const newZ = -(t * 15 + 1);
        const radius = Math.abs(newZ) * 0.25 * Math.random();
        const angle = Math.random() * Math.PI * 2;

        positions.array[i * 3] = Math.cos(angle) * radius;
        positions.array[i * 3 + 1] = Math.sin(angle) * radius - 0.2;
        positions.array[i * 3 + 2] = newZ;
      }
    }

    positions.needsUpdate = true;
  }

  /**
   * Remove first-person lights and particles
   */
  removeFirstPersonLight(): void {
    if (this.firstPersonLight) {
      this.camera.remove(this.firstPersonLight.target);
      this.camera.remove(this.firstPersonLight);
      this.firstPersonLight.dispose();
      this.firstPersonLight = null;
    }
    if (this.firstPersonAmbient) {
      this.camera.remove(this.firstPersonAmbient);
      this.firstPersonAmbient.dispose();
      this.firstPersonAmbient = null;
    }
    if (this.firstPersonParticles) {
      this.camera.remove(this.firstPersonParticles);
      this.firstPersonParticles.geometry.dispose();
      (this.firstPersonParticles.material as THREE.Material).dispose();
      this.firstPersonParticles = null;
      this.firstPersonParticleVelocities = null;
    }
  }

  /**
   * Clean up all resources
   */
  dispose(): void {
    this.removeFirstPersonLight();
  }
}
