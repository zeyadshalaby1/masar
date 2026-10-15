import type { MasarServer } from '@masar/core/server'
import { createServer, isRunnableDevEnvironment, type ViteDevServer } from 'vite'
import { loadEnv, SERVER_ENTRY, writeEntries } from './project'
import { viteConfig } from './vite'

/** Boot the app without an HTTP server (for routes, db:sync, scripts). */
export async function loadApp(root: string): Promise<{ app: MasarServer; vite: ViteDevServer; close(): Promise<void> }> {
  loadEnv(root)
  writeEntries(root)
  const vite = await createServer({ ...viteConfig(root, { mode: 'development', noHmr: true }), logLevel: 'error' })
  const ssr = vite.environments.ssr
  if (!isRunnableDevEnvironment(ssr)) throw new Error('Vite SSR environment is not runnable')
  try {
    const app = (await ssr.runner.import(SERVER_ENTRY)).default as MasarServer
    return {
      app,
      vite,
      async close() {
        await app.close()
        await vite.close()
      },
    }
  } catch (error) {
    if (error instanceof Error) vite.ssrFixStacktrace(error)
    await vite.close()
    throw error
  }
}
