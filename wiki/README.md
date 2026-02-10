# World3D Multiplayer — Wiki

Technical documentation for the World3D multiplayer WebSocket server.

## Contents

- [Architecture](./architecture/README.md) — server model, transport, auth
- [Protocol](./protocol/README.md) — message types, data formats
- [Frontend Integration](./frontend/README.md) — useMultiplayer hook, connection flow

## Overview

Standalone WebSocket service for real-time player synchronization in the 3D world. Each authenticated user connects via WebSocket, sends their position/rotation/animation, and receives updates about other players.

## Current Status

### ✅ Phase 1 — Service and basic connection
- WebSocket server (Node.js/TypeScript, `ws` library, port 4100)
- JWT authentication on connection
- Heartbeat and disconnect handling
- JSON message protocol with typed messages

### ✅ Phase 2 — Position synchronization
- Server broadcasts `world_state` on each `player_state` received
- Client adaptive send rate (500ms active, 3s idle)
- Remote player avatar spawn/despawn via `RemotePlayer` + shared `Avatar` component

### ✅ Phase 3 — Voice Chat (WebRTC)
- WebRTC signaling relay (offer/answer/ICE candidates) through WS
- TURN credentials generation (HMAC shared secret from coturn)
- P2P mesh peer connections (`useVoiceChat` hook)
- Mute/unmute microphone UI
- Debug overlay (`DebugVoiceChatOverlay`)
- 🚧 MediaStream → PositionalAudio (spatial voice audio) — WebRTC stream works, Three.js integration in debugging

### 📋 Phase 4 — Animations and smoothness
- Animation state synchronization
- Remote player interpolation

### 📋 Phase 5 — Optimization
- Server-side radius filtering
- Binary message format
- Voice connections only within hearing radius
