/**
 * World3D Multiplayer Protocol — message types and helpers.
 *
 * All messages are JSON with { type, ...payload }.
 *
 * Client → Server:
 *   - player_state   { position, rotation, animation }
 *   - pong           {}
 *
 * Server → Client:
 *   - world_state    { players: [...] }          — periodic broadcast of all players
 *   - player_joined  { playerId, username }       — new player connected
 *   - player_left    { playerId }                 — player disconnected
 *   - error          { message }                  — error notification
 *   - ping           {}                           — heartbeat ping
 */

// --- Client → Server message types ---
export const C2S_PLAYER_STATE = 'player_state' as const
export const C2S_PONG = 'pong' as const

// --- Server → Client message types ---
export const S2C_WORLD_STATE = 'world_state' as const
export const S2C_PLAYER_JOINED = 'player_joined' as const
export const S2C_PLAYER_LEFT = 'player_left' as const
export const S2C_ERROR = 'error' as const
export const S2C_PING = 'ping' as const

// --- Data types ---

export interface Vec3 {
  x: number
  y: number
  z: number
}

export interface Quaternion {
  x: number
  y: number
  z: number
  w: number
}

export type AnimationName = 'idle' | 'walk' | 'run' | 'jump'

// --- Client → Server messages ---

export interface C2SPlayerState {
  type: typeof C2S_PLAYER_STATE
  position: Vec3
  rotation: Quaternion
  animation: AnimationName
}

export interface C2SPong {
  type: typeof C2S_PONG
}

export type C2SMessage = C2SPlayerState | C2SPong

// --- Server → Client messages ---

export interface PlayerData {
  playerId: string
  username: string | null
  position: Vec3
  rotation: Quaternion
  animation: AnimationName
}

export interface S2CWorldState {
  type: typeof S2C_WORLD_STATE
  players: PlayerData[]
}

export interface S2CPlayerJoined {
  type: typeof S2C_PLAYER_JOINED
  playerId: string
  username: string | null
}

export interface S2CPlayerLeft {
  type: typeof S2C_PLAYER_LEFT
  playerId: string
}

export interface S2CError {
  type: typeof S2C_ERROR
  message: string
}

export interface S2CPing {
  type: typeof S2C_PING
}

export type S2CMessage =
  | S2CWorldState
  | S2CPlayerJoined
  | S2CPlayerLeft
  | S2CError
  | S2CPing

/**
 * Create a JSON message string ready to send over WebSocket.
 */
export function createMessage(msg: S2CMessage): string {
  return JSON.stringify(msg)
}

/**
 * Parse an incoming JSON message from client. Returns null on invalid JSON.
 */
export function parseMessage(raw: string): C2SMessage | null {
  try {
    const msg = JSON.parse(raw)
    if (!msg || typeof msg.type !== 'string') {
      return null
    }
    return msg as C2SMessage
  } catch {
    return null
  }
}
