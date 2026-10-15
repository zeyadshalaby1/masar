import { serializePage, type RootView } from '@hono/inertia'
import type { ResolvedAppConfig } from '../config/app'
import { directionOf, localeOf, themeOf } from '../i18n'
import { metaFor, metaTags, renderPage, type SsrInput } from './ssr'

interface ManifestChunk {
  file: string
  css?: string[]
  imports?: string[]
}
type Manifest = Record<string, ManifestChunk>

/** Set by `masar dev` so HTML gets Vite's client and React refresh preamble. */
interface DevHooks {
  transformHtml(url: string, html: string): Promise<string>
  fixStacktrace?(error: Error): void
}
/** Set by `masar start` with the client build manifest. */
interface ProdHooks {
  manifest: Manifest
}

const scope = globalThis as typeof globalThis & { __MASAR_DEV__?: DevHooks; __MASAR_PROD__?: ProdHooks }

export const devHooks = () => scope.__MASAR_DEV__
export const CLIENT_ENTRY = '.masar/client.tsx'

const escapeHtml = (value: string) =>
  value.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!)

function productionTags(): { tags: string; version: string } {
  const manifest = scope.__MASAR_PROD__?.manifest
  const entry = manifest?.[CLIENT_ENTRY]
  if (!manifest || !entry) return { tags: '', version: 'missing-manifest' }
  const css = new Set<string>()
  const preload = new Set<string>()
  const visit = (key: string, seen = new Set<string>()) => {
    if (seen.has(key)) return
    seen.add(key)
    const chunk = manifest[key]
    if (!chunk) return
    chunk.css?.forEach((file) => css.add(file))
    for (const child of chunk.imports ?? []) {
      if (manifest[child]) preload.add(manifest[child].file)
      visit(child, seen)
    }
  }
  visit(CLIENT_ENTRY)
  const tags = [
    ...[...css].map((file) => `<link rel="stylesheet" href="/${file}">`),
    ...[...preload].map((file) => `<link rel="modulepreload" href="/${file}">`),
    `<script type="module" src="/${entry.file}"></script>`,
  ].join('\n    ')
  return { tags, version: entry.file }
}

// Runs before paint so "system" never flashes the wrong theme.
const THEME_SCRIPT = `<script>if(matchMedia('(prefers-color-scheme: dark)').matches)document.documentElement.classList.add('dark')</script>`

export function createRootView(
  app: ResolvedAppConfig,
  mode: 'development' | 'production',
  ssr: { input: SsrInput; enabled: boolean },
) {
  const prod = mode === 'production' ? productionTags() : null
  const version = prod?.version ?? 'dev'

  const rootView: RootView = async (page, c) => {
    // In dev the error overlay loads on its own, so it still shows when the app's code fails to load.
    const head = prod
      ? prod.tags
      : `<script type="module">import 'masar/dev-overlay'</script>\n    <script type="module" src="/${CLIENT_ENTRY}"></script>`
    const locale = localeOf(c)
    const theme = themeOf(c)
    const inertiaPage = page as unknown as { component: string; props: Record<string, unknown>; url: string }
    const rendered = ssr.enabled ? await renderPage(ssr.input, inertiaPage) : null
    const meta = metaFor(ssr.input.pages.get(inertiaPage.component), inertiaPage.props)
    const base = app.url?.replace(/\/$/, '') ?? new URL(c.req.url).origin
    const tags = metaTags(meta, meta.title ? `${meta.title} · ${app.name}` : app.name, `${base}${inertiaPage.url.split('?')[0]}`).replace(
      /<title>[^<]*<\/title>/,
      `<title>${escapeHtml(meta.title ? `${meta.title} · ${app.name}` : app.name)}</title>`,
    )
    const html = `<!doctype html>
<html lang="${escapeHtml(locale)}" dir="${directionOf(locale)}"${theme === 'dark' ? ' class="dark"' : ''}>
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    ${theme === 'system' ? THEME_SCRIPT : ''}
    ${tags}
    ${rendered?.head.join('\n    ') ?? ''}
    <link rel="icon" href="/favicon.svg" type="image/svg+xml">
    ${head}
  </head>
  <body>
    ${rendered ? rendered.body : `<script data-page="app" type="application/json">${serializePage(page)}</script>\n    <div id="app"></div>`}
  </body>
</html>`
    const dev = devHooks()
    return dev && !prod ? dev.transformHtml(new URL(c.req.url).pathname, html) : html
  }

  return { rootView, version }
}
