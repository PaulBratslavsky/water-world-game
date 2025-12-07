/**
 * EventBus - Pub/Sub system for decoupled communication between game systems
 *
 * Usage:
 *   eventBus.on('player:moved', (data) => console.log(data));
 *   eventBus.emit('player:moved', { x: 10, z: 20 });
 */

type EventCallback<T = unknown> = (data: T) => void;

interface EventSubscription {
  unsubscribe: () => void;
}

class EventBusClass {
  private listeners: Map<string, Set<EventCallback>> = new Map();

  /**
   * Subscribe to an event
   */
  on<T = unknown>(event: string, callback: EventCallback<T>): EventSubscription {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, new Set());
    }

    this.listeners.get(event)!.add(callback as EventCallback);

    return {
      unsubscribe: () => this.off(event, callback),
    };
  }

  /**
   * Subscribe to an event only once
   */
  once<T = unknown>(event: string, callback: EventCallback<T>): EventSubscription {
    const wrappedCallback: EventCallback<T> = (data) => {
      this.off(event, wrappedCallback);
      callback(data);
    };

    return this.on(event, wrappedCallback);
  }

  /**
   * Unsubscribe from an event
   */
  off<T = unknown>(event: string, callback: EventCallback<T>): void {
    const callbacks = this.listeners.get(event);
    if (callbacks) {
      callbacks.delete(callback as EventCallback);
    }
  }

  /**
   * Emit an event with data
   */
  emit<T = unknown>(event: string, data?: T): void {
    const callbacks = this.listeners.get(event);
    if (callbacks) {
      callbacks.forEach((callback) => callback(data));
    }
  }

  /**
   * Remove all listeners for an event (or all events if no event specified)
   */
  clear(event?: string): void {
    if (event) {
      this.listeners.delete(event);
    } else {
      this.listeners.clear();
    }
  }
}

// Singleton instance
export const eventBus = new EventBusClass();

// Event type definitions for type safety
export interface GameEvents {
  // State events
  "state:modeChanged": { mode: "move" | "build" };
  "state:viewModeChanged": { viewMode: "third-person" | "first-person"; previous: "third-person" | "first-person" };
  "state:cameraModeChanged": { cameraMode: "first-person" | "third-person" | "build"; previous: "first-person" | "third-person" | "build" };
  "state:freePlacementChanged": { enabled: boolean };
  "state:selectionModeChanged": { active: boolean };
  "state:prefabCaptureChanged": { active: boolean }; // Legacy alias for selectionModeChanged
  "state:renderModeChanged": { renderMode: "solid" | "wireframe" };
  "state:showMaterialsChanged": { show: boolean };
  "state:connectionModeChanged": { connectionMode: "single-player" | "online" | "explorer" | "dev"; previous: "single-player" | "online" | "explorer" | "dev" };

  // Selection events (replaces prefab capture events)
  "selection:complete": {
    minX: number; minY: number; minZ: number;
    maxX: number; maxY: number; maxZ: number;
    blockCount: number;
  };
  "selection:cancelled": void;
  "selection:actionRequested": { action: "cut" | "copy" | "delete" | "createPrefab" };
  "selection:levelChanged": { bottomLevel: number; topLevel: number; height: number };

  // Legacy prefab capture events (aliases)
  "prefabCapture:selectionComplete": {
    minX: number; minY: number; minZ: number;
    maxX: number; maxY: number; maxZ: number;
    blockCount: number;
  };
  "prefabCapture:cancelled": void;
  "prefabCapture:saved": { prefabId: string; name: string };
  "prefabCapture:levelChanged": { bottomLevel: number; topLevel: number; height: number };

  // Input events
  "input:click": { worldX: number; worldY: number; worldZ: number; gridX: number; gridY: number; gridZ: number };
  "input:rightClick": { worldX: number; worldY: number; worldZ: number; gridX: number; gridY: number; gridZ: number };
  "input:keyDown": { key: string; shiftKey?: boolean; ctrlKey?: boolean };
  "input:keyUp": { key: string };

  // Character events
  "character:moved": { x: number; z: number };
  "character:destinationSet": { x: number; z: number };
  "character:waypointQueued": { x: number; z: number; queuePosition: number };
  "character:arrivedAtDestination": { x: number; z: number };
  "character:collided": { x: number; z: number };

  // Structure events
  "structure:placed": { id: string; gridX: number; gridZ: number };
  "structure:removed": { id: string; gridX: number; gridZ: number };
  "structure:selected": { structureId: string };
  "structure:rotated": void;
  "structure:placementCancelled": void;
  "structure:levelChanged": { level: number; maxLevel: number };

  // Block editor events
  "block:materialChanged": {
    blockId: string;
    material: {
      metalness?: number;
      roughness?: number;
      emissive?: string;
      emissiveIntensity?: number;
      opacity?: number;
      transparent?: boolean;
    };
  };

  // Prefab events
  "prefab:selected": { prefabId: string };
  "prefab:cancelPlacement": void;

  // Camera events
  "camera:moved": { x: number; z: number };

  // Chunk events
  "chunk:generated": { chunkX: number; chunkZ: number };

  // Save/Load events
  "game:saved": { blockCount: number; timestamp: string };
  "game:loaded": { blockCount: number; timestamp: string };
  "game:reset": void;

  // World events
  "world:connected": { worldId: string };
  "world:disconnected": void;
}

// Type-safe emit helper
export function emitEvent<K extends keyof GameEvents>(
  event: K,
  data: GameEvents[K]
): void {
  eventBus.emit(event, data);
}

// Type-safe subscribe helper
export function onEvent<K extends keyof GameEvents>(
  event: K,
  callback: EventCallback<GameEvents[K]>
): EventSubscription {
  return eventBus.on(event, callback);
}
