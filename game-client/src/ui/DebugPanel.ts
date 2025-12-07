import { eventBus, GameEvents } from "../core/EventBus";

/**
 * DebugPanel - Displays real-time game events for debugging
 *
 * Shows a toggleable panel below the controls that logs all EventBus events.
 */

interface EventLogEntry {
  timestamp: number;
  event: string;
  data: unknown;
}

export class DebugPanel {
  private container: HTMLElement;
  private toggleButton: HTMLElement;
  private eventList: HTMLElement;
  private isVisible: boolean = false;
  private eventLog: EventLogEntry[] = [];
  private maxEvents: number = 50;
  private isPaused: boolean = false;

  constructor() {
    this.container = this.createContainer();
    this.toggleButton = this.createToggleButton();
    this.eventList = this.container.querySelector(".debug-events")!;

    this.attachToDOM();
    this.subscribeToAllEvents();
  }

  private createContainer(): HTMLElement {
    const container = document.createElement("div");
    container.id = "debug-panel";
    container.className = "debug-panel";
    container.innerHTML = `
      <div class="debug-header">
        <span class="debug-title">Events</span>
        <div class="debug-controls">
          <button class="debug-btn debug-pause" title="Pause/Resume">||</button>
          <button class="debug-btn debug-clear" title="Clear">X</button>
        </div>
      </div>
      <div class="debug-events"></div>
    `;

    // Setup button handlers
    const pauseBtn = container.querySelector(".debug-pause")!;
    const clearBtn = container.querySelector(".debug-clear")!;

    pauseBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      this.isPaused = !this.isPaused;
      pauseBtn.textContent = this.isPaused ? ">" : "||";
      pauseBtn.classList.toggle("paused", this.isPaused);
    });

    clearBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      this.clearEvents();
    });

    return container;
  }

  private createToggleButton(): HTMLElement {
    const button = document.createElement("button");
    button.id = "debug-toggle";
    button.className = "debug-toggle-btn";
    button.textContent = "Debug (^D)";
    button.title = "Toggle Debug Panel (Ctrl+D)";
    button.addEventListener("click", () => this.toggle());
    return button;
  }

  private attachToDOM(): void {
    // Find controls panel and add toggle button below it
    const controls = document.getElementById("controls");
    if (controls) {
      // Look for existing debug-toggle-row or create one
      let toggleRow = controls.querySelector(".debug-toggle-row");
      if (!toggleRow) {
        toggleRow = document.createElement("div");
        toggleRow.className = "control-row debug-toggle-row";
        controls.appendChild(toggleRow);
      }
      toggleRow.appendChild(this.toggleButton);

      // Insert debug panel after controls
      controls.parentNode?.insertBefore(this.container, controls.nextSibling);
    }

    // Setup keyboard shortcut
    this.setupKeyboardShortcut();
  }

  private setupKeyboardShortcut(): void {
    document.addEventListener("keydown", (e) => {
      // Ctrl+D to toggle debug panel
      if (e.ctrlKey && (e.key === "d" || e.key === "D")) {
        // Don't trigger if typing in an input
        if ((e.target as HTMLElement).tagName === "INPUT") return;
        e.preventDefault();
        this.toggle();
      }
    });
  }

  private subscribeToAllEvents(): void {
    // Get all event names from GameEvents interface
    // Excluding high-frequency events like camera:moved
    const eventNames: (keyof GameEvents)[] = [
      "state:modeChanged",
      "state:viewModeChanged",
      "input:click",
      "input:rightClick",
      "input:keyDown",
      "input:keyUp",
      "character:destinationSet",
      "character:waypointQueued",
      "character:arrivedAtDestination",
      "character:collided",
      "structure:placed",
      "structure:removed",
      "structure:selected",
      "structure:rotated",
      "structure:placementCancelled",
      "chunk:generated",
      // "camera:moved",      // Excluded: fires every frame
      // "character:moved",   // Excluded: fires every frame while moving
    ];

    eventNames.forEach((eventName) => {
      eventBus.on(eventName, (data) => {
        this.logEvent(eventName, data);
      });
    });
  }

  private logEvent(event: string, data: unknown): void {
    if (this.isPaused) return;

    const entry: EventLogEntry = {
      timestamp: Date.now(),
      event,
      data,
    };

    this.eventLog.unshift(entry);

    // Trim old events
    if (this.eventLog.length > this.maxEvents) {
      this.eventLog.pop();
    }

    if (this.isVisible) {
      this.renderEvent(entry, true);
    }
  }

  private renderEvent(entry: EventLogEntry, prepend: boolean = false): void {
    const eventEl = document.createElement("div");
    eventEl.className = "debug-event";

    const time = new Date(entry.timestamp);
    const timeStr = time.toLocaleTimeString("en-US", {
      hour12: false,
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });

    // Color-code by event category
    const category = entry.event.split(":")[0];
    eventEl.dataset.category = category;

    // Format data nicely
    let dataStr = "";
    if (entry.data !== undefined && entry.data !== null) {
      if (typeof entry.data === "object") {
        dataStr = JSON.stringify(entry.data);
        // Truncate long data
        if (dataStr.length > 60) {
          dataStr = dataStr.substring(0, 57) + "...";
        }
      } else {
        dataStr = String(entry.data);
      }
    }

    eventEl.innerHTML = `
      <span class="debug-time">${timeStr}</span>
      <span class="debug-event-name">${entry.event}</span>
      ${dataStr ? `<span class="debug-data">${dataStr}</span>` : ""}
    `;

    if (prepend) {
      this.eventList.insertBefore(eventEl, this.eventList.firstChild);
      // Remove excess elements from DOM
      while (this.eventList.children.length > this.maxEvents) {
        this.eventList.removeChild(this.eventList.lastChild!);
      }
    } else {
      this.eventList.appendChild(eventEl);
    }
  }

  private renderAllEvents(): void {
    this.eventList.innerHTML = "";
    this.eventLog.forEach((entry) => this.renderEvent(entry, false));
  }

  private clearEvents(): void {
    this.eventLog = [];
    this.eventList.innerHTML = "";
  }

  toggle(): void {
    this.isVisible = !this.isVisible;
    this.container.classList.toggle("visible", this.isVisible);
    this.toggleButton.classList.toggle("active", this.isVisible);

    if (this.isVisible) {
      this.renderAllEvents();
    }
  }

  show(): void {
    if (!this.isVisible) this.toggle();
  }

  hide(): void {
    if (this.isVisible) this.toggle();
  }
}
