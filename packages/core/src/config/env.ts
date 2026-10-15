import { MasarError } from '../errors'

function read(key: string): string | undefined {
  const value = process.env[key]
  return value === undefined || value === '' ? undefined : value
}

function missing(key: string): never {
  throw new MasarError(`Missing environment variable ${key}`, {
    hint: `Add ${key}=... to the .env file in your project root (see .env.example).`,
  })
}

function envString(key: string, fallback?: string): string {
  return read(key) ?? fallback ?? missing(key)
}

function envNumber(key: string, fallback?: number): number {
  const raw = read(key)
  if (raw === undefined) return fallback ?? missing(key)
  const value = Number(raw)
  if (Number.isNaN(value)) {
    throw new MasarError(`Environment variable ${key} must be a number, got "${raw}"`, {
      hint: `Fix ${key} in your .env file.`,
    })
  }
  return value
}

function envBool(key: string, fallback?: boolean): boolean {
  const raw = read(key)
  if (raw === undefined) return fallback ?? missing(key)
  return ['true', '1', 'yes', 'on'].includes(raw.toLowerCase())
}

/**
 * Read configuration from the environment (.env is loaded by the masar CLI).
 *
 *   env('APP_NAME', 'My app')     → string
 *   env.number('PORT', 3000)      → number
 *   env.bool('APP_DEBUG', false)  → boolean
 *   env.optional('SENTRY_DSN')    → string | undefined
 */
export const env = Object.assign(envString, {
  number: envNumber,
  bool: envBool,
  optional: read,
})
