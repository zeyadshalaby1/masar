export interface AppConfig {
  /** Shown in the browser title and shared with every page. */
  name: string
  /** Public URL of the app. */
  url?: string
  /** Port used by `masar dev` and `masar start`. */
  port?: number
  /** Show detailed error pages. Defaults to true outside production. */
  debug?: boolean
  /** Default language, used when the visitor's browser asks for none of `locales`. */
  locale?: string
  /**
   * Languages the app speaks, e.g. ['en', 'ar']. Each visitor gets their browser's language (or
   * the one they picked); direction (rtl for Arabic) follows automatically. Texts live in src/locales/<code>.json.
   */
  locales?: string[]
  /** Security headers are always on. These tune CORS and rate limiting. */
  security?: SecurityConfig
  /** Render pages on the server (better for search engines and first paint). Default true. */
  ssr?: boolean
  /** IANA timezone for schedules (at('03:00')), e.g. 'Africa/Cairo'. Defaults to the server's. */
  timezone?: string
  /** Pages the auth flow sends people to. */
  auth?: { loginPath?: string; verifyPath?: string; resetPath?: string }
}

export interface SecurityConfig {
  /** Let other origins (a Flutter web build, another site) call /api/*. Off by default: same-origin only. */
  cors?: { origins: readonly string[] | '*' }
  /** Requests per client per window. Defaults to 300 per 60s. `false` turns it off. */
  rateLimit?: { max?: number; windowSeconds?: number } | false
  /** Read the client IP from X-Forwarded-For. Turn on only behind a proxy you control. */
  trustProxy?: boolean
}

export type ResolvedAppConfig = Required<Pick<AppConfig, 'name' | 'port' | 'debug' | 'locale' | 'locales'>> &
  AppConfig & { auth: { loginPath: string; verifyPath: string; resetPath: string }; timezone: string }

export function defineApp(config: AppConfig): ResolvedAppConfig {
  return {
    port: 3000,
    debug: process.env.NODE_ENV !== 'production',
    ...config,
    locale: config.locale ?? config.locales?.[0] ?? 'en',
    locales: config.locales ?? [config.locale ?? 'en'],
    timezone: config.timezone ?? Intl.DateTimeFormat().resolvedOptions().timeZone,
    // Signed-out visitors of protected pages are sent here (when a page answers it).
    auth: { loginPath: '/login', verifyPath: '/verify-email', resetPath: '/reset-password', ...config.auth },
  }
}
