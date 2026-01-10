/**
 * Express API server for Directus Template CLI
 */

import cors from 'cors'
import express, {
  type Express, type NextFunction, type Request, type Response,
} from 'express'
import rateLimit from 'express-rate-limit'

import {logger} from '../lib/utils/logger.js'
import {VERSION} from './constants.js'
import {applyTemplate, extractTemplate, healthCheck} from './handlers.js'
import {authMiddleware, isAuthEnabled} from './middleware/auth.js'

/**
 * Create and configure the Express application
 */
export function createApp(): Express {
  const app = express()

  // Rate limiting middleware for API endpoints
  // Limit to 10 requests per minute per IP for apply/extract endpoints
  const apiLimiter = rateLimit({
    legacyHeaders: false, // Disable the `X-RateLimit-*` headers
    max: 10, // Limit each IP to 10 requests per windowMs
    message: {
      error: 'Too many requests, please try again later.',
      success: false,
    },
    standardHeaders: true, // Return rate limit info in the `RateLimit-*` headers
    windowMs: 60 * 1000, // 1 minute
  })

  // Middleware
  app.use(cors())
  app.use(express.json())
  app.use(express.urlencoded({extended: true}))

  // Request logging middleware
  app.use((req: Request, res: Response, next: NextFunction) => {
    logger.log('info', `${req.method} ${req.path}`)
    next()
  })

  // Routes
  app.get('/health', healthCheck)
  app.get('/', (req: Request, res: Response) => {
    res.json({
      authEnabled: isAuthEnabled(),
      endpoints: {
        apply: 'POST /api/apply',
        extract: 'POST /api/extract',
        health: 'GET /health',
      },
      message: 'Directus Template CLI API',
      version: VERSION,
    })
  })

  // API routes (with rate limiting and authentication)
  app.post('/api/apply', apiLimiter, authMiddleware, applyTemplate)
  app.post('/api/extract', apiLimiter, authMiddleware, extractTemplate)

  // Error handling middleware
  app.use((err: Error, req: Request, res: Response, _next: NextFunction) => {
    logger.log('error', 'Unhandled error', {error: err.message})
    res.status(500).json({
      error: 'Internal server error',
      message: err.message,
      success: false,
    })
  })

  // 404 handler
  app.use((req: Request, res: Response) => {
    res.status(404).json({
      error: 'Not found',
      message: `Route ${req.method} ${req.path} not found`,
      success: false,
    })
  })

  return app
}

/**
 * Start the server
 */
export function startServer(port: number = 3000): void {
  const app = createApp()
  const authEnabled = isAuthEnabled()

  app.listen(port, () => {
    console.log('\n🚀 Directus Template CLI API Server')
    console.log(`📡 Server running on http://localhost:${port}`)
    console.log(`🔐 Authentication: ${authEnabled ? 'ENABLED' : 'DISABLED (set API_AUTH_TOKEN to enable)'}`)
    console.log('\nAvailable endpoints:')
    console.log('  GET  /              - API information')
    console.log('  GET  /health        - Health check')
    console.log(`  POST /api/apply     - Apply a template${authEnabled ? ' (requires auth)' : ''}`)
    console.log(`  POST /api/extract   - Extract a template${authEnabled ? ' (requires auth)' : ''}`)
    console.log('\nPress Ctrl+C to stop the server\n')
  })
}

// If this file is run directly, start the server
if (import.meta.url === `file://${process.argv[1]}`) {
  const port = Number(process.env.PORT) || 3000
  startServer(port)
}
