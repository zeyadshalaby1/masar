import type { ReactNode } from 'react'
import { currentLocale } from '../i18n'
import { directionOf } from '../i18n/shared'

/*
 * Building blocks for mail templates. Tables and inline styles, because mail clients
 * (Gmail, Outlook) ignore most CSS. Colors follow the Masar brand: ink text on paper,
 * one orange button with ink text.
 */

const font = "-apple-system, 'Segoe UI', Roboto, Tahoma, Arial, sans-serif"

export function MailLayout({ children, preview, footer, brand }: { children: ReactNode; preview?: string; footer?: ReactNode; brand?: string }) {
  const locale = currentLocale()
  const dir = directionOf(locale)
  return (
    <html lang={locale} dir={dir}>
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
      </head>
      <body style={{ margin: 0, padding: 0, background: '#FCF9F8', fontFamily: font, color: '#100C0A' }}>
        {preview && <div style={{ display: 'none', maxHeight: 0, overflow: 'hidden' }}>{preview}</div>}
        <table role="presentation" width="100%" cellPadding={0} cellSpacing={0} style={{ background: '#FCF9F8', padding: '32px 12px' }}>
          <tbody>
            <tr>
              <td align="center">
                <table role="presentation" width="100%" cellPadding={0} cellSpacing={0} style={{ maxWidth: 560, background: '#FFFFFF', borderRadius: 14, border: '1px solid #E9E3E0' }}>
                  <tbody>
                    <tr>
                      <td style={{ padding: '28px 32px 0', direction: dir, textAlign: dir === 'rtl' ? 'right' : 'left' }}>
                        <span style={{ fontWeight: 800, fontSize: 18, letterSpacing: '-0.02em' }}>{brand ?? 'Masar'}</span>
                      </td>
                    </tr>
                    <tr>
                      <td style={{ padding: '20px 32px 32px', direction: dir, textAlign: dir === 'rtl' ? 'right' : 'left', fontSize: 16, lineHeight: 1.6 }}>{children}</td>
                    </tr>
                  </tbody>
                </table>
                {footer && <p style={{ maxWidth: 560, margin: '16px auto 0', color: '#827872', fontSize: 12, lineHeight: 1.5, direction: dir }}>{footer}</p>}
              </td>
            </tr>
          </tbody>
        </table>
      </body>
    </html>
  )
}

export function MailHeading({ children }: { children: ReactNode }) {
  return <h1 style={{ margin: '0 0 12px', fontSize: 24, lineHeight: 1.3, fontWeight: 700 }}>{children}</h1>
}

export function MailText({ children, muted }: { children: ReactNode; muted?: boolean }) {
  return <p style={{ margin: '0 0 16px', color: muted ? '#625953' : '#100C0A' }}>{children}</p>
}

/** The one call to action. Orange with ink text (white on orange fails contrast). */
export function MailButton({ href, children }: { href: string; children: ReactNode }) {
  return (
    <table role="presentation" cellPadding={0} cellSpacing={0} style={{ margin: '8px 0 20px' }}>
      <tbody>
        <tr>
          <td style={{ background: '#FF5A1F', borderRadius: 10 }}>
            <a href={href} style={{ display: 'inline-block', padding: '12px 22px', color: '#100C0A', fontWeight: 700, textDecoration: 'none', fontSize: 15 }}>
              {children}
            </a>
          </td>
        </tr>
      </tbody>
    </table>
  )
}

/** A link the reader can copy when the button does not work. */
export function MailLink({ href }: { href: string }) {
  return <p style={{ margin: '0 0 16px', fontSize: 13, wordBreak: 'break-all' }}><a href={href} style={{ color: '#B03700' }}>{href}</a></p>
}
