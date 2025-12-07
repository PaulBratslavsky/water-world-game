# Should We Move WebSocket Server into Strapi?

This document analyzes whether to move the game server's WebSocket functionality directly into Strapi, exposing it via custom routes.

---

## Architecture Comparison

### Current Architecture (Separate Servers)

```mermaid
graph TB
    subgraph Browser["Browser (Client)"]
        UI[UI / Game]
        NM[NetworkManager]
    end

    subgraph GameServer["Game Server :3001"]
        WS[WebSocket Server]
        GL[Game Loop<br/>20 ticks/sec]
        PM[Player Manager]
        BM[Block Manager]
    end

    subgraph Strapi["Strapi CMS :1337"]
        API[REST API]
        ES[Entity Service]
        DB[(SQLite/Postgres)]
    end

    UI --> NM
    NM <-->|WebSocket| WS
    WS --> GL
    GL --> PM
    GL --> BM
    BM -->|REST: GET /api/saves/:id| API
    BM -->|REST: PUT /api/saves/:id| API
    API --> ES
    ES --> DB

    style GameServer fill:#4a9eff,color:#fff
    style Strapi fill:#8b5cf6,color:#fff
```

### Proposed Architecture (Strapi Integrated)

```mermaid
graph TB
    subgraph Browser["Browser (Client)"]
        UI[UI / Game]
        NM[NetworkManager]
    end

    subgraph Strapi["Strapi CMS :1337"]
        WS[WebSocket Server<br/>/ws path]
        GL[Game Loop<br/>20 ticks/sec]
        PM[Player Manager]
        BM[Block Manager]
        API[REST API]
        ES[Entity Service]
        DB[(SQLite/Postgres)]
    end

    UI --> NM
    NM <-->|WebSocket :1337/ws| WS
    WS --> GL
    GL --> PM
    GL --> BM
    BM -->|Direct Call| ES
    API --> ES
    ES --> DB

    style Strapi fill:#8b5cf6,color:#fff
```

---

## Data Flow Comparison

### Current: REST API for Persistence

```mermaid
sequenceDiagram
    participant C as Client
    participant GS as Game Server :3001
    participant ST as Strapi :1337
    participant DB as Database

    C->>GS: WebSocket: client:join {worldId}
    GS->>ST: HTTP GET /api/saves/{worldId}
    ST->>DB: SELECT * FROM saves
    DB-->>ST: World data
    ST-->>GS: JSON response
    GS->>GS: Parse & load blocks
    GS-->>C: WebSocket: welcome

    Note over GS: Auto-save every 10s

    GS->>ST: HTTP PUT /api/saves/{worldId}
    ST->>DB: UPDATE saves SET data=...
    DB-->>ST: OK
    ST-->>GS: 200 OK
```

### Proposed: Direct Entity Service

```mermaid
sequenceDiagram
    participant C as Client
    participant ST as Strapi :1337
    participant ES as Entity Service
    participant DB as Database

    C->>ST: WebSocket /ws: client:join {worldId}
    ST->>ES: entityService.findOne("api::save.save", worldId)
    ES->>DB: SELECT * FROM saves
    DB-->>ES: World data
    ES-->>ST: JavaScript object
    ST->>ST: Load blocks directly
    ST-->>C: WebSocket: welcome

    Note over ST: Auto-save every 10s

    ST->>ES: entityService.update("api::save.save", worldId, data)
    ES->>DB: UPDATE saves SET data=...
    DB-->>ES: OK
```

---

## How to Implement in Strapi

### Bootstrap WebSocket Server

```typescript
// src/index.ts (Strapi app entry)
import { WebSocketServer } from "ws";

export default {
  register() {},

  bootstrap({ strapi }) {
    // Get the underlying HTTP server from Strapi
    const httpServer = strapi.server.httpServer;

    // Attach WebSocket server to same port, different path
    const wss = new WebSocketServer({ server: httpServer, path: "/ws" });

    wss.on("connection", (ws) => {
      ws.on("message", async (data) => {
        const message = JSON.parse(data.toString());

        if (message.type === "client:join") {
          // Direct database access via Strapi Entity Service
          const world = await strapi.entityService.findOne(
            "api::save.save",
            message.worldId
          );
          // ... handle connection
        }
      });
    });

    // Store reference for use elsewhere
    strapi.wss = wss;
  },
};
```

### Game Loop Integration

```typescript
// In Strapi bootstrap
let players = new Map();
let blocks = new Map();
let worldId = null;

// Start game loop (20 ticks/sec)
setInterval(() => {
  updatePlayers(0.05);
  broadcastPlayerStates();
}, 50);

// Save to database directly (no HTTP overhead)
async function saveWorld() {
  if (!worldId) return;

  await strapi.entityService.update("api::save.save", worldId, {
    data: {
      data: {
        version: 1,
        timestamp: new Date().toISOString(),
        blocks: Array.from(blocks.values()),
      },
    },
  });
}
```

---

## Pros and Cons

### Pros of Moving to Strapi

```mermaid
graph LR
    subgraph Pros["Advantages"]
        P1[Single Deployment<br/>One server to manage]
        P2[Direct DB Access<br/>No REST overhead]
        P3[Shared Auth<br/>Use Strapi users]
        P4[Single Port<br/>No CORS issues]
        P5[Plugin Potential<br/>Reusable package]
    end

    style Pros fill:#4ade80,color:#000
```

| Benefit | Description |
|---------|-------------|
| **Single deployment** | One server to manage instead of two |
| **Direct DB access** | No REST API overhead - use `strapi.entityService` directly |
| **Shared authentication** | Use Strapi's auth system for players |
| **Single port** | Simpler networking, no CORS between servers |
| **Plugin ecosystem** | Could create a reusable "game server" plugin |
| **Simpler dev setup** | One `npm run develop` instead of two servers |

### Cons of Moving to Strapi

```mermaid
graph LR
    subgraph Cons["Disadvantages"]
        C1[Coupled Lifecycle<br/>Restart kills connections]
        C2[Scaling Limits<br/>Can't scale independently]
        C3[Resource Contention<br/>Shared CPU/memory]
        C4[Mixed Concerns<br/>CMS + Game in one]
        C5[Update Risk<br/>Strapi updates may break]
    end

    style Cons fill:#ff6b6b,color:#000
```

| Drawback | Description |
|----------|-------------|
| **Coupled to Strapi** | Game server lifecycle tied to CMS |
| **Scaling limits** | Can't scale game server independently from CMS |
| **Strapi overhead** | CMS features you don't need running alongside game loop |
| **Restart impact** | Strapi restart (e.g., content type change) kills all game connections |
| **Memory contention** | Game loop + CMS compete for resources |
| **Debugging complexity** | Game issues mixed with CMS issues in logs |
| **Update risk** | Strapi updates could break custom WebSocket code |

---

## Scaling Comparison

### Current: Independent Scaling

```mermaid
graph TB
    subgraph Clients
        C1[Client 1]
        C2[Client 2]
        C3[Client 3]
        C4[Client 4]
    end

    subgraph LoadBalancer["Load Balancer"]
        LB[nginx / HAProxy]
    end

    subgraph GameServers["Game Servers (Scalable)"]
        GS1[Game Server 1<br/>World A]
        GS2[Game Server 2<br/>World B]
        GS3[Game Server 3<br/>World C]
    end

    subgraph Backend["Shared Backend"]
        ST[Strapi CMS]
        DB[(Database)]
    end

    C1 --> LB
    C2 --> LB
    C3 --> LB
    C4 --> LB
    LB --> GS1
    LB --> GS2
    LB --> GS3
    GS1 --> ST
    GS2 --> ST
    GS3 --> ST
    ST --> DB

    style GameServers fill:#4ade80,color:#000
```

### Proposed: Coupled Scaling

```mermaid
graph TB
    subgraph Clients
        C1[Client 1]
        C2[Client 2]
        C3[Client 3]
        C4[Client 4]
    end

    subgraph LoadBalancer["Load Balancer"]
        LB[nginx / HAProxy]
    end

    subgraph StrapiInstances["Strapi Instances (Must scale together)"]
        ST1[Strapi 1<br/>CMS + Game Server]
        ST2[Strapi 2<br/>CMS + Game Server]
    end

    subgraph Backend["Shared Database"]
        DB[(Database)]
    end

    C1 --> LB
    C2 --> LB
    C3 --> LB
    C4 --> LB
    LB --> ST1
    LB --> ST2
    ST1 --> DB
    ST2 --> DB

    style StrapiInstances fill:#fbbf24,color:#000
```

**Problem**: With Strapi integration, you can't scale game servers without also scaling the CMS. Each instance needs to sync player state, adding complexity.

---

## Restart Impact Comparison

### Current: Isolated Restarts

```mermaid
sequenceDiagram
    participant C as Clients
    participant GS as Game Server
    participant ST as Strapi

    Note over ST: Strapi restarts (content type change)
    ST->>ST: Restart
    Note over C,GS: Game continues uninterrupted!
    C->>GS: Still playing...
    GS->>GS: Game loop running
    ST->>ST: Back online
    GS->>ST: Resume saving

    Note over GS: Game Server restarts (code update)
    GS->>C: Connection closed
    C->>C: Reconnect
    C->>GS: Rejoin world
    Note over ST: Strapi unaffected
```

### Proposed: Coupled Restarts

```mermaid
sequenceDiagram
    participant C as Clients
    participant ST as Strapi + Game

    Note over ST: ANY restart (CMS or game code)
    ST->>C: All connections closed!
    ST->>ST: Restart
    Note over C: All players disconnected
    C->>C: Wait for server...
    ST->>ST: Back online
    C->>ST: Reconnect
    C->>ST: Rejoin world
    Note over C: Lost unsaved progress!
```

---

## Comparison Summary

| Factor | Separate Server | Strapi Integrated |
|--------|-----------------|-------------------|
| Deployment | 2 servers | 1 server |
| Scaling | Independent | Coupled |
| DB access | REST API calls | Direct entityService |
| Ports | 2 (3001, 1337) | 1 (1337) |
| Memory | Separate processes | Shared process |
| Restart impact | Independent | All connections lost |
| Code organization | Clean separation | Mixed concerns |
| Save latency | ~5-10ms (HTTP) | ~1-2ms (direct) |
| Debugging | Separate logs | Mixed logs |

---

## Hybrid Approach (Best of Both)

A middle ground: Use Strapi as a "connection broker" while keeping the game server separate:

```mermaid
graph TB
    subgraph Browser["Browser"]
        UI[UI]
        NM[NetworkManager]
    end

    subgraph Strapi["Strapi :1337"]
        API[REST API]
        VAL[World Validator]
        ES[Entity Service]
        DB[(Database)]
    end

    subgraph GameServer["Game Server :3001"]
        WS[WebSocket]
        GL[Game Loop]
    end

    UI -->|1. GET /game/server/:worldId| API
    API --> VAL
    VAL --> ES
    ES --> DB
    API -->|2. Return {wsUrl, worldId}| UI
    UI --> NM
    NM -->|3. WebSocket connect| WS
    WS --> GL
    GL -->|4. Save blocks| API

    style Strapi fill:#8b5cf6,color:#fff
    style GameServer fill:#4a9eff,color:#fff
```

### Implementation

```typescript
// Strapi custom controller: src/api/game/controllers/game.ts
export default {
  async getGameServer(ctx) {
    const { worldId } = ctx.params;

    // Validate world exists
    const world = await strapi.entityService.findOne(
      "api::save.save",
      worldId,
      { fields: ["documentId", "name", "version"] }
    );

    if (!world) {
      return ctx.notFound("World not found");
    }

    // Return game server connection info
    return {
      websocketUrl: process.env.GAME_SERVER_URL || "ws://localhost:3001",
      worldId: world.documentId,
      name: world.name,
      version: world.version,
    };
  },
};
```

```typescript
// Strapi custom route: src/api/game/routes/game.ts
export default {
  routes: [
    {
      method: "GET",
      path: "/game/server/:worldId",
      handler: "game.getGameServer",
      config: {
        auth: false, // or require auth
      },
    },
  ],
};
```

### Hybrid Benefits

```mermaid
graph LR
    subgraph Benefits["Hybrid Approach Benefits"]
        B1[Strapi validates worlds]
        B2[Strapi handles auth]
        B3[Game server stays independent]
        B4[Can load-balance game servers]
        B5[Clean separation maintained]
    end

    style Benefits fill:#4ade80,color:#000
```

---

## Decision Matrix

```mermaid
graph TD
    Q1{How many concurrent players?}
    Q1 -->|< 10| A1[Consider Strapi Integration]
    Q1 -->|10-100| A2[Keep Separate]
    Q1 -->|> 100| A3[Definitely Keep Separate]

    Q2{Is simple deployment priority?}
    Q2 -->|Yes| B1[Consider Strapi Integration]
    Q2 -->|No| B2[Keep Separate]

    Q3{Need independent scaling?}
    Q3 -->|Yes| C1[Keep Separate]
    Q3 -->|No| C2[Either works]

    Q4{Using Strapi auth for players?}
    Q4 -->|Yes| D1[Consider Strapi Integration]
    Q4 -->|No| D2[Keep Separate]

    style A2 fill:#4ade80
    style A3 fill:#4ade80
    style B2 fill:#4ade80
    style C1 fill:#4ade80
    style D2 fill:#4ade80
```

---

## Recommendation

### Keep Separate Servers (Current Approach) ✓

**For this project**, keeping them separate is the better choice:

1. **Clean separation of concerns** - Game logic stays in game server, CMS stays in Strapi
2. **Independent scaling** - Can add more game servers without touching CMS
3. **Easier debugging** - Game issues don't mix with Strapi issues
4. **Restart isolation** - Strapi restart doesn't kick players
5. **Future flexibility** - Can swap Strapi for another backend without touching game server

### When to Reconsider

Consider moving to Strapi if:
- Very low player counts (<10 concurrent)
- Strapi is already your main app server (not just CMS)
- You want to use Strapi's auth/permissions for players
- Simpler deployment is a higher priority than performance
- You're building a Strapi plugin for reuse

---

## Conclusion

```mermaid
graph LR
    subgraph Decision["Final Decision"]
        D[Keep Separate Servers]
    end

    subgraph Reasons["Key Reasons"]
        R1[Independent Scaling]
        R2[Restart Isolation]
        R3[Clean Separation]
        R4[Easier Debugging]
    end

    Decision --> Reasons

    style Decision fill:#4ade80,color:#000
    style Reasons fill:#e0f2fe,color:#000
```

**Decision: Keep separate servers**

The current architecture with a separate WebSocket game server is the right choice for this project. The benefits of clean separation, independent scaling, and restart isolation outweigh the convenience of a single deployment.

If deployment simplicity becomes a priority later, consider the hybrid approach where Strapi validates connections but the game server remains separate.
