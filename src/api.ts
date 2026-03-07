import { IncomingMessage, ServerResponse } from 'http'
import { world3dStore } from './store'

interface CreateObjectRequest {
  parentId?: string
  object: object
}

interface UpdateObjectRequest {
  object: object
}

function sendJson(res: ServerResponse, data: unknown, status = 200): void {
  res.writeHead(status, { 'Content-Type': 'application/json' })
  res.end(JSON.stringify(data))
}

function sendError(res: ServerResponse, message: string, status = 400): void {
  sendJson(res, { error: message }, status)
}

/**
 * Handle HTTP API requests.
 * Returns true if request was handled, false if not matched (pass to next handler).
 */
export async function handleApiRequest(
  req: IncomingMessage,
  res: ServerResponse,
): Promise<boolean> {
  // CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader(
    'Access-Control-Allow-Methods',
    'GET, POST, PUT, DELETE, OPTIONS',
  )
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')

  if (req.method === 'OPTIONS') {
    res.writeHead(204)
    res.end()
    return true
  }

  const url = new URL(req.url || '/', 'http://localhost')

  if (req.method === 'GET' && url.pathname === '/api/objects') {
    const uuid = url.searchParams.get('uuid') || 'root'

    const result = world3dStore.read(uuid)

    if (result === null) {
      sendError(res, `Object with uuid ${uuid} not found`, 404)
      return true
    }

    sendJson(res, result)
    return true
  }

  if (req.method === 'GET' && url.pathname === '/api/players') {
    const players = world3dStore.getAllPlayers()

    sendJson(res, players)
    return true
  }

  if (req.method === 'GET' && url.pathname === '/api/player') {
    const id = url.searchParams.get('id')
    const username = url.searchParams.get('username')
    const identifier = username || id

    if (!identifier) {
      sendError(res, 'Missing id or username parameter')
      return true
    }

    const player = world3dStore.getPlayer(identifier)
    if (!player) {
      sendError(res, `Player ${identifier} not found`, 404)
      return true
    }

    sendJson(res, player)
    return true
  }

  // Health check
  if (req.method === 'GET' && url.pathname === '/health') {
    sendJson(res, { status: 'ok' })
    return true
  }

  if (req.method === 'GET' && url.pathname === '/api/stats') {
    const stats = world3dStore.getStats()
    sendJson(res, stats)
    return true
  }

  // POST /api/objects - create object from Three.js JSON format
  if (req.method === 'POST' && url.pathname === '/api/objects') {
    const body = await parseJsonBody<CreateObjectRequest>(req)
    if (!body) {
      sendError(res, 'Invalid JSON body')
      return true
    }

    if (!body.object) {
      sendError(res, 'Missing required field: object (Three.js JSON format)')
      return true
    }

    const result = world3dStore.create({
      parentId: body.parentId,
      object: body.object,
    })

    if ('success' in result && result.success === false) {
      sendError(res, result.error, 400)
      return true
    }

    sendJson(res, result, 201)
    return true
  }

  // PUT /api/objects/:uuid - update object from Three.js JSON format
  if (req.method === 'PUT' && url.pathname.startsWith('/api/objects/')) {
    const uuid = decodeURIComponent(url.pathname.slice('/api/objects/'.length))
    if (!uuid) {
      sendError(res, 'Missing uuid in path')
      return true
    }

    const body = await parseJsonBody<UpdateObjectRequest>(req)
    if (!body) {
      sendError(res, 'Invalid JSON body')
      return true
    }

    if (!body.object) {
      sendError(res, 'Missing required field: object (Three.js JSON format)')
      return true
    }

    const result = world3dStore.update({
      uuid,
      object: body.object,
    })

    if ('success' in result && result.success === false) {
      sendError(res, result.error, 404)
      return true
    }

    sendJson(res, result)
    return true
  }

  if (req.method === 'DELETE' && url.pathname.startsWith('/api/objects/')) {
    const nodeId = decodeURIComponent(
      url.pathname.slice('/api/objects/'.length),
    )
    if (!nodeId) {
      sendError(res, 'Missing nodeId in path')
      return true
    }

    const cascade = url.searchParams.get('cascade') === 'true'

    try {
      world3dStore.delete({ nodeId, cascade })
      sendJson(res, { success: true })
      return true
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error'
      sendError(res, message, 400)
      return true
    }
  }

  // Not handled
  return false
}

async function parseJsonBody<T = Record<string, unknown>>(
  req: IncomingMessage,
): Promise<T | null> {
  return new Promise((resolve) => {
    let body = ''
    req.on('data', (chunk) => {
      body += chunk.toString()
    })
    req.on('end', () => {
      try {
        resolve(JSON.parse(body) as T)
      } catch {
        resolve(null)
      }
    })
    req.on('error', () => {
      resolve(null)
    })
  })
}
