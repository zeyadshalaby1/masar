import { createServer as createHttpServer } from 'node:http'
import { relative } from 'node:path'
import { getRequestListener } from '@hono/node-server'
import type { MasarServer } from '@masar/core/server'
import pc from 'picocolors'
import { createServer, isRunnableDevEnvironment } from 'vite'
import { findRoot, loadEnv, SERVER_ENTRY, writeEntries, writeRoutes } from '../project'
import { collectIcons } from '../icons'
import { printLocales, syncLocales } from '../i18n'
import { reportPending, syncAndReport } from '../sync'
import { banner, line, printError } from '../ui'
import { viteConfig } from '../vite'

const escape = (s: string) => s.replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' })[c]!)

/** Shown when the app itself fails to load (syntax error, bad module.ts...). Reloads when fixed. */
function bootErrorPage(error: unknown) {
  const err = error instanceof Error ? error : new Error(String(error))
  const hint = (err as { hint?: string }).hint
  const mark = `<svg viewBox="0 0 64 64" width="28" height="28" aria-hidden="true"><rect width="64" height="64" rx="16" fill="#100C0A"/><path d="M16 41.2 V24.5 C16 15.5 25.6 14.6 28.6 23.4 L32 33.6 L35.4 23.4 C38.4 14.6 48 15.5 48 24.5 V40" fill="none" stroke="#FF5A1F" stroke-width="5.4" stroke-linecap="round" stroke-linejoin="round"/><circle cx="16" cy="46.8" r="3.9" fill="none" stroke="#FF5A1F" stroke-width="3.89"/><circle cx="48" cy="46.2" r="6.4" fill="#FF5A1F"/></svg>`
  const mono = 'ui-monospace,SFMono-Regular,Menlo,monospace'
  return new Response(
    `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Masar · the app could not start</title>
<script type="module" src="/@vite/client"></script></head>
<body style="margin:0;font-family:'Bricolage Grotesque',ui-sans-serif,system-ui,sans-serif;background:#FCF9F8;color:#100C0A">
<div style="height:4px;background:#C81E3A"></div>
<main style="max-width:760px;margin:10vh auto;padding:24px">
<div style="display:flex;align-items:center;gap:12px;margin-bottom:28px">${mark}
<span style="font:600 12px/1 ${mono};letter-spacing:.04em;text-transform:uppercase;border-radius:999px;padding:7px 11px;background:#FBE4E8;color:#C81E3A">Boot error · the app could not start</span></div>
<h1 style="font-size:clamp(24px,4vw,34px);line-height:1.2;letter-spacing:-.02em;font-weight:700;margin:0 0 18px;word-break:break-word">${escape(err.message)}</h1>
${hint ? `<p style="display:flex;gap:10px;background:#FFE9E3;color:#8A2C04;padding:12px 16px;border-radius:10px;font-size:15px;line-height:1.5;margin:0 0 18px"><b style="color:#B03700;white-space:nowrap">Next step</b><span>${escape(hint)}</span></p>` : ''}
<pre style="background:#100C0A;color:#E9E3E0;padding:16px 18px;border-radius:10px;font:12.5px/1.65 ${mono};overflow-x:auto;margin:0">${escape(err.stack ?? '')}</pre>
<p style="color:#625953;font-size:14px;margin-top:24px">Fix the file and save: this page reloads by itself.</p>
</main></body></html>`,
    { status: 500, headers: { 'content-type': 'text/html; charset=utf-8' } },
  )
}

export async function dev(options: { port?: number }) {
  const root = findRoot()
  process.env.NODE_ENV ??= 'development'
  loadEnv(root)
  writeEntries(root)

  const http = createHttpServer()
  const vite = await createServer(viteConfig(root, { mode: 'development', hmrServer: http }))
  const ssr = vite.environments.ssr
  if (!isRunnableDevEnvironment(ssr)) throw new Error('Vite SSR environment is not runnable')

  ;(globalThis as Record<string, unknown>).__MASAR_DEV__ = {
    transformHtml: (url: string, html: string) => vite.transformIndexHtml(url, html),
    fixStacktrace: (error: Error) => vite.ssrFixStacktrace(error),
  }

  const load = async () => (await ssr.runner.import(SERVER_ENTRY)).default as MasarServer

  let app: MasarServer
  try {
    app = await load()
  } catch (error) {
    if (error instanceof Error) vite.ssrFixStacktrace(error)
    printError(error)
    await vite.close()
    process.exit(1)
  }

  const port = options.port ?? app.app.port
  banner('dev')
  line('Local', pc.cyan(`http://localhost:${port}`))
  line('Modules', app.modules.map((m) => m.name).join(', ') || pc.dim('none yet: masar make:module <name>'))
  try {
    await syncAndReport(app)
    await reportPending(app)
    const { unknown } = collectIcons(root)
    if (unknown.length) console.log(`  ${pc.yellow('!')} Unknown icon names: ${unknown.join(', ')} ${pc.dim('(see https://lucide.dev/icons)')}`)
    printLocales(syncLocales(root, app.app.locales, app.app.locale, [...app.modules.map((m) => m.title), ...(app.admin?.labelKeys() ?? [])]))
  } catch (error) {
    printError(error)
  }
  writeRoutes(root, app)
  // Jobs and schedules run in the dev server too.
  try {
    const background = await app.background()
    line('Queue', `${background.driver} · jobs and schedules running`)
  } catch (error) {
    printError(error)
  }
  console.log()

  const listener = getRequestListener(async (request, env) => {
    try {
      app = await load()
    } catch (error) {
      if (error instanceof Error) vite.ssrFixStacktrace(error)
      return bootErrorPage(error)
    }
    return app.fetch(request, { ip: env.incoming.socket.remoteAddress })
  })
  http.on('request', (req, res) =>
    vite.middlewares(req, res, (error?: unknown) => {
      if (!error) return listener(req, res)
      // e.g. the browser requested a server-only file: show why instead of a 404
      res.statusCode = 500
      res.setHeader('content-type', 'text/plain; charset=utf-8')
      res.end(error instanceof Error ? error.message : String(error))
    }),
  )

  // Keep the database and .masar/routes.gen.ts in step with the code.
  let timer: NodeJS.Timeout | undefined
  const changed = new Set<string>()
  const onFileEvent = (file: string) => {
    const path = relative(root, file)
    if (!path.startsWith('src')) return
    changed.add(path)
    clearTimeout(timer)
    timer = setTimeout(async () => {
      const files = [...changed]
      changed.clear()
      try {
        app = await load()
        writeRoutes(root, app)
        if (files.some((f) => /(schema|module)\.ts$/.test(f) || f.includes('config'))) await syncAndReport(app, { quiet: true })
        if (files.some((f) => f.includes('/migrations/'))) await reportPending(app)
        if (files.some((f) => /\.(tsx?|jsx?)$/.test(f))) printLocales(syncLocales(root, app.app.locales, app.app.locale, [...app.modules.map((m) => m.title), ...(app.admin?.labelKeys() ?? [])]), { quiet: true })
      } catch (error) {
        if (error instanceof Error) vite.ssrFixStacktrace(error)
        printError(error)
      }
    }, 150)
  }
  vite.watcher.on('change', onFileEvent)
  vite.watcher.on('add', onFileEvent)
  vite.watcher.on('unlink', onFileEvent)

  http.on('error', (error: NodeJS.ErrnoException) => {
    if (error.code === 'EADDRINUSE') {
      printError(Object.assign(new Error(`Port ${port} is already in use`), { hint: `Stop the other server or run: masar dev --port ${port + 1}` }))
      process.exit(1)
    }
    throw error
  })
  http.listen(port)

  const shutdown = async () => {
    await app.close().catch(() => {})
    await vite.close()
    process.exit(0)
  }
  process.on('SIGINT', shutdown)
  process.on('SIGTERM', shutdown)
}
