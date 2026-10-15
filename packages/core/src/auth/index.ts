import { createHash, randomBytes, scrypt, timingSafeEqual } from 'node:crypto'
import { promisify } from 'node:util'
import { deleteCookie, getCookie, setCookie } from 'hono/cookie'
import { db } from '../db/db'
import { f, model, type RowOf } from '../db/model'
import { ForbiddenError, MasarError, ValidationError } from '../errors'
import { currentRequest, type RequestContext } from '../http/context'
import { mail } from '../mail'
import { sign, verify } from '../storage/signing'
import { resetMail, verifyMail } from './mails'

/** Built-in models, owned by Masar and created by db:sync on the default connection. */
export const users = model('users', {
  name: f.string(),
  email: f.string().unique(),
  passwordHash: f.string(),
  role: f.string().default('user'),
  /** Set when the user opened the confirmation link; null until then. */
  emailVerifiedAt: f.date().optional(),
})

export const sessions = model('sessions', {
  userId: f.ref('users'),
  tokenHash: f.string().unique(),
  expiresAt: f.date(),
})

/** A user as seen by the app: never carries the password hash. */
export type User = Omit<RowOf<typeof users>, 'passwordHash'>

export class UnauthorizedError extends MasarError {
  constructor(message = 'Please sign in first') {
    super(message, { status: 401, hint: 'Sign in through auth.login(), or send Authorization: Bearer <token> to /api routes.' })
    this.name = 'UnauthorizedError'
  }
}

export const COOKIE = 'masar_session'
const SESSION_DAYS = 30

// ── Passwords: scrypt from node:crypto, no native dependency ───────────────
const scryptAsync = promisify(scrypt) as (password: string, salt: Buffer, keylen: number, options: object) => Promise<Buffer>
const PARAMS = { N: 16384, r: 8, p: 1 }

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16)
  const hash = await scryptAsync(password, salt, 64, PARAMS)
  return `scrypt$${PARAMS.N}$${PARAMS.r}$${PARAMS.p}$${salt.toString('base64')}$${hash.toString('base64')}`
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const [scheme, N, r, p, salt, hash] = stored.split('$')
  if (scheme !== 'scrypt' || !salt || !hash) return false
  const expected = Buffer.from(hash, 'base64')
  const actual = await scryptAsync(password, Buffer.from(salt, 'base64'), expected.length, { N: Number(N), r: Number(r), p: Number(p) })
  return timingSafeEqual(actual, expected)
}

// Compared against when the email is unknown, so both paths take the same time.
let dummyHash: Promise<string> | undefined

// ── Sessions ───────────────────────────────────────────────────────────────
const sha256 = (token: string) => createHash('sha256').update(token).digest('hex')
const publicUser = ({ passwordHash: _, ...user }: RowOf<typeof users>): User => user
// The path Hono routed on (decoded), so /%61pi/... cannot reach an API route with cookie auth.
const isApi = (context: RequestContext) => context.c.req.path.startsWith('/api/')

function tokenFrom(context: RequestContext): string | undefined {
  // /api/* accepts GET for every action, so a cookie there would make links into CSRF.
  // The API only trusts bearer tokens; pages and actions only trust the cookie.
  if (isApi(context)) {
    const header = context.c.req.header('authorization')
    return header?.startsWith('Bearer ') ? header.slice(7).trim() : undefined
  }
  return getCookie(context.c, COOKIE)
}

const resolved = new WeakMap<RequestContext, Promise<User | null>>()

async function resolveUser(context: RequestContext): Promise<User | null> {
  const token = tokenFrom(context)
  if (!token) return null
  const session = await db(sessions).where({ tokenHash: sha256(token) }).first()
  if (!session) return null
  if (session.expiresAt <= new Date().toISOString()) {
    await db(sessions).delete(session.id)
    return null
  }
  const user = await db(users).where({ id: session.userId }).first()
  return user ? publicUser(user) : null
}

async function createSession(user: Pick<User, 'id'>): Promise<string> {
  const token = randomBytes(32).toString('base64url')
  const expiresAt = new Date(Date.now() + SESSION_DAYS * 86_400_000).toISOString()
  await db(sessions).create({ userId: user.id, tokenHash: sha256(token), expiresAt })
  return token
}

function requireContext(what: string): RequestContext {
  const context = currentRequest()
  if (!context) throw new MasarError(`auth.${what}() was called outside of a request`, { hint: 'Call it inside an action, a page load() or a route handler.' })
  return context
}

/**
 * Everything about who is calling:
 *
 *   const user = await auth.user()             // or null
 *   const user = await auth.requireUser()      // 401 when signed out
 *   const user = await auth.attempt(email, password)
 *   if (user) await auth.login(user)
 */
export const auth = {
  /** The signed-in user, or null. Cached per request. Always null outside a request. */
  user(): Promise<User | null> {
    const context = currentRequest()
    if (!context) return Promise.resolve(null)
    let user = resolved.get(context)
    if (!user) resolved.set(context, (user = resolveUser(context)))
    return user
  },

  async requireUser(): Promise<User> {
    const user = await auth.user()
    if (!user) throw new UnauthorizedError()
    return user
  },

  /** Create a user with a hashed password. Throws 422 when the email is taken. */
  async register(data: { name: string; email: string; password: string; role?: string }): Promise<User> {
    const email = data.email.trim().toLowerCase()
    if (await db(users).where({ email }).exists()) {
      throw new ValidationError({ email: ['This email is already registered'] })
    }
    const row = await db(users).create({ name: data.name, email, role: data.role, passwordHash: await hashPassword(data.password) })
    return publicUser(row)
  },

  /** Check credentials without signing in. */
  async attempt(email: string, password: string): Promise<User | null> {
    const row = await db(users).where({ email: email.trim().toLowerCase() }).first()
    if (!row) {
      await verifyPassword(password, await (dummyHash ??= hashPassword('masar')))
      return null
    }
    return (await verifyPassword(password, row.passwordHash)) ? publicUser(row) : null
  },

  /** Start a browser session (httpOnly cookie). */
  async login(user: User): Promise<void> {
    const context = requireContext('login')
    const token = await createSession(user)
    setCookie(context.c, COOKIE, token, {
      httpOnly: true,
      sameSite: 'Lax',
      secure: context.url.protocol === 'https:',
      path: '/',
      maxAge: SESSION_DAYS * 86_400,
    })
    resolved.set(context, Promise.resolve(user))
  },

  /** A bearer token for mobile apps and other API clients. Send it as Authorization: Bearer <token>. */
  createToken(user: User): Promise<string> {
    return createSession(user)
  },

  /** End the current session, from the cookie or the bearer token. */
  async logout(): Promise<void> {
    const context = requireContext('logout')
    const token = tokenFrom(context)
    if (token) await db(sessions).where({ tokenHash: sha256(token) }).deleteAll()
    if (!isApi(context)) deleteCookie(context.c, COOKIE, { path: '/' })
    resolved.set(context, Promise.resolve(null))
  },

  hashPassword,
  verifyPassword,

  /** Mail a link that confirms the user's email (valid 2 days, until the email changes). */
  async sendVerification(user: Pick<User, 'id' | 'name' | 'email'>): Promise<void> {
    const token = signToken({ u: user.id, p: 'verify', s: stamp(user.email) }, 2 * 86_400)
    await verifyMail.send({ to: user.email, props: { name: user.name, app: appName(), url: mail.url(`${authPaths().verify}?token=${token}`) } })
  },

  /** Confirm the email from a link. Returns the user, or null when the link is wrong or expired. */
  async verifyEmail(token: string): Promise<User | null> {
    const data = readToken(token, 'verify')
    const row = data ? await db(users).where({ id: data.u }).first() : null
    if (!row || stamp(row.email) !== data!.s) return null
    const updated = row.emailVerifiedAt ? row : await db(users).update(row.id, { emailVerifiedAt: new Date().toISOString() })
    return publicUser(updated)
  },

  /**
   * Mail a password reset link (valid 1 hour, works once: it dies when the password changes).
   * Silent when the email is unknown, so the form cannot reveal who has an account.
   */
  async sendPasswordReset(email: string): Promise<void> {
    const row = await db(users).where({ email: email.trim().toLowerCase() }).first()
    if (!row) return
    const token = signToken({ u: row.id, p: 'reset', s: stamp(row.passwordHash) }, 3600)
    await resetMail.send({ to: row.email, props: { name: row.name, app: appName(), url: mail.url(`${authPaths().reset}?token=${token}`) } })
  },

  /** Set a new password from a reset link and end every session of that user. Null when the link is invalid. */
  async resetPassword(token: string, password: string): Promise<User | null> {
    const data = readToken(token, 'reset')
    const row = data ? await db(users).where({ id: data.u }).first() : null
    if (!row || stamp(row.passwordHash) !== data!.s) return null
    const updated = await db(users).update(row.id, { passwordHash: await hashPassword(password), emailVerifiedAt: row.emailVerifiedAt ?? new Date().toISOString() })
    await db(sessions).where({ userId: row.id }).deleteAll()
    return publicUser(updated)
  },
}

// ── Signed, stateless tokens for mail links ────────────────────────────────
const stamp = (value: string) => createHash('sha256').update(value).digest('base64url').slice(0, 16)

function signToken(data: { u: string; p: string; s: string }, seconds: number): string {
  const body = Buffer.from(JSON.stringify({ ...data, e: Math.floor(Date.now() / 1000) + seconds })).toString('base64url')
  return `${body}.${sign(`token:${body}`)}`
}

function readToken(token: string, purpose: string): { u: string; s: string } | null {
  const [body, signature] = String(token ?? '').split('.')
  if (!body || !verify(`token:${body}`, signature)) return null
  try {
    const data = JSON.parse(Buffer.from(body, 'base64url').toString()) as { u: string; p: string; s: string; e: number }
    return data.p === purpose && data.e * 1000 > Date.now() ? data : null
  } catch {
    return null
  }
}

interface AuthSettings {
  appName: string
  verifyPath: string
  resetPath: string
}
const settingsScope = globalThis as typeof globalThis & { __masarAuth?: AuthSettings }
export function configureAuth(settings: AuthSettings) {
  settingsScope.__masarAuth = settings
}
const appName = () => settingsScope.__masarAuth?.appName ?? 'Masar'
const authPaths = () => ({ verify: settingsScope.__masarAuth?.verifyPath ?? '/verify-email', reset: settingsScope.__masarAuth?.resetPath ?? '/reset-password' })

/** Signed-in users who confirmed their email. Combine: (args) => verified()(args) && ... */
export function verified(): AuthorizeRule {
  return ({ user }) => user !== null && Boolean(user.emailVerifiedAt)
}

// ── Authorization rules for action({ authorize }) ──────────────────────────
export type AuthorizeRule = (args: { user: User | null }) => boolean | Promise<boolean>
/** 'public': anyone. 'user': any signed-in user. Or a rule such as role('admin'). */
export type Authorize = 'public' | 'user' | AuthorizeRule

/** Signed-in users whose role is one of these. */
export function role(...roles: string[]): AuthorizeRule {
  return ({ user }) => user !== null && roles.includes(user.role)
}

/** Throws 401 when signed out and the rule needs a user, 403 when the rule says no. */
export async function checkAuthorize(rule: Authorize | undefined, id: string): Promise<void> {
  if (rule === 'public') return
  if (rule === undefined) {
    throw new MasarError(`Action "${id}" has no authorize`, {
      hint: "Actions are closed by default. Add authorize: 'public', 'user' or a rule like role('admin').",
    })
  }
  const user = await auth.user()
  if (rule === 'user') {
    if (!user) throw new UnauthorizedError()
    return
  }
  if (await rule({ user })) return
  if (!user) throw new UnauthorizedError()
  throw new ForbiddenError()
}
