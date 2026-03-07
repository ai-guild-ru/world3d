/**
 * World3D Multiplayer Protocol — message types and helpers.
 *
 * All messages are JSON with { type, ...payload }.
 *
 * Client → Server:
 *   - player_state   { matrix, animation }          — 4x4 transformation matrix (column-major)
 *   - pong           {}
 *   - offer          { targetPlayerId, sdp }        — WebRTC offer (relayed to target)
 *   - answer         { targetPlayerId, sdp }        — WebRTC answer (relayed to target)
 *   - ice_candidate  { targetPlayerId, candidate }  — ICE candidate (relayed to target)
 *
 * Server → Client:
 *   - world_state    { players: [...] }          — periodic broadcast of all players
 *   - player_joined  { playerId, username }       — new player connected
 *   - player_left    { playerId }                 — player disconnected
 *   - error          { message }                  — error notification
 *   - ping           {}                           — heartbeat ping
 *   - offer          { fromPlayerId, sdp }        — relayed WebRTC offer
 *   - answer         { fromPlayerId, sdp }        — relayed WebRTC answer
 *   - ice_candidate  { fromPlayerId, candidate }  — relayed ICE candidate
 *   - turn_credentials { urls, username, credential, ttl } — TURN server credentials
 */

// --- Client → Server message types ---
export const C2S_PLAYER_STATE = 'player_state' as const
export const C2S_PONG = 'pong' as const
export const C2S_OFFER = 'offer' as const
export const C2S_ANSWER = 'answer' as const
export const C2S_ICE_CANDIDATE = 'ice_candidate' as const

// --- Server → Client message types ---
export const S2C_WORLD_STATE = 'world_state' as const
export const S2C_OBJECT_CREATED = 'object_created' as const
export const S2C_OBJECT_UPDATE = 'object_update' as const
export const S2C_OBJECT_DELETED = 'object_deleted' as const
export const S2C_PLAYER_JOINED = 'player_joined' as const
export const S2C_PLAYER_LEFT = 'player_left' as const
export const S2C_ERROR = 'error' as const
export const S2C_PING = 'ping' as const
export const S2C_OFFER = 'offer' as const
export const S2C_ANSWER = 'answer' as const
export const S2C_ICE_CANDIDATE = 'ice_candidate' as const
export const S2C_TURN_CREDENTIALS = 'turn_credentials' as const

// --- Custom WebSocket close codes ---
export const WS_CLOSE_SESSION_REPLACED = 4009

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
  /** 4x4 transformation matrix (column-major, 16 elements) */
  matrix: number[]
  animation: AnimationName
}

export interface C2SPong {
  type: typeof C2S_PONG
}

/** WebRTC offer — client sends to server, server relays to targetPlayerId */
export interface C2SOffer {
  type: typeof C2S_OFFER
  targetPlayerId: string
  sdp: string
}

/** WebRTC answer — client sends to server, server relays to targetPlayerId */
export interface C2SAnswer {
  type: typeof C2S_ANSWER
  targetPlayerId: string
  sdp: string
}

/** ICE candidate — client sends to server, server relays to targetPlayerId */
export interface C2SIceCandidate {
  type: typeof C2S_ICE_CANDIDATE
  targetPlayerId: string
  candidate: string
}

export type C2SMessage =
  | C2SPlayerState
  | C2SPong
  | C2SOffer
  | C2SAnswer
  | C2SIceCandidate

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

/** New object created in the world */
export interface S2CObjectCreated {
  type: typeof S2C_OBJECT_CREATED
  id: string
  parentId: string
  object: object
}

/** Update properties of an existing object */
export interface S2CObjectUpdate {
  type: typeof S2C_OBJECT_UPDATE
  id: string
  object: object
}

/** Object deleted from the world */
export interface S2CObjectDeleted {
  type: typeof S2C_OBJECT_DELETED
  id: string
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

/** Relayed WebRTC offer from another player */
export interface S2COffer {
  type: typeof S2C_OFFER
  fromPlayerId: string
  sdp: string
}

/** Relayed WebRTC answer from another player */
export interface S2CAnswer {
  type: typeof S2C_ANSWER
  fromPlayerId: string
  sdp: string
}

/** Relayed ICE candidate from another player */
export interface S2CIceCandidate {
  type: typeof S2C_ICE_CANDIDATE
  fromPlayerId: string
  candidate: string
}

/** TURN server credentials (HMAC temporary credentials from coturn shared secret) */
export interface S2CTurnCredentials {
  type: typeof S2C_TURN_CREDENTIALS
  urls: string[]
  username: string
  credential: string
  ttl: number
}

export type S2CMessage =
  | S2CWorldState
  | S2CObjectCreated
  | S2CObjectUpdate
  | S2CObjectDeleted
  | S2CPlayerJoined
  | S2CPlayerLeft
  | S2CError
  | S2CPing
  | S2COffer
  | S2CAnswer
  | S2CIceCandidate
  | S2CTurnCredentials

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
