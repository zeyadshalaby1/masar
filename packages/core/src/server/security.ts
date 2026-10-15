import type { Context, Hono, MiddlewareHandler } from 'hono'
import { cors } from 'hono/cors'
import { secureHeaders } from 'hono/secure-headers'
import type { SecurityConfig } from '../config/app'
import { MasarError } from '../errors'

/** Passed by the CLI servers so the rate limiter can see the client address. */
export interface ServerEnv {
  ip?: string
}

const DEFAULT_RATE_LIMIT = { max: 300, windowSeconds: 60 }

export function applySecurity(hono: Hono, config: SecurityConfig = {}, unlimited: string[] = []) {
  hono.use('*', secureHeaders())

  // Only the JSON API is for other origins (mobile apps, other sites). Actions stay same-origin:
  // their x-masar-action header is the CSRF guard and CORS would weaken it.
  if (config.cors) {
    const origins = config.cors.origins
    hono.use('/api/*', cors({
      origin: origins === '*' ? '*' : [...origins],
      credentials: origins !== '*',
      allowHeaders: ['Content-Type', 'Authorization'],
      maxAge: 600,
    }))
  }

  if (config.rateLimit !== false) {
    const limiter = rateLimit({ ...DEFAULT_RATE_LIMIT, ...config.rateLimit }, config.trustProxy ?? false)
    hono.use('*', (c, next) => (c.req.method === 'GET' && unlimited.some((p) => c.req.path.startsWith(p)) ? next() : limiter(c, next)))
  }
}

// In-memory fixed window per client. Good for one server; a shared store comes with Redis.
function rateLimit(limit: { max: number; windowSeconds: number }, trustProxy: boolean): MiddlewareHandler {
  const windowMs = limit.windowSeconds * 1000
  const hits = new Map<string, { count: number; resetAt: number }>()
  let nextSweep = Date.now() + windowMs

  return async (c, next) => {
    const now = Date.now()
    if (now >= nextSweep) {
      for (const [key, entry] of hits) if (entry.resetAt <= now) hits.delete(key)
      nextSweep = now + windowMs
    }
    const key = clientIp(c, trustProxy)
    let entry = hits.get(key)
    if (!entry || entry.resetAt <= now) {
      entry = { count: 0, resetAt: now + windowMs }
      hits.set(key, entry)
    }
    entry.count++
    const retryAfter = Math.ceil((entry.resetAt - now) / 1000)
    c.header('RateLimit-Limit', String(limit.max))
    c.header('RateLimit-Remaining', String(Math.max(0, limit.max - entry.count)))
    c.header('RateLimit-Reset', String(retryAfter))
    if (entry.count > limit.max) {
      c.header('Retry-After', String(retryAfter))
      throw new MasarError('Too many requests', {
        status: 429,
        hint: `More than ${limit.max} requests in ${limit.windowSeconds}s from ${key}. Raise security.rateLimit in src/config/app.ts if this is real traffic, or set trustProxy: true behind a proxy so clients are told apart.`,
      })
    }
    await next()
  }
}

function clientIp(c: Context, trustProxy: boolean) {
  if (trustProxy) {
    const forwarded = c.req.header('x-forwarded-for')?.split(',')[0]?.trim()
    if (forwarded) return forwarded
  }
  return (c.env as ServerEnv | undefined)?.ip ?? 'unknown'
}
