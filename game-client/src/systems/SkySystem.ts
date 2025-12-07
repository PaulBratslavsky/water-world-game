import * as THREE from "three";

/**
 * SkySystem - Procedural sky with animated clouds
 *
 * Creates a sky dome with gradient colors and animated volumetric clouds.
 * Integrates with visual presets for theming.
 */

export interface SkyConfig {
  // Sky gradient colors
  zenithColor: number; // Color at the top of the sky
  horizonColor: number; // Color at the horizon
  // Cloud settings
  cloudColor: number;
  cloudOpacity: number;
  cloudSpeed: number;
  cloudDensity: number;
  cloudScale: number;
  // Sun/atmosphere
  sunColor: number;
  sunIntensity: number;
}

const DEFAULT_CONFIG: SkyConfig = {
  zenithColor: 0x0077be, // Deep blue
  horizonColor: 0x87ceeb, // Light sky blue
  cloudColor: 0xffffff,
  cloudOpacity: 0.8,
  cloudSpeed: 0.02,
  cloudDensity: 0.5,
  cloudScale: 1.0,
  sunColor: 0xffffee,
  sunIntensity: 1.0,
};

// Sky gradient shader
const SkyShader = {
  uniforms: {
    zenithColor: { value: new THREE.Color(0x0077be) },
    horizonColor: { value: new THREE.Color(0x87ceeb) },
    sunColor: { value: new THREE.Color(0xffffee) },
    sunDirection: { value: new THREE.Vector3(0.5, 0.5, 0.5) },
    sunIntensity: { value: 1.0 },
  },
  vertexShader: `
    varying vec3 vWorldPosition;
    varying vec3 vNormal;

    void main() {
      vec4 worldPosition = modelMatrix * vec4(position, 1.0);
      vWorldPosition = worldPosition.xyz;
      vNormal = normalize(normalMatrix * normal);
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `,
  fragmentShader: `
    uniform vec3 zenithColor;
    uniform vec3 horizonColor;
    uniform vec3 sunColor;
    uniform vec3 sunDirection;
    uniform float sunIntensity;

    varying vec3 vWorldPosition;
    varying vec3 vNormal;

    void main() {
      // Calculate height factor (0 at horizon, 1 at zenith)
      vec3 direction = normalize(vWorldPosition);
      float heightFactor = max(0.0, direction.y);

      // Smooth the gradient with a power curve
      float smoothHeight = pow(heightFactor, 0.5);

      // Blend between horizon and zenith colors
      vec3 skyColor = mix(horizonColor, zenithColor, smoothHeight);

      // Add sun glow
      float sunDot = max(0.0, dot(direction, normalize(sunDirection)));
      float sunGlow = pow(sunDot, 32.0) * sunIntensity;
      float sunHalo = pow(sunDot, 4.0) * 0.3 * sunIntensity;

      skyColor += sunColor * (sunGlow + sunHalo);

      gl_FragColor = vec4(skyColor, 1.0);
    }
  `,
};

// Cloud shader with animated noise
const CloudShader = {
  uniforms: {
    time: { value: 0 },
    cloudColor: { value: new THREE.Color(0xffffff) },
    cloudOpacity: { value: 0.8 },
    cloudDensity: { value: 0.5 },
    cloudScale: { value: 1.0 },
    horizonColor: { value: new THREE.Color(0x87ceeb) },
  },
  vertexShader: `
    varying vec2 vUv;
    varying vec3 vWorldPosition;

    void main() {
      vUv = uv;
      vec4 worldPosition = modelMatrix * vec4(position, 1.0);
      vWorldPosition = worldPosition.xyz;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `,
  fragmentShader: `
    uniform float time;
    uniform vec3 cloudColor;
    uniform float cloudOpacity;
    uniform float cloudDensity;
    uniform float cloudScale;
    uniform vec3 horizonColor;

    varying vec2 vUv;
    varying vec3 vWorldPosition;

    // Simplex noise functions
    vec3 mod289(vec3 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
    vec2 mod289(vec2 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
    vec3 permute(vec3 x) { return mod289(((x*34.0)+1.0)*x); }

    float snoise(vec2 v) {
      const vec4 C = vec4(0.211324865405187, 0.366025403784439,
                          -0.577350269189626, 0.024390243902439);
      vec2 i  = floor(v + dot(v, C.yy));
      vec2 x0 = v -   i + dot(i, C.xx);
      vec2 i1;
      i1 = (x0.x > x0.y) ? vec2(1.0, 0.0) : vec2(0.0, 1.0);
      vec4 x12 = x0.xyxy + C.xxzz;
      x12.xy -= i1;
      i = mod289(i);
      vec3 p = permute(permute(i.y + vec3(0.0, i1.y, 1.0))
                       + i.x + vec3(0.0, i1.x, 1.0));
      vec3 m = max(0.5 - vec3(dot(x0,x0), dot(x12.xy,x12.xy),
                              dot(x12.zw,x12.zw)), 0.0);
      m = m*m;
      m = m*m;
      vec3 x = 2.0 * fract(p * C.www) - 1.0;
      vec3 h = abs(x) - 0.5;
      vec3 ox = floor(x + 0.5);
      vec3 a0 = x - ox;
      m *= 1.79284291400159 - 0.85373472095314 * (a0*a0 + h*h);
      vec3 g;
      g.x  = a0.x  * x0.x  + h.x  * x0.y;
      g.yz = a0.yz * x12.xz + h.yz * x12.yw;
      return 130.0 * dot(m, g);
    }

    // Fractal Brownian Motion for cloud-like noise
    float fbm(vec2 p) {
      float value = 0.0;
      float amplitude = 0.5;
      float frequency = 1.0;

      for (int i = 0; i < 5; i++) {
        value += amplitude * snoise(p * frequency);
        amplitude *= 0.5;
        frequency *= 2.0;
      }

      return value;
    }

    void main() {
      // Calculate UV with animation
      vec2 uv = vUv * 3.0 * cloudScale;
      uv.x += time * 0.1;

      // Create cloud noise with multiple octaves
      float noise1 = fbm(uv);
      float noise2 = fbm(uv * 2.0 + vec2(time * 0.05, 0.0));

      // Combine noise layers
      float clouds = (noise1 + noise2 * 0.5) * 0.5 + 0.5;

      // Apply density threshold
      float threshold = 1.0 - cloudDensity;
      clouds = smoothstep(threshold, threshold + 0.3, clouds);

      // Fade clouds at edges (horizon effect)
      vec3 direction = normalize(vWorldPosition);
      float heightFade = smoothstep(0.0, 0.3, direction.y);
      clouds *= heightFade;

      // Final color with opacity
      float alpha = clouds * cloudOpacity;

      // Blend cloud color with a hint of horizon color for atmosphere
      vec3 finalColor = mix(cloudColor, horizonColor, 0.1);

      gl_FragColor = vec4(finalColor, alpha);
    }
  `,
};

export class SkySystem {
  private skyDome: THREE.Mesh;
  private cloudDome: THREE.Mesh;
  private skyMaterial: THREE.ShaderMaterial;
  private cloudMaterial: THREE.ShaderMaterial;
  private config: SkyConfig;
  private sunDirection: THREE.Vector3;

  constructor(scene: THREE.Scene, config: Partial<SkyConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.sunDirection = new THREE.Vector3(0.5, 0.5, 0.5).normalize();

    // Create sky dome geometry (large sphere)
    const skyGeometry = new THREE.SphereGeometry(400, 32, 32);

    // Sky gradient material
    this.skyMaterial = new THREE.ShaderMaterial({
      uniforms: {
        zenithColor: { value: new THREE.Color(this.config.zenithColor) },
        horizonColor: { value: new THREE.Color(this.config.horizonColor) },
        sunColor: { value: new THREE.Color(this.config.sunColor) },
        sunDirection: { value: this.sunDirection },
        sunIntensity: { value: this.config.sunIntensity },
      },
      vertexShader: SkyShader.vertexShader,
      fragmentShader: SkyShader.fragmentShader,
      side: THREE.BackSide,
      depthWrite: false,
    });

    this.skyDome = new THREE.Mesh(skyGeometry, this.skyMaterial);
    this.skyDome.renderOrder = -2; // Render first
    scene.add(this.skyDome);

    // Create cloud dome (slightly smaller sphere)
    const cloudGeometry = new THREE.SphereGeometry(390, 32, 32);

    this.cloudMaterial = new THREE.ShaderMaterial({
      uniforms: {
        time: { value: 0 },
        cloudColor: { value: new THREE.Color(this.config.cloudColor) },
        cloudOpacity: { value: this.config.cloudOpacity },
        cloudDensity: { value: this.config.cloudDensity },
        cloudScale: { value: this.config.cloudScale },
        horizonColor: { value: new THREE.Color(this.config.horizonColor) },
      },
      vertexShader: CloudShader.vertexShader,
      fragmentShader: CloudShader.fragmentShader,
      side: THREE.BackSide,
      transparent: true,
      depthWrite: false,
    });

    this.cloudDome = new THREE.Mesh(cloudGeometry, this.cloudMaterial);
    this.cloudDome.renderOrder = -1; // Render after sky but before scene
    scene.add(this.cloudDome);
  }

  update(deltaTime: number): void {
    // Animate clouds
    this.cloudMaterial.uniforms.time.value += deltaTime * this.config.cloudSpeed;
  }

  // Sky color controls
  setZenithColor(color: number): void {
    this.config.zenithColor = color;
    this.skyMaterial.uniforms.zenithColor.value.setHex(color);
  }

  setHorizonColor(color: number): void {
    this.config.horizonColor = color;
    this.skyMaterial.uniforms.horizonColor.value.setHex(color);
    this.cloudMaterial.uniforms.horizonColor.value.setHex(color);
  }

  // Cloud controls
  setCloudColor(color: number): void {
    this.config.cloudColor = color;
    this.cloudMaterial.uniforms.cloudColor.value.setHex(color);
  }

  setCloudOpacity(opacity: number): void {
    this.config.cloudOpacity = opacity;
    this.cloudMaterial.uniforms.cloudOpacity.value = opacity;
  }

  setCloudSpeed(speed: number): void {
    this.config.cloudSpeed = speed;
  }

  setCloudDensity(density: number): void {
    this.config.cloudDensity = density;
    this.cloudMaterial.uniforms.cloudDensity.value = density;
  }

  setCloudScale(scale: number): void {
    this.config.cloudScale = scale;
    this.cloudMaterial.uniforms.cloudScale.value = scale;
  }

  // Sun controls
  setSunColor(color: number): void {
    this.config.sunColor = color;
    this.skyMaterial.uniforms.sunColor.value.setHex(color);
  }

  setSunDirection(direction: THREE.Vector3): void {
    this.sunDirection.copy(direction).normalize();
    this.skyMaterial.uniforms.sunDirection.value.copy(this.sunDirection);
  }

  setSunIntensity(intensity: number): void {
    this.config.sunIntensity = intensity;
    this.skyMaterial.uniforms.sunIntensity.value = intensity;
  }

  // Enable/disable clouds
  setCloudsEnabled(enabled: boolean): void {
    this.cloudDome.visible = enabled;
  }

  // Enable/disable entire sky system
  setVisible(visible: boolean): void {
    this.skyDome.visible = visible;
    this.cloudDome.visible = visible;
  }

  // Get current config
  getConfig(): SkyConfig {
    return { ...this.config };
  }

  // Apply full config (for presets)
  applyConfig(config: Partial<SkyConfig>): void {
    if (config.zenithColor !== undefined) this.setZenithColor(config.zenithColor);
    if (config.horizonColor !== undefined) this.setHorizonColor(config.horizonColor);
    if (config.cloudColor !== undefined) this.setCloudColor(config.cloudColor);
    if (config.cloudOpacity !== undefined) this.setCloudOpacity(config.cloudOpacity);
    if (config.cloudSpeed !== undefined) this.setCloudSpeed(config.cloudSpeed);
    if (config.cloudDensity !== undefined) this.setCloudDensity(config.cloudDensity);
    if (config.cloudScale !== undefined) this.setCloudScale(config.cloudScale);
    if (config.sunColor !== undefined) this.setSunColor(config.sunColor);
    if (config.sunIntensity !== undefined) this.setSunIntensity(config.sunIntensity);
  }

  dispose(): void {
    this.skyDome.geometry.dispose();
    this.skyMaterial.dispose();
    this.cloudDome.geometry.dispose();
    this.cloudMaterial.dispose();
  }
}
