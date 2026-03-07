# World3D Multiplayer Server

Микросервис для синхронизации 3D мира: WebSocket для real-time обновлений, HTTP API для CRUD операций.

## Архитектура

### Один сервер на порту 4100

| Тип запроса | Назначение |
|-------------|------------|
| **HTTP** | REST API для CRUD операций с объектами мира |
| **WebSocket** (upgrade) | Real-time синхронизация игроков (требует JWT) |

### Хранилище

- **Three.js Scene** — единственный источник правды для состояния мира
- **world.json** — персистентное хранилище (`/app/storage/world3d/worlds/main/world.json`)
- **In-memory Map** — онлайн игроки (позиция, анимация)

## HTTP API

### Endpoints

| Method | Path | Params | Description |
|--------|------|--------|-------------|
| `GET` | `/api/objects` | `nodeId`, `depth`, `detailed` | Чтение дерева объектов |
| `GET` | `/api/players` | — | Список всех игроков |
| `GET` | `/api/player` | `id` или `username` | Информация об игроке |
| `GET` | `/health` | — | Health check |

### Пример

```bash
curl "http://localhost:4100/api/objects?nodeId=root&depth=10&detailed=true"
```

## WebSocket Protocol

### Подключение

```
ws://localhost:4100?token=<jwt_token>
```

Или через заголовок:
```
Authorization: Bearer <jwt_token>
```

### Client → Server

| Type | Payload | Description |
|------|---------|-------------|
| `player_state` | `{ position, rotation, animation }` | Обновление состояния игрока |
| `pong` | `{}` | Ответ на heartbeat |

### Server → Client

| Type | Payload | Description |
|------|---------|-------------|
| `world_state` | `{ players: [...] }` | Все подключенные игроки |
| `player_joined` | `{ playerId, username }` | Новый игрок подключился |
| `player_left` | `{ playerId }` | Игрок отключился |
| `ping` | `{}` | Heartbeat ping |
| `error` | `{ message }` | Ошибка |

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
| `WORLD3D_PORT` | `4100` | Server port (HTTP + WebSocket) |
| `WORLD3D_STORAGE_DIR` | `/app/storage/world3d` | Path to world storage |

## Project Structure

```
src/
├── index.ts      — Entry point, HTTP server
├── api.ts        — HTTP API request handler
├── ws.ts         — WebSocket handler (auth, heartbeat, signaling)
├── store.ts      — World3DStore (Three.js scene management)
└── protocol.ts   — Message types, data types
```

## Roadmap

- [x] Phase 1 — WebSocket server (JWT, heartbeat, protocol)
- [x] Phase 2 — Position synchronization (broadcast)
- [x] Phase 3 — HTTP API for world objects
- [x] Phase 4 — Three.js scene as source of truth
- [ ] Phase 5 — WebSocket for anonymous users (read-only)
- [ ] Phase 6 — Optimization (radius filtering, binary protocol)
