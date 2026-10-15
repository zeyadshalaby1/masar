import { defineApp, env } from 'masar'

export default defineApp({
  name: env('APP_NAME', 'Masar App'),
  url: env('APP_URL', 'http://localhost:3000'),
  port: env.number('PORT', 3000),
  // Each visitor gets their browser's language; Arabic switches the page to right-to-left.
  // Texts live in src/locales/<code>.json, filled in by masar dev from every t('...').
  locales: ['en', 'ar'],
})
