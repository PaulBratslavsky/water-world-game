import { VisualPreset } from "../systems/VisualPresets";

/**
 * PerformancePanel - Displays real-time rendering performance statistics
 *
 * Shows FPS, draw calls, triangle count, and mesh optimization stats.
 * Toggle with 'P' key or via the UI button.
 */

export interface RenderingStats {
  totalBlocks: number;
  renderMode: "instancing" | "greedy" | "individual";
  drawCalls: number;
  estimatedTriangles: number;
  culledFaces?: number;
  cullPercentage?: number;
}

export interface BenchmarkResult {
  fps: number;
  qualityLevel: string;
  gpuInfo: string;
}

export type QualityLevel = "low" | "medium" | "high";

export class PerformancePanel {
  private container: HTMLElement;
  private toggleButton: HTMLElement;
  private isVisible: boolean = false;
  private statsProvider: (() => RenderingStats) | null = null;
  private benchmarkRunner: (() => Promise<BenchmarkResult>) | null = null;
  private qualityChangeHandler: ((level: QualityLevel) => void) | null = null;
  private presetChangeHandler: ((preset: VisualPreset) => void) | null = null;
  private brightnessChangeHandler: ((brightness: number) => void) | null = null;
  private retroToggleHandler: ((enabled: boolean) => void) | null = null;
  private postFxToggleHandler: ((enabled: boolean) => void) | null = null;
  private skyToggleHandler: ((enabled: boolean) => void) | null = null;
  private waterToggleHandler: ((enabled: boolean) => void) | null = null;
  private isBenchmarking: boolean = false;
  private currentQuality: QualityLevel = "high";
  private currentPreset: VisualPreset = "default";
  private currentBrightness: number = 1.0;

  // FPS tracking
  private frames: number = 0;
  private lastTime: number = performance.now();
  private fps: number = 0;
  private updateInterval: number | null = null;

  constructor() {
    this.container = this.createContainer();
    this.toggleButton = this.createToggleButton();
    this.attachToDOM();
    this.setupKeyboardShortcut();
  }

  private createContainer(): HTMLElement {
    const container = document.createElement("div");
    container.id = "performance-panel";
    container.className = "performance-panel";
    container.innerHTML = `
      <div class="perf-header">
        <span class="perf-title">Performance</span>
      </div>
      <div class="perf-stats">
        <div class="perf-row">
          <span class="perf-label">FPS:</span>
          <span class="perf-value" id="perf-fps">--</span>
        </div>
        <div class="perf-row">
          <span class="perf-label">Blocks:</span>
          <span class="perf-value" id="perf-blocks">--</span>
        </div>
        <div class="perf-row">
          <span class="perf-label">Draw Calls:</span>
          <span class="perf-value" id="perf-drawcalls">--</span>
        </div>
        <div class="perf-row">
          <span class="perf-label">Triangles:</span>
          <span class="perf-value" id="perf-triangles">--</span>
        </div>
        <div class="perf-row">
          <span class="perf-label">Render Mode:</span>
          <span class="perf-value" id="perf-mode">--</span>
        </div>
        <div class="perf-row perf-culling" style="display: none;">
          <span class="perf-label">Faces Culled:</span>
          <span class="perf-value" id="perf-culled">--</span>
        </div>
        <div class="perf-row perf-culling" style="display: none;">
          <span class="perf-label">Cull %:</span>
          <span class="perf-value" id="perf-cull-pct">--</span>
        </div>
        <div class="perf-divider"></div>
        <div class="perf-row">
          <span class="perf-label">Quality:</span>
          <div class="perf-quality-buttons">
            <button class="perf-quality-btn" data-quality="low">Low</button>
            <button class="perf-quality-btn" data-quality="medium">Mid</button>
            <button class="perf-quality-btn active" data-quality="high">High</button>
          </div>
        </div>
        <div class="perf-row">
          <span class="perf-label">Theme:</span>
          <div class="perf-preset-buttons">
            <button class="perf-preset-btn active" data-preset="default">Default</button>
            <button class="perf-preset-btn" data-preset="matrix">Matrix</button>
            <button class="perf-preset-btn" data-preset="tron">Tron</button>
          </div>
        </div>
        <div class="perf-row perf-slider-row">
          <span class="perf-label">Brightness:</span>
          <input type="range" id="perf-brightness" class="perf-slider" min="0.2" max="2.0" step="0.1" value="1.0">
          <span class="perf-slider-value" id="perf-brightness-val">1.0</span>
        </div>
        <div class="perf-row">
          <span class="perf-label">Retro FX:</span>
          <button class="perf-toggle-btn" id="perf-retro-toggle">OFF</button>
        </div>
        <div class="perf-row">
          <span class="perf-label">Post FX:</span>
          <button class="perf-toggle-btn active" id="perf-postfx-toggle">ON</button>
        </div>
        <div class="perf-row">
          <span class="perf-label">Sky:</span>
          <button class="perf-toggle-btn active" id="perf-sky-toggle">ON</button>
        </div>
        <div class="perf-row">
          <span class="perf-label">Water:</span>
          <button class="perf-toggle-btn active" id="perf-water-toggle">ON</button>
        </div>
        <div class="perf-divider"></div>
        <div class="perf-row">
          <button class="perf-benchmark-btn" id="perf-benchmark">Run Benchmark</button>
        </div>
        <div class="perf-benchmark-results" id="perf-benchmark-results" style="display: none;">
          <div class="perf-row">
            <span class="perf-label">GPU:</span>
            <span class="perf-value perf-gpu" id="perf-gpu">--</span>
          </div>
          <div class="perf-row">
            <span class="perf-label">Bench FPS:</span>
            <span class="perf-value" id="perf-bench-fps">--</span>
          </div>
          <div class="perf-row">
            <span class="perf-label">Recommended:</span>
            <span class="perf-value" id="perf-quality-level">--</span>
          </div>
        </div>
      </div>
    `;

    // Add styles
    this.addStyles();

    // Setup benchmark button
    const benchmarkBtn = container.querySelector("#perf-benchmark") as HTMLButtonElement;
    benchmarkBtn.addEventListener("click", () => this.runBenchmark());

    // Setup quality buttons
    const qualityBtns = container.querySelectorAll(".perf-quality-btn");
    qualityBtns.forEach((btn) => {
      btn.addEventListener("click", () => {
        const quality = (btn as HTMLElement).dataset.quality as QualityLevel;
        this.setQuality(quality);
      });
    });

    // Setup preset buttons
    const presetBtns = container.querySelectorAll(".perf-preset-btn");
    presetBtns.forEach((btn) => {
      btn.addEventListener("click", () => {
        const preset = (btn as HTMLElement).dataset.preset as VisualPreset;
        this.setPreset(preset);
      });
    });

    // Setup brightness slider
    const brightnessSlider = container.querySelector("#perf-brightness") as HTMLInputElement;
    const brightnessVal = container.querySelector("#perf-brightness-val") as HTMLElement;
    brightnessSlider.addEventListener("input", () => {
      const value = parseFloat(brightnessSlider.value);
      this.currentBrightness = value;
      brightnessVal.textContent = value.toFixed(1);
      if (this.brightnessChangeHandler) {
        this.brightnessChangeHandler(value);
      }
    });

    // Setup retro toggle button
    const retroBtn = container.querySelector("#perf-retro-toggle") as HTMLButtonElement;
    retroBtn.addEventListener("click", () => {
      const isActive = retroBtn.classList.toggle("active");
      retroBtn.textContent = isActive ? "ON" : "OFF";
      if (this.retroToggleHandler) {
        this.retroToggleHandler(isActive);
      }
    });

    // Setup post-processing toggle button
    const postFxBtn = container.querySelector("#perf-postfx-toggle") as HTMLButtonElement;
    postFxBtn.addEventListener("click", () => {
      const isActive = postFxBtn.classList.toggle("active");
      postFxBtn.textContent = isActive ? "ON" : "OFF";
      if (this.postFxToggleHandler) {
        this.postFxToggleHandler(isActive);
      }
    });

    // Setup sky toggle button
    const skyBtn = container.querySelector("#perf-sky-toggle") as HTMLButtonElement;
    skyBtn.addEventListener("click", () => {
      const isActive = skyBtn.classList.toggle("active");
      skyBtn.textContent = isActive ? "ON" : "OFF";
      if (this.skyToggleHandler) {
        this.skyToggleHandler(isActive);
      }
    });

    // Setup water toggle button
    const waterBtn = container.querySelector("#perf-water-toggle") as HTMLButtonElement;
    waterBtn.addEventListener("click", () => {
      const isActive = waterBtn.classList.toggle("active");
      waterBtn.textContent = isActive ? "ON" : "OFF";
      if (this.waterToggleHandler) {
        this.waterToggleHandler(isActive);
      }
    });

    return container;
  }

  /**
   * Set quality level and update UI
   */
  private setQuality(level: QualityLevel): void {
    this.currentQuality = level;

    // Update button states
    const qualityBtns = this.container.querySelectorAll(".perf-quality-btn");
    qualityBtns.forEach((btn) => {
      const btnLevel = (btn as HTMLElement).dataset.quality;
      btn.classList.toggle("active", btnLevel === level);
    });

    // Call handler if set
    if (this.qualityChangeHandler) {
      this.qualityChangeHandler(level);
    }
  }

  /**
   * Set visual preset and update UI
   */
  private setPreset(preset: VisualPreset): void {
    this.currentPreset = preset;

    // Update button states
    const presetBtns = this.container.querySelectorAll(".perf-preset-btn");
    presetBtns.forEach((btn) => {
      const btnPreset = (btn as HTMLElement).dataset.preset;
      btn.classList.toggle("active", btnPreset === preset);
    });

    // Call handler if set
    if (this.presetChangeHandler) {
      this.presetChangeHandler(preset);
    }
  }

  /**
   * Run the GPU benchmark
   */
  private async runBenchmark(): Promise<void> {
    if (!this.benchmarkRunner || this.isBenchmarking) return;

    const benchmarkBtn = this.container.querySelector("#perf-benchmark") as HTMLButtonElement;
    const resultsDiv = this.container.querySelector("#perf-benchmark-results") as HTMLElement;

    // Show loading state
    this.isBenchmarking = true;
    benchmarkBtn.textContent = "Running...";
    benchmarkBtn.disabled = true;

    try {
      const result = await this.benchmarkRunner();

      // Show results
      resultsDiv.style.display = "block";

      const gpuEl = this.container.querySelector("#perf-gpu") as HTMLElement;
      const fpsEl = this.container.querySelector("#perf-bench-fps") as HTMLElement;
      const qualityEl = this.container.querySelector("#perf-quality-level") as HTMLElement;

      // Truncate GPU name if too long
      const gpuName = result.gpuInfo.length > 25
        ? result.gpuInfo.substring(0, 22) + "..."
        : result.gpuInfo;
      gpuEl.textContent = gpuName;
      gpuEl.title = result.gpuInfo; // Full name on hover

      fpsEl.textContent = result.fps.toFixed(1);

      // Color-code quality level
      qualityEl.textContent = result.qualityLevel.toUpperCase();
      qualityEl.className = "perf-value";
      switch (result.qualityLevel) {
        case "ultra":
          qualityEl.style.color = "#4caf50";
          break;
        case "high":
          qualityEl.style.color = "#8bc34a";
          break;
        case "medium":
          qualityEl.style.color = "#ff9800";
          break;
        case "low":
          qualityEl.style.color = "#f44336";
          break;
      }

      benchmarkBtn.textContent = "Run Again";
    } catch (error) {
      console.error("Benchmark failed:", error);
      benchmarkBtn.textContent = "Failed - Retry";
    } finally {
      this.isBenchmarking = false;
      benchmarkBtn.disabled = false;
    }
  }

  private createToggleButton(): HTMLElement {
    const button = document.createElement("button");
    button.id = "perf-toggle";
    button.className = "perf-toggle-btn-main";
    button.textContent = "Perf (^P)";
    button.title = "Toggle Performance Panel (Ctrl+P)";
    button.addEventListener("click", () => this.toggle());
    return button;
  }

  private addStyles(): void {
    if (document.getElementById("performance-panel-styles")) return;

    const style = document.createElement("style");
    style.id = "performance-panel-styles";
    style.textContent = `
      .performance-panel {
        position: fixed;
        top: 10px;
        right: 10px;
        background: rgba(0, 0, 0, 0.85);
        color: #fff;
        padding: 12px;
        border-radius: 8px;
        font-family: 'Courier New', monospace;
        font-size: 12px;
        min-width: 180px;
        display: none;
        z-index: 1000;
        border: 1px solid rgba(255, 255, 255, 0.2);
      }

      .performance-panel.visible {
        display: block;
      }

      .perf-header {
        border-bottom: 1px solid rgba(255, 255, 255, 0.3);
        padding-bottom: 8px;
        margin-bottom: 8px;
      }

      .perf-title {
        font-weight: bold;
        font-size: 13px;
        color: #4fc3f7;
      }

      .perf-row {
        display: flex;
        justify-content: space-between;
        padding: 3px 0;
      }

      .perf-label {
        color: #aaa;
      }

      .perf-value {
        color: #4caf50;
        font-weight: bold;
      }

      .perf-value.warning {
        color: #ff9800;
      }

      .perf-value.critical {
        color: #f44336;
      }

      .perf-divider {
        height: 1px;
        background: rgba(255, 255, 255, 0.2);
        margin: 8px 0;
      }

      .perf-toggle-btn {
        background: #333;
        color: #888;
        border: 1px solid #555;
        padding: 2px 8px;
        border-radius: 4px;
        cursor: pointer;
        font-size: 11px;
        font-family: inherit;
      }

      .perf-toggle-btn:hover {
        background: #444;
      }

      .perf-toggle-btn.active {
        background: #2e7d32;
        color: #fff;
        border-color: #4caf50;
      }

      .perf-toggle-btn-main {
        background: rgba(0, 0, 0, 0.7);
        color: #4fc3f7;
        border: 1px solid rgba(79, 195, 247, 0.5);
        padding: 4px 10px;
        border-radius: 4px;
        cursor: pointer;
        font-size: 11px;
        font-family: 'Courier New', monospace;
        margin-left: 8px;
      }

      .perf-toggle-btn-main:hover {
        background: rgba(79, 195, 247, 0.2);
      }

      .perf-toggle-btn-main.active {
        background: rgba(79, 195, 247, 0.3);
        border-color: #4fc3f7;
      }

      .perf-benchmark-btn {
        width: 100%;
        background: #1a237e;
        color: #7986cb;
        border: 1px solid #3949ab;
        padding: 6px 12px;
        border-radius: 4px;
        cursor: pointer;
        font-size: 11px;
        font-family: inherit;
        transition: all 0.2s;
      }

      .perf-benchmark-btn:hover:not(:disabled) {
        background: #283593;
        color: #9fa8da;
      }

      .perf-benchmark-btn:disabled {
        opacity: 0.6;
        cursor: wait;
      }

      .perf-benchmark-results {
        margin-top: 8px;
        padding-top: 8px;
        border-top: 1px solid rgba(255, 255, 255, 0.1);
      }

      .perf-gpu {
        font-size: 10px;
        color: #888 !important;
      }

      .perf-quality-buttons {
        display: flex;
        gap: 4px;
      }

      .perf-quality-btn {
        background: #333;
        color: #888;
        border: 1px solid #555;
        padding: 3px 8px;
        border-radius: 3px;
        cursor: pointer;
        font-size: 10px;
        font-family: inherit;
        transition: all 0.2s;
      }

      .perf-quality-btn:hover {
        background: #444;
        color: #aaa;
      }

      .perf-quality-btn.active {
        background: #2e7d32;
        color: #fff;
        border-color: #4caf50;
      }

      .perf-quality-btn[data-quality="low"].active {
        background: #c62828;
        border-color: #f44336;
      }

      .perf-quality-btn[data-quality="medium"].active {
        background: #ef6c00;
        border-color: #ff9800;
      }

      .perf-quality-btn[data-quality="high"].active {
        background: #2e7d32;
        border-color: #4caf50;
      }

      .perf-preset-buttons {
        display: flex;
        gap: 4px;
      }

      .perf-preset-btn {
        background: #333;
        color: #888;
        border: 1px solid #555;
        padding: 3px 6px;
        border-radius: 3px;
        cursor: pointer;
        font-size: 9px;
        font-family: inherit;
        transition: all 0.2s;
      }

      .perf-preset-btn:hover {
        background: #444;
        color: #aaa;
      }

      .perf-preset-btn.active {
        background: #1565c0;
        color: #fff;
        border-color: #42a5f5;
      }

      .perf-preset-btn[data-preset="default"].active {
        background: #1565c0;
        border-color: #42a5f5;
      }

      .perf-preset-btn[data-preset="matrix"].active {
        background: #2e7d32;
        border-color: #4caf50;
      }

      .perf-preset-btn[data-preset="tron"].active {
        background: #0277bd;
        border-color: #29b6f6;
      }

      .perf-slider-row {
        flex-wrap: wrap;
        gap: 4px;
      }

      .perf-slider {
        flex: 1;
        min-width: 60px;
        height: 4px;
        -webkit-appearance: none;
        appearance: none;
        background: #444;
        border-radius: 2px;
        outline: none;
        cursor: pointer;
      }

      .perf-slider::-webkit-slider-thumb {
        -webkit-appearance: none;
        appearance: none;
        width: 12px;
        height: 12px;
        border-radius: 50%;
        background: #4fc3f7;
        cursor: pointer;
      }

      .perf-slider::-moz-range-thumb {
        width: 12px;
        height: 12px;
        border-radius: 50%;
        background: #4fc3f7;
        cursor: pointer;
        border: none;
      }

      .perf-slider-value {
        color: #4fc3f7;
        font-size: 10px;
        min-width: 24px;
        text-align: right;
      }
    `;
    document.head.appendChild(style);
  }

  private attachToDOM(): void {
    document.body.appendChild(this.container);

    // Add toggle button to controls panel
    const controls = document.getElementById("controls");
    if (controls) {
      const debugRow = controls.querySelector(".debug-toggle-row");
      if (debugRow) {
        debugRow.appendChild(this.toggleButton);
      } else {
        const toggleRow = document.createElement("div");
        toggleRow.className = "control-row perf-toggle-row";
        toggleRow.appendChild(this.toggleButton);
        controls.appendChild(toggleRow);
      }
    }
  }

  private setupKeyboardShortcut(): void {
    document.addEventListener("keydown", (e) => {
      // Ctrl+P to toggle performance panel (avoid conflict with other 'P' shortcuts)
      if (e.ctrlKey && (e.key === "p" || e.key === "P")) {
        // Don't trigger if typing in an input
        if ((e.target as HTMLElement).tagName === "INPUT") return;
        e.preventDefault();
        this.toggle();
      }
    });
  }

  /**
   * Set the stats provider function
   */
  setStatsProvider(provider: () => RenderingStats): void {
    this.statsProvider = provider;
  }

  /**
   * Set the benchmark runner function
   */
  setBenchmarkRunner(runner: () => Promise<BenchmarkResult>): void {
    this.benchmarkRunner = runner;
  }

  /**
   * Set the quality change handler
   */
  setQualityChangeHandler(handler: (level: QualityLevel) => void): void {
    this.qualityChangeHandler = handler;
  }

  /**
   * Set the preset change handler
   */
  setPresetChangeHandler(handler: (preset: VisualPreset) => void): void {
    this.presetChangeHandler = handler;
  }

  /**
   * Set the brightness change handler
   */
  setBrightnessChangeHandler(handler: (brightness: number) => void): void {
    this.brightnessChangeHandler = handler;
  }

  /**
   * Set the retro toggle handler
   */
  setRetroToggleHandler(handler: (enabled: boolean) => void): void {
    this.retroToggleHandler = handler;
  }

  /**
   * Set the post-processing toggle handler
   */
  setPostFxToggleHandler(handler: (enabled: boolean) => void): void {
    this.postFxToggleHandler = handler;
  }

  /**
   * Set the sky toggle handler
   */
  setSkyToggleHandler(handler: (enabled: boolean) => void): void {
    this.skyToggleHandler = handler;
  }

  /**
   * Set the water toggle handler
   */
  setWaterToggleHandler(handler: (enabled: boolean) => void): void {
    this.waterToggleHandler = handler;
  }

  /**
   * Update the retro button state (called when preset changes)
   */
  setRetroState(enabled: boolean): void {
    const retroBtn = this.container.querySelector("#perf-retro-toggle") as HTMLButtonElement;
    if (retroBtn) {
      retroBtn.classList.toggle("active", enabled);
      retroBtn.textContent = enabled ? "ON" : "OFF";
    }
  }

  /**
   * Update the brightness slider (called when preset changes)
   */
  setBrightness(value: number): void {
    this.currentBrightness = value;
    const slider = this.container.querySelector("#perf-brightness") as HTMLInputElement;
    const valDisplay = this.container.querySelector("#perf-brightness-val") as HTMLElement;
    if (slider) slider.value = String(value);
    if (valDisplay) valDisplay.textContent = value.toFixed(1);
  }

  /**
   * Get current brightness
   */
  getBrightness(): number {
    return this.currentBrightness;
  }

  /**
   * Get current quality level
   */
  getQuality(): QualityLevel {
    return this.currentQuality;
  }

  /**
   * Get current visual preset
   */
  getPreset(): VisualPreset {
    return this.currentPreset;
  }

  /**
   * Call this every frame to track FPS
   */
  tick(): void {
    this.frames++;
  }

  /**
   * Start automatic stat updates
   */
  private startUpdates(): void {
    if (this.updateInterval !== null) return;

    this.updateInterval = window.setInterval(() => {
      this.updateStats();
    }, 250); // Update 4 times per second
  }

  /**
   * Stop automatic stat updates
   */
  private stopUpdates(): void {
    if (this.updateInterval !== null) {
      clearInterval(this.updateInterval);
      this.updateInterval = null;
    }
  }

  /**
   * Update displayed statistics
   */
  private updateStats(): void {
    // Calculate FPS
    const now = performance.now();
    const elapsed = now - this.lastTime;
    if (elapsed >= 1000) {
      this.fps = Math.round((this.frames * 1000) / elapsed);
      this.frames = 0;
      this.lastTime = now;
    }

    // Update FPS display
    const fpsEl = this.container.querySelector("#perf-fps") as HTMLElement;
    if (fpsEl) {
      fpsEl.textContent = String(this.fps);
      fpsEl.className = "perf-value";
      if (this.fps < 30) fpsEl.classList.add("critical");
      else if (this.fps < 50) fpsEl.classList.add("warning");
    }

    // Update rendering stats
    if (this.statsProvider) {
      const stats = this.statsProvider();

      const blocksEl = this.container.querySelector("#perf-blocks") as HTMLElement;
      const drawCallsEl = this.container.querySelector("#perf-drawcalls") as HTMLElement;
      const trianglesEl = this.container.querySelector("#perf-triangles") as HTMLElement;
      const modeEl = this.container.querySelector("#perf-mode") as HTMLElement;
      const culledEl = this.container.querySelector("#perf-culled") as HTMLElement;
      const cullPctEl = this.container.querySelector("#perf-cull-pct") as HTMLElement;
      const cullingRows = this.container.querySelectorAll(".perf-culling") as NodeListOf<HTMLElement>;

      if (blocksEl) blocksEl.textContent = stats.totalBlocks.toLocaleString();
      if (drawCallsEl) {
        drawCallsEl.textContent = String(stats.drawCalls);
        drawCallsEl.className = "perf-value";
        if (stats.drawCalls > 100) drawCallsEl.classList.add("warning");
        if (stats.drawCalls > 500) drawCallsEl.classList.add("critical");
      }
      if (trianglesEl) {
        trianglesEl.textContent = stats.estimatedTriangles.toLocaleString();
        trianglesEl.className = "perf-value";
        if (stats.estimatedTriangles > 100000) trianglesEl.classList.add("warning");
        if (stats.estimatedTriangles > 500000) trianglesEl.classList.add("critical");
      }
      if (modeEl) {
        modeEl.textContent = stats.renderMode;
        modeEl.className = "perf-value";
        if (stats.renderMode === "greedy") modeEl.style.color = "#4caf50";
        else if (stats.renderMode === "instancing") modeEl.style.color = "#4fc3f7";
        else modeEl.style.color = "#ff9800";
      }

      // Show/hide culling stats based on render mode
      const showCulling = stats.renderMode === "greedy" && stats.culledFaces !== undefined;
      cullingRows.forEach(row => {
        row.style.display = showCulling ? "flex" : "none";
      });

      if (showCulling) {
        if (culledEl) culledEl.textContent = stats.culledFaces!.toLocaleString();
        if (cullPctEl) cullPctEl.textContent = `${stats.cullPercentage!.toFixed(1)}%`;
      }
    }
  }

  toggle(): void {
    this.isVisible = !this.isVisible;
    this.container.classList.toggle("visible", this.isVisible);
    this.toggleButton.classList.toggle("active", this.isVisible);

    if (this.isVisible) {
      this.startUpdates();
    } else {
      this.stopUpdates();
    }
  }

  show(): void {
    if (!this.isVisible) this.toggle();
  }

  hide(): void {
    if (this.isVisible) this.toggle();
  }

  isShowing(): boolean {
    return this.isVisible;
  }
}
