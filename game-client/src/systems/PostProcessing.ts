import * as THREE from "three";
import { EffectComposer } from "three/addons/postprocessing/EffectComposer.js";
import { RenderPass } from "three/addons/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/addons/postprocessing/UnrealBloomPass.js";
import { ShaderPass } from "three/addons/postprocessing/ShaderPass.js";
import { OutputPass } from "three/addons/postprocessing/OutputPass.js";

// Retro pixelation shader with scanlines and color banding
const RetroShader = {
  uniforms: {
    tDiffuse: { value: null },
    resolution: { value: new THREE.Vector2(320, 240) }, // Target pixel resolution
    pixelSize: { value: 4.0 },           // Size of each "pixel"
    colorDepth: { value: 32.0 },         // Color levels per channel (lower = more banding)
    scanlineIntensity: { value: 0.15 },  // Scanline darkness
    scanlineCount: { value: 240.0 },     // Number of scanlines
    vignetteIntensity: { value: 0.3 },   // Edge darkening
    noiseIntensity: { value: 0.02 },     // Film grain
    time: { value: 0 },                  // For noise animation
    chromaticAberration: { value: 0.002 }, // RGB split
  },
  vertexShader: `
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `,
  fragmentShader: `
    uniform sampler2D tDiffuse;
    uniform vec2 resolution;
    uniform float pixelSize;
    uniform float colorDepth;
    uniform float scanlineIntensity;
    uniform float scanlineCount;
    uniform float vignetteIntensity;
    uniform float noiseIntensity;
    uniform float time;
    uniform float chromaticAberration;

    varying vec2 vUv;

    // Simple noise function
    float rand(vec2 co) {
      return fract(sin(dot(co.xy, vec2(12.9898, 78.233))) * 43758.5453);
    }

    void main() {
      vec2 uv = vUv;

      // Pixelation - snap to grid
      vec2 pixelUv = floor(uv * resolution / pixelSize) * pixelSize / resolution;

      // Chromatic aberration (RGB split)
      float aberration = chromaticAberration;
      float r = texture2D(tDiffuse, pixelUv + vec2(aberration, 0.0)).r;
      float g = texture2D(tDiffuse, pixelUv).g;
      float b = texture2D(tDiffuse, pixelUv - vec2(aberration, 0.0)).b;
      vec3 color = vec3(r, g, b);

      // Color quantization (reduce color depth for banding effect)
      color = floor(color * colorDepth) / colorDepth;

      // Scanlines
      float scanline = sin(uv.y * scanlineCount * 3.14159) * 0.5 + 0.5;
      scanline = pow(scanline, 1.5);
      color *= 1.0 - (scanlineIntensity * (1.0 - scanline));

      // Vignette (darken edges)
      vec2 vignetteUv = uv * (1.0 - uv.yx);
      float vignette = vignetteUv.x * vignetteUv.y * 15.0;
      vignette = pow(vignette, vignetteIntensity);
      color *= vignette;

      // Film grain noise
      float noise = rand(uv + time) * noiseIntensity;
      color += noise - noiseIntensity * 0.5;

      // Slight brightness boost to compensate for darkening effects
      color *= 1.1;

      gl_FragColor = vec4(clamp(color, 0.0, 1.0), 1.0);
    }
  `,
};

// Color grading LUT shader - supports green (Matrix) and blue (Tron) tints
const ColorGradeShader = {
  uniforms: {
    tDiffuse: { value: null },
    greenTint: { value: 0.3 },        // How much to shift towards green
    blueTint: { value: 0.0 },         // How much to shift towards blue
    greenBoost: { value: 1.15 },      // Multiply green channel
    redReduce: { value: 0.9 },        // Reduce red channel
    blueBoost: { value: 0.85 },       // Multiply blue channel (was blueReduce)
    contrast: { value: 1.1 },         // Contrast adjustment
    brightness: { value: 0.0 },       // Brightness offset
    saturation: { value: 1.0 },       // Color saturation
  },
  vertexShader: `
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `,
  fragmentShader: `
    uniform sampler2D tDiffuse;
    uniform float greenTint;
    uniform float blueTint;
    uniform float greenBoost;
    uniform float redReduce;
    uniform float blueBoost;
    uniform float contrast;
    uniform float brightness;
    uniform float saturation;

    varying vec2 vUv;

    void main() {
      vec4 color = texture2D(tDiffuse, vUv);

      // Calculate luminance for tinting
      float luminance = dot(color.rgb, vec3(0.299, 0.587, 0.114));

      // Apply color channel adjustments
      vec3 adjusted = vec3(
        color.r * redReduce,
        color.g * greenBoost,
        color.b * blueBoost
      );

      // Blend original with adjusted based on tint amounts
      color.rgb = mix(color.rgb, adjusted, max(greenTint, blueTint));

      // Add green to shadows/midtones for Matrix look
      float shadowAmount = 1.0 - luminance;
      if (greenTint > 0.0) {
        color.rgb += vec3(-0.02, 0.04, -0.02) * shadowAmount * greenTint;
      }

      // Add blue to shadows/midtones for Tron look
      if (blueTint > 0.0) {
        color.rgb += vec3(-0.03, 0.0, 0.06) * shadowAmount * blueTint;
        // Add cyan glow to highlights for neon effect
        float highlightAmount = smoothstep(0.5, 1.0, luminance);
        color.rgb += vec3(0.0, 0.03, 0.06) * highlightAmount * blueTint;
      }

      // Contrast adjustment (around midpoint 0.5)
      color.rgb = (color.rgb - 0.5) * contrast + 0.5;

      // Brightness
      color.rgb += brightness;

      // Saturation adjustment
      vec3 gray = vec3(luminance);
      color.rgb = mix(gray, color.rgb, saturation);

      // Clamp to valid range
      color.rgb = clamp(color.rgb, 0.0, 1.0);

      gl_FragColor = color;
    }
  `,
};

export interface PostProcessingConfig {
  bloom?: {
    enabled?: boolean;
    strength?: number;
    radius?: number;
    threshold?: number;
  };
  toneMapping?: {
    enabled?: boolean;
    exposure?: number;
    type?: THREE.ToneMapping;
  };
  colorGrade?: {
    enabled?: boolean;
    greenTint?: number;
    blueTint?: number;
    contrast?: number;
    saturation?: number;
  };
  retro?: {
    enabled?: boolean;
    pixelSize?: number;      // 1-8, higher = more pixelated
    colorDepth?: number;     // 8-256, lower = more color banding
    scanlineIntensity?: number; // 0-0.5
    chromaticAberration?: number; // 0-0.01
  };
}

const DEFAULT_CONFIG: PostProcessingConfig = {
  bloom: {
    enabled: true,
    strength: 0.6,
    radius: 0.5,
    threshold: 0.5,
  },
  toneMapping: {
    enabled: true,
    exposure: 1.0,
    type: THREE.ACESFilmicToneMapping,
  },
  colorGrade: {
    enabled: true,
    greenTint: 0.0,
    blueTint: 0.0,
    contrast: 1.0,
    saturation: 1.0,
  },
  retro: {
    enabled: false,
    pixelSize: 3,
    colorDepth: 32,
    scanlineIntensity: 0.12,
    chromaticAberration: 0.002,
  },
};

export class PostProcessing {
  private composer: EffectComposer;
  private renderPass: RenderPass;
  private bloomPass: UnrealBloomPass;
  private colorGradePass: ShaderPass;
  private retroPass: ShaderPass;
  private outputPass: OutputPass;
  private renderer: THREE.WebGLRenderer;
  private config: PostProcessingConfig;
  private enabled = true;

  constructor(
    renderer: THREE.WebGLRenderer,
    scene: THREE.Scene,
    camera: THREE.Camera,
    config: PostProcessingConfig = {}
  ) {
    this.renderer = renderer;
    this.config = {
      bloom: { ...DEFAULT_CONFIG.bloom, ...config.bloom },
      toneMapping: { ...DEFAULT_CONFIG.toneMapping, ...config.toneMapping },
      colorGrade: { ...DEFAULT_CONFIG.colorGrade, ...config.colorGrade },
      retro: { ...DEFAULT_CONFIG.retro, ...config.retro },
    };

    // Apply tone mapping to renderer
    if (this.config.toneMapping?.enabled) {
      renderer.toneMapping = this.config.toneMapping.type || THREE.ACESFilmicToneMapping;
      renderer.toneMappingExposure = this.config.toneMapping.exposure || 1.0;
    }

    // Set output color space for better colors
    renderer.outputColorSpace = THREE.SRGBColorSpace;

    // Create composer
    this.composer = new EffectComposer(renderer);

    // Render pass - renders the scene normally
    this.renderPass = new RenderPass(scene, camera);
    this.composer.addPass(this.renderPass);

    // Bloom pass - makes bright things glow (green glow for Matrix)
    const size = renderer.getSize(new THREE.Vector2());
    this.bloomPass = new UnrealBloomPass(
      size,
      this.config.bloom?.strength || 0.6,
      this.config.bloom?.radius || 0.5,
      this.config.bloom?.threshold || 0.7
    );
    this.bloomPass.enabled = this.config.bloom?.enabled ?? true;
    this.composer.addPass(this.bloomPass);

    // Color grading pass - supports green (Matrix) and blue (Tron) tints
    this.colorGradePass = new ShaderPass(ColorGradeShader);
    this.colorGradePass.uniforms.greenTint.value = this.config.colorGrade?.greenTint || 0.0;
    this.colorGradePass.uniforms.blueTint.value = this.config.colorGrade?.blueTint || 0.0;
    this.colorGradePass.uniforms.contrast.value = this.config.colorGrade?.contrast || 1.0;
    this.colorGradePass.uniforms.saturation.value = this.config.colorGrade?.saturation || 1.0;
    this.colorGradePass.enabled = this.config.colorGrade?.enabled ?? true;
    this.composer.addPass(this.colorGradePass);

    // Retro pixelation pass - CRT/retro game effect
    this.retroPass = new ShaderPass(RetroShader);
    this.retroPass.uniforms.resolution.value.set(window.innerWidth, window.innerHeight);
    this.retroPass.uniforms.pixelSize.value = this.config.retro?.pixelSize || 3;
    this.retroPass.uniforms.colorDepth.value = this.config.retro?.colorDepth || 32;
    this.retroPass.uniforms.scanlineIntensity.value = this.config.retro?.scanlineIntensity || 0.12;
    this.retroPass.uniforms.chromaticAberration.value = this.config.retro?.chromaticAberration || 0.002;
    this.retroPass.enabled = this.config.retro?.enabled ?? false;
    this.composer.addPass(this.retroPass);

    // Output pass - handles color space conversion
    this.outputPass = new OutputPass();
    this.composer.addPass(this.outputPass);
  }

  render(): void {
    if (this.enabled) {
      // Update time for retro noise animation
      if (this.retroPass.enabled) {
        this.retroPass.uniforms.time.value = performance.now() * 0.001;
      }
      this.composer.render();
    } else {
      // Fallback to regular rendering
      const scene = this.renderPass.scene;
      const camera = this.renderPass.camera;
      this.renderer.render(scene, camera);
    }
  }

  setEnabled(enabled: boolean): void {
    this.enabled = enabled;
  }

  isEnabled(): boolean {
    return this.enabled;
  }

  // Bloom controls
  setBloomEnabled(enabled: boolean): void {
    this.bloomPass.enabled = enabled;
  }

  setBloomStrength(strength: number): void {
    this.bloomPass.strength = strength;
  }

  setBloomRadius(radius: number): void {
    this.bloomPass.radius = radius;
  }

  setBloomThreshold(threshold: number): void {
    this.bloomPass.threshold = threshold;
  }

  // Color grading controls
  setColorGradeEnabled(enabled: boolean): void {
    this.colorGradePass.enabled = enabled;
  }

  setGreenTint(intensity: number): void {
    this.colorGradePass.uniforms.greenTint.value = intensity;
  }

  setBlueTint(intensity: number): void {
    this.colorGradePass.uniforms.blueTint.value = intensity;
  }

  setContrast(contrast: number): void {
    this.colorGradePass.uniforms.contrast.value = contrast;
  }

  setSaturation(saturation: number): void {
    this.colorGradePass.uniforms.saturation.value = saturation;
  }

  setColorChannels(redReduce: number, greenBoost: number, blueReduce: number): void {
    this.colorGradePass.uniforms.redReduce.value = redReduce;
    this.colorGradePass.uniforms.greenBoost.value = greenBoost;
    this.colorGradePass.uniforms.blueReduce.value = blueReduce;
  }

  // Retro effect controls
  setRetroEnabled(enabled: boolean): void {
    this.retroPass.enabled = enabled;
  }

  isRetroEnabled(): boolean {
    return this.retroPass.enabled;
  }

  setPixelSize(size: number): void {
    this.retroPass.uniforms.pixelSize.value = Math.max(1, Math.min(8, size));
  }

  setColorDepth(depth: number): void {
    this.retroPass.uniforms.colorDepth.value = Math.max(4, Math.min(256, depth));
  }

  setScanlineIntensity(intensity: number): void {
    this.retroPass.uniforms.scanlineIntensity.value = Math.max(0, Math.min(0.5, intensity));
  }

  setChromaticAberration(amount: number): void {
    this.retroPass.uniforms.chromaticAberration.value = Math.max(0, Math.min(0.02, amount));
  }

  setRetroSettings(settings: {
    pixelSize?: number;
    colorDepth?: number;
    scanlineIntensity?: number;
    chromaticAberration?: number;
  }): void {
    if (settings.pixelSize !== undefined) this.setPixelSize(settings.pixelSize);
    if (settings.colorDepth !== undefined) this.setColorDepth(settings.colorDepth);
    if (settings.scanlineIntensity !== undefined) this.setScanlineIntensity(settings.scanlineIntensity);
    if (settings.chromaticAberration !== undefined) this.setChromaticAberration(settings.chromaticAberration);
  }

  // Tone mapping
  setToneMappingExposure(exposure: number): void {
    this.renderer.toneMappingExposure = exposure;
  }

  setToneMapping(type: THREE.ToneMapping): void {
    this.renderer.toneMapping = type;
  }

  onResize(width: number, height: number): void {
    this.composer.setSize(width, height);
    this.retroPass.uniforms.resolution.value.set(width, height);
  }

  getBloomSettings(): { strength: number; radius: number; threshold: number } {
    return {
      strength: this.bloomPass.strength,
      radius: this.bloomPass.radius,
      threshold: this.bloomPass.threshold,
    };
  }

  getColorGradeSettings(): {
    enabled: boolean;
    greenTint: number;
    contrast: number;
    saturation: number;
  } {
    return {
      enabled: this.colorGradePass.enabled,
      greenTint: this.colorGradePass.uniforms.greenTint.value,
      contrast: this.colorGradePass.uniforms.contrast.value,
      saturation: this.colorGradePass.uniforms.saturation.value,
    };
  }

  dispose(): void {
    this.composer.dispose();
  }
}

export function createEnhancedLighting(
  scene: THREE.Scene,
  renderer?: THREE.WebGLRenderer
): {
  ambientLight: THREE.AmbientLight;
  hemisphereLight: THREE.HemisphereLight;
  directionalLight: THREE.DirectionalLight;
  fillLight: THREE.DirectionalLight;
} {
  // Create environment map for metallic reflections if renderer provided
  // This is crucial for MeshStandardMaterial with metalness > 0
  if (renderer) {
    const pmremGenerator = new THREE.PMREMGenerator(renderer);
    pmremGenerator.compileEquirectangularShader();

    // Create a richer environment for better reflections
    const envScene = new THREE.Scene();

    // Use a gradient background color for the environment
    envScene.background = new THREE.Color(0x88aacc);

    // Add multiple lights to create interesting reflections
    // Sky light (from above)
    const envSkyLight = new THREE.DirectionalLight(0xffffff, 0.8);
    envSkyLight.position.set(0, 1, 0);
    envScene.add(envSkyLight);

    // Warm light from one side (simulates sun)
    const envSunLight = new THREE.DirectionalLight(0xffffee, 0.6);
    envSunLight.position.set(1, 0.5, 0.5);
    envScene.add(envSunLight);

    // Cool fill from opposite side
    const envFillLight = new THREE.DirectionalLight(0xaaccff, 0.4);
    envFillLight.position.set(-1, 0.3, -0.5);
    envScene.add(envFillLight);

    // Ground bounce light
    const envGroundLight = new THREE.DirectionalLight(0x445544, 0.3);
    envGroundLight.position.set(0, -1, 0);
    envScene.add(envGroundLight);

    // Hemisphere for overall gradient
    const envHemi = new THREE.HemisphereLight(0x88aacc, 0x445544, 0.5);
    envScene.add(envHemi);

    // Ambient fill
    const envAmbient = new THREE.AmbientLight(0x666666, 0.5);
    envScene.add(envAmbient);

    // Generate environment map
    const envMap = pmremGenerator.fromScene(envScene, 0.04).texture;
    pmremGenerator.dispose();

    // Set scene environment for all PBR materials (metallic reflections)
    scene.environment = envMap;
  }

  // === CINEMATIC 3-POINT LIGHTING ===
  // Key:Fill:Back ratio approximately 1 : 0.5 : 0.25
  // Creates depth, dimension, and visual interest

  // Ambient - very low, just to prevent pure black shadows
  const ambientLight = new THREE.AmbientLight(0x222233, 0.3);
  scene.add(ambientLight);

  // Hemisphere - subtle environmental fill
  const hemisphereLight = new THREE.HemisphereLight(
    0x6688aa, // Sky color (cool blue)
    0x443322, // Ground color (warm shadow)
    0.4
  );
  scene.add(hemisphereLight);

  // KEY LIGHT - Main light source, brightest, warm color
  // Position: Upper front-right (classic 45° angle)
  const directionalLight = new THREE.DirectionalLight(0xfff5e6, 1.5);
  directionalLight.position.set(60, 100, 40);
  directionalLight.castShadow = false;
  scene.add(directionalLight);

  // FILL LIGHT - Opposite side of key, cooler color, ~50% of key intensity
  // Softens shadows without eliminating them
  const fillLight = new THREE.DirectionalLight(0xaabbdd, 0.7);
  fillLight.position.set(-50, 40, 30);
  scene.add(fillLight);

  // BACK/RIM LIGHT - Behind subject, creates edge separation
  // ~25% of key intensity, slightly warm
  const backLight = new THREE.DirectionalLight(0xffeedd, 0.5);
  backLight.position.set(-10, 50, -70);
  scene.add(backLight);

  // KICKER - Secondary rim light from opposite side for more dimension
  const kickerLight = new THREE.DirectionalLight(0xddddff, 0.3);
  kickerLight.position.set(40, 30, -50);
  scene.add(kickerLight);

  return { ambientLight, hemisphereLight, directionalLight, fillLight };
}

export function configureRendererForQuality(
  renderer: THREE.WebGLRenderer,
  quality: "low" | "medium" | "high"
): void {
  switch (quality) {
    case "low":
      renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1));
      renderer.toneMapping = THREE.NoToneMapping;
      break;
    case "medium":
      renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
      renderer.toneMapping = THREE.LinearToneMapping;
      renderer.toneMappingExposure = 1.0;
      break;
    case "high":
      renderer.setPixelRatio(window.devicePixelRatio);
      renderer.toneMapping = THREE.ACESFilmicToneMapping;
      renderer.toneMappingExposure = 1.0;
      break;
  }
}
