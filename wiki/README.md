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

### 🚧 Phase 2 — Position synchronization (next)
- Server-side world state broadcasting
- Client-side adaptive send rate
- Remote player avatar spawn/despawn

### 📋 Phase 3 — Animations and smoothness
- Animation state synchronization
- Remote player interpolation

### 📋 Phase 4 — Optimization
- Server-side radius filtering
- Binary message format
