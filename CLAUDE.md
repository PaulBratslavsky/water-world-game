# Three.js Multiplayer Game Project

## Project Structure

```
three-js/
├── game-client/          # Three.js game client (Vite + TypeScript)
├── game-server/          # WebSocket multiplayer server (standalone)
├── game-data-server/     # Strapi CMS for world persistence
└── getting-started/      # Development workspace (this folder)
```

## Architecture

### Game Client (`game-client/`)
- **Framework**: Three.js with TypeScript, Vite bundler
- **Post-processing**: EffectComposer with custom shaders
- **Visual Presets**: Default, Matrix, Tron (configurable lighting/colors)
- **Custom Effects**: RetroShader (pixelation, scanlines, chromatic aberration, film grain)
- **Systems**: SkySystem, WaterSystem, PlacementSystem (block building)
- **Multiplayer**: WebSocket client connecting to game-server
- **UI**: PerformancePanel with toggles for brightness, Retro FX, Post FX, Sky, Water

### Game Server (`game-server/`)
- **Runtime**: Node.js with TypeScript (tsx for dev)
- **WebSocket**: `ws` library for real-time multiplayer
- **Physics**: Server-authoritative movement with collision detection
- **Persistence**: Saves world state to Strapi CMS
- **Shared Types**: `src/shared/NetworkProtocol.ts`, `src/shared/PlayerState.ts`

**Environment Variables:**
- `PORT` - Server port (default: 3001)
- `STRAPI_URL` - Strapi CMS URL (default: http://localhost:1337)

**Scripts:**
```bash
npm run dev    # Development with hot reload
npm run build  # TypeScript build
npm start      # Production
```

### Game Data Server (`game-data-server/`)
- **CMS**: Strapi v5
- **Purpose**: World saves persistence, game configuration
- **API**: REST endpoints at `/api/saves`

## Key Files

### Client
- `src/main.ts` - Game entry point, system initialization
- `src/rendering/PostProcessing.ts` - EffectComposer, RetroShader, visual presets
- `src/ui/PerformancePanel.ts` - UI controls (brightness, toggles)
- `src/systems/SkySystem.ts` - Skybox with clouds
- `src/systems/WaterSystem.ts` - Water plane with reflections
- `src/network/NetworkProtocol.ts` - Shared message types
- `src/network/NetworkManager.ts` - WebSocket client

### Server
- `src/GameServer.ts` - Main WebSocket server, physics, world sync
- `src/shared/NetworkProtocol.ts` - Message types (copy of client's)
- `src/shared/PlayerState.ts` - Player state interface

## Deployment Strategy

| Service | Platform | Notes |
|---------|----------|-------|
| Game Client | Netlify | Static build, set `VITE_SOCKET_URL` |
| Game Server | Railway/Render | WebSocket support, set `PORT`, `STRAPI_URL` |
| Strapi CMS | Strapi Cloud | Database included |

## Development Commands

```bash
# Client
cd game-client
npm run dev

# Server
cd game-server
npm run dev

# Strapi
cd game-data-server
npm run develop
```

## Visual Effects System

### RetroShader Features
- Pixelation (configurable resolution)
- Scanlines with adjustable intensity
- Color banding (reduced color palette)
- Chromatic aberration
- Vignette
- Film grain

### Performance Panel Controls
- Brightness slider (0.2 - 2.0)
- Retro FX toggle
- Post FX toggle (disables all post-processing)
- Sky toggle
- Water toggle

## Multiplayer Protocol

Messages flow: Client → Server → Broadcast to all clients

**Client Messages:**
- `client:join` - Join world with worldId
- `player:input` - Movement inputs
- `block:placed` / `block:removed` - Building
- `world:save` / `world:reset` - World management

**Server Messages:**
- `welcome` - Initial state on join
- `player:state` - Authoritative position updates
- `player:join` / `player:leave` - Player events
- `block:placed` / `block:removed` - Block sync

## Notes

- Server has duplicate shared types (NetworkProtocol, PlayerState) - keep in sync with client
- Old server code still exists at `game-client/server/` - can be deleted after verifying new server works
- Client needs `VITE_SOCKET_URL` env var to connect to deployed server
