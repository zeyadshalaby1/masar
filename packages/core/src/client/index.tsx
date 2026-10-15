import { createInertiaApp, router, type ResolvedComponent } from '@inertiajs/react'
import { applyDocument, type I18nShared } from '../react/i18n'
import type { ComponentType, ReactNode } from 'react'
import { createRoot, hydrateRoot } from 'react-dom/client'
import { translate } from '../i18n/shared'
import type { PageModule } from '../pages/types'
import ErrorPage from './ErrorPage'

type Loader = () => Promise<unknown>

export interface ClientOptions {
  /** import.meta.glob('../src/modules/*\/views/pages/**\/*.tsx') */
  pages: Record<string, Loader>
  /** import.meta.glob('../src/shared/layouts/AppLayout.tsx', { eager: true }) */
  layouts?: Record<string, unknown>
  /** import.meta.glob('../src/modules/*\/views/layout.tsx'): a module's own layout replaces AppLayout for its pages. Lazy, so e.g. the admin UI is only downloaded by admin pages. */
  moduleLayouts?: Record<string, unknown>
}

const PAGE = /\/modules\/([^/]+)\/views\/pages\/(.+)\.tsx$/

export function createMasarClient({ pages, layouts = {}, moduleLayouts = {} }: ClientOptions) {
  const registry = new Map<string, Loader>()
  for (const [path, load] of Object.entries(pages)) {
    const match = path.match(PAGE)
    if (match) registry.set(`${match[1]}/${match[2]}`, load)
  }
  type LayoutComponent = ComponentType<{ children: ReactNode }>
  const Layout = (Object.values(layouts)[0] as { default?: LayoutComponent } | undefined)?.default
  const layoutLoaders = new Map<string, Loader>()
  for (const [path, load] of Object.entries(moduleLayouts)) {
    const name = path.match(/\/modules\/([^/]+)\/views\/layout\.tsx$/)?.[1]
    if (name && typeof load === 'function') layoutLoaders.set(name, load as Loader)
  }
  // Filled by resolve() before the page renders, read synchronously by layout().
  const byModule = new Map<string, LayoutComponent | undefined>()

  // Keep <html lang/dir/class> and the title in step with the page, e.g. after switching language.
  const metas = new Map<string, PageModule['meta']>()
  router.on('navigate', (event) => {
    const page = event.detail.page
    const props = page.props as { masar?: { i18n?: I18nShared; app?: { name: string } } }
    if (props.masar?.i18n) applyDocument(props.masar.i18n)
    const meta = metas.get(page.component)
    const messages = props.masar?.i18n?.messages ?? {}
    const resolved = typeof meta === 'function' ? meta(page.props, (key, params) => translate(messages, key, params)) : meta
    const app = props.masar?.app?.name ?? ''
    document.title = resolved?.title ? `${resolved.title} · ${app}` : app
  })

  return createInertiaApp({
    progress: { color: '#FF5A1F' },
    resolve: async (name) => {
      if (name === '__masar/Error') return ErrorPage as unknown as ResolvedComponent
      const load = registry.get(name)
      if (!load) throw new Error(`[masar] No page "${name}". Expected src/modules/${name.replace('/', '/views/pages/')}.tsx`)
      const module = name.split('/')[0]!
      const layoutLoader = layoutLoaders.get(module)
      const [mod, layout] = await Promise.all([load(), layoutLoader && !byModule.has(module) ? layoutLoader() : undefined])
      if (layout) byModule.set(module, (layout as { default?: LayoutComponent }).default)
      metas.set(name, (mod as PageModule).meta)
      return (mod as { default: ResolvedComponent }).default
    },
    layout: (name) => (name.startsWith('__masar/') ? undefined : byModule.has(name.split('/')[0]!) ? byModule.get(name.split('/')[0]!) : Layout),
    setup({ el, App, props }) {
      // Server-rendered pages are hydrated; the rest (ssr = false, private modules) render here.
      if (el.hasAttribute('data-server-rendered')) hydrateRoot(el, <App {...props} />)
      else createRoot(el).render(<App {...props} />)
    },
  })
}
