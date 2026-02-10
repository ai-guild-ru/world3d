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

### `offer`

WebRTC offer — relayed to target player.

```json
{
  "type": "offer",
  "targetPlayerId": "user-uuid",
  "sdp": "{...serialized RTCSessionDescription}"
}
```

### `answer`

WebRTC answer — relayed to target player.

```json
{
  "type": "answer",
  "targetPlayerId": "user-uuid",
  "sdp": "{...serialized RTCSessionDescription}"
}
```

### `ice_candidate`

ICE candidate — relayed to target player.

```json
{
  "type": "ice_candidate",
  "targetPlayerId": "user-uuid",
  "candidate": "{...serialized RTCIceCandidate}"
}
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

### `offer`

Relayed WebRTC offer from another player.

```json
{
  "type": "offer",
  "fromPlayerId": "user-uuid",
  "sdp": "{...serialized RTCSessionDescription}"
}
```

### `answer`

Relayed WebRTC answer from another player.

```json
{
  "type": "answer",
  "fromPlayerId": "user-uuid",
  "sdp": "{...serialized RTCSessionDescription}"
}
```

### `ice_candidate`

Relayed ICE candidate from another player.

```json
{
  "type": "ice_candidate",
  "fromPlayerId": "user-uuid",
  "candidate": "{...serialized RTCIceCandidate}"
}
```

### `turn_credentials`

TURN server credentials (sent on connection). Generated via HMAC shared secret.

```json
{
  "type": "turn_credentials",
  "urls": ["stun:host:3478", "turn:host:3478?transport=udp", "turn:host:3478?transport=tcp", "turns:host:5349?transport=tcp"],
  "username": "1234567890:user-uuid",
  "credential": "base64-hmac-sha1",
  "ttl": 86400
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
