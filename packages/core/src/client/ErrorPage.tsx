interface ErrorProps {
  status: number
  message: string
  hint: string | null
  stack: string | null
}

const titles: Record<number, string> = {
  401: 'Sign in required',
  403: 'Forbidden',
  404: 'Not found',
  419: 'Page expired',
  422: 'Invalid data',
  429: 'Too many requests',
  500: 'Server error',
  503: 'Unavailable',
}

/** The Masar mark (brand/mark.svg): one road from an open start to a filled arrival. */
export function MasarMark({ size = 28 }: { size?: number }) {
  return (
    <svg viewBox="0 0 64 64" width={size} height={size} aria-hidden>
      <rect width="64" height="64" rx="16" fill="#100C0A" />
      <path d="M16 41.2 V24.5 C16 15.5 25.6 14.6 28.6 23.4 L32 33.6 L35.4 23.4 C38.4 14.6 48 15.5 48 24.5 V40" fill="none" stroke="#FF5A1F" strokeWidth="5.4" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx="16" cy="46.8" r="3.9" fill="none" stroke="#FF5A1F" strokeWidth="3.89" />
      <circle cx="48" cy="46.2" r="6.4" fill="#FF5A1F" />
    </svg>
  )
}

const mono = 'ui-monospace, SFMono-Regular, Menlo, monospace'

/**
 * Built-in error page (server errors, 404s, boot errors share this look). Inline styles, so it
 * works even when the app's CSS is broken. The hint and stack only reach the page in debug mode.
 */
export default function ErrorPage({ status, message, hint, stack }: ErrorProps) {
  const danger = status >= 500
  return (
    <main
      dir="ltr"
      style={{
        minHeight: '100vh',
        display: 'grid',
        placeItems: 'center',
        padding: 24,
        fontFamily: '"Bricolage Grotesque", ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif',
        background: '#FCF9F8',
        color: '#100C0A',
      }}
    >
      <div style={{ width: '100%', maxWidth: 760 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 28 }}>
          <MasarMark />
          <span
            style={{
              font: `600 12px/1 ${mono}`,
              letterSpacing: '.04em',
              textTransform: 'uppercase',
              borderRadius: 999,
              padding: '7px 11px',
              background: danger ? '#FBE4E8' : '#F2ECE9',
              color: danger ? '#C81E3A' : '#625953',
            }}
          >
            {status} · {titles[status] ?? 'Error'}
          </span>
        </div>
        <h1 style={{ fontSize: 'clamp(26px, 4vw, 36px)', lineHeight: 1.2, letterSpacing: '-.02em', margin: '0 0 18px', fontWeight: 700, wordBreak: 'break-word' }}>{message}</h1>
        {hint && (
          <p
            style={{
              display: 'flex',
              gap: 10,
              margin: '0 0 18px',
              padding: '12px 16px',
              borderRadius: 10,
              background: '#FFE9E3',
              color: '#8A2C04',
              fontSize: 15,
              lineHeight: 1.5,
            }}
          >
            <b style={{ color: '#B03700', whiteSpace: 'nowrap' }}>Next step</b>
            <span>{hint}</span>
          </p>
        )}
        {stack && (
          <pre
            style={{
              margin: 0,
              padding: '16px 18px',
              borderRadius: 10,
              background: '#100C0A',
              color: '#E9E3E0',
              font: `12.5px/1.65 ${mono}`,
              overflowX: 'auto',
              direction: 'ltr',
              textAlign: 'left',
              maxHeight: 360,
            }}
          >
            {stack}
          </pre>
        )}
        <p style={{ marginTop: 28, display: 'flex', gap: 20, fontSize: 14 }}>
          <a href="/" style={{ color: '#B03700', fontWeight: 600 }}>
            ← Back home
          </a>
          {danger && (
            <a href="" onClick={() => location.reload()} style={{ color: '#625953' }}>
              Try again
            </a>
          )}
        </p>
      </div>
    </main>
  )
}
