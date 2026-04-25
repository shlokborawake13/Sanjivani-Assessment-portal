/**
 * Simple in-memory rate limiter middleware.
 * No external dependencies (no Redis needed for small-scale).
 *
 * Usage:
 *   import { rateLimiter } from '../middleware/rateLimit.js'
 *   router.use(rateLimiter({ windowMs: 60000, max: 30 }))
 */

const stores = new Map()

export function rateLimiter({ windowMs = 60000, max = 30, message = 'Too many requests, please slow down.' } = {}) {
  // Unique store per limiter instance
  const storeKey = Symbol()
  stores.set(storeKey, new Map())

  // Clean up expired entries periodically
  setInterval(() => {
    const store = stores.get(storeKey)
    const now = Date.now()
    for (const [key, entry] of store) {
      if (now - entry.windowStart > windowMs) {
        store.delete(key)
      }
    }
  }, windowMs * 2)

  return (req, res, next) => {
    const store = stores.get(storeKey)
    // Key by user ID (authenticated) or IP
    const key = req.user?.id || req.ip || 'unknown'
    const now = Date.now()

    let entry = store.get(key)
    if (!entry || now - entry.windowStart > windowMs) {
      entry = { count: 1, windowStart: now }
      store.set(key, entry)
      return next()
    }

    entry.count++
    if (entry.count > max) {
      return res.status(429).json({ error: message })
    }

    next()
  }
}
