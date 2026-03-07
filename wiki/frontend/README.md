# Frontend Integration

Multiplayer connection on the frontend is handled by `useMultiplayer` and `useVoiceChat` hooks.

Code: `src/components/world3d/hooks/` (main app repo).

## useMultiplayer Hook

```typescript
const {
  wsRef,
  remotePlayers,
  sendPlayerState,
  onSignalingMessageRef,
  turnCredentialsRef,
} = useMultiplayer({ enabled: boolean })
```

- **enabled** — `true` when user is authenticated (`!!user`)
- **remotePlayers** — `Map<string, RemotePlayerData>` of all other connected players
- **sendPlayerState** — call every frame with `{ position, rotation, animation }`, throttled internally
- **wsRef** — WebSocket ref, used by `useVoiceChat` for signaling
- **onSignalingMessageRef** — callback ref for WebRTC signaling messages, set by `useVoiceChat`
- **turnCredentialsRef** — TURN credentials received from server
- Connects to WS server at `/world3d-service` on the current host
- Sends JWT token from `localStorage` as query param
- Responds to `ping` with `pong` automatically
- Auto-reconnects on disconnect (3s delay), unless intentionally closed
- Forwards signaling messages (`offer`, `answer`, `ice_candidate`) to `onSignalingMessageRef`

### Adaptive Send Rate

- **Active movement** (position changed > 0.01): sends every ~500ms
- **Idle** (no position change): sends every ~3s
- **Animation change**: sends immediately regardless of interval
- **No change at all**: skips sending

## useVoiceChat Hook

```typescript
const { remoteStreams, isMuted, toggleMute, peersRef } = useVoiceChat({
  enabled,
  wsRef,
  onSignalingMessageRef,
  turnCredentialsRef,
  remotePlayerIds,
})
```

- Manages WebRTC P2P mesh — one `RTCPeerConnection` per remote player
- Captures microphone via `getUserMedia`
- Handles signaling (offer/answer/ICE) through `useMultiplayer` WS
- Reactively connects to new players and disconnects from gone ones
- Exposes `remoteStreams: Map<string, MediaStream>` for spatial audio

## Connection Flow

1. `World3DScene` calls `useMultiplayer({ enabled: !!user })`
2. Hook reads JWT from `localStorage.getItem('token')`
3. If no token — skips connection (user not authenticated)
4. Connects to `ws://localhost:4100?token=<jwt>`
5. On `ping` — responds with `pong`
6. On `world_state` — updates `remotePlayers` Map
7. On `player_left` — removes player from `remotePlayers`
8. On `close` — reconnects after 3 seconds (unless `enabled` became `false`)
9. `Player` component calls `sendPlayerState()` every frame (throttled internally)
10. `World3DScene` renders `RemotePlayer` for each entry in `remotePlayers`
11. `useVoiceChat` creates peer connections for each remote player
12. `RemotePlayer` receives `voiceStream` and renders `VoiceAudioSource`

## Components

### Player (`src/components/world3d/Player/`)

Local player — keyboard/mouse input, camera, AudioListener, physics (dynamic RigidBody), sends state to server.

### RemotePlayer (`src/components/world3d/RemotePlayer/`)

Remote player avatar — position/rotation/animation from server data. Renders `VoiceAudioSource` when `voiceStream` is available.

### VoiceAudioSource (`src/components/world3d/VoiceAudioSource/`)

Connects WebRTC `MediaStream` to Three.js `PositionalAudio` for spatial voice audio.

### Avatar (`src/components/world3d/Avatar/`)

Shared avatar component used by both `Player` and `RemotePlayer`. Scene is cloned per instance via `useGLTFLoad` so each player has its own skeleton.

## Current State

- ✅ Connection with JWT auth
- ✅ Heartbeat (pong responses)
- ✅ Auto-reconnect
- ✅ Remote players state tracking (`remotePlayers` Map)
- ✅ Adaptive player state sending (`sendPlayerState`) — 500ms active, 3s idle
- ✅ Separate `Player` (local) and `RemotePlayer` (remote) components
- ✅ WebRTC P2P mesh voice chat (signaling, peer connections)
- ✅ Mute/unmute UI
- ✅ Debug overlay for voice chat
- 🚧 Spatial audio via PositionalAudio (in debugging)
- 🚧 No interpolation yet
- 🚧 No animation sync yet
