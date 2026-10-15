import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import type { MasarServer } from '@zeyadshalaby1/masar/server'
import pc from 'picocolors'
import { loadApp } from '../load'
import { findRoot, loadEnv } from '../project'
import { banner, line } from '../ui'

/**
 * Runs queued jobs and schedules, without serving HTTP. Uses the production build when
 * NODE_ENV=production (run masar build first), the source otherwise.
 */
export async function worker(options: { concurrency?: number }) {
  const root = findRoot()
  loadEnv(root)
  let app: MasarServer
  let close: () => Promise<void>
  if (process.env.NODE_ENV === 'production') {
    const serverFile = join(root, 'dist/server/server.js')
    if (!existsSync(serverFile)) throw Object.assign(new Error('No production build found'), { hint: 'Run masar build first.' })
    ;(globalThis as Record<string, unknown>).__MASAR_PROD__ = { manifest: JSON.parse(readFileSync(join(root, 'dist/client/.vite/manifest.json'), 'utf8')) }
    app = (await import(pathToFileURL(serverFile).href)).default as MasarServer
    close = () => app.close()
  } else {
    const loaded = await loadApp(root)
    app = loaded.app
    close = loaded.close
  }
  banner('worker')
  const background = await app.background({ worker: true, concurrency: options.concurrency })
  if (background.driver === 'memory') {
    line('Queue', `memory ${pc.yellow('· a worker cannot see another process memory queue')} ${pc.dim('remove driver: memory from src/config/queue.ts')}`)
  } else line('Queue', `database · ${options.concurrency ?? 5} at a time · schedules on`)
  const shutdown = async () => {
    line('Queue', pc.dim('finishing running jobs…'))
    await background.stop()
    await close()
    process.exit(0)
  }
  process.on('SIGINT', shutdown)
  process.on('SIGTERM', shutdown)
}
