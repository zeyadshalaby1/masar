import { db, defineSchedule, sessions } from '@masar/core'

// Recurring work runs in the web process and in `masar worker`, once per slot even with several servers.
export default defineSchedule((s) => {
  s.every('day')
    .at('03:00')
    .name('expired-sessions')
    .run(() => db(sessions).where({ expiresAt: { lt: new Date().toISOString() } }).deleteAll())
})
