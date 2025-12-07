# Three.js Project Setup Guide with Vite and TypeScript

This guide walks through setting up a Three.js project using Vite as the build tool and TypeScript for type safety.

## Prerequisites

- Node.js (v18 or higher recommended)
- npm

## Step 1: Initialize the Project

Create a new directory and initialize npm:

```bash
mkdir getting-started
cd getting-started
npm init -y
```

## Step 2: Install Dependencies

Install the required packages:

```bash
# Install Three.js and Vite
npm install three

# Install dev dependencies
npm install -D vite typescript @types/three
```

## Step 3: Configure TypeScript

Create `tsconfig.json` in the project root:

```json
{
  "compilerOptions": {
    "target": "ES2020",
    "useDefineForClassFields": true,
    "module": "ESNext",
    "lib": ["ES2020", "DOM", "DOM.Iterable"],
    "skipLibCheck": true,
    "moduleResolution": "bundler",
    "allowImportingTsExtensions": true,
    "resolveJsonModule": true,
    "isolatedModules": true,
    "noEmit": true,
    "strict": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "noFallthroughCasesInSwitch": true
  },
  "include": ["src"]
}
```

## Step 4: Configure Vite

Create `vite.config.ts` in the project root:

```typescript
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [],
  server: {
    port: 5200,
    open: true,
  },
  build: {
    outDir: 'dist',
    sourcemap: true,
  },
  base: "/"
});
```

## Step 5: Update package.json

Update `package.json` with the following configuration:

```json
{
  "name": "getting-started",
  "version": "1.0.0",
  "description": "",
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "tsc && vite build",
    "preview": "vite preview"
  },
  "keywords": [],
  "author": "",
  "license": "ISC",
  "dependencies": {
    "three": "^0.181.2"
  },
  "devDependencies": {
    "@types/three": "^0.181.0",
    "typescript": "^5.9.3",
    "vite": "^7.2.4"
  }
}
```

Key changes:
- Set `"type": "module"` for ES modules support
- Added npm scripts for development, building, and previewing

## Step 6: Create the Stylesheet

Create `src/style.css`:

```css
body {
  margin: 0;
  overflow: hidden;
}

canvas {
  display: block;
}

#controls {
  position: fixed;
  top: 20px;
  left: 20px;
  z-index: 100;
  display: flex;
  flex-direction: column;
  gap: 10px;
  background: rgba(0, 0, 0, 0.7);
  padding: 15px;
  border-radius: 8px;
  font-family: sans-serif;
}

.control-row {
  display: flex;
  align-items: center;
  gap: 10px;
}

#controls label {
  color: white;
  font-size: 14px;
  min-width: 120px;
}

#cube-color {
  width: 50px;
  height: 30px;
  border: none;
  cursor: pointer;
  border-radius: 4px;
}

#speed {
  width: 100px;
  cursor: pointer;
}
```

## Step 7: Create the HTML Entry Point

Create `index.html` in the project root:

```html
<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Three.js App</title>
    <link rel="stylesheet" href="/src/style.css" />
  </head>
  <body>
    <div id="controls">
      <div class="control-row">
        <label for="cube-color">Cube Color:</label>
        <input type="color" id="cube-color" value="#00ff00" />
      </div>
      <div class="control-row">
        <label for="speed">Speed: <span id="speed-value">0.01</span></label>
        <input type="range" id="speed" min="0" max="0.1" step="0.005" value="0.01" />
      </div>
    </div>
    <script type="module" src="/src/main.ts"></script>
  </body>
</html>
```

## Step 8: Create the Three.js Application

Create `src/main.ts`:

```typescript
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/Addons.js";

// Scene setup
const scene = new THREE.Scene();

// Camera
const camera = new THREE.PerspectiveCamera(
  75,
  window.innerWidth / window.innerHeight
);

camera.position.z = 5;

// Renderer
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(window.devicePixelRatio);
document.body.appendChild(renderer.domElement);

// Basic cube
const geometry = new THREE.BoxGeometry(1, 1, 1);
const material = new THREE.MeshStandardMaterial({ color: 0x00ff00 });
const cube = new THREE.Mesh(geometry, material);
scene.add(cube);

// Lighting
const ambientLight = new THREE.AmbientLight(0xffffff, 0.5);
scene.add(ambientLight);

const directionalLight = new THREE.DirectionalLight(0xffffff, 1);
directionalLight.position.set(5, 5, 5);
scene.add(directionalLight);

// Handle window resize
window.addEventListener("resize", () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

// Animation speed
let rotationSpeed = 0.01;

// Animation loop
function render() {
  requestAnimationFrame(render);

  cube.rotation.x += rotationSpeed;
  cube.rotation.y += rotationSpeed;

  renderer.render(scene, camera);
}

// Orbit Controls
const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.target.set(0, 0, 0);
controls.update();

// Color Picker
const colorPicker = document.getElementById("cube-color") as HTMLInputElement;
colorPicker.addEventListener("input", (event) => {
  const color = (event.target as HTMLInputElement).value;
  material.color.set(color);
});

// Speed Slider
const speedSlider = document.getElementById("speed") as HTMLInputElement;
const speedValue = document.getElementById("speed-value") as HTMLSpanElement;
speedSlider.addEventListener("input", (event) => {
  rotationSpeed = parseFloat((event.target as HTMLInputElement).value);
  speedValue.textContent = rotationSpeed.toFixed(3);
});

render();
```

### Code Breakdown

1. **Scene**: The container for all 3D objects, lights, and cameras
2. **Camera**: A `PerspectiveCamera` with 75° FOV, positioned 5 units back on the z-axis
3. **Renderer**: `WebGLRenderer` with antialiasing for smoother edges
4. **Geometry & Material**: A 1x1x1 cube with a green `MeshStandardMaterial`
5. **Lighting**: Ambient light for base illumination + directional light for shadows/depth
6. **Resize Handler**: Updates camera aspect ratio and renderer size on window resize
7. **Animation Speed**: Variable to control rotation speed, adjustable via UI slider
8. **Render Loop**: Rotates the cube using `rotationSpeed` and renders the scene each frame
9. **OrbitControls**: Enables mouse interaction to orbit, zoom, and pan the camera around the scene
   - `enableDamping`: Adds smooth deceleration when releasing the mouse
   - `target.set(0, 0, 0)`: Sets the point the camera orbits around (center of scene)
10. **Color Picker**: Listens for input changes and updates the cube material color in real-time
11. **Speed Slider**: Adjusts the `rotationSpeed` variable and displays the current value

## Step 9: Create .gitignore

Create `.gitignore` in the project root:

```
node_modules
dist
.DS_Store
*.local
```

## Final Project Structure

```
getting-started/
├── docs/
│   └── setup-guide.md
├── src/
│   ├── main.ts
│   └── style.css
├── .gitignore
├── index.html
├── package.json
├── tsconfig.json
└── vite.config.ts
```

## Running the Project

```bash
# Start development server (opens browser at http://localhost:5200)
npm run dev

# Build for production
npm run build

# Preview production build
npm run preview
```

## Step 10: Refactoring to a Class-Based Structure

As your Three.js application grows, organizing code with classes becomes essential for maintainability. Classes help you:

- **Encapsulate state**: Keep related variables (scene, camera, renderer) together
- **Organize methods**: Group related functionality into logical methods
- **Improve readability**: Clear structure makes code easier to understand
- **Enable reusability**: Easier to extend or create multiple instances
- **Manage scope**: Avoid polluting the global namespace with variables

### Why Use Classes for Three.js?

In a typical Three.js app, you have many interconnected objects:
- The scene, camera, and renderer must work together
- Objects need to be added to the scene
- Event handlers need access to multiple objects
- The render loop needs access to everything

Without classes, you end up with many global variables and functions that are hard to track. A class groups everything into a single, organized unit.

### Refactored Code

Update `src/main.ts` to use a class-based structure:

```typescript
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/Addons.js";

class App {
  private scene: THREE.Scene;
  private camera: THREE.PerspectiveCamera;
  private renderer: THREE.WebGLRenderer;
  private controls: OrbitControls;
  private cube: THREE.Mesh;
  private material: THREE.MeshStandardMaterial;
  private rotationSpeed = 0.01;

  constructor() {
    this.scene = new THREE.Scene();
    this.camera = this.createCamera();
    this.renderer = this.createRenderer();
    this.material = new THREE.MeshStandardMaterial({ color: 0x00ff00 });
    this.cube = this.createCube();
    this.controls = this.createControls();
  }

  initialize(): void {
    this.setupLighting();
    this.setupEventListeners();
    this.setupUIControls();
  }

  run(): void {
    this.render();
  }

  private createCamera(): THREE.PerspectiveCamera {
    const camera = new THREE.PerspectiveCamera(
      75,
      window.innerWidth / window.innerHeight
    );
    camera.position.z = 5;
    return camera;
  }

  private createRenderer(): THREE.WebGLRenderer {
    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.setPixelRatio(window.devicePixelRatio);
    document.body.appendChild(renderer.domElement);
    return renderer;
  }

  private createCube(): THREE.Mesh {
    const geometry = new THREE.BoxGeometry(1, 1, 1);
    const cube = new THREE.Mesh(geometry, this.material);
    this.scene.add(cube);
    return cube;
  }

  private createControls(): OrbitControls {
    const controls = new OrbitControls(this.camera, this.renderer.domElement);
    controls.enableDamping = true;
    controls.target.set(0, 0, 0);
    controls.update();
    return controls;
  }

  private setupLighting(): void {
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.5);
    this.scene.add(ambientLight);

    const directionalLight = new THREE.DirectionalLight(0xffffff, 1);
    directionalLight.position.set(5, 5, 5);
    this.scene.add(directionalLight);
  }

  private setupEventListeners(): void {
    window.addEventListener("resize", () => this.onWindowResize());
  }

  private onWindowResize(): void {
    this.camera.aspect = window.innerWidth / window.innerHeight;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(window.innerWidth, window.innerHeight);
  }

  private setupUIControls(): void {
    const colorPicker = document.getElementById("cube-color") as HTMLInputElement;
    colorPicker.addEventListener("input", (event) => {
      const color = (event.target as HTMLInputElement).value;
      this.material.color.set(color);
    });

    const speedSlider = document.getElementById("speed") as HTMLInputElement;
    const speedValue = document.getElementById("speed-value") as HTMLSpanElement;
    speedSlider.addEventListener("input", (event) => {
      this.rotationSpeed = parseFloat((event.target as HTMLInputElement).value);
      speedValue.textContent = this.rotationSpeed.toFixed(3);
    });
  }

  private render = (): void => {
    requestAnimationFrame(this.render);

    this.cube.rotation.x += this.rotationSpeed;
    this.cube.rotation.y += this.rotationSpeed;

    this.controls.update();
    this.renderer.render(this.scene, this.camera);
  };
}

const app = new App();
app.initialize();
app.run();
```

### Class Structure Breakdown

| Method | Purpose |
|--------|---------|
| `constructor()` | Creates core Three.js objects (scene, camera, renderer, cube, controls) |
| `initialize()` | Sets up lighting, event listeners, and UI controls |
| `run()` | Starts the render loop |
| `createCamera()` | Creates and configures the perspective camera |
| `createRenderer()` | Sets up the WebGL renderer and attaches to DOM |
| `createCube()` | Creates the mesh geometry and adds to scene |
| `createControls()` | Initializes OrbitControls for camera interaction |
| `setupLighting()` | Adds ambient and directional lights to the scene |
| `setupEventListeners()` | Binds window resize handler |
| `onWindowResize()` | Updates camera and renderer on window resize |
| `setupUIControls()` | Connects HTML controls to material and animation |
| `render()` | Animation loop (arrow function to preserve `this` context) |

### Key TypeScript Features Used

- **Private properties**: `private scene`, `private camera`, etc. restrict access to within the class
- **Type annotations**: `THREE.Scene`, `THREE.PerspectiveCamera` provide type safety
- **Arrow function for render**: `render = (): void => {}` preserves `this` context in `requestAnimationFrame`

## Next Steps

- Load 3D models using GLTFLoader
- Add textures and more complex materials
- Implement post-processing effects
