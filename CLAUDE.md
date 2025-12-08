# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Development Commands

```bash
# Run all services concurrently (client @ 5200, server @ 3001, Strapi @ 1337)
npm run dev

# Run individual services
npm run dev:client    # Game client only
npm run dev:server    # Game server only
npm run dev:strapi    # Strapi CMS only

# Install all dependencies
npm run install:all
```

### Per-Package Commands

**Game Client** (`game-client/`):
```bash
npm run dev       # Vite dev server on port 5200
npm run build     # Production build to dist/
npm run preview   # Preview production build
npm run deploy    # Build and deploy to Netlify
```

**Game Server** (`game-server/`):
```bash
npm run dev       # tsx watch with hot reload
npm run build     # TypeScript compilation to dist/
npm start         # Production server
```

**Strapi CMS** (`game-data-server/`):
```bash
npm run develop   # Dev server with hot reload
npm run build     # Build admin panel
npm start         # Production
```

## Architecture Overview

This is a monorepo with three independent services:

```
three-js/
├── game-client/      # Three.js voxel game (Vite + TypeScript)
├── game-server/      # WebSocket multiplayer server (Node.js)
└── game-data-server/ # Strapi v5 CMS for persistence
```

### Client Architecture (`game-client/src/`)

**Core Systems** (`core/`):
- `EventBus.ts` - Singleton pub/sub for loose coupling between systems
- `StateManager.ts` - Game state (camera mode, build mode, connection mode)
- `PlayerController.ts` - Movement with gravity, jumping, sprinting, collision
- `InputManager.ts` - Keyboard/mouse with configurable bindings
- `SaveSystem.ts` - Local storage and Strapi world saves

**Rendering** (`systems/`):
- `PostProcessing.ts` - EffectComposer with RetroShader (pixelation, scanlines, chromatic aberration)
- `VisualPresets.ts` - Default, Matrix, Tron lighting/color presets
- `SkySystem.ts` - Procedural skybox with animated clouds
- `WaterSystem.ts` - Water plane with reflections
- `QualityManager.ts` - Performance scaling

**World/Building** (`structures/`, `grid/`):
- `PlacementSystem.ts` - Block placement with instanced mesh and greedy meshing
- `ChunkManager.ts` - Dynamic chunk generation based on render distance
- `GreedyMesher.ts` - Optimized mesh combining for adjacent blocks

**Multiplayer** (`network/`):
- `NetworkManager.ts` - WebSocket client with auto-reconnect
- `NetworkProtocol.ts` - Shared message types (duplicated in server)

**Connection Modes**: `single-player` (local only), `online` (WebSocket), `explorer` (read-only), `dev` (direct Strapi)

### Server Architecture (`game-server/src/`)

- `GameServer.ts` - WebSocket server with server-authoritative physics
- `shared/NetworkProtocol.ts` - Message types (keep in sync with client)
- `shared/PlayerState.ts` - Player state interface

**Game Loop**: 20 Hz tick rate. Server processes inputs, updates positions, checks collisions, broadcasts state.

### Multiplayer Protocol

Client → Server:
- `client:join` (worldId) → `player:input` (movement) → `block:placed/removed`

Server → Client:
- `welcome` (initial state) → `player:state` (position updates) → `player:join/leave`

## Key Conventions

**Event naming**: `domain:action` format (e.g., `player:joined`, `block:placed`)

**Shared types**: `NetworkProtocol.ts` and `PlayerState.ts` exist in both client and server. When modifying, update both:
- `game-client/src/network/NetworkProtocol.ts`
- `game-server/src/shared/NetworkProtocol.ts`

**Coordinates**: Y-up world space. Grid uses cell-based integer positions.

## Environment Variables

**Client** (`.env` with `VITE_` prefix):
```
VITE_SOCKET_URL=ws://localhost:3001
VITE_STRAPI_URL=http://localhost:1337
VITE_STRAPI_API_TOKEN=your_token
```

**Server** (`.env`):
```
PORT=3001
STRAPI_URL=http://localhost:1337
STRAPI_API_TOKEN=your_token
```

## Deployment

Deploy in order: **Strapi Cloud** → **Railway** (game server) → **Netlify** (client)

| Service | Platform | Config |
|---------|----------|--------|
| Client | Netlify | Base: `game-client`, set `VITE_SOCKET_URL` |
| Server | Railway | Root: `game-server`, set `STRAPI_URL` |
| Strapi | Strapi Cloud | Root: `game-data-server` |

See `deployment-guide.md` for full instructions.
