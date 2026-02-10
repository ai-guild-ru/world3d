# Protocol

All messages are JSON with `{ type, ...payload }`.

Defined in `src/protocol.ts`.

## Client → Server (C2S)

### `player_state`

Player sends their current state.

```json
{
  "type": "player_state",
  "position": { "x": 0, "y": 2, "z": -10 },
  "rotation": { "x": 0, "y": 0, "z": 0, "w": 1 },
  "animation": "idle"
}
```

### `pong`

Heartbeat response to server's `ping`.

```json
{ "type": "pong" }
```

## Server → Client (S2C)

### `world_state`

Full state of all other connected players. Sent to newly connected player.

```json
{
  "type": "world_state",
  "players": [
    {
      "playerId": "user-uuid",
      "username": "player1",
      "position": { "x": 5, "y": 1, "z": 3 },
      "rotation": { "x": 0, "y": 0.7, "z": 0, "w": 0.7 },
      "animation": "walk"
    }
  ]
}
```

### `player_joined`

New player connected.

```json
{
  "type": "player_joined",
  "playerId": "user-uuid",
  "username": "player1"
}
```

### `player_left`

Player disconnected.

```json
{
  "type": "player_left",
  "playerId": "user-uuid"
}
```

### `ping`

Heartbeat ping. Client must respond with `pong`.

```json
{ "type": "ping" }
```

### `error`

Error notification (e.g. auth failure).

```json
{
  "type": "error",
  "message": "Invalid token"
}
```

## Data Types

### Vec3

```typescript
{ x: number, y: number, z: number }
```

### Quaternion

```typescript
{ x: number, y: number, z: number, w: number }
```

### AnimationName

```typescript
'idle' | 'walk' | 'run' | 'jump'
```

### PlayerData

```typescript
{
  playerId: string
  username: string | null
  position: Vec3
  rotation: Quaternion
  animation: AnimationName
}
```

## Close Codes

| Code | Reason |
|------|--------|
| `1000` | Normal close |
| `1001` | Server shutting down |
| `4001` | Missing token |
| `4002` | Invalid token |
