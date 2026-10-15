import { router, usePage } from '@inertiajs/react'
import { useCallback, useEffect, useState } from 'react'
import { LOCALE_COOKIE, THEME_COOKIE, translate, type Direction, type Messages, type Params, type Theme } from '../i18n/shared'

export interface I18nShared {
  locale: string
  dir: Direction
  locales: { code: string; name: string; dir: Direction }[]
  messages: Messages
  theme: Theme
}

const YEAR = 60 * 60 * 24 * 365
const setCookie = (name: string, value: string) => {
  document.cookie = `${name}=${encodeURIComponent(value)}; path=/; max-age=${YEAR}; samesite=lax`
}

function useI18n(): I18nShared {
  return (usePage().props as unknown as { masar: { i18n: I18nShared } }).masar.i18n
}

/** Apply lang, dir and the theme class to <html>. Called on every page load and switch. */
export function applyDocument(i18n: Pick<I18nShared, 'locale' | 'dir' | 'theme'>) {
  const root = document.documentElement
  root.lang = i18n.locale
  root.dir = i18n.dir
  const dark = i18n.theme === 'dark' || (i18n.theme === 'system' && matchMedia('(prefers-color-scheme: dark)').matches)
  root.classList.toggle('dark', dark)
}

/**
 * Translate in components. Keys are the text in your source language:
 *   const t = useT()
 *   <h1>{t('Welcome back, {name}', { name: user.name })}</h1>
 * `masar dev` collects every t('...') into src/locales/<code>.json for you to translate.
 */
export function useT() {
  const { messages } = useI18n()
  return useCallback((key: string, params?: Params) => translate(messages, key, params), [messages])
}

/** The active language and a switcher. setLocale reloads the page's props in the new language. */
export function useLocale() {
  const { locale, dir, locales } = useI18n()
  const setLocale = useCallback((code: string) => {
    setCookie(LOCALE_COOKIE, code)
    router.reload()
  }, [])
  return { locale, dir, locales, setLocale }
}

/** 'light' | 'dark' | 'system'. `resolved` is what is on screen right now. */
export function useTheme() {
  const shared = useI18n()
  const [theme, setThemeState] = useState<Theme>(shared.theme)
  const [systemDark, setSystemDark] = useState(() => typeof window !== 'undefined' && matchMedia('(prefers-color-scheme: dark)').matches)

  useEffect(() => {
    const media = matchMedia('(prefers-color-scheme: dark)')
    const onChange = () => setSystemDark(media.matches)
    media.addEventListener('change', onChange)
    return () => media.removeEventListener('change', onChange)
  }, [])

  useEffect(() => {
    applyDocument({ locale: shared.locale, dir: shared.dir, theme })
  }, [theme, systemDark, shared.locale, shared.dir])

  const setTheme = useCallback((next: Theme) => {
    setCookie(THEME_COOKIE, next)
    setThemeState(next)
  }, [])

  return { theme, resolved: (theme === 'system' ? (systemDark ? 'dark' : 'light') : theme) as 'light' | 'dark', setTheme }
}
