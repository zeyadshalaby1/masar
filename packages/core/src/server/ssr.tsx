import { createInertiaApp } from '@inertiajs/react'
import { createElement, type ComponentType, type ReactNode } from 'react'
import { renderToString } from 'react-dom/server'
import ErrorPage from '../client/ErrorPage'
import { t } from '../i18n'
import { log } from '../logger'
import type { PageMeta, PageModule } from '../pages/types'

type Layout = ComponentType<{ children: ReactNode }>
type InertiaPage = { component: string; props: Record<string, unknown>; url: string }

export interface SsrInput {
  pages: Map<string, PageModule>
  appLayout?: Layout
  /** Lazy module layouts (views/layout.tsx), keyed by module name. */
  moduleLayouts: Map<string, () => Promise<unknown>>
  /** Modules whose pages skip SSR (private pages: admin, anything behind a module authorize). */
  skip: (module: string) => boolean
}

const escapeHtml = (value: string) => value.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!)

/** `export const meta` of a page: an object, or a function of the page's props. */
export function metaFor(module: PageModule | undefined, props: Record<string, unknown>): PageMeta {
  const meta = module?.meta
  if (!meta) return {}
  try {
    return typeof meta === 'function' ? (meta(props as never, t) ?? {}) : meta
  } catch (error) {
    log.warn('ssr', `meta() failed: ${error instanceof Error ? error.message : String(error)}`)
    return {}
  }
}

/** <title>, description, Open Graph, Twitter and canonical tags. */
export function metaTags(meta: PageMeta, fallbackTitle: string, url: string | null): string {
  const title = meta.title ? `${meta.title}` : fallbackTitle
  const tags = [`<title>${escapeHtml(title)}</title>`, `<meta property="og:title" content="${escapeHtml(title)}">`]
  if (meta.description) {
    tags.push(`<meta name="description" content="${escapeHtml(meta.description)}">`, `<meta property="og:description" content="${escapeHtml(meta.description)}">`)
  }
  if (meta.image) tags.push(`<meta property="og:image" content="${escapeHtml(meta.image)}">`, '<meta name="twitter:card" content="summary_large_image">')
  if (url) tags.push(`<link rel="canonical" href="${escapeHtml(meta.canonical ?? url)}">`, `<meta property="og:url" content="${escapeHtml(meta.canonical ?? url)}">`)
  if (meta.noindex) tags.push('<meta name="robots" content="noindex">')
  return tags.join('\n    ')
}

const warned = new Set<string>()

/**
 * Render the page on the server so search engines and first paint get real HTML; the browser
 * then hydrates it. Returns null to fall back to client rendering (SSR off, or the render failed).
 */
export async function renderPage(input: SsrInput, page: InertiaPage): Promise<{ head: string[]; body: string } | null> {
  const name = page.component
  const module = name.split('/')[0]!
  const pageModule = input.pages.get(name)
  if (!name.startsWith('__masar/') && (!pageModule || pageModule.ssr === false || input.skip(module))) return null

  let layout: Layout | undefined = input.appLayout
  const lazy = input.moduleLayouts.get(module)
  if (lazy) layout = ((await lazy()) as { default?: Layout }).default
  try {
    return await createInertiaApp({
      page: page as never,
      render: renderToString,
      resolve: (component: string) => (component === '__masar/Error' ? ErrorPage : input.pages.get(component)?.default) as never,
      layout: (component: string) => (component.startsWith('__masar/') ? undefined : layout) as never,
      setup: ({ App, props }) => createElement(App, props),
    })
  } catch (error) {
    // Most often a component reads window/localStorage/document while rendering.
    if (!warned.has(name)) {
      warned.add(name)
      log.warn(
        'ssr',
        `${name} could not render on the server, so it renders in the browser: ${error instanceof Error ? error.message : String(error)}\n` +
          '  → Move window/document/localStorage reads into useEffect, or add `export const ssr = false` to the page.',
      )
    }
    return null
  }
}
