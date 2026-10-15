/** Locale helpers shared by the server and the browser (no Node imports). */

const RTL = new Set(['ar', 'fa', 'he', 'ur', 'ps', 'sd', 'ug', 'yi', 'ckb', 'dv'])

export type Direction = 'ltr' | 'rtl'

export function directionOf(locale: string): Direction {
  return RTL.has(locale.split('-')[0]!.toLowerCase()) ? 'rtl' : 'ltr'
}

/** The language's own name: "العربية", "English", "Français". */
export function nativeName(locale: string): string {
  try {
    const name = new Intl.DisplayNames([locale], { type: 'language' }).of(locale)
    return name ? name.charAt(0).toLocaleUpperCase(locale) + name.slice(1) : locale
  } catch {
    return locale
  }
}

export type Messages = Record<string, string>
export type Params = Record<string, string | number>

/** Look a key up and fill {placeholders}. Missing or empty translations fall back to the key itself. */
export function translate(messages: Messages, key: string, params?: Params): string {
  const text = messages[key] || key
  return params ? text.replace(/\{(\w+)\}/g, (match, name: string) => (name in params ? String(params[name]) : match)) : text
}

export const LOCALE_COOKIE = 'masar_locale'
export const THEME_COOKIE = 'masar_theme'
export type Theme = 'light' | 'dark' | 'system'
