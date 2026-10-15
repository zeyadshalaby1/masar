import { randomUUID } from 'node:crypto'
import { connect as netConnect, type Socket } from 'node:net'
import { connect as tlsConnect, type TLSSocket } from 'node:tls'
import { MasarError } from '../errors'

export interface SmtpOptions {
  host: string
  /** 465 (TLS from the start) or 587/25 (STARTTLS when offered). */
  port: number
  user?: string
  pass?: string
  /** Defaults to true on port 465. */
  secure?: boolean
}

export interface Message {
  from: string
  to: string[]
  replyTo?: string
  subject: string
  html: string
  text: string
}

/** RFC 2047 for non-ASCII headers (Arabic subjects and names). */
const encodeHeader = (value: string) => (/^[\x20-\x7e]*$/.test(value) ? value : `=?UTF-8?B?${Buffer.from(value).toString('base64')}?=`)
const encodeAddress = (value: string) => {
  const match = value.match(/^\s*(.*?)\s*<([^>]+)>\s*$/)
  return match && match[1] ? `${encodeHeader(match[1].replace(/^"|"$/g, ''))} <${match[2]}>` : value
}
const addressOnly = (value: string) => value.match(/<([^>]+)>/)?.[1] ?? value.trim()
const base64Lines = (text: string) => Buffer.from(text).toString('base64').replace(/.{76}/g, '$&\r\n')

/** A multipart/alternative MIME message (text + HTML), UTF-8, base64 bodies. */
export function buildMime(message: Message, domain: string): string {
  const boundary = `masar-${randomUUID()}`
  return [
    `From: ${encodeAddress(message.from)}`,
    `To: ${message.to.map(encodeAddress).join(', ')}`,
    ...(message.replyTo ? [`Reply-To: ${encodeAddress(message.replyTo)}`] : []),
    `Subject: ${encodeHeader(message.subject)}`,
    `Date: ${new Date().toUTCString()}`,
    `Message-ID: <${randomUUID()}@${domain}>`,
    'MIME-Version: 1.0',
    `Content-Type: multipart/alternative; boundary="${boundary}"`,
    '',
    `--${boundary}`,
    'Content-Type: text/plain; charset=utf-8',
    'Content-Transfer-Encoding: base64',
    '',
    base64Lines(message.text),
    `--${boundary}`,
    'Content-Type: text/html; charset=utf-8',
    'Content-Transfer-Encoding: base64',
    '',
    base64Lines(message.html),
    `--${boundary}--`,
    '',
  ].join('\r\n')
}

/** Reads SMTP replies (multi-line aware) from a socket. */
function replies(socket: Socket | TLSSocket) {
  let buffer = ''
  const waiting: ((reply: { code: number; text: string }) => void)[] = []
  const queue: { code: number; text: string }[] = []
  const onData = (chunk: Buffer) => {
    buffer += chunk.toString('utf8')
    let match: RegExpMatchArray | null
    // A reply ends with a line "NNN text" (space after the code).
    while ((match = buffer.match(/^((?:\d{3}-[^\r\n]*\r\n)*)(\d{3}) ([^\r\n]*)\r\n/))) {
      buffer = buffer.slice(match[0].length)
      const reply = { code: Number(match[2]), text: (match[1] + match[3]).trim() }
      const next = waiting.shift()
      if (next) next(reply)
      else queue.push(reply)
    }
  }
  socket.on('data', onData)
  return {
    next: () => new Promise<{ code: number; text: string }>((resolve) => (queue.length ? resolve(queue.shift()!) : waiting.push(resolve))),
    detach: () => socket.off('data', onData),
  }
}

export async function sendSmtp(options: SmtpOptions, message: Message): Promise<void> {
  const secure = options.secure ?? options.port === 465
  const timeout = 30_000
  let socket: Socket | TLSSocket = await new Promise<Socket | TLSSocket>((resolve, reject) => {
    const s = secure ? tlsConnect({ host: options.host, port: options.port, servername: options.host }, () => resolve(s)) : netConnect({ host: options.host, port: options.port }, () => resolve(s))
    s.setTimeout(timeout, () => s.destroy(new Error('SMTP connection timed out')))
    s.once('error', reject)
  }).catch((cause) => {
    throw new MasarError(`Cannot reach the SMTP server ${options.host}:${options.port}`, { hint: 'Check host and port in src/config/mail.ts (465 = TLS, 587 = STARTTLS).', cause })
  })
  let reader = replies(socket)

  const expect = async (codes: number[], step: string) => {
    const reply = await reader.next()
    if (!codes.includes(reply.code)) {
      socket.destroy()
      const auth = step === 'AUTH' || reply.code === 535
      throw new MasarError(`SMTP ${step} failed: ${reply.code} ${reply.text}`, {
        hint: auth ? 'Check the SMTP user and password (many providers need an app password).' : 'The mail server refused the message; its reply above says why.',
      })
    }
    return reply
  }
  const send = (line: string) => socket.write(`${line}\r\n`)
  const domain = addressOnly(message.from).split('@')[1] ?? 'localhost'

  await expect([220], 'greeting')
  send(`EHLO ${domain}`)
  let ehlo = await expect([250], 'EHLO')
  if (!secure && /STARTTLS/i.test(ehlo.text)) {
    send('STARTTLS')
    await expect([220], 'STARTTLS')
    reader.detach()
    socket = await new Promise<TLSSocket>((resolve, reject) => {
      const s = tlsConnect({ socket: socket as Socket, servername: options.host }, () => resolve(s))
      s.once('error', reject)
    })
    reader = replies(socket)
    send(`EHLO ${domain}`)
    ehlo = await expect([250], 'EHLO')
  }
  if (options.user) {
    send(`AUTH PLAIN ${Buffer.from(`\u0000${options.user}\u0000${options.pass ?? ''}`).toString('base64')}`)
    await expect([235], 'AUTH')
  }
  send(`MAIL FROM:<${addressOnly(message.from)}>`)
  await expect([250], 'MAIL FROM')
  for (const to of message.to) {
    send(`RCPT TO:<${addressOnly(to)}>`)
    await expect([250, 251], 'RCPT TO')
  }
  send('DATA')
  await expect([354], 'DATA')
  // Dot-stuffing: a line starting with "." gets another one.
  socket.write(`${buildMime(message, domain).replace(/\r\n\./g, '\r\n..')}\r\n.\r\n`)
  await expect([250], 'message')
  send('QUIT')
  socket.end()
}
