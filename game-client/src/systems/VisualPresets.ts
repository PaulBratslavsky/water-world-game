export type VisualPreset = "default" | "matrix" | "tron";

export interface PresetConfig {
  name: string;
  description: string;
  scene: {
    backgroundColor: number;
    fogColor: number;
    fogNear: number;
    fogFar: number;
  };
  lighting: {
    ambientColor: number;
    ambientIntensity: number;
    hemisphereColorSky: number;
    hemisphereColorGround: number;
    hemisphereIntensity: number;
    directionalColor: number;
    directionalIntensity: number;
    fillColor: number;
    fillIntensity: number;
  };
  water: {
    color: number;
    sunColor: number;
    distortionScale: number;
    alpha: number;
  };
  sky: {
    zenithColor: number;
    horizonColor: number;
    cloudColor: number;
    cloudOpacity: number;
    cloudSpeed: number;
    cloudDensity: number;
    sunColor: number;
    sunIntensity: number;
  };
  postProcessing: {
    bloomStrength: number;
    bloomRadius: number;
    bloomThreshold: number;
    greenTint: number;
    blueTint: number;
    contrast: number;
    saturation: number;
    exposure: number;
  };
  colorGrade: {
    redReduce: number;
    greenBoost: number;
    blueReduce: number;
  };
  retro: {
    enabled: boolean;
    pixelSize: number;
    colorDepth: number;
    scanlineIntensity: number;
    chromaticAberration: number;
  };
  night: {
    fogColor: number;
    fogNear: number;
    fogFar: number;
    ambientColor: number;
    ambientIntensity: number;
    directionalColor: number;
    directionalIntensity: number;
    skyZenithColor: number;
    skyHorizonColor: number;
    playerLightColor: number;
    playerLightIntensity: number;
    playerLightDistance: number;
  };
}

export const VISUAL_PRESETS: Record<VisualPreset, PresetConfig> = {
  default: {
    name: "Default",
    description: "Clean, natural look",
    scene: {
      backgroundColor: 0x87ceeb,
      fogColor: 0x87ceeb,
      fogNear: 100,
      fogFar: 300,
    },
    lighting: {
      ambientColor: 0x404050,
      ambientIntensity: 0.5,
      hemisphereColorSky: 0x87ceeb,
      hemisphereColorGround: 0x3d5c5c,
      hemisphereIntensity: 0.6,
      directionalColor: 0xffffff,
      directionalIntensity: 1.0,
      fillColor: 0xb4c8e0,
      fillIntensity: 0.3,
    },
    water: {
      color: 0x001e0f,
      sunColor: 0xffffff,
      distortionScale: 3.7,
      alpha: 0.85,
    },
    sky: {
      zenithColor: 0x0077be, // Deep blue
      horizonColor: 0x87ceeb, // Light sky blue
      cloudColor: 0xffffff,
      cloudOpacity: 0.8,
      cloudSpeed: 0.02,
      cloudDensity: 0.5,
      sunColor: 0xffffee,
      sunIntensity: 1.0,
    },
    postProcessing: {
      bloomStrength: 0.5,
      bloomRadius: 0.5,
      bloomThreshold: 0.5,
      greenTint: 0.0,
      blueTint: 0.0,
      contrast: 1.0,
      saturation: 1.0,
      exposure: 1.0,
    },
    colorGrade: {
      redReduce: 1.0,
      greenBoost: 1.0,
      blueReduce: 1.0,
    },
    retro: {
      enabled: false,
      pixelSize: 3,
      colorDepth: 64,
      scanlineIntensity: 0.1,
      chromaticAberration: 0.001,
    },
    night: {
      fogColor: 0x080810,
      fogNear: 8,
      fogFar: 35,
      ambientColor: 0x101018,
      ambientIntensity: 0.15,
      directionalColor: 0x334466, // Faint moonlight
      directionalIntensity: 0.1,
      skyZenithColor: 0x020208,
      skyHorizonColor: 0x0a0a15,
      playerLightColor: 0xffcc77, // Warm torch
      playerLightIntensity: 8.0,
      playerLightDistance: 20,
    },
  },

  matrix: {
    name: "Matrix",
    description: "Green-tinted cyberpunk aesthetic",
    scene: {
      backgroundColor: 0x0a1a0a,
      fogColor: 0x1a2a1a,
      fogNear: 60,
      fogFar: 200,
    },
    lighting: {
      ambientColor: 0x304030,
      ambientIntensity: 0.5,
      hemisphereColorSky: 0x88aa88,
      hemisphereColorGround: 0x2a3a2a,
      hemisphereIntensity: 0.5,
      directionalColor: 0xccffcc,
      directionalIntensity: 0.9,
      fillColor: 0x88cc88,
      fillIntensity: 0.3,
    },
    water: {
      color: 0x003300,
      sunColor: 0x00ff00,
      distortionScale: 4.0,
      alpha: 0.8,
    },
    sky: {
      zenithColor: 0x001a00, // Very dark green
      horizonColor: 0x0a3a0a, // Dark green
      cloudColor: 0x00aa00, // Bright green clouds
      cloudOpacity: 0.4,
      cloudSpeed: 0.03,
      cloudDensity: 0.6,
      sunColor: 0x00ff00, // Green sun glow
      sunIntensity: 0.8,
    },
    postProcessing: {
      bloomStrength: 0.7,
      bloomRadius: 0.6,
      bloomThreshold: 0.5,
      greenTint: 0.45,
      blueTint: 0.0,
      contrast: 1.1,
      saturation: 0.9,
      exposure: 1.0,
    },
    colorGrade: {
      redReduce: 0.85,
      greenBoost: 1.2,
      blueReduce: 0.8,
    },
    retro: {
      enabled: false,
      pixelSize: 4,
      colorDepth: 16,
      scanlineIntensity: 0.2,
      chromaticAberration: 0.003,
    },
    night: {
      fogColor: 0x051005,
      fogNear: 6,
      fogFar: 30,
      ambientColor: 0x081808,
      ambientIntensity: 0.12,
      directionalColor: 0x115511, // Faint green moonlight
      directionalIntensity: 0.08,
      skyZenithColor: 0x010501,
      skyHorizonColor: 0x051005,
      playerLightColor: 0x66ff88, // Green torch for Matrix
      playerLightIntensity: 10.0,
      playerLightDistance: 22,
    },
  },

  tron: {
    name: "Tron",
    description: "Neon blue digital world",
    scene: {
      backgroundColor: 0x000510,
      fogColor: 0x000818,
      fogNear: 50,
      fogFar: 180,
    },
    lighting: {
      ambientColor: 0x223355, // Brighter blue-gray ambient
      ambientIntensity: 0.8,  // Much brighter ambient
      hemisphereColorSky: 0x44aaff,
      hemisphereColorGround: 0x112233,
      hemisphereIntensity: 0.7,
      directionalColor: 0x88ddff,
      directionalIntensity: 1.0,
      fillColor: 0x4488ff,
      fillIntensity: 0.6,
    },
    water: {
      color: 0x000522,
      sunColor: 0x00ddff,
      distortionScale: 2.5,
      alpha: 0.7,
    },
    sky: {
      zenithColor: 0x000020, // Very dark blue
      horizonColor: 0x001040, // Dark blue
      cloudColor: 0xff6600, // Bold orange retro neon clouds
      cloudOpacity: 0.4,
      cloudSpeed: 0.04,
      cloudDensity: 0.5,
      sunColor: 0xff4400, // Orange sun glow
      sunIntensity: 1.5,
    },
    postProcessing: {
      bloomStrength: 0.9,
      bloomRadius: 0.7,
      bloomThreshold: 0.5,
      greenTint: 0.0,
      blueTint: 0.6,
      contrast: 1.2,
      saturation: 1.15,
      exposure: 1.15,
    },
    colorGrade: {
      redReduce: 0.5,
      greenBoost: 0.85,
      blueReduce: 1.5,
    },
    retro: {
      enabled: true, // Tron has retro enabled by default
      pixelSize: 3,
      colorDepth: 24,
      scanlineIntensity: 0.15,
      chromaticAberration: 0.004,
    },
    night: {
      fogColor: 0x040810,
      fogNear: 5,
      fogFar: 28,
      ambientColor: 0x081020,
      ambientIntensity: 0.12,
      directionalColor: 0x224488, // Faint blue moonlight
      directionalIntensity: 0.08,
      skyZenithColor: 0x010208,
      skyHorizonColor: 0x040810,
      playerLightColor: 0x66eeff, // Cyan torch for Tron
      playerLightIntensity: 12.0,
      playerLightDistance: 25,
    },
  },
};

export function getPresetNames(): VisualPreset[] {
  return Object.keys(VISUAL_PRESETS) as VisualPreset[];
}

export function getPreset(name: VisualPreset): PresetConfig {
  return VISUAL_PRESETS[name];
}
