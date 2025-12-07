import * as THREE from "three";
import { Water } from "three/addons/objects/Water.js";

export interface WaterConfig {
  size?: number;
  waterLevel?: number;
  waterColor?: number;
  sunColor?: number;
  distortionScale?: number;
  fog?: boolean;
  alpha?: number;
}

const DEFAULT_CONFIG: WaterConfig = {
  size: 500,
  waterLevel: 1, // 1 block high
  waterColor: 0x001e0f,
  sunColor: 0xffffff,
  distortionScale: 3.7,
  fog: true,
  alpha: 0.9,
};

export class WaterSystem {
  private water: Water;
  private config: WaterConfig;
  private sunDirection: THREE.Vector3;

  constructor(scene: THREE.Scene, config: WaterConfig = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.sunDirection = new THREE.Vector3();

    // Create water geometry - large plane
    const waterGeometry = new THREE.PlaneGeometry(
      this.config.size!,
      this.config.size!,
      128,
      128
    );

    // Create water with shader
    this.water = new Water(waterGeometry, {
      textureWidth: 512,
      textureHeight: 512,
      waterNormals: new THREE.TextureLoader().load(
        "https://threejs.org/examples/textures/waternormals.jpg",
        (texture) => {
          texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
        }
      ),
      sunDirection: this.sunDirection,
      sunColor: this.config.sunColor!,
      waterColor: this.config.waterColor!,
      distortionScale: this.config.distortionScale!,
      fog: this.config.fog,
    });

    // Rotate to be horizontal and position at water level
    this.water.rotation.x = -Math.PI / 2;
    this.water.position.y = this.config.waterLevel!;

    // Make water slightly transparent
    const waterMaterial = this.water.material as THREE.ShaderMaterial;
    waterMaterial.transparent = true;
    waterMaterial.opacity = this.config.alpha!;

    scene.add(this.water);
  }

  update(deltaTime: number): void {
    // Animate water
    const waterUniforms = (this.water.material as THREE.ShaderMaterial).uniforms;
    waterUniforms["time"].value += deltaTime * 0.5;
  }

  setSunDirection(direction: THREE.Vector3): void {
    this.sunDirection.copy(direction).normalize();
    const waterUniforms = (this.water.material as THREE.ShaderMaterial).uniforms;
    waterUniforms["sunDirection"].value.copy(this.sunDirection);
  }

  setWaterLevel(level: number): void {
    this.config.waterLevel = level;
    this.water.position.y = level;
  }

  getWaterLevel(): number {
    return this.config.waterLevel!;
  }

  setDistortionScale(scale: number): void {
    const waterUniforms = (this.water.material as THREE.ShaderMaterial).uniforms;
    waterUniforms["distortionScale"].value = scale;
  }

  setWaterColor(color: number): void {
    const waterUniforms = (this.water.material as THREE.ShaderMaterial).uniforms;
    waterUniforms["waterColor"].value.setHex(color);
  }

  setSunColor(color: number): void {
    const waterUniforms = (this.water.material as THREE.ShaderMaterial).uniforms;
    waterUniforms["sunColor"].value.setHex(color);
  }

  setAlpha(alpha: number): void {
    const waterMaterial = this.water.material as THREE.ShaderMaterial;
    waterMaterial.opacity = alpha;
  }

  getWater(): Water {
    return this.water;
  }

  setVisible(visible: boolean): void {
    this.water.visible = visible;
  }

  dispose(): void {
    this.water.geometry.dispose();
    (this.water.material as THREE.ShaderMaterial).dispose();
  }
}
