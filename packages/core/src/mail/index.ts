import { randomUUID } from 'node:crypto'
import type { ReactElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { MasarError } from '../errors'
import { defineJob, type DispatchOptions } from '../jobs'
import { log } from '../logger'
import { sendSmtp, type Message, type SmtpOptions } from './smtp'

export type Transport =
  | { driver: 'log' }
  | ({ driver: 'smtp' } & SmtpOptions)
  | { driver: 'resend'; apiKey: string }
  | { driver: 'postmark'; token: string }

export interface MailerConfig {
  /** Default sender: 'Masar <hello@masar.dev>' */
  from: string
  /** 'log' (the default) prints mails in the terminal and keeps them at /_masar/mail in development. */
  transport: Transport
}

/**
 * src/config/mail.ts:
 *
 *   export default defineMailer({
 *     from: env('MAIL_FROM', 'My App <hello@example.com>'),
 *     transport: env('SMTP_HOST', '') ? { driver: 'smtp', host: env('SMTP_HOST'), port: env.number('SMTP_PORT', 587), user: env('SMTP_USER'), pass: env('SMTP_PASS') } : { driver: 'log' },
 *   })
 */
export function defineMailer(config: MailerConfig): MailerConfig {
  return config
}

interface MailState {
  config: MailerConfig
  appUrl: string
  /** Recent mails of the log transport, newest first. */
  outbox: (Message & { id: string; sentAt: string })[]
}
const scope = globalThis as typeof globalThis & { __masarMail?: MailState }
const state = (): MailState => (scope.__masarMail ??= { config: { from: 'Masar <hello@localhost>', transport: { driver: 'log' } }, appUrl: 'http://localhost:3000', outbox: [] })

export function configureMail(config: MailerConfig | undefined, appUrl: string) {
  const s = state()
  if (config) s.config = config
  s.appUrl = appUrl.replace(/\/$/, '')
}

export const outbox = () => state().outbox

/** HTML → readable plain text, for the text part of every mail. */
export function htmlToText(html: string): string {
  return html
    .replace(/<(style|head|script)[\s\S]*?<\/\1>/gi, '')
    .replace(/<a\s[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi, (_, href: string, text: string) => `${text.replace(/<[^>]+>/g, '').trim()} (${href})`)
    .replace(/<(br|\/p|\/h[1-6]|\/tr|\/li|\/div)[^>]*>/gi, '\n')
    .replace(/<li[^>]*>/gi, '• ')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#x27;|&#39;/g, "'")
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

async function deliver(message: Message): Promise<void> {
  const { config, appUrl } = state()
  const t = config.transport
  switch (t.driver) {
    case 'log': {
      const id = randomUUID().slice(0, 8)
      const s = state()
      s.outbox.unshift({ ...message, id, sentAt: new Date().toISOString() })
      s.outbox.length = Math.min(s.outbox.length, 50)
      log.info('mail', `to ${message.to.join(', ')} · "${message.subject}" · ${appUrl}/_masar/mail/${id}`)
      return
    }
    case 'smtp':
      return sendSmtp(t, message)
    case 'resend': {
      const response = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: { authorization: `Bearer ${t.apiKey}`, 'content-type': 'application/json' },
        body: JSON.stringify({ from: message.from, to: message.to, subject: message.subject, html: message.html, text: message.text, reply_to: message.replyTo }),
      })
      if (!response.ok) throw new MasarError(`Resend refused the mail: ${response.status} ${await response.text()}`, { hint: 'Check the API key and that the from domain is verified in Resend.' })
      return
    }
    case 'postmark': {
      const response = await fetch('https://api.postmarkapp.com/email', {
        method: 'POST',
        headers: { 'x-postmark-server-token': t.token, 'content-type': 'application/json', accept: 'application/json' },
        body: JSON.stringify({ From: message.from, To: message.to.join(','), Subject: message.subject, HtmlBody: message.html, TextBody: message.text, ReplyTo: message.replyTo }),
      })
      if (!response.ok) throw new MasarError(`Postmark refused the mail: ${response.status} ${await response.text()}`, { hint: 'Check the server token and the sender signature in Postmark.' })
    }
  }
}

/** The built-in job every mail goes through, so a mail server hiccup is retried instead of lost. */
export const mailJob = defineJob<Message>({ name: 'masar.mail', retries: 4, backoff: 5000, run: deliver })

export interface OutgoingMail {
  to: string | string[]
  subject: string
  html: string
  /** Generated from the HTML when left out. */
  text?: string
  from?: string
  replyTo?: string
}

const normalize = (m: OutgoingMail): Message => ({
  from: m.from ?? state().config.from,
  to: Array.isArray(m.to) ? m.to : [m.to],
  replyTo: m.replyTo,
  subject: m.subject,
  html: m.html,
  text: m.text ?? htmlToText(m.html),
})

export const mail = {
  /** Queue a mail (sent by the job queue, with retries). */
  send: (message: OutgoingMail, options?: DispatchOptions) => mailJob.dispatch(normalize(message), options),
  /** Send right now and wait (for scripts and tests). */
  sendNow: (message: OutgoingMail) => deliver(normalize(message)),
  /** The app URL, for links in mails. */
  url: (path = '/') => `${state().appUrl}${path.startsWith('/') ? path : `/${path}`}`,
}

export interface MailTemplate<P> {
  /** Subject, HTML and text for these props (renders in the current request's language). */
  render(props: P): { subject: string; html: string; text: string }
  /** Render now and queue it. */
  send(options: { to: string | string[]; props: P; replyTo?: string; from?: string; delay?: DispatchOptions['delay'] }): Promise<void>
}

/**
 * A mail template, in src/modules/<module>/mail/<name>.tsx:
 *
 *   export const welcome = defineMail<{ name: string }>({
 *     subject: ({ name }) => t('Welcome, {name}', { name }),
 *     render: ({ name }) => (
 *       <MailLayout preview={t('Your account is ready')}>
 *         <MailHeading>{t('Welcome, {name}', { name })}</MailHeading>
 *         <MailButton href={mail.url('/courses')}>{t('Start learning')}</MailButton>
 *       </MailLayout>
 *     ),
 *   })
 *   await welcome.send({ to: user.email, props: { name: user.name } })
 */
export function defineMail<P>(definition: { subject: (props: P) => string; render: (props: P) => ReactElement; text?: (props: P) => string }): MailTemplate<P> {
  const render = (props: P) => {
    const html = `<!doctype html>${renderToStaticMarkup(definition.render(props))}`
    return { subject: definition.subject(props), html, text: definition.text?.(props) ?? htmlToText(html) }
  }
  return {
    render,
    send: ({ to, props, replyTo, from, delay }) => {
      const rendered = render(props)
      return mail.send({ to, replyTo, from, ...rendered }, { delay })
    },
  }
}
