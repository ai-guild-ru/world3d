import 'dotenv/config'
import { createHmac } from 'crypto'
import { WebSocketServer, WebSocket } from 'ws'
import jwt from 'jsonwebtoken'
import { IncomingMessage } from 'http'
import {
  parseMessage,
  createMessage,
  C2S_PLAYER_STATE,
  C2S_PONG,
  C2S_OFFER,
  C2S_ANSWER,
  C2S_ICE_CANDIDATE,
  S2C_PING,
  S2C_PLAYER_JOINED,
  S2C_PLAYER_LEFT,
  S2C_ERROR,
  S2C_WORLD_STATE,
  S2C_OFFER,
  S2C_ANSWER,
  S2C_ICE_CANDIDATE,
  S2C_TURN_CREDENTIALS,
  WS_CLOSE_SESSION_REPLACED,
  type Vec3,
  type Quaternion,
  type AnimationName,
  type PlayerData,
} from './protocol'

// --- Config ---

const PORT = parseInt(process.env.WORLD3D_PORT || '4100', 10)
const JWT_SECRET = process.env.JWT_SECRET

if (!JWT_SECRET) {
  console.error('[world3d] JWT_SECRET env is empty, exiting')
  process.exit(1)
}

// Heartbeat interval (ms) — server sends ping every N ms
const HEARTBEAT_INTERVAL = 10_000
// If no pong received within this time, disconnect
const HEARTBEAT_TIMEOUT = 30_000

// --- TURN config ---

const TURN_SECRET = process.env.TURN_SECRET || ''
const TURN_REALM = process.env.TURN_REALM || 'localhost'
// TURN host — defaults to the realm (in docker, coturn service resolves via docker DNS)
const TURN_HOST = process.env.TURN_HOST || TURN_REALM
// TURN credentials TTL in seconds (24 hours)
const TURN_TTL = 86400

// --- Types ---

interface TokenPayload {
  tokenId: string
  userId: string | null
}

interface ConnectedPlayer {
  ws: WebSocket
  userId: string
  username: string | null
  position: Vec3
  rotation: Quaternion
  animation: AnimationName
  isAlive: boolean
  lastPong: number
}

// --- State ---

/** All connected players indexed by unique connection id */
const players = new Map<string, ConnectedPlayer>()

/** Counter for generating unique connection ids */
let connectionCounter = 0

/**
 * Generate temporary TURN credentials using HMAC shared secret (RFC 5389).
 * coturn validates these credentials using the same TURN_SECRET.
 * Username format: "timestamp:userId" — coturn parses the timestamp to check TTL.
 */
function generateTurnCredentials(userId: string): {
  urls: string[]
  username: string
  credential: string
  ttl: number
} {
  const timestamp = Math.floor(Date.now() / 1000) + TURN_TTL
  const username = `${timestamp}:${userId}`
  const credential = createHmac('sha1', TURN_SECRET)
    .update(username)
    .digest('base64')

  return {
    urls: [
      `stun:${TURN_HOST}:3478`,
      `turn:${TURN_HOST}:3478?transport=udp`,
      `turn:${TURN_HOST}:3478?transport=tcp`,
      `turns:${TURN_HOST}:5349?transport=tcp`,
    ],
    username,
    credential,
    ttl: TURN_TTL,
  }
}

/**
 * Find connection ID by userId (for signaling relay).
 * Returns the first matching connection or null.
 */
function findConnectionByUserId(userId: string): string | null {
  for (const [connId, p] of players) {
    if (p.userId === userId) {
      return connId
    }
  }
  return null
}

// --- Server ---

const wss = new WebSocketServer({ port: PORT })

// eslint-disable-next-line no-console
console.log(`[world3d] WebSocket server listening on port ${PORT}`)

/**
 * Extract JWT token from WebSocket upgrade request.
 * Supports: ?token=xxx query param or Authorization: Bearer xxx header.
 */
function extractToken(req: IncomingMessage): string | null {
  // Query param
  const url = new URL(req.url || '', `http://localhost:${PORT}`)
  const tokenParam = url.searchParams.get('token')
  if (tokenParam) {
    return tokenParam
  }

  // Authorization header
  const authHeader = req.headers.authorization
  if (authHeader?.startsWith('Bearer ')) {
    return authHeader.slice(7)
  }

  return null
}

/**
 * Verify JWT and return payload. Returns null on invalid token.
 */
function verifyToken(token: string): TokenPayload | null {
  try {
    return jwt.verify(token, JWT_SECRET as string) as TokenPayload
  } catch {
    return null
  }
}

/**
 * Broadcast a message to all connected players except the sender.
 */
function broadcast(senderId: string, message: string): void {
  for (const [id, player] of players) {
    if (id !== senderId && player.ws.readyState === WebSocket.OPEN) {
      player.ws.send(message)
    }
  }
}

/**
 * Send full world state (all other players) to a specific client.
 */
function sendWorldState(targetId: string): void {
  const target = players.get(targetId)
  if (!target || target.ws.readyState !== WebSocket.OPEN) {
    return
  }

  const otherPlayers: PlayerData[] = []
  for (const [id, player] of players) {
    if (id !== targetId) {
      otherPlayers.push({
        playerId: player.userId,
        username: player.username,
        position: player.position,
        rotation: player.rotation,
        animation: player.animation,
      })
    }
  }

  target.ws.send(
    createMessage({
      type: S2C_WORLD_STATE,
      players: otherPlayers,
    }),
  )
}

/**
 * Broadcast world_state to all connected players except the sender.
 * Each recipient gets a list of all other players (excluding themselves).
 */
function broadcastWorldState(senderId: string): void {
  for (const [id, player] of players) {
    if (id === senderId || player.ws.readyState !== WebSocket.OPEN) {
      continue
    }

    const otherPlayers: PlayerData[] = []
    for (const [otherId, other] of players) {
      if (otherId !== id) {
        otherPlayers.push({
          playerId: other.userId,
          username: other.username,
          position: other.position,
          rotation: other.rotation,
          animation: other.animation,
        })
      }
    }

    player.ws.send(
      createMessage({
        type: S2C_WORLD_STATE,
        players: otherPlayers,
      }),
    )
  }
}

/**
 * Remove player and notify others.
 */
function removePlayer(connectionId: string): void {
  const player = players.get(connectionId)
  if (!player) {
    return
  }

  players.delete(connectionId)

  // Notify remaining players
  broadcast(
    connectionId,
    createMessage({
      type: S2C_PLAYER_LEFT,
      playerId: player.userId,
    }),
  )

  // eslint-disable-next-line no-console
  console.log(
    `[world3d] Player disconnected: ${player.userId} (${players.size} online)`,
  )
}

// --- Connection handler ---

wss.on('connection', (ws: WebSocket, req: IncomingMessage) => {
  // --- JWT Authentication ---
  const token = extractToken(req)
  if (!token) {
    ws.send(createMessage({ type: S2C_ERROR, message: 'Missing token' }))
    ws.close(4001, 'Missing token')
    return
  }

  const payload = verifyToken(token)
  if (!payload?.userId) {
    ws.send(createMessage({ type: S2C_ERROR, message: 'Invalid token' }))
    ws.close(4002, 'Invalid token')
    return
  }

  // --- Close existing sessions for this userId (one session per user) ---
  for (const [existingConnId, existingPlayer] of players) {
    if (existingPlayer.userId === payload.userId) {
      existingPlayer.ws.close(WS_CLOSE_SESSION_REPLACED, 'session_replaced')
      removePlayer(existingConnId)
    }
  }

  // --- Register player ---
  const connectionId = `conn_${++connectionCounter}`
  const player: ConnectedPlayer = {
    ws,
    userId: payload.userId,
    username: null, // TODO: resolve username from DB or token
    position: { x: 0, y: 2, z: -10 },
    rotation: { x: 0, y: 0, z: 0, w: 1 },
    animation: 'idle',
    isAlive: true,
    lastPong: Date.now(),
  }

  players.set(connectionId, player)

  // eslint-disable-next-line no-console
  console.log(
    `[world3d] Player connected: ${player.userId} (${players.size} online)`,
  )

  // Notify others about new player
  broadcast(
    connectionId,
    createMessage({
      type: S2C_PLAYER_JOINED,
      playerId: player.userId,
      username: player.username,
    }),
  )

  // Send current world state to the new player
  sendWorldState(connectionId)

  // Send TURN credentials to the new player (needed for WebRTC P2P connections)
  if (TURN_SECRET) {
    const creds = generateTurnCredentials(player.userId)
    ws.send(
      createMessage({
        type: S2C_TURN_CREDENTIALS,
        ...creds,
      }),
    )
  }

  // --- Message handler ---
  ws.on('message', (raw: Buffer) => {
    const msg = parseMessage(raw.toString())
    if (!msg) {
      return
    }

    switch (msg.type) {
      case C2S_PLAYER_STATE:
        // Update player state in-memory
        player.position = msg.position
        player.rotation = msg.rotation
        player.animation = msg.animation

        // Broadcast updated world state to all other players
        broadcastWorldState(connectionId)
        break

      case C2S_PONG:
        // Heartbeat response
        player.isAlive = true
        player.lastPong = Date.now()
        break

      // --- WebRTC signaling relay ---

      case C2S_OFFER: {
        const targetConnId = findConnectionByUserId(msg.targetPlayerId)
        if (targetConnId) {
          const target = players.get(targetConnId)
          if (target && target.ws.readyState === WebSocket.OPEN) {
            target.ws.send(
              createMessage({
                type: S2C_OFFER,
                fromPlayerId: player.userId,
                sdp: msg.sdp,
              }),
            )
          }
        }
        break
      }

      case C2S_ANSWER: {
        const targetConnId = findConnectionByUserId(msg.targetPlayerId)
        if (targetConnId) {
          const target = players.get(targetConnId)
          if (target && target.ws.readyState === WebSocket.OPEN) {
            target.ws.send(
              createMessage({
                type: S2C_ANSWER,
                fromPlayerId: player.userId,
                sdp: msg.sdp,
              }),
            )
          }
        }
        break
      }

      case C2S_ICE_CANDIDATE: {
        const targetConnId = findConnectionByUserId(msg.targetPlayerId)
        if (targetConnId) {
          const target = players.get(targetConnId)
          if (target && target.ws.readyState === WebSocket.OPEN) {
            target.ws.send(
              createMessage({
                type: S2C_ICE_CANDIDATE,
                fromPlayerId: player.userId,
                candidate: msg.candidate,
              }),
            )
          }
        }
        break
      }
    }
  })

  // --- Disconnect handler ---
  ws.on('close', () => {
    removePlayer(connectionId)
  })

  ws.on('error', (err) => {
    console.error(`[world3d] WebSocket error for ${player.userId}:`, err)
    removePlayer(connectionId)
  })
})

// --- Heartbeat ---

/**
 * Periodic heartbeat: send ping to all clients, disconnect those
 * who haven't responded within HEARTBEAT_TIMEOUT.
 */
const heartbeatTimer = setInterval(() => {
  const now = Date.now()

  for (const [connectionId, player] of players) {
    // Check if player missed heartbeat
    if (now - player.lastPong > HEARTBEAT_TIMEOUT) {
      // eslint-disable-next-line no-console
      console.log(
        `[world3d] Heartbeat timeout for ${player.userId}, disconnecting`,
      )
      player.ws.terminate()
      removePlayer(connectionId)
      continue
    }

    // Send ping
    if (player.ws.readyState === WebSocket.OPEN) {
      player.ws.send(createMessage({ type: S2C_PING }))
    }
  }
}, HEARTBEAT_INTERVAL)

// --- Graceful shutdown ---

function shutdown() {
  // eslint-disable-next-line no-console
  console.log('[world3d] Shutting down...')
  clearInterval(heartbeatTimer)

  for (const [, player] of players) {
    player.ws.close(1001, 'Server shutting down')
  }

  wss.close(() => {
    // eslint-disable-next-line no-console
    console.log('[world3d] Server closed')
    process.exit(0)
  })
}

process.on('SIGINT', shutdown)
process.on('SIGTERM', shutdown)
