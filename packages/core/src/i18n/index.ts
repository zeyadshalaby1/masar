import type { Context } from 'hono'
import { getCookie } from 'hono/cookie'
import { currentRequest } from '../http/context'
import { directionOf, LOCALE_COOKIE, nativeName, translate, THEME_COOKIE, type Messages, type Params, type Theme } from './shared'

interface I18nState {
  locales: string[]
  fallback: string
  messages: Map<string, Messages>
}

const scope = globalThis as typeof globalThis & { __masarI18n?: I18nState }
const state = (): I18nState => (scope.__masarI18n ??= { locales: ['en'], fallback: 'en', messages: new Map() })

export function configureI18n(locales: string[], fallback: string, files: Record<string, unknown>) {
  const messages = new Map<string, Messages>()
  for (const [path, mod] of Object.entries(files)) {
    const code = path.split('/').pop()!.replace(/\.json$/, '')
    messages.set(code, ((mod as { default?: Messages }).default ?? mod) as Messages)
  }
  scope.__masarI18n = { locales, fallback, messages }
}

/** Cookie (the user's choice), then the browser's Accept-Language, then the app default. */
export function localeOf(c: Context): string {
  const { locales, fallback } = state()
  const chosen = getCookie(c, LOCALE_COOKIE)
  if (chosen && locales.includes(chosen)) return chosen
  const accepted = (c.req.header('accept-language') ?? '')
    .split(',')
    .map((part) => {
      const [tag, q] = part.trim().split(';q=')
      return { tag: tag!.toLowerCase(), q: q ? Number(q) : 1 }
    })
    .sort((a, b) => b.q - a.q)
  for (const { tag } of accepted) {
    const match = locales.find((l) => l.toLowerCase() === tag) ?? locales.find((l) => l.toLowerCase() === tag.split('-')[0])
    if (match) return match
  }
  return fallback
}

export function themeOf(c: Context): Theme {
  const theme = getCookie(c, THEME_COOKIE)
  return theme === 'light' || theme === 'dark' ? theme : 'system'
}

/** Everything pages need, shared as masar.i18n. */
export function i18nProps(c: Context) {
  const { locales, messages } = state()
  const locale = localeOf(c)
  return {
    locale,
    dir: directionOf(locale),
    locales: locales.map((code) => ({ code, name: nativeName(code), dir: directionOf(code) })),
    messages: messages.get(locale) ?? {},
    theme: themeOf(c),
  }
}

/** Messages of a locale (app files), for code that needs them in bulk. */
export function messagesFor(locale: string): Messages {
  return state().messages.get(locale) ?? {}
}

/** The current request's locale (the app default outside a request). */
export function currentLocale(): string {
  const request = currentRequest()
  return request ? localeOf(request.c) : state().fallback
}

/**
 * Translate on the server (actions, loaders, validation messages):
 *   throw new MasarError(t('Course is full'))
 * Keys are the source text; `masar dev` adds every t('...') it finds to src/locales/*.json.
 */
export function t(key: string, params?: Params): string {
  return translate(state().messages.get(currentLocale()) ?? {}, key, params)
}

export { directionOf, nativeName, type Theme } from './shared'
