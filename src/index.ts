import 'dotenv/config'
import { createServer } from 'http'
import { handleApiRequest } from './api'
import { setupWebSocket, stopWebSocket } from './ws'
import { initializeWorld3D } from './store'

// --- Config ---

const PORT = parseInt(process.env.WORLD3D_PORT || '4100', 10)

// --- Main ---

async function main(): Promise<void> {
  // Initialize world store
  await initializeWorld3D()

  // Create HTTP server
  const server = createServer(async (req, res) => {
    try {
      const handled = await handleApiRequest(req, res)
      if (!handled) {
        res.writeHead(404, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({ error: 'Not found' }))
      }
    } catch (err) {
      console.error('[world3d] Request error:', err)
      res.writeHead(500, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ error: 'Internal server error' }))
    }
  })

  // Setup WebSocket (handles upgrade)
  setupWebSocket(server)

  // Start server
  server.listen(PORT, () => {
    // eslint-disable-next-line no-console
    console.log(`[world3d] Server listening on port ${PORT} (HTTP + WebSocket)`)
  })

  // Graceful shutdown
  function shutdown(): void {
    // eslint-disable-next-line no-console
    console.log('[world3d] Shutting down...')
    stopWebSocket()
    server.close(() => {
      // eslint-disable-next-line no-console
      console.log('[world3d] Server closed')
      process.exit(0)
    })
  }

  process.on('SIGINT', shutdown)
  process.on('SIGTERM', shutdown)
}

main().catch((err) => {
  console.error('[world3d] Failed to start:', err)
  process.exit(1)
})
