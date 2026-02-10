# Architecture

## Server Model

Browser-first model — client is authoritative over its own position:

```
┌──────────┐     WebSocket      ┌──────────────┐     WebSocket      ┌──────────┐
│ Client A │ ──────────────────→│  World3D WS  │←──────────────────→│ Client B │
│          │←──────────────────→│   Server     │                    │          │
└──────────┘  player_state      │  (port 4100) │  world_state       └──────────┘
              pong              │              │  player_joined
                                │  In-memory   │  player_left
                                │  state store │  ping
                                └──────────────┘
```

- Client moves locally without latency
- Client sends position/rotation/animation to server
- Server accepts and broadcasts to other clients (no validation)
- On connection loss, user continues moving in loaded world

## World Model

- Single flat world (no rooms) — one world for all players
- Server stores current positions and states of all connected players
- Server broadcasts data of all players (no server-side radius filtering yet)

## Transport

- **WebSocket** — primary transport for synchronization
- **Standalone service** — separate from main app, own process
- **Port**: 4100 (configurable via `WORLD3D_PORT`)
- **Format**: JSON (binary format later if needed)

## Authentication

JWT token is verified on WebSocket upgrade:

1. Client connects with token via query param: `ws://host:4100?token=<jwt>`
2. Or via `Authorization: Bearer <jwt>` header
3. Server verifies token using shared `JWT_SECRET`
4. Invalid/missing token → connection rejected (close codes `4001`/`4002`)

Token payload structure (matches main app):
```typescript
interface TokenPayload {
  tokenId: string
  userId: string | null
}
```

## Heartbeat

- Server sends `ping` every 10 seconds
- Client must respond with `pong`
- If no `pong` received within 30 seconds → server terminates connection
- On disconnect, server notifies remaining players with `player_left`

## Connection Lifecycle

```
Client                          Server
  │                               │
  │── WS connect (?token=jwt) ──→│
  │                               │── verify JWT
  │                               │── register player
  │                               │── broadcast player_joined to others
  │←── world_state ──────────────│
  │                               │
  │── player_state ─────────────→│── update in-memory state
  │←── ping ─────────────────────│
  │── pong ─────────────────────→│
  │                               │
  │── close ────────────────────→│── remove player
  │                               │── broadcast player_left to others
```

## File Structure

```
src/
├── index.ts      — Server entry: WS server, auth, heartbeat, connection handling
└── protocol.ts   — Message types, data types, serialization helpers
```
