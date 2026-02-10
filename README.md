# World3D Multiplayer Server

WebSocket server for player synchronization in the 3D world.

## Architecture

- **Transport**: WebSocket (`ws` library), port 4100
- **Auth**: JWT (reuses `JWT_SECRET` from main app)
- **Protocol**: JSON messages
- **State**: In-memory player storage (position, rotation, animation)
- **Heartbeat**: Server pings every 10s, disconnects after 30s timeout

## Protocol

### Client → Server

| Type | Payload | Description |
|------|---------|-------------|
| `player_state` | `{ position, rotation, animation }` | Player state update |
| `pong` | `{}` | Heartbeat response |

### Server → Client

| Type | Payload | Description |
|------|---------|-------------|
| `world_state` | `{ players: [...] }` | All connected players |
| `player_joined` | `{ playerId, username }` | New player connected |
| `player_left` | `{ playerId }` | Player disconnected |
| `ping` | `{}` | Heartbeat ping |
| `error` | `{ message }` | Error notification |

### Data Types

```typescript
Vec3 { x, y, z }
Quaternion { x, y, z, w }
AnimationName = 'idle' | 'walk' | 'run' | 'jump'
```

## Setup

```bash
cp .env.example .env
# Edit .env — set JWT_SECRET matching main app
npm install
```

## Scripts

| Script | Description |
|--------|-------------|
| `npm run dev` | Development with watch mode (tsx) |
| `npm run build` | Compile TypeScript to dist/ |
| `npm run start` | Run compiled JS (production) |
| `npm run types` | Type check without emit |
| `npm run lint` | ESLint |
| `npm run format` | Prettier |

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `JWT_SECRET` | — | **Required**. Must match main app |
| `WORLD3D_PORT` | `4100` | WebSocket server port |

## Connection

Client connects with JWT token:

```
ws://localhost:4100?token=<jwt_token>
```

Or via Authorization header:

```
Authorization: Bearer <jwt_token>
```

Unauthenticated connections are rejected with close code `4001` (missing token) or `4002` (invalid token).

## Project Structure

```
src/
├── index.ts      — WebSocket server, auth, heartbeat, connection handling
└── protocol.ts   — Message types, data types, helpers
```

## Roadmap

- [x] Phase 1 — Service and basic connection (JWT, heartbeat, protocol)
- [ ] Phase 2 — Position synchronization (broadcast, adaptive send rate)
- [ ] Phase 3 — Animations and interpolation
- [ ] Phase 4 — Optimization (radius filtering, binary protocol)
