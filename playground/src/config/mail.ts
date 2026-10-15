import { defineMailer, env } from '@masar/core'

/**
 * Outgoing mail. Without SMTP settings mails are printed in the terminal and listed at
 * /_masar/mail during development. Fill SMTP_* in .env to send real mail, or use
 * { driver: 'resend', apiKey } / { driver: 'postmark', token }.
 */
export default defineMailer({
  from: env('MAIL_FROM', 'Masar App <hello@example.com>'),
  transport: env('SMTP_HOST', '')
    ? { driver: 'smtp', host: env('SMTP_HOST'), port: env.number('SMTP_PORT', 587), user: env('SMTP_USER', ''), pass: env('SMTP_PASS', '') }
    : { driver: 'log' },
})
