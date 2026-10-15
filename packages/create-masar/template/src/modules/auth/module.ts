import { defineModule } from '@masar/core'

// Sign in, sign up and sign out. The api flag gives mobile apps POST /api/auth/token.
export default defineModule({
  name: 'auth',
  prefix: '/',
  expose: { ui: true, api: true },
})
