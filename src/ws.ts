import { createHmac } from 'crypto'
import { WebSocketServer, WebSocket } from 'ws'
import jwt from 'jsonwebtoken'
import { IncomingMessage } from 'http'
import { Server as HttpServer } from 'http'
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
  S2C_OBJECT_CREATED,
  S2C_OBJECT_UPDATE,
  S2C_OBJECT_DELETED,
  S2C_OFFER,
  S2C_ANSWER,
  S2C_ICE_CANDIDATE,
  S2C_TURN_CREDENTIALS,
  WS_CLOSE_SESSION_REPLACED,
} from './protocol'
import { world3dStore, type StoreEvent } from './store'

// --- Config ---

const JWT_SECRET = process.env.JWT_SECRET

// Heartbeat interval (ms) — server sends ping every N ms
const HEARTBEAT_INTERVAL = 10_000
// If no pong received within this time, disconnect
const HEARTBEAT_TIMEOUT = 30_000

// --- TURN config ---

const TURN_SECRET = process.env.TURN_SECRET || ''
const TURN_REALM = process.env.TURN_REALM || 'localhost'
const TURN_HOST = process.env.TURN_HOST || TURN_REALM
const TURN_TTL = 86400

// --- Types ---

interface TokenPayload {
  tokenId: string
  userId: string | null
}

interface ActiveConnection {
  ws: WebSocket
  oderId: string
  username: string | null
  isAlive: boolean
  lastPong: number
  /** Read-only mode for anonymous connections (no token) */
  readOnly: boolean
}

// --- State ---

/** Active WebSocket connections indexed by connection id */
const connections = new Map<string, ActiveConnection>()

/** Counter for generating unique connection ids */
let connectionCounter = 0

/** Heartbeat timer */
let heartbeatTimer: ReturnType<typeof setInterval> | null = null

// --- Helpers ---

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

function findConnectionByUserId(userId: string): string | null {
  for (const [connId, conn] of connections) {
    if (conn.oderId === userId) {
      return connId
    }
  }
  return null
}

function extractToken(req: IncomingMessage): string | null {
  const url = new URL(req.url || '', 'http://localhost')
  const tokenParam = url.searchParams.get('token')
  if (tokenParam) {
    return tokenParam
  }

  const authHeader = req.headers.authorization
  if (authHeader?.startsWith('Bearer ')) {
    return authHeader.slice(7)
  }

  return null
}

function verifyToken(token: string): TokenPayload | null {
  if (!JWT_SECRET) {
    return null
  }
  try {
    return jwt.verify(token, JWT_SECRET) as TokenPayload
  } catch {
    return null
  }
}

function broadcast(senderId: string, message: string): void {
  for (const [id, conn] of connections) {
    if (id !== senderId && conn.ws.readyState === WebSocket.OPEN) {
      conn.ws.send(message)
    }
  }
}

/**
 * Broadcast store events (object_created, object_updated, object_deleted) to all clients.
 */
function broadcastStoreEvent(event: StoreEvent): void {
  let message: string

  switch (event.type) {
    case 'object_created':
      message = createMessage({
        type: S2C_OBJECT_CREATED,
        id: event.id,
        parentId: event.parentId,
        object: event.object,
      })
      break
    case 'object_updated':
      message = createMessage({
        type: S2C_OBJECT_UPDATE,
        id: event.id,
        object: event.object,
      })
      break
    case 'object_deleted':
      message = createMessage({
        type: S2C_OBJECT_DELETED,
        id: event.id,
      })
      break
  }

  for (const [, conn] of connections) {
    if (conn.ws.readyState === WebSocket.OPEN) {
      conn.ws.send(message)
    }
  }
}

function removeConnection(connectionId: string): void {
  const conn = connections.get(connectionId)
  if (!conn) {
    return
  }

  connections.delete(connectionId)

  // Only broadcast player_left for authenticated users
  if (!conn.readOnly) {
    broadcast(
      connectionId,
      createMessage({
        type: S2C_PLAYER_LEFT,
        playerId: conn.oderId,
      }),
    )
  }
}

// --- WebSocket Server ---

let wss: WebSocketServer | null = null

export function setupWebSocket(server: HttpServer): void {
  if (!JWT_SECRET) {
    console.error('[world3d-ws] JWT_SECRET env is empty, WebSocket disabled')
    return
  }

  wss = new WebSocketServer({ noServer: true })

  // Subscribe to store events for broadcasting
  world3dStore.onEvent(broadcastStoreEvent)

  // Handle HTTP upgrade to WebSocket
  server.on('upgrade', (req, socket, head) => {
    const token = extractToken(req)

    // Allow connection without token (read-only mode)
    let payload: TokenPayload | null = null
    if (token) {
      payload = verifyToken(token)
      if (!payload?.userId) {
        // Invalid token — reject
        socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n')
        socket.destroy()
        return
      }
    }

    if (wss) {
      wss.handleUpgrade(req, socket, head, (ws) => {
        wss?.emit('connection', ws, req, payload)
      })
    }
  })

  wss.on(
    'connection',
    (ws: WebSocket, _req: IncomingMessage, payload: TokenPayload | null) => {
      const isAuthenticated =
        payload?.userId !== null && payload?.userId !== undefined
      const userId = payload?.userId ?? ''
      const readOnly = !isAuthenticated

      // For authenticated users: close existing sessions for this userId
      // Skip connections that are already closing (readyState === CLOSING or CLOSED)
      if (isAuthenticated) {
        // Collect connection IDs first to avoid modifying Map during iteration
        const existingConnIds: string[] = []
        for (const [existingConnId, existingConn] of connections) {
          if (
            existingConn.oderId === userId &&
            existingConn.ws.readyState === WebSocket.OPEN
          ) {
            existingConnIds.push(existingConnId)
          }
        }
        // Close and remove existing connections
        for (const existingConnId of existingConnIds) {
          const existingConn = connections.get(existingConnId)
          if (existingConn && existingConn.ws.readyState === WebSocket.OPEN) {
            existingConn.ws.close(WS_CLOSE_SESSION_REPLACED, 'session_replaced')
            removeConnection(existingConnId)
          }
        }
      }

      // Register connection
      const connectionId = `conn_${++connectionCounter}`
      const conn: ActiveConnection = {
        ws,
        oderId: isAuthenticated ? userId : connectionId,
        username: null,
        isAlive: true,
        lastPong: Date.now(),
        readOnly,
      }

      connections.set(connectionId, conn)

      // For authenticated users: notify others about player joining
      // Player position will be sent by client via C2S_PLAYER_STATE
      if (isAuthenticated) {
        broadcast(
          connectionId,
          createMessage({
            type: S2C_PLAYER_JOINED,
            playerId: userId,
            username: conn.username,
          }),
        )
      }

      // Initial world state comes from GraphQL API, not WebSocket
      // WebSocket only sends incremental updates (object_update)

      // Send TURN credentials only to authenticated users
      if (isAuthenticated && TURN_SECRET) {
        const creds = generateTurnCredentials(userId)
        ws.send(
          createMessage({
            type: S2C_TURN_CREDENTIALS,
            ...creds,
          }),
        )
      }

      // Message handler
      ws.on('message', (raw: Buffer) => {
        const msg = parseMessage(raw.toString())
        if (!msg) {
          return
        }

        switch (msg.type) {
          case C2S_PLAYER_STATE: {
            // Read-only connections cannot send player state
            if (readOnly) {
              return
            }
            // Update player in store (single source of truth)
            // Store will emit event which broadcasts to all clients
            world3dStore.updatePlayer(userId, {
              matrix: msg.matrix,
              animation: msg.animation,
            })
            break
          }

          case C2S_PONG:
            conn.isAlive = true
            conn.lastPong = Date.now()
            break

          // WebRTC signaling relay — only for authenticated users
          case C2S_OFFER: {
            if (readOnly) {
              return
            }
            const targetConnId = findConnectionByUserId(msg.targetPlayerId)
            if (targetConnId) {
              const target = connections.get(targetConnId)
              if (target && target.ws.readyState === WebSocket.OPEN) {
                target.ws.send(
                  createMessage({
                    type: S2C_OFFER,
                    fromPlayerId: userId,
                    sdp: msg.sdp,
                  }),
                )
              }
            }
            break
          }

          case C2S_ANSWER: {
            if (readOnly) {
              return
            }
            const targetConnId = findConnectionByUserId(msg.targetPlayerId)
            if (targetConnId) {
              const target = connections.get(targetConnId)
              if (target && target.ws.readyState === WebSocket.OPEN) {
                target.ws.send(
                  createMessage({
                    type: S2C_ANSWER,
                    fromPlayerId: userId,
                    sdp: msg.sdp,
                  }),
                )
              }
            }
            break
          }

          case C2S_ICE_CANDIDATE: {
            if (readOnly) {
              return
            }
            const targetConnId = findConnectionByUserId(msg.targetPlayerId)
            if (targetConnId) {
              const target = connections.get(targetConnId)
              if (target && target.ws.readyState === WebSocket.OPEN) {
                target.ws.send(
                  createMessage({
                    type: S2C_ICE_CANDIDATE,
                    fromPlayerId: userId,
                    candidate: msg.candidate,
                  }),
                )
              }
            }
            break
          }
        }
      })

      ws.on('close', () => {
        removeConnection(connectionId)
      })

      ws.on('error', (err) => {
        console.error(`[world3d-ws] WebSocket error for ${conn.oderId}:`, err)
        removeConnection(connectionId)
      })
    },
  )

  // Start heartbeat
  heartbeatTimer = setInterval(() => {
    const now = Date.now()

    for (const [connectionId, conn] of connections) {
      if (now - conn.lastPong > HEARTBEAT_TIMEOUT) {
        conn.ws.terminate()
        removeConnection(connectionId)
        continue
      }

      if (conn.ws.readyState === WebSocket.OPEN) {
        conn.ws.send(createMessage({ type: S2C_PING }))
      }
    }
  }, HEARTBEAT_INTERVAL)
}

export function stopWebSocket(): void {
  if (heartbeatTimer) {
    clearInterval(heartbeatTimer)
    heartbeatTimer = null
  }

  for (const [, conn] of connections) {
    conn.ws.close(1001, 'Server shutting down')
  }

  if (wss) {
    wss.close()
    wss = null
  }
}
