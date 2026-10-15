import { defineMailer, env, type Transport } from '@masar/core'

/**
 * Outgoing mail. Without a provider in .env, mails are printed in the terminal and listed at
 * /_masar/mail during development. Set RESEND_API_KEY, or SMTP_HOST and friends, to send real mail.
 */
const transport = (): Transport => {
  if (env('RESEND_API_KEY', '')) return { driver: 'resend', apiKey: env('RESEND_API_KEY') }
  if (env('SMTP_HOST', '')) return { driver: 'smtp', host: env('SMTP_HOST'), port: env.number('SMTP_PORT', 587), user: env('SMTP_USER', ''), pass: env('SMTP_PASS', '') }
  return { driver: 'log' }
}

export default defineMailer({
  from: env('MAIL_FROM', 'Masar App <hello@example.com>'),
  transport: transport(),
})
