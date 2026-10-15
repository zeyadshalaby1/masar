import { defineModule } from '@masar/core'

// Content only: managed in /admin, read by other modules' pages.
export default defineModule({ name: 'banners', expose: { ui: false } })
