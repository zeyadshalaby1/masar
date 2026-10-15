import { existsSync, readFileSync } from 'node:fs'
import { join, relative } from 'node:path'
import { pathToFileURL } from 'node:url'
import { serve, type HttpBindings } from '@hono/node-server'
import { serveStatic } from '@hono/node-server/serve-static'
import type { MasarServer } from '@zeyadshalaby1/masar/server'
import { Hono } from 'hono'
import pc from 'picocolors'
import { findRoot, loadEnv } from '../project'
import { syncAndReport } from '../sync'
import { banner, line } from '../ui'

export async function start(options: { port?: number; sync?: boolean; worker?: boolean }) {
  const root = findRoot()
  process.env.NODE_ENV = 'production'
  loadEnv(root)
  if (!process.env.APP_KEY) {
    throw Object.assign(new Error('APP_KEY is not set'), {
      hint: 'Production signs sessions links and file references with it. Set APP_KEY to a long random value (openssl rand -base64 32), the same on every server.',
    })
  }
  const serverFile = join(root, 'dist/server/server.js')
  const manifestFile = join(root, 'dist/client/.vite/manifest.json')
  if (!existsSync(serverFile) || !existsSync(manifestFile)) {
    throw Object.assign(new Error('No production build found'), { hint: 'Run masar build first.' })
  }
  ;(globalThis as Record<string, unknown>).__MASAR_PROD__ = { manifest: JSON.parse(readFileSync(manifestFile, 'utf8')) }
  const app = (await import(pathToFileURL(serverFile).href)).default as MasarServer

  banner('production')
  if (options.sync) await syncAndReport(app)
  const pending = await app.pendingMigrations()
  if (pending.length > 0) {
    await app.close()
    throw Object.assign(new Error(`${pending.length} migration(s) have not run on this database: ${pending.join(', ')}`), {
      hint: 'Run masar migrate as a deploy step before masar start (it is safe to run from several servers at once).',
    })
  }

  const web = new Hono<{ Bindings: HttpBindings }>()
  web.use(
    '*',
    serveStatic({
      root: relative(process.cwd(), join(root, 'dist/client')) || '.',
      onFound: (path, c) => {
        if (path.includes('/assets/')) c.header('Cache-Control', 'public, max-age=31536000, immutable')
      },
    }),
  )
  web.all('*', (c) => app.fetch(c.req.raw, { ip: c.env.incoming.socket.remoteAddress }))

  // Jobs run here by default; with --no-worker leave them to `masar worker` processes.
  const background = await app.background({ worker: options.worker })
  line('Queue', background.worker ? `${background.driver} · jobs and schedules running` : `${background.driver} · ${pc.dim('jobs run in masar worker')}`)

  const port = options.port ?? app.app.port
  serve({ fetch: web.fetch, port }, () => line('Listening', pc.cyan(`http://localhost:${port}`)))
  const shutdown = async () => {
    await background.stop()
    await app.close()
    process.exit(0)
  }
  process.on('SIGINT', shutdown)
  process.on('SIGTERM', shutdown)
}
