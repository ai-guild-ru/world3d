# Frontend Integration

Multiplayer connection on the frontend is handled by the `useMultiplayer` hook.

Code: `src/components/world3d/hooks/useMultiplayer/index.ts` (main app repo).

## useMultiplayer Hook

```typescript
useMultiplayer({ enabled: boolean })
```

- **enabled** — `true` when user is authenticated (`!!user`)
- Connects to WS server at `NEXT_PUBLIC_WORLD3D_WS_URL` (default `ws://localhost:4100`)
- Sends JWT token from `localStorage` as query param
- Responds to `ping` with `pong` automatically
- Auto-reconnects on disconnect (3s delay), unless intentionally closed

## Connection Flow

1. `World3DScene` component calls `useMultiplayer({ enabled: !!user })`
2. Hook reads JWT from `localStorage.getItem('token')`
3. If no token — skips connection (user not authenticated)
4. Connects to `ws://localhost:4100?token=<jwt>`
5. On `ping` — responds with `pong`
6. On `close` — reconnects after 3 seconds (unless `enabled` became `false`)

## Environment Variables

| Variable | Default | Where |
|----------|---------|-------|
| `NEXT_PUBLIC_WORLD3D_WS_URL` | `ws://localhost:4100` | Main app `.env` |

## Current State (Phase 1)

- ✅ Connection with JWT auth
- ✅ Heartbeat (pong responses)
- ✅ Auto-reconnect
- ✅ Logging of player_joined / player_left / world_state
- 🚧 No position sending yet (Phase 2)
- 🚧 No remote player rendering yet (Phase 2)
