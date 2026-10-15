import { inertia } from '@hono/inertia'
import { type Context, Hono } from 'hono'
import { isAction } from '../actions/action'
import type { ResolvedAppConfig } from '../config/app'
import type { DatabaseConfig } from '../config/database'
import type { SyncReport } from '../db/adapters/types'
import { isModel, type Model } from '../db/model'
import { closeConnections, configureDatabase, getAdapter } from '../db/registry'
import { applySecurity, type ServerEnv } from './security'
import { db } from '../db/db'
import { configureMail, mailJob, outbox, type MailerConfig } from '../mail'
import type { QueueConfig } from '../config/queue'
import { configureQueue, isJob, queueConfig, queueDriver, type Job } from '../jobs'
import { configureSchedule, isSchedule, startScheduler, type ScheduledTask } from '../jobs/schedule'
import { createFake, isSeed, type SeedDefinition } from '../db/seed'
import { pendingMigrations, runMigrations, type Migration, type PlannedMigration } from '../db/migrations'
import { configureI18n, i18nProps } from '../i18n'
import type { StorageConfig } from '../config/storage'
import { checkRules, configureStorage, readLocal, storage, storageConfig, verifyLocalGet, verifyLocalPut, writeLocalStream } from '../storage'
import { mimeOf } from '../storage/mime'
import { auth, checkAuthorize, configureAuth, role, sessions, UnauthorizedError, users, type Authorize, type User } from '../auth'
import type { AdminPageMeta } from '../admin/define'
import { createAdmin, type AdminEngine } from '../admin/server'
import type { AdminShared } from '../admin/types'
import { MasarError, NotFoundError, RedirectSignal, ValidationError } from '../errors'
import { runInRequest } from '../http/context'
import { isRoutesDefinition, type RouteHandler } from '../http/routes'
import { colors, log } from '../logger'
import type { ModuleDefinition } from '../modules/define'
import type { PageModule } from '../pages/types'
import { createRootView, devHooks } from './root-view'
import { metaFor, type SsrInput } from './ssr'

type Globbed = Record<string, unknown>

export interface ServerInput {
  app: ResolvedAppConfig
  database: DatabaseConfig
  mode: 'development' | 'production'
  /** import.meta.glob results, keyed by file path. */
  modules: Globbed
  schemas: Globbed
  actions: Globbed
  routes: Globbed
  pages: Globbed
  /** Each module's migrations folder. */
  migrations?: Globbed
  /** src/locales/<code>.json */
  locales?: Globbed
  /** src/config/storage.ts, when the app has one. */
  storage?: Globbed
  /** src/modules/admin/resources/*.ts */
  adminResources?: Globbed
  /** src/modules/admin/dashboard.ts */
  adminDashboard?: Globbed
  /** Each module's seeds.ts. */
  seeds?: Globbed
  /** Each module's jobs/*.ts. */
  jobs?: Globbed
  /** Each module's schedule.ts. */
  schedules?: Globbed
  /** src/config/queue.ts, when the app has one. */
  queue?: Globbed
  /** src/config/mail.ts, when the app has one. */
  mail?: Globbed
  /** src/shared/layouts/AppLayout.tsx (eager), for server rendering. */
  layouts?: Globbed
  /** Each module's views/layout.tsx (lazy), for server rendering. */
  moduleLayouts?: Record<string, () => Promise<unknown>>
}

export interface RouteInfo {
  method: string
  path: string
  kind: 'page' | 'action' | 'api' | 'route'
  module: string
  target: string
}

export interface ModuleInfo {
  name: string
  title: string
  prefix: string
  store: string
  driver: string
  ui: boolean
  api: boolean
  depends: string[]
  nav: boolean
  authorize?: Authorize
  models: string[]
  actions: string[]
  pages: string[]
}

export interface MasarServer {
  fetch(request: Request, env?: ServerEnv): Promise<Response>
  hono: Hono
  app: ResolvedAppConfig
  mode: 'development' | 'production'
  modules: ModuleInfo[]
  routes: RouteInfo[]
  models: Model[]
  /** Create missing tables/collections, columns and indexes (never drops anything). */
  sync(): Promise<SyncReport[]>
  /**
   * Start background work in this process: running queued jobs and the scheduler (unless worker is false).
   * Returns a stop function that waits for running jobs.
   */
  background(options?: { worker?: boolean; concurrency?: number }): Promise<{ driver: 'memory' | 'database'; worker: boolean; stop(): Promise<void> }>
  /** Run module seeds (dependencies first). `fresh` empties every table before. */
  seed(options?: { fresh?: boolean; only?: string[]; seed?: number; log?: (line: string) => void }): Promise<{ module: string; ms: number }[]>
  /** The admin engine, when the app has an admin module. */
  admin?: AdminEngine
  /** Migration ids not yet run on their database, in the order they will run. */
  pendingMigrations(): Promise<string[]>
  /** Run pending migrations, then sync. Returns the migration ids that ran. */
  migrate(): Promise<string[]>
  close(): Promise<void>
}

const MODULE_IN_PATH = /\/modules\/([^/]+)\//
const PAGE_IN_PATH = /\/modules\/([^/]+)\/views\/pages\/(.+)\.tsx$/

function moduleOf(path: string): string {
  const match = path.match(MODULE_IN_PATH)
  if (!match) throw new MasarError(`Cannot tell which module "${path}" belongs to`)
  return match[1]
}

const capitalize = (s: string) => s.charAt(0).toUpperCase() + s.slice(1).replace(/[-_](\w)/g, (_, c) => ` ${c.toUpperCase()}`)
const kebab = (s: string) => s.replace(/[A-Z]/g, (m) => `-${m.toLowerCase()}`)

function joinPath(...parts: string[]): string {
  const joined = parts.join('/').replace(/\/+/g, '/').replace(/\/$/, '')
  return joined.startsWith('/') ? joined || '/' : `/${joined}`
}

/** views/pages/index.tsx → '', [id].tsx → ':id', [id]/edit.tsx → ':id/edit' */
function pagePath(file: string): string {
  return file
    .split('/')
    .filter((segment, i, all) => !(segment === 'index' && i === all.length - 1))
    .map((segment) => segment.replace(/^\[(.+)\]$/, ':$1'))
    .join('/')
}

/** Static routes before dynamic ones, so /courses/create wins over /courses/:id. */
function routeWeight(path: string): [number, number] {
  const segments = path.split('/').filter(Boolean)
  return [segments.filter((s) => s.startsWith(':')).length, -segments.length]
}

function wantsHtml(c: Context) {
  return c.req.header('x-inertia') !== undefined || (c.req.header('accept') ?? '').includes('text/html')
}

export function createServer(input: ServerInput): MasarServer {
  const { app: config, database, mode } = input
  const debug = config.debug
  configureDatabase(database)
  if (!config.locales.includes(config.locale)) {
    throw new MasarError(`Default locale "${config.locale}" is not in locales [${config.locales.join(', ')}]`, {
      hint: `In src/config/app.ts add '${config.locale}' to locales, or set locale to one of them.`,
    })
  }
  configureStorage((Object.values(input.storage ?? {})[0] as { default?: StorageConfig } | undefined)?.default)
  configureI18n(config.locales, config.locale, input.locales ?? {})

  // ── 1. Modules ────────────────────────────────────────────────────────────
  const modules = new Map<string, ModuleInfo>()
  for (const [path, mod] of Object.entries(input.modules)) {
    const folder = moduleOf(path)
    const definition = (mod as { default?: ModuleDefinition }).default
    if (!definition || typeof definition.name !== 'string') {
      throw new MasarError(`src/modules/${folder}/module.ts must export default defineModule({ ... })`, {
        hint: `export default defineModule({ name: '${folder}' })`,
      })
    }
    if (definition.name !== folder) {
      throw new MasarError(`Module in folder "${folder}" is named "${definition.name}"`, {
        hint: `Use name: '${folder}' in src/modules/${folder}/module.ts, or rename the folder.`,
      })
    }
    const store = definition.store ?? database.default
    const connection = database.connections[store]
    if (!connection) {
      throw new MasarError(`Module "${folder}" uses store "${store}", which is not a database connection`, {
        hint: `Add "${store}" to src/config/database.ts or use one of: ${Object.keys(database.connections).join(', ')}.`,
      })
    }
    modules.set(folder, {
      name: folder,
      title: definition.title ?? capitalize(folder),
      prefix: joinPath(definition.prefix ?? folder),
      store,
      driver: connection.driver,
      ui: definition.expose?.ui ?? true,
      api: definition.expose?.api ?? false,
      nav: definition.nav ?? true,
      authorize: definition.authorize,
      depends: definition.depends ?? [],
      models: [],
      actions: [],
      pages: [],
    })
  }

  const requireModule = (path: string, what: string) => {
    const name = moduleOf(path)
    const info = modules.get(name)
    if (!info) {
      throw new MasarError(`src/modules/${name} has ${what} but no module.ts`, {
        hint: `Create src/modules/${name}/module.ts with export default defineModule({ name: '${name}' }), or run: masar make:module ${name}`,
      })
    }
    return info
  }

  for (const info of modules.values()) {
    for (const dependency of info.depends) {
      if (!modules.has(dependency)) {
        throw new MasarError(`Module "${info.name}" depends on "${dependency}", which does not exist`, {
          hint: `Create it with: masar make:module ${dependency}, or remove it from depends in ${info.name}/module.ts.`,
        })
      }
    }
  }

  // ── 2. Models ─────────────────────────────────────────────────────────────
  const models: Model[] = []
  const tables = new Map<string, string>()
  // Masar's own tables live on the default connection under the reserved module name "masar".
  for (const value of [users, sessions] as Model[]) {
    value.module = 'masar'
    value.store = database.default
    models.push(value)
    tables.set(`${database.default}:${value.table}`, 'masar (built-in auth)')
  }
  for (const [path, exports] of Object.entries(input.schemas)) {
    const info = requireModule(path, 'a schema.ts')
    for (const value of Object.values(exports as Record<string, unknown>)) {
      if (!isModel(value)) continue
      if (value.module && value.module !== info.name) {
        throw new MasarError(`Model "${value.table}" is exported by both "${value.module}" and "${info.name}"`, {
          hint: 'Define each model in exactly one module schema.ts and import it where you need it.',
        })
      }
      const key = `${info.store}:${value.table}`
      if (tables.has(key) && tables.get(key) !== info.name) {
        throw new MasarError(`Two modules define the table "${value.table}" on connection "${info.store}"`, {
          hint: `Rename one of them in ${tables.get(key)}/schema.ts or ${info.name}/schema.ts.`,
        })
      }
      tables.set(key, info.name)
      value.module = info.name
      value.store = info.store
      models.push(value)
      info.models.push(value.table)
    }
  }

  // ── 3. Actions ────────────────────────────────────────────────────────────
  type AnyAction = (input?: unknown) => Promise<unknown>
  const actions = new Map<string, AnyAction>()
  for (const [path, exports] of Object.entries(input.actions)) {
    const info = requireModule(path, 'an actions.ts')
    for (const [name, value] of Object.entries(exports as Record<string, unknown>)) {
      if (!isAction(value)) continue
      if (value.definition.authorize === undefined) {
        throw new MasarError(`Action "${info.name}.${name}" has no authorize`, {
          hint: `Actions are closed by default. In src/modules/${info.name}/actions.ts add authorize: 'public' (anyone), 'user' (signed in) or role('admin').`,
        })
      }
      value.id = `${info.name}.${name}`
      actions.set(value.id, value)
      info.actions.push(name)
    }
  }

  // ── 3a. Jobs and schedules ─────────────────────────────────────────────
  const jobs = new Map<string, { job: Job<unknown>; module: string }>()
  for (const [path, exports] of Object.entries(input.jobs ?? {})) {
    const info = requireModule(path, 'jobs')
    for (const value of Object.values(exports as Record<string, unknown>)) {
      if (!isJob(value)) continue
      const other = jobs.get(value.name)
      if (other && other.job !== value) {
        throw new MasarError(`Two jobs are named "${value.name}" (in ${other.module} and ${info.name})`, {
          hint: 'Job names must be unique: workers find jobs by name. Prefix them with the module, e.g. "courses.sendCertificate".',
        })
      }
      jobs.set(value.name, { job: value, module: info.name })
    }
  }
  configureQueue((Object.values(input.queue ?? {})[0] as { default?: QueueConfig } | undefined)?.default, [mailJob, ...[...jobs.values()].map((j) => j.job)])
  configureAuth({ appName: config.name, verifyPath: config.auth.verifyPath, resetPath: config.auth.resetPath })
  configureMail((Object.values(input.mail ?? {})[0] as { default?: MailerConfig } | undefined)?.default, config.url ?? `http://localhost:${config.port}`)
  const tasks: ScheduledTask[] = []
  for (const [path, exports] of Object.entries(input.schedules ?? {})) {
    const info = requireModule(path, 'a schedule.ts')
    const definition = (exports as { default?: unknown }).default
    if (!isSchedule(definition)) {
      throw new MasarError(`src/modules/${info.name}/schedule.ts must export default defineSchedule(...)`, {
        hint: "import { defineSchedule } from 'masar', then export default defineSchedule((s) => { s.every('day').at('03:00').run(myJob) })",
      })
    }
    definition.tasks.forEach((task, index) => tasks.push({ ...task, name: `${info.name}.${task.name ?? (isJob(task.target) ? task.target.name : `task${index + 1}`)}` }))
  }
  configureSchedule(tasks, config.timezone)

  // ── 3b. Migrations ──────────────────────────────────────────────────────
  const planned: PlannedMigration[] = []
  for (const [path, exports] of Object.entries(input.migrations ?? {})) {
    const info = requireModule(path, 'migrations')
    const file = path.split('/').pop()!.replace(/\.ts$/, '')
    if (!/^\d{8}_\d{6}_[a-z0-9_]+$/.test(file)) {
      throw new MasarError(`Migration file "${path}" is not named <YYYYMMDD>_<HHMMSS>_<name>.ts`, {
        hint: `Create migrations with: masar make:migration ${info.name} <name>`,
      })
    }
    const migration = (exports as { default?: Migration }).default
    if (migration?.__masar !== 'migration') {
      throw new MasarError(`${path} must export default defineMigration({ up })`, {
        hint: "import { defineMigration } from 'masar', then export default defineMigration({ async up(m) { ... } })",
      })
    }
    planned.push({ id: `${info.name}/${file}`, connection: info.store, migration })
  }
  // Timestamp order across modules, so a migration can rely on earlier ones from other modules.
  planned.sort((a, b) => a.id.split('/')[1]!.localeCompare(b.id.split('/')[1]!) || a.id.localeCompare(b.id))

  // ── 4. HTTP ───────────────────────────────────────────────────────────────
  const hono = new Hono()
  const routes: RouteInfo[] = []
  const seen = new Map<string, string>()
  const record = (route: RouteInfo) => {
    for (const method of route.method.split('|')) {
      const key = `${method} ${route.path}`
      if (seen.has(key)) {
        throw new MasarError(`Two routes answer ${key}: ${seen.get(key)} and ${route.target}`, {
          hint: 'Change a module prefix in module.ts, rename a page file, or export a different `route` from the page.',
        })
      }
      seen.set(key, route.target)
    }
    routes.push(route)
  }

  if (mode === 'development') {
    hono.use('*', async (c, next) => {
      const started = performance.now()
      await next()
      const path = new URL(c.req.url).pathname
      if (path.startsWith('/favicon')) return
      const status = c.res.status
      const paint = status >= 500 ? colors.red : status >= 400 ? colors.yellow : colors.green
      log.info('http', `${c.req.method} ${path} ${paint(String(status))} ${colors.dim(`${Math.round(performance.now() - started)}ms`)}`)
    })
  }

  // Files are fetched many per page (images, video ranges), so they are not counted by the rate limiter.
  const filePrefixes = [
    '/_masar/files',
    ...Object.values(storageConfig().disks).flatMap((d) => (d.driver === 'local' && d.url?.startsWith('/') ? [d.url] : [])),
  ]
  applySecurity(hono, config.security, filePrefixes)

  hono.use('*', (c, next) => runInRequest({ request: c.req.raw, url: new URL(c.req.url), c }, next))

  // Filled when pages are registered below; read per request.
  const pageModules = new Map<string, PageModule>()
  const { rootView, version } = createRootView(config, mode, {
    enabled: config.ssr !== false,
    input: {
      pages: pageModules,
      appLayout: (Object.values(input.layouts ?? {})[0] as { default?: SsrInput['appLayout'] } | undefined)?.default,
      moduleLayouts: new Map(
        Object.entries(input.moduleLayouts ?? {}).flatMap(([path, load]) => {
          const name = path.match(/\/modules\/([^/]+)\/views\/layout\.tsx$/)?.[1]
          return name ? [[name, load] as const] : []
        }),
      ),
      // Private pages gain nothing from SSR (no search engine sees them).
      skip: (name) => Boolean(modules.get(name)?.authorize),
    },
  })
  const nav = () =>
    [...modules.values()]
      .filter((m) => m.ui && m.nav && m.pages.includes('index'))
      .sort((a, b) => (a.prefix === '/' ? -1 : b.prefix === '/' ? 1 : a.title.localeCompare(b.title)))
      .map((m) => ({ name: m.name, title: m.title, href: m.prefix }))

  // Inertia's share() is synchronous, so the user is resolved before it for page requests.
  const pageUsers = new WeakMap<Context, User | null>()
  const adminShared = new WeakMap<Context, AdminShared>()
  hono.use('*', async (c, next) => {
    if (c.req.method === 'GET' && wantsHtml(c) && !c.req.path.startsWith('/api/')) {
      pageUsers.set(c, await auth.user())
      const adminInfo = modules.get('admin')
      if (admin && adminInfo && (c.req.path === adminInfo.prefix || c.req.path.startsWith(`${adminInfo.prefix}/`))) {
        const allowed = await checkAuthorize(adminInfo.authorize ?? role('admin'), 'admin').then(() => true, () => false)
        if (allowed) adminShared.set(c, admin.shared())
      }
    }
    await next()
  })

  hono.use(
    '*',
    inertia({
      version,
      rootView,
      share: (c) => ({
        masar: { app: { name: config.name }, nav: nav(), user: pageUsers.get(c) ?? null, i18n: i18nProps(c), admin: adminShared.get(c) ?? null },
      }),
    }),
  )

  // Actions called from the browser. The custom header blocks cross-site form posts (CSRF).
  const runAction = async (c: Context, id: string, readInput: () => Promise<unknown>) => {
    const fn = actions.get(id)
    const owner = modules.get(id.split('.')[0]!)
    if (fn && owner?.authorize) await checkAuthorize(owner.authorize, id)
    if (!fn) {
      throw new NotFoundError(`Unknown action "${id}"`, 'Only exports created with action() in actions.ts can be called.')
    }
    return c.json({ data: (await fn(await readInput())) ?? null })
  }
  const jsonBody = async (c: Context) => {
    const text = await c.req.text()
    if (!text) return undefined
    try {
      return JSON.parse(text)
    } catch {
      throw new MasarError('Request body is not valid JSON', { status: 400 })
    }
  }

  hono.post('/_masar/actions/:module/:action', async (c) => {
    if (!c.req.header('x-masar-action')) {
      throw new MasarError('Missing x-masar-action header', { status: 400, hint: 'Call actions through the generated client.' })
    }
    return runAction(c, `${c.req.param('module')}.${c.req.param('action')}`, () => jsonBody(c))
  })

  // ── Mail preview (development, log transport) ───────────────────────────
  if (mode === 'development') {
    const esc = (v: string) => v.replace(/[&<>"]/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[ch]!)
    hono.get('/_masar/mail', (c) =>
      c.html(`<!doctype html><meta charset="utf-8"><title>Masar · mail</title><body style="font-family:system-ui;background:#FCF9F8;color:#100C0A;max-width:760px;margin:40px auto;padding:0 16px">
<h1 style="font-size:22px">Sent mail <small style="color:#827872;font-weight:400">(log transport, newest first)</small></h1>
${outbox().length === 0 ? '<p style="color:#625953">Nothing sent yet.</p>' : ''}<ul style="list-style:none;padding:0">${outbox()
        .map((m) => `<li style="border:1px solid #E9E3E0;background:#fff;border-radius:10px;padding:12px 16px;margin:8px 0"><a style="color:#B03700;font-weight:600" href="/_masar/mail/${m.id}">${esc(m.subject)}</a><div style="color:#625953;font-size:13px">to ${esc(m.to.join(', '))} · ${m.sentAt}</div></li>`)
        .join('')}</ul></body>`),
    )
    hono.get('/_masar/mail/:id', (c) => {
      const message = outbox().find((m) => m.id === c.req.param('id'))
      if (!message) throw new NotFoundError('No such mail', 'The dev outbox keeps the last 50 mails, and empties when the server restarts.')
      return c.html(message.html)
    })
  }

  // ── Files ─────────────────────────────────────────────────────────────
  // 1. The browser asks for an upload slot for one file field; rules come from the schema.
  hono.post('/_masar/uploads/prepare', async (c) => {
    if (!c.req.header('x-masar-action')) throw new MasarError('Missing x-masar-action header', { status: 400 })
    await auth.requireUser()
    const body = (await jsonBody(c)) as { model?: string; field?: string; name?: string; type?: string; size?: number } | undefined
    const target = models.find((m) => m.table === body?.model)
    const field = target?.fields[body?.field ?? '']
    if (!target || !field?.meta.file) {
      throw new MasarError(`No file field "${body?.model}.${body?.field}"`, { status: 400, hint: 'Pass the table name and a field defined with f.file() or f.files().' })
    }
    const file = { name: String(body?.name ?? 'file'), type: String(body?.type || 'application/octet-stream'), size: Number(body?.size) }
    if (!Number.isFinite(file.size) || file.size < 0) throw new MasarError('Invalid file size', { status: 400 })
    checkRules(field.meta.file, file, body!.field)
    const disk = storage(field.meta.file.disk)
    const path = disk.newPath(field.meta.file.dir ?? target.table, file.name)
    return c.json({ data: { upload: disk.uploadTarget(path, file.type, file.size), file: disk.describe(path, file.name, file.size, file.type) } })
  })

  // 2. Local disks receive the bytes here, streamed to disk (S3 disks get them directly).
  hono.put('/_masar/uploads', async (c) => {
    const q = new URL(c.req.url).searchParams
    if (!verifyLocalPut(q)) throw new MasarError('Upload link is invalid or expired', { status: 403 })
    if (!c.req.raw.body) throw new MasarError('Empty upload', { status: 400 })
    const written = await writeLocalStream(q.get('d')!, q.get('p')!, c.req.raw.body, Number(q.get('n')))
    if (written !== Number(q.get('n'))) throw new MasarError('Upload was cut short', { status: 400 })
    return c.body(null, 204)
  })

  // 3. Reading local files: public disks under their url, private ones through signed links. Range for video seeking.
  const sendLocal = async (c: Context, disk: string, path: string) => {
    const range = c.req.header('range')?.match(/^bytes=(\d*)-(\d*)$/)
    const file = await readLocal(disk, path, range && range[1] ? { start: Number(range[1]), end: range[2] ? Number(range[2]) : undefined } : undefined)
    if (!file) throw new NotFoundError('File not found')
    const headers: Record<string, string> = {
      'content-type': mimeOf(path),
      'accept-ranges': 'bytes',
      'content-length': String(file.end - file.start + 1),
      'cache-control': 'public, max-age=31536000, immutable',
      // Uploaded files are user content: never let one run as a page on this origin (e.g. an SVG with script).
      'content-security-policy': "default-src 'none'; img-src 'self'; media-src 'self'; style-src 'unsafe-inline'; sandbox",
      'x-content-type-options': 'nosniff',
    }
    if (range && range[1]) headers['content-range'] = `bytes ${file.start}-${file.end}/${file.size}`
    return new Response(file.stream, { status: range && range[1] ? 206 : 200, headers })
  }
  for (const [name, disk] of Object.entries(storageConfig().disks)) {
    if (disk.driver !== 'local' || !disk.url?.startsWith('/')) continue
    const prefix = disk.url.replace(/\/$/, '')
    hono.get(`${prefix}/*`, (c) => sendLocal(c, name, decodeURIComponent(c.req.path.slice(prefix.length + 1))))
  }
  hono.get('/_masar/files', (c) => {
    const q = new URL(c.req.url).searchParams
    const [d, p, e] = [q.get('d') ?? '', q.get('p') ?? '', q.get('e') ?? '']
    if (!verifyLocalGet(d, p, e, q.get('s'))) throw new MasarError('Link is invalid or expired', { status: 403 })
    return sendLocal(c, d, p)
  })

  // JSON API for modules with expose.api
  for (const info of modules.values()) {
    if (!info.api) continue
    for (const name of info.actions) {
      const path = `/api/${info.name}/${kebab(name)}`
      const id = `${info.name}.${name}`
      hono.get(path, (c) => runAction(c, id, async () => {
        const query = c.req.queries()
        const entries = Object.entries(query).map(([k, v]) => [k, v.length > 1 ? v : v[0]])
        return entries.length > 0 ? Object.fromEntries(entries) : undefined
      }))
      hono.post(path, (c) => runAction(c, id, () => jsonBody(c)))
      record({ method: 'GET|POST', path, kind: 'api', module: info.name, target: id })
    }
  }

  // Pages
  const pages: { path: string; name: string; module: ModuleInfo; page: PageModule }[] = []
  for (const [file, page] of Object.entries(input.pages)) {
    const match = file.match(PAGE_IN_PATH)
    if (!match) continue
    const info = requireModule(file, 'pages')
    if (!info.ui) continue
    const pageModule = page as PageModule
    if (typeof pageModule.default !== 'function') {
      throw new MasarError(`${file.replace(/^.*src\//, 'src/')} has no default export`, {
        hint: 'A page exports its React component as default: export default function Page() { ... }',
      })
    }
    const relative = match[2]
    info.pages.push(relative)
    const path = pageModule.route ? joinPath(pageModule.route) : joinPath(info.prefix, pagePath(relative))
    pages.push({ path, name: `${info.name}/${relative}`, module: info, page: pageModule })
    pageModules.set(`${info.name}/${relative}`, pageModule)
  }
  // ── Admin (when src/modules/admin exists) ────────────────────────────────
  const adminModule = modules.get('admin')
  const admin = adminModule
    ? createAdmin({
        prefix: adminModule.prefix,
        models,
        resources: input.adminResources ?? {},
        dashboard: input.adminDashboard ?? {},
        pages: pages
          .filter((p) => p.module === adminModule)
          .map((p) => ({ relative: p.name.slice('admin/'.length), meta: (p.page as { admin?: AdminPageMeta }).admin })),
      })
    : undefined
  if (admin && adminModule) {
    // Back office by default: an admin module that forgets authorize is still admins only.
    const guard: Authorize = adminModule.authorize ?? role('admin')
    adminModule.authorize = guard
    const ops = {
      list: admin.list,
      record: admin.record,
      options: admin.options,
      save: admin.save,
      delete: admin.remove,
      run: admin.run,
      dashboard: admin.dashboard,
    } as Record<string, (body: never) => Promise<unknown>>
    hono.post('/_masar/admin/:op', async (c) => {
      if (!c.req.header('x-masar-action')) throw new MasarError('Missing x-masar-action header', { status: 400 })
      await checkAuthorize(guard, 'admin')
      const op = c.req.param('op')
      const body = ((await jsonBody(c)) ?? {}) as never
      if (op === 'export') {
        return c.body(await admin.exportCsv(body), 200, { 'content-type': 'text/csv; charset=utf-8' })
      }
      const fn = ops[op]
      if (!fn) throw new NotFoundError(`Unknown admin operation "${op}"`)
      return c.json({ data: (await fn(body)) ?? null })
    })
  }

  // Custom routes from routes.ts
  const custom: { path: string; method: string; module: ModuleInfo; handler: RouteHandler }[] = []
  for (const [file, exports] of Object.entries(input.routes)) {
    const info = requireModule(file, 'a routes.ts')
    const definition = (exports as { default?: unknown }).default
    if (!isRoutesDefinition(definition)) {
      throw new MasarError(`src/modules/${info.name}/routes.ts must export default defineRoutes(...)`, {
        hint: "import { defineRoutes } from 'masar' and export default defineRoutes((r) => { ... })",
      })
    }
    for (const route of definition.routes) {
      custom.push({ path: joinPath(info.prefix, route.path), method: route.method, module: info, handler: route.handler })
    }
  }

  // Pages and custom routes are registered together, most specific first,
  // so /courses/export.json and /courses/create win over /courses/:id.
  const entries = [
    ...custom.map((route) => ({
      path: route.path,
      register: () => {
        record({ method: route.method, path: route.path, kind: 'route', module: route.module.name, target: `${route.module.name}/routes.ts` })
        const guard = route.module.authorize
        hono.on(route.method, route.path, guard ? async (c) => (await checkAuthorize(guard, route.path), route.handler(c)) : route.handler)
      },
    })),
    ...pages.map(({ path, name, module, page }) => ({
      path,
      register: () => {
        record({ method: 'GET', path, kind: 'page', module: module.name, target: name })
        hono.get(path, async (c) => {
          if (module.authorize) await checkAuthorize(module.authorize, name)
          const url = new URL(c.req.url)
          const props = page.load
            ? await page.load({ params: c.req.param() as Record<string, string>, query: url.searchParams, url, request: c.req.raw })
            : {}
          if (props instanceof Response) return props
          if (props !== undefined && (typeof props !== 'object' || props === null || Array.isArray(props))) {
            throw new MasarError(`load() in ${name} must return an object of props`, {
              hint: 'Return named props: return { courses } instead of return courses.',
            })
          }
          return c.render(name, (props ?? {}) as Record<string, unknown>)
        })
      },
    })),
  ]
  entries.sort((a, b) => {
    const [da, la] = routeWeight(a.path)
    const [db, lb] = routeWeight(b.path)
    return da - db || la - lb
  })
  for (const entry of entries) entry.register()

  // ── SEO: sitemap.xml and robots.txt (a file in public/ wins over these) ──
  const publicPages = () => pages.filter((p) => !p.module.authorize && p.page.ssr !== false && !p.name.startsWith('home/errors'))
  if (!seen.has('GET /sitemap.xml')) {
    hono.get('/sitemap.xml', async (c) => {
      const base = config.url?.replace(/\/$/, '') ?? new URL(c.req.url).origin
      const urls: string[] = []
      for (const p of publicPages()) {
        if (metaFor(p.page, {}).noindex) continue
        if (!p.path.includes(':')) urls.push(p.path)
        else if (p.page.sitemap) {
          // One page's failing sitemap() must not take the whole sitemap down.
          const list = await Promise.resolve()
            .then(() => p.page.sitemap!())
            .catch((error: unknown) => (log.warn('seo', `sitemap() of ${p.name} failed: ${error instanceof Error ? error.message : String(error)}`), []))
          for (const params of list) urls.push(p.path.replace(/:(\w+)/g, (_, key: string) => encodeURIComponent(params[key] ?? '')))
        }
      }
      const esc = (v: string) => v.replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' })[ch]!)
      const body = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${[...new Set(urls)]
        .map((u) => `  <url><loc>${esc(base + u)}</loc></url>`)
        .join('\n')}\n</urlset>\n`
      return c.body(body, 200, { 'content-type': 'application/xml; charset=utf-8' })
    })
  }
  if (!seen.has('GET /robots.txt')) {
    hono.get('/robots.txt', (c) => {
      const base = config.url?.replace(/\/$/, '') ?? new URL(c.req.url).origin
      const blocked = [...modules.values()].filter((m) => m.authorize).map((m) => `Disallow: ${m.prefix}`)
      return c.text(['User-agent: *', 'Allow: /', ...blocked, 'Disallow: /_masar/', `Sitemap: ${base}/sitemap.xml`, ''].join('\n'))
    })
  }

  // ── 5. Errors ─────────────────────────────────────────────────────────────
  const renderError = (
    c: Context,
    status: number,
    error: { message: string; hint?: string; stack?: string },
  ): Response | Promise<Response> => {
    c.status(status as 400)
    return c.render('__masar/Error', {
      status,
      message: status >= 500 && !debug ? 'Something went wrong on our side.' : error.message,
      hint: debug ? (error.hint ?? null) : null,
      stack: debug && status >= 500 ? (error.stack ?? null) : null,
    }) as Response | Promise<Response>
  }

  const notFound = (c: Context): Response | Promise<Response> => {
    const path = new URL(c.req.url).pathname
    const hint = `No route answers ${c.req.method} ${path}. Run \`masar routes\` to list every route.`
    if (wantsHtml(c)) return renderError(c, 404, { message: 'Page not found', hint })
    return c.json({ message: 'Not found', ...(debug ? { hint } : {}) }, 404)
  }
  hono.notFound(notFound as Parameters<typeof hono.notFound>[0])

  hono.onError((error, c) => {
    if (error instanceof RedirectSignal) return c.redirect(error.location, error.status)
    const status = error instanceof MasarError ? error.status : 500
    if (status >= 500) {
      devHooks()?.fixStacktrace?.(error)
      log.error('error', error)
    }
    const hint = error instanceof MasarError ? error.hint : undefined
    const isPage = c.req.method === 'GET' && wantsHtml(c) && !new URL(c.req.url).pathname.startsWith('/_masar/')
    // Signed-out visitors of a protected page go to the app's login page, when it has one.
    if (isPage && error instanceof UnauthorizedError && seen.has(`GET ${config.auth.loginPath}`)) {
      const back = new URL(c.req.url)
      return c.redirect(`${config.auth.loginPath}?redirect=${encodeURIComponent(back.pathname + back.search)}`)
    }
    if (isPage) return renderError(c, status, { message: error.message, hint, stack: error.stack })
    return c.json(
      {
        message: status >= 500 && !debug ? 'Server error' : error.message,
        ...(error instanceof ValidationError ? { errors: error.errors } : {}),
        ...(debug && hint ? { hint } : {}),
      },
      status as 500,
    )
  })

  return {
    fetch: (request, env) => Promise.resolve(hono.fetch(request, env)),
    hono,
    app: config,
    mode,
    modules: [...modules.values()],
    routes,
    models,
    async sync() {
      const byConnection = new Map<string, Model[]>()
      for (const model of models) {
        const name = model.store ?? database.default
        byConnection.set(name, [...(byConnection.get(name) ?? []), model])
      }
      const reports: SyncReport[] = []
      for (const [name, list] of byConnection) {
        const adapter = await getAdapter(name)
        reports.push(await adapter.sync(list, name))
      }
      return reports
    },
    admin,
    async background(options = {}) {
      const driver = await queueDriver()
      const worker = driver.kind === 'memory' || options.worker !== false
      const stops: (() => Promise<void> | void)[] = []
      if (worker) {
        if (driver.kind === 'database') stops.push(driver.work(async () => {}, options.concurrency ?? (queueConfig() as { concurrency?: number }).concurrency ?? 5).stop)
        stops.push(startScheduler())
      }
      return {
        driver: driver.kind,
        worker,
        async stop() {
          for (const stop of stops) await stop()
        },
      }
    },
    async seed(options = {}) {
      const say = options.log ?? (() => {})
      const seeds = new Map<string, SeedDefinition>()
      for (const [path, mod] of Object.entries(input.seeds ?? {})) {
        const info = requireModule(path, 'a seeds.ts')
        const definition = (mod as { default?: unknown }).default
        if (!isSeed(definition)) {
          throw new MasarError(`src/modules/${info.name}/seeds.ts must export default defineSeed(...)`, {
            hint: "import { defineSeed } from 'masar', then export default defineSeed(async ({ fake }) => { ... })",
          })
        }
        seeds.set(info.name, definition)
      }
      if (options.fresh) for (const model of [...models].reverse()) await db(model).deleteAll()
      // Dependencies first, so a module can link to rows its dependencies created.
      const order: string[] = []
      const visit = (name: string, trail: string[] = []) => {
        if (order.includes(name) || trail.includes(name)) return
        for (const dependency of modules.get(name)?.depends ?? []) visit(dependency, [...trail, name])
        order.push(name)
      }
      for (const name of [...seeds.keys()].sort()) visit(name)
      const fake = createFake(options.seed ?? Date.now())
      const report: { module: string; ms: number }[] = []
      for (const name of order) {
        const definition = seeds.get(name)
        if (!definition || (options.only && !options.only.includes(name))) continue
        const started = performance.now()
        await definition.run({ fake, log: (line) => say(`${name}: ${line}`) })
        report.push({ module: name, ms: Math.round(performance.now() - started) })
      }
      return report
    },
    async pendingMigrations() {
      return (await pendingMigrations(planned)).map((p) => p.id)
    },
    async migrate() {
      const ran = await runMigrations(planned, () => this.sync())
      await this.sync()
      return ran
    },
    close: closeConnections,
  }
}

export type { SyncReport } from '../db/adapters/types'
