import * as THREE from "three";

/**
 * QualityManager - Automatically detects GPU performance and adjusts quality settings
 *
 * Runs a quick benchmark at startup to determine optimal settings for the user's hardware.
 */

export type QualityLevel = "low" | "medium" | "high" | "ultra";

export interface QualitySettings {
  level: QualityLevel;
  useGreedyMeshing: boolean;
  renderDistance: number;
  shadowsEnabled: boolean;
  antialias: boolean;
  pixelRatio: number;
  maxLights: number;
}

// Preset configurations for each quality level
const QUALITY_PRESETS: Record<QualityLevel, QualitySettings> = {
  low: {
    level: "low",
    useGreedyMeshing: true,
    renderDistance: 2,
    shadowsEnabled: false,
    antialias: false,
    pixelRatio: 1,
    maxLights: 2,
  },
  medium: {
    level: "medium",
    useGreedyMeshing: true,
    renderDistance: 3,
    shadowsEnabled: false,
    antialias: true,
    pixelRatio: Math.min(window.devicePixelRatio, 1.5),
    maxLights: 4,
  },
  high: {
    level: "high",
    useGreedyMeshing: false,
    renderDistance: 4,
    shadowsEnabled: true,
    antialias: true,
    pixelRatio: Math.min(window.devicePixelRatio, 2),
    maxLights: 8,
  },
  ultra: {
    level: "ultra",
    useGreedyMeshing: false,
    renderDistance: 5,
    shadowsEnabled: true,
    antialias: true,
    pixelRatio: window.devicePixelRatio,
    maxLights: 16,
  },
};

export class QualityManager {
  private currentSettings: QualitySettings;
  private benchmarkComplete: boolean = false;
  private gpuInfo: string = "Unknown";

  constructor() {
    // Start with medium as default until benchmark runs
    this.currentSettings = { ...QUALITY_PRESETS.medium };
  }

  /**
   * Get GPU information from WebGL context
   */
  detectGPU(renderer: THREE.WebGLRenderer): string {
    const gl = renderer.getContext();
    const debugInfo = gl.getExtension("WEBGL_debug_renderer_info");

    if (debugInfo) {
      this.gpuInfo = gl.getParameter(debugInfo.UNMASKED_RENDERER_WEBGL);
    } else {
      this.gpuInfo = "Unknown (WebGL debug info not available)";
    }

    return this.gpuInfo;
  }

  /**
   * Run a performance benchmark to determine optimal quality settings
   * Creates a test scene with many objects and measures FPS
   */
  async runBenchmark(renderer: THREE.WebGLRenderer): Promise<QualitySettings> {
    console.log("Running GPU benchmark...");

    // Detect GPU first
    this.detectGPU(renderer);
    console.log(`Detected GPU: ${this.gpuInfo}`);

    // Create a test scene
    const testScene = new THREE.Scene();
    const testCamera = new THREE.PerspectiveCamera(60, 1, 0.1, 1000);
    testCamera.position.set(0, 50, 100);
    testCamera.lookAt(0, 0, 0);

    // Add lighting
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.5);
    testScene.add(ambientLight);

    const directionalLight = new THREE.DirectionalLight(0xffffff, 0.8);
    directionalLight.position.set(50, 100, 50);
    testScene.add(directionalLight);

    // Create many test cubes to stress the GPU
    const testGeometry = new THREE.BoxGeometry(1, 1, 1);
    const testMaterials: THREE.MeshStandardMaterial[] = [];
    const testMeshes: THREE.Mesh[] = [];

    // Create 1000 cubes in a grid
    const gridSize = 10;
    const spacing = 2;

    for (let x = 0; x < gridSize; x++) {
      for (let y = 0; y < gridSize; y++) {
        for (let z = 0; z < gridSize; z++) {
          const material = new THREE.MeshStandardMaterial({
            color: new THREE.Color().setHSL(Math.random(), 0.7, 0.5),
            roughness: 0.7,
            metalness: 0.3,
          });
          testMaterials.push(material);

          const mesh = new THREE.Mesh(testGeometry, material);
          mesh.position.set(
            (x - gridSize / 2) * spacing,
            (y - gridSize / 2) * spacing,
            (z - gridSize / 2) * spacing
          );
          testScene.add(mesh);
          testMeshes.push(mesh);
        }
      }
    }

    // Run benchmark - measure FPS over multiple frames
    const benchmarkFrames = 60;
    const frameTimes: number[] = [];

    await new Promise<void>((resolve) => {
      let frameCount = 0;
      let lastTime = performance.now();

      const benchmarkLoop = () => {
        const now = performance.now();
        const deltaTime = now - lastTime;
        lastTime = now;

        // Rotate camera around the scene for varied rendering
        const angle = (frameCount / benchmarkFrames) * Math.PI * 2;
        testCamera.position.x = Math.sin(angle) * 100;
        testCamera.position.z = Math.cos(angle) * 100;
        testCamera.lookAt(0, 0, 0);

        // Render the test scene
        renderer.render(testScene, testCamera);

        frameTimes.push(deltaTime);
        frameCount++;

        if (frameCount < benchmarkFrames) {
          requestAnimationFrame(benchmarkLoop);
        } else {
          resolve();
        }
      };

      requestAnimationFrame(benchmarkLoop);
    });

    // Clean up test scene
    testGeometry.dispose();
    testMaterials.forEach(m => m.dispose());
    testMeshes.forEach(m => testScene.remove(m));

    // Calculate average FPS (skip first few frames for warmup)
    const warmupFrames = 5;
    const validFrameTimes = frameTimes.slice(warmupFrames);
    const avgFrameTime = validFrameTimes.reduce((a, b) => a + b, 0) / validFrameTimes.length;
    const avgFPS = 1000 / avgFrameTime;

    console.log(`Benchmark complete: ${avgFPS.toFixed(1)} FPS average`);

    // Determine quality level based on FPS
    let qualityLevel: QualityLevel;

    if (avgFPS >= 120) {
      qualityLevel = "ultra";
      console.log("GPU Performance: Excellent - using Ultra quality");
    } else if (avgFPS >= 60) {
      qualityLevel = "high";
      console.log("GPU Performance: Good - using High quality");
    } else if (avgFPS >= 35) {
      qualityLevel = "medium";
      console.log("GPU Performance: Moderate - using Medium quality");
    } else {
      qualityLevel = "low";
      console.log("GPU Performance: Limited - using Low quality");
    }

    this.currentSettings = { ...QUALITY_PRESETS[qualityLevel] };
    this.benchmarkComplete = true;

    return this.currentSettings;
  }

  /**
   * Quick benchmark that takes less time (for impatient users)
   */
  async runQuickBenchmark(renderer: THREE.WebGLRenderer): Promise<QualitySettings> {
    console.log("Running quick GPU benchmark...");

    this.detectGPU(renderer);

    // Create minimal test scene
    const testScene = new THREE.Scene();
    const testCamera = new THREE.PerspectiveCamera(60, 1, 0.1, 1000);
    testCamera.position.set(0, 30, 50);
    testCamera.lookAt(0, 0, 0);

    const ambientLight = new THREE.AmbientLight(0xffffff, 0.6);
    testScene.add(ambientLight);

    // Create 500 cubes using instancing for a fair test
    const testGeometry = new THREE.BoxGeometry(1, 1, 1);
    const testMaterial = new THREE.MeshStandardMaterial({ color: 0x4488ff });
    const instancedMesh = new THREE.InstancedMesh(testGeometry, testMaterial, 500);

    const matrix = new THREE.Matrix4();
    for (let i = 0; i < 500; i++) {
      matrix.setPosition(
        (Math.random() - 0.5) * 40,
        (Math.random() - 0.5) * 40,
        (Math.random() - 0.5) * 40
      );
      instancedMesh.setMatrixAt(i, matrix);
    }
    testScene.add(instancedMesh);

    // Measure 30 frames
    const frameTimes: number[] = [];

    await new Promise<void>((resolve) => {
      let frameCount = 0;
      let lastTime = performance.now();

      const loop = () => {
        const now = performance.now();
        frameTimes.push(now - lastTime);
        lastTime = now;

        // Rotate for varied rendering
        instancedMesh.rotation.y += 0.05;
        renderer.render(testScene, testCamera);

        frameCount++;
        if (frameCount < 30) {
          requestAnimationFrame(loop);
        } else {
          resolve();
        }
      };

      requestAnimationFrame(loop);
    });

    // Clean up
    testGeometry.dispose();
    testMaterial.dispose();
    instancedMesh.dispose();

    // Calculate FPS
    const validTimes = frameTimes.slice(3); // Skip warmup
    const avgFrameTime = validTimes.reduce((a, b) => a + b, 0) / validTimes.length;
    const avgFPS = 1000 / avgFrameTime;

    console.log(`Quick benchmark: ${avgFPS.toFixed(1)} FPS`);

    // Determine quality
    let qualityLevel: QualityLevel;
    if (avgFPS >= 100) {
      qualityLevel = "ultra";
    } else if (avgFPS >= 55) {
      qualityLevel = "high";
    } else if (avgFPS >= 30) {
      qualityLevel = "medium";
    } else {
      qualityLevel = "low";
    }

    console.log(`Auto-selected quality: ${qualityLevel}`);
    this.currentSettings = { ...QUALITY_PRESETS[qualityLevel] };
    this.benchmarkComplete = true;
    this.lastBenchmarkFPS = avgFPS;

    return this.currentSettings;
  }

  /**
   * Get last benchmark FPS result
   */
  getLastBenchmarkFPS(): number {
    return this.lastBenchmarkFPS;
  }

  private lastBenchmarkFPS: number = 0;

  /**
   * Get current quality settings
   */
  getSettings(): QualitySettings {
    return { ...this.currentSettings };
  }

  /**
   * Manually set quality level
   */
  setQualityLevel(level: QualityLevel): QualitySettings {
    this.currentSettings = { ...QUALITY_PRESETS[level] };
    return this.currentSettings;
  }

  /**
   * Get detected GPU info
   */
  getGPUInfo(): string {
    return this.gpuInfo;
  }

  /**
   * Check if benchmark has been run
   */
  isBenchmarkComplete(): boolean {
    return this.benchmarkComplete;
  }

  /**
   * Get all available quality presets
   */
  static getPresets(): Record<QualityLevel, QualitySettings> {
    return { ...QUALITY_PRESETS };
  }
}
